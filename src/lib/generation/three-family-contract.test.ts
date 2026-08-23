import { describe, expect, it } from "vitest";

import {
  applyV2SectionPlanToLegacySelection,
  assertWireframeDecisionV2,
  decodeWireframeFamilyV2,
  defaultSectionPlanV2,
  selectThreeFamilyDecision,
  wireframeFamiliesV2
} from "@/lib/generation/three-family-contract";
import { selectWireframe } from "@/lib/generation/wireframe-library";

describe("three-family production contract", () => {
  it("permits only Launch, Guide, and Align as V2 families", () => {
    expect(wireframeFamiliesV2).toEqual(["launch", "guide", "align"]);
    expect(() =>
      assertWireframeDecisionV2({
        ...selectThreeFamilyDecision({
          sessionId: "session-family",
          revision: 1,
          useCase: "campaign"
        }),
        family: "campaign" as never
      })
    ).toThrow(/unsupported v2 wireframe family/i);
  });

  it.each([
    [{ campaignType: "event" as const }, "event"],
    [{ campaignType: "event" as const, eventSubtype: "webinar" as const }, "webinar"],
    [{ offerKind: "webinar" as const }, "webinar"],
    [{ intent: "Register for the annual field event" }, "event"]
  ])("always routes event intent to Launch", (signals, subtype) => {
    const decision = selectThreeFamilyDecision({
      sessionId: "session-event",
      revision: 2,
      useCase: "campaign",
      ...signals
    });
    expect(decision).toMatchObject({
      version: 2,
      family: "launch",
      subtype,
      locked: true,
      reasonCode: "v2-event-registration-launch"
    });
  });

  it.each([
    [{ campaignType: "product" as const }, "launch", "product"],
    [{ offerKind: "offer" as const }, "launch", "offer"],
    [{ campaignType: "solution" as const }, "guide", "solution"],
    [{ offerKind: "industry" as const }, "guide", "industry"],
    [{ intent: "Help buyers evaluate category criteria" }, "guide", "solution"]
  ])("maps promotional and educational intent deterministically", (signals, family, subtype) => {
    const decide = () =>
      selectThreeFamilyDecision({
        sessionId: "session-motion",
        revision: 3,
        useCase: "campaign",
        evidenceRefs: ["official:offer"],
        ...signals
      });
    expect(decide()).toEqual(decide());
    expect(decide()).toMatchObject({ family, subtype });
  });

  it("routes named-account context to Align and preserves seller authority inputs", () => {
    const decision = selectThreeFamilyDecision({
      sessionId: "session-align",
      revision: 4,
      useCase: "abm",
      targetDomain: "target.example",
      firstDecision: "Choose the workflow to validate",
      evidenceRefs: ["target:observation", "seller:offer"]
    });
    expect(decision).toMatchObject({
      family: "align",
      subtype: "account",
      reasonCode: "v2-named-account-first-decision-align"
    });
    expect(decision.factors.map(({ code }) => code)).toEqual([
      "named-account",
      "first-decision"
    ]);
  });

  it.each(["launch", "guide", "align"] as const)(
    "defines a six-section default and one primary exploration device for %s",
    (family) => {
      const sections = defaultSectionPlanV2(family);
      expect(sections).toHaveLength(6);
      expect(new Set(sections.map(({ id }) => id)).size).toBe(6);
      expect(
        sections.filter(
          (section) =>
            section.interaction && section.interaction !== "anchor-navigation"
        )
      ).toHaveLength(1);
      expect(sections.every(({ navigationLabel }) => navigationLabel.length > 0)).toBe(true);
    }
  );

  it("adds optional proof and resource slots only with supporting evidence", () => {
    const withoutEvidence = selectThreeFamilyDecision({
      sessionId: "session-options",
      revision: 5,
      useCase: "campaign",
      includeProofDepth: true,
      includeResource: true
    });
    const withEvidence = selectThreeFamilyDecision({
      sessionId: "session-options",
      revision: 5,
      useCase: "campaign",
      proofEvidenceRefs: ["proof:1", "proof:2"],
      includeProofDepth: true,
      includeResource: true
    });
    expect(withoutEvidence.sectionPlan).toHaveLength(6);
    expect(withEvidence.sectionPlan).toHaveLength(8);
    expect(withEvidence.sectionPlan.filter(({ optional }) => optional)).toHaveLength(2);
  });

  it("decodes legacy families without changing persisted input", () => {
    expect(decodeWireframeFamilyV2("account")).toBe("align");
    expect(decodeWireframeFamilyV2("content")).toBe("guide");
    expect(decodeWireframeFamilyV2("campaign", "industry")).toBe("guide");
    expect(decodeWireframeFamilyV2("campaign", "product")).toBe("launch");
    expect(decodeWireframeFamilyV2("launch")).toBe("launch");
  });

  it.each([
    ["launch", ["hero", "context", "mechanism", "pathways", "proof", "next-action"]],
    ["guide", ["hero", "context", "decision-support", "mechanism", "pathways", "next-action"]],
    ["align", ["hero", "context", "mechanism", "pathways", "proof", "next-action"]]
  ] as const)("adapts %s section order through the legacy renderer seam", (family, roles) => {
    const decision = selectThreeFamilyDecision({
      sessionId: `session-${family}`,
      revision: 6,
      useCase: family === "align" ? "abm" : family === "guide" ? "content" : "campaign",
      offerKind: family === "launch" ? "product" : undefined
    });
    const legacy = selectWireframe({
      family: family === "align" ? "account" : family === "guide" ? "content" : "campaign"
    });
    const adapted = applyV2SectionPlanToLegacySelection(legacy, decision);
    expect(adapted.locked).toBe(true);
    expect(adapted.alternativeIds).toEqual([]);
    expect(adapted.compositionPlan.sections.map(({ role }) => role)).toEqual(roles);
    expect(adapted.compositionPlan.sections.map(({ label }) => label)).toEqual(
      decision.sectionPlan.map(({ navigationLabel }) => navigationLabel)
    );
  });
});
