import { describe, expect, it } from "vitest";

import {
  rankMessageFrameworks,
  type MessageFrameworkRanking
} from "@/lib/generation/message-spine";
import {
  selectWireframe,
  type WireframeSectionCount,
  type WireframeSelectionSignals,
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
  compileProductionMessageSpine,
  type CompileProductionMessageSpineInput
} from "./production-message-spine";

const sessionId = "session-production-spine";
const revision = 7;
const startedAt = "2026-08-22T18:00:00.000Z";
const completedAt = "2026-08-22T18:00:01.000Z";

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
    authority?: EvidenceAuthority;
    ref?: string;
    fieldRevision?: number;
  } = {}
): ReconciledLiveBriefField<K> {
  const authority = options.authority ?? "official";
  const ref = options.ref ?? `evidence:${key}`;
  return {
    revision: options.fieldRevision ?? revision,
    value,
    evidenceRefs: [ref],
    confidence: 0.9,
    provenance: [{
      authority,
      semanticRole: authority === "visitor" ? "visitor-edit" : "company-research",
      worker: authority === "visitor" ? "visitor" : "company-researcher",
      source: ref,
      observedAt: completedAt
    }],
    visitorEdited: authority === "visitor"
  };
}

function evidenceValue(options: {
  sparseOptional?: boolean;
  visitorOnlyOffer?: boolean;
  unsupportedPositioning?: boolean;
  fieldRevision?: number;
} = {}): MaterialLiveBriefEvidence {
  const offer = field(
    "offer",
    { label: "Acme Workflow Cloud", kind: "product" },
    {
      authority: options.visitorOnlyOffer ? "visitor" : "official",
      ref: options.visitorOnlyOffer ? "visitor:offer" : "official:offer",
      fieldRevision: options.fieldRevision
    }
  );
  const fields: MaterialLiveBriefEvidence["fields"] = {
    companyName: field("companyName", "Acme", {
      fieldRevision: options.fieldRevision
    }),
    canonicalDomain: field("canonicalDomain", "acme.example", {
      fieldRevision: options.fieldRevision
    }),
    offer,
    audience: field("audience", {
      label: "Operations leaders",
      buyerRole: "Operations leader",
      buyerJob: "evaluate workflow fit and implementation risk"
    }, {
      fieldRevision: options.fieldRevision
    }),
    objective: field("objective", "Evaluate workflow automation", {
      fieldRevision: options.fieldRevision
    }),
    cta: field("cta", {
      type: "book-meeting",
      label: "Plan a workflow review"
    }, {
      fieldRevision: options.fieldRevision
    })
  };

  if (!options.sparseOptional) {
    fields.company = field("company", "Acme builds workflow software.", {
      fieldRevision: options.fieldRevision
    });
    fields.category = field("category", "Workflow automation", {
      fieldRevision: options.fieldRevision
    });
    fields.positioning = field(
      "positioning",
      options.unsupportedPositioning
        ? "Make progress with confidence now more than ever."
        : "Acme connects governed workflow steps across operating teams.",
      { fieldRevision: options.fieldRevision }
    );
    fields.brandVisual = field("brandVisual", { radii: {} }, {
      fieldRevision: options.fieldRevision
    });
  }

  return {
    revision,
    fields,
    materialCompleteness: "complete",
    unresolvedFields: [],
    optionalEvidenceMissing: options.sparseOptional
      ? ["company", "category", "positioning", "brandVisual"]
      : [],
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
  sectionCount: WireframeSectionCount = 6,
  overrides: Partial<WireframeSelectionSignals> = {}
): WireframeSelectionV1 {
  return selectWireframe({
    family: "campaign",
    campaignType: "product",
    contentDensity: sectionCount === 4 ? "sparse" : sectionCount === 8 ? "rich" : "moderate",
    messageStructure: sectionCount === 8 ? "technical-sequence" : "problem-solution",
    proofAvailability: "limited",
    decisionComplexity: sectionCount === 8 ? "high" : "medium",
    sellerDensity: sectionCount === 8 ? "dense" : "balanced",
    sectionCount,
    ...overrides
  });
}

function compileInput(options: {
  evidence?: MaterialLiveBriefEvidence;
  selection?: WireframeSelectionV1;
  activeRevision?: number;
  evidenceArtifactRevision?: number;
} = {}): CompileProductionMessageSpineInput {
  const evidence = options.evidence ?? evidenceValue();
  const framework = frameworkValue();
  const selection = options.selection ?? selectionValue();
  return {
    sessionId,
    revision,
    activeRevision: options.activeRevision ?? revision,
    evidenceArtifact: artifact("evidence-reconciler", evidence, {
      revision: options.evidenceArtifactRevision ?? revision,
      evidenceRefs: Object.values(evidence.fields).flatMap(
        (item) => item?.evidenceRefs ?? []
      )
    }),
    frameworkArtifact: artifact("framework-ranker", framework),
    compositionArtifact: artifact("wireframe-ranker", selection),
    startedAt,
    completedAt
  };
}

describe("compileProductionMessageSpine", () => {
  it("compiles one complete internal argument and evidence-bounded section plan", () => {
    const result = compileProductionMessageSpine(compileInput());

    expect(result).toMatchObject({
      worker: "message-spine-architect",
      sessionId,
      revision,
      status: "complete",
      value: {
        version: 1,
        revision,
        visibility: "internal",
        composition: {
          sectionCount: 6
        }
      }
    });
    expect(Object.keys(result.value?.argument ?? {})).toEqual([
      "audience",
      "promise",
      "mechanism",
      "proofPlan",
      "decisionHelp",
      "nextAction"
    ]);
    expect(result.value?.framework.id).toBe(frameworkValue().selected.id);
    expect(result.value?.argument.promise.evidenceRefs).toEqual(
      expect.arrayContaining(["official:offer", "evidence:objective"])
    );
    expect(result.value?.sections).toHaveLength(6);
    expect(
      result.value?.sections.every(
        (section) =>
          section.evidenceRefs.length > 0 &&
          Array.isArray(section.unknowns) &&
          Array.isArray(section.omissions)
      )
    ).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(/<html|<style|className=/i);
  });

  it("keeps sparse optional evidence explicit without filling unsupported facts", () => {
    const result = compileProductionMessageSpine(
      compileInput({ evidence: evidenceValue({ sparseOptional: true }) })
    );

    expect(result.status).toBe("complete");
    expect(result.value?.argument.mechanism.unknowns).toContain(
      "The operating mechanism is not supported by current-revision evidence."
    );
    expect(result.value?.unknowns).toEqual(
      expect.arrayContaining([
        "No current-revision evidence for seller positioning.",
        "No current-revision evidence for seller brand visual evidence."
      ])
    );
    expect(result.value?.evidence.map(({ field: evidenceField }) => evidenceField)).not.toEqual(
      expect.arrayContaining(["company", "category", "positioning", "brandVisual"])
    );
  });

  it("omits unsupported tension and why-now instead of turning filler into claims", () => {
    const result = compileProductionMessageSpine(
      compileInput({
        evidence: evidenceValue({ unsupportedPositioning: true })
      })
    );

    expect(result.value?.argument.tension).toBeUndefined();
    expect(result.value?.argument.whyNow).toBeUndefined();
    expect(result.value?.omissions).toEqual(["tension", "whyNow"]);
    expect(
      result.value?.sections.find(({ role }) => role === "context")?.omissions
    ).toContain("tension");
  });

  it.each([4, 6, 8] as const)(
    "preserves the selected %i-section role order and word budgets",
    (sectionCount) => {
      const selection = selectionValue(sectionCount);
      const result = compileProductionMessageSpine(
        compileInput({ selection })
      );

      expect(result.value?.sections).toHaveLength(sectionCount);
      expect(
        result.value?.sections.map(({ role, wordBudget }) => ({
          role,
          wordBudget
        }))
      ).toEqual(
        selection.compositionPlan.sections.map(({ role, wordBudget }) => ({
          role,
          wordBudget
        }))
      );
      expect(result.value?.sections.at(-1)?.role).toBe("next-action");
      expect(result.value?.sections.map(({ order }) => order)).toEqual(
        Array.from({ length: sectionCount }, (_, index) => index + 1)
      );
    }
  );

  it.each([
    ["inactive input revision", { activeRevision: revision + 1 }],
    ["mismatched dependency revision", { evidenceArtifactRevision: revision - 1 }],
    [
      "nested stale field revision",
      { evidence: evidenceValue({ fieldRevision: revision - 1 }) }
    ]
  ] as const)("rejects %s", (_case, options) => {
    const result = compileProductionMessageSpine(
      compileInput(options)
    );

    expect(result).toMatchObject({
      status: "stale",
      errorCode: "production_message_spine_stale_revision",
      evidenceRefs: []
    });
    expect(result.value).toBeUndefined();
  });

  it("falls back to a validation plan when no declarative proof is available", () => {
    const result = compileProductionMessageSpine(
      compileInput({
        evidence: evidenceValue({
          sparseOptional: true,
          visitorOnlyOffer: true
        })
      })
    );

    expect(result).toMatchObject({
      status: "fallback",
      fallbackCode: "production_message_spine_no_proof_evidence"
    });
    expect(result.value?.argument.proofPlan).toMatchObject({
      evidenceRefs: [],
      unknowns: expect.arrayContaining([
        "No current-revision official or public offer proof is available.",
        "Quantified outcomes and customer claims must be omitted."
      ])
    });
    expect(result.value?.argument.proofPlan.directive).toMatch(
      /validation plan instead of declarative proof/i
    );
    const proofSection = result.value?.sections.find(
      ({ role }) => role === "proof"
    );
    expect(proofSection?.evidenceRefs).toEqual([]);
    expect(proofSection?.unknowns).toContain(
      "Quantified outcomes and customer claims must be omitted."
    );
  });
});
