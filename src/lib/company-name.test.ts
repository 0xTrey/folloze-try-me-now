import { describe, expect, it } from "vitest";

import {
  fallbackCompanyName,
  normalizeCompanyDisplayName,
  resolvePublicCompanyName
} from "@/lib/company-name";

describe("public company name resolution", () => {
  it("repairs mixed-case brands even when public metadata flattens the casing", () => {
    expect(
      resolvePublicCompanyName({
        domain: "servicenow.com",
        html: "<html></html>",
        ogSiteName: "Servicenow",
        title: "Servicenow - Put AI to work"
      })
    ).toBe("ServiceNow");
    expect(fallbackCompanyName("hubspot.com")).toBe("HubSpot");
    expect(fallbackCompanyName("datadog.com")).toBe("Datadog");
    expect(fallbackCompanyName("datadoghq.com")).toBe("Datadog");
    expect(normalizeCompanyDisplayName("Datadoghq", "datadoghq.com")).toBe("Datadog");
    expect(
      resolvePublicCompanyName({
        domain: "datadog.com",
        html: "",
        ogSiteName: "DataDog",
        title: "DataDog cloud monitoring"
      })
    ).toBe("Datadog");
  });

  it("uses the registrable parent brand for regional subdomains", () => {
    expect(fallbackCompanyName("usa.philips.com")).toBe("Philips");
    expect(fallbackCompanyName("usa.phillips.com")).toBe("Phillips");
    expect(fallbackCompanyName("enterprise.acme.co.uk")).toBe("Acme");
    expect(
      resolvePublicCompanyName({
        domain: "usa.philips.com",
        html: "",
        title: "Philips - United States"
      })
    ).toBe("Philips");
  });

  it("uses matching Organization JSON-LD before a generic page title", () => {
    expect(
      resolvePublicCompanyName({
        domain: "acme.com",
        html: `<script type="application/ld+json">{
          "@context": "https://schema.org",
          "@type": "Organization",
          "name": "Acme"
        }</script>`,
        title: "Welcome to the future of work"
      })
    ).toBe("Acme");
  });

  it("finds a domain-matching company token anywhere in a title", () => {
    expect(
      resolvePublicCompanyName({
        domain: "northstar.com",
        html: "",
        title: "AI workflow control | NorthStar | Platform"
      })
    ).toBe("NorthStar");
  });

  it("ignores unrelated structured organizations", () => {
    expect(
      resolvePublicCompanyName({
        domain: "example.com",
        html: `<script type="application/ld+json">{
          "@type": "Organization",
          "name": "Unrelated Vendor"
        }</script>`,
        title: "Example | Home"
      })
    ).toBe("Example");
  });
});
