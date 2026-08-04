import type { BrandProfile, BrandReadiness } from "@/lib/types";

const canonicalDomain = (value: string) =>
  value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split(/[/?#]/)[0] ?? "";

function sourceMatchesDomain(profile: BrandProfile): boolean {
  try {
    const sourceHost = canonicalDomain(new URL(profile.sourceUrl).hostname);
    const expected = canonicalDomain(profile.domain);
    return sourceHost === expected || sourceHost.endsWith(`.${expected}`);
  } catch {
    return false;
  }
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
  const paletteReady = Boolean(
    palette &&
      palette.strategy !== "fallback" &&
      palette.confidence !== "low" &&
      profile.colors.length >= 3
  );
  const identityReady = profile.identity
    ? profile.identity.confirmationStatus === "confirmed" && profile.identity.confidence !== "low"
    : false;
  const sourceEvidenceReady = profile.source !== "fallback" && sourceMatchesDomain(profile);
  const reasons: string[] = [];
  if (!identityReady) reasons.push("Company identity still needs confirmation.");
  if (!logoReady) reasons.push("An official wordmark is not yet deliverable.");
  if (!paletteReady) reasons.push("Source-owned semantic colors are incomplete.");
  if (!sourceEvidenceReady) reasons.push("First-party source evidence is incomplete.");
  return {
    status:
      identityReady && logoReady && paletteReady && sourceEvidenceReady
        ? "ready"
        : "incomplete",
    identityReady,
    logoReady,
    paletteReady,
    sourceEvidenceReady,
    reasons
  };
}

export function withBrandReadiness(profile: BrandProfile): BrandProfile {
  return { ...profile, readiness: assessBrandReadiness(profile) };
}
