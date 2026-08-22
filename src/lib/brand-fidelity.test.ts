import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  assessBrandIdentity,
  compileBrandFidelity,
  compileBrandVisualAuthority,
  withBrandIdentity
} from "@/lib/brand-intelligence";
import { assessBrandReadiness } from "@/lib/brand-readiness";
import {
  extractFastBrandProfile,
  normalizeRemoteBrandProfile
} from "@/lib/integrations/brand-harvester";
import type { BrandProfile } from "@/lib/types";

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), "../../tests/fixtures/brand-fidelity");
const serviceTitanHtml = readFileSync(join(fixtureDir, "servicetitan-home.html"), "utf8");
const serviceTitanCss = readFileSync(join(fixtureDir, "servicetitan-anvil.css"), "utf8");

function baseBrand(
  overrides: Partial<BrandProfile> & Pick<BrandProfile, "domain" | "companyName">
): BrandProfile {
  return {
    publicTopics: [],
    imageUrls: [],
    colors: ["#1C293F", "#5B5BFF", "#FFFFFF"],
    primaryColor: "#1C293F",
    accentColor: "#5B5BFF",
    surfaceColor: "#FFFFFF",
    sourceUrl: `https://${overrides.domain}/`,
    source: "fast-extractor",
    ...overrides
  };
}

describe("brand fidelity compilation (U15/U16/U17)", () => {
  it("ServiceTitan-style evidence preserves blue accent and moderate button radius through extraction and compilation", () => {
    const extracted = extractFastBrandProfile({
      domain: "servicetitan.com",
      html: serviceTitanHtml,
      css: serviceTitanCss,
      finalUrl: new URL("https://www.servicetitan.com/")
    });
    const identified = withBrandIdentity(extracted, "servicetitan.com");
    const fidelity = compileBrandFidelity(identified);

    expect(extracted.accentColor).toBe("#0265DC");
    expect(extracted.primaryColor).toBe("#040404");
    expect(extracted.surfaceColor).toBe("#FFFFFF");
    expect(extracted.diagnostics?.palette).toMatchObject({
      strategy: "semantic-tokens",
      confidence: "high"
    });
    expect(extracted.designDna).toMatchObject({
      confidence: "high",
      theme: { hero: "light" },
      buttons: {
        primaryBackground: "#0265DC",
        radiusPx: 6,
        heightPx: 40
      },
      typography: { fallback: "sans", headingWeight: 700, bodyWeight: 400 }
    });
    expect(fidelity.palette).toMatchObject({
      verified: true,
      accent: "#0265DC",
      primary: "#040404"
    });
    expect(fidelity.geometry?.buttonRadiusPx).toBe(6);
    expect(fidelity.motifs.cta).toBe("solid-moderate");
    expect(fidelity.unresolvedEvidence).not.toContain("button-radius");
    expect(fidelity.unresolvedEvidence).not.toContain("semantic-palette");

    const remoteCompiled = normalizeRemoteBrandProfile(
      {
        companyName: "ServiceTitan",
        colors: ["#040404", "#0265DC", "#FFFFFF"],
        primaryColor: "#040404",
        accentColor: "#0265DC",
        surfaceColor: "#FFFFFF",
        sourceUrl: "https://www.servicetitan.com/",
        designDna: {
          version: 1,
          source: "remote-harvester",
          confidence: "high",
          theme: { hero: "light" },
          buttons: {
            primaryBackground: "#0265DC",
            primaryText: "#FFFFFF",
            radiusPx: 6,
            heightPx: 40,
            borderWidthPx: 0
          },
          typography: { fallback: "sans", headingWeight: 700, bodyWeight: 400 }
        }
      },
      "servicetitan.com"
    );

    expect(remoteCompiled?.accentColor).toBe("#0265DC");
    expect(remoteCompiled?.designDna?.buttons?.radiusPx).toBe(6);
    expect(compileBrandFidelity(remoteCompiled!).geometry?.buttonRadiusPx).toBe(6);
  });

  it("strong evidence compiles semantic color, geometry, typography, and imagery treatment", () => {
    const strong = withBrandIdentity(
      extractFastBrandProfile({
        domain: "northstar.example",
        html: `<!doctype html><html><head>
          <title>NorthStar</title>
          <meta property="og:site_name" content="NorthStar">
        </head><body>
          <header><img class="logo" src="/northstar-wordmark.svg" alt="NorthStar logo" width="160" height="36"></header>
          <main>
            <img class="inner-hero-unit-img" src="/HarmonyTitle-HeroImage-Ring.jpg" alt="NorthStar platform" width="1200" height="720">
            <img class="product-architecture" src="/architecture-diagram.png" alt="Architecture overview" width="1100" height="700">
            <a class="btn-primary" href="/demo">Book a demo</a>
          </main>
        </body></html>`,
        css: `:root {
          --brand-ink: #10243a;
          --brand-accent: #28c6b7;
          --surface: #ffffff;
        }
        body { color: #10243a; background: #ffffff; font-weight: 400; }
        h1 { font-weight: 700; }
        .btn-primary {
          background: #28c6b7;
          color: #10243a;
          border-radius: 14px;
          height: 48px;
          border-width: 2px;
        }
        .card { border-radius: 22px; }
        .hero { background: radial-gradient(circle, #28c6b7, transparent); }`,
        finalUrl: new URL("https://northstar.example/")
      }),
      "northstar.example"
    );
    const fidelity = compileBrandFidelity(strong);

    expect(strong.accentColor).toBe("#28C6B7");
    expect(strong.designDna?.buttons?.radiusPx).toBe(14);
    expect(strong.imageUrls.length).toBeGreaterThanOrEqual(2);
    expect(fidelity.imagery.treatment).toBe("image-led");
    expect(fidelity.motifs).toMatchObject({
      hero: "light",
      motif: "radial-glow",
      cta: "solid-rounded"
    });
    expect(fidelity.typographyCharacter?.headingWeight).toBe(700);
    expect(fidelity.palette.verified).toBe(true);
  });

  it("neutral brands keep ink for headings and reserve vivid color for interaction", () => {
    const apple = extractFastBrandProfile({
      domain: "apple.com",
      html: `<!doctype html><html><head>
        <title>Apple</title>
        <meta property="og:site_name" content="Apple">
      </head><body><main><h1>iPad</h1><a class="learn-more" href="/ipad/">Learn more</a></main></body></html>`,
      css: `:root {
        --sk-body-text-color: rgb(29,29,31);
        --sk-headline-text-color: rgb(29, 29, 31);
        --sk-body-background-color: rgb(255,255,255);
        --sk-focus-color: #0071e3;
      }
      body, h1 { color: rgb(29,29,31); background: rgb(255,255,255); }
      .learn-more { color: #0066cc; }`,
      finalUrl: new URL("https://www.apple.com/ipad/")
    });
    const fidelity = compileBrandFidelity(apple);

    expect(apple.primaryColor).toBe("#1D1D1F");
    expect(apple.accentColor).toBe("#0071E3");
    expect(fidelity.palette.verified).toBe(true);
    expect(fidelity.palette.accent).toBe("#0071E3");
  });

  it("incomplete evidence exposes unresolved roles and never claims a verified palette", () => {
    const incomplete = extractFastBrandProfile({
      domain: "sparse.example",
      html: `<!doctype html><html><head><title>Sparse</title></head><body><h1>Hello</h1></body></html>`,
      css: ``,
      finalUrl: new URL("https://sparse.example/")
    });
    const fidelity = compileBrandFidelity(incomplete);

    expect(incomplete.diagnostics?.palette?.strategy).toBe("fallback");
    expect(incomplete.diagnostics?.palette?.confidence).toBe("low");
    expect(incomplete.accentColor).toBe("#5F6368");
    expect(fidelity.palette.verified).toBe(false);
    expect(fidelity.palette.accent).toBeUndefined();
    expect(fidelity.unresolvedEvidence).toEqual(
      expect.arrayContaining(["semantic-palette", "source-owned-imagery", "imagery-fallback:type-led"])
    );
    expect(fidelity.imagery.treatment).toBe("type-led");
  });

  it("redirected canonical hosts and regional subdomains keep company identity coherent", () => {
    const redirected = extractFastBrandProfile({
      domain: "getacme.com",
      html: `<!doctype html><html><head>
        <title>Acme</title>
        <meta property="og:site_name" content="Acme">
      </head><body>
        <img class="logo" src="/acme-logo.svg" alt="Acme logo" width="140" height="32">
      </body></html>`,
      css: `:root { --brand-ink: #111827; --brand-accent: #2563eb; --surface: #fff; }
        body { color: #111827; background: #fff; }
        .btn-primary { background: #2563eb; border-radius: 8px; height: 44px; }`,
      finalUrl: new URL("https://www.acme.com/")
    });

    expect(redirected.domain).toBe("getacme.com");
    expect(redirected.canonicalDomain).toBe("acme.com");
    expect(redirected.domainAliases).toContain("acme.com");
    expect(assessBrandIdentity(redirected, "getacme.com").confirmationStatus).not.toBe("rejected");

    const subdomain = baseBrand({
      domain: "usa.philips.com",
      canonicalDomain: "philips.com",
      domainAliases: ["philips.com"],
      companyName: "Philips",
      sourceUrl: "https://www.usa.philips.com/",
      logoUrl: "https://www.usa.philips.com/assets/philips-logo.svg",
      colors: ["#0B5FFF", "#0A1F44", "#FFFFFF"],
      primaryColor: "#0A1F44",
      accentColor: "#0B5FFF",
      diagnostics: {
        logo: {
          strategy: "semantic-image",
          imageCandidateCount: 1,
          rejectedImageCount: 0,
          inlineSvgCandidateCount: 0
        },
        palette: {
          strategy: "semantic-tokens",
          confidence: "high",
          candidateCount: 3,
          semanticCandidateCount: 3,
          rejectedCandidateCount: 0,
          gradientCandidateCount: 0
        }
      }
    });

    expect(assessBrandIdentity(subdomain, "usa.philips.com")).toMatchObject({
      canonicalName: "Philips",
      confidence: "high",
      confirmationStatus: "confirmed"
    });
  });

  it("conflicting company or palette evidence stays unresolved and does not merge seller/target authority", () => {
    const conflicting = withBrandIdentity(
      baseBrand({
        domain: "hellopebble.com",
        companyName: "PitchBook",
        sourceUrl: "https://hellopebble.com",
        logoUrl: "https://cdn.example.com/pitchbook-logo.svg",
        diagnostics: {
          logo: {
            strategy: "semantic-image",
            imageCandidateCount: 1,
            rejectedImageCount: 0,
            inlineSvgCandidateCount: 0
          },
          palette: {
            strategy: "fallback",
            confidence: "low",
            candidateCount: 0,
            semanticCandidateCount: 0,
            rejectedCandidateCount: 0,
            gradientCandidateCount: 0
          }
        }
      }),
      "hellopebble.com"
    );

    expect(conflicting.identity?.confirmationStatus).toBe("rejected");
    expect(compileBrandFidelity(conflicting).unresolvedEvidence).toEqual(
      expect.arrayContaining(["company-identity", "semantic-palette"])
    );

    const seller = withBrandIdentity(
      extractFastBrandProfile({
        domain: "servicetitan.com",
        html: serviceTitanHtml,
        css: serviceTitanCss,
        finalUrl: new URL("https://www.servicetitan.com/")
      }),
      "servicetitan.com"
    );
    const target = withBrandIdentity(
      baseBrand({
        domain: "acmebuilders.com",
        companyName: "Acme Builders",
        sourceUrl: "https://acmebuilders.com/",
        logoUrl: "https://acmebuilders.com/logo.svg",
        colors: ["#7C3AED", "#111827", "#FFFFFF"],
        primaryColor: "#111827",
        accentColor: "#7C3AED",
        diagnostics: {
          logo: {
            strategy: "semantic-image",
            imageCandidateCount: 1,
            rejectedImageCount: 0,
            inlineSvgCandidateCount: 0,
            selectedSource: "semantic-image"
          },
          palette: {
            strategy: "semantic-tokens",
            confidence: "high",
            candidateCount: 3,
            semanticCandidateCount: 3,
            rejectedCandidateCount: 0,
            gradientCandidateCount: 0
          }
        }
      }),
      "acmebuilders.com"
    );
    const authority = compileBrandVisualAuthority(seller, target);

    expect(authority.owner).toBe("seller");
    expect(authority.seller.palette.accent).toBe("#0265DC");
    expect(authority.targetRecognition).toMatchObject({
      companyName: "Acme Builders",
      localAccentOnly: true,
      accentColor: "#7C3AED",
      markReady: true
    });
    expect(authority.seller.palette.accent).not.toBe(authority.targetRecognition?.accentColor);
    expect(authority.seller.motifs.cta).toBe("solid-moderate");
  });

  it("missing imagery compiles to type-led or diagram-led treatment without inventing assets", () => {
    const typeLed = compileBrandFidelity(
      baseBrand({
        domain: "typed.example",
        companyName: "Typed",
        colors: ["#111827", "#2563EB", "#FFFFFF"],
        primaryColor: "#111827",
        accentColor: "#2563EB",
        diagnostics: {
          logo: {
            strategy: "none",
            imageCandidateCount: 0,
            rejectedImageCount: 0,
            inlineSvgCandidateCount: 0
          },
          palette: {
            strategy: "semantic-tokens",
            confidence: "high",
            candidateCount: 3,
            semanticCandidateCount: 3,
            rejectedCandidateCount: 0,
            gradientCandidateCount: 0
          }
        }
      })
    );
    const diagramLed = compileBrandFidelity(
      baseBrand({
        domain: "diagram.example",
        companyName: "Diagram Co",
        colors: ["#0F172A", "#38BDF8", "#FFFFFF"],
        primaryColor: "#0F172A",
        accentColor: "#38BDF8",
        designDna: {
          version: 1,
          source: "remote-harvester",
          confidence: "medium",
          theme: { hero: "dark", motif: "technical-grid" }
        },
        diagnostics: {
          logo: {
            strategy: "none",
            imageCandidateCount: 0,
            rejectedImageCount: 0,
            inlineSvgCandidateCount: 0
          },
          palette: {
            strategy: "semantic-tokens",
            confidence: "high",
            candidateCount: 3,
            semanticCandidateCount: 3,
            rejectedCandidateCount: 0,
            gradientCandidateCount: 0
          }
        }
      })
    );

    expect(typeLed.imagery.treatment).toBe("type-led");
    expect(typeLed.unresolvedEvidence).toContain("imagery-fallback:type-led");
    expect(diagramLed.imagery.treatment).toBe("diagram-led");
    expect(diagramLed.unresolvedEvidence).toContain("imagery-fallback:diagram-led");
  });

  it("readiness stays incomplete when design geometry is missing even if colors look present", () => {
    const readiness = assessBrandReadiness(
      baseBrand({
        domain: "partial.example",
        companyName: "Partial",
        colors: ["#111827", "#2563EB", "#FFFFFF"],
        primaryColor: "#111827",
        accentColor: "#2563EB",
        sourceUrl: "https://partial.example/",
        identity: {
          expectedDomain: "partial.example",
          canonicalDomain: "partial.example",
          canonicalName: "Partial",
          confidence: "high",
          confirmationStatus: "confirmed",
          confirmedBy: "system",
          reasons: [],
          provenance: []
        },
        diagnostics: {
          logo: {
            strategy: "semantic-image",
            imageCandidateCount: 1,
            rejectedImageCount: 0,
            inlineSvgCandidateCount: 0
          },
          palette: {
            strategy: "semantic-tokens",
            confidence: "high",
            candidateCount: 3,
            semanticCandidateCount: 3,
            rejectedCandidateCount: 0,
            gradientCandidateCount: 0
          }
        }
      })
    );

    expect(readiness).toMatchObject({
      status: "incomplete",
      paletteReady: true,
      designReady: false
    });
  });
});
