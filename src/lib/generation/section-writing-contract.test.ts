import { describe, expect, it } from "vitest";

import {
  buildSectionWritingContracts,
  containsBannedInternalPhrase,
  sectionContractDigestSource,
  SECTION_CANDIDATES_PER_SLOT,
  SECTION_PROMPT_REGISTRY,
  SECTION_PROMPT_REGISTRY_VERSION
} from "@/lib/generation/section-writing-contract";
import type { SectionEvidenceClaim, SectionWriterBrief } from "@/lib/generation/section-copy-types";
import type {
  SectionRoleV2,
  SectionSlotV2,
  WireframeDecisionV2
} from "@/lib/generation/three-family-contract";

const revision = 3;

const brief: SectionWriterBrief = {
  audience: "Regional carrier operations leaders",
  promise: "Cut unplanned dwell time",
  mechanism: "Live yard telemetry with exception routing",
  proofPlan: "Published carrier dwell benchmark",
  decisionHelp: "Compare against your current dispatch workflow",
  nextAction: "Book a working session",
  unknowns: []
};

function evidence(): SectionEvidenceClaim[] {
  return [
    {
      id: "ev-seller-1",
      text: "Dispatch teams recover 4 hours per week after enabling exception routing.",
      confidence: 0.9,
      revision,
      sourceRole: "seller"
    },
    {
      id: "ev-source-1",
      text: "Carrier dwell benchmark reports 18% average idle time.",
      confidence: 0.8,
      revision,
      sourceRole: "source"
    },
    {
      id: "ev-stale-1",
      text: "Superseded claim from an earlier revision.",
      confidence: 0.9,
      revision: revision - 1,
      sourceRole: "seller"
    }
  ];
}

function slot(
  id: string,
  role: SectionRoleV2,
  overrides: Partial<SectionSlotV2> = {}
): SectionSlotV2 {
  return {
    id,
    role,
    navigationLabel: id,
    buyerJob: `Understand ${id}`,
    claimType: "fact",
    requiredEvidenceKinds: ["seller_fact"],
    optional: false,
    wordBudget: { headline: [6, 12], body: [20, 60] },
    visualRole: "evidence-type",
    ...overrides
  } as SectionSlotV2;
}

function decision(sectionPlan: readonly SectionSlotV2[]): WireframeDecisionV2 {
  return {
    version: 2,
    sessionId: "contract-fixture",
    revision,
    family: "launch",
    subtype: "solution",
    confidence: "high",
    factors: [],
    evidenceRefs: ["ev-seller-1"],
    sectionPlan,
    reasonCode: "fixture",
    locked: true
  } as WireframeDecisionV2;
}

describe("section writing contracts", () => {
  it("covers every section role with a distinct versioned prompt", () => {
    const specs = Object.values(SECTION_PROMPT_REGISTRY);
    const versions = specs.map(({ version }) => version);
    const objectives = specs.map(({ objective }) => objective);

    expect(new Set(versions).size).toBe(versions.length);
    expect(new Set(objectives).size).toBe(objectives.length);
    expect(specs.every(({ directives }) => directives.length >= 3)).toBe(true);
    expect(specs.every(({ allowedClaimTypes }) => allowedClaimTypes.length > 0)).toBe(true);
  });

  it("restricts a proof section to factual claims only", () => {
    expect(SECTION_PROMPT_REGISTRY.proof.allowedClaimTypes).toEqual(["fact"]);
    expect(SECTION_PROMPT_REGISTRY["account-relevance"].allowedClaimTypes).toEqual(["fact"]);
  });

  it("builds one contract per locked section, in plan order", () => {
    const contracts = buildSectionWritingContracts({
      sessionId: "contract-fixture",
      revision,
      decision: decision([
        slot("opening", "buyer-outcome"),
        slot("friction", "current-friction"),
        slot("close", "next-move", { requiredEvidenceKinds: [] })
      ]),
      brief,
      evidence: evidence()
    });

    expect(contracts.map(({ sectionId }) => sectionId)).toEqual([
      "opening",
      "friction",
      "close"
    ]);
    expect(contracts.map(({ order }) => order)).toEqual([0, 1, 2]);
    expect(contracts.every(({ registryVersion }) =>
      registryVersion === SECTION_PROMPT_REGISTRY_VERSION
    )).toBe(true);
    expect(contracts.every(({ candidateCount }) =>
      candidateCount === SECTION_CANDIDATES_PER_SLOT
    )).toBe(true);
    expect(contracts[0]!.prompt.version).toBe(SECTION_PROMPT_REGISTRY["buyer-outcome"].version);
  });

  it("scopes evidence to the kinds a slot declares and drops stale revisions", () => {
    const contracts = buildSectionWritingContracts({
      sessionId: "contract-fixture",
      revision,
      decision: decision([
        slot("opening", "buyer-outcome", { requiredEvidenceKinds: ["seller_fact"] }),
        slot("proof", "proof", { requiredEvidenceKinds: ["proof"] }),
        slot("close", "next-move", { requiredEvidenceKinds: [] })
      ]),
      brief,
      evidence: evidence()
    });

    expect(contracts[0]!.evidenceRefs).toEqual(["ev-seller-1"]);
    expect(contracts[1]!.evidenceRefs).toEqual(["ev-source-1"]);
    expect(contracts[2]!.evidenceRefs).toEqual([]);
    expect(contracts.flatMap(({ evidenceRefs }) => evidenceRefs)).not.toContain("ev-stale-1");
  });

  it("produces no contracts for a stale wireframe decision", () => {
    const contracts = buildSectionWritingContracts({
      sessionId: "contract-fixture",
      revision: revision + 1,
      decision: decision([slot("opening", "buyer-outcome")]),
      brief,
      evidence: evidence()
    });

    expect(contracts).toEqual([]);
  });

  it("keeps prompt text and copy out of the contract digest source", () => {
    const [contract] = buildSectionWritingContracts({
      sessionId: "contract-fixture",
      revision,
      decision: decision([slot("opening", "buyer-outcome")]),
      brief,
      evidence: evidence()
    });
    const digestSource = JSON.stringify(sectionContractDigestSource(contract!));

    expect(digestSource).toContain("buyer-outcome-v1.0.0");
    expect(digestSource).not.toContain(SECTION_PROMPT_REGISTRY["buyer-outcome"].objective);
    expect(digestSource).not.toContain("Dispatch teams recover");
    expect(digestSource).not.toContain(brief.audience);
  });

  it("recognizes internal build vocabulary that must never reach a reader", () => {
    expect(containsBannedInternalPhrase("Decision Lens 2 explains the mechanism")).toBe(true);
    expect(containsBannedInternalPhrase("Prepared for the buying committee")).toBe(true);
    expect(containsBannedInternalPhrase("Cut unplanned dwell time by four hours")).toBe(false);
  });
});
