import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  BUILD_TRACE_READ_LIMIT,
  BUILD_TRACE_RETENTION_DAYS,
  clearMemoryBuildTracesForTest,
  purgeExpiredBuildTraces,
  readBuildTracesBySupportRef,
  readBuildTracesByTraceId,
  saveBuildTrace
} from "@/lib/build-trace-store";
import { BuildTraceBuilder, type BuildTraceV1 } from "@/lib/build-trace";
import { supportRefForTraceId } from "@/lib/observability";
import {
  projectBuildTraceForInspection,
  renderBuildTraceReport
} from "../../scripts/lib/build-trace-timeline.mjs";

const NOW = "2026-08-27T12:00:00.000Z";

function trace(overrides: Partial<BuildTraceV1> = {}): BuildTraceV1 {
  const builder = new BuildTraceBuilder({
    traceId: "trace_build_store_fixture",
    sessionId: "session_build_store_fixture",
    attemptId: overrides.attemptId ?? "attempt_build_store_1",
    revision: overrides.revision ?? 4,
    startedAt: NOW
  });
  builder.recordTiming({
    stage: "brand-compile",
    startedAt: NOW,
    completedAt: "2026-08-27T12:00:01.000Z",
    status: "completed"
  });
  builder.recordFallback({
    stage: "asset-allocation",
    code: "assets_exhausted",
    scope: "stage",
    at: "2026-08-27T12:00:02.000Z"
  });
  return {
    ...builder.build({
      terminalStatus: "completed",
      completedAt: "2026-08-27T12:00:03.000Z"
    }),
    ...overrides
  };
}

describe("private build trace persistence", () => {
  beforeEach(() => {
    clearMemoryBuildTracesForTest();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));
  });

  afterEach(() => {
    vi.useRealTimers();
    clearMemoryBuildTracesForTest();
  });

  it("saves a committed attempt and reads it back by trace id and support reference", async () => {
    const subject = trace();
    const saved = await saveBuildTrace({ trace: subject, committedRevision: subject.revision });

    expect(saved.outcome).toBe("saved");
    expect(saved.supportRef).toBe(supportRefForTraceId(subject.traceId));

    const byTrace = await readBuildTracesByTraceId(subject.traceId);
    const bySupport = await readBuildTracesBySupportRef(saved.supportRef!);

    expect(byTrace).toHaveLength(1);
    expect(bySupport).toHaveLength(1);
    expect(byTrace[0]!.trace).toEqual(subject);
    expect(byTrace[0]!.revision).toBe(subject.revision);
  });

  it("treats a retry of the same attempt as a duplicate rather than a second row", async () => {
    const subject = trace();
    const first = await saveBuildTrace({ trace: subject, committedRevision: subject.revision });
    const second = await saveBuildTrace({ trace: subject, committedRevision: subject.revision });

    expect(first.outcome).toBe("saved");
    expect(second.outcome).toBe("duplicate");
    expect(await readBuildTracesByTraceId(subject.traceId)).toHaveLength(1);
  });

  it("refuses to persist an attempt whose revision the session has not committed", async () => {
    const subject = trace({ revision: 4 });
    const result = await saveBuildTrace({ trace: subject, committedRevision: 5 });

    expect(result.outcome).toBe("stale_revision");
    expect(await readBuildTracesByTraceId(subject.traceId)).toHaveLength(0);
  });

  it("rejects a trace carrying content outside the privacy boundary", async () => {
    const subject = trace();
    const contaminated = {
      ...subject,
      fallbacks: [{ ...subject.fallbacks[0]!, code: "buyer@example.com" }]
    } as BuildTraceV1;
    const result = await saveBuildTrace({
      trace: contaminated,
      committedRevision: subject.revision
    });

    expect(["privacy_rejected", "invalid"]).toContain(result.outcome);
    expect(await readBuildTracesByTraceId(subject.traceId)).toHaveLength(0);
  });

  it("rejects a record that is not a parseable build trace", async () => {
    const result = await saveBuildTrace({
      trace: { schemaVersion: 99 } as unknown as BuildTraceV1,
      committedRevision: 1
    });

    expect(result.outcome).toBe("invalid");
  });

  it("caps a support lookup at the read limit, newest attempt first", async () => {
    for (let index = 0; index < BUILD_TRACE_READ_LIMIT + 5; index += 1) {
      const attempt = trace({ attemptId: `attempt_build_store_${index}` });
      await saveBuildTrace({
        trace: {
          ...attempt,
          completedAt: new Date(Date.parse(NOW) + index * 1_000).toISOString()
        },
        committedRevision: attempt.revision
      });
    }

    const stored = await readBuildTracesByTraceId("trace_build_store_fixture");
    expect(stored).toHaveLength(BUILD_TRACE_READ_LIMIT);
    expect(stored[0]!.createdAt >= stored[stored.length - 1]!.createdAt).toBe(true);
  });

  it("purges attempts past the retention window and keeps recent ones", async () => {
    const recent = trace({ attemptId: "attempt_recent" });
    await saveBuildTrace({ trace: recent, committedRevision: recent.revision });

    const expired = trace({ attemptId: "attempt_expired" });
    await saveBuildTrace({
      trace: {
        ...expired,
        startedAt: "2026-01-01T00:00:00.000Z",
        completedAt: "2026-01-01T00:00:01.000Z"
      },
      committedRevision: expired.revision
    });

    vi.setSystemTime(new Date(Date.parse(NOW) + BUILD_TRACE_RETENTION_DAYS * 86_400_000));
    const purged = await purgeExpiredBuildTraces();

    expect(purged).toBe(1);
    const remaining = await readBuildTracesByTraceId("trace_build_store_fixture");
    expect(remaining.map(({ attemptId }) => attemptId)).toEqual(["attempt_recent"]);
  });
});

describe("operator build trace inspection", () => {
  beforeEach(() => {
    clearMemoryBuildTracesForTest();
  });

  it("renders a complete timeline for a support reference", async () => {
    const subject = trace();
    await saveBuildTrace({ trace: subject, committedRevision: subject.revision });
    const supportRef = supportRefForTraceId(subject.traceId);
    const stored = await readBuildTracesBySupportRef(supportRef);

    const report = renderBuildTraceReport(
      supportRef,
      stored.map(({ trace: value }) => value)
    );

    expect(report).toContain(`Support reference ${supportRef}`);
    expect(report).toContain("Timeline");
    expect(report).toContain("brand-compile");
    expect(report).toContain("Decisions");
    expect(report).toContain("Brand roles");
    expect(report).toContain("Asset allocations");
    expect(report).toContain("Sections");
    expect(report).toContain("Quality");
    expect(report).toContain("Fallbacks");
    expect(report).toContain("assets_exhausted");
  });

  it("explains an empty result instead of printing nothing", () => {
    expect(renderBuildTraceReport("TMN-AAAAAAAAAAAA", [])).toBe(
      "No retained build trace matches TMN-AAAAAAAAAAAA."
    );
  });

  it("withholds any stored value that is not a safe token", () => {
    const subject = trace();
    const report = renderBuildTraceReport("TMN-AAAAAAAAAAAA", [
      {
        ...subject,
        fallbacks: [{ ...subject.fallbacks[0]!, code: "contact buyer@example.com now" }]
      }
    ]);

    expect(report).not.toContain("buyer@example.com");
    expect(report).toContain("[withheld]");
  });
});

describe("projected JSON inspection", () => {
  it("emits a projection rather than the stored object", () => {
    const stored = {
      ...trace(),
      internalNote: "the operator should never see this",
      sourceText: "Raw harvested copy from the seller site."
    };
    const projected = projectBuildTraceForInspection(stored)!;

    expect(projected).toBeDefined();
    expect(Object.keys(projected)).not.toContain("internalNote");
    expect(Object.keys(projected)).not.toContain("sourceText");
    expect(projected.attemptId).toBe("attempt_build_store_1");
    expect(projected.terminalStatus).toBe("completed");
  });

  it("drops any value that is not a safe token", () => {
    const subject = trace();
    const projected = projectBuildTraceForInspection({
      ...subject,
      sessionId: "buyer@example.com",
      fallbacks: [
        { ...subject.fallbacks[0]!, code: "visit https://acme.example/pricing" }
      ]
    })!;
    const serialized = JSON.stringify(projected);

    expect(serialized).not.toContain("buyer@example.com");
    expect(serialized).not.toContain("acme.example");
    expect(projected.sessionId).toBeUndefined();
    expect((projected.fallbacks as { code?: string }[])[0]!.code).toBeUndefined();
  });

  it("keeps source text, copy, markup, and credentials out of the projection", () => {
    const subject = trace();
    const projected = projectBuildTraceForInspection({
      ...subject,
      sections: [
        {
          sectionId: "launch-1",
          role: "buyer-outcome",
          status: "complete",
          writerMode: "model",
          promptVersion: "buyer-outcome-v1.0.0",
          templateVersion: "tpl-v2",
          inputDigest: "dg_aaaaaaaaaaaaaaaa",
          outputDigest: "dg_bbbbbbbbbbbbbbbb",
          selectedCandidate: 0,
          candidateDigests: ["dg_cccccccccccccccc"],
          selectionReasons: ["contract_satisfied"],
          headline: "Approvals close before the shift handover",
          body: "<p>Generated body copy the operator must not read.</p>",
          apiKey: "sk-live-000111222333"
        }
      ]
    })!;
    const serialized = JSON.stringify(projected);

    expect(serialized).not.toMatch(/Approvals close|Generated body copy|<p>|sk-live/);
    expect(serialized).toContain("dg_aaaaaaaaaaaaaaaa");
    expect((projected.sections as { candidateCount?: number }[])[0]!.candidateCount).toBe(1);
  });

  it("reports an unreadable record as nothing to inspect", () => {
    expect(projectBuildTraceForInspection(undefined)).toBeUndefined();
    expect(projectBuildTraceForInspection("not-a-trace")).toBeUndefined();
  });

  it("bounds a hostile collection instead of dumping it", () => {
    const subject = trace();
    const projected = projectBuildTraceForInspection({
      ...subject,
      timings: Array.from({ length: 500 }, () => ({
        stage: "brand-compile",
        status: "completed",
        durationMs: 1
      }))
    })!;

    expect((projected.timings as unknown[]).length).toBeLessThanOrEqual(64);
  });
});
