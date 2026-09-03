import type { AssetRenderPlan } from "@/lib/asset-allocation";
import type { BrandProfile, ExperienceAsset, TryMeSession } from "@/lib/types";
import { isBrandfetchHostedLogoUrl } from "@/lib/brandfetch-logo";

const SAFE_SESSION_ID = /^[a-z0-9_-]{1,128}$/i;
const IMAGE_SLOT = /^(seller|target)-(logo|image-([0-5]))$/;
const IMAGE_DELIVERY_PATH =
  /^\/api\/sessions\/([a-z0-9_-]{1,128})\/image\/(seller|target)-(logo|image-([0-5]))(?:\?v=([1-9][0-9]{0,9}))?$/i;

export type ImageSlot =
  | "seller-logo"
  | "target-logo"
  | `seller-image-${0 | 1 | 2 | 3 | 4 | 5}`
  | `target-image-${0 | 1 | 2 | 3 | 4 | 5}`;

export interface ImageDeliverySources {
  sellerLogo?: string;
  targetLogo?: string;
  sellerImages: string[];
  targetImages: string[];
}

export function parseImageSlot(value: string): ImageSlot | undefined {
  return IMAGE_SLOT.test(value) ? (value as ImageSlot) : undefined;
}

export function imageDeliveryPath(
  sessionId: string,
  slot: ImageSlot,
  version?: number
): string | undefined {
  if (!SAFE_SESSION_ID.test(sessionId)) return undefined;
  const versionSuffix = version === undefined
    ? ""
    : Number.isSafeInteger(version) && version > 0 && version <= 9_999_999_999
      ? `?v=${version}`
      : undefined;
  if (versionSuffix === undefined) return undefined;
  return `/api/sessions/${sessionId}/image/${slot}${versionSuffix}`;
}

/**
 * Generated HTML may use only this exact same-origin, session-bound route
 * shape. Only a bounded numeric revision query is accepted; fragments,
 * absolute URLs, arbitrary queries, and arbitrary relative paths are rejected.
 */
export function isImageDeliveryPath(value: string): boolean {
  return IMAGE_DELIVERY_PATH.test(value);
}

export function sourceImageUrlForSlot(
  session: Pick<
    TryMeSession,
    "answers" | "availableAssets" | "brand" | "targetBrand"
  > | null | undefined,
  slot: ImageSlot
): string | undefined {
  if (!session) return undefined;
  const sources = imageDeliverySources(session);
  const match = IMAGE_SLOT.exec(slot);
  if (!match) return undefined;
  const seller = match[1] === "seller";
  if (match[2] === "logo") return seller ? sources.sellerLogo : sources.targetLogo;
  const index = Number.parseInt(match[3] ?? "", 10);
  if (!Number.isInteger(index)) return undefined;
  return seller ? sources.sellerImages[index] : sources.targetImages[index];
}

function uniqueBounded(values: Array<string | undefined>, maximum: number): string[] {
  return values
    .filter((value): value is string => Boolean(value))
    .filter((value, index, candidates) => candidates.indexOf(value) === index)
    .slice(0, maximum);
}

function selectedAssetsFor(
  session: Pick<TryMeSession, "answers" | "availableAssets">
): ExperienceAsset[] {
  const selectedIds = new Set(session.answers.selectedAssetIds ?? []);
  if (!selectedIds.size) return [];
  return (session.availableAssets ?? []).filter((asset) => selectedIds.has(asset.id));
}

/**
 * The slot registry is deterministic for the current session. Explicitly
 * selected, server-approved assets take precedence; otherwise the bounded
 * harvested profile is used. The route never accepts a source URL from the
 * browser.
 */
export function imageDeliverySources(
  session: Pick<
    TryMeSession,
    "answers" | "availableAssets" | "brand" | "targetBrand"
  >,
  sellerFallback?: BrandProfile,
  targetFallback?: BrandProfile
): ImageDeliverySources {
  const seller = session.brand ?? sellerFallback;
  const target = session.targetBrand ?? targetFallback;
  const selected = selectedAssetsFor(session);
  const sellerImages = selected
    .filter((asset) => asset.kind === "seller-image")
    .map((asset) => asset.url);
  const targetImages = selected
    .filter((asset) => asset.kind === "target-image")
    .map((asset) => asset.url);
  const selectedSellerLogo = selected.find((asset) => asset.kind === "seller-logo")?.url;
  const selectedTargetLogo = selected.find((asset) => asset.kind === "target-logo")?.url;
  const logoSource = (profile: BrandProfile | undefined, selectedUrl: string | undefined) => {
    if (!profile) return selectedUrl;
    if (
      isBrandfetchHostedLogoUrl(selectedUrl, profile.domain) ||
      isBrandfetchHostedLogoUrl(profile.logoUrl, profile.domain)
    ) {
      // Logo API terms require browser hotlinking. Never send this URL through
      // the server-side image proxy.
      return undefined;
    }
    if (!selectedUrl || selectedUrl === profile.logoUrl || isImageDeliveryPath(selectedUrl)) {
      return profile.logoSourceUrl ??
        (isImageDeliveryPath(profile.logoUrl ?? "")
          ? profile.portableLogo ? profile.logoUrl : undefined
          : profile.logoUrl);
    }
    return selectedUrl;
  };

  return {
    sellerLogo: logoSource(seller, selectedSellerLogo),
    targetLogo: logoSource(target, selectedTargetLogo),
    sellerImages: uniqueBounded(
      sellerImages.length ? sellerImages : (seller?.imageUrls ?? []),
      6
    ),
    targetImages: uniqueBounded(
      targetImages.length ? targetImages : (target?.imageUrls ?? []),
      6
    )
  };
}

/**
 * Bind every harvested logo to a session-scoped first-party route. The
 * original URL remains server-only for the pinned proxy, while portable logo
 * bytes remain server-only in the session record.
 */
export function brandWithSessionLogoDelivery(
  sessionId: string,
  role: "seller" | "target",
  profile: BrandProfile
): BrandProfile {
  if (isBrandfetchHostedLogoUrl(profile.logoUrl, profile.domain)) {
    return { ...profile, logoSourceUrl: undefined };
  }
  const originalSource = profile.logoSourceUrl ??
    (isImageDeliveryPath(profile.logoUrl ?? "") ? undefined : profile.logoUrl);
  const hasDeliverableLogo = Boolean(originalSource || profile.portableLogo);
  return {
    ...profile,
    logoSourceUrl: originalSource,
    logoUrl: hasDeliverableLogo
      ? imageDeliveryPath(sessionId, `${role}-logo`)
      : undefined
  };
}

function slotForSourceUrl(
  value: string | undefined,
  sources: ImageDeliverySources
): ImageSlot | undefined {
  if (!value) return undefined;
  if (value === sources.sellerLogo) return "seller-logo";
  if (value === sources.targetLogo) return "target-logo";

  const sellerIndex = sources.sellerImages.indexOf(value);
  if (sellerIndex >= 0 && sellerIndex <= 5) {
    return `seller-image-${sellerIndex}` as ImageSlot;
  }
  const targetIndex = sources.targetImages.indexOf(value);
  if (targetIndex >= 0 && targetIndex <= 5) {
    return `target-image-${targetIndex}` as ImageSlot;
  }
  return undefined;
}

/**
 * Rewrites a compiled asset plan onto session-scoped delivery paths.
 *
 * The plan is compiled from harvested evidence, so its sources are the
 * original third-party URLs. The renderer must never emit those. A placement
 * whose source has no approved slot is dropped rather than rewritten, which
 * leaves the section to its designed no-asset treatment.
 */
export function renderPlanWithFirstPartyImages(
  sessionId: string,
  plan: AssetRenderPlan,
  sources: ImageDeliverySources,
  version?: number
): AssetRenderPlan {
  return {
    ...plan,
    placements: plan.placements.flatMap((placement) => {
      const slot = slotForSourceUrl(placement.assetRef, sources);
      if (!slot) return [];
      const assetRef = imageDeliveryPath(sessionId, slot, version);
      return assetRef ? [{ ...placement, assetRef }] : [];
    })
  };
}

/**
 * Keeps seller imagery authoritative in the hero and product slots while
 * reserving one supporting slot for the named account. The selected account
 * image still has to pass through the session-bound delivery route before the
 * renderer can emit it.
 */
export function withTargetSupportingImage(
  plan: AssetRenderPlan,
  targetImageUrls: readonly string[]
): AssetRenderPlan {
  const targetImage = targetImageUrls.find((value) => /^https:\/\//i.test(value));
  if (!targetImage) return plan;
  const supportingIndex = plan.placements.findIndex(
    ({ semanticRole }) => semanticRole === "supporting"
  );
  const placement = {
    sectionId: "supporting",
    semanticRole: "supporting" as const,
    assetRef: targetImage,
    reusable: false,
    required: false
  };
  const placements = [...plan.placements];
  if (supportingIndex >= 0) placements.splice(supportingIndex, 1, placement);
  else placements.push(placement);
  return {
    ...plan,
    placements,
    treatments: plan.treatments.filter(
      ({ semanticRole }) => semanticRole !== "supporting"
    )
  };
}

/**
 * Preserve harvested source URLs in the session, but hand the HTML renderer a
 * cloned profile containing only slot-scoped first-party delivery paths.
 */
export function brandWithFirstPartyImages(
  sessionId: string,
  profile: BrandProfile,
  sources: ImageDeliverySources,
  version?: number
): BrandProfile {
  const directBrandfetchLogo = isBrandfetchHostedLogoUrl(profile.logoUrl, profile.domain)
    ? profile.logoUrl
    : undefined;
  const logoSlot = directBrandfetchLogo
    ? undefined
    : slotForSourceUrl(profile.logoSourceUrl ?? profile.logoUrl, sources);
  const logoUrl = directBrandfetchLogo ??
    (logoSlot ? imageDeliveryPath(sessionId, logoSlot, version) : undefined);
  const imageUrls = profile.imageUrls
    .map((value) => slotForSourceUrl(value, sources))
    .filter((slot): slot is ImageSlot => Boolean(slot))
    .map((slot) => imageDeliveryPath(sessionId, slot, version))
    .filter((value): value is string => Boolean(value))
    .filter((value, index, values) => values.indexOf(value) === index);

  return {
    ...profile,
    logoUrl,
    logoUrlOnDark: directBrandfetchLogo ? profile.logoUrlOnDark : undefined,
    imageUrls
  };
}
