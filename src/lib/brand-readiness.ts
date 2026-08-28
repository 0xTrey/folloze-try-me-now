import type { BrandProfile, BrandReadiness } from "@/lib/types";

export const BRAND_HELP_PROMPT =
  "We found the company, but we need a clearer brand source. Add a logo, brand guide, screenshot, or a more specific page URL, and we will continue from the research already completed.";

export function brandHelpRequest(
  kind: "logo" | "brand_guide" | "screenshot" | "source_url" = "source_url"
) {
  return { kind, prompt: BRAND_HELP_PROMPT };
}

export type ProspectBrandState =
  | "researching"
  | "verified"
  | "partial"
  | "unavailable";

export interface ProspectBrandPresentation {
  state: ProspectBrandState;
  label: string;
  detail: string;
}

const canonicalDomain = (value: string) =>
  value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split(/[/?#]/)[0] ?? "";

function sourceMatchesDomain(profile: BrandProfile): boolean {
  try {
    const sourceHost = canonicalDomain(new URL(profile.sourceUrl).hostname);
    const expected = canonicalDomain(profile.domain);
    const allowed = new Set([
      expected,
      canonicalDomain(profile.canonicalDomain ?? ""),
      ...(profile.domainAliases ?? []).map(canonicalDomain)
    ].filter(Boolean));
    return [...allowed].some((domain) => sourceHost === domain || sourceHost.endsWith(`.${domain}`));
  } catch {
    return false;
  }
}

function canonicalHex(value: string | undefined): string | undefined {
  const normalized = value?.trim().toUpperCase();
  if (!normalized) return undefined;
  if (/^#[0-9A-F]{6}$/.test(normalized)) return normalized;
  if (!/^#[0-9A-F]{3}$/.test(normalized)) return undefined;
  const [red, green, blue] = normalized.slice(1);
  return `#${red}${red}${green}${green}${blue}${blue}`;
}

function luminance(color: string): number {
  const channels = [1, 3, 5].map((index) => {
    const channel = Number.parseInt(color.slice(index, index + 2), 16) / 255;
    return channel <= 0.03928
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
}

function contrastRatio(left: string, right: string): number {
  const [lighter, darker] = [luminance(left), luminance(right)].sort((a, b) => b - a);
  return (lighter! + 0.05) / (darker! + 0.05);
}

/**
 * The single prospect-facing interpretation of brand research. It never treats
 * profile existence or a terminal worker state as proof of usable visual
 * evidence.
 */
export function prospectBrandPresentation(
  profile: {
    source?: BrandProfile["source"];
    readiness?: Pick<
      BrandReadiness,
      "identityReady" | "logoReady" | "paletteReady" | "sourceEvidenceReady"
    >;
  } | undefined,
  companyName: string,
  stageStatus: "pending" | "running" | "complete" | "fallback" | "failed"
): ProspectBrandPresentation {
  const readiness = profile?.readiness;
  if (stageStatus === "running" || stageStatus === "pending") {
    return {
      state: "researching",
      label: `Researching ${companyName}'s visual identity`,
      detail: "Public identity, logo, palette, and imagery evidence are still being researched."
    };
  }
  const verified = Boolean(
    profile &&
      profile.source !== "fallback" &&
      readiness?.identityReady &&
      readiness.logoReady &&
      readiness.paletteReady &&
      readiness.sourceEvidenceReady
  );
  if (verified) {
    return {
      state: "verified",
      label: `${companyName} brand verified`,
      detail: "Verified identity, logo, and palette evidence are shaping the page."
    };
  }
  if (
    !profile ||
    profile.source === "fallback" ||
    stageStatus === "failed" ||
    (stageStatus === "fallback" && !readiness?.identityReady)
  ) {
    return {
      state: "unavailable",
      label: `${companyName} visual research unavailable`,
      detail: "Visual evidence was unavailable, so the preview uses an intentional neutral treatment."
    };
  }
  return {
    state: "partial",
    label: `${companyName} identity found`,
    detail: "Logo, palette, or imagery evidence is incomplete, so the preview stays neutral where needed."
  };
}

/**
 * "Ready" means the profile has enough first-party evidence to render and
 * explain, not merely that every lookup has stopped running.
 */
export function assessBrandReadiness(profile: BrandProfile): BrandReadiness {
  const logoStrategy = profile.diagnostics?.logo.strategy ?? "none";
  const logoReady = Boolean(
    (profile.portableLogo || profile.logoSourceUrl || profile.logoUrl) &&
      !["none", "favicon", "inline-svg-unportable"].includes(logoStrategy)
  );
  const palette = profile.diagnostics?.palette;
  const ink = canonicalHex(profile.primaryColor);
  const surface = canonicalHex(profile.surfaceColor);
  const action = canonicalHex(
    profile.designDna?.buttons?.primaryBackground ?? profile.accentColor
  );
  const distinctColors = new Set(profile.colors.map(canonicalHex).filter(Boolean));
  const paletteReady = Boolean(
    palette &&
      palette.strategy !== "fallback" &&
      palette.confidence !== "low" &&
      distinctColors.size >= 3 &&
      ink &&
      surface &&
      action &&
      ink !== surface &&
      action !== surface &&
      contrastRatio(ink, surface) >= 3
  );
  const identityReady = profile.identity
    ? profile.identity.confirmationStatus === "confirmed" && profile.identity.confidence !== "low"
    : false;
  const sourceEvidenceReady = profile.source !== "fallback" && sourceMatchesDomain(profile);
  const designFidelity = profile.diagnostics?.designFidelity;
  const typographyEvidence = Boolean(
    profile.displayFontFamily ||
      profile.bodyFontFamily ||
      profile.designDna?.typography?.fallback ||
      profile.designDna?.typography?.headingWeight ||
      profile.designDna?.typography?.bodyWeight
  );
  const controlGeometryEvidence = Boolean(
    profile.designDna?.buttons?.radiusPx !== undefined ||
      profile.designDna?.buttons?.heightPx !== undefined ||
      profile.designDna?.buttons?.borderWidthPx !== undefined
  );
  const cardGeometryEvidence = Boolean(
    profile.designDna?.cards?.radiusPx !== undefined ||
      profile.designDna?.cards?.borderWidthPx !== undefined ||
      profile.designDna?.cards?.shadow
  );
  const designReady = Boolean(
    profile.designDna &&
      profile.designDna.confidence !== "low" &&
      typographyEvidence &&
      controlGeometryEvidence &&
      cardGeometryEvidence &&
      (designFidelity
        ? designFidelity.designReady
        : ["verified-profile", "legacy-presentation"].includes(profile.designDna.source))
  );
  const reasons: string[] = [];
  if (!identityReady) {
    reasons.push(
      profile.identity?.reasons.find((reason) => /alias|different domain|does not match/i.test(reason)) ??
        "Company identity still needs confirmation."
    );
  }
  if (!logoReady) reasons.push("An official wordmark is not yet deliverable.");
  if (!paletteReady) {
    const provider = profile.diagnostics?.providers?.brandfetchBrandApi;
    if (provider === "unauthorized") {
      reasons.push("Brandfetch color enrichment was rejected; verify the Brand API key and plan access.");
    } else if (provider === "rate_limited") {
      reasons.push("Brandfetch color enrichment is rate-limited; retry after the provider window resets.");
    } else if (provider === "not_found") {
      reasons.push("Brandfetch has no verified color profile for this canonical domain.");
    } else if (provider === "invalid_response") {
      reasons.push("Brandfetch returned incomplete brand metadata, so no colors were accepted.");
    } else {
      reasons.push("Source-owned semantic colors are incomplete.");
    }
  }
  if (!designReady) {
    const missing = designFidelity?.missing.slice(0, 4).join(", ");
    reasons.push(
      missing
        ? `Browser-backed design evidence is incomplete: ${missing}.`
        : "Browser-backed design evidence for components, typography, and layout is incomplete."
    );
  }
  if (!sourceEvidenceReady) reasons.push("First-party source evidence is incomplete.");
  return {
    status:
      identityReady && logoReady && paletteReady && designReady && sourceEvidenceReady
        ? "ready"
        : "incomplete",
    identityReady,
    logoReady,
    paletteReady,
    designReady,
    sourceEvidenceReady,
    reasons
  };
}

/**
 * An experience may render once the seller's identity and core visual authority
 * are trustworthy. Advanced design DNA (geometry, typography, and component
 * measurements) is enrichment, not a reason to discard the page. This
 * deliberately remains stricter than "profile exists" so an unrelated source,
 * missing logo, or invented palette can never silently become a page.
 */
export function canRenderExperienceWithBrand(profile: BrandProfile): boolean {
  const readiness = assessBrandReadiness(profile);
  return Boolean(
    readiness.sourceEvidenceReady &&
      readiness.identityReady &&
      readiness.logoReady &&
      readiness.paletteReady
  );
}

export function withBrandReadiness(profile: BrandProfile): BrandProfile {
  return { ...profile, readiness: assessBrandReadiness(profile) };
}
