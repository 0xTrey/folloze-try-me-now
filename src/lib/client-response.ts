export const MAX_PDF_BYTES = 10 * 1024 * 1024;

export const PDF_UPLOAD_REJECTED_MESSAGE =
  "That upload was rejected before it could be processed. Choose a valid PDF under 10 MB and try again.";

type ErrorBody = {
  error?: unknown;
  code?: unknown;
  requestId?: unknown;
};

export class ApiResponseError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId?: string;

  constructor(message: string, options: { status: number; code?: string; requestId?: string }) {
    super(message);
    this.name = "ApiResponseError";
    this.status = options.status;
    this.code = options.code ?? "request_failed";
    this.requestId = options.requestId;
  }
}

function errorBody(value: unknown): ErrorBody {
  return value && typeof value === "object" ? (value as ErrorBody) : {};
}

export async function readJsonResponse<T>(
  response: Response,
  fallbackMessage = "Something went wrong."
): Promise<T> {
  const text = await response.text();
  let parsed: unknown;
  let parseFailed = false;

  if (text) {
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      parseFailed = true;
    }
  }

  const body = errorBody(parsed);
  const requestId =
    (typeof body.requestId === "string" && body.requestId) ||
    response.headers.get("x-request-id") ||
    undefined;

  if (!response.ok) {
    const message =
      response.status === 413
        ? PDF_UPLOAD_REJECTED_MESSAGE
        : typeof body.error === "string" && body.error.trim()
          ? body.error
          : fallbackMessage;
    throw new ApiResponseError(message, {
      status: response.status,
      code: typeof body.code === "string" ? body.code : `http_${response.status}`,
      requestId
    });
  }

  if (parseFailed || parsed === undefined) {
    throw new ApiResponseError("The server returned an unreadable response. Please try again.", {
      status: response.status,
      code: "invalid_server_response",
      requestId
    });
  }

  return parsed as T;
}

export async function validatePdfFile(file: File): Promise<void> {
  if (!file.name.toLowerCase().endsWith(".pdf")) {
    throw new Error("V1 accepts PDF files only.");
  }
  if (file.type && file.type.toLowerCase() !== "application/pdf") {
    throw new Error("V1 accepts PDF files only.");
  }
  if (file.size > MAX_PDF_BYTES) {
    throw new Error("That PDF is larger than the 10 MB V1 limit.");
  }
  const signature = await file.slice(0, 5).text();
  if (signature !== "%PDF-") {
    throw new Error("That file is not a valid PDF.");
  }
}

export function friendlyUploadError(error: unknown): string {
  if (error instanceof ApiResponseError && error.status === 413) {
    return PDF_UPLOAD_REJECTED_MESSAGE;
  }
  if (
    error instanceof Error &&
    [
      "V1 accepts PDF files only.",
      "That PDF is larger than the 10 MB V1 limit.",
      "That file is not a valid PDF."
    ].includes(error.message)
  ) {
    return error.message;
  }
  if (error instanceof Error && error.name === "AbortError") {
    return "The PDF upload was canceled. Try again when you are ready.";
  }
  if (error instanceof ApiResponseError && error.code === "upload_processing_timeout") {
    return error.message;
  }
  return "We could not upload that PDF. Try again or choose another file.";
}

export function uploadErrorCode(error: unknown): string {
  if (error instanceof ApiResponseError) return error.code;
  if (!(error instanceof Error)) return "unknown_upload_error";
  return error.name
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .replace(/[^a-z0-9_]+/gi, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase()
    .slice(0, 64) || "upload_error";
}
