import serviceNowProfile from "../../research/brand-harvest/servicenow-home-2026-07-31/verified-runtime-profile.json";

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
  presentation: BrandPresentation;
}

const verifiedProfiles = [serviceNowProfile as VerifiedRuntimeProfile];

function canonicalDomain(value: string): string {
  return value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split(/[/?#]/)[0] ?? "";
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
    presentation: { ...profile.presentation }
  };
}

export function brandPresentationFor(profile: BrandProfile): BrandPresentation | undefined {
  return (profile as PresentedBrandProfile).presentation;
}
