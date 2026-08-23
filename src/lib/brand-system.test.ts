import { describe, expect, it } from "vitest";

import {
  analyzeDesktopScreenshotObservations,
  type DesktopScreenshotObservations
} from "@/lib/brand-visual-evidence";
import {
  brandProfileToBrandSystemEvidence,
  compileBrandSystemV2,
  screenshotArtifactToBrandSystemEvidence,
  type BrandSystemEvidenceSource,
  type CompileBrandSystemInput
} from "@/lib/brand-system";
import type { EvidenceValue } from "@/lib/orchestration/worker-types";
import type { BrandProfile } from "@/lib/types";

const revision = 7;
const observedAt = "2026-08-22T17:00:00.000Z";

function evidence<T>(
  value: T,
  source: string,
  confidence = 0.9,
  at = observedAt,
  evidenceRevision = revision
): EvidenceValue<T> {
  return { value, source, confidence, observedAt: at, revision: evidenceRevision };
}

function brandProfile(
  overrides: Partial<BrandProfile> & Pick<BrandProfile, "domain" | "companyName">
): BrandProfile {
  return {
    publicTopics: [],
    imageUrls: [],
    colors: ["#111111", "#2563EB", "#FFFFFF"],
    primaryColor: "#111111",
    accentColor: "#2563EB",
    surfaceColor: "#FFFFFF",
    sourceUrl: `https://${overrides.domain}/`,
    source: "fast-extractor",
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
    },
    ...overrides
  };
}

function portableLogo(sha256: string): NonNullable<BrandProfile["portableLogo"]> {
  return {
    mediaType: "image/svg+xml",
    encoding: "base64",
    bytesBase64: "PHN2Zy8+",
    sha256,
    source: "official-remote-asset"
  };
}

function screenshotSource(
  observations: DesktopScreenshotObservations
): BrandSystemEvidenceSource {
  const artifact = analyzeDesktopScreenshotObservations({
    sessionId: "brand-system-fixture",
    revision,
    activeRevision: revision,
    sourceRef: "screenshot:official-home",
    observedAt,
    startedAt: observedAt,
    completedAt: "2026-08-22T17:00:01.000Z",
    viewport: { width: 1440, height: 1200 },
    observations
  });
  const source = screenshotArtifactToBrandSystemEvidence(artifact);
  if (!source) throw new Error("Expected screenshot fixture evidence.");
  return source;
}

function compile(
  sources: readonly BrandSystemEvidenceSource[],
  overrides: Partial<CompileBrandSystemInput> = {}
) {
  return compileBrandSystemV2({
    sessionId: "brand-system-fixture",
    revision,
    activeRevision: revision,
    identity: {
      name: "Fixture",
      canonicalDomain: "fixture.example",
      aliases: ["www.fixture.example"]
    },
    sources,
    startedAt: observedAt,
    completedAt: "2026-08-22T17:00:02.000Z",
    ...overrides
  });
}

describe("BrandSystemV2 compiler", () => {
  it("keeps Apple neutral-led, preserves scarce blue ratios, and trusts screenshot geometry", () => {
    const apple = brandProfile({
      domain: "apple.com",
      companyName: "Apple",
      logoUrl: "https://www.apple.com/ac/structured-data/images/open_graph_logo.png",
      logoSourceUrl: "https://www.apple.com/ac/structured-data/images/open_graph_logo.png",
      portableLogo: portableLogo("apple-logo"),
      imageUrls: ["https://www.apple.com/ipad/images/overview/hero.jpg"],
      colors: ["#1D1D1F", "#0071E3", "#FFFFFF", "#F5F5F7"],
      primaryColor: "#1D1D1F",
      accentColor: "#0071E3",
      surfaceColor: "#FFFFFF",
      displayFontFamily: "SF Pro Display",
      bodyFontFamily: "SF Pro Text",
      designDna: {
        version: 1,
        source: "remote-harvester",
        confidence: "high",
        colors: { softSurface: "#F5F5F7" },
        typography: { fallback: "sans", headingWeight: 600, bodyWeight: 400 },
        buttons: {
          primaryBackground: "#0071E3",
          radiusPx: 980,
          borderWidthPx: 1
        },
        cards: { radiusPx: 28, shadow: "none" },
        spacing: { contentMaxWidthPx: 1024, sectionBlockPx: 120, gridGapPx: 28 }
      },
      diagnostics: {
        logo: {
          strategy: "official-remote-portable",
          imageCandidateCount: 1,
          rejectedImageCount: 0,
          inlineSvgCandidateCount: 0,
          selectedScore: 90
        },
        palette: {
          strategy: "semantic-tokens",
          confidence: "high",
          candidateCount: 4,
          semanticCandidateCount: 4,
          rejectedCandidateCount: 0,
          gradientCandidateCount: 0
        }
      }
    });
    const result = compile([
      brandProfileToBrandSystemEvidence(apple, { revision, observedAt }),
      screenshotSource({
        colorRatios: [
          { color: "#FFFFFF", ratio: 86, confidence: 0.98 },
          { color: "#1D1D1F", ratio: 12, confidence: 0.97 },
          { color: "#0071E3", ratio: 2, confidence: 0.94 }
        ],
        controlRadiusPx: { value: 20, confidence: 0.9 },
        cardRadiusPx: { value: 0, confidence: 0.86 },
        density: { value: "open", confidence: 0.95 },
        navigation: { value: "minimal", confidence: 0.96 },
        hero: { value: "type-led", confidence: 0.91 },
        imagery: {
          value: { style: "photography", composition: "full-bleed" },
          confidence: 0.84
        }
      })
    ], {
      identity: { name: "Apple", canonicalDomain: "apple.com", aliases: ["www.apple.com"] }
    });

    expect(result.value).toMatchObject({
      revision,
      identity: { name: "Apple", canonicalDomain: "apple.com", aliases: [] },
      logo: { status: "verified" },
      colorRoles: {
        ink: { value: "#1D1D1F" },
        surface: { value: "#FFFFFF" },
        accent: { value: "#0071E3" },
        action: { value: "#0071E3" }
      },
      geometry: { controlRadius: 20, cardRadius: 0 },
      layout: { maxWidth: 1024, density: "open", navStyle: "minimal", heroStyle: "type-led" }
    });
    expect(result.value?.colorRoles.observedRatios).toEqual({
      "#FFFFFF": 0.86,
      "#1D1D1F": 0.12,
      "#0071E3": 0.02
    });
    expect(result.value?.typography.display).toMatchObject({
      value: "Arial",
      requestedFamily: "SF Pro Display",
      substitution: "SF Pro Display -> Arial",
      portable: true
    });
    expect(result.value?.imagery.candidates).toHaveLength(1);
  });

  it("keeps ADP's official red roles and verified logo while retaining screenshot proportions", () => {
    const adp = brandProfile({
      domain: "adp.com",
      companyName: "ADP",
      logoUrl: "https://www.adp.com/-/media/adp/red-logo.svg",
      logoSourceUrl: "https://www.adp.com/-/media/adp/red-logo.svg",
      portableLogo: portableLogo("adp-logo"),
      imageUrls: ["https://www.adp.com/-/media/adp/home/payroll-hero.webp"],
      colors: ["#202428", "#ED1C2E", "#FFFFFF", "#F5F5F5"],
      primaryColor: "#202428",
      accentColor: "#ED1C2E",
      surfaceColor: "#FFFFFF",
      displayFontFamily: "Source Sans Pro",
      bodyFontFamily: "Source Sans Pro",
      designDna: {
        version: 1,
        source: "remote-harvester",
        confidence: "high",
        typography: { fallback: "sans", headingWeight: 600, bodyWeight: 400 },
        buttons: { primaryBackground: "#ED1C2E", radiusPx: 4, borderWidthPx: 0 },
        cards: { radiusPx: 2, shadow: "none" },
        spacing: { contentMaxWidthPx: 1200, sectionBlockPx: 72, gridGapPx: 32 }
      },
      diagnostics: {
        logo: {
          strategy: "official-remote-portable",
          imageCandidateCount: 1,
          rejectedImageCount: 0,
          inlineSvgCandidateCount: 0,
          selectedScore: 95
        },
        palette: {
          strategy: "semantic-tokens",
          confidence: "high",
          candidateCount: 4,
          semanticCandidateCount: 4,
          rejectedCandidateCount: 0,
          gradientCandidateCount: 0
        }
      }
    });
    const result = compile([
      brandProfileToBrandSystemEvidence(adp, { revision, observedAt }),
      screenshotSource({
        colorRatios: [
          { color: "#FFFFFF", ratio: 0.68, confidence: 0.96 },
          { color: "#202020", ratio: 0.17, confidence: 0.92 },
          { color: "#D0271D", ratio: 0.15, confidence: 0.95 }
        ],
        density: { value: "balanced", confidence: 0.88 },
        navigation: { value: "utility", confidence: 0.9 },
        hero: { value: "split-media", confidence: 0.89 }
      })
    ], {
      identity: { name: "ADP", canonicalDomain: "adp.com" }
    });

    expect(result.value?.logo).toMatchObject({
      status: "verified",
      ref: "portable-logo:adp-logo",
      source: "https://www.adp.com/-/media/adp/red-logo.svg"
    });
    expect(result.value?.colorRoles.accent.value).toBe("#ED1C2E");
    expect(result.value?.colorRoles.action.value).toBe("#ED1C2E");
    expect(result.value?.colorRoles.observedRatios?.["#D0271D"]).toBeCloseTo(0.15);
    expect(result.value?.layout).toMatchObject({
      density: "balanced",
      navStyle: "utility",
      heroStyle: "split-media"
    });
  });

  it("preserves ServiceTitan blue, moderate geometry, and source-owned imagery", () => {
    const serviceTitan = brandProfile({
      domain: "servicetitan.com",
      companyName: "ServiceTitan",
      logoUrl: "https://www.servicetitan.com/logo.svg",
      logoSourceUrl: "https://www.servicetitan.com/logo.svg",
      portableLogo: portableLogo("servicetitan-logo"),
      imageUrls: ["https://www.servicetitan.com/images/platform.webp"],
      colors: ["#040404", "#0265DC", "#FFFFFF"],
      primaryColor: "#040404",
      accentColor: "#0265DC",
      surfaceColor: "#FFFFFF",
      displayFontFamily: "Inter",
      bodyFontFamily: "Inter",
      designDna: {
        version: 1,
        source: "remote-harvester",
        confidence: "high",
        typography: { fallback: "sans", headingWeight: 700, bodyWeight: 400 },
        buttons: { primaryBackground: "#0265DC", radiusPx: 6, borderWidthPx: 0 },
        cards: { radiusPx: 6, borderWidthPx: 1, shadow: "soft" },
        spacing: { contentMaxWidthPx: 1180, sectionBlockPx: 88, gridGapPx: 24 }
      },
      diagnostics: {
        logo: {
          strategy: "official-remote-portable",
          imageCandidateCount: 1,
          rejectedImageCount: 0,
          inlineSvgCandidateCount: 0,
          selectedScore: 90
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
    const result = compile(
      [brandProfileToBrandSystemEvidence(serviceTitan, { revision, observedAt })],
      { identity: { name: "ServiceTitan", canonicalDomain: "servicetitan.com" } }
    );

    expect(result.value).toMatchObject({
      colorRoles: {
        ink: { value: "#040404" },
        surface: { value: "#FFFFFF" },
        accent: { value: "#0265DC" },
        action: { value: "#0265DC" }
      },
      geometry: {
        controlRadius: 6,
        cardRadius: 6,
        borderWidth: 0,
        shadow: "soft"
      },
      layout: { maxWidth: 1180, density: "balanced" },
      imagery: { style: "image-led" }
    });
    expect(result.value?.imagery.candidates[0]).toMatchObject({
      value: "https://www.servicetitan.com/images/platform.webp",
      kind: "image"
    });
  });

  it("uses an explicit missing logo and type-led composition without inventing media", () => {
    const source: BrandSystemEvidenceSource = {
      ref: "official:no-media.example",
      kind: "official-dom",
      revision,
      observedAt,
      confidence: 0.85,
      logo: { status: "missing" },
      colorRoles: {
        ink: evidence("#18202A", "https://no-media.example/"),
        surface: evidence("#FFFFFF", "https://no-media.example/"),
        accent: evidence("#2C6BED", "https://no-media.example/"),
        action: evidence("#2C6BED", "https://no-media.example/"),
        support: evidence<readonly string[]>([], "https://no-media.example/")
      },
      colorRoleSpecificity: {
        ink: "explicit",
        surface: "explicit",
        accent: "explicit",
        action: "explicit"
      },
      imagery: {
        style: evidence("photography", "https://no-media.example/"),
        candidates: []
      }
    };
    const result = compile([source]);

    expect(result.value?.logo).toEqual({ confidence: 0, status: "missing" });
    expect(result.value?.imagery).toEqual({
      style: "type-led",
      candidates: [],
      selected: []
    });
    expect(result).toMatchObject({
      status: "needs_input",
      value: { readiness: "needs_input" },
      userRequest: { kind: "source_url" }
    });
    expect(JSON.stringify(result.value)).not.toMatch(/placeholder|generic-palette/i);
  });

  it("uses only verified neutral evidence when no accent survives", () => {
    const neutral: BrandSystemEvidenceSource = {
      ref: "official:neutral.example",
      kind: "official-dom",
      revision,
      observedAt,
      confidence: 0.8,
      colorRoles: {
        ink: evidence("#202124", "https://neutral.example/"),
        surface: evidence("#FFFFFF", "https://neutral.example/")
      },
      colorRoleSpecificity: { ink: "explicit", surface: "explicit" }
    };
    const result = compile([neutral]);

    expect(result.value?.colorRoles).toMatchObject({
      ink: { value: "#202124" },
      surface: { value: "#FFFFFF" },
      accent: { value: "#202124" },
      action: { value: "#202124" },
      support: { value: [] }
    });
    expect(result.fallbackCode).toContain("neutral-accent");
    expect(new Set([
      result.value?.colorRoles.ink.value,
      result.value?.colorRoles.surface.value,
      result.value?.colorRoles.accent.value,
      result.value?.colorRoles.action.value
    ])).toEqual(new Set(["#202124", "#FFFFFF"]));
  });

  it("rejects generic harvester fallback colors instead of promoting them to brand roles", () => {
    const fallback = brandProfile({
      domain: "blocked.example",
      companyName: "Blocked",
      colors: ["#202124", "#5F6368", "#FFFFFF"],
      primaryColor: "#202124",
      accentColor: "#5F6368",
      surfaceColor: "#FFFFFF",
      source: "fallback",
      diagnostics: {
        logo: {
          strategy: "none",
          imageCandidateCount: 0,
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
    });
    const result = compile([
      brandProfileToBrandSystemEvidence(fallback, { revision, observedAt })
    ]);

    expect(result).toMatchObject({
      status: "needs_input",
      errorCode: "verified_neutral_colors_unavailable",
      confidence: 0,
      userRequest: { kind: "source_url" }
    });
    expect(result.value).toBeUndefined();
  });

  it("resolves conflicting colors by authority, freshness, semantic role, then confidence", () => {
    const olderOfficial: BrandSystemEvidenceSource = {
      ref: "official:roles",
      kind: "official-dom",
      revision,
      observedAt: "2026-08-22T16:00:00.000Z",
      confidence: 0.7,
      colorRoles: {
        ink: evidence("#111111", "official:roles", 0.7, "2026-08-22T16:00:00.000Z"),
        surface: evidence("#FFFFFF", "official:roles", 0.7, "2026-08-22T16:00:00.000Z"),
        accent: evidence("#0055CC", "official:roles", 0.7, "2026-08-22T16:00:00.000Z"),
        action: evidence("#E11D48", "official:button", 0.7, "2026-08-22T16:00:00.000Z")
      },
      colorRoleSpecificity: {
        ink: "explicit",
        surface: "explicit",
        accent: "explicit",
        action: "explicit"
      }
    };
    const freshBrandfetch: BrandSystemEvidenceSource = {
      ref: "brandfetch:roles",
      kind: "brandfetch",
      revision,
      observedAt: "2026-08-22T17:30:00.000Z",
      confidence: 0.99,
      colorRoles: {
        ink: evidence("#003300", "brandfetch:roles", 0.99, "2026-08-22T17:30:00.000Z"),
        surface: evidence("#F0FFF0", "brandfetch:roles", 0.99, "2026-08-22T17:30:00.000Z"),
        accent: evidence("#00AA00", "brandfetch:roles", 0.99, "2026-08-22T17:30:00.000Z"),
        action: evidence("#00AA00", "brandfetch:roles", 0.99, "2026-08-22T17:30:00.000Z")
      },
      colorRoleSpecificity: {
        ink: "explicit",
        surface: "explicit",
        accent: "explicit",
        action: "explicit"
      }
    };
    const fresherOfficial: BrandSystemEvidenceSource = {
      ...olderOfficial,
      ref: "official:newer",
      observedAt: "2026-08-22T16:30:00.000Z",
      confidence: 0.55,
      colorRoles: {
        ...olderOfficial.colorRoles,
        accent: evidence("#0066DD", "official:newer", 0.55, "2026-08-22T16:30:00.000Z")
      }
    };
    const result = compile([olderOfficial, freshBrandfetch, fresherOfficial]);

    expect(result.value?.colorRoles).toMatchObject({
      ink: { value: "#111111", source: "official:roles" },
      surface: { value: "#FFFFFF", source: "official:roles" },
      accent: { value: "#0066DD", source: "official:newer" },
      action: { value: "#E11D48", source: "official:button" }
    });
    expect(result.value?.colorRoles.accent.value).not.toBe("#00AA00");
  });

  it("marks an obsolete compile stale and ignores stale source revisions", () => {
    const currentNeutral: BrandSystemEvidenceSource = {
      ref: "official:current",
      kind: "official-dom",
      revision,
      observedAt,
      confidence: 0.8,
      colorRoles: {
        ink: evidence("#111111", "official:current"),
        surface: evidence("#FFFFFF", "official:current")
      }
    };
    const staleAccent: BrandSystemEvidenceSource = {
      ref: "official:stale",
      kind: "visitor-supplied",
      revision: revision - 1,
      observedAt,
      confidence: 1,
      colorRoles: {
        ink: evidence("#000000", "official:stale", 1, observedAt, revision - 1),
        surface: evidence("#FFFFFF", "official:stale", 1, observedAt, revision - 1),
        accent: evidence("#FF00FF", "official:stale", 1, observedAt, revision - 1)
      }
    };
    const current = compile([currentNeutral, staleAccent]);
    const stale = compile([currentNeutral], {
      revision: revision - 1,
      activeRevision: revision
    });

    expect(current.value?.colorRoles.accent.value).toBe("#111111");
    expect(current.value?.colorRoles.accent.value).not.toBe("#FF00FF");
    expect(stale).toMatchObject({
      status: "stale",
      errorCode: "stale_revision",
      confidence: 0,
      evidenceRefs: []
    });
    expect(stale.value).toBeUndefined();
  });
});
