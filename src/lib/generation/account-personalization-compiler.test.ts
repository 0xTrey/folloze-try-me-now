import { describe, expect, it } from "vitest";
import { compileAccountPersonalization, evaluateAccountSwap } from "@/lib/generation/account-personalization-compiler";
import type { SessionEvidenceItem } from "@/lib/types";
import type { CompilerEvidenceItem } from "@/lib/generation/messaging-compiler-contracts";

const item = (id: string, text: string, entityRole: SessionEvidenceItem["entityRole"] = "target", sourceDomain = "target.example.com"): SessionEvidenceItem => ({
  id, type: "public-focus-area", label: id, text, sourceUrl: `https://${sourceDomain}/page`, signals: [], disposition: "available", entityRole, confidence: "high"
});
const base = { revision: 4, sellerName: "Seller", targetName: "Target", targetDomain: "target.example.com", offer: "an architecture workshop", audience: "platform leaders", objective: "governance", evidence: [] as SessionEvidenceItem[] };

describe("account personalization compiler", () => {
  it("creates materially different Cisco and Google arguments", () => {
    const cisco = compileAccountPersonalization({ ...base, targetName: "Cisco", targetDomain: "cisco.example.com", evidence: [item("cisco", "Cisco is expanding secure networking across hybrid infrastructure and observability programs.", "target", "cisco.example.com")] });
    const google = compileAccountPersonalization({ ...base, targetName: "Google", targetDomain: "google.example.com", evidence: [item("google", "Google is investing in cloud security and responsible AI across enterprise platforms.", "target", "google.example.com")] });
    expect(cisco.directives).not.toEqual(google.directives);
    expect(cisco.directives.tension).toContain("networking");
    expect(google.directives.tension).toContain("cloud security");
  });
  it("uses readable possessives for account names ending in s", () => {
    const result = compileAccountPersonalization({
      ...base,
      targetName: "Apex Home Services",
      evidence: [item("apex", "Apex Home Services emphasizes dispatch consistency across field operations.")]
    });
    expect(result.directives.tension).toContain("Apex Home Services' public materials");
    expect(result.directives.tension).not.toContain("Services's");
  });
  it("cites target refs for every populated directive", () => {
    const result = compileAccountPersonalization({ ...base, evidence: [item("target-a", "Target is publishing a public focus on resilient data operations.")] });
    expect(result.quality.substantiveFieldCount).toBe(6);
    expect(result.quality).toMatchObject({ status: "limited", evidenceDepth: "single-signal" });
    expect(result.evidenceRefs).toEqual(["target-a"]);
    expect(result.claims.every((claim) => claim.sourceRole === "target")).toBe(true);
    expect(result.claims.every((claim) => claim.revision === 4)).toBe(true);
    for (const field of Object.keys(result.directives)) {
      expect(result.directiveEvidenceRefs[field as keyof typeof result.directiveEvidenceRefs]).toEqual([
        "target-a"
      ]);
    }
  });
  it("requires seller-scoped capability evidence before emitting mechanism", () => {
    const unsupported = { id: "cap", kind: "fact", claim: "Seller capability", sourceAuthority: "seller", sourceRef: "https://seller.example/cap", confidence: "high", allowedUses: ["mechanism"], prohibitedUses: [], evidenceType: "capability", entityRole: "target" } as unknown as CompilerEvidenceItem;
    const result = compileAccountPersonalization({ ...base, evidence: [item("target", "Target is focused on resilient operations.")], sellerEvidence: [unsupported] });
    expect(result.directives.mechanism).toBeUndefined();
  });
  it("reports a true account swap while preserving seller capability identity", () => {
    const capability = { id: "seller-cap", kind: "fact", claim: "Supported workflow", sourceAuthority: "seller", sourceRef: "https://seller.example/cap", confidence: "high", allowedUses: ["mechanism", "credibility"], prohibitedUses: [], evidenceType: "capability", entityRole: "seller" } as unknown as CompilerEvidenceItem;
    const result = evaluateAccountSwap({ ...base, targetName: "Cisco", targetDomain: "cisco.example.com", sellerEvidence: [capability], evidence: [item("a", "Cisco is expanding secure networking.", "target", "cisco.example.com")] }, { targetName: "Google", targetDomain: "google.example.com", evidence: [item("b", "Google is investing in cloud security.", "target", "google.example.com")] });
    expect(result.changed).toBe(true);
    expect(result.accountEvidenceFingerprints[0]).not.toBe(result.accountEvidenceFingerprints[1]);
    expect(result.sellerCapabilityRefs[0]).toEqual(["seller-cap"]);
    expect(result.sellerCapabilityRefs[1]).toEqual(["seller-cap"]);
  });
  it("rejects excluded, seller-role, and unsafe evidence", () => {
    const excluded = { ...item("excluded", "Target public focus"), disposition: "excluded" as const };
    const seller = item("seller", "Seller describes internal revenue growth.", "seller");
    const result = compileAccountPersonalization({ ...base, evidence: [excluded, seller] });
    expect(result.quality.status).toBe("insufficient");
    expect(result.quality.rejectedEvidenceIds).toEqual(["excluded", "seller"]);
  });
  it("fails an account-swap test when only the company name changes", () => {
    const one = { ...base, targetName: "Acme", targetDomain: "acme.example", evidence: [item("a", "Acme is expanding secure networking.", "target", "acme.example")] };
    const other = { targetName: "Beta", targetDomain: "beta.example", evidence: [item("a", "Beta is expanding secure networking.", "target", "beta.example")] };
    expect(evaluateAccountSwap(one, other).changed).toBe(false);
  });
  it("does not turn low-confidence target research into buyer-facing claims", () => {
    const lowConfidence = {
      ...item("low-confidence", "Target may be considering a new operating model."),
      confidence: "low" as const
    };
    const result = compileAccountPersonalization({ ...base, evidence: [lowConfidence] });
    expect(result).toMatchObject({
      directives: {},
      claims: [],
      quality: {
        status: "insufficient",
        substantiveFieldCount: 0,
        rejectedEvidenceIds: ["low-confidence"]
      }
    });
  });
  it("rejects third-party origins and hostile interpolated metadata", () => {
    const thirdParty = item(
      "third-party",
      "Target describes a public focus on resilient data operations.",
      "target",
      "unrelated.example.com"
    );
    const firstParty = item(
      "first-party",
      "Target describes a public focus on resilient data operations."
    );
    const result = compileAccountPersonalization({
      ...base,
      targetName: "<script>unsafe()</script>",
      offer: "javascript:alert(1)",
      evidence: [thirdParty, firstParty]
    });
    expect(result.quality.rejectedEvidenceIds).toContain("third-party");
    expect(JSON.stringify(result.directives)).not.toMatch(/script|javascript:|alert\(/i);
    expect(result.directives.promise).toContain("The target account");
  });
  it("is deterministic and honest with no evidence", () => {
    const evidence = [item("b", "Target has a public focus on identity security."), item("a", "Target describes cloud resilience publicly.")];
    const one = compileAccountPersonalization({ ...base, evidence });
    const two = compileAccountPersonalization({ ...base, evidence });
    expect(one).toEqual(two);
    const empty = compileAccountPersonalization(base);
    expect(empty).toMatchObject({ directives: {}, evidenceRefs: [], quality: { status: "insufficient", substantiveFieldCount: 0 } });
  });
});
