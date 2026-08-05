import follozeProfile from "../../research/brand-harvest/folloze/verified-runtime-profile.json" with { type: "json" };
import appleProfile from "../../research/brand-harvest/apple-ipad/verified-runtime-profile.json" with { type: "json" };
import sixsenseProfile from "../../research/brand-harvest/6sense-revvyai-2026-08-05/verified-runtime-profile.json" with { type: "json" };
import lillyProfile from "../../research/brand-harvest/lilly-home-2026-07-31/verified-runtime-profile.json" with { type: "json" };
import medidataProfile from "../../research/brand-harvest/medidata-logo-2026-07-31/verified-runtime-profile.json" with { type: "json" };
import serviceNowProfile from "../../research/brand-harvest/servicenow-home-2026-07-31/verified-runtime-profile.json" with { type: "json" };

import type { BrandProfile } from "@/lib/types";

export interface BrandPresentation {
  heroTheme: "light" | "dark";
  darkSurfaceColor: string;
  softSurfaceColor: string;
  supportingAccentColor: string;
  lightSurfaceAccentColor: string;
  lightTextColor: string;
  mutedTextColor: string;
  dividerColor: string;
  primaryButtonBackground: string;
  primaryButtonText: string;
  primaryButtonHover: string;
  primaryButtonActive: string;
  secondaryButtonBorder: string;
  secondaryButtonText: string;
  focusColor: string;
  buttonRadiusPx: number;
  buttonHeightPx: number;
  buttonBorderWidthPx: number;
  cardRadiusPx: number;
  fontFallback: "sans" | "serif";
}

export type PresentedBrandProfile = BrandProfile & {
  presentation?: BrandPresentation;
};

interface VerifiedRuntimeProfile {
  domain: string;
  companyName: string;
  sourceUrl: string;
  description: string;
  publicTopics: string[];
  logoUrl?: string;
  imageUrls: string[];
  colors: string[];
  primaryColor: string;
  accentColor: string;
  surfaceColor: string;
  displayFontFamily?: string;
  bodyFontFamily?: string;
  displayFontUrl?: string;
  bodyFontUrl?: string;
  logoDeliveryFallback?: {
    path: string;
  };
  presentation?: BrandPresentation;
}

const verifiedProfiles = [
  follozeProfile,
  appleProfile,
  sixsenseProfile,
  serviceNowProfile,
  medidataProfile,
  lillyProfile
] as VerifiedRuntimeProfile[];

function canonicalDomain(value: string): string {
  return value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split(/[/?#]/)[0] ?? "";
}

const SAFE_LOGO_FALLBACK_PATH =
  /^(?:public\/verified-brands\/[a-z0-9-]+\/[a-z0-9._-]+\.(?:png|svg|webp)(?:\.b64)?|public\/brand\/folloze-logo\.svg)$/;

export interface VerifiedBrandLogoFallback {
  path: string;
  sourceUrl: string;
}

/**
 * Resolve only compile-time reviewed logo assets. Both the domain and the
 * exact harvested source URL must match, so a session cannot use this helper
 * to turn an arbitrary URL into a local file read.
 */
export function verifiedBrandLogoFallbackFor(
  domain: string,
  sourceUrl: string
): VerifiedBrandLogoFallback | undefined {
  const profile = verifiedProfiles.find(
    (candidate) => canonicalDomain(candidate.domain) === canonicalDomain(domain)
  );
  const path = profile?.logoDeliveryFallback?.path;
  if (
    !profile ||
    !profile.logoUrl ||
    sourceUrl !== profile.logoUrl ||
    !path ||
    !SAFE_LOGO_FALLBACK_PATH.test(path)
  ) {
    return undefined;
  }
  return { path, sourceUrl: profile.logoUrl };
}

/**
 * Browser-backed Brand Harvester profiles are the safe fallback for public
 * sites that block ordinary server fetches. The generated JSON beside each
 * profile is the reviewable provenance artifact; this registry stays small
 * and only contains manually verified captures.
 */
export function verifiedBrandProfileFor(domain: string): PresentedBrandProfile | undefined {
  const profile = verifiedProfiles.find(
    (candidate) => canonicalDomain(candidate.domain) === canonicalDomain(domain)
  );
  if (!profile) return undefined;
  return {
    domain: canonicalDomain(profile.domain),
    companyName: profile.companyName,
    description: profile.description,
    publicContext: [profile.description, ...profile.publicTopics].join(" ").slice(0, 2400),
    publicTopics: [...profile.publicTopics],
    logoUrl: profile.logoUrl,
    imageUrls: [...profile.imageUrls],
    colors: [...profile.colors],
    primaryColor: profile.primaryColor,
    accentColor: profile.accentColor,
    surfaceColor: profile.surfaceColor,
    displayFontFamily: profile.displayFontFamily,
    bodyFontFamily: profile.bodyFontFamily,
    displayFontUrl: profile.displayFontUrl,
    bodyFontUrl: profile.bodyFontUrl,
    sourceUrl: profile.sourceUrl,
    source: "brand-harvester",
    diagnostics: {
      logo: {
        strategy: profile.logoUrl ? "verified-profile" : "none",
        imageCandidateCount: 0,
        rejectedImageCount: 0,
        inlineSvgCandidateCount: 0,
        resolutionComplete: true
      },
      palette: {
        strategy: "verified-profile",
        confidence: "high",
        candidateCount: profile.colors.length,
        semanticCandidateCount: profile.colors.length,
        rejectedCandidateCount: 0,
        gradientCandidateCount: 0,
        resolutionComplete: true
      }
    },
    ...(profile.presentation ? { presentation: { ...profile.presentation } } : {})
  };
}

export function brandPresentationFor(profile: BrandProfile): BrandPresentation | undefined {
  return (profile as PresentedBrandProfile).presentation;
}
