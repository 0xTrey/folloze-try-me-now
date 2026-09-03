const AGENTMAIL_API_ORIGIN = "https://api.agentmail.to";
const AGENTMAIL_API_PATH = "/v0/inboxes";
const DEFAULT_TIMEOUT_MS = 10_000;

export class AgentMailRejectedError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`AgentMail rejected the message (${status})`);
    this.name = "AgentMailRejectedError";
    this.status = status;
  }
}

export class AgentMailAmbiguousError extends Error {
  constructor(message = "AgentMail delivery status is ambiguous") {
    super(message);
    this.name = "AgentMailAmbiguousError";
  }
}

function boundedText(value: string, maximum: number): string {
  return value.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, maximum);
}

function assertEmail(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new AgentMailRejectedError(400);
  }
  return normalized;
}

function assertIdempotencyKey(value: string): string {
  const normalized = value.trim();
  if (!/^[A-Za-z0-9._~-]{1,256}$/.test(normalized)) {
    throw new AgentMailRejectedError(400);
  }
  return normalized;
}

export async function sendAgentMailMessage(input: {
  apiKey: string;
  inboxId: string;
  recipient: string;
  subject: string;
  text: string;
  html: string;
  idempotencyKey: string;
  replyTo?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
}): Promise<{ messageId: string; threadId: string }> {
  const apiKey = input.apiKey.trim();
  const inboxId = boundedText(input.inboxId, 240);
  const recipient = assertEmail(input.recipient);
  const replyTo = input.replyTo ? assertEmail(input.replyTo) : undefined;
  const subject = boundedText(input.subject, 240);
  const text = input.text.trim();
  const html = input.html.trim();
  const idempotencyKey = assertIdempotencyKey(input.idempotencyKey);
  if (!apiKey || !inboxId || !subject || !text || !html) {
    throw new AgentMailRejectedError(400);
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    Math.max(1_000, Math.min(20_000, input.timeoutMs ?? DEFAULT_TIMEOUT_MS))
  );
  const signal = input.signal
    ? AbortSignal.any([input.signal, controller.signal])
    : controller.signal;

  try {
    const response = await fetch(
      `${AGENTMAIL_API_ORIGIN}${AGENTMAIL_API_PATH}/${encodeURIComponent(inboxId)}/messages/send`,
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey
        },
        body: JSON.stringify({
          to: [recipient],
          subject,
          text,
          html,
          labels: ["try-me-now-personalization"],
          track_opens: false,
          ...(replyTo ? { reply_to: replyTo } : {})
        }),
        signal
      }
    );

    if (response.status >= 400 && response.status < 500) {
      throw new AgentMailRejectedError(response.status);
    }
    if (!response.ok) throw new AgentMailAmbiguousError();

    let data: unknown;
    try {
      data = await response.json();
    } catch {
      throw new AgentMailAmbiguousError("AgentMail returned an invalid response");
    }
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      throw new AgentMailAmbiguousError("AgentMail returned an invalid response");
    }
    const record = data as Record<string, unknown>;
    const messageId =
      typeof record.message_id === "string" ? record.message_id.trim() : "";
    const threadId =
      typeof record.thread_id === "string" ? record.thread_id.trim() : "";
    if (!messageId || !threadId) {
      throw new AgentMailAmbiguousError(
        "AgentMail returned an incomplete acceptance receipt"
      );
    }
    return { messageId, threadId };
  } catch (error) {
    if (
      error instanceof AgentMailRejectedError ||
      error instanceof AgentMailAmbiguousError
    ) {
      throw error;
    }
    throw new AgentMailAmbiguousError();
  } finally {
    clearTimeout(timeout);
  }
}
