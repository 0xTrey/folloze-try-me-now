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
  it("uses distinct service facts as cards without a question subheader or generic homework", () => {
    const facts = [
      claim("ebp", "Employee benefit plan audits simplify compliance and plan administration."),
      claim("federal", "Uniform Guidance compliance covers federal awards for for-profit and nonprofit organizations."),
      claim("financial", "Financial assurance reviews financial records and internal controls.")
    ];
    const repaired = repairBuildFallbacks({
      plan: plan([{ id: "applications", role: "applications", refs: facts.map(({ id }) => id) }]),
      artifacts: [artifact([section("applications", "pathways")])],
      slots: [slot("applications", "pathways", 90)], evidence: facts, sellerName: "Aprio"
    });
    const result = output(repaired)[0]!;
    expect(result.status).toBe("complete");
    expect(result.body ?? "").not.toContain("?");
    expect(result.choices?.map(({ body }) => body).sort()).toEqual(facts.map(({ text }) => text).sort());
    expect(result.choices?.every(({ evidenceRefs }) => evidenceRefs.length === 1)).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(/Your requirements|Your next decision|The working detail/);
  });

  it("does not invent three choices when only one service fact is available", () => {
    const text = "Employee benefit plan audits simplify compliance and plan administration.";
    const result = output(repairBuildFallbacks({
      plan: plan([{ id: "applications", role: "applications", refs: ["ebp"] }]),
      artifacts: [artifact([section("applications", "pathways")])],
      slots: [slot("applications", "pathways", 90)], evidence: [claim("ebp", text)]
    }))[0]!;
    expect(result.body).toBe(text);
    expect(result.choices).toBeUndefined();
  });

  it("keeps verified source headings attached to their own descriptions", () => {
    const facts = [
      { ...claim("ebp", "Our audit team helps plan sponsors meet their reporting responsibilities."), sourceSectionId: "service-ebp", sourceSectionTitle: "Employee Benefit Plan Audits" },
      { ...claim("federal", "Our compliance team supports federal award reporting requirements."), sourceSectionId: "service-federal", sourceSectionTitle: "Uniform Guidance Compliance" }
    ];
    const result = output(repairBuildFallbacks({
      plan: plan([{ id: "applications", role: "applications", refs: facts.map(({ id }) => id) }]),
      artifacts: [artifact([section("applications", "pathways")])],
      slots: [slot("applications", "pathways", 90)], evidence: facts
    }))[0]!;
    expect(result.choices?.map(({ label, body }) => ({ label, body }))).toEqual(facts.map(({ sourceSectionTitle, text }) => ({ label: sourceSectionTitle, body: text })));
  });

  it("reserves distinct facts for later required sections before filling an earlier grid", () => {
    const facts = [claim("one", "Review queues record the owner and decision for every request."),
      claim("two", "Exception routing directs unresolved work to the designated policy owner."),
      claim("three", "Approval history includes the original request and each review decision.")];
    const refs = facts.map(({ id }) => id);
    const result = output(repairBuildFallbacks({
      plan: plan([{ id: "criteria", role: "evaluation-criteria", refs }, { id: "mapping", role: "solution-mapping", refs }, { id: "applications", role: "applications", refs }]),
      artifacts: [artifact([section("criteria", "decision-support"), section("mapping", "mechanism"), section("applications", "pathways")])],
      slots: [slot("criteria", "decision-support"), slot("mapping", "mechanism"), slot("applications", "pathways")], evidence: facts
    }));
    expect(result.every(({ status }) => status === "complete")).toBe(true);
    expect(new Set(result.flatMap(({ evidenceRefs }) => evidenceRefs)).size).toBe(3);
    expect(result.every(({ body, choices }) => Boolean(body) && !choices)).toBe(true);
  });

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

  it("does not turn the mechanism headline into an echo of the promoted offer", () => {
    const offer = "Automate the path from finding to fix";
    const repaired = repairBuildFallbacks({
      plan: {
        ...plan([
          { id: "hero", role: "hero", refs: ["offer-1"] },
          { id: "mechanism", role: "mechanism", refs: ["offer-2"] }
        ]),
        buyer: { product: { label: offer } }
      } as BuildExperiencePlan,
      artifacts: [artifact([
        {
          ...section("hero", "hero", "Prioritize active vulnerabilities with runtime context."),
          headline: `Explore ${offer}`
        },
        {
          ...section("mechanism", "mechanism", "Prioritize, guide, and validate each fix."),
          headline: `How ${offer} works`
        }
      ])],
      slots: [slot("hero", "hero"), slot("mechanism")],
      evidence: [
        claim("offer-1", "Prioritize active vulnerabilities with runtime context."),
        claim("offer-2", "Prioritize findings, guide developers, and validate each fix.")
      ]
    });
    const sections = output(repaired);
    const hero = sections.find(({ sectionId }) => sectionId === "hero")!;
    const mechanism = sections.find(({ sectionId }) => sectionId === "mechanism")!;
    expect(mechanism.headline).not.toContain(offer);
    expect(mechanism.headline).not.toBe(hero.headline);
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
