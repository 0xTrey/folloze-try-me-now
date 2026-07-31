import OpenAI from "openai";
import { createHash } from "node:crypto";
import { z } from "zod";

import { canPublishFolloze, config, hasOpenAIKey } from "@/lib/config";
import { fetchPinnedPublicText } from "@/lib/safe-fetch";
import type { TryMeSession } from "@/lib/types";
import { assertSafePublicUrl } from "@/lib/validation";

export interface FollozePublishResult {
  mode: "folloze" | "preview-only";
  publicUrl?: string;
  designerUrl?: string;
  boardId?: string;
  warnings: string[];
}

const gatewayOutputSchema = z
  .object({
    status: z.enum(["published", "already_published"]),
    public_url: z.string().url().max(2_000),
    designer_url: z
      .string()
      .url()
      .max(2_000)
      .refine((value) => new URL(value).protocol === "https:")
      .optional(),
    board_id: z.union([z.string().trim().min(1).max(200), z.number().int().nonnegative()]),
    artifact_revision: z.number().int().nonnegative(),
    artifact_digest: z.string().regex(/^[a-f0-9]{64}$/),
    warnings: z.array(z.string().max(500)).max(20).optional()
  })
  .strict();

export function parseFollozeGatewayOutput(
  value: string | null | undefined
): z.infer<typeof gatewayOutputSchema> {
  if (!value) throw new Error("The Folloze MCP gateway returned an empty result.");
  try {
    return gatewayOutputSchema.parse(JSON.parse(value));
  } catch {
    throw new Error("The Folloze MCP gateway returned an unreadable or invalid result.");
  }
}

export function isAllowedFollozePublicHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/\.$/, "");
  return config.follozeAllowedPublicHosts.some((entry) => {
    if (entry.startsWith("*.")) {
      const suffix = entry.slice(1);
      return normalized.endsWith(suffix) && normalized.length > suffix.length;
    }
    return normalized === entry;
  });
}

function assertAllowedFollozeUrlShape(parsed: URL): void {
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port) {
    throw new Error("Only public HTTPS URLs are supported.");
  }
  if (!isAllowedFollozePublicHost(parsed.hostname)) {
    throw new Error("Folloze publication returned a URL outside the approved public hosts.");
  }
}

function parseFollozePublicUrl(value: unknown): URL {
  if (typeof value !== "string") {
    throw new Error("Folloze publication did not return a public URL.");
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("Folloze publication returned an invalid public URL.");
  }
  assertAllowedFollozeUrlShape(parsed);
  return parsed;
}

export async function validateFollozePublicUrl(value: unknown): Promise<string> {
  const parsed = parseFollozePublicUrl(value);
  return (await assertSafePublicUrl(parsed.toString())).toString();
}

export async function readBackFollozePublicUrl(value: unknown): Promise<string> {
  const parsed = parseFollozePublicUrl(value);
  const response = await fetchPinnedPublicText(parsed, {
    maxBytes: 512_000,
    maxRedirects: 3,
    timeoutMs: 12_000,
    headers: {
      Accept: "text/html,application/xhtml+xml;q=0.9"
    },
    validateUrl: (redirectUrl) => assertAllowedFollozeUrlShape(redirectUrl)
  });

  if (response.status !== 200) {
    throw new Error(`The Folloze public URL could not be read anonymously (${response.status}).`);
  }
  const contentType = String(response.headers["content-type"] ?? "").toLowerCase();
  if (!/^(?:text\/html|application\/xhtml\+xml)(?:;|$)/.test(contentType)) {
    throw new Error("The Folloze public URL did not return an HTML experience.");
  }
  const contentEncoding = String(response.headers["content-encoding"] ?? "identity").toLowerCase();
  if (contentEncoding !== "identity") {
    throw new Error("The Folloze public URL returned an unsupported encoded response.");
  }
  const html = response.text.trim();
  if (
    html.length < 100 ||
    !/(?:<!doctype\s+html\b|<html\b)/i.test(html) ||
    !/<body\b/i.test(html)
  ) {
    throw new Error("The Folloze public URL did not return a credible HTML experience.");
  }
  if (
    /<input\b[^>]*type=["']password["']/i.test(html) ||
    /(?:checking your browser|verify you are human|cf-chl-|challenge-platform)/i.test(html)
  ) {
    throw new Error("The Folloze public URL is not anonymously accessible.");
  }

  return response.finalUrl.toString();
}

export async function publishClaimedExperience(session: TryMeSession): Promise<FollozePublishResult> {
  if (!canPublishFolloze || !hasOpenAIKey) {
    return {
      mode: "preview-only",
      publicUrl: session.temporaryUrl,
      warnings: ["Folloze publication is not enabled. The claimed app URL remains active."]
    };
  }

  const token = process.env.FOLLOZE_MCP_AUTH_TOKEN;
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, maxRetries: 0 });
  const artifactRevision = session.experience?.artifactRevision ?? session.revision;
  const artifactDigest =
    session.experience?.artifactDigest ??
    createHash("sha256").update(session.experience?.html ?? "").digest("hex");
  const response = await client.responses.create({
    model: config.openAIModel,
    store: false,
    instructions: [
      "Call the approved Folloze Try Me Now publication tool exactly once.",
      "Use only the supplied session ID, immutable artifact revision, artifact digest, and idempotency key.",
      "Do not call any other tool and do not alter the arguments."
    ].join("\n"),
    input: JSON.stringify({
      session_id: session.id,
      artifact_revision: artifactRevision,
      artifact_digest: artifactDigest,
      idempotency_key: `claim:${session.id}`
    }),
    tools: [
      {
        type: "mcp",
        server_label: "folloze_try_me_now",
        server_url: process.env.FOLLOZE_MCP_SERVER_URL,
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        allowed_tools: [config.follozeToolName],
        require_approval: "never"
      }
    ],
    tool_choice: {
      type: "mcp",
      server_label: "folloze_try_me_now",
      name: config.follozeToolName
    }
  }, { timeout: 120_000, maxRetries: 0, signal: AbortSignal.timeout(120_000) });

  const toolCall = response.output.find(
    (item): item is OpenAI.Responses.ResponseOutputItem.McpCall =>
      item.type === "mcp_call" && item.name === config.follozeToolName
  );
  if (!toolCall || toolCall.error) {
    throw new Error(toolCall?.error ?? "The Folloze MCP gateway did not return a publication result.");
  }
  const output = parseFollozeGatewayOutput(toolCall.output);
  if (
    output.artifact_revision !== artifactRevision ||
    output.artifact_digest !== artifactDigest
  ) {
    throw new Error("The Folloze MCP gateway returned a different artifact revision or digest.");
  }
  const publicUrl = await readBackFollozePublicUrl(output.public_url);

  return {
    mode: "folloze",
    publicUrl,
    designerUrl: output.designer_url,
    boardId: String(output.board_id),
    warnings: output.warnings ?? []
  };
}
