import { describe, expect, it, vi } from "vitest";

import { appendEvent } from "@/lib/telemetry";
import type { TryMeSession } from "@/lib/types";

function session(): TryMeSession {
  return {
    id: "telemetry-session",
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
  it("redacts sensitive values and drops private metadata fields before storage and logging", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const current = session();

    appendEvent(current, "source_processed", {
      sourceContent: "private source body",
      generatedCopy: "private generated copy",
      editorToken: "secret-editor-token",
      status: "Sent to buyer@example.com from https://private.example/path"
    });

    expect(current.events.at(-1)?.meta).toEqual({
      status: "Sent to [redacted-email] from [redacted-url]"
    });
    const log = String(info.mock.calls[0]?.[0]);
    expect(log).not.toContain("private source body");
    expect(log).not.toContain("private generated copy");
    expect(log).not.toContain("secret-editor-token");
    expect(log).not.toContain("buyer@example.com");
    expect(log).not.toContain("private.example");
    info.mockRestore();
  });
});
