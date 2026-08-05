import { beforeEach, describe, expect, it, vi } from "vitest";

import { appendEvent } from "@/lib/telemetry";
import {
  clearMemoryTraceEventsForTest,
  purgeExpiredTraceEvents,
  readTraceEvents,
  recordCommittedSessionEvents,
  TRACE_EVENT_LIMIT,
  traceIdForSession
} from "@/lib/trace-store";
import type { TryMeSession } from "@/lib/types";

function session(): TryMeSession {
  return {
    id: "public-session-locator",
    traceId: "private-trace-1234567890",
    editorTokenHash: "private",
    useCase: "abm",
    companyDomain: "cisco.com",
    status: "collecting",
    createdAt: "2026-07-31T00:00:00.000Z",
    updatedAt: "2026-07-31T00:00:00.000Z",
    temporaryUrl: "https://preview.example/e/public-session-locator",
    revision: 1,
    stages: {
      brand: { status: "running" },
      audience: { status: "pending" },
      story: { status: "pending" }
    },
    answers: {},
    audienceSuggestions: [],
    events: []
  };
}

describe("server-only operational trace store", () => {
  beforeEach(() => {
    clearMemoryTraceEventsForTest();
    vi.restoreAllMocks();
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("persists one committed event and deduplicates the same event ID", async () => {
    const current = session();
    appendEvent(current, "brand_harvest_completed", {
      attemptId: "attempt-123",
      domain: "cisco.com",
      source: "fast-extractor",
      sourceKind: "abm-product",
      durationMs: 912,
      logoStrategy: "inline-svg-unportable",
      logoSelectedSource: "json-ld",
      logoAssetPath: "/assets/logo-open-graph.gif",
      harvestedSource: "brand-harvester",
      identityRejectionReason: "The logo owner signal did not match.",
      sourceContent: "private customer content"
    });

    await recordCommittedSessionEvents(current);
    await recordCommittedSessionEvents(current);

    const records = await readTraceEvents(current.traceId!);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      traceId: current.traceId,
      event: "brand_harvest_completed",
      stage: "brand",
      outcome: "success",
      spanId: "attempt-123",
      durationMs: 912,
      meta: {
        attemptId: "attempt-123",
        source: "fast-extractor",
        sourceKind: "abm-product",
        durationMs: 912,
        logoStrategy: "inline-svg-unportable",
        logoSelectedSource: "json-ld",
        logoAssetPath: "/assets/logo-open-graph.gif",
        harvestedSource: "brand-harvester",
        identityRejectionReason: "The logo owner signal did not match."
      }
    });
    expect(JSON.stringify(records)).not.toContain("cisco.com");
    expect(JSON.stringify(records)).not.toContain("private customer content");
    expect(JSON.stringify(records)).not.toContain(current.id);
    expect(vi.mocked(console.info).mock.calls.map(([line]) => String(line)).join("\n")).toContain(
      records[0].supportRef
    );
  });

  it("emits only events added after the previously committed event set", async () => {
    const current = session();
    appendEvent(current, "brand_harvest_started", { attemptId: "attempt-1" });
    const committed = structuredClone(current.events);
    appendEvent(current, "brand_harvest_completed", {
      attemptId: "attempt-1",
      logoAvailable: true
    });

    await recordCommittedSessionEvents(current, committed);

    const records = await readTraceEvents(current.traceId!);
    expect(records.map((record) => record.event)).toEqual(["brand_harvest_completed"]);
  });

  it("uses a stable non-public legacy trace ID when an old session has none", () => {
    const first = traceIdForSession({ id: "legacy-public-id" });
    const second = traceIdForSession({ id: "legacy-public-id" });

    expect(first).toBe(second);
    expect(first).not.toContain("legacy-public-id");
  });

  it("purges only trace records older than the 30-day boundary", async () => {
    const old = session();
    old.traceId = "old-trace-1234567890";
    appendEvent(old, "generation_completed", { durationMs: 100 });
    old.events[0].at = "2026-01-01T00:00:00.000Z";
    const recent = session();
    recent.traceId = "recent-trace-1234567890";
    appendEvent(recent, "generation_completed", { durationMs: 100 });
    recent.events[0].at = new Date().toISOString();
    await recordCommittedSessionEvents(old);
    await recordCommittedSessionEvents(recent);

    expect(await purgeExpiredTraceEvents()).toBe(1);
    expect(await readTraceEvents(old.traceId)).toEqual([]);
    expect(await readTraceEvents(recent.traceId)).toHaveLength(1);
  });

  it("returns the newest bounded timeline in chronological order", async () => {
    const current = session();
    current.events = Array.from({ length: TRACE_EVENT_LIMIT + 5 }, (_, index) => ({
      id: `event-${String(index).padStart(4, "0")}`,
      name: "preview_ready",
      at: new Date(Date.UTC(2026, 6, 31, 0, 0, index)).toISOString(),
      meta: { artifactRevision: index }
    }));

    await recordCommittedSessionEvents(current);

    const records = await readTraceEvents(current.traceId!);
    expect(records).toHaveLength(TRACE_EVENT_LIMIT);
    expect(records[0].eventId).toBe("event-0005");
    expect(records.at(-1)?.eventId).toBe(
      `event-${String(TRACE_EVENT_LIMIT + 4).padStart(4, "0")}`
    );
  });
});
