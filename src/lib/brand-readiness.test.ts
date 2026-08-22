import { describe, expect, it } from "vitest";

import {
  assessBrandReadiness,
  prospectBrandPresentation
} from "@/lib/brand-readiness";
import { portableBrandLogoFromSvg } from "@/lib/portable-brand-logo";
import type { BrandProfile } from "@/lib/types";

function profile(overrides: Partial<BrandProfile> = {}): BrandProfile {
  const portableLogo = portableBrandLogoFromSvg(
    '<svg xmlns="http://www.w3.org/2000/svg" aria-label="Jitterbit logo"><path fill="#F44414" d="M0 0h20v10H0z"/></svg>',
    "official-remote-asset"
  );
  return {
    domain: "jitterbit.com",
    companyName: "Jitterbit",
    publicTopics: [],
    portableLogo,
    imageUrls: [],
    colors: ["#1B3E51", "#F44414", "#FFFFFF"],
    primaryColor: "#1B3E51",
    accentColor: "#F44414",
    surfaceColor: "#FFFFFF",
    sourceUrl: "https://www.jitterbit.com/",
    source: "fast-extractor",
    designDna: {
      version: 1,
      source: "verified-profile",
      confidence: "high",
      theme: { hero: "light" },
      buttons: { radiusPx: 8, heightPx: 48 },
      cards: { radiusPx: 12 },
      spacing: { contentMaxWidthPx: 1280, sectionBlockPx: 80, gridGapPx: 24 }
    },
    identity: {
      expectedDomain: "jitterbit.com",
      canonicalDomain: "jitterbit.com",
      canonicalName: "Jitterbit",
      confidence: "high",
      confirmationStatus: "confirmed",
      confirmedBy: "system",
      reasons: [],
      provenance: []
    },
    diagnostics: {
      logo: {
        strategy: "official-remote-portable",
        imageCandidateCount: 1,
        rejectedImageCount: 0,
        inlineSvgCandidateCount: 0,
        resolutionComplete: true
      },
      palette: {
        strategy: "semantic-tokens",
        confidence: "high",
        candidateCount: 3,
        semanticCandidateCount: 3,
        rejectedCandidateCount: 0,
        gradientCandidateCount: 0
      }
    },
    ...overrides
  };
}

describe("brand readiness", () => {
  it("uses one honest prospect state across researching, verified, partial, and unavailable brands", () => {
    const verified = profile();
    verified.readiness = assessBrandReadiness(verified);
    const partial = profile({
      portableLogo: undefined,
      logoUrl: undefined,
      logoSourceUrl: undefined
    });
    partial.readiness = assessBrandReadiness(partial);
    const unavailable = profile({
      source: "fallback",
      readiness: {
        status: "incomplete",
        identityReady: false,
        logoReady: false,
        paletteReady: false,
        designReady: false,
        sourceEvidenceReady: false,
        reasons: ["Providers are not configured."]
      }
    });

    expect(prospectBrandPresentation(undefined, "Acme", "running").state).toBe(
      "researching"
    );
    expect(prospectBrandPresentation(verified, "Jitterbit", "complete")).toMatchObject({
      state: "verified",
      label: "Jitterbit brand verified"
    });
    expect(prospectBrandPresentation(partial, "Jitterbit", "complete")).toMatchObject({
      state: "partial",
      label: "Jitterbit identity found"
    });
    expect(
      prospectBrandPresentation(unavailable, "Unknown Seller", "fallback")
    ).toMatchObject({
      state: "unavailable",
      label: "Unknown Seller visual research unavailable"
    });
    expect(prospectBrandPresentation(unavailable, "Unknown Seller", "fallback").detail)
      .not.toMatch(/matched|official|verified|brand colors/i);
  });

  it("requires confirmed identity, a deliverable official logo, semantic colors, and first-party evidence", () => {
    expect(assessBrandReadiness(profile())).toEqual({
      status: "ready",
      identityReady: true,
      logoReady: true,
      paletteReady: true,
      designReady: true,
      sourceEvidenceReady: true,
      reasons: []
    });
  });

  it("does not report ready after resolution completes without an official wordmark", () => {
    const candidate = profile({
      portableLogo: undefined,
      logoUrl: undefined,
      logoSourceUrl: undefined,
      diagnostics: {
        ...profile().diagnostics!,
        logo: {
          strategy: "none",
          imageCandidateCount: 4,
          rejectedImageCount: 4,
          inlineSvgCandidateCount: 0,
          resolutionComplete: true
        }
      }
    });

    expect(assessBrandReadiness(candidate)).toMatchObject({
      status: "incomplete",
      logoReady: false
    });
  });

  it("does not accept frequency-only framework colors as brand-ready evidence", () => {
    const candidate = profile({
      diagnostics: {
        ...profile().diagnostics!,
        palette: {
          strategy: "frequency",
          confidence: "low",
          candidateCount: 12,
          semanticCandidateCount: 0,
          rejectedCandidateCount: 8,
          gradientCandidateCount: 0
        }
      }
    });

    expect(assessBrandReadiness(candidate)).toMatchObject({
      status: "incomplete",
      paletteReady: false
    });
  });

  it("does not report ready when browser-backed design evidence is incomplete", () => {
    const candidate = profile({
      designDna: {
        version: 1,
        source: "remote-harvester",
        confidence: "medium",
        theme: { hero: "light" },
        buttons: { radiusPx: 8, heightPx: 48 }
      },
      diagnostics: {
        ...profile().diagnostics!,
        designFidelity: {
          designReady: false,
          score: 68,
          missing: ["layout_geometry", "screenshot_evidence"]
        }
      }
    });

    expect(assessBrandReadiness(candidate)).toMatchObject({
      status: "incomplete",
      designReady: false,
      reasons: [expect.stringMatching(/layout_geometry/)]
    });
  });
});
