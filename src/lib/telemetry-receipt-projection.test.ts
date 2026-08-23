import { describe, expect, it } from "vitest";

import { selectThreeFamilyDecision } from "@/lib/generation/three-family-contract";
import {
  normalizeOperationalReceiptStatus,
  parseOperationalTraceReceipt,
  projectOperationalTraceReceipt,
  type OperationalReceiptStatus,
  type OperationalTraceReceipt
} from "@/lib/telemetry-receipt-projection";
import type { SessionEvent, TryMeSession } from "@/lib/types";

function session(): TryMeSession {
  const decision = selectThreeFamilyDecision({
    sessionId: "session-private",
    revision: 7,
    useCase: "abm",
    targetDomain: "buyer.example",
    firstDecision: "Review a private account plan",
    evidenceRefs: [
      "https://seller.example/private?token=secret",
      "prompt:raw-private-copy"
    ]
  });
  return {
    id: "session-private",
    traceId: "trace-private",
    editorTokenHash: "private",
    useCase: "abm",
    companyDomain: "seller.example",
    status: "generating",
    createdAt: "2026-08-23T12:00:00.000Z",
    updatedAt: "2026-08-23T12:00:02.000Z",
    temporaryUrl: "https://preview.example/e/session-private",
    revision: 7,
    stages: {
      brand: { status: "complete" },
      audience: { status: "complete" },
      story: { status: "running" }
    },
    answers: {},
    audienceSuggestions: [],
    workerReceipts: [
      {
        worker: "wireframe-ranker",
        status: "completed",
        queuedAt: "2026-08-23T12:00:00.000Z",
        startedAt: "2026-08-23T12:00:00.100Z",
        completedAt: "2026-08-23T12:00:00.180Z",
        durationMs: 80,
        evidenceRefs: decision.evidenceRefs.map((id) => ({ id })),
        dependencies: []
      },
      {
        worker: "brand-compiler",
        status: "needs_input",
        queuedAt: "2026-08-23T12:00:00.000Z",
        startedAt: "2026-08-23T12:00:00.000Z",
        completedAt: "2026-08-23T12:00:02.000Z",
        durationMs: 2_000,
        evidenceRefs: [{ id: "brand:private-source-body" }],
        dependencies: [],
        fallback: "brand_evidence_incomplete",
        error: {
          name: "ArtifactError",
          message: "provider said buyer@example.com is unavailable"
        }
      }
    ],
    experienceSpec: {
      schemaVersion: "2.0",
      revision: 7,
      sourceBriefRevision: 7,
      artifactDigest: "digest",
      route: { kind: "abm" },
      wireframeSelection: {
        version: 1,
        family: "account",
        archetypeId: "account-executive",
        compositionId: "workflow-spine",
        selectedBy: "system",
        reasonCode: "account-default",
        locked: true,
        alternativeIds: []
      },
      wireframeDecisionV2: decision,
      compositionRecipe: {
        family: "account",
        productionFamily: "align",
        archetypeId: "account-executive",
        compositionId: "workflow-spine",
        selectedBy: "system",
        locked: true
      },
      brief: {
        seller: "Seller",
        target: "Buyer",
        offer: "Offer",
        audience: "Audience",
        objective: "Objective",
        provenance: [],
        notes: []
      },
      sections: [],
      contentItems: [],
      actions: [],
      contentContracts: [],
      cta: {
        intent: "book-meeting",
        style: "solid",
        label: "Book a meeting",
        actionId: "primary"
      },
      selectedAssetIds: [],
      evidenceItemIds: [],
      curatedSections: [],
      analytics: { events: [] },
      renderers: {
        web: { status: "ready", hosting: "app" },
        folloze: { status: "disabled", reason: "public-runtime-html-only" }
      }
    } as unknown as NonNullable<TryMeSession["experienceSpec"]>,
    events: []
  };
}

function event(name: string, meta: SessionEvent["meta"]): SessionEvent {
  return {
    id: `event-${name}`,
    name,
    at: "2026-08-23T12:00:02.000Z",
    meta
  };
}

const opaqueEvidenceId = "ev_0123456789abcdefabcd";

function roundTrip(value: unknown): OperationalTraceReceipt | undefined {
  return parseOperationalTraceReceipt(JSON.parse(JSON.stringify(value)));
}

function workerReceipt(status: OperationalReceiptStatus): OperationalTraceReceipt {
  return {
    version: 2,
    kind: "worker",
    revision: 3,
    status,
    durationMs: 250,
    evidenceIds: [opaqueEvidenceId],
    worker: "message-spine-architect",
    ...(status === "fallback" ? { fallbackCode: "typed_fallback" } : {}),
    ...(status === "failed" ? { errorCode: "worker_failed" } : {})
  };
}

const sectionPlan = Array.from({ length: 4 }, (_, index) => ({
  id: `align-${index + 1}`,
  role: index === 0 ? "shared-priority" : "account-relevance",
  optional: false
}));

describe("operational telemetry receipt projection", () => {
  it("projects family, reason, section plan, timing, and opaque evidence IDs", () => {
    const current = session();
    const receipt = projectOperationalTraceReceipt(
      current,
      event("wireframe_selected", { revision: 7 }),
      current.traceId!
    );

    expect(receipt).toMatchObject({
      version: 2,
      kind: "family_selection",
      revision: 7,
      status: "completed",
      durationMs: 80,
      family: "align",
      reasonCode: "v2-named-account-first-decision-align",
      worker: "wireframe-ranker"
    });
    expect(receipt?.sectionPlan).toHaveLength(6);
    expect(receipt?.sectionPlan?.[0]).toMatchObject({
      id: "align-1",
      role: "shared-priority",
      optional: false
    });
    expect(receipt?.evidenceIds).toHaveLength(2);
    expect(receipt?.evidenceIds.every((id) => /^ev_[a-f0-9]{20}$/.test(id))).toBe(true);
    expect(JSON.stringify(receipt)).not.toMatch(
      /seller\.example|buyer\.example|token=|private-copy|Review a private/i
    );
  });

  it("records brand needs-input without provider messages or raw evidence IDs", () => {
    const current = session();
    const receipt = projectOperationalTraceReceipt(
      current,
      event("worker_needs_input", {
        worker: "brand-compiler",
        revision: 7,
        durationMs: 2_000,
        fallbackCode: "brand_evidence_incomplete"
      }),
      current.traceId!
    );

    expect(receipt).toMatchObject({
      kind: "brand_needs_input",
      revision: 7,
      status: "needs_input",
      durationMs: 2_000,
      worker: "brand-compiler",
      fallbackCode: "brand_evidence_incomplete"
    });
    expect(receipt?.errorCode).toBe("ArtifactError");
    expect(JSON.stringify(receipt)).not.toMatch(/buyer@example|private-source-body|provider said/i);
  });

  it("rejects malformed persisted receipt payloads", () => {
    expect(parseOperationalTraceReceipt({
      version: 2,
      kind: "worker",
      revision: 1,
      status: "completed",
      durationMs: 4,
      evidenceIds: ["https://private.example/evidence"]
    })).toBeUndefined();
  });

  it.each([
    ["started", "started"],
    ["complete", "completed"],
    ["completed", "completed"],
    ["fallback", "fallback"],
    ["timed_out", "timed_out"],
    ["failed", "failed"],
    ["stale", "stale"],
    ["needs_input", "needs_input"]
  ] as const)(
    "round-trips legal worker status %s as %s",
    (status, normalizedStatus) => {
      const receipt = roundTrip(workerReceipt(status));

      expect(receipt).toEqual({
        ...workerReceipt(status),
        status: normalizedStatus
      });
      expect(receipt?.kind).toBe("worker");
    }
  );

  it.each(["complete", "completed"] as const)(
    "round-trips family-selection status %s as completed",
    (status) => {
      const receipt = roundTrip({
        version: 2,
        kind: "family_selection",
        revision: 5,
        status,
        durationMs: 75,
        evidenceIds: [opaqueEvidenceId],
        worker: "wireframe-ranker",
        family: "align",
        reasonCode: "v2-named-account-align",
        sectionPlan
      });

      expect(receipt).toEqual({
        version: 2,
        kind: "family_selection",
        revision: 5,
        status: "completed",
        durationMs: 75,
        evidenceIds: [opaqueEvidenceId],
        worker: "wireframe-ranker",
        family: "align",
        reasonCode: "v2-named-account-align",
        sectionPlan
      });
    }
  );

  it("round-trips the legal brand needs-input kind and status", () => {
    const receipt = {
      version: 2,
      kind: "brand_needs_input",
      revision: 8,
      status: "needs_input",
      durationMs: 1_500,
      evidenceIds: [opaqueEvidenceId],
      worker: "brand-compiler",
      fallbackCode: "brand_evidence_incomplete"
    } satisfies OperationalTraceReceipt;

    expect(roundTrip(receipt)).toEqual(receipt);
  });

  it("normalizes complete and completed explicitly", () => {
    expect(normalizeOperationalReceiptStatus("complete")).toBe("completed");
    expect(normalizeOperationalReceiptStatus("completed")).toBe("completed");
    expect(normalizeOperationalReceiptStatus("unknown")).toBeUndefined();
  });

  it.each([
    [
      "raw evidence URL",
      { ...workerReceipt("completed"), evidenceIds: ["https://private.example/evidence?token=secret"] }
    ],
    [
      "unknown raw prompt field",
      { ...workerReceipt("completed"), rawPrompt: "Write private generated copy" }
    ],
    [
      "identifying worker value",
      { ...workerReceipt("completed"), worker: "buyer@example.com" }
    ],
    [
      "credential-shaped error code",
      { ...workerReceipt("failed"), errorCode: `sk-proj-${"a".repeat(24)}` }
    ],
    [
      "query-bearing reason code",
      {
        version: 2,
        kind: "family_selection",
        revision: 5,
        status: "completed",
        durationMs: 75,
        evidenceIds: [opaqueEvidenceId],
        worker: "wireframe-ranker",
        family: "align",
        reasonCode: "https://private.example/reason?email=buyer@example.com",
        sectionPlan
      }
    ],
    [
      "generated HTML in section plan",
      {
        version: 2,
        kind: "family_selection",
        revision: 5,
        status: "completed",
        durationMs: 75,
        evidenceIds: [opaqueEvidenceId],
        worker: "wireframe-ranker",
        family: "align",
        reasonCode: "v2-named-account-align",
        sectionPlan: [
          ...sectionPlan.slice(0, 3),
          { id: "align-4", role: "<html>generated copy</html>", optional: false }
        ]
      }
    ]
  ])("rejects persisted receipts containing %s", (_label, receipt) => {
    expect(roundTrip(receipt)).toBeUndefined();
  });

  it.each([
    ["family_selection", "failed", "wireframe-ranker"],
    ["brand_needs_input", "completed", "brand-compiler"]
  ])("rejects illegal %s/%s kind-status combinations", (kind, status, worker) => {
    expect(roundTrip({
      version: 2,
      kind,
      revision: 1,
      status,
      durationMs: 1,
      evidenceIds: [opaqueEvidenceId],
      worker,
      ...(kind === "family_selection"
        ? {
            family: "align",
            reasonCode: "v2-named-account-align",
            sectionPlan
          }
        : {})
    })).toBeUndefined();
  });
});
