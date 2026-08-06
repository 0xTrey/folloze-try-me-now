import type { BrandProfile, BrandReadiness } from "@/lib/types";

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
  const designFidelity = profile.diagnostics?.designFidelity;
  const designReady = Boolean(
    profile.designDna &&
      profile.designDna.confidence !== "low" &&
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

export function withBrandReadiness(profile: BrandProfile): BrandProfile {
  return { ...profile, readiness: assessBrandReadiness(profile) };
}
