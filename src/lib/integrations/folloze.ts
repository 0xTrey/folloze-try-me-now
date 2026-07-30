import OpenAI from "openai";

import { config, hasOpenAIKey, hasRemoteFolloze } from "@/lib/config";
import type { TryMeSession } from "@/lib/types";

export interface FollozePublishResult {
  mode: "folloze" | "preview-only";
  publicUrl?: string;
  designerUrl?: string;
  boardId?: string;
  warnings: string[];
}

function parseGatewayOutput(value: string | null | undefined): Record<string, unknown> | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export async function publishClaimedExperience(session: TryMeSession): Promise<FollozePublishResult> {
  if (!hasRemoteFolloze || !hasOpenAIKey) {
    return {
      mode: "preview-only",
      publicUrl: session.temporaryUrl,
      warnings: ["Remote Folloze MCP is not configured. The claimed app URL remains active."]
    };
  }

  const token = process.env.FOLLOZE_MCP_AUTH_TOKEN;
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const response = await client.responses.create({
    model: config.openAIModel,
    store: false,
    instructions: [
      "Call the approved Folloze Try Me Now publication tool exactly once.",
      "Use only the supplied session ID, artifact revision, and idempotency key.",
      "Do not call any other tool and do not alter the arguments."
    ].join("\n"),
    input: JSON.stringify({
      session_id: session.id,
      artifact_revision: session.revision,
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
  });

  const toolCall = response.output.find(
    (item): item is OpenAI.Responses.ResponseOutputItem.McpCall =>
      item.type === "mcp_call" && item.name === config.follozeToolName
  );
  if (!toolCall || toolCall.error) {
    throw new Error(toolCall?.error ?? "The Folloze MCP gateway did not return a publication result.");
  }
  const output = parseGatewayOutput(toolCall.output);
  if (!output) throw new Error("The Folloze MCP gateway returned an unreadable result.");

  const status = typeof output.status === "string" ? output.status : "";
  if (!["published", "already_published"].includes(status)) {
    throw new Error(`Folloze publication returned ${status || "an unknown status"}.`);
  }

  return {
    mode: "folloze",
    publicUrl: typeof output.public_url === "string" ? output.public_url : undefined,
    designerUrl: typeof output.designer_url === "string" ? output.designer_url : undefined,
    boardId:
      typeof output.board_id === "string" || typeof output.board_id === "number"
        ? String(output.board_id)
        : undefined,
    warnings: Array.isArray(output.warnings)
      ? output.warnings.filter((warning): warning is string => typeof warning === "string")
      : []
  };
}
