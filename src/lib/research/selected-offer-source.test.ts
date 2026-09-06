import { describe, expect, it } from "vitest";
import { selectedOfferSourceUrl } from "./selected-offer-source";

const evidence = (overrides = {}) => ({
  ref: "offer-1", label: "Audit & Assurance Solutions", kind: "solution" as const,
  source: "official-page" as const, sourceUrl: "https://aprio.com/services/audit-assurance/", confidence: 0.9,
  ...overrides
});

describe("selectedOfferSourceUrl", () => {
  it("recovers an exact Aprio-like official offer URL", () => {
    expect(selectedOfferSourceUrl({ label: "Audit & Assurance Solutions", evidence: [evidence()], sellerDomains: ["aprio.com"] }))
      .toBe("https://aprio.com/services/audit-assurance/");
  });
  it("rejects homepage, low-confidence, wrong-host, and ambiguous matches", () => {
    expect(selectedOfferSourceUrl({ label: "Audit & Assurance Solutions", evidence: [evidence({ source: "homepage" as const })], sellerDomains: ["aprio.com"] })).toBeUndefined();
    expect(selectedOfferSourceUrl({ label: "Audit & Assurance Solutions", evidence: [evidence({ sourceUrl: "https://aprio.com/" })], sellerDomains: ["aprio.com"] })).toBeUndefined();
    expect(selectedOfferSourceUrl({ label: "Audit & Assurance Solutions", evidence: [evidence({ confidence: 0.4 })], sellerDomains: ["aprio.com"] })).toBeUndefined();
    expect(selectedOfferSourceUrl({ label: "Audit & Assurance Solutions", evidence: [evidence({ sourceUrl: "https://other.example/audit" })], sellerDomains: ["aprio.com"] })).toBeUndefined();
    expect(selectedOfferSourceUrl({ label: "Audit & Assurance Solutions", evidence: [evidence(), evidence({ ref: "offer-2", sourceUrl: "https://aprio.com/solutions/audit" })], sellerDomains: ["aprio.com"] })).toBeUndefined();
  });
});
