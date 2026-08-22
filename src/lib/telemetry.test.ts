import { describe, expect, it } from "vitest";

import {
  appendEvent,
  appendSupportReferenceCreated,
  appendWorkerReceipt
} from "@/lib/telemetry";
import type { TryMeSession } from "@/lib/types";

function session(): TryMeSession {
  return {
    id: "telemetry-session",
    traceId: "telemetry-trace-1234567890",
    editorTokenHash: "private",
    useCase: "content",
    companyDomain: "folloze.com",
    status: "collecting",
    createdAt: "2026-07-31T00:00:00.000Z",
    updatedAt: "2026-07-31T00:00:00.000Z",
    temporaryUrl: "https://preview.example/e/telemetry-session",
    revision: 1,
    stages: {
      brand: { status: "pending" },
      audience: { status: "pending" },
      story: { status: "pending" }
    },
    answers: {},
    audienceSuggestions: [],
    events: []
  };
}

describe("session telemetry privacy", () => {
  it("redacts sensitive values and drops private metadata before the event is committed", () => {
    const current = session();

    appendEvent(current, "source_processed", {
      sourceContent: "private source body",
      generatedCopy: "private generated copy",
      editorToken: "secret-editor-token",
      domain: "cisco.com",
      status: "Sent to buyer@example.com from https://private.example/path"
    });

    expect(current.events.at(-1)?.meta).toEqual({
      status: "Sent to [redacted-email] from [redacted-url]"
    });
    expect(current.events.at(-1)?.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("records worker receipts and support-reference creation without raw domains", () => {
    const current = session();
    appendWorkerReceipt(current, "fell_back", {
      workerName: "brand",
      attemptId: "attempt-1",
      durationMs: 1200,
      fallbackReason: "brand harvest timed out for cisco.com"
    });
    appendSupportReferenceCreated(current);

    expect(current.events.map((event) => event.name)).toEqual([
      "worker_fell_back",
      "support_reference_created"
    ]);
    expect(JSON.stringify(current.events)).not.toContain("cisco.com");
    expect(current.events[0]?.meta).toMatchObject({
      workerName: "brand",
      workerOutcome: "fell_back",
      fallbackReason: expect.stringContaining("[redacted-domain]")
    });
    expect(current.events[1]?.meta).toMatchObject({
      receiptKind: "support_reference",
      status: "available"
    });
  });
});
