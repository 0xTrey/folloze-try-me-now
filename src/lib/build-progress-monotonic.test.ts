import { describe, expect, it } from "vitest";

import { advanceBuildProgress } from "@/lib/orchestrator";
import type { TryMeSession } from "@/lib/types";

function progressSession(): TryMeSession {
  return {
    buildProgress: {
      phase: "checking",
      startedAt: "2026-09-01T22:00:00.000Z",
      updatedAt: "2026-09-01T22:00:20.000Z",
      slow: false,
      receipts: [
        "queued",
        "researching",
        "planning",
        "writing",
        "checking",
        "finalizing"
      ].map((phase, index) => ({
        phase: phase as "queued" | "researching" | "planning" | "writing" | "checking" | "finalizing",
        status: index < 4 ? "complete" as const : index === 4 ? "active" as const : "queued" as const,
        detail: phase,
        ...(index <= 4 ? { startedAt: "2026-09-01T22:00:00.000Z" } : {}),
        ...(index < 4 ? { completedAt: "2026-09-01T22:00:20.000Z" } : {})
      }))
    }
  } as TryMeSession;
}

describe("customer-visible build progress", () => {
  it("ignores a stale writing callback after checking has started", () => {
    const session = progressSession();

    advanceBuildProgress(session, {
      completed: ["queued", "researching", "planning"],
      active: "writing",
      phase: "writing"
    });

    expect(session.buildProgress?.phase).toBe("checking");
    expect(session.buildProgress?.receipts.find(({ phase }) => phase === "writing")?.status).toBe("complete");
    expect(session.buildProgress?.receipts.find(({ phase }) => phase === "checking")?.status).toBe("active");
  });

  it("marks the furthest real stage failed instead of repainting it queued", () => {
    const session = progressSession();

    advanceBuildProgress(session, {
      completed: ["queued", "researching", "planning"],
      phase: "failed",
      failure: {
        code: "generation_failed",
        retryable: true,
        nextAction: "Try again"
      }
    });

    expect(session.buildProgress?.phase).toBe("failed");
    expect(session.buildProgress?.receipts.find(({ phase }) => phase === "writing")?.status).toBe("complete");
    expect(session.buildProgress?.receipts.find(({ phase }) => phase === "checking")?.status).toBe("failed");
    expect(session.buildProgress?.receipts.find(({ phase }) => phase === "finalizing")?.status).toBe("queued");
  });
});
