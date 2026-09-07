import { assessBrandReadiness } from "@/lib/brand-readiness";
import {
  assetDuplicateKey,
  isPrivateHost,
  rejectAssetCandidate
} from "@/lib/asset-allocation";
import type { BrandAssetPurpose } from "@/lib/brand-system";
import type { BrandImageMetadata, BrandProfile } from "@/lib/types";
import type { BuyerDecisionBrief, BuyerSectionAssignment } from "./buyer-decision-journey";
import type { InteractionRoleV2, VisualRoleV2 } from "./three-family-contract";
import { compilerDigest, compilerTextDigest } from "./compiler-digest";

type BrandReadiness = "verified" | "partial" | "unknown";
type BrandDensity = "open" | "balanced" | "dense" | "unknown";
type BrandHero = "light" | "dark" | "unknown";
type BrandMotif = "none" | "soft-gradient" | "radial-glow" | "technical-grid";
type ArtDirectionTreatment = "type-led" | "editorial" | "product-led" | "evidence-led";
type ArtDirectionPrinciple = "observed-brand-system" | "restrained-evidence";
type MobileIntent =
  | "copy-first-stack-visual-second"
  | "evidence-first"
  | "steps-in-source-order"
  | "choices-after-context"
  | "context-before-action"
  | "criteria-in-reading-order"
  | "scenario-in-reading-order"
  | "observations-in-reading-order";

export type BuildBrandKit = {
  version: "build-brand-kit-v1";
  digest: string;
  source: { authority: BrandProfile["source"]; evidenceRefs: string[] };
  readiness: BrandReadiness;
  visual: {
    primary: string;
    accent: string;
    surface: string;
    displayFont: string;
    bodyFont: string;
    density: BrandDensity;
    hero: BrandHero;
    motif?: BrandMotif;
  };
  voice: { description?: string; provenance: string; status: "sourced" | "unknown" };
  artDirection: { principle: ArtDirectionPrinciple; treatment: ArtDirectionTreatment };
  assetRoles: {
    ref: string;
    role: "hero" | "supporting";
    /** Asset purpose is a composition hint, never proof of a customer result. */
    /** Preserved for existing consumers. `proof` is never inferred from a URL. */
    purpose: "product" | "context" | "proof" | "unknown";
    observedPurpose: BrandAssetPurpose;
    customerResultEvidence: "not-proven";
    metadata?: { contentHash?: string; width?: number; height?: number };
  }[];
  invariants: string[];
};

export type SectionDesignDirective = {
  sectionId: string;
  semantic: {
    role: BuyerSectionAssignment["role"];
    question: string;
    conclusion: string;
    evidenceRefs: string[];
    transition: string;
  };
  visual: {
    role: VisualRoleV2;
    occupancy: { headline: readonly [number, number]; body: readonly [number, number] };
    mobileIntent: MobileIntent;
    readingOrder: "semantic-first";
    interaction?: InteractionRoleV2;
  };
};

const clean = (value: string | undefined) => value?.replace(/\s+/g, " ").trim() || undefined;

/** A source or image reference must be fetchable in a public browser without credentials or tokens. */
function safePublicHttpsUrl(value: string | undefined): string | undefined {
  const candidate = clean(value);
  if (!candidate) return undefined;
  try {
    const url = new URL(candidate);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      url.search ||
      url.hash ||
      isPrivateHost(url.hostname)
    ) return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

function domainName(value: string | undefined): string | undefined {
  const candidate = clean(value)?.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "");
  return candidate?.split(/[/?#]/)[0] || undefined;
}

/** Evidence from an unrelated public host does not establish this brand's authority. */
function safeBrandEvidenceUrl(value: string | undefined, brand: BrandProfile): string | undefined {
  const safe = safePublicHttpsUrl(value);
  if (!safe) return undefined;
  const allowed = [brand.domain, brand.canonicalDomain, ...(brand.domainAliases ?? [])]
    .map(domainName)
    .filter((domain): domain is string => Boolean(domain));
  const host = new URL(safe).hostname.toLowerCase().replace(/^www\./, "");
  return allowed.some((domain) => host === domain || host.endsWith(`.${domain}`)) ? safe : undefined;
}

function safeAsset(ref: string, metadata: BrandImageMetadata | undefined) {
  if (!safePublicHttpsUrl(ref)) return false;
  return !rejectAssetCandidate({
    assetRef: ref,
    evidenceRef: ref,
    purpose: "supporting",
    sourceAuthority: "seller_official",
    renderStatus: "unknown",
    ...(metadata?.width !== undefined ? { width: metadata.width } : {}),
    ...(metadata?.height !== undefined ? { height: metadata.height } : {})
  });
}

function observedAssetPurpose(ref: string): BrandAssetPurpose {
  const descriptor = new URL(ref).pathname.toLowerCase();
  if (/\b(?:dashboard|interface|product-ui|platform|console|workspace|screen)\b/.test(descriptor)) return "product";
  if (/\b(?:diagram|architecture|workflow|schematic)\b/.test(descriptor)) return "diagram";
  if (/\b(?:people|team|customer|technician|worker|photo|office|field)\b/.test(descriptor)) return "context";
  // A filename can describe an image, but can never establish a customer result.
  return "unknown";
}

function compatibleAssetPurpose(purpose: BrandAssetPurpose): "product" | "context" | "proof" | "unknown" {
  return purpose === "product" ? "product" : purpose === "context" ? "context" : "unknown";
}

function visualDensity(brand: BrandProfile, designTrusted: boolean): BrandDensity {
  if (!designTrusted) return "unknown";
  const spacing = brand.designDna?.spacing;
  if (!spacing || (spacing.sectionBlockPx === undefined && spacing.gridGapPx === undefined)) return "unknown";
  if ((spacing.sectionBlockPx ?? 80) >= 112 && (spacing.gridGapPx ?? 24) >= 24) return "open";
  if ((spacing.sectionBlockPx ?? 80) <= 72 && (spacing.gridGapPx ?? 16) <= 12) return "dense";
  return "balanced";
}

function artDirection(kit: Pick<BuildBrandKit, "readiness" | "visual" | "assetRoles">): BuildBrandKit["artDirection"] {
  if (kit.readiness === "unknown") return { principle: "restrained-evidence", treatment: "type-led" };
  if (kit.assetRoles.some(({ observedPurpose }) => observedPurpose === "product" || observedPurpose === "diagram")) {
    return { principle: "observed-brand-system", treatment: "product-led" };
  }
  if (kit.assetRoles.length > 0) return { principle: "observed-brand-system", treatment: "evidence-led" };
  if (kit.visual.displayFont !== "unknown" || kit.visual.bodyFont !== "unknown") {
    return { principle: "observed-brand-system", treatment: "editorial" };
  }
  return { principle: "restrained-evidence", treatment: "type-led" };
}

function cappedRange(range: readonly [number, number], ceiling: number): readonly [number, number] {
  const normalizedCeiling = Math.max(0, Math.floor(ceiling));
  const low = Math.min(normalizedCeiling, Math.max(0, Math.floor(range[0])));
  const high = Math.min(normalizedCeiling, Math.max(low, Math.floor(range[1])));
  return [low, high];
}

function roleCeilings(role: VisualRoleV2, density: BrandDensity): { headline: number; body: number } {
  const base: Record<VisualRoleV2, { headline: number; body: number }> = {
    "hero-image-or-type": { headline: 12, body: 40 },
    "evidence-type": { headline: 10, body: 48 },
    workflow: { headline: 10, body: 56 },
    "path-selector": { headline: 9, body: 42 },
    "proof-artifact": { headline: 10, body: 48 },
    "cta-panel": { headline: 9, body: 32 },
    criteria: { headline: 9, body: 48 },
    "scenario-map": { headline: 9, body: 48 },
    "account-observations": { headline: 9, body: 44 }
  };
  const multiplier = density === "dense" ? 0.8 : density === "open" ? 1.1 : density === "unknown" ? 0.9 : 1;
  return {
    headline: Math.floor(base[role].headline * multiplier),
    body: Math.floor(base[role].body * multiplier)
  };
}

function mobileIntent(role: VisualRoleV2): MobileIntent {
  switch (role) {
    case "hero-image-or-type": return "copy-first-stack-visual-second";
    case "evidence-type":
    case "proof-artifact": return "evidence-first";
    case "workflow": return "steps-in-source-order";
    case "path-selector": return "choices-after-context";
    case "cta-panel": return "context-before-action";
    case "criteria": return "criteria-in-reading-order";
    case "scenario-map": return "scenario-in-reading-order";
    case "account-observations": return "observations-in-reading-order";
  }
}

export function compileBuildBrandKit({ brand, brief }: { brand: BrandProfile; brief: BuyerDecisionBrief }): BuildBrandKit {
  const authorityEvidence = brand.source === "fallback" ? undefined : safeBrandEvidenceUrl(brand.sourceUrl, brand);
  const storedReadiness = brand.readiness;
  const assessedReadiness = storedReadiness ?? assessBrandReadiness(brand);
  const sourceEvidenceReady = Boolean(authorityEvidence) && assessedReadiness.sourceEvidenceReady;
  const readiness: BrandReadiness = brand.source === "fallback"
    ? "unknown"
    : assessedReadiness.status === "ready" && sourceEvidenceReady ? "verified" : "partial";
  const paletteTrusted = brand.source !== "fallback" && Boolean(authorityEvidence) && assessedReadiness.paletteReady;
  const designTrusted = brand.source !== "fallback" && Boolean(authorityEvidence) && brand.designDna?.confidence !== "low";
  const voiceProvenance = safeBrandEvidenceUrl(brief.knowledge.voice.provenance, brand);
  const voiceDescription = brief.knowledge.voice.status === "sourced" && voiceProvenance
    ? clean(brief.knowledge.voice.description)
    : undefined;
  const seen = new Set<string>();
  const assetRoles = brand.imageUrls
    .map((ref) => ({ ref, metadata: brand.imageMetadata?.[ref] }))
    .filter(({ ref, metadata }) => safeAsset(ref, metadata))
    .filter(({ ref, metadata }) => {
      const key = metadata?.contentHash?.trim().toLowerCase() || assetDuplicateKey({
        assetRef: ref,
        evidenceRef: authorityEvidence ?? "",
        purpose: "supporting",
        sourceAuthority: "seller_official"
      });
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 6)
    .map(({ ref, metadata }, index) => {
      const observedPurpose = observedAssetPurpose(ref);
      return {
        ref,
        role: index === 0 ? "hero" as const : "supporting" as const,
        observedPurpose,
        purpose: compatibleAssetPurpose(observedPurpose),
        customerResultEvidence: "not-proven" as const,
        ...(metadata && (metadata.contentHash || metadata.width !== undefined || metadata.height !== undefined)
          ? { metadata: {
              ...(metadata.contentHash?.trim() ? { contentHash: metadata.contentHash.trim().toLowerCase() } : {}),
              ...(metadata.width !== undefined ? { width: metadata.width } : {}),
              ...(metadata.height !== undefined ? { height: metadata.height } : {})
            } }
          : {})
      };
    });
  const visual: BuildBrandKit["visual"] = {
    primary: paletteTrusted ? clean(brand.primaryColor) ?? "unknown" : "unknown",
    accent: paletteTrusted ? clean(brand.accentColor) ?? "unknown" : "unknown",
    surface: paletteTrusted ? clean(brand.surfaceColor) ?? "unknown" : "unknown",
    displayFont: designTrusted ? clean(brand.displayFontFamily) ?? "unknown" : "unknown",
    bodyFont: designTrusted ? clean(brand.bodyFontFamily) ?? "unknown" : "unknown",
    density: visualDensity(brand, designTrusted),
    hero: designTrusted ? brand.designDna?.theme?.hero ?? "unknown" : "unknown",
    ...(designTrusted && brand.designDna?.theme?.motif ? { motif: brand.designDna.theme.motif } : {})
  };
  const partialKit = { readiness, visual, assetRoles };
  const voice = {
    ...(voiceDescription ? { description: voiceDescription } : {}),
    provenance: voiceProvenance ?? "unknown",
    status: voiceDescription ? "sourced" as const : "unknown" as const
  };
  const digest = compilerDigest("build-brand-kit", {
    authority: brand.source,
    canonicalDomain: domainName(brand.canonicalDomain ?? brand.domain),
    sourceEvidence: authorityEvidence,
    readiness: { ...assessedReadiness, sourceEvidenceReady },
    visualInputs: {
      colors: brand.colors,
      primary: clean(brand.primaryColor),
      accent: clean(brand.accentColor),
      surface: clean(brand.surfaceColor),
      displayFont: clean(brand.displayFontFamily),
      bodyFont: clean(brand.bodyFontFamily),
      displayFontUrl: safePublicHttpsUrl(brand.displayFontUrl),
      bodyFontUrl: safePublicHttpsUrl(brand.bodyFontUrl),
      designDna: brand.designDna
    },
    visual,
    assets: assetRoles.map(({ ref, purpose, observedPurpose, customerResultEvidence, metadata }) => ({ ref, purpose, observedPurpose, customerResultEvidence, metadata })),
    voice: { description: compilerTextDigest(voice.description), provenance: voice.provenance, status: voice.status }
  });
  return {
    version: "build-brand-kit-v1",
    digest,
    source: { authority: brand.source, evidenceRefs: authorityEvidence ? [authorityEvidence] : [] },
    readiness,
    visual,
    voice,
    artDirection: artDirection(partialKit),
    assetRoles,
    invariants: ["Preserve verified brand tokens", "Unknown evidence remains unknown", "No new interaction controls", "No eyebrow-headline-dek stack", "No leading-zero labels"]
  };
}

export function planSectionDesign({ kit, assignment }: { kit: BuildBrandKit; assignment: BuyerSectionAssignment }): SectionDesignDirective {
  const ceilings = roleCeilings(assignment.visualRole, kit.visual.density);
  return {
    sectionId: assignment.id,
    semantic: {
      role: assignment.role,
      question: assignment.buyerQuestion,
      conclusion: assignment.desiredConclusion,
      evidenceRefs: [...assignment.claimRefs],
      transition: assignment.transition
    },
    visual: {
      role: assignment.visualRole,
      occupancy: {
        headline: cappedRange(assignment.wordBudget.headline, ceilings.headline),
        body: cappedRange(assignment.wordBudget.body, ceilings.body)
      },
      mobileIntent: mobileIntent(assignment.visualRole),
      readingOrder: "semantic-first",
      ...(assignment.interaction ? { interaction: assignment.interaction } : {})
    }
  };
}
