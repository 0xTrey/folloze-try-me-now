import { describe, expect, it } from "vitest";

import { renderPersonalizationDeliveryEmail } from "./personalization-email";

const origin = "https://folloze-try-me-now.vercel.app";

describe("personalization email renderer", () => {
  it("renders three final app links without tracking or remote imagery", () => {
    const result = renderPersonalizationDeliveryEmail({
      sellerName: "Folloze",
      appOrigin: origin,
      variants: [
        { domain: "acme.com", role: "CFO", url: `${origin}/e/one` },
        { domain: "globex.com", url: `${origin}/e/two` },
        { domain: "initech.com", role: "COO", url: `${origin}/e/three` }
      ]
    });

    expect(result.subject).toBe(
      "Your 3 personalized Folloze experiences are ready"
    );
    expect(result.text).toContain("1. acme.com, CFO");
    expect(result.text).toContain("3. initech.com, COO");
    expect(result.html).toContain(`${origin}/e/one`);
    expect(result.html).toMatch(/^<!doctype html>/);
    expect(result.html).not.toMatch(/<img|tracking pixel|track_opens/i);
    expect(result.html).not.toContain("Request ");
  });

  it("states a partial result honestly and escapes seller and role text", () => {
    const result = renderPersonalizationDeliveryEmail({
      sellerName: "A <B>",
      appOrigin: origin,
      variants: [
        {
          domain: "acme.com",
          role: "Finance & Ops",
          url: `${origin}/e/one?source=email`
        }
      ]
    });

    expect(result.subject).toBe("1 personalized A <B> experience is ready");
    expect(result.text).toContain("1 of your three personalized experiences is ready");
    expect(result.text).toContain("We withheld any version that did not pass");
    expect(result.html).toContain("A &lt;B&gt;");
    expect(result.html).toContain("Finance &amp; Ops");
  });

  it("rejects non-HTTPS, cross-origin, invalid-domain, and empty deliveries", () => {
    expect(() =>
      renderPersonalizationDeliveryEmail({
        sellerName: "Folloze",
        appOrigin: "http://localhost:3000",
        variants: [{ domain: "acme.com", url: "http://localhost:3000/e/one" }]
      })
    ).toThrow("must use HTTPS");
    expect(() =>
      renderPersonalizationDeliveryEmail({
        sellerName: "Folloze",
        appOrigin: origin,
        variants: [{ domain: "acme.com", url: "https://evil.example/e/one" }]
      })
    ).toThrow("configured app origin");
    expect(() =>
      renderPersonalizationDeliveryEmail({
        sellerName: "Folloze",
        appOrigin: origin,
        variants: [{ domain: "not a domain", url: `${origin}/e/one` }]
      })
    ).toThrow("valid target domain");
    expect(() =>
      renderPersonalizationDeliveryEmail({
        sellerName: "Folloze",
        appOrigin: origin,
        variants: []
      })
    ).toThrow("one to three");
  });
});
