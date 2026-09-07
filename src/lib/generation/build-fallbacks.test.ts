import { describe, expect, it } from "vitest";
import { repairBuildFallbacks } from "./build-fallbacks";
import type { BuildExperiencePlan } from "./build-experience-plan";
import type { SectionCopyCandidate, SectionEvidenceClaim, SectionWriterArtifact, SectionWriterSlot } from "./section-copy-types";

const claim = (id: string, text: string): SectionEvidenceClaim => ({
  id, text, confidence: 0.9, revision: 7, sourceRole: "offer"
});

const plan = (sections: { id: string; role: string; refs: string[]; optional?: boolean }[]): BuildExperiencePlan => ({
  revision: 7,
  buyer: { product: { label: "Acme Flow" } },
  sections: sections.map(({ id, role, refs, optional = false }) => ({
    id, role, claimRefs: refs, optional, evidenceMode: "supported-facts"
  }))
} as unknown as BuildExperiencePlan);

const slot = (id: string, role = "mechanism", max = 80): SectionWriterSlot => ({
  id, role: role as SectionWriterSlot["role"], v2Role: role as SectionWriterSlot["v2Role"],
  label: id, wordBudget: { min: 1, max }, headlineWordBudget: { min: 1, max: 12 },
  componentSlots: [], allowedInteractions: [], evidenceRefs: [], required: !["proof", "resources"].includes(role)
});

const section = (id: string, role = "mechanism", body = "Verify the implementation path."): SectionCopyCandidate => ({
  sectionId: id, role: role as SectionCopyCandidate["role"], v2Role: role as SectionCopyCandidate["v2Role"],
  claimType: "fact", status: "complete", headline: "Review the workflow", body,
  cta: { type: "book-meeting", label: "Book a working session" }, evidenceRefs: ["wrong-ref"], wordCount: 5
});

const artifact = (value: SectionCopyCandidate[]): SectionWriterArtifact => ({
  worker: "mechanism-proof-writer", sessionId: "session", revision: 7, status: "complete", value,
  evidenceRefs: value.flatMap((item) => item.evidenceRefs), confidence: 0.9,
  startedAt: "2026-09-07T00:00:00Z", completedAt: "2026-09-07T00:00:01Z"
});

const output = (artifacts: readonly SectionWriterArtifact[]) => artifacts.flatMap((item) => item.value ?? []);

describe("repairBuildFallbacks", () => {
  it("retains the complete scoped claim, keeps CTA metadata, and removes off-plan refs", () => {
    const source = "Acme Flow records the owner, decision, and exception for every approval.";
    const repaired = repairBuildFallbacks({
      plan: plan([{ id: "mechanism", role: "mechanism", refs: ["offer-1"] }]),
      artifacts: [artifact([section("mechanism")])],
      slots: [slot("mechanism")],
      evidence: [claim("offer-1", source)]
    });
    const result = output(repaired)[0]!;
    expect(result.body).toBe(source);
    expect(result.body).not.toContain("...");
    expect(result.evidenceRefs).toEqual(["offer-1"]);
    expect(result.cta).toEqual({ type: "book-meeting", label: "Book a working session" });
  });

  it("uses distinct scoped claims for repeated middle arguments", () => {
    const repaired = repairBuildFallbacks({
      plan: plan([
        { id: "mechanism", role: "mechanism", refs: ["offer-1", "offer-2"] },
        { id: "proof", role: "proof", refs: ["offer-1", "offer-2"], optional: true }
      ]),
      artifacts: [artifact([
        section("mechanism", "mechanism", "Review the same workflow."),
        section("proof", "proof", "Review the same workflow.")
      ])],
      slots: [slot("mechanism"), slot("proof", "proof")],
      evidence: [
        claim("offer-1", "Acme Flow records named review ownership."),
        claim("offer-2", "Acme Flow routes exceptions to the accountable operator.")
      ]
    });
    const sections = output(repaired);
    expect(sections.map((item) => item.evidenceRefs[0])).toEqual(["offer-1", "offer-2"]);
    expect(new Set(sections.map((item) => item.body))).toHaveLength(2);
  });

  it("safely omits an optional repair when scoped evidence is empty instead of retaining fabricated copy", () => {
    const repaired = repairBuildFallbacks({
      plan: plan([{ id: "proof", role: "proof", refs: ["missing"], optional: true }]),
      artifacts: [artifact([section("proof", "proof", "A customer achieved a 90 percent result.")])],
      slots: [slot("proof", "proof")],
      evidence: []
    });
    expect(output(repaired)[0]).toMatchObject({
      status: "omitted",
      evidenceRefs: [],
      omissionReason: "unsupported_optional_slot"
    });
  });

  it("does not convert an over-budget source claim into a truncated assertion", () => {
    const source = "Acme Flow records the owner, decision, exception, policy, timing, and escalation path for every approval.";
    const repaired = repairBuildFallbacks({
      plan: plan([{ id: "mechanism", role: "mechanism", refs: ["offer-1"] }]),
      artifacts: [artifact([section("mechanism")])],
      slots: [slot("mechanism", "mechanism", 8)],
      evidence: [claim("offer-1", source)]
    });
    const result = output(repaired)[0]!;
    expect(result.status).toBe("omitted");
    expect(result.body).toBeUndefined();
  });
});
