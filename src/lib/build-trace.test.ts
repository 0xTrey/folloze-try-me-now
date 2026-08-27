import { describe, expect, it } from "vitest";

import {
  BUILD_TRACE_MAX_SECTIONS,
  BUILD_TRACE_PIPELINE_VERSION,
  BuildTraceBuilder,
  buildTraceCode,
  buildTraceCorrelationKey,
  buildTraceDigest,
  buildTraceEvidenceRef,
  buildTraceSourceUrlHash,
  buildTraceSupportRefHash,
  canonicalJson,
  findBuildTracePrivacyViolations,
  isPrivateSafeBuildTrace,
  isUnsafeTraceString,
  normalizeAssetAllocationTrace,
  normalizeBrandDecisionTrace,
  normalizeQualityTrace,
  normalizeRankedDecisionTrace,
  normalizeSectionBuildTrace,
  parseBuildTrace
} from "@/lib/build-trace";

const TRACE_ID = "trace_0123456789abcdef";
const SESSION_ID = "session_0123456789";
const ATTEMPT_ID = "attempt_0123456789";

function builder(): BuildTraceBuilder {
  return new BuildTraceBuilder({
    traceId: TRACE_ID,
    sessionId: SESSION_ID,
    attemptId: ATTEMPT_ID,
    revision: 3,
    startedAt: "2026-08-27T10:00:00.000Z",
    supportRef: "TMN-ABCDEF123456"
  });
}

function populated(): BuildTraceBuilder {
  const trace = builder();
  trace.recordTiming({
    stage: "evidence",
    startedAt: "2026-08-27T10:00:00.000Z",
    completedAt: "2026-08-27T10:00:02.000Z",
    status: "completed"
  });
  trace.recordDecision(
    "framework",
    normalizeRankedDecisionTrace({
      decision: "framework",
      version: "framework-ranker-v1",
      selectedCandidateId: "problem-change",
      candidates: [
        { candidateId: "problem-change", score: 0.82, reasonCodes: ["proof_rich"] },
        { candidateId: "technical-validation", score: 0.44, reasonCodes: ["sparse_proof"] }
      ],
      evidenceRefs: [trace.ref("official:company:category")],
      confidence: 0.82,
      reasonCodes: ["decision_complexity_medium"]
    })
  );
  trace.recordBrandDecision(
    normalizeBrandDecisionTrace({
      readiness: "partial",
      confidence: 0.71,
      roles: [
        {
          role: "primary",
          valueDigest: buildTraceDigest("#0265DC"),
          sourceAuthority: "official_dom",
          candidateCount: 4,
          confidence: 0.8,
          selectionReasons: ["component_role_action", "area_weighted"],
          evidenceRefs: [trace.ref("official:dom:home")]
        }
      ],
      warnings: ["geometry_sparse"],
      evidenceRefs: [trace.ref("official:dom:home")]
    })
  );
  trace.recordSection(
    normalizeSectionBuildTrace({
      sectionId: "hero",
      role: "hero",
      promptVersion: "section-writer-v1.2.0",
      templateVersion: "launch-hero-v1",
      writerMode: "deterministic",
      inputEvidenceRefs: [trace.ref("visitor:offer")],
      inputDigest: buildTraceDigest({ role: "hero" }),
      candidateDigests: [buildTraceDigest("a"), buildTraceDigest("b")],
      selectedCandidate: 0,
      selectionReasons: ["specificity", "evidence_coverage"],
      outputDigest: buildTraceDigest("accepted"),
      quality: { specificity: 0.78, withinWordBudget: true, verdict: "accepted" },
      startedAt: "2026-08-27T10:00:03.000Z",
      completedAt: "2026-08-27T10:00:04.000Z",
      status: "completed"
    })
  );
  trace.recordQuality(
    normalizeQualityTrace({
      dimension: "semantic_palette",
      score: 0.86,
      warnings: ["accent_low_chroma"],
      violations: [],
      evidenceRefs: [trace.ref("official:dom:home")]
    })
  );
  trace.recordFallback({
    stage: "writer-wave",
    code: "provider_unavailable",
    scope: "section",
    at: "2026-08-27T10:00:05.000Z",
    sectionId: "proof"
  });
  return trace;
}

describe("build trace schema", () => {
  it("round-trips a populated trace through the strict decoder", () => {
    const trace = populated().build({
      terminalStatus: "completed",
      completedAt: "2026-08-27T10:00:10.000Z"
    });
    const decoded = parseBuildTrace(JSON.parse(JSON.stringify(trace)));

    expect(decoded).toEqual(trace);
    expect(decoded?.schemaVersion).toBe(1);
    expect(decoded?.pipelineVersion).toBe(BUILD_TRACE_PIPELINE_VERSION);
    expect(decoded?.supportRefHash).toMatch(/^sr_[a-f0-9]{20}$/);
  });

  it("rejects an unknown schema version and unknown top-level keys", () => {
    const trace = populated().build({ terminalStatus: "completed" });

    expect(parseBuildTrace({ ...trace, schemaVersion: 2 })).toBeUndefined();
    expect(parseBuildTrace({ ...trace, rawPrompt: "write a hero" })).toBeUndefined();
    expect(parseBuildTrace({ ...trace, decisions: { copy: {} } })).toBeUndefined();
  });

  it("decodes a minimal legacy-shaped trace without optional decisions", () => {
    const trace = builder().build({ terminalStatus: "needs_input" });

    expect(parseBuildTrace(trace)).toEqual(trace);
    expect(trace.decisions).toEqual({});
    expect(trace.sections).toEqual([]);
  });

  it("keeps evidence references opaque and deduplicated", () => {
    const trace = builder();
    trace.refs(["official:dom:home", "official:dom:home", "visitor:offer"]);
    const built = trace.build({ terminalStatus: "completed" });

    expect(built.evidenceRefs).toHaveLength(2);
    expect(built.evidenceRefs.every((ref) => /^ev_[a-f0-9]{20}$/.test(ref))).toBe(true);
    expect(built.evidenceRefs.join()).not.toContain("official");
  });

  it("bounds the recorded section count", () => {
    const trace = builder();
    for (let index = 0; index < BUILD_TRACE_MAX_SECTIONS + 6; index += 1) {
      trace.recordSection(
        normalizeSectionBuildTrace({
          sectionId: `section-${index}`,
          role: "supporting",
          writerMode: "deterministic",
          inputDigest: buildTraceDigest(index),
          selectedCandidate: 0,
          outputDigest: buildTraceDigest(index),
          startedAt: "2026-08-27T10:00:00.000Z",
          completedAt: "2026-08-27T10:00:01.000Z",
          status: "completed"
        })
      );
    }

    expect(trace.build({ terminalStatus: "completed" }).sections).toHaveLength(
      BUILD_TRACE_MAX_SECTIONS
    );
  });
});

describe("deterministic digests", () => {
  it("produces identical digests for structurally equal values in any key order", () => {
    expect(buildTraceDigest({ a: 1, b: [2, 3] })).toBe(buildTraceDigest({ b: [2, 3], a: 1 }));
    expect(canonicalJson({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
  });

  it("produces different digests for different values", () => {
    expect(buildTraceDigest("hero copy a")).not.toBe(buildTraceDigest("hero copy b"));
    expect(buildTraceDigest("x")).toMatch(/^dg_[a-f0-9]{32}$/);
  });

  it("scopes evidence, source, support, and correlation hashes one-way", () => {
    const left = buildTraceEvidenceRef("trace_a1b2c3d4", "official:dom:home");
    const right = buildTraceEvidenceRef("trace_e5f6a7b8", "official:dom:home");

    expect(left).not.toBe(right);
    expect(buildTraceSourceUrlHash(TRACE_ID, "https://example.com/a.png")).toMatch(
      /^sh_[a-f0-9]{20}$/
    );
    expect(buildTraceSupportRefHash("TMN-ABCDEF123456")).toMatch(/^sr_[a-f0-9]{20}$/);
    expect(buildTraceCorrelationKey(TRACE_ID, ATTEMPT_ID)).toMatch(/^ck_[a-f0-9]{20}$/);
    expect(buildTraceCorrelationKey(TRACE_ID, ATTEMPT_ID)).not.toContain(TRACE_ID);
  });

  it("is stable across repeated builds of the same inputs", () => {
    expect(populated().build({ terminalStatus: "completed" })).toEqual(
      populated().build({ terminalStatus: "completed" })
    );
  });
});

describe("build trace privacy boundary", () => {
  const forbidden: Array<[string, string]> = [
    ["business email", "buyer@example.com"],
    ["source url", "https://www.servicetitan.com/pricing?utm=1"],
    ["bare domain", "servicetitan.com"],
    ["generated copy", "Cut truck rolls with connected dispatch"],
    ["raw html", "<section class=\"hero\">Hero</section>"],
    ["model prompt", "You are a section writer. Return two candidates."],
    ["bearer token", "Bearer abcdef0123456789"],
    ["provider key", "sk-proj-abcdefghijklmnop"],
    ["github token", "ghp_abcdefghijklmnopqrstuvwxyz0123"]
  ];

  it.each(forbidden)("treats a raw %s as unsafe", (_label, value) => {
    expect(isUnsafeTraceString(value)).toBe(true);
  });

  it.each(forbidden)("never lets a raw %s survive code normalization", (_label, value) => {
    const code = buildTraceCode(value);

    expect(isUnsafeTraceString(code)).toBe(false);
    expect(code).not.toContain("@");
    expect(code).not.toContain("://");
    expect(code).not.toContain("<");
  });

  it("flags a trace that smuggles private material into any field", () => {
    const trace = populated().build({ terminalStatus: "completed" });
    const leaked = {
      ...trace,
      quality: [
        {
          ...trace.quality[0]!,
          warnings: ["https://www.servicetitan.com/pricing"]
        }
      ]
    };

    const violations = findBuildTracePrivacyViolations(leaked);
    expect(violations).toHaveLength(1);
    expect(violations[0]?.reason).toBe("unsafe_string");
    expect(parseBuildTrace(leaked)).toBeUndefined();
  });

  it("flags a leaked email inside a nested section quality map", () => {
    const trace = populated().build({ terminalStatus: "completed" });
    const leaked = {
      ...trace,
      sections: [{ ...trace.sections[0]!, quality: { reviewer: "ops@example.com" } }]
    };

    expect(isPrivateSafeBuildTrace(leaked)).toBe(false);
    expect(parseBuildTrace(leaked)).toBeUndefined();
  });

  it("accepts a fully normalized trace", () => {
    const trace = populated().build({
      terminalStatus: "completed",
      completedAt: "2026-08-27T10:00:10.000Z"
    });

    expect(findBuildTracePrivacyViolations(trace)).toEqual([]);
    expect(isPrivateSafeBuildTrace(trace)).toBe(true);
  });

  it("keeps timestamps and version strings out of the hostname heuristic", () => {
    expect(isUnsafeTraceString("2026-08-27T10:00:00.000Z")).toBe(false);
    expect(isUnsafeTraceString("try-me-build-v1.1.0")).toBe(false);
    expect(isUnsafeTraceString("section-writer-v1.2.0")).toBe(false);
  });

  it("normalizes an unsafe writer model label rather than storing it raw", () => {
    const section = normalizeSectionBuildTrace({
      sectionId: "hero",
      role: "hero",
      writerMode: "model",
      model: "gpt-5-mini",
      inputDigest: buildTraceDigest("x"),
      selectedCandidate: 1,
      outputDigest: buildTraceDigest("y"),
      startedAt: "2026-08-27T10:00:00.000Z",
      completedAt: "2026-08-27T10:00:01.000Z",
      status: "completed"
    });

    expect(section.model).toBe("gpt-5-mini");
    expect(section.writerMode).toBe("model");
    expect(isPrivateSafeBuildTrace({ section })).toBe(true);
  });
});

describe("decision and allocation normalizers", () => {
  it("orders ranked candidates by score and marks the selected one", () => {
    const decision = normalizeRankedDecisionTrace({
      decision: "wireframe",
      selectedCandidateId: "guide",
      candidates: [
        { candidateId: "launch", score: 0.3 },
        { candidateId: "guide", score: 0.9 },
        { candidateId: "align", score: 0.5 }
      ],
      confidence: 0.9
    });

    expect(decision.candidates.map(({ candidateId }) => candidateId)).toEqual([
      "guide",
      "align",
      "launch"
    ]);
    expect(decision.candidates[0]?.selected).toBe(true);
    expect(decision.candidates[1]?.selected).toBe(false);
  });

  it("counts substantive and reusable allocations separately", () => {
    const allocation = normalizeAssetAllocationTrace({
      allocations: [
        {
          allocationKey: "hero-1",
          sectionId: "hero",
          semanticRole: "hero",
          assetDigest: buildTraceDigest("a"),
          evidenceRef: buildTraceEvidenceRef(TRACE_ID, "asset:a"),
          sourceUrlHash: buildTraceSourceUrlHash(TRACE_ID, "https://example.com/a.png"),
          purpose: "product",
          reusable: false,
          score: 0.8
        },
        {
          allocationKey: "logo-1",
          sectionId: "nav",
          semanticRole: "logo",
          assetDigest: buildTraceDigest("logo"),
          evidenceRef: buildTraceEvidenceRef(TRACE_ID, "asset:logo"),
          sourceUrlHash: buildTraceSourceUrlHash(TRACE_ID, "https://example.com/logo.svg"),
          purpose: "logo",
          reusable: true,
          score: 0.95
        }
      ],
      rejectedCount: 4,
      rejectionReasons: ["tiny", "data_uri", "duplicate_crop"]
    });

    expect(allocation.substantiveCount).toBe(1);
    expect(allocation.reusableCount).toBe(1);
    expect(allocation.rejectedCount).toBe(4);
    expect(isPrivateSafeBuildTrace({ allocation })).toBe(true);
  });

  it("never marks a quality trace as blocking", () => {
    const quality = normalizeQualityTrace({
      dimension: "imagery",
      score: 0.1,
      violations: ["duplicate_substantive_asset"]
    });

    expect(quality.blocking).toBe(false);
  });
});
