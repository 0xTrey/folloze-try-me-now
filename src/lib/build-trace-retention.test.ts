import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { BuildTraceBuilder, type BuildTraceV1 } from "@/lib/build-trace";
import { retainCommittedBuildTrace } from "@/lib/build-trace-retention";
import {
  clearMemoryBuildTracesForTest,
  readBuildTracesByTraceId
} from "@/lib/build-trace-store";
import type { TryMeSession } from "@/lib/types";

const NOW = "2026-08-27T12:00:00.000Z";
const ATTEMPT = "attempt_retention_1";
const REVISION = 6;

function trace(overrides: Partial<BuildTraceV1> = {}): BuildTraceV1 {
  const builder = new BuildTraceBuilder({
    traceId: "trace_retention_fixture",
    sessionId: "session_retention_fixture",
    attemptId: overrides.attemptId ?? ATTEMPT,
    revision: overrides.revision ?? REVISION,
    startedAt: NOW
  });
  builder.recordTiming({
    stage: "brand-compile",
    startedAt: NOW,
    completedAt: "2026-08-27T12:00:01.000Z",
    status: "completed"
  });
  return {
    ...builder.build({
      terminalStatus: "completed",
      completedAt: "2026-08-27T12:00:02.000Z"
    }),
    ...overrides
  };
}

function committedSession(overrides: {
  revision?: number;
  attemptId?: string;
} = {}): TryMeSession {
  return {
    id: "session_retention_fixture",
    editorTokenHash: "hash",
    useCase: "campaign",
    companyDomain: "acme.example",
    status: "preview_ready_unclaimed",
    createdAt: NOW,
    updatedAt: NOW,
    temporaryUrl: "https://example.test/e/session_retention_fixture",
    revision: overrides.revision ?? REVISION,
    stages: {
      brand: { status: "complete", completedAt: NOW },
      audience: { status: "complete", completedAt: NOW },
      story: {
        status: "complete",
        completedAt: NOW,
        attemptId: overrides.attemptId ?? ATTEMPT
      }
    },
    answers: { audience: "Operations leaders", objective: "Book meetings" },
    audienceSuggestions: [],
    audienceRecommendations: [],
    evidenceItems: [],
    events: []
  };
}

describe("build trace retention follows the committed session", () => {
  beforeEach(() => {
    clearMemoryBuildTracesForTest();
  });

  afterEach(() => {
    clearMemoryBuildTracesForTest();
  });

  it("retains exactly one trace for the committed revision and attempt", async () => {
    const result = await retainCommittedBuildTrace({
      committed: committedSession(),
      trace: trace(),
      attemptId: ATTEMPT
    });

    expect(result?.outcome).toBe("saved");
    const retained = await readBuildTracesByTraceId("trace_retention_fixture");
    expect(retained).toHaveLength(1);
    expect(retained[0]).toMatchObject({ revision: REVISION, attemptId: ATTEMPT });
  });

  it("retains nothing when the compare-and-set never committed", async () => {
    const result = await retainCommittedBuildTrace({
      committed: null,
      trace: trace(),
      attemptId: ATTEMPT
    });

    expect(result).toBeUndefined();
    await expect(readBuildTracesByTraceId("trace_retention_fixture")).resolves.toEqual([]);
  });

  it("retains nothing when another attempt won the session", async () => {
    const result = await retainCommittedBuildTrace({
      committed: committedSession({ attemptId: "attempt_retention_2" }),
      trace: trace(),
      attemptId: ATTEMPT
    });

    expect(result).toBeUndefined();
    await expect(readBuildTracesByTraceId("trace_retention_fixture")).resolves.toEqual([]);
  });

  it("retains nothing when the committed revision moved past the attempt", async () => {
    const result = await retainCommittedBuildTrace({
      committed: committedSession({ revision: REVISION + 1 }),
      trace: trace(),
      attemptId: ATTEMPT
    });

    expect(result?.outcome).toBe("stale_revision");
    await expect(readBuildTracesByTraceId("trace_retention_fixture")).resolves.toEqual([]);
  });

  it("treats a duplicate retry of the same attempt as idempotent", async () => {
    const input = {
      committed: committedSession(),
      trace: trace(),
      attemptId: ATTEMPT
    };

    const first = await retainCommittedBuildTrace(input);
    const second = await retainCommittedBuildTrace(input);

    expect(first?.outcome).toBe("saved");
    expect(second?.outcome).toBe("duplicate");
    await expect(readBuildTracesByTraceId("trace_retention_fixture")).resolves.toHaveLength(1);
  });

  it("swallows a store failure rather than failing the preview", async () => {
    await expect(
      retainCommittedBuildTrace({
        committed: committedSession(),
        trace: { ...trace(), sections: "not-an-array" } as unknown as BuildTraceV1,
        attemptId: ATTEMPT
      })
    ).resolves.toMatchObject({ outcome: "invalid" });
    await expect(readBuildTracesByTraceId("trace_retention_fixture")).resolves.toEqual([]);
  });
});
