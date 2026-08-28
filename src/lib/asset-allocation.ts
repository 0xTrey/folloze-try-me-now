/**
 * Global asset allocation for one experience.
 *
 * Every substantive image is placed at most once across the whole page. Logos
 * and explicitly decorative motifs may repeat. When credible imagery runs out,
 * the allocator returns a designed non-image treatment rather than duplicating
 * a photograph to fill a slot.
 */

export type AssetSemanticRole =
  | "hero"
  | "product"
  | "proof"
  | "process"
  | "people"
  | "supporting"
  | "logo"
  | "decorative";

export type AssetRejectionCode =
  | "unsafe_url"
  | "not_https"
  | "data_uri"
  | "javascript_url"
  | "private_host"
  | "too_small"
  | "extreme_aspect_ratio"
  | "transparent_utility"
  | "icon_or_navigation"
  | "tracking_pixel"
  | "render_failed"
  | "duplicate_crop"
  | "already_allocated"
  | "role_mismatch";

/** Roles whose imagery is allowed to appear more than once. */
const REUSABLE_ROLES = new Set<AssetSemanticRole>(["logo", "decorative"]);

export interface AssetCandidateInput {
  assetRef: string;
  evidenceRef: string;
  /** Declared or inferred semantic purpose of the image itself. */
  purpose: AssetSemanticRole;
  sourceAuthority: "visitor" | "seller_official" | "third_party";
  width?: number;
  height?: number;
  altText?: string;
  nearbyText?: string;
  sourcePage?: string;
  renderStatus?: "verified" | "failed" | "unknown";
  transparent?: boolean;
  utility?: boolean;
  decorative?: boolean;
  duplicateKey?: string;
  confidence?: number;
}

export interface AssetSlotRequest {
  sectionId: string;
  semanticRole: AssetSemanticRole;
  /** Wording near the slot, used to score topical fit. */
  slotContext?: string;
  /** Preferred width divided by height. */
  preferredAspectRatio?: number;
  required?: boolean;
  /**
   * Acceptable purposes in descending preference, used when no candidate
   * carries the slot's own role. Without it a slot treats every off-role
   * candidate as equally good and falls back to alphabetical tie-breaking.
   */
  rolePriority?: readonly AssetSemanticRole[];
}

export interface AssetAllocation {
  allocationKey: string;
  sectionId: string;
  semanticRole: AssetSemanticRole;
  assetRef: string;
  evidenceRef: string;
  sourceUrlHash: string;
  /** Canonical URL plus upstream duplicate fingerprint used to enforce one-use. */
  sourceIdentityKey: string;
  purpose: string;
  reusable: boolean;
  /** Mandatory slot. Its asset may not be reassigned to fill a lesser slot. */
  required: boolean;
  score: number;
}

export interface AssetSlotTreatment {
  sectionId: string;
  semanticRole: AssetSemanticRole;
  treatment: "designed_non_image";
  reason: "no_credible_asset_available" | "assets_exhausted";
}

export interface AssetRejection {
  assetRef: string;
  code: AssetRejectionCode;
}

export interface AssetAllocationPlan {
  version: "asset-allocator-v1";
  allocations: AssetAllocation[];
  treatments: AssetSlotTreatment[];
  rejections: AssetRejection[];
  substantiveCount: number;
  reusableCount: number;
}

export interface AllocateAssetsInput {
  candidates: readonly AssetCandidateInput[];
  slots: readonly AssetSlotRequest[];
  /** Hashes an asset URL for the trace. Injected so hashing stays trace-scoped. */
  hashSourceUrl: (assetRef: string) => string;
}

const AUTHORITY_SCORE = {
  visitor: 1,
  seller_official: 0.9,
  third_party: 0
} as const;

const ROLE_KEYWORDS: Record<AssetSemanticRole, RegExp> = {
  hero: /\b(hero|banner|masthead|headline|cover)\b/i,
  product: /\b(product|platform|dashboard|interface|console|workspace|screen|app|device|ui)\b/i,
  proof: /\b(proof|result|case[- ]?study|customer|testimonial|benchmark|report|metric|outcome)\b/i,
  process: /\b(process|workflow|step|diagram|architecture|schematic|how[- ]it[- ]works|integration)\b/i,
  people: /\b(people|person|team|portrait|staff|technician|operator|worker|crew|customer[- ]photo)\b/i,
  supporting: /\b(context|overview|detail|environment|scene|illustration)\b/i,
  logo: /\b(logo|wordmark|lockup|symbol|brandmark)\b/i,
  decorative: /\b(pattern|texture|gradient|motif|shape|abstract|background)\b/i
};

const ICON_OR_NAVIGATION =
  /\b(icon|sprite|nav(?:igation)?|footer|social|chevron|arrow|caret|bullet|avatar|badge|star|rating|favicon|spinner|loader|cookie|captcha|accessibility)\b/i;
const TRACKING_PIXEL = /\b(pixel|beacon|track(?:ing)?|analytics|1x1|spacer|blank)\b/i;

function descriptor(candidate: AssetCandidateInput): string {
  return [candidate.altText, candidate.nearbyText, candidate.assetRef]
    .filter(Boolean)
    .join(" ");
}

/** Reserved IPv4 space, in `[firstOctet, secondOctetLow, secondOctetHigh]` form. */
const RESERVED_IPV4: readonly (readonly [number, number, number])[] = [
  [0, 0, 255],
  [10, 0, 255],
  [100, 64, 127],
  [127, 0, 255],
  [169, 254, 254],
  [172, 16, 31],
  [192, 168, 168],
  [198, 18, 19]
];

function reservedIpv4(host: string): boolean {
  const octets = host.split(".");
  if (octets.length !== 4) return false;
  const parsed = octets.map((octet) => Number(octet));
  if (parsed.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
    return false;
  }
  const [first, second] = parsed as [number, number, number, number];
  return RESERVED_IPV4.some(
    ([target, low, high]) => first === target && second >= low && second <= high
  );
}

function reservedIpv6(host: string): boolean {
  const address = host.replace(/^\[|\]$/g, "").toLowerCase();
  if (!address.includes(":")) return false;
  if (address === "::" || address === "::1") return true;
  // Unique-local (fc00::/7) and link-local (fe80::/10).
  if (/^f[cd][0-9a-f]{0,2}:/.test(address)) return true;
  if (/^fe[89ab][0-9a-f]?:/.test(address)) return true;
  // IPv4-mapped forms tunnel a v4 address through v6. The URL parser rewrites
  // `::ffff:127.0.0.1` to `::ffff:7f00:1`, so both spellings need decoding.
  const dotted = address.match(/((?:\d{1,3}\.){3}\d{1,3})$/);
  if (dotted && reservedIpv4(dotted[1]!)) return true;
  const hex = address.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hex) {
    const packed = (Number.parseInt(hex[1]!, 16) << 16) | Number.parseInt(hex[2]!, 16);
    const octets = [24, 16, 8, 0].map((shift) => (packed >>> shift) & 0xff);
    return reservedIpv4(octets.join("."));
  }
  return false;
}

/**
 * True for any host an image must never be fetched from. A URL that resolves
 * inside our own network is a request-forgery vector, not an asset, and a bare
 * IP literal is never a legitimate brand CDN.
 */
export function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (!host) return true;
  if (
    host === "localhost"
    || host.endsWith(".localhost")
    || host.endsWith(".local")
    || host.endsWith(".internal")
    || host.endsWith(".home.arpa")
    || host.endsWith(".onion")
  ) {
    return true;
  }
  if (host.startsWith("[") || host.includes(":")) return reservedIpv6(host);
  if (reservedIpv4(host)) return true;
  // A hostname with no dot cannot be a public FQDN, so it resolves internally.
  return !host.includes(".");
}

/**
 * Intrinsic strength, independent of any slot. Used to pick which crop of a
 * duplicated image survives, where slot fit cannot break the tie because every
 * crop of one image fits every slot identically.
 */
function candidateStrength(candidate: AssetCandidateInput): number {
  return (
    qualityScore(candidate) * 0.5
    + AUTHORITY_SCORE[candidate.sourceAuthority] * 0.2
    + Math.min(1, Math.max(0, candidate.confidence ?? 0.5)) * 0.2
    + (candidate.altText?.trim() ? 0.1 : 0)
  );
}

/** Rejects anything that cannot be delivered safely or read as real imagery. */
export function rejectAssetCandidate(
  candidate: AssetCandidateInput
): AssetRejectionCode | undefined {
  const ref = candidate.assetRef.trim();
  if (!ref) return "unsafe_url";
  if (/^data:/i.test(ref)) return "data_uri";
  if (/^javascript:/i.test(ref)) return "javascript_url";

  // A rooted path is served by this application, so there is no host to vet.
  // Protocol-relative refs are not: they inherit an origin we do not control.
  const firstParty = ref.startsWith("/") && !ref.startsWith("//");
  if (!firstParty) {
    let url: URL;
    try {
      url = new URL(ref);
    } catch {
      return "unsafe_url";
    }
    if (url.protocol !== "https:") return "not_https";
    if (url.username || url.password || url.port) return "private_host";
    if (isPrivateHost(url.hostname)) return "private_host";
  }

  if (candidate.sourceAuthority === "third_party") return "role_mismatch";
  if (candidate.renderStatus === "failed") return "render_failed";

  const text = descriptor(candidate);
  if (TRACKING_PIXEL.test(text)) return "tracking_pixel";
  if (candidate.purpose !== "logo" && ICON_OR_NAVIGATION.test(text)) {
    return "icon_or_navigation";
  }
  if (candidate.transparent && candidate.utility) return "transparent_utility";

  const { width, height } = candidate;
  if (width !== undefined && height !== undefined) {
    if (!Number.isFinite(width) || !Number.isFinite(height)) return "too_small";
    const substantive = !REUSABLE_ROLES.has(candidate.purpose);
    if (substantive && (width <= 96 || height <= 96 || width * height < 80_000)) {
      return "too_small";
    }
    if (!substantive && (width <= 8 || height <= 8)) return "too_small";
    const ratio = width / height;
    if (substantive && (ratio > 12 || ratio < 1 / 12)) return "extreme_aspect_ratio";
  }
  return undefined;
}

/** Origin and path with query and casing normalized away. */
function assetSourcePath(assetRef: string): string {
  try {
    const url = new URL(assetRef);
    return `${url.origin.toLowerCase()}${url.pathname.toLowerCase()}`;
  } catch {
    return assetRef.trim().toLowerCase();
  }
}

/**
 * Collapses responsive crops of the same source image onto one key so a
 * thumbnail and its full-size twin cannot both be allocated.
 */
export function assetDuplicateKey(candidate: AssetCandidateInput): string {
  if (candidate.duplicateKey?.trim()) return candidate.duplicateKey.trim().toLowerCase();
  return assetSourcePath(candidate.assetRef).replace(
    /[-_](?:\d+x\d+|\d+[wh]|small|medium|large|thumb(?:nail)?|desktop|mobile|retina|crop|@\dx)(?=[-_.]|$)/g,
    ""
  );
}

function aspectFit(candidate: AssetCandidateInput, preferred?: number): number {
  if (!preferred || !candidate.width || !candidate.height) return 0.5;
  const ratio = candidate.width / candidate.height;
  const distance = Math.abs(Math.log(ratio / preferred));
  return Math.max(0, 1 - distance);
}

function qualityScore(candidate: AssetCandidateInput): number {
  if (!candidate.width || !candidate.height) return 0.4;
  const pixels = candidate.width * candidate.height;
  return Math.min(1, Math.log10(Math.max(1, pixels)) / 6.5);
}

/** Scores one candidate against one slot. Higher wins. */
export function scoreAssetForSlot(
  candidate: AssetCandidateInput,
  slot: AssetSlotRequest
): number {
  const priorityIndex = slot.rolePriority?.indexOf(candidate.purpose) ?? -1;
  const roleMatch =
    candidate.purpose === slot.semanticRole
      ? 1
      : priorityIndex >= 0
        ? 1 - (priorityIndex + 1) / (slot.rolePriority!.length + 1)
        : 0;
  const text = `${descriptor(candidate)} ${slot.slotContext ?? ""}`;
  const keywordMatch = ROLE_KEYWORDS[slot.semanticRole].test(text) ? 1 : 0;
  const topical =
    slot.slotContext && candidate.altText
      ? sharedTermRatio(slot.slotContext, candidate.altText)
      : 0;
  return (
    roleMatch * 0.3
    + keywordMatch * 0.16
    + topical * 0.14
    + aspectFit(candidate, slot.preferredAspectRatio) * 0.14
    + qualityScore(candidate) * 0.14
    + AUTHORITY_SCORE[candidate.sourceAuthority] * 0.07
    + Math.min(1, Math.max(0, candidate.confidence ?? 0.5)) * 0.05
  );
}

function sharedTermRatio(left: string, right: string): number {
  const terms = (value: string) =>
    new Set(
      value
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((term) => term.length > 3)
    );
  const a = terms(left);
  const b = terms(right);
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const term of a) if (b.has(term)) shared += 1;
  return shared / Math.min(a.size, b.size);
}

/**
 * Allocates imagery across the whole experience before rendering. Slots are
 * served highest-confidence first so the strongest asset lands where it fits
 * best rather than wherever the renderer happened to ask first.
 */
export function allocateExperienceAssets(
  input: AllocateAssetsInput
): AssetAllocationPlan {
  const rejections: AssetRejection[] = [];
  const groups = new Map<string, AssetCandidateInput[]>();

  for (const candidate of input.candidates) {
    const rejection = rejectAssetCandidate(candidate);
    if (rejection) {
      rejections.push({ assetRef: candidate.assetRef, code: rejection });
      continue;
    }
    const key = assetDuplicateKey(candidate);
    const group = groups.get(key);
    if (group) group.push(candidate);
    else groups.set(key, [candidate]);
  }

  // Rank inside each duplicate group before choosing a survivor. Deduplicating
  // on arrival would keep whichever crop happened to be listed first, so a
  // thumbnail could evict the full-size original purely by input order.
  const eligible: AssetCandidateInput[] = [];
  for (const [key, group] of groups) {
    // Equal strength means every measurable signal matched, which happens when
    // dimensions are unknown. The duplicate key is the URL with size suffixes
    // stripped, so a candidate equal to it is the original rather than a crop.
    const canonical = (candidate: AssetCandidateInput) =>
      assetSourcePath(candidate.assetRef) === key ? 0 : 1;
    const [best, ...discarded] = [...group].sort(
      (left, right) =>
        candidateStrength(right) - candidateStrength(left)
        || canonical(left) - canonical(right)
        || left.assetRef.localeCompare(right.assetRef)
    );
    eligible.push(best);
    for (const candidate of discarded) {
      rejections.push({ assetRef: candidate.assetRef, code: "duplicate_crop" });
    }
  }
  eligible.sort((left, right) => left.assetRef.localeCompare(right.assetRef));

  const pairingsFor = (slots: readonly AssetSlotRequest[]) =>
    slots
      .flatMap((slot) =>
        eligible.map((candidate) => ({
          slot,
          candidate,
          score: scoreAssetForSlot(candidate, slot)
        }))
      )
      .sort(
        (left, right) =>
          right.score - left.score
          || left.slot.sectionId.localeCompare(right.slot.sectionId)
          || left.candidate.assetRef.localeCompare(right.candidate.assetRef)
      );
  // Required slots draw from the full pool before optional slots consume it,
  // so a scarce asset set never leaves a mandatory slot empty.
  const pairings = [
    ...pairingsFor(input.slots.filter((slot) => slot.required)),
    ...pairingsFor(input.slots.filter((slot) => !slot.required))
  ];

  const allocations: AssetAllocation[] = [];
  const filledSlots = new Set<string>();
  const consumedKeys = new Set<string>();

  for (const { slot, candidate, score } of pairings) {
    const slotKey = `${slot.sectionId}\u0000${slot.semanticRole}`;
    if (filledSlots.has(slotKey)) continue;
    const reusable = REUSABLE_ROLES.has(slot.semanticRole)
      && (REUSABLE_ROLES.has(candidate.purpose) || candidate.decorative === true);
    const duplicateKey = assetDuplicateKey(candidate);
    if (!reusable && consumedKeys.has(duplicateKey)) continue;

    filledSlots.add(slotKey);
    if (!reusable) consumedKeys.add(duplicateKey);
    allocations.push({
      allocationKey: `${slot.sectionId}-${slot.semanticRole}`,
      sectionId: slot.sectionId,
      semanticRole: slot.semanticRole,
      assetRef: candidate.assetRef,
      evidenceRef: candidate.evidenceRef,
      sourceUrlHash: input.hashSourceUrl(candidate.assetRef),
      sourceIdentityKey: duplicateKey,
      purpose: candidate.purpose,
      reusable,
      required: slot.required === true,
      score: Math.round(Math.min(1, Math.max(0, score)) * 10_000) / 10_000
    });
  }

  const treatments: AssetSlotTreatment[] = input.slots
    .filter((slot) => !filledSlots.has(`${slot.sectionId}\u0000${slot.semanticRole}`))
    .map((slot) => ({
      sectionId: slot.sectionId,
      semanticRole: slot.semanticRole,
      treatment: "designed_non_image" as const,
      reason: eligible.length ? ("assets_exhausted" as const)
        : ("no_credible_asset_available" as const)
    }));

  allocations.sort((left, right) => left.allocationKey.localeCompare(right.allocationKey));

  return {
    version: "asset-allocator-v1",
    allocations,
    treatments,
    rejections,
    substantiveCount: allocations.filter(({ reusable }) => !reusable).length,
    reusableCount: allocations.filter(({ reusable }) => reusable).length
  };
}

/**
 * What the renderer is allowed to know: which image goes in which slot. The
 * evidence reference, source hash, and score that justified the choice stay in
 * the private trace, so a brand object that reaches a public response cannot
 * carry the reasoning behind its own imagery.
 */
export interface AssetRenderPlacement {
  sectionId: string;
  semanticRole: AssetSemanticRole;
  assetRef: string;
  reusable: boolean;
  required: boolean;
}

export interface AssetRenderPlan {
  version: "asset-render-plan-v1";
  placements: AssetRenderPlacement[];
  treatments: AssetSlotTreatment[];
}

export function toAssetRenderPlan(plan: AssetAllocationPlan): AssetRenderPlan {
  return {
    version: "asset-render-plan-v1",
    placements: plan.allocations.map(
      ({ sectionId, semanticRole, assetRef, reusable, required }) => ({
        sectionId,
        semanticRole,
        assetRef,
        reusable,
        required
      })
    ),
    treatments: plan.treatments.map((treatment) => ({ ...treatment }))
  };
}

/** Identity key recorded on an allocation, or derived from its asset ref. */
export function allocationSourceIdentityKey(
  allocation: Pick<AssetAllocation, "assetRef" | "sourceIdentityKey">
): string {
  if (allocation.sourceIdentityKey?.trim()) return allocation.sourceIdentityKey;
  return assetDuplicateKey({
    assetRef: allocation.assetRef,
    evidenceRef: "",
    purpose: "supporting",
    sourceAuthority: "seller_official"
  });
}

/** True when no substantive image was placed in more than one slot. */
export function substantiveAssetsAreUnique(plan: AssetAllocationPlan): boolean {
  const substantive = plan.allocations
    .filter(({ reusable }) => !reusable)
    .map(allocationSourceIdentityKey);
  return new Set(substantive).size === substantive.length;
}

/**
 * Deliberately reuses one substantive identity across two slots. Benchmark
 * mutations use this to prove duplicate allocation is detectable.
 */
export function withDeliberateDuplicateAllocation(
  plan: AssetAllocationPlan
): AssetAllocationPlan {
  const donor = plan.allocations.find(({ reusable }) => !reusable);
  if (!donor) return plan;
  const duplicate: AssetAllocation = {
    ...donor,
    allocationKey: `${donor.sectionId}-${donor.semanticRole}-duplicate`,
    sectionId: donor.sectionId === "proof" ? "supporting" : "proof",
    semanticRole: donor.semanticRole === "proof" ? "supporting" : "proof"
  };
  return {
    ...plan,
    allocations: [...plan.allocations, duplicate],
    substantiveCount: plan.substantiveCount + 1
  };
}
