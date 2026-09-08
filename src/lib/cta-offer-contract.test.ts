import { describe, expect, it } from "vitest";
import { resolveBuyerCtaOffer, verifiedProductResourceUrl } from "./cta-offer-contract";

describe("CTA offer continuity", () => {
  const resourceItem = (overrides: Record<string, unknown> = {}) => ({
    id: "resource-1", type: "public-positioning" as const, label: "Audit resource",
    text: "Audit resource", sourceUrl: "https://aprio.com/resources/audit-guide",
    signals: [], disposition: "available" as const, evidenceType: "resource" as const,
    confidence: "high" as const, subject: "Audit & Assurance Solutions", ...overrides
  });

  it("accepts only a current, non-excluded, same-offer public resource", () => {
    const session = { answers: { promotedOffer: "Audit & Assurance Solutions", offerSourceUrl: "https://aprio.com/audit-assurance/" }, evidenceItems: [resourceItem()] };
    expect(verifiedProductResourceUrl(session)).toBe("https://aprio.com/resources/audit-guide");
    expect(verifiedProductResourceUrl({ ...session, evidenceItems: [resourceItem({ subject: "Other offer" })] })).toBeUndefined();
    expect(verifiedProductResourceUrl({ ...session, evidenceItems: [resourceItem({ disposition: "excluded" })] })).toBeUndefined();
    expect(verifiedProductResourceUrl({ ...session, evidenceItems: [resourceItem({ confidence: "low" })] })).toBeUndefined();
    expect(verifiedProductResourceUrl({ ...session, evidenceItems: [resourceItem({ sourceUrl: "https://aprio.com/audit-assurance/" })] })).toBeUndefined();
    expect(verifiedProductResourceUrl({ ...session, evidenceItems: [resourceItem({ sourceUrl: "http://localhost/private" })] })).toBeUndefined();
  });

  it("never calls a scroll fallback a booked meeting", () => {
    const result = resolveBuyerCtaOffer({ intent: "book-meeting", label: "Book a demo" });
    expect(result.action).toMatchObject({ actionType: "scroll", label: "Explore the page", verification: "fallback" });
    expect(result.expectation).toContain("does not book a meeting or register you");
    expect(result.action.destination).toBe("#next-step");
  });
  it("does not substitute a meeting destination for a missing download", () => {
    const result = resolveBuyerCtaOffer({ intent: "download", label: "Get the guide", meetingUrl: "https://seller.example/demo" });
    expect(result.action.actionType).toBe("scroll");
  });
  it.each([
    ["register", "View event details"], ["download", "Read the resource"], ["explore", "Explore product details"]
  ] as const)("describes the actual source opening for %s", (intent, label) => {
    const result = resolveBuyerCtaOffer({ intent, label: "An unsupported promise", sourceUrl: "https://seller.example/resource?event_id=123" });
    expect(result.action).toMatchObject({ label, destination: "https://seller.example/resource?event_id=123", actionType: "external-link" });
    expect(result.expectation).toContain("No form is submitted");
  });
  it("keeps configured meeting actions bounded to safe public HTTPS", () => {
    expect(resolveBuyerCtaOffer({ intent: "book-meeting", label: "Book a meeting", meetingUrl: "https://seller.example/demo" }).action.label).toBe("Book a meeting");
    expect(resolveBuyerCtaOffer({ intent: "book-meeting", label: "Book a meeting", meetingUrl: "https://user:secret@seller.example/demo" }).action.actionType).toBe("scroll");
    expect(resolveBuyerCtaOffer({ intent: "download", label: "Read guide", sourceUrl: "https://seller.example/guide?token=private" }).action.actionType).toBe("scroll");
  });
});
