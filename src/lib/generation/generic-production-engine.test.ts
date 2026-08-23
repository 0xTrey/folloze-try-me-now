import { describe, expect, it } from "vitest";

import type { BrandSystemV2 } from "@/lib/brand-system";
import { writeOpeningSections } from "@/lib/generation/opening-section-writer";
import {
  compileProductionMessageSpine,
  type ProductionMessageSpine
} from "@/lib/generation/production-message-spine";
import {
  sectionCopyWordCount,
  type SectionWriterArtifact,
  type SectionWriterInput,
  type SectionWriterKind
} from "@/lib/generation/section-copy-types";
import {
  rankMessageFrameworks,
  type MessageFrameworkRanking
} from "@/lib/generation/message-spine";
import {
  selectWireframe,
  type WireframeSectionCount,
  type WireframeSelectionV1
} from "@/lib/generation/wireframe-library";
import type {
  ProductionArtifact,
  WorkerKind
} from "@/lib/orchestration/worker-types";
import type {
  EvidenceAuthority,
  LiveBriefEvidenceField,
  LiveBriefEvidenceValueMap,
  MaterialLiveBriefEvidence,
  ReconciledLiveBriefField
} from "@/lib/research/evidence-reconciler";

import {
  compileGenericProductionPage,
  GENERIC_PRODUCTION_HARD_DEADLINE_MS,
  type GenericProductionEngineInput
} from "./generic-production-engine";

const sessionId = "session-generic-production";
const revision = 12;
const startedAt = "2026-08-22T19:00:00.000Z";
const completedAt = "2026-08-22T19:00:01.000Z";

function artifact<T>(
  worker: WorkerKind,
  value: T,
  overrides: Partial<ProductionArtifact<T>> = {}
): ProductionArtifact<T> {
  return {
    worker,
    sessionId,
    revision,
    status: "complete",
    value,
    evidenceRefs: [],
    confidence: 0.9,
    startedAt,
    completedAt,
    ...overrides
  };
}

function field<K extends LiveBriefEvidenceField>(
  key: K,
  value: LiveBriefEvidenceValueMap[K],
  options: {
    ref?: string;
    authority?: EvidenceAuthority;
    fieldRevision?: number;
  } = {}
): ReconciledLiveBriefField<K> {
  const ref = options.ref ?? `official:${key}`;
  const authority = options.authority ?? "official";
  return {
    revision: options.fieldRevision ?? revision,
    value,
    evidenceRefs: [ref],
    confidence: 0.9,
    provenance: [{
      authority,
      semanticRole:
        key === "offer"
          ? "offer"
          : key === "audience"
            ? "audience-strategy"
            : key === "objective" || key === "cta"
              ? "objective-cta"
              : "company-research",
      worker:
        key === "offer"
          ? "offer-researcher"
          : key === "audience"
            ? "audience-strategist"
            : key === "objective" || key === "cta"
              ? "objective-cta-strategist"
              : "company-researcher",
      source: ref,
      observedAt: completedAt
    }],
    visitorEdited: authority === "visitor"
  };
}

function evidenceValue(): MaterialLiveBriefEvidence {
  const fields: MaterialLiveBriefEvidence["fields"] = {
    companyName: field("companyName", "Acme"),
    canonicalDomain: field("canonicalDomain", "acme.example"),
    company: field("company", "Acme builds governed workflow software."),
    category: field("category", "Workflow automation"),
    positioning: field(
      "positioning",
      "Acme connects governed workflow steps across operating teams."
    ),
    offer: field(
      "offer",
      { label: "Acme Workflow Cloud", kind: "product" },
      { ref: "official:offer" }
    ),
    audience: field(
      "audience",
      {
        label: "Operations leaders",
        buyerRole: "Operations leader",
        buyerJob: "evaluate workflow fit and implementation risk"
      },
      { ref: "official:audience" }
    ),
    objective: field(
      "objective",
      "Evaluate workflow automation",
      { ref: "visitor:objective", authority: "visitor" }
    ),
    cta: field(
      "cta",
      { type: "book-meeting", label: "Plan a workflow review" },
      { ref: "visitor:cta", authority: "visitor" }
    ),
    brandVisual: field("brandVisual", {
      radii: { controlPx: 4, cardPx: 8 },
      density: "balanced",
      hero: "type-led",
      imagery: { style: "none", composition: "absent" }
    })
  };
  return {
    revision,
    fields,
    materialCompleteness: "complete",
    unresolvedFields: [],
    optionalEvidenceMissing: [],
    conflicts: []
  };
}

function frameworkValue(): MessageFrameworkRanking {
  return rankMessageFrameworks({
    motion: "product",
    audience: "Operations leaders",
    objective: "Evaluate workflow automation",
    cta: "Plan a workflow review",
    offerMaturity: "confirmed",
    proofDensity: "moderate",
    contentVolume: "standard",
    decisionComplexity: "medium"
  });
}

function selectionValue(
  sectionCount: WireframeSectionCount = 6
): WireframeSelectionV1 {
  return selectWireframe(
    {
      family: "campaign",
      campaignType: "product",
      contentDensity: sectionCount === 4 ? "sparse" : "moderate",
      messageStructure: "problem-solution",
      proofAvailability: "limited",
      decisionComplexity: "medium",
      sellerDensity: "balanced",
      sectionCount,
      assetQuality: "none",
      sellerLogoAvailable: false
    },
    { selectedBy: "system", locked: true }
  );
}

function brandValue(): BrandSystemV2 {
  const evidence = <T>(value: T, source: string) => ({
    value,
    source,
    confidence: 0.9,
    observedAt: completedAt,
    revision
  });
  return {
    revision,
    identity: {
      name: "Acme",
      canonicalDomain: "acme.example",
      aliases: []
    },
    logo: { status: "missing", confidence: 0 },
    colorRoles: {
      ink: evidence("#111111", "official:ink"),
      surface: evidence("#FFFFFF", "official:surface"),
      accent: evidence("#111111", "official:accent"),
      action: evidence("#111111", "official:action"),
      support: evidence<string[]>([], "official:support")
    },
    typography: {
      display: {
        ...evidence("Arial", "official:display-font"),
        portable: true
      },
      body: {
        ...evidence("Arial", "official:body-font"),
        portable: true
      }
    },
    geometry: {
      controlRadius: 4,
      cardRadius: 8,
      borderWidth: 1,
      shadow: "none"
    },
    layout: {
      maxWidth: 1200,
      density: "balanced",
      navStyle: "minimal",
      heroStyle: "type-led"
    },
    imagery: {
      style: "type-led",
      candidates: [],
      selected: []
    },
    motion: {
      style: "none",
      durationRangeMs: [0, 0]
    },
    readiness: "needs_input",
    confidence: 0.9,
    evidenceRefs: [
      "official:ink",
      "official:surface",
      "official:display-font"
    ]
  };
}

function spineArtifact(
  evidence: MaterialLiveBriefEvidence,
  selection: WireframeSelectionV1,
  options: { supportedTension?: boolean } = {}
): ProductionArtifact<ProductionMessageSpine> {
  const result = compileProductionMessageSpine({
    sessionId,
    revision,
    activeRevision: revision,
    evidenceArtifact: artifact("evidence-reconciler", evidence, {
      evidenceRefs: Object.values(evidence.fields).flatMap(
        (item) => item?.evidenceRefs ?? []
      )
    }),
    frameworkArtifact: artifact("framework-ranker", frameworkValue()),
    compositionArtifact: artifact("wireframe-ranker", selection),
    startedAt,
    completedAt
  });
  if (!options.supportedTension || !result.value) return result;

  const value = structuredClone(result.value);
  value.argument.tension = {
    directive: "Review the supported workflow constraint before choosing a path.",
    evidenceRefs: ["official:company"],
    unknowns: []
  };
  const context = value.sections.find((section) => section.role === "context");
  if (context) {
    context.argumentRoles = [
      "tension",
      ...context.argumentRoles.filter((role) => role !== "tension")
    ];
    context.evidenceRefs = [
      "official:company",
      ...context.evidenceRefs.filter((ref) => ref !== "official:company")
    ];
    context.omissions = context.omissions.filter((role) => role !== "tension");
  }
  value.omissions = value.omissions.filter((role) => role !== "tension");
  return { ...result, value };
}

function engineInput(options: {
  sectionCount?: WireframeSectionCount;
  supportedTension?: boolean;
  activeRevision?: number;
  currentTimeMs?: number;
} = {}): GenericProductionEngineInput {
  const evidence = evidenceValue();
  const selection = selectionValue(options.sectionCount);
  const messageSpine = spineArtifact(evidence, selection, {
    supportedTension: options.supportedTension ?? true
  });
  return {
    sessionId,
    revision,
    activeRevision: options.activeRevision ?? revision,
    startedAt,
    completedAt,
    providerWindow: {
      startedAtMs: 0,
      currentTimeMs: options.currentTimeMs ?? 10_000
    },
    evidenceArtifact: artifact("evidence-reconciler", evidence, {
      evidenceRefs: Object.values(evidence.fields).flatMap(
        (item) => item?.evidenceRefs ?? []
      )
    }),
    brandArtifact: artifact("brand-compiler", brandValue(), {
      evidenceRefs: brandValue().evidenceRefs
    }),
    compositionArtifact: artifact("wireframe-ranker", selection),
    messageSpineArtifact: messageSpine,
    allowVisualRepair: true
  };
}

function failedWriter(
  worker: SectionWriterKind
): (input: SectionWriterInput) => SectionWriterArtifact {
  return (input) => ({
    worker,
    sessionId: input.sessionId,
    revision: input.revision,
    status: "failed",
    evidenceRefs: [],
    confidence: 0,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    errorCode: `${worker}_fixture_failure`
  });
}

describe("compileGenericProductionPage", () => {
  it("compiles complete Wave 1-3 artifacts through all five writers and the editor", async () => {
    const result = await compileGenericProductionPage(engineInput());

    expect(result.outcome).toBe("production-page");
    if (result.outcome !== "production-page") return;
    expect(result.artifact).toMatchObject({
      worker: "spec-compiler-qa",
      sessionId,
      revision,
      status: "complete"
    });
    expect(result.artifact.value?.sections).toHaveLength(6);
    expect(
      result.workerReceipts.filter(({ worker }) =>
        [
          "opening-writer",
          "problem-urgency-writer",
          "exploration-writer",
          "mechanism-proof-writer",
          "team-cta-writer"
        ].includes(worker)
      )
    ).toHaveLength(5);
    expect(
      result.compileReceipts.map(({ stage }) => stage)
    ).toEqual([
      "artifact-validation",
      "provider-deadline",
      "writer-wave",
      "factuality",
      "section-compile",
      "final-reveal"
    ]);
  });

  it("emits reconstructable privacy-safe worker and reveal receipts", async () => {
    const result = await compileGenericProductionPage(engineInput());

    expect(result.outcome).toBe("production-page");
    if (result.outcome !== "production-page") return;
    expect(result.workerReceipts.length).toBeGreaterThanOrEqual(10);
    expect(result.workerReceipts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          worker: "spec-compiler-qa",
          status: "completed",
          durationMs: 1000,
          dependencies: expect.arrayContaining([
            "brand-compiler",
            "message-spine-architect",
            "wireframe-ranker",
            "copy-factuality-editor"
          ])
        })
      ])
    );
    expect(result.compileReceipts.at(-1)).toMatchObject({
      stage: "final-reveal",
      status: "completed",
      sessionId,
      revision,
      detailCode: "current_revision_final_reveal",
      artifactCount: 1
    });

    const operationalTrace = JSON.stringify({
      workers: result.workerReceipts,
      compile: result.compileReceipts,
      reveal: result.artifact.value?.reveal
    });
    expect(operationalTrace).not.toMatch(
      /acme\.example|Acme Workflow Cloud|Operations leaders|https?:\/\/|buyer@example/i
    );
  });

  it("discards writer results when the active revision changes in flight", async () => {
    let currentRevision = revision;
    const result = await compileGenericProductionPage(engineInput(), {
      writers: {
        "opening-writer": async (input) => {
          const result = writeOpeningSections(input);
          currentRevision = revision + 1;
          return result;
        }
      },
      currentRevision: () => currentRevision
    });

    expect(result).toMatchObject({
      outcome: "safe-deterministic-fallback",
      instruction: {
        code: "GPE_STALE_REVISION",
        action: "discard_stale_result",
        allowProviderWork: false
      }
    });
    expect(
      result.workerReceipts.some(({ worker }) =>
        worker === "opening-writer"
      )
    ).toBe(true);
  });

  it("starts no writer or optional repair at the 60-second boundary", async () => {
    const result = await compileGenericProductionPage(
      engineInput({ currentTimeMs: GENERIC_PRODUCTION_HARD_DEADLINE_MS })
    );

    expect(result).toMatchObject({
      outcome: "safe-deterministic-fallback",
      instruction: {
        code: "GPE_PROVIDER_DEADLINE_REACHED",
        action: "reveal_existing_current_revision",
        visualRepairAllowed: false
      }
    });
    expect(
      result.workerReceipts.some(({ worker }) =>
        worker === "opening-writer"
      )
    ).toBe(false);
  });

  it("keeps a coherent page when one writer fails and four sections survive", async () => {
    const result = await compileGenericProductionPage(engineInput(), {
      writers: {
        "problem-urgency-writer": failedWriter("problem-urgency-writer")
      }
    });

    expect(result.outcome).toBe("production-page");
    if (result.outcome !== "production-page") return;
    expect(result.artifact.status).toBe("fallback");
    expect(result.artifact.value?.sections).toHaveLength(5);
    expect(
      result.workerReceipts.find(
        ({ worker }) => worker === "problem-urgency-writer"
      )?.status
    ).toBe("failed");
  });

  it("uses the safe fallback when multiple writer failures break coherence", async () => {
    const result = await compileGenericProductionPage(engineInput(), {
      writers: {
        "problem-urgency-writer": failedWriter("problem-urgency-writer"),
        "mechanism-proof-writer": failedWriter("mechanism-proof-writer")
      }
    });

    expect(result).toMatchObject({
      outcome: "safe-deterministic-fallback",
      instruction: {
        code: "GPE_MINIMUM_SECTIONS_UNAVAILABLE",
        action: "compile_safe_deterministic_experience_spec"
      }
    });
  });

  it("rejects a four-slot composition when a failed writer leaves fewer than four", async () => {
    const result = await compileGenericProductionPage(
      engineInput({ sectionCount: 4 }),
      {
        writers: {
          "problem-urgency-writer": failedWriter("problem-urgency-writer")
        }
      }
    );

    expect(result).toMatchObject({
      outcome: "safe-deterministic-fallback",
      instruction: { code: "GPE_MINIMUM_SECTIONS_UNAVAILABLE" }
    });
  });

  it("selects an intentional type-led result when no imagery exists", async () => {
    const result = await compileGenericProductionPage(engineInput());

    expect(result.outcome).toBe("production-page");
    if (result.outcome !== "production-page") return;
    expect(result.artifact.value?.mediaIntent).toBe("type-led");
    expect(result.artifact.value?.brand.imagery.candidates).toEqual([]);
    expect(result.artifact.value?.sections).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ body: expect.stringMatching(/empty image|placeholder/i) })
      ])
    );
  });

  it("omits unsupported urgency rather than inventing a timing claim", async () => {
    const result = await compileGenericProductionPage(
      engineInput({ supportedTension: false })
    );

    expect(result.outcome).toBe("production-page");
    if (result.outcome !== "production-page") return;
    const visibleCopy = result.artifact.value?.sections
      .flatMap((section) => [section.headline, section.body])
      .filter(Boolean)
      .join(" ");
    expect(visibleCopy).not.toMatch(
      /act now|last chance|limited time|now more than ever|urgency is rising/i
    );
    expect(result.artifact.value?.omissions).toEqual(
      expect.arrayContaining(["tension", "whyNow"])
    );
    expect(
      result.artifact.value?.sections.some(({ role }) => role === "context")
    ).toBe(false);
    expect(result.artifact.value?.framework).toBeDefined();
  });

  it("rejects an opening section with unsupported urgency during factuality review", async () => {
    const result = await compileGenericProductionPage(engineInput(), {
      writers: {
        "opening-writer": (input) => {
          const artifact = writeOpeningSections(input);
          if (!artifact.value?.[0]) return artifact;
          const candidate = {
            ...artifact.value[0],
            body: `${artifact.value[0].body} Act now before it's too late.`
          };
          candidate.wordCount = sectionCopyWordCount(candidate);
          return {
            ...artifact,
            value: [candidate],
            evidenceRefs: [...candidate.evidenceRefs]
          };
        }
      }
    });

    expect(result).toMatchObject({
      outcome: "safe-deterministic-fallback",
      instruction: { code: "GPE_MINIMUM_SECTIONS_UNAVAILABLE" }
    });
    expect(
      result.workerReceipts.find(
        ({ worker }) => worker === "copy-factuality-editor"
      )?.status
    ).toBe("fallback");
  });

  it("reveals only the current revision and grants at most one unperformed repair", async () => {
    const result = await compileGenericProductionPage(engineInput(), {
      currentRevision: () => revision
    });

    expect(result.outcome).toBe("production-page");
    if (result.outcome !== "production-page") return;
    expect(result.artifact.value?.reveal).toEqual({
      state: "final",
      revision,
      currentRevisionOnly: true
    });
    expect(result.artifact.value?.visualRepair).toEqual({
      allowedAttempts: 1,
      performedAttempts: 0,
      instruction: "manager_may_run_one_bounded_visual_repair"
    });
    expect(
      result.compileReceipts.at(-1)
    ).toMatchObject({
      stage: "final-reveal",
      status: "completed",
      detailCode: "current_revision_final_reveal"
    });
  });
});
