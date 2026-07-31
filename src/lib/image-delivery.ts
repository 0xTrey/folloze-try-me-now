import type { BrandProfile, ExperienceAsset, TryMeSession } from "@/lib/types";

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

  return {
    sellerLogo:
      selected.find((asset) => asset.kind === "seller-logo")?.url ?? seller?.logoUrl,
    targetLogo:
      selected.find((asset) => asset.kind === "target-logo")?.url ?? target?.logoUrl,
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
 * Preserve harvested source URLs in the session, but hand the HTML renderer a
 * cloned profile containing only slot-scoped first-party delivery paths.
 */
export function brandWithFirstPartyImages(
  sessionId: string,
  profile: BrandProfile,
  sources: ImageDeliverySources,
  version?: number
): BrandProfile {
  const logoSlot = slotForSourceUrl(profile.logoUrl, sources);
  const logoUrl = logoSlot ? imageDeliveryPath(sessionId, logoSlot, version) : undefined;
  const imageUrls = profile.imageUrls
    .map((value) => slotForSourceUrl(value, sources))
    .filter((slot): slot is ImageSlot => Boolean(slot))
    .map((slot) => imageDeliveryPath(sessionId, slot, version))
    .filter((value): value is string => Boolean(value))
    .filter((value, index, values) => values.indexOf(value) === index);

  return {
    ...profile,
    logoUrl,
    imageUrls
  };
}
