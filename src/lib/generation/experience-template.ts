import type {
  ExperienceDraft,
  PersuasionFramework
} from "@/lib/generation/experience-schema";
import { sanitizeExperienceSectionLabels } from "@/lib/generation/experience-schema";
import {
  applyPersonalizationVariant,
  experienceTemplateFor,
  personalizationRuntimePayload,
  personalizationVariantById,
  SHARED_EXPERIENCE_PRIMITIVES,
  type ExperiencePrimitive
} from "@/lib/generation/experience-renderers";
import { sanitizeBuyerFacingLabel } from "@/lib/generation/message-spine";
import type { VisualGrammar } from "@/lib/generation/visual-grammar";
import type { WireframeSelectionV1 } from "@/lib/generation/wireframe-library";
import { isImageDeliveryPath } from "@/lib/image-delivery";
import type {
  BrandProfile,
  ExperienceActionContract,
  ExperienceContentItem,
  ExperiencePersonalizationPlan,
  PersonalizationVariantId,
  SessionAnswers,
  UseCase
} from "@/lib/types";
import { config } from "@/lib/config";
import {
  brandDesignDNAFor,
  brandPresentationFor
} from "@/lib/verified-brand-profiles";

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>'"]/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char] ?? char
  );

const safeColor = (value: string, fallback: string) =>
  /^#[0-9a-f]{6}$/i.test(value) ? value.toUpperCase() : fallback;

const NEUTRAL_PREVIEW_PALETTE = {
  primary: "#202124",
  accent: "#5F6368",
  surface: "#FFFFFF",
  softSurface: "#F6F7F8",
  supportingAccent: "#80868B",
  lightText: "#202124",
  mutedText: "#5F6368",
  divider: "#DADCE0",
  focus: "#3C4043"
} as const;

const neutralPreviewNotice =
  "Brand colors are not yet verified; this preview uses a neutral treatment.";

/**
 * A known-low palette must never inherit the renderer's generic indigo. Keep
 * unknown legacy profiles renderable, but make an explicit low-confidence
 * receipt authoritative whenever one is available.
 */
function requiresNeutralPreviewTreatment(brand: BrandProfile): boolean {
  const palette = brand.diagnostics?.palette;
  return palette?.confidence === "low" || palette?.strategy === "fallback" || brand.readiness?.paletteReady === false;
}

const safePixelValue = (value: number | undefined, fallback: number, min: number, max: number) =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(min, Math.round(value)))
    : fallback;

const safeNumericValue = (value: number | undefined, fallback: number, min: number, max: number) =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(min, Math.round(value * 1000) / 1000))
    : fallback;

function appliedDesignDnaFields(value: ReturnType<typeof brandDesignDNAFor>): string[] {
  if (!value) return [];
  return Object.entries(value)
    .filter(([key]) => !["version", "source", "confidence"].includes(key))
    .flatMap(([group, fields]) =>
      fields && typeof fields === "object"
        ? Object.entries(fields)
            .filter(([, fieldValue]) => fieldValue !== undefined)
            .map(([field]) => `${group}.${field}`)
        : []
    )
    .slice(0, 32);
}

function safeAssetUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  if (isImageDeliveryPath(value)) return value;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function safePublicLinkUrl(value: string | undefined): string | undefined {
  if (value && isImageDeliveryPath(value)) return undefined;
  const safeUrl = safeAssetUrl(value);
  if (!safeUrl) return undefined;
  const url = new URL(safeUrl);
  url.search = "";
  url.hash = "";
  return url.toString();
}

function experienceImages(values: string[]): string[] {
  const candidates = values
    .map(safeAssetUrl)
    .filter((url): url is string => Boolean(url));
  const evergreen = candidates.filter(
    (url) =>
      !/(?:^|[/_.-])(g2|award|badge|benchmark|report|event|roadshow|webinar|conference|summit|promo(?:tion)?|social[-_ ]?banner)(?:[/_.?-]|$)/i.test(
        new URL(url, "https://first-party.invalid").pathname
      )
  );
  const selected = evergreen.length ? evergreen : candidates;
  return selected
    .map((url, index) => {
      const pathname = new URL(url, "https://first-party.invalid").pathname.toLowerCase();
      const score =
        (/hero/.test(pathname) ? 120 : 0) +
        (/harmony|platform|product|solution|workflow/.test(pathname) ? 70 : 0) +
        (/architecture|diagram|marketecture/.test(pathname) ? 45 : 0);
      return { url, index, score };
    })
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ url }) => url);
}

function colorLuminance(hex: string): number {
  const values = [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255);
  const [r, g, b] = values.map((value) =>
    value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function safeFontFamily(value: string | undefined, fallback: string): string {
  if (!value || value.length > 72 || !/^[a-z0-9 ._-]+$/i.test(value)) return fallback;
  return `"${value}",${fallback}`;
}

function safeFontName(value: string | undefined, fallback: string): string {
  if (!value || value.length > 72 || !/^[a-z0-9 ._-]+$/i.test(value)) return fallback;
  return value;
}

function safeFontDeliveryUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  if (/^\/api\/sessions\/[a-z0-9_-]{1,128}\/font\/(?:display|body)$/i.test(value)) {
    return value;
  }
  try {
    const url = new URL(value);
    if (url.username || url.password) return undefined;
    if (
      !/^\/api\/sessions\/[a-z0-9_-]{1,128}\/font\/(?:display|body)$/i.test(url.pathname) ||
      url.search ||
      url.hash
    ) {
      return undefined;
    }
    const isLocalDevelopment =
      url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    return url.protocol === "https:" || isLocalDevelopment ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function fontFormat(sourceUrl: string): FontFormat {
  const extension = new URL(sourceUrl).pathname.toLowerCase().match(/\.(woff2|woff|ttf|otf)$/)?.[1];
  return extension === "woff" || extension === "ttf" || extension === "otf" ? extension : "woff2";
}

type FontFormat = "woff2" | "woff" | "ttf" | "otf";

function fontFace(
  name: string,
  sourceUrl: string | undefined,
  deliveryUrl: string | undefined,
  weight: string
): string {
  const safeSource = safeAssetUrl(sourceUrl);
  const safeDelivery = safeFontDeliveryUrl(deliveryUrl);
  if (!safeSource || !safeDelivery) return "";
  const format = fontFormat(safeSource);
  return `@font-face{font-family:"${name}";src:url("${safeDelivery.replace(/["\\]/g, "")}") format("${format}");font-style:normal;font-weight:${weight};font-display:swap}`;
}

function wordmark(profile: BrandProfile, className: string, darkSurface = false): string {
  const logo = safeAssetUrl(darkSurface ? profile.logoUrlOnDark ?? profile.logoUrl : profile.logoUrl);
  return `<span class="wordmark ${className}" role="img" aria-label="${escapeHtml(profile.companyName)}">
    ${logo ? `<img src="${escapeHtml(logo)}" alt="" aria-hidden="true">` : ""}
    <span class="wordmark-fallback" aria-hidden="true">${escapeHtml(profile.companyName)}</span>
  </span>`;
}

function imageFigure(
  url: string | undefined,
  alt: string,
  className: string,
  eager = false,
  allowFallback = true,
  assetRole?: string
): string {
  const safeUrl = safeAssetUrl(url);
  if (!safeUrl && !allowFallback) return "";
  const roleClass = safeUrl && /diagram|architecture|marketecture|workflow|chart/i.test(safeUrl) ? " is-diagram" : "";
  const safeAssetRole = assetRole && /^[a-z-]{1,48}$/.test(assetRole) ? ` data-asset-role="${assetRole}"` : "";
  return `<figure class="media ${className}${roleClass}"${allowFallback ? "" : ' data-no-fallback="true"'}${safeAssetRole}>
    ${allowFallback ? `<div class="media-fallback" data-fallback-kind="experience-blueprint" aria-hidden="true">
      <span class="media-fallback-kicker">Experience blueprint</span>
      <strong>Context.<br>Proof.<br>Next step.</strong>
      <span class="media-fallback-steps"><i>01</i><i>02</i><i>03</i></span>
    </div>` : ""}
    ${safeUrl ? `<img src="${escapeHtml(safeUrl)}" alt="${escapeHtml(alt)}" ${eager ? 'loading="eager" fetchpriority="high"' : 'loading="lazy"'}>` : ""}
  </figure>`;
}

function noAssetFigure(grammar: VisualGrammar, className: string): string {
  const copy: Record<VisualGrammar["noAssetTreatment"], { label: string; headline: string; steps: readonly string[] }> = {
    "editorial-evidence": { label: "A considered point of view", headline: "The signal is clear.\nThe next move\nshould be too.", steps: ["Signal", "Meaning", "Action"] },
    "proof-receipt": { label: "Evidence is being carried forward", headline: "A supported case.\nA decision worth\nmaking.", steps: ["Fact", "Context", "Decision"] },
    "choice-map": { label: "Choose the useful way in", headline: "One promise.\nThree ways to\nmake it real.", steps: ["Explore", "Compare", "Act"] },
    "system-map": { label: "A validation path", headline: "Map the system.\nValidate the\nfirst outcome.", steps: ["Input", "Flow", "Outcome"] },
    "data-frame": { label: "The evidence frame", headline: "Read the finding.\nSee the pattern.\nChoose the implication.", steps: ["Finding", "Pattern", "Implication"] },
    "chapter-index": { label: "The guided source", headline: "Start with the\nmoment that\nmatters most.", steps: ["Watch", "Learn", "Continue"] }
  };
  const treatment = copy[grammar.noAssetTreatment];
  return `<figure class="media ${className} no-asset-treatment no-asset-${grammar.noAssetTreatment}" data-fallback-kind="${grammar.noAssetTreatment}" data-asset-role="${grammar.heroMediaRole}">
    <div class="media-fallback" aria-hidden="true">
      <span class="media-fallback-kicker">${escapeHtml(treatment.label)}</span>
      <strong>${escapeHtml(treatment.headline).replace(/\n/g, "<br>")}</strong>
      <span class="media-fallback-steps">${treatment.steps.map((step) => `<i>${escapeHtml(step)}</i>`).join("")}</span>
    </div>
  </figure>`;
}

function frameworkImage(
  images: string[],
  brief: PersuasionFramework["opening"]["imageBrief"],
  className: string,
  eager = false
): string {
  if (brief.source === "none" || brief.assetType === "typographic-treatment") return "";
  const assetPatterns: Record<PersuasionFramework["opening"]["imageBrief"]["assetType"], RegExp> = {
    "logo-lockup": /logo|wordmark|brandmark/i,
    "product-ui": /product|platform|screen|ui|dashboard|solution|hero/i,
    "workflow-diagram": /workflow|diagram|architecture|flow|marketecture|process/i,
    "customer-proof": /customer|case|story|result|proof/i,
    "source-visual": /report|ebook|guide|resource|cover|source/i,
    "data-visual": /chart|data|metric|benchmark|graph/i,
    "typographic-treatment": /$a/
  };
  const purposeTokens = `${brief.purpose} ${brief.caption}`
    .toLocaleLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 5);
  const ranked = images
    .map((url, index) => {
      const pathname = new URL(url, "https://first-party.invalid").pathname.toLocaleLowerCase();
      const typeScore = assetPatterns[brief.assetType].test(pathname) ? 100 : 0;
      const purposeScore = purposeTokens.reduce(
        (score, token) => score + (pathname.includes(token) ? 12 : 0),
        0
      );
      return { url, index, score: typeScore + purposeScore };
    })
    .sort((a, b) => b.score - a.score || a.index - b.index);
  // A single image means the curator explicitly narrowed the available asset
  // set. Session-scoped delivery URLs intentionally hide the original file
  // name, so semantic filename scoring cannot recognize that choice.
  const selected = ranked[0]?.score
    ? ranked[0].url
    : images.length === 1
      ? images[0]
      : undefined;
  return imageFigure(selected, brief.caption, className, eager, false, brief.assetType);
}

type RenderStyleVariant = "standard" | "brand-led" | "editorial" | "technical" | "minimal";
type RenderCtaStyle = "solid" | "outline" | "text";

function compactText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized ? normalized.slice(0, maxLength) : undefined;
}

function styleVariant(answers: SessionAnswers): RenderStyleVariant {
  const runtimeAnswers = answers as SessionAnswers & Record<string, unknown>;
  const requested = compactText(runtimeAnswers.styleVariant, 32)?.toLowerCase();
  if (requested === "brand-led") return "brand-led";
  if (requested === "editorial") return "editorial";
  if (requested === "technical") return "technical";
  if (requested === "minimal") return "minimal";
  return "standard";
}

function ctaStyle(answers: SessionAnswers): RenderCtaStyle {
  const requested = compactText(answers.ctaStyle, 16)?.toLowerCase();
  if (requested === "outline" || requested === "text") return requested;
  return "solid";
}

function editableBlock(blockId: string, kind: string): string {
  return `data-flz-editable="true" data-flz-block-id="${escapeHtml(blockId)}" data-flz-block-kind="${escapeHtml(kind)}"`;
}

function actionControl(
  action: ExperienceActionContract,
  className: string,
  editable: string,
  label?: string
): string {
  const copy = escapeHtml(label ?? action.label);
  const common = `class="${className}" data-experience-action="${escapeHtml(action.id)}" data-action-event="${escapeHtml(action.analyticsEvent)}" data-flz-cta-id="${escapeHtml(action.id)}" ${editable}`;
  if (action.actionType === "external-link") {
    return `<a ${common} href="${escapeHtml(action.destination)}" target="_blank" rel="noopener noreferrer">${copy}</a>`;
  }
  if (action.actionType === "scroll") {
    return `<button type="button" ${common} data-scroll-target="${escapeHtml(action.destination.replace(/^#/, ""))}">${copy}</button>`;
  }
  return `<button type="button" ${common} data-content-dialog="${escapeHtml(action.destination.replace(/^#/, ""))}">${copy}</button>`;
}

export function renderExperienceHtml(input: {
  draft: ExperienceDraft;
  brand: BrandProfile;
  targetBrand?: BrandProfile;
  useCase: UseCase;
  answers: SessionAnswers;
  themeUrl?: string;
  fontDeliveryUrls?: { display?: string; body?: string };
  qualityReceipt?: unknown;
  contentItems?: ExperienceContentItem[];
  actions?: ExperienceActionContract[];
  wireframeSelection?: WireframeSelectionV1;
  personalization?: ExperiencePersonalizationPlan;
  personalizationVariantId?: PersonalizationVariantId | string;
}): string {
  const brand = input.brand;
  const targetBrand = input.targetBrand;
  const personalizationPlan = input.personalization;
  const activePersonalization = personalizationPlan
    ? personalizationVariantById(
        personalizationPlan,
        input.personalizationVariantId ?? personalizationPlan.defaultVariantId
      )
    : undefined;
  const personalizedDraft = personalizationPlan
    ? applyPersonalizationVariant(
        input.draft,
        personalizationPlan,
        activePersonalization?.variantId ?? personalizationPlan.defaultVariantId
      )
    : input.draft;
  const draft: ExperienceDraft = {
    ...personalizedDraft,
    sectionLabels: sanitizeExperienceSectionLabels(personalizedDraft.sectionLabels),
    narrativeArc: sanitizeBuyerFacingLabel(
      personalizedDraft.narrativeArc,
      personalizedDraft.narrativeArc
    )
  };
  const personalizationRuntime = personalizationPlan
    ? personalizationRuntimePayload(personalizationPlan)
    : undefined;
  const activePersonalizationId =
    activePersonalization?.variantId ?? personalizationPlan?.defaultVariantId ?? "generic";
  const imageryTreatment =
    activePersonalization?.imageryTreatment ??
    personalizationPlan?.visibleVariants.find(
      (variant) => variant.variantId === personalizationPlan.defaultVariantId
    )?.imageryTreatment;
  const actionById = new Map((input.actions ?? []).map((action) => [action.id, action]));
  const primaryAction = actionById.get("primary-conversion") ?? {
    id: "primary-conversion",
    purpose: "guided-exploration",
    label: draft.primaryCta,
    actionType: "scroll",
    destination: "#supporting-resources",
    access: "public",
    analyticsEvent: "cta_click",
    analyticsOwner: "try-me-now",
    verification: "fallback",
    fallbackReason: "Legacy renderer input did not include a V2 action contract."
  } satisfies ExperienceActionContract;
  const selectedVariant = "standard";
  const selectedStyle = styleVariant(input.answers);
  const selectedCtaStyle = ctaStyle(input.answers);
  const designDna = brandDesignDNAFor(brand);
  const presentation = brandPresentationFor(brand);
  const neutralPreview = requiresNeutralPreviewTreatment(brand);
  const trustedDesignDna = neutralPreview ? undefined : designDna;
  const trustedPresentation = neutralPreview ? undefined : presentation;
  const heroTheme = trustedDesignDna?.theme?.hero ?? trustedPresentation?.heroTheme ?? "light";
  const candidatePrimary = neutralPreview
    ? NEUTRAL_PREVIEW_PALETTE.primary
    : safeColor(brand.primaryColor, "#1C293F");
  const primary = colorLuminance(candidatePrimary) < 0.42 ? candidatePrimary : "#1C293F";
  const accent = neutralPreview ? NEUTRAL_PREVIEW_PALETTE.accent : safeColor(brand.accentColor, "#5B5BFF");
  const surface = neutralPreview ? NEUTRAL_PREVIEW_PALETTE.surface : safeColor(brand.surfaceColor, "#FFFFFF");
  const onAccent = colorLuminance(accent) > 0.42 ? "#071428" : "#FFFFFF";
  const darkSurface = neutralPreview ? primary : safeColor(trustedDesignDna?.colors?.darkSurface ?? trustedPresentation?.darkSurfaceColor ?? primary, primary);
  const softSurface = neutralPreview ? NEUTRAL_PREVIEW_PALETTE.softSurface : safeColor(trustedDesignDna?.colors?.softSurface ?? trustedPresentation?.softSurfaceColor ?? surface, surface);
  const supportingAccent = neutralPreview ? NEUTRAL_PREVIEW_PALETTE.supportingAccent : safeColor(trustedDesignDna?.colors?.supportingAccent ?? trustedPresentation?.supportingAccentColor ?? accent, accent);
  const lightSurfaceAccent = safeColor(
    neutralPreview ? accent : trustedDesignDna?.colors?.lightSurfaceAccent ?? trustedPresentation?.lightSurfaceAccentColor ?? accent,
    accent
  );
  const lightText = neutralPreview ? NEUTRAL_PREVIEW_PALETTE.lightText : safeColor(trustedDesignDna?.colors?.lightText ?? trustedPresentation?.lightTextColor ?? "#20324B", "#20324B");
  const mutedText = neutralPreview ? NEUTRAL_PREVIEW_PALETTE.mutedText : safeColor(trustedDesignDna?.colors?.mutedText ?? trustedPresentation?.mutedTextColor ?? "#66778D", "#66778D");
  const dividerColor = neutralPreview ? NEUTRAL_PREVIEW_PALETTE.divider : safeColor(trustedDesignDna?.colors?.divider ?? trustedPresentation?.dividerColor ?? "#DCE3E9", "#DCE3E9");
  const buttonBackground = neutralPreview ? accent : safeColor(trustedDesignDna?.buttons?.primaryBackground ?? trustedPresentation?.primaryButtonBackground ?? accent, accent);
  const buttonText = neutralPreview ? "#FFFFFF" : safeColor(trustedDesignDna?.buttons?.primaryText ?? trustedPresentation?.primaryButtonText ?? onAccent, onAccent);
  const buttonHover = neutralPreview ? "#3C4043" : safeColor(trustedDesignDna?.buttons?.primaryHover ?? trustedPresentation?.primaryButtonHover ?? accent, accent);
  const buttonActive = neutralPreview ? "#202124" : safeColor(trustedDesignDna?.buttons?.primaryActive ?? trustedPresentation?.primaryButtonActive ?? buttonHover, buttonHover);
  const secondaryButtonBorder = neutralPreview ? accent : safeColor(trustedDesignDna?.buttons?.secondaryBorder ?? trustedPresentation?.secondaryButtonBorder ?? accent, accent);
  const secondaryButtonText = neutralPreview ? primary : safeColor(trustedDesignDna?.buttons?.secondaryText ?? trustedPresentation?.secondaryButtonText ?? primary, primary);
  const focusColor = neutralPreview ? NEUTRAL_PREVIEW_PALETTE.focus : safeColor(trustedDesignDna?.colors?.focus ?? trustedPresentation?.focusColor ?? accent, accent);
  const buttonRadius = safePixelValue(designDna?.buttons?.radiusPx ?? presentation?.buttonRadiusPx, 999, 0, 999);
  const buttonHeight = safePixelValue(designDna?.buttons?.heightPx ?? presentation?.buttonHeightPx, 52, 36, 80);
  const buttonBorderWidth = safePixelValue(designDna?.buttons?.borderWidthPx ?? presentation?.buttonBorderWidthPx, 1, 0, 4);
  const cardRadius = safePixelValue(designDna?.cards?.radiusPx ?? presentation?.cardRadiusPx, 0, 0, 64);
  const cardBorderWidth = safePixelValue(designDna?.cards?.borderWidthPx, 1, 0, 4);
  const contentMaxWidth = safePixelValue(designDna?.spacing?.contentMaxWidthPx, 1600, 960, 1800);
  const sectionBlock = safePixelValue(designDna?.spacing?.sectionBlockPx, 104, 52, 160);
  const gridGap = safePixelValue(designDna?.spacing?.gridGapPx, 12, 4, 64);
  const headingWeight = safePixelValue(designDna?.typography?.headingWeight, 800, 300, 900);
  const bodyWeight = safePixelValue(designDna?.typography?.bodyWeight, 400, 300, 800);
  const headingTracking = safeNumericValue(designDna?.typography?.headingLetterSpacingEm, -0.035, -0.1, 0.12);
  const headingLineHeight = safeNumericValue(designDna?.typography?.headingLineHeight, 1.03, 0.85, 1.45);
  const motif = designDna?.theme?.motif ?? "none";
  const cardShadow = designDna?.cards?.shadow === "none"
    ? "none"
    : designDna?.cards?.shadow === "strong"
      ? "0 30px 88px color-mix(in srgb,var(--brand-ink) 20%,transparent)"
      : designDna?.cards?.shadow === "soft"
        ? "0 18px 52px color-mix(in srgb,var(--brand-ink) 12%,transparent)"
        : "none";
  const designDnaFields = appliedDesignDnaFields(designDna);
  const headingDnaDeclarations = [
    designDna?.typography?.headingWeight !== undefined ? "font-weight:var(--heading-weight)" : "",
    designDna?.typography?.headingLetterSpacingEm !== undefined ? "letter-spacing:var(--heading-tracking)" : "",
    designDna?.typography?.headingLineHeight !== undefined ? "line-height:var(--heading-line-height)" : ""
  ].filter(Boolean).join(";");
  const cardDnaDeclarations = [
    designDna?.cards?.radiusPx !== undefined ? "border-radius:var(--card-radius)" : "",
    designDna?.cards?.borderWidthPx !== undefined ? "border-width:var(--card-border-width)" : "",
    designDna?.cards?.shadow !== undefined ? "box-shadow:var(--brand-card-shadow)" : ""
  ].filter(Boolean).join(";");
  const designDnaCss = [
    designDna?.typography?.bodyWeight !== undefined
      ? "body.brand-design-dna{font-weight:var(--body-weight)}"
      : "",
    designDna?.spacing?.contentMaxWidthPx !== undefined
      ? "body.brand-design-dna .shell{max-width:var(--content-max-width)}"
      : "",
    headingDnaDeclarations
      ? `body.brand-design-dna .hero h1,body.brand-design-dna .signature-intro h2,body.brand-design-dna .thesis h2,body.brand-design-dna .region-heading h2,body.brand-design-dna .journey-header h2,body.brand-design-dna .framework-section h2,body.brand-design-dna .close h2{${headingDnaDeclarations}}`
      : "",
    designDna?.spacing?.sectionBlockPx !== undefined
      ? "body.brand-design-dna .signature,body.brand-design-dna .thesis,body.brand-design-dna .lens-lab,body.brand-design-dna .journey,body.brand-design-dna .framework-section{padding-top:var(--section-block);padding-bottom:var(--section-block)}"
      : "",
    designDna?.spacing?.gridGapPx !== undefined
      ? "body.brand-design-dna .journey-grid,body.brand-design-dna .role-grid{gap:var(--grid-gap)}"
      : "",
    cardDnaDeclarations
      ? `body.brand-design-dna .hero-media,body.brand-design-dna .framework-media,body.brand-design-dna .journey-card,body.brand-design-dna .role-grid article{${cardDnaDeclarations}}`
      : ""
  ].filter(Boolean).join("");
  const displayFontName = safeFontName(brand.displayFontFamily, "Brand Display");
  const bodyFontName = safeFontName(brand.bodyFontFamily, "Brand Sans");
  const displayFallback =
    (designDna?.typography?.fallback ?? presentation?.fontFallback) === "sans"
      ? '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif'
      : "ui-serif,Georgia,serif";
  const displayFont = safeFontFamily(brand.displayFontFamily, displayFallback);
  const bodyFont = safeFontFamily(
    brand.bodyFontFamily,
    '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif'
  );
  const images = experienceImages(brand.imageUrls);
  const heroImage = images[0];
  const supportingImages = images.filter((image) => image !== heroImage);
  const vendorUrl = safePublicLinkUrl(`https://${brand.domain}`) ?? "https://www.folloze.com";
  const template = experienceTemplateFor(draft, input.wireframeSelection);
  const visualGrammar = template.visualGrammar;
  const framework = template.family === "content-source" ? undefined : draft.persuasionFramework;
  const frameworkHeroMedia = framework
    ? frameworkImage(images, framework.opening.imageBrief, "hero-media", true)
    : undefined;
  const templateFingerprint = framework
    ? template.fingerprint
    : template.family === "account-abm"
      ? "v3-account-thesis-paths-proof"
      : template.family === "campaign-launch"
        ? "v3-campaign-routes-proof-thesis"
        : template.fingerprint;
  const sourceTitle =
    compactText(input.answers.sourceTitle, 140) ??
    compactText(input.answers.sourceName, 140) ??
    compactText(input.answers.offerSourceTitle, 140);
  const offerTitle =
    compactText(input.answers.promotedOffer, 120) ??
    compactText(input.answers.offerSourceTitle, 120);
  const sourceReference =
    template.family === "content-source"
      ? sourceTitle ?? "The supplied source material"
      : template.family === "account-abm" && targetBrand
        ? `${brand.companyName} for ${targetBrand.companyName}`
        : offerTitle ?? brand.companyName;
  const heroEyebrow =
    template.family === "content-source" && sourceTitle
      ? sourceTitle
      : template.family === "campaign-launch" && offerTitle
        ? `${brand.companyName} | ${offerTitle}`
        : draft.eyebrow;
  const themeLink = input.themeUrl
    ? `<link rel="stylesheet" href="${escapeHtml(input.themeUrl)}">`
    : "";
  const contextLabel = targetBrand
    ? `${brand.companyName} for ${targetBrand.companyName}`
    : brand.companyName;
  const sectionIds: Record<ExperiencePrimitive, string> = {
    thesis: "experience-thesis",
    lenses: "decision-path",
    resources: "supporting-resources"
  };
  const frameworkSectionIds = [
    "experience-overview",
    "credibility-anchor",
    "why-change-now",
    "starting-points",
    "outcome-mechanism",
    "team-value",
    "next-step"
  ] as const;
  const journeyNavItems = framework
    ? frameworkSectionIds.map((id, index) => ({
        id,
        label: sanitizeBuyerFacingLabel(
          template.journeyNavigation[index] ?? `Section ${index + 1}`,
          "Overview"
        )
      }))
    : [
        { id: "experience-overview", label: "Overview" },
        ...template.regionOrder.map((region) => ({
          id: sectionIds[region],
          label: sanitizeBuyerFacingLabel(template.navigation[region], "Overview")
        })),
        { id: "next-step", label: "Next step" }
      ];
  const resourcesHeading = /\bquestions?\b/i.test(draft.sectionLabels.journey)
    ? sanitizeBuyerFacingLabel(template.navigation.resources, "Evidence")
    : draft.sectionLabels.journey;
  const journeyNavButtons = journeyNavItems
    .map(
      (item, index) => `<button type="button" data-scroll-target="${escapeHtml(item.id)}" data-journey-link="${escapeHtml(item.id)}" ${index === 0 ? 'aria-current="location"' : ""}>
        <span aria-hidden="true"></span>${escapeHtml(item.label)}
      </button>`
    )
    .join("");
  const frameworkChoices = framework?.startingPoints.choices;
  const lensButtons = (frameworkChoices ?? draft.sections.map((section, index) => ({ label: draft.signalLabels[index], buyerJob: section.headline })))
    .map(
      (choice, index) => `<button type="button" role="tab" id="lens-tab-${index}" aria-controls="lens-panel-${index}" aria-selected="${index === 0}" tabindex="${index === 0 ? 0 : -1}" data-lens-index="${index}" ${editableBlock(`lens.${index}.label`, "tab-label")}>${escapeHtml(choice.label)}</button>`
    )
    .join("");

  const lensPanels = (frameworkChoices ?? draft.sections)
    .map(
      (section, index) => {
        const label = frameworkChoices ? frameworkChoices[index].label : draft.sections[index].eyebrow;
        const headline = frameworkChoices ? frameworkChoices[index].buyerJob : draft.sections[index].headline;
        const body = frameworkChoices ? frameworkChoices[index].outcome : draft.sections[index].body;
        const question = frameworkChoices ? frameworkChoices[index].validationQuestion : undefined;
        const media = frameworkChoices
          ? frameworkImage(images, frameworkChoices[index].imageBrief, "lens-media")
          : imageFigure(
              supportingImages[index] ?? supportingImages[0],
              `${brand.companyName}: ${label}`,
              "lens-media",
              false,
              false,
              "supporting"
            );
        return `<section class="lens-panel${media ? "" : " no-media"}" id="lens-panel-${index}" role="tabpanel" aria-labelledby="lens-tab-${index}" tabindex="0" ${index === 0 ? "" : "hidden"}>
        <div class="lens-number" aria-hidden="true">0${index + 1}</div>
        <div class="lens-copy"><p class="eyebrow" ${editableBlock(`lens.${index}.eyebrow`, "eyebrow")}>${escapeHtml(label)}</p><h2 ${editableBlock(`lens.${index}.headline`, "headline")}>${escapeHtml(headline)}</h2><p ${editableBlock(`lens.${index}.body`, "body")}>${escapeHtml(body)}</p>${question ? `<p class="validation-question"><strong>Question to answer</strong>${escapeHtml(question)}</p>` : ""}</div>
        ${media}
      </section>`;
      }
    )
    .join("");

  const resourceItems: ExperienceContentItem[] = input.contentItems?.length
    ? input.contentItems.slice(0, 3)
    : draft.sections.map((section, index) => ({
        id: `resource-${index + 1}`,
        kind: "insight",
        eyebrow: section.eyebrow,
        title: section.proof,
        summary: section.body,
        actionLabel: template.resourceAction,
        sourceCitationIds: []
      }));
  const resourceCards = resourceItems
    .map(
      (item, index) => {
        const action = (item.actionId ? actionById.get(item.actionId) : undefined) ?? {
          id: `content-detail-${index + 1}`,
          purpose: "guided-exploration",
          label: item.actionLabel,
          actionType: "content-dialog",
          destination: `#content-detail-${index + 1}`,
          access: "public",
          analyticsEvent: "topic_select",
          analyticsOwner: "try-me-now",
          verification: "fallback",
          contentItemId: item.id,
          fallbackReason: "Legacy content item uses an in-experience detail."
        } satisfies ExperienceActionContract;
        return `<article class="journey-card resource-card" data-source-reference="${escapeHtml(sourceReference)}" data-content-item-id="${escapeHtml(item.id)}" data-content-item-kind="${escapeHtml(item.kind)}">
        <div class="journey-index" aria-hidden="true">0${index + 1}</div>
        <div class="journey-copy"><p class="eyebrow" ${editableBlock(`resource.${index}.eyebrow`, "eyebrow")}>${escapeHtml(item.eyebrow)}</p><h3 ${editableBlock(`resource.${index}.headline`, "proof-point")}>${escapeHtml(item.title)}</h3><p ${editableBlock(`resource.${index}.body`, "body")}>${escapeHtml(item.summary)}</p>${item.sourceLabel ? `<p class="source-citation">${escapeHtml(item.sourceLabel)}</p>` : ""}</div>
        ${actionControl(action, "journey-action", "", `${item.actionLabel} →`)}
      </article>`;
      }
    )
    .join("");
  const contentDialogs = resourceItems
    .map((item, index) => {
      const action = item.actionId ? actionById.get(item.actionId) : undefined;
      const dialogId =
        action?.actionType === "content-dialog"
          ? action.destination.replace(/^#/, "")
          : `content-detail-${index + 1}`;
      if (action && action.actionType !== "content-dialog") return "";
      return `<dialog class="content-detail" id="${escapeHtml(dialogId)}" aria-labelledby="${escapeHtml(dialogId)}-title"><form method="dialog"><button class="dialog-close" value="close" aria-label="Close content detail">×</button><p class="eyebrow">${escapeHtml(item.eyebrow)}</p><h3 id="${escapeHtml(dialogId)}-title">${escapeHtml(item.title)}</h3><p>${escapeHtml(item.summary)}</p>${item.sourceLabel ? `<p class="source-citation">${escapeHtml(item.sourceLabel)}</p>` : ""}<button class="primary" value="close">Continue exploring</button></form></dialog>`;
    })
    .join("");

  const regions: Record<ExperiencePrimitive, string> = {
    thesis: `<section class="thesis experience-region" id="experience-thesis" data-journey-section="experience-thesis" data-template-primitive="thesis" aria-labelledby="experience-thesis-heading">
      <p class="eyebrow" ${editableBlock("thesis.label", "section-label")}>${escapeHtml(draft.sectionLabels.thesis)}</p>
      <h2 id="experience-thesis-heading" ${editableBlock("thesis.headline", "headline")}>${escapeHtml(draft.thesisHeadline)}</h2>
      <p ${editableBlock("thesis.body", "body")}>${escapeHtml(draft.thesisBody)}</p>
    </section>`,
    lenses: `<section class="lens-lab experience-region" id="decision-path" data-journey-section="decision-path" data-template-primitive="lenses" aria-labelledby="decision-path-heading">
      <header class="region-heading"><h2 id="decision-path-heading" ${editableBlock("lenses.heading", "section-heading")}>${escapeHtml(draft.sectionLabels.lenses)}</h2></header>
      <div class="lens-tabs" role="tablist" aria-orientation="horizontal" aria-label="${escapeHtml(draft.sectionLabels.lenses)}">${lensButtons}</div>
      ${lensPanels}
    </section>`,
    resources: `<section class="journey experience-region" id="supporting-resources" data-journey-section="supporting-resources" data-template-primitive="resources" aria-labelledby="supporting-resources-heading">
      <header class="journey-header"><p class="eyebrow">${escapeHtml(template.resourcesEyebrow)}</p><h2 id="supporting-resources-heading" ${editableBlock("resources.heading", "section-heading")}>${escapeHtml(resourcesHeading)}</h2><p class="source-basis">Built from ${escapeHtml(sourceReference)}.</p></header>
      <div class="journey-grid">${resourceCards}</div>
    </section>`
  };
  const experienceFlow = template.regionOrder.map((region) => regions[region]).join("");
  const signatureButtons = draft.sections
    .map(
      (section, index) => `<button type="button" data-signature-lens-index="${index}" data-flz-cta-id="signature-${index}">
        <span class="signature-index" aria-hidden="true">0${index + 1}</span>
        <span class="signature-item-copy"><strong ${editableBlock(`signature.${index}.label`, "eyebrow")}>${escapeHtml(section.eyebrow)}</strong><span ${editableBlock(`signature.${index}.copy`, "path-copy")}>${escapeHtml(section.headline)}</span></span>
      </button>`
    )
    .join("");
  const signatureContext = targetBrand
    ? `${brand.companyName} × ${targetBrand.companyName}`
    : `For ${draft.audienceLabel}`;
  const signatureMoment = `<section class="signature signature-canonical" data-template-primitive="signature-paths" aria-label="${escapeHtml(template.signatureAriaLabel)}">
      <div class="signature-intro"><p class="eyebrow">${escapeHtml(template.signatureEyebrow(draft.audienceLabel, targetBrand?.companyName))}</p><h2>${escapeHtml(draft.narrativeArc)}</h2><p>${escapeHtml(signatureContext)}</p></div>
      <div class="signature-items">${signatureButtons}</div>
    </section>`;
  const evidenceAttribute = (ids: string[]) =>
    `data-evidence-ids="${escapeHtml(ids.join(","))}"`;
  const frameworkFlow = framework
    ? `<section class="framework-section credibility-anchor" id="credibility-anchor" data-journey-section="credibility-anchor" data-template-primitive="credibility-anchor" ${evidenceAttribute(framework.credibility.evidenceIds)} aria-labelledby="credibility-anchor-heading">
        <div class="framework-copy">
          <p class="eyebrow" ${editableBlock("credibility.eyebrow", "section-label")}>${escapeHtml(framework.credibility.eyebrow)}</p>
          <h2 id="credibility-anchor-heading" ${editableBlock("credibility.headline", "headline")}>${escapeHtml(framework.credibility.headline)}</h2>
          <div class="fact-implication">
            <div><span>Verified fact</span><p ${editableBlock("credibility.fact", "evidence")}>${escapeHtml(framework.credibility.fact)}</p></div>
            <div><span>What it means</span><p ${editableBlock("credibility.implication", "body")}>${escapeHtml(framework.credibility.implication)}</p></div>
          </div>
        </div>
        ${frameworkImage(images, framework.credibility.imageBrief, "framework-media")}
      </section>
      <section class="framework-section urgency-section" id="why-change-now" data-journey-section="why-change-now" data-template-primitive="urgency" ${evidenceAttribute(framework.urgency.evidenceIds)} aria-labelledby="why-change-now-heading">
        <header class="framework-heading"><p class="eyebrow" ${editableBlock("urgency.eyebrow", "section-label")}>${escapeHtml(framework.urgency.eyebrow)}</p><h2 id="why-change-now-heading" ${editableBlock("urgency.headline", "headline")}>${escapeHtml(framework.urgency.headline)}</h2></header>
        <div class="argument-sequence">
          <article><span>01 · The change</span><p ${editableBlock("urgency.change", "evidence")}>${escapeHtml(framework.urgency.change)}</p></article>
          <article><span>02 · The consequence</span><p ${editableBlock("urgency.consequence", "body")}>${escapeHtml(framework.urgency.consequence)}</p></article>
          <article><span>03 · The better path</span><p ${editableBlock("urgency.reframe", "body")}>${escapeHtml(framework.urgency.reframe)}</p></article>
        </div>
      </section>
      <section class="lens-lab framework-starting-points" id="starting-points" data-journey-section="starting-points" data-template-primitive="starting-points" aria-labelledby="starting-points-heading">
        <header class="region-heading"><p class="eyebrow" ${editableBlock("startingPoints.eyebrow", "section-label")}>${escapeHtml(framework.startingPoints.eyebrow)}</p><h2 id="starting-points-heading" ${editableBlock("startingPoints.headline", "headline")}>${escapeHtml(framework.startingPoints.headline)}</h2><p class="region-intro" ${editableBlock("startingPoints.intro", "body")}>${escapeHtml(framework.startingPoints.intro)}</p></header>
        <div class="lens-tabs" role="tablist" aria-orientation="horizontal" aria-label="${escapeHtml(framework.startingPoints.headline)}">${lensButtons}</div>
        ${lensPanels}
      </section>
      <section class="framework-section mechanism-section" id="outcome-mechanism" data-journey-section="outcome-mechanism" data-template-primitive="mechanism" aria-labelledby="outcome-mechanism-heading">
        <div class="framework-copy">
          <p class="eyebrow" ${editableBlock("mechanism.eyebrow", "section-label")}>${escapeHtml(framework.mechanism.eyebrow)}</p>
          <h2 id="outcome-mechanism-heading" ${editableBlock("mechanism.headline", "headline")}>${escapeHtml(framework.mechanism.headline)}</h2>
          <p class="region-intro" ${editableBlock("mechanism.intro", "body")}>${escapeHtml(framework.mechanism.intro)}</p>
          <div class="mechanism-steps">${framework.mechanism.steps
            .map(
              (step, index) => `<article ${evidenceAttribute(step.evidenceIds)}><span class="step-index">0${index + 1}</span><div><h3 ${editableBlock(`mechanism.${index}.action`, "headline")}>${escapeHtml(step.action)}</h3><p ${editableBlock(`mechanism.${index}.capability`, "body")}>${escapeHtml(step.capability)}</p><strong ${editableBlock(`mechanism.${index}.output`, "outcome")}>${escapeHtml(step.output)}</strong></div></article>`
            )
            .join("")}</div>
        </div>
        ${frameworkImage(images, framework.mechanism.imageBrief, "framework-media mechanism-media")}
      </section>
      <section class="framework-section team-value-section" id="team-value" data-journey-section="team-value" data-template-primitive="team-value" aria-labelledby="team-value-heading">
        <header class="framework-heading"><p class="eyebrow" ${editableBlock("teamValue.eyebrow", "section-label")}>${escapeHtml(framework.teamValue.eyebrow)}</p><h2 id="team-value-heading" ${editableBlock("teamValue.headline", "headline")}>${escapeHtml(framework.teamValue.headline)}</h2><p class="region-intro" ${editableBlock("teamValue.intro", "body")}>${escapeHtml(framework.teamValue.intro)}</p></header>
        <div class="role-grid">${framework.teamValue.roles
          .map(
            (role, index) => `<article ${evidenceAttribute(role.evidenceIds)}><span class="role-index">0${index + 1}</span><h3 ${editableBlock(`teamValue.${index}.role`, "role")}>${escapeHtml(role.role)}</h3><dl><div><dt>Decision</dt><dd ${editableBlock(`teamValue.${index}.decision`, "body")}>${escapeHtml(role.decision)}</dd></div><div><dt>Risk</dt><dd ${editableBlock(`teamValue.${index}.risk`, "body")}>${escapeHtml(role.risk)}</dd></div><div><dt>Value</dt><dd ${editableBlock(`teamValue.${index}.benefit`, "body")}>${escapeHtml(role.benefit)}</dd></div><div><dt>Evidence needed</dt><dd ${editableBlock(`teamValue.${index}.evidence`, "evidence")}>${escapeHtml(role.evidenceNeeded)}</dd></div></dl></article>`
          )
          .join("")}</div>
      </section>${regions.resources}`
    : "";
  const pageFlow = framework ? frameworkFlow : `${signatureMoment}${experienceFlow}`;
  const closeMarkup = framework
    ? `<section class="close framework-close" id="next-step" data-journey-section="next-step" ${evidenceAttribute(framework.nextStep.evidenceIds)} aria-labelledby="next-step-heading">
        <div><p class="eyebrow" ${editableBlock("nextStep.eyebrow", "section-label")}>${escapeHtml(framework.nextStep.eyebrow)}</p><h2 id="next-step-heading" ${editableBlock("nextStep.headline", "headline")}>${escapeHtml(framework.nextStep.headline)}</h2><p ${editableBlock("nextStep.body", "body")}>${escapeHtml(framework.nextStep.body)}</p></div>
        <div class="next-step-panel"><dl><div><dt>Scope</dt><dd>${escapeHtml(framework.nextStep.scope)}</dd></div><div><dt>Activity</dt><dd>${escapeHtml(framework.nextStep.activity)}</dd></div><div><dt>You leave with</dt><dd>${escapeHtml(framework.nextStep.deliverable)}</dd></div><div><dt>Decision</dt><dd>${escapeHtml(framework.nextStep.resultingDecision)}</dd></div></dl>${actionControl(primaryAction, "primary", editableBlock("nextStep.ctaLabel", "cta"), framework.nextStep.ctaLabel)}</div>
      </section>`
    : `<section class="close" id="next-step" data-journey-section="next-step" aria-labelledby="next-step-heading">
        <div><p class="eyebrow" ${editableBlock("close.label", "section-label")}>${escapeHtml(draft.sectionLabels.close)}</p><h2 id="next-step-heading" ${editableBlock("close.headline", "headline")}>${escapeHtml(draft.closingHeadline)}</h2><p ${editableBlock("close.body", "body")}>${escapeHtml(draft.closingBody)}</p></div>
        ${actionControl(primaryAction, "primary", editableBlock("close.primaryCta", "cta"), draft.primaryCta)}
      </section>`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="referrer" content="strict-origin-when-cross-origin">
  <link rel="icon" href="/brand/folloze-symbol.png" type="image/png">
  <title>${escapeHtml(draft.title)}</title>
  ${themeLink}
  <style>
    ${fontFace(displayFontName, brand.displayFontUrl, input.fontDeliveryUrls?.display, "400 800")}
    ${fontFace(bodyFontName, brand.bodyFontUrl, input.fontDeliveryUrls?.body, "300 800")}
    :root{color-scheme:light;--brand-ink:${primary};--brand-accent:${accent};--brand-accent-on-light:${lightSurfaceAccent};--brand-surface:${surface};--brand-on-accent:${onAccent};--brand-dark:${darkSurface};--brand-soft-surface:${softSurface};--brand-support:${supportingAccent};--brand-button-bg:${buttonBackground};--brand-button-text:${buttonText};--brand-button-hover:${buttonHover};--brand-button-active:${buttonActive};--brand-secondary-border:${secondaryButtonBorder};--brand-secondary-text:${secondaryButtonText};--brand-focus:${focusColor};--button-radius:${buttonRadius}px;--button-height:${buttonHeight}px;--button-border-width:${buttonBorderWidth}px;--card-radius:${cardRadius}px;--card-border-width:${cardBorderWidth}px;--brand-card-shadow:${cardShadow};--content-max-width:${contentMaxWidth}px;--section-block:${sectionBlock}px;--grid-gap:${gridGap}px;--heading-weight:${headingWeight};--body-weight:${bodyWeight};--heading-tracking:${headingTracking}em;--heading-line-height:${headingLineHeight};--text:${lightText};--muted:${mutedText};--line:${dividerColor};--soft:color-mix(in srgb,var(--brand-soft-surface) 68%,var(--brand-surface));--display:${displayFont};--body:${bodyFont}}
    .media.media .media-fallback{padding:clamp(24px,5vw,54px);display:flex;flex-direction:column;align-items:flex-start;justify-content:flex-end;gap:22px;background:linear-gradient(145deg,color-mix(in srgb,var(--brand-accent) 12%,var(--brand-surface)),var(--brand-surface) 58%,color-mix(in srgb,var(--brand-ink) 10%,var(--brand-surface)));color:var(--brand-ink);text-align:left}.preview-brand-notice{margin:0;padding:8px clamp(22px,6vw,96px);border-bottom:1px solid var(--line);background:var(--brand-soft-surface);color:var(--muted);font-size:12px;line-height:1.4}.preview-brand-notice strong{color:var(--brand-ink)}
    .media.media .media-fallback:before,.media.media .media-fallback:after{display:none}
    .media.media .media-fallback>span{position:static;width:auto;height:auto;border:0;border-radius:0;transform:none}
    .media.media .media-fallback-kicker{font-size:11px;font-weight:850;letter-spacing:.15em;text-transform:uppercase}
    .media.media .media-fallback>strong{position:relative;max-width:520px;font-family:var(--display);font-size:clamp(34px,4.4vw,62px);line-height:.98;letter-spacing:-.035em}
    .media.media .media-fallback-steps{width:100%;padding-top:16px;display:grid;grid-template-columns:repeat(3,1fr);border-top:1px solid color-mix(in srgb,var(--brand-ink) 20%,transparent)}
    .media.media .media-fallback-steps i{font-style:normal;font-size:11px;font-weight:850;letter-spacing:.12em}
    .no-asset-treatment{isolation:isolate}.no-asset-treatment:before{content:"";position:absolute;inset:0;z-index:-1;opacity:.92}.no-asset-editorial-evidence:before{background:linear-gradient(135deg,color-mix(in srgb,var(--brand-accent) 18%,transparent),transparent 46%),repeating-linear-gradient(90deg,transparent 0 48px,color-mix(in srgb,var(--brand-ink) 8%,transparent) 49px 50px)}.no-asset-proof-receipt:before{background:radial-gradient(circle at 82% 16%,color-mix(in srgb,var(--brand-accent) 28%,transparent),transparent 28%),linear-gradient(135deg,var(--brand-soft-surface),var(--brand-surface))}.no-asset-choice-map:before{background:linear-gradient(90deg,color-mix(in srgb,var(--brand-accent) 14%,transparent) 1px,transparent 1px),linear-gradient(color-mix(in srgb,var(--brand-accent) 14%,transparent) 1px,transparent 1px);background-size:64px 64px}.no-asset-system-map:before{background:linear-gradient(135deg,transparent 49.5%,color-mix(in srgb,var(--brand-accent) 28%,transparent) 50%,transparent 50.5%),radial-gradient(circle at 20% 72%,color-mix(in srgb,var(--brand-support) 28%,transparent),transparent 28%)}.no-asset-data-frame:before{background:linear-gradient(90deg,transparent 0 18%,color-mix(in srgb,var(--brand-accent) 34%,transparent) 18% 20%,transparent 20% 44%,color-mix(in srgb,var(--brand-support) 28%,transparent) 44% 46%,transparent 46%)}.no-asset-chapter-index:before{background:repeating-linear-gradient(0deg,color-mix(in srgb,var(--brand-ink) 8%,transparent) 0 1px,transparent 1px 72px),linear-gradient(145deg,var(--brand-dark),var(--brand-surface));opacity:.38}
    *{box-sizing:border-box}[hidden]{display:none!important}html{scroll-behavior:auto;overflow-x:clip;scroll-padding-top:70px}body{margin:0;background:var(--brand-surface);color:var(--brand-ink);font-family:var(--body);line-height:1.5;overflow-x:clip;overscroll-behavior-y:contain;-webkit-font-smoothing:antialiased}button,a{font:inherit;touch-action:manipulation}.hero-copy,.lens-copy,.journey-copy,.close>div,.region-heading{min-width:0}.shell{max-width:1600px;min-height:100dvh;margin:0 auto;background:var(--brand-surface);overflow:clip}.eyebrow{margin:0 0 18px;color:var(--brand-accent);font-size:12px;font-weight:800;letter-spacing:.14em;text-transform:uppercase}.skip-link{position:fixed;left:16px;top:12px;z-index:1000;padding:10px 14px;border-radius:6px;background:var(--brand-ink);color:#fff;text-decoration:none;transform:translateY(-180%);transition:transform .16s ease}.skip-link:focus{transform:translateY(0)}.nav{height:78px;padding:0 clamp(22px,6vw,96px);display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--line);background:var(--brand-surface)}.brand-lockup{display:flex;flex:0 0 auto;align-items:center;gap:12px;min-width:0}.lockup-divider{min-width:38px;min-height:32px;padding:0 9px;display:grid;place-items:center;border-inline:1px solid color-mix(in srgb,var(--muted) 32%,transparent);color:var(--muted);font-size:9px;font-weight:800;letter-spacing:.12em;text-transform:uppercase}.wordmark{display:inline-grid;grid-template-areas:"mark";flex:0 0 auto;align-items:center;max-width:172px;min-height:36px;color:var(--brand-ink);font-weight:800;font-size:19px;line-height:1;white-space:nowrap}.wordmark img,.wordmark-fallback{grid-area:mark}.wordmark img{display:block;width:auto;height:auto;max-width:172px;max-height:32px;object-fit:contain;opacity:0}.wordmark-fallback{max-width:100%;overflow:hidden;text-overflow:ellipsis}.wordmark.has-image img{opacity:1}.wordmark.has-image .wordmark-fallback{visibility:hidden}.target-wordmark{max-width:142px}.target-wordmark img{max-width:142px;max-height:30px}.nav-action{border:0;background:transparent;color:var(--brand-ink);min-height:44px;padding:0;cursor:pointer;font-weight:750}.nav-action:hover,.nav-action:focus-visible{color:var(--brand-accent)}
    .journey-nav{position:sticky;top:0;z-index:40;min-height:58px;border-bottom:1px solid color-mix(in srgb,var(--brand-ink) 14%,transparent);background:color-mix(in srgb,var(--brand-surface) 92%,transparent);box-shadow:0 12px 34px color-mix(in srgb,var(--brand-ink) 7%,transparent);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px)}.journey-nav-inner{min-height:58px;padding:0 clamp(22px,6vw,96px);display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:clamp(18px,3vw,42px)}.journey-nav-title{display:grid;min-width:124px;line-height:1.1}.journey-nav-title strong{font-size:11px;letter-spacing:.13em;text-transform:uppercase}.journey-nav-title small{max-width:170px;margin-top:4px;overflow:hidden;color:var(--muted);font-size:11px;text-overflow:ellipsis;white-space:nowrap}.journey-links{min-width:0;width:100%;display:flex;align-self:stretch;align-items:center;justify-content:flex-start;gap:clamp(4px,1vw,14px);overflow-x:auto;overscroll-behavior-inline:contain;scrollbar-width:none}.journey-links::-webkit-scrollbar{display:none}.journey-links button{position:relative;display:inline-flex;flex:0 0 auto;align-items:center;gap:8px;min-height:44px;padding:0 9px;border:0;background:transparent;color:var(--muted);cursor:pointer;font-size:12px;font-weight:750;white-space:nowrap}.journey-links button>span{width:5px;height:5px;border-radius:50%;background:currentColor;opacity:.35;transition:opacity .18s ease,transform .18s ease}.journey-links button:after{content:"";position:absolute;left:9px;right:9px;bottom:0;height:2px;background:var(--brand-accent);transform:scaleX(0);transform-origin:center;transition:transform .18s ease}.journey-links button:hover,.journey-links button:focus-visible,.journey-links button[aria-current="location"]{color:var(--brand-ink)}.journey-links button[aria-current="location"]>span{background:var(--brand-accent);opacity:1;transform:scale(1.45)}.journey-links button[aria-current="location"]:after{transform:scaleX(1)}.fullscreen-control{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:40px;padding:7px 10px;border:1px solid var(--line);border-radius:999px;background:var(--brand-surface);color:var(--brand-ink);cursor:pointer;font-size:11px;font-weight:800;white-space:nowrap}.fullscreen-control svg{width:17px;height:17px;fill:none;stroke:currentColor;stroke-linecap:round;stroke-linejoin:round;stroke-width:1.6}.fullscreen-control:hover,.fullscreen-control:focus-visible,.fullscreen-control[aria-pressed="true"]{border-color:var(--brand-accent);color:var(--brand-accent)}
    .hero{position:relative;min-height:650px;padding:clamp(70px,8vw,128px) clamp(24px,7vw,112px);display:grid;grid-template-columns:minmax(0,1.04fr) minmax(360px,.76fr);gap:clamp(44px,7vw,108px);align-items:center;background:linear-gradient(132deg,var(--brand-surface) 0 58%,var(--soft) 58% 100%)}.hero-copy{position:relative;z-index:2}.hero h1{max-width:940px;margin:0;font-family:var(--display);font-size:clamp(46px,4.6vw,72px);font-weight:800;line-height:1.02;letter-spacing:-.01em;text-wrap:balance;overflow-wrap:break-word}.hero .subhead{max-width:780px;margin:28px 0 34px;color:var(--text);font-size:clamp(18px,1.65vw,22px);line-height:1.5}.primary,.secondary{display:inline-flex;align-items:center;justify-content:center;min-height:var(--button-height);padding:13px 24px;border-radius:var(--button-radius);text-decoration:none;font-weight:750;cursor:pointer;transition:background-color .18s ease,color .18s ease,border-color .18s ease}.primary{border:var(--button-border-width) solid var(--brand-button-bg);background:var(--brand-button-bg);color:var(--brand-button-text)}.primary:hover,.primary:focus-visible{border-color:var(--brand-button-hover);background:var(--brand-button-hover)}.primary:active{border-color:var(--brand-button-active);background:var(--brand-button-active)}.secondary{border:var(--button-border-width) solid var(--brand-secondary-border);background:transparent;color:var(--brand-secondary-text)}.secondary:hover,.secondary:focus-visible{border-color:var(--brand-button-hover);color:var(--brand-button-hover)}.actions{display:flex;gap:12px;flex-wrap:wrap}.hero-media{width:100%;max-width:100%;height:clamp(380px,42vw,560px);min-height:0;align-self:center;border:1px solid color-mix(in srgb,var(--brand-ink) 12%,transparent);border-radius:var(--card-radius);box-shadow:0 28px 80px color-mix(in srgb,var(--brand-ink) 16%,transparent)}.media{position:relative;margin:0;overflow:hidden;background:var(--soft)}.media img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:center;opacity:0;transition:opacity .2s ease}.media.has-asset img{opacity:1}.media-fallback{position:absolute;inset:0;isolation:isolate}.media.has-asset .media-fallback{opacity:0}.context-note{display:inline-flex;align-items:center;gap:9px;margin-top:24px;padding:9px 13px;border:1px solid var(--line);border-radius:999px;color:var(--muted);font-size:13px}.context-note:before{content:"";width:8px;height:8px;border-radius:50%;background:var(--brand-accent)}
    .signature{padding:clamp(58px,7vw,104px) clamp(24px,7vw,112px)}.signature-intro h2{max-width:1060px;margin:0;font-family:var(--display);font-size:clamp(38px,4.4vw,66px);line-height:1.03;letter-spacing:-.035em}.signature-intro>p:last-child{margin:22px 0 0;color:var(--muted);font-weight:700}.signature-items button{appearance:none;width:100%;border:0;text-align:left;color:inherit;font:inherit;cursor:pointer}.signature-index{padding-top:5px;font:800 13px/1 var(--body);letter-spacing:.12em}.signature-item-copy{display:grid;gap:8px}.signature-item-copy strong{font-size:13px;letter-spacing:.1em;text-transform:uppercase}.signature-item-copy>span{font-family:var(--display);font-size:clamp(18px,1.7vw,25px);line-height:1.18}.signature-canonical{display:grid;grid-template-columns:minmax(300px,.82fr) minmax(420px,1.08fr);gap:clamp(44px,7vw,110px);align-items:start;background:var(--soft);border-top:1px solid var(--line);border-bottom:1px solid var(--line)}.signature-canonical .signature-items{display:grid;border-top:1px solid color-mix(in srgb,var(--brand-ink) 20%,transparent)}.signature-canonical button{display:grid;grid-template-columns:52px 1fr;gap:18px;padding:28px 0;background:transparent;border-bottom:1px solid color-mix(in srgb,var(--brand-ink) 20%,transparent)}.signature-canonical button:hover,.signature-canonical button:focus-visible{color:var(--brand-accent-on-light)}
    .thesis{padding:clamp(72px,8vw,126px) clamp(24px,7vw,112px);background:var(--brand-ink);color:#fff}.thesis h2{max-width:1120px;margin:0;font-family:var(--display);font-size:clamp(42px,5.4vw,78px);font-weight:700;line-height:1.02;letter-spacing:-.04em;overflow-wrap:anywhere}.thesis p{max-width:760px;margin:26px 0 0;color:color-mix(in srgb,#fff 74%,var(--brand-ink));font-size:19px;line-height:1.55}
    .lens-lab{padding:clamp(70px,8vw,118px) clamp(24px,7vw,112px) clamp(76px,8vw,126px);background:var(--soft)}.region-heading{max-width:1060px;margin:0 0 50px}.region-heading h2{margin:0;font-family:var(--display);font-size:clamp(40px,4.8vw,70px);line-height:1.03;letter-spacing:-.04em}.lens-tabs{display:flex;gap:8px;padding:0 0 28px;overflow-x:auto;scrollbar-width:thin}.lens-tabs button{flex:0 0 auto;min-height:46px;padding:10px 16px;border:1px solid color-mix(in srgb,var(--brand-ink) 28%,transparent);background:transparent;color:var(--brand-ink);font-weight:750;cursor:pointer}.lens-tabs button[aria-selected="true"]{border-color:var(--brand-ink);background:var(--brand-ink);color:#fff}.lens-tabs button:focus-visible{outline:3px solid color-mix(in srgb,var(--brand-accent) 45%,transparent);outline-offset:3px}.lens-panel{display:grid;grid-template-columns:120px minmax(0,.94fr) minmax(320px,.78fr);gap:clamp(34px,5vw,76px);align-items:center;min-height:520px}.lens-panel[hidden]{display:none}.lens-number{align-self:start;padding-top:10px;color:color-mix(in srgb,var(--brand-ink) 18%,transparent);font:700 clamp(82px,10vw,150px)/.82 var(--display)}.lens-copy h2{margin:0;font-family:var(--display);font-size:clamp(38px,4.5vw,66px);line-height:1.04;letter-spacing:-.035em}.lens-copy>p:not(.eyebrow){max-width:650px;margin:24px 0;color:var(--text);font-size:19px}.lens-media{min-height:390px;background:var(--brand-surface)}
    .journey{padding:clamp(68px,7vw,104px) clamp(24px,7vw,112px);background:var(--brand-surface)}.journey-header{max-width:980px;margin-bottom:44px}.journey-header h2{margin:0;font-family:var(--display);font-size:clamp(42px,5vw,68px);line-height:1.03;letter-spacing:-.04em}.source-basis{max-width:680px;margin:18px 0 0;color:var(--muted);font-size:14px}.journey-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.journey-card{min-height:360px;padding:28px;display:flex;flex-direction:column;border:1px solid var(--line);background:var(--soft);transition:transform .18s ease,border-color .18s ease,box-shadow .18s ease}.journey-card:hover{transform:translateY(-5px);border-color:var(--brand-accent);box-shadow:0 22px 56px color-mix(in srgb,var(--brand-ink) 12%,transparent)}.journey-index{color:var(--brand-accent);font:800 14px/1 var(--body);letter-spacing:.13em}.journey-copy{margin-top:38px}.journey-copy .eyebrow{margin-bottom:12px}.journey-copy h3{margin:0;font-family:var(--display);font-size:clamp(25px,2.2vw,34px);line-height:1.08;letter-spacing:-.025em}.journey-copy>p:not(.eyebrow){margin:18px 0 0;color:var(--text);font-size:15px;line-height:1.55}.journey-copy .source-citation{margin-top:16px;color:var(--muted);font-size:12px;font-weight:750;letter-spacing:.05em}.journey-action{min-height:44px;margin-top:auto;padding:20px 0 0;display:flex;align-items:center;justify-content:space-between;border:0;border-top:1px solid color-mix(in srgb,var(--brand-ink) 16%,transparent);background:transparent;color:var(--brand-ink);font-weight:750;cursor:pointer}.journey-action:hover,.journey-action:focus-visible{color:var(--brand-accent)}
    .close{margin:0 clamp(14px,3vw,46px) clamp(14px,3vw,46px);padding:clamp(66px,8vw,116px);display:grid;grid-template-columns:minmax(0,1fr) 280px;gap:54px;align-items:end;background:radial-gradient(circle at 90% 10%,color-mix(in srgb,var(--brand-accent) 58%,transparent),transparent 30%),var(--brand-ink);color:#fff}.close h2{max-width:980px;margin:0;font-family:var(--display);font-size:clamp(42px,5.2vw,76px);line-height:1.01;letter-spacing:-.04em}.close p{max-width:720px;margin:24px 0 0;color:color-mix(in srgb,#fff 76%,var(--brand-ink));font-size:18px}.close .primary{width:100%;white-space:nowrap}
    .framework-seven .hero-no-media{grid-template-columns:minmax(0,980px);background:linear-gradient(132deg,var(--brand-surface),var(--soft))}.framework-seven .hero-no-media .hero-copy{max-width:980px}.framework-section{padding:clamp(76px,8vw,126px) clamp(24px,7vw,112px);scroll-margin-top:70px}.framework-section h2,.framework-starting-points .region-heading h2{max-width:1040px;margin:0;font-family:var(--display);font-size:clamp(42px,5vw,72px);font-weight:750;line-height:1.02;letter-spacing:-.04em;text-wrap:balance}.framework-heading{max-width:1080px;margin-bottom:46px}.region-intro{max-width:760px;margin:24px 0 0;color:var(--text);font-size:18px;line-height:1.6}.credibility-anchor{display:grid;grid-template-columns:minmax(0,1fr) minmax(320px,.72fr);gap:clamp(46px,7vw,106px);align-items:center;background:var(--brand-surface)}.credibility-anchor:not(:has(.framework-media)){grid-template-columns:minmax(0,980px)}.fact-implication{margin-top:46px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1px;background:var(--line);border:1px solid var(--line)}.fact-implication>div{padding:28px;background:var(--brand-surface)}.fact-implication span,.argument-sequence span,.step-index,.role-index,.next-step-panel dt{display:block;color:var(--brand-accent-on-light);font-size:11px;font-weight:850;letter-spacing:.13em;text-transform:uppercase}.fact-implication p{margin:14px 0 0;color:var(--text);font-size:17px;line-height:1.55}.framework-media{width:100%;min-height:420px;border:1px solid var(--line);border-radius:var(--card-radius)}.urgency-section{background:var(--brand-dark);color:#fff}.urgency-section .eyebrow{color:var(--brand-accent)}.argument-sequence{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));border-top:1px solid color-mix(in srgb,#fff 28%,transparent)}.argument-sequence article{min-height:250px;padding:30px clamp(18px,2.2vw,34px);border-right:1px solid color-mix(in srgb,#fff 20%,transparent)}.argument-sequence article:last-child{border-right:0}.argument-sequence span{color:var(--brand-accent)}.argument-sequence p{margin:38px 0 0;color:color-mix(in srgb,#fff 84%,transparent);font-family:var(--display);font-size:clamp(22px,2vw,30px);line-height:1.22}.framework-starting-points .region-heading{max-width:1080px}.validation-question{margin-top:26px!important;padding:18px 20px;border-left:3px solid var(--brand-accent);background:color-mix(in srgb,var(--brand-surface) 72%,transparent);font-size:15px!important}.validation-question strong{display:block;margin-bottom:6px;color:var(--brand-ink);font-size:10px;letter-spacing:.12em;text-transform:uppercase}.lens-panel.no-media{grid-template-columns:90px minmax(0,1fr)}.mechanism-section{display:grid;grid-template-columns:minmax(0,1.08fr) minmax(300px,.62fr);gap:clamp(46px,7vw,100px);background:var(--brand-surface)}.mechanism-section:not(:has(.framework-media)){grid-template-columns:minmax(0,1120px)}.mechanism-steps{margin-top:48px;border-top:1px solid var(--line)}.mechanism-steps article{padding:28px 0;display:grid;grid-template-columns:64px minmax(0,1fr);gap:20px;border-bottom:1px solid var(--line)}.mechanism-steps h3{margin:0;font-family:var(--display);font-size:clamp(22px,2vw,31px);line-height:1.16}.mechanism-steps p{margin:12px 0;color:var(--text)}.mechanism-steps strong{display:block;color:var(--brand-accent-on-light);font-size:14px}.team-value-section{background:var(--soft)}.role-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.role-grid article{padding:30px;border:1px solid var(--line);background:var(--brand-surface)}.role-grid h3{min-height:70px;margin:24px 0 0;font-family:var(--display);font-size:clamp(24px,2.1vw,32px);line-height:1.12}.role-grid dl{margin:26px 0 0}.role-grid dl>div{padding:15px 0;border-top:1px solid var(--line)}.role-grid dt{color:var(--muted);font-size:10px;font-weight:850;letter-spacing:.12em;text-transform:uppercase}.role-grid dd{margin:6px 0 0;color:var(--text);font-size:14px;line-height:1.5}.framework-close{grid-template-columns:minmax(0,1fr) minmax(340px,.65fr);align-items:start}.next-step-panel{padding:26px;border:1px solid color-mix(in srgb,#fff 22%,transparent);background:color-mix(in srgb,#fff 7%,transparent)}.next-step-panel dl{margin:0}.next-step-panel dl>div{padding:12px 0;border-bottom:1px solid color-mix(in srgb,#fff 18%,transparent)}.next-step-panel dt{color:var(--brand-accent)}.next-step-panel dd{margin:5px 0 0;color:color-mix(in srgb,#fff 84%,transparent);font-size:14px;line-height:1.45}.next-step-panel .primary{margin-top:24px}
    .composition-editorial-split .hero-copy{max-width:780px}.composition-editorial-split .credibility-anchor{border-top:1px solid var(--line);border-bottom:1px solid var(--line)}
    .composition-evidence-lead .hero{grid-template-columns:minmax(0,.74fr) minmax(440px,1.08fr)}.composition-evidence-lead .hero-copy{align-self:end;padding-bottom:clamp(20px,4vw,70px)}.composition-evidence-lead .credibility-anchor{background:var(--brand-dark);color:#fff}.composition-evidence-lead .credibility-anchor .eyebrow{color:var(--brand-accent)}.composition-evidence-lead .fact-implication{border-color:color-mix(in srgb,#fff 22%,transparent);background:color-mix(in srgb,#fff 22%,transparent)}.composition-evidence-lead .fact-implication>div{background:color-mix(in srgb,#fff 7%,var(--brand-dark))}.composition-evidence-lead .fact-implication p{color:color-mix(in srgb,#fff 86%,transparent)}.composition-evidence-lead .framework-media{border-color:color-mix(in srgb,#fff 20%,transparent)}
    .composition-interactive-paths .framework-starting-points{background:color-mix(in srgb,var(--brand-accent) 8%,var(--brand-surface))}.composition-interactive-paths .lens-tabs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:var(--grid-gap);padding-bottom:var(--grid-gap)}.composition-interactive-paths .lens-tabs button{min-height:74px;padding:18px 20px;white-space:normal;text-align:left;border-radius:var(--card-radius);background:var(--brand-surface)}.composition-interactive-paths .lens-panel{padding:clamp(24px,4vw,48px);border:1px solid var(--line);border-radius:var(--card-radius);background:var(--brand-surface)}
    .composition-workflow-spine .hero{background-image:linear-gradient(color-mix(in srgb,var(--brand-ink) 5%,transparent) 1px,transparent 1px),linear-gradient(90deg,color-mix(in srgb,var(--brand-ink) 5%,transparent) 1px,transparent 1px);background-size:38px 38px}.composition-workflow-spine .mechanism-section{grid-template-columns:1fr}.composition-workflow-spine .mechanism-media{display:none}.composition-workflow-spine .mechanism-steps{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));border:1px solid var(--line)}.composition-workflow-spine .mechanism-steps article{position:relative;min-height:300px;padding:32px;display:flex;flex-direction:column;gap:38px;border:0;border-right:1px solid var(--line)}.composition-workflow-spine .mechanism-steps article:last-child{border-right:0}.composition-workflow-spine .mechanism-steps article:not(:last-child):after{content:"";position:absolute;right:-7px;top:50%;z-index:2;width:12px;height:12px;border:2px solid var(--brand-surface);border-radius:50%;background:var(--brand-accent)}
    .composition-data-story .hero{grid-template-columns:minmax(0,1.12fr) minmax(360px,.58fr);background:var(--soft)}.composition-data-story .hero h1{max-width:920px}.composition-data-story .credibility-anchor{grid-template-columns:minmax(320px,.64fr) minmax(0,1.1fr);background:var(--brand-surface)}.composition-data-story .fact-implication{grid-template-columns:1fr}.composition-data-story .fact-implication>div:first-child p{font-family:var(--display);font-size:clamp(28px,3vw,48px);font-weight:var(--heading-weight);line-height:1.05}.composition-data-story .role-grid article{position:relative;overflow:hidden}.composition-data-story .role-grid article:before{content:"";position:absolute;left:0;top:0;width:100%;height:5px;background:linear-gradient(90deg,var(--brand-accent) 0 66%,var(--line) 66%)}
    .composition-chapter-journey .hero{min-height:72vh}.composition-chapter-journey .framework-starting-points{background:var(--brand-dark);color:#fff}.composition-chapter-journey .framework-starting-points .eyebrow{color:var(--brand-accent)}.composition-chapter-journey .framework-starting-points .region-intro{color:color-mix(in srgb,#fff 76%,transparent)}.composition-chapter-journey .lens-tabs{counter-reset:chapter;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1px;padding:0;background:color-mix(in srgb,#fff 18%,transparent)}.composition-chapter-journey .lens-tabs button{counter-increment:chapter;min-height:92px;padding:18px 20px;border:0;background:var(--brand-dark);color:#fff;text-align:left;white-space:normal}.composition-chapter-journey .lens-tabs button:before{content:"0" counter(chapter) "  ";color:var(--brand-accent)}.composition-chapter-journey .lens-tabs button[aria-selected="true"]{background:var(--brand-accent);color:var(--brand-on-accent)}.composition-chapter-journey .lens-tabs button[aria-selected="true"]:before{color:currentColor}.composition-chapter-journey .lens-panel{padding:clamp(30px,5vw,64px) 0;color:#fff}.composition-chapter-journey .lens-copy>p:not(.eyebrow){color:color-mix(in srgb,#fff 78%,transparent)}
    @keyframes guided-arrival{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}@media(prefers-reduced-motion:no-preference){.motion-guided .hero-copy,.motion-guided .hero-media{animation:guided-arrival .48s cubic-bezier(.2,.8,.2,1) both}.motion-guided .hero-media{animation-delay:.08s}.motion-demonstrative .lens-tabs button{transition:transform .18s ease,background-color .18s ease,color .18s ease}.motion-demonstrative .lens-tabs button:hover{transform:translateY(-2px)}.motion-quiet .hero-media{box-shadow:var(--brand-card-shadow)}}
    body.cta-outline .primary{background:transparent;color:var(--brand-accent)}body.cta-outline .close .primary{background:transparent;border-color:var(--brand-secondary-border);color:var(--brand-secondary-text)}body.cta-text .primary{min-height:44px;padding:8px 0;border:0;border-bottom:2px solid currentColor;border-radius:0;background:transparent;color:var(--brand-accent)}body.cta-text .close .primary{color:#fff}.footer{padding:26px clamp(24px,6vw,96px);display:flex;justify-content:space-between;gap:24px;color:var(--muted);font-size:12px}.footer a{color:inherit;text-decoration:none}.footer a:hover,.footer a:focus-visible{color:var(--brand-accent)}.experience-region,.framework-section,.close,#next-step,.hero{scroll-margin-top:70px}
    html:fullscreen,html:fullscreen body,html:fullscreen .shell{width:100%;max-width:none;min-height:100%;background:var(--brand-surface)}body.is-fullscreen .shell{max-width:none}body.is-fullscreen .journey-nav{padding-left:env(safe-area-inset-left);padding-right:env(safe-area-inset-right)}body.is-fullscreen .hero{min-height:calc(100dvh - 58px)}
    body.style-editorial .hero h1,body.style-editorial .signature-intro h2,body.style-editorial .thesis h2,body.style-editorial .region-heading h2,body.style-editorial .journey-header h2{letter-spacing:-.025em}body.style-editorial .eyebrow{letter-spacing:.18em}body.style-technical .fullscreen-control{border-radius:4px}body.style-technical .hero{background-image:linear-gradient(color-mix(in srgb,var(--brand-ink) 5%,transparent) 1px,transparent 1px),linear-gradient(90deg,color-mix(in srgb,var(--brand-ink) 5%,transparent) 1px,transparent 1px);background-size:42px 42px}body.style-minimal .hero{background:var(--brand-surface)}body.style-minimal .hero-media{box-shadow:none}body.style-minimal .signature,body.style-minimal .lens-lab,body.style-minimal .journey{background:var(--brand-surface)}body.style-minimal .journey-card{background:transparent}
    body[data-edit-mode="true"] [data-flz-editable]{cursor:text;outline:1px dashed color-mix(in srgb,var(--brand-accent) 62%,transparent);outline-offset:5px}
    body.design-source-brand-technical .lens-tabs button{border-radius:6px}body.design-source-brand-editorial .hero h1,body.design-source-brand-editorial .thesis h2,body.design-source-brand-editorial .region-heading h2{letter-spacing:-.028em}body.design-neutral-fallback .hero-media{box-shadow:none}
    body.brand-hero-dark .nav{border-color:color-mix(in srgb,#fff 15%,transparent);background:var(--brand-dark)}body.brand-hero-dark .wordmark,body.brand-hero-dark .nav-action{color:#fff}body.brand-hero-dark .lockup-divider{color:color-mix(in srgb,#fff 64%,transparent)}body.brand-hero-dark .journey-nav{border-color:color-mix(in srgb,#fff 14%,transparent);background:color-mix(in srgb,var(--brand-dark) 94%,transparent);box-shadow:0 12px 34px color-mix(in srgb,#000 24%,transparent)}body.brand-hero-dark .journey-nav-title,body.brand-hero-dark .journey-links button,body.brand-hero-dark .fullscreen-control{color:color-mix(in srgb,#fff 72%,transparent)}body.brand-hero-dark .journey-links button:hover,body.brand-hero-dark .journey-links button:focus-visible,body.brand-hero-dark .journey-links button[aria-current="location"]{color:#fff}body.brand-hero-dark .fullscreen-control{border-color:color-mix(in srgb,#fff 30%,transparent);background:transparent}body.brand-hero-dark .hero{background:radial-gradient(ellipse 80% 48% at 3% 100%,color-mix(in srgb,var(--brand-accent) 48%,transparent) 0,transparent 72%),radial-gradient(ellipse 72% 60% at 100% 0,color-mix(in srgb,var(--brand-support) 46%,transparent) 0,transparent 72%),var(--brand-dark);color:#fff}body.brand-hero-dark .hero h1{background:none;-webkit-text-fill-color:currentColor;color:#fff}body.brand-hero-dark .hero h1::first-line{-webkit-text-fill-color:var(--brand-accent);color:var(--brand-accent)}body.brand-hero-dark .hero .subhead{color:color-mix(in srgb,#fff 84%,transparent)}body.brand-hero-dark .hero .eyebrow{color:var(--brand-accent)}body.brand-hero-dark .hero .context-note{border-color:color-mix(in srgb,#fff 30%,transparent);color:color-mix(in srgb,#fff 78%,transparent)}body.brand-hero-dark .hero-media{border-color:color-mix(in srgb,#fff 20%,transparent);background:color-mix(in srgb,#fff 7%,transparent);box-shadow:0 36px 110px color-mix(in srgb,#000 34%,transparent)}body.brand-hero-dark .media.media .media-fallback{background:linear-gradient(145deg,color-mix(in srgb,var(--brand-accent) 22%,var(--brand-dark)),var(--brand-dark) 58%,color-mix(in srgb,var(--brand-support) 22%,var(--brand-dark)));color:#fff}body.brand-hero-dark .close{background:radial-gradient(circle at 90% 10%,color-mix(in srgb,var(--brand-support) 44%,transparent),transparent 32%),var(--brand-dark)}body.brand-hero-dark.cta-outline .hero .primary{border-color:var(--brand-secondary-border);color:var(--brand-secondary-text)}body.brand-hero-dark.cta-text .hero .primary{color:var(--brand-accent)}
    ${designDnaCss}body.brand-motif-soft-gradient .hero{background-image:linear-gradient(132deg,color-mix(in srgb,var(--brand-accent) 12%,var(--brand-surface)),var(--brand-surface) 58%,var(--brand-soft-surface))}body.brand-motif-radial-glow .hero{background-image:radial-gradient(circle at 85% 12%,color-mix(in srgb,var(--brand-support) 28%,transparent),transparent 46%),radial-gradient(circle at 4% 96%,color-mix(in srgb,var(--brand-accent) 22%,transparent),transparent 42%)}body.brand-motif-technical-grid .hero{background-image:linear-gradient(color-mix(in srgb,var(--brand-ink) 6%,transparent) 1px,transparent 1px),linear-gradient(90deg,color-mix(in srgb,var(--brand-ink) 6%,transparent) 1px,transparent 1px);background-size:42px 42px}
    button:focus-visible,a:focus-visible{outline:3px solid color-mix(in srgb,var(--brand-focus) 68%,transparent);outline-offset:4px}
    @media(max-width:980px){.hero,.composition-evidence-lead .hero,.composition-data-story .hero{grid-template-columns:1fr;min-height:auto}.hero-media{height:clamp(380px,58vw,540px)}.signature-canonical{grid-template-columns:1fr}.lens-panel{grid-template-columns:90px 1fr}.lens-media{grid-column:2}.journey-grid{grid-template-columns:1fr}.journey-card{min-height:230px}.journey-copy{margin-top:30px}.close{grid-template-columns:1fr;align-items:start}.journey-nav-inner{grid-template-columns:minmax(0,1fr) auto;gap:12px}.journey-nav-title{display:none}.journey-links{justify-content:flex-start}.credibility-anchor,.composition-data-story .credibility-anchor,.mechanism-section{grid-template-columns:1fr}.fact-implication,.argument-sequence,.role-grid{grid-template-columns:1fr}.argument-sequence article{min-height:0;border-right:0;border-bottom:1px solid color-mix(in srgb,#fff 20%,transparent)}.role-grid h3{min-height:0}.framework-close{grid-template-columns:1fr}.framework-media{min-height:360px}.composition-workflow-spine .mechanism-steps{grid-template-columns:1fr}.composition-workflow-spine .mechanism-steps article{min-height:0;border-right:0;border-bottom:1px solid var(--line)}.composition-workflow-spine .mechanism-steps article:not(:last-child):after{left:38px;right:auto;top:auto;bottom:-7px}.composition-interactive-paths .lens-tabs,.composition-chapter-journey .lens-tabs{grid-template-columns:1fr}}
    @media(max-width:620px){.nav{height:68px;padding:0 20px}.brand-lockup{gap:10px}.seller-wordmark{max-width:116px}.seller-wordmark img{height:27px;max-width:116px}.target-wordmark,.lockup-divider{display:none}.nav-action{font-size:13px}.hero{padding:50px 22px 42px;background:var(--brand-surface)}.hero h1{font-size:clamp(38px,10.5vw,46px);line-height:1.02}.hero .subhead{font-size:17px}.actions{align-items:stretch;flex-direction:column}.actions>*{width:100%}.hero-media{height:auto;min-height:280px;margin-top:12px;box-shadow:0 18px 48px color-mix(in srgb,var(--brand-ink) 14%,transparent)}.context-note{border-radius:14px;align-items:flex-start}.signature{padding:54px 22px}.signature-intro h2{font-size:36px}.signature-canonical button{grid-template-columns:40px 1fr}.thesis{padding:58px 22px}.thesis h2{font-size:clamp(34px,9.6vw,46px)}.thesis p{font-size:17px}.lens-lab{padding:54px 22px 64px}.lens-tabs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;overflow:visible}.lens-tabs button{min-width:0;padding:9px 7px;white-space:normal;font-size:12px;line-height:1.2}.lens-panel{grid-template-columns:1fr;min-height:0;gap:28px}.lens-number{font-size:68px}.lens-media{grid-column:1;min-height:270px}.lens-copy h2{font-size:37px}.lens-copy>p:not(.eyebrow){font-size:17px}.journey{padding:58px 22px}.journey-header{margin-bottom:34px}.journey-card{min-height:260px;padding:24px}.journey-copy h3{font-size:28px}.close{margin:0 10px 10px;padding:56px 24px;gap:32px}.close h2{font-size:40px}.close .primary{width:100%}.footer{padding:26px 22px;flex-direction:column;gap:8px}html{scroll-padding-top:58px}.journey-nav,.journey-nav-inner{min-height:54px}.journey-nav-inner{padding-left:max(12px,env(safe-area-inset-left));padding-right:max(12px,env(safe-area-inset-right))}.journey-links{gap:2px;scroll-snap-type:x proximity}.journey-links button{min-height:50px;padding:0 8px;scroll-snap-align:start;font-size:11px}.journey-links button:after{left:8px;right:8px}.fullscreen-control{width:40px;height:40px;padding:0}.fullscreen-control [data-fullscreen-label]{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}.signal-toast{bottom:max(14px,env(safe-area-inset-bottom));border-radius:12px}.folloze-invite,.folloze-insight{right:16px;bottom:max(16px,env(safe-area-inset-bottom))}body.is-fullscreen .nav{display:none}body.is-fullscreen .hero{min-height:auto}.experience-region,.close,#next-step,.hero{scroll-margin-top:62px}}
    @media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}.skip-link,.primary,.secondary,.journey-links button>span,.journey-links button:after,.journey-card,.media img,.signal-toast{transition:none!important;animation:none!important}.signal-toast{transform:translate(-50%,0)}.journey-links{scroll-behavior:auto}}
    @media(forced-colors:active){body.brand-hero-dark .hero h1{-webkit-text-fill-color:currentColor;background:none;color:CanvasText}.journey-links button[aria-current="location"]{outline:2px solid currentColor}.signal-toast,.folloze-invite,.folloze-insight{border:2px solid currentColor}.signal-toast-mark>span{box-shadow:none}}
    .eyebrow,.journey-index{color:var(--brand-accent-on-light)}
    .nav-action:hover,.nav-action:focus-visible,.fullscreen-control:hover,.fullscreen-control:focus-visible,.fullscreen-control[aria-pressed="true"],.signature-canonical button:hover,.signature-canonical button:focus-visible,.journey-action:hover,.journey-action:focus-visible,.footer a:hover,.footer a:focus-visible{color:var(--brand-accent-on-light)}
    body.cta-outline .primary,body.cta-text .primary{color:var(--brand-accent-on-light)}
    body.brand-hero-dark .hero .eyebrow,.close .eyebrow{color:var(--brand-accent)}
    .content-detail{width:min(620px,calc(100vw - 32px));padding:0;border:1px solid var(--line);border-radius:var(--card-radius);background:var(--brand-surface);color:var(--brand-ink);box-shadow:0 32px 96px color-mix(in srgb,var(--brand-ink) 30%,transparent)}.content-detail::backdrop{background:color-mix(in srgb,var(--brand-ink) 64%,transparent);backdrop-filter:blur(5px)}.content-detail form{position:relative;padding:clamp(28px,5vw,52px)}.content-detail h3{margin:0;font:var(--heading-weight) clamp(30px,4vw,48px)/1.05 var(--display);letter-spacing:var(--heading-tracking)}.content-detail p:not(.eyebrow){margin:20px 0;color:var(--text);font-size:17px}.content-detail .dialog-close{position:absolute;right:16px;top:14px;width:42px;height:42px;border:1px solid var(--line);border-radius:999px;background:var(--brand-surface);color:var(--brand-ink);cursor:pointer;font-size:24px}.content-detail .primary{margin-top:12px}
  </style>
</head>
<body class="register-${escapeHtml(draft.campaignRegister)} design-${escapeHtml(draft.designRegister)} template-${template.family} archetype-${template.archetypeId} composition-${template.compositionId} visual-grammar-${visualGrammar.id} motion-${visualGrammar.motionProfile} variant-${selectedVariant} style-${selectedStyle} cta-${selectedCtaStyle} brand-hero-${heroTheme}${designDna ? ` brand-design-dna brand-motif-${motif}` : ""}${framework ? " framework-seven" : ""}${imageryTreatment ? ` imagery-${imageryTreatment}` : ""}" data-wireframe="${escapeHtml(draft.wireframeName)}" data-wireframe-archetype="${template.archetypeId}" data-composition-grammar="${template.compositionId}" data-visual-grammar="${visualGrammar.id}" data-motion-profile="${visualGrammar.motionProfile}" data-hero-media-role="${visualGrammar.heroMediaRole}" data-proof-device="${visualGrammar.proofDevice}" data-cadence="${visualGrammar.cadence}" data-close-treatment="${visualGrammar.closeTreatment}"${input.wireframeSelection ? ` data-wireframe-reason="${escapeHtml(input.wireframeSelection.reasonCode)}" data-wireframe-locked="${input.wireframeSelection.locked}"` : ""} data-experience-shape="${escapeHtml(draft.experienceShape)}" data-template-family="${template.family}" data-template-fingerprint="${templateFingerprint}" data-shared-primitives="${SHARED_EXPERIENCE_PRIMITIVES.join(",")}" data-experience-register="${escapeHtml(draft.campaignRegister)}" data-layout-variant="${selectedVariant}" data-style-variant="${selectedStyle}" data-cta-style="${selectedCtaStyle}" data-hero-theme="${heroTheme}" data-personalization-variant="${escapeHtml(activePersonalizationId)}"${imageryTreatment ? ` data-imagery-treatment="${escapeHtml(imageryTreatment)}"` : ""} data-brand-source="${escapeHtml(brand.source)}" data-brand-palette-treatment="${neutralPreview ? "neutral-fallback" : "verified-or-legacy"}"${neutralPreview ? ` data-brand-warning="palette-confidence-low" data-brand-warning-copy="${escapeHtml(neutralPreviewNotice)}"` : ""}${designDna ? ` data-brand-design-source="${designDna.source}" data-brand-design-confidence="${designDna.confidence}" data-brand-design-fields="${escapeHtml(designDnaFields.join(","))}"` : ""}>
<button class="skip-link" type="button" data-scroll-target="main-content">Skip to experience</button>
<div class="shell">
  <header class="nav">
    <div class="brand-lockup">
      ${wordmark(brand, "seller-wordmark", heroTheme === "dark")}
      ${targetBrand ? `<span class="lockup-divider">for</span>${wordmark(targetBrand, "target-wordmark", heroTheme === "dark")}` : ""}
    </div>
    <button type="button" class="nav-action" data-scroll-target="next-step" data-flz-cta-id="header-next-step">${escapeHtml(framework?.nextStep.ctaLabel ?? draft.sectionLabels.close)}</button>
  </header>
  ${neutralPreview ? `<aside class="preview-brand-notice" data-brand-warning-copy role="note"><strong>Preview treatment:</strong> ${escapeHtml(neutralPreviewNotice)}</aside>` : ""}
  <nav class="journey-nav" aria-label="Experience journey" data-flz-journey-nav>
    <div class="journey-nav-inner">
      <span class="journey-nav-title" aria-hidden="true"><strong>${escapeHtml(template.heroLabel)}</strong><small>${escapeHtml(contextLabel)}</small></span>
      <div class="journey-links">${journeyNavButtons}</div>
      <button type="button" class="fullscreen-control" data-fullscreen-toggle aria-pressed="false" aria-label="Enter full screen" hidden>
        <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3.5 7V3.5H7M13 3.5h3.5V7M16.5 13v3.5H13M7 16.5H3.5V13"/></svg>
        <span data-fullscreen-label>Full screen</span>
      </button>
    </div>
  </nav>
  <main id="main-content" tabindex="-1">
    <section class="hero" id="experience-overview" data-journey-section="experience-overview" data-template-primitive="hero" ${framework ? evidenceAttribute(framework.opening.evidenceIds) : ""} aria-labelledby="experience-headline">
      <div class="hero-copy">
        <p class="eyebrow" ${editableBlock("hero.eyebrow", "eyebrow")}>${escapeHtml(framework?.opening.eyebrow ?? heroEyebrow)}</p>
        <h1 id="experience-headline" ${editableBlock("hero.headline", "headline")}>${escapeHtml(framework?.opening.headline ?? draft.headline)}</h1>
        <p class="subhead" ${editableBlock("hero.subhead", "subhead")}>${escapeHtml(framework?.opening.body ?? draft.subhead)}</p>
        <div class="actions">
          ${actionControl(primaryAction, "primary", editableBlock("hero.primaryCta", "cta"), framework?.opening.ctaLabel ?? draft.primaryCta)}
        </div>
        <span class="context-note" ${editableBlock("hero.audience", "audience")}>For ${escapeHtml(draft.audienceLabel)}</span>
      </div>
      ${framework
        ? frameworkHeroMedia || noAssetFigure(visualGrammar, "hero-media")
        : heroImage
          ? imageFigure(heroImage, `${brand.companyName} platform visual`, "hero-media", true, true, visualGrammar.heroMediaRole)
          : noAssetFigure(visualGrammar, "hero-media")}
    </section>
    ${pageFlow}
    ${closeMarkup}
    ${contentDialogs}
  </main>
  <footer class="footer"><span>${escapeHtml(contextLabel)}</span><a href="${escapeHtml(vendorUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(brand.domain)}</a></footer>
</div>
<script data-flz-runtime>
  (function(){
    var body=document.body;
    var marketoMunchkinId=${JSON.stringify(config.marketoMunchkinId ?? "")};
    if(marketoMunchkinId){try{var marketoScript=document.createElement('script');marketoScript.async=true;marketoScript.src='https://munchkin.marketo.net/munchkin.js';marketoScript.onload=function(){if(window.Munchkin)window.Munchkin.init(marketoMunchkinId)};document.head.appendChild(marketoScript)}catch(_marketoError){}}
    var reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var allowedEvents={anchor_click:true,cta_click:true,topic_select:true,signature_select:true,question_select:true,section_view:true,section_dwell:true,page_heartbeat:true,experience_view:true,fullscreen_change:true,editable_block_select:true};
    var durableEvents={anchor_click:true,cta_click:true,topic_select:true,signature_select:true,question_select:true,section_dwell:true,page_heartbeat:true,experience_view:true};
    var stringKeys={area:true,targetId:true,sectionId:true,ctaId:true,lensId:true,hrefHost:true,state:true,blockId:true,blockKind:true};
    var eventSequence=0;
    var parentOrigin='*';
    var experienceSessionId;
    try{if(document.referrer){var referrer=new URL(document.referrer);var isLocal=referrer.protocol==='http:'&&/^(localhost|127\\.0\\.0\\.1|\\[::1\\])$/.test(referrer.hostname);if(referrer.protocol==='https:'||isLocal)parentOrigin=referrer.origin}}catch(_originError){}
    try{var pathMatch=window.location.pathname.match(/^\\/e\\/([a-z0-9_-]{8,128})(?:\\/|$)/i);if(pathMatch)experienceSessionId=pathMatch[1]}catch(_pathError){}
    function safeToken(value){return typeof value==='string'&&/^[a-z0-9_.:-]{1,96}$/i.test(value)?value:undefined}
    function cleanPayload(data){
      var clean={register:safeToken(body.getAttribute('data-experience-register'))||'unknown',variant:safeToken(body.getAttribute('data-layout-variant'))||'standard',style:safeToken(body.getAttribute('data-style-variant'))||'standard'};
      if(!data||typeof data!=='object')return clean;
      Object.keys(stringKeys).forEach(function(key){var value=safeToken(data[key]);if(value)clean[key]=value});
      if(Number.isInteger(data.lensIndex)&&data.lensIndex>=0&&data.lensIndex<100)clean.lensIndex=data.lensIndex;
      if(Number.isInteger(data.seconds)&&data.seconds>=1&&data.seconds<=3600)clean.seconds=data.seconds;
      return clean;
    }
    function durableContext(payload){
      var context={};
      ['sectionId','area','ctaId','lensId'].forEach(function(key){var value=safeToken(payload[key]);if(value)context[key]=value});
      if(Number.isInteger(payload.seconds)&&payload.seconds>=1&&payload.seconds<=3600)context.seconds=payload.seconds;
      return context;
    }
    function makeEventId(){
      eventSequence+=1;
      var randomPart='';
      try{if(window.crypto&&typeof window.crypto.randomUUID==='function')randomPart=window.crypto.randomUUID().replace(/[^a-z0-9_-]/gi,'')}catch(_eventIdError){}
      if(!randomPart)randomPart=Date.now().toString(36)+Math.random().toString(36).slice(2,14);
      return ('evt_'+randomPart+'_'+eventSequence.toString(36)).slice(0,128)
    }
    function sendEvent(envelope,retriesRemaining){
      var request;
      function retry(){if(retriesRemaining>0)window.setTimeout(function(){sendEvent(envelope,retriesRemaining-1)},250)}
      try{request=window.fetch('/api/events',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',keepalive:true,body:JSON.stringify(envelope)})}catch(_eventSendError){retry();return}
      if(request&&request.then)request.then(function(response){if(response&&response.ok===false)retry()},retry)
    }
    function persistEvent(action,payload){
      if(!experienceSessionId||!durableEvents[action]||!window.fetch)return;
      var envelope={eventId:makeEventId(),sessionId:experienceSessionId,event:action,context:durableContext(payload)};
      sendEvent(envelope,1)
    }
    var recentSemanticEvents={};
    function semanticEventKey(action,payload){return [action,payload.ctaId,payload.lensId,payload.sectionId,payload.targetId,payload.area].filter(Boolean).join(':')}
    window.flzAnalytic=function(action,data){
      if(!allowedEvents[action])return;
      var payload=cleanPayload(data);
      if(action!=='page_heartbeat'&&action!=='section_dwell'){
        var semanticKey=semanticEventKey(action,payload);
        var now=Date.now();
        if(recentSemanticEvents[semanticKey]&&now-recentSemanticEvents[semanticKey]<1200)return;
        recentSemanticEvents[semanticKey]=now;
      }
      try{if(window.parent&&window.parent!==window)window.parent.postMessage({source:'folloze-experience',version:1,event:action,action:action,payload:payload,data:payload},parentOrigin)}catch(_messageError){}
      persistEvent(action,payload);
    };
    window.flzAnalytic('experience_view',{});
    ${personalizationRuntime ? `var personalizationPlan=${JSON.stringify(personalizationRuntime)};
    function applyPersonalizationVariant(variantId){
      if(!personalizationPlan||!personalizationPlan.variants)return false;
      var next=personalizationPlan.variants[variantId];
      if(!next)return false;
      Object.keys(next.fields||{}).forEach(function(blockId){
        var nodes=document.querySelectorAll('[data-flz-block-id="'+blockId+'"]');
        nodes.forEach(function(node){node.textContent=next.fields[blockId]});
      });
      body.setAttribute('data-personalization-variant',variantId);
      if(next.imageryTreatment){
        body.setAttribute('data-imagery-treatment',next.imageryTreatment);
        body.className=body.className.replace(/\\bimagery-[a-z-]+/g,'').trim()+' imagery-'+next.imageryTreatment;
      }
      try{if(window.parent&&window.parent!==window)window.parent.postMessage({source:'folloze-experience',version:1,event:'personalization_variant_applied',action:'personalization_variant_applied',payload:{variantId:variantId,hasEvidence:!!next.hasEvidence}},parentOrigin)}catch(_variantMessageError){}
      return true;
    }
    window.flzApplyPersonalizationVariant=applyPersonalizationVariant;
    try{
      var params=new URLSearchParams(window.location.search);
      var requestedVariant=params.get('variant');
      if(requestedVariant)applyPersonalizationVariant(requestedVariant);
      else applyPersonalizationVariant(personalizationPlan.defaultVariantId);
    }catch(_variantBootError){}
    window.addEventListener('message',function(event){
      if(parentOrigin!=='*'&&event.origin!==parentOrigin)return;
      var data=event.data;
      if(!data||data.source!=='folloze-builder'||data.type!=='set_personalization_variant')return;
      if(typeof data.variantId==='string')applyPersonalizationVariant(data.variantId);
    });` : ""}

    var previewScrollRoot=document.scrollingElement||document.documentElement;
    var boundaryWheelDelta=0;
    var boundaryWheelFrame=0;
    function flushPreviewWheel(){
      boundaryWheelFrame=0;
      var deltaY=Math.max(-1600,Math.min(1600,boundaryWheelDelta));
      boundaryWheelDelta=0;
      try{window.parent.postMessage({source:'folloze-experience',version:1,action:'preview_scroll_boundary',deltaY:deltaY},parentOrigin)}catch(_scrollBoundaryError){}
    }
    function handOffPreviewWheel(event){
      if(window.parent===window||event.ctrlKey||event.metaKey||typeof event.deltaY!=='number'||!Number.isFinite(event.deltaY)||event.deltaY===0)return;
      var maxScroll=Math.max(0,previewScrollRoot.scrollHeight-previewScrollRoot.clientHeight);
      var atStart=previewScrollRoot.scrollTop<=1;
      var atEnd=previewScrollRoot.scrollTop>=maxScroll-1;
      if(!((event.deltaY<0&&atStart)||(event.deltaY>0&&atEnd)))return;
      event.preventDefault();
      boundaryWheelDelta+=event.deltaY;
      if(!boundaryWheelFrame)boundaryWheelFrame=window.requestAnimationFrame(flushPreviewWheel);
    }
    window.addEventListener('wheel',handOffPreviewWheel,{passive:false});

    function settleImage(image,readyClass){
      var parent=image&&image.parentElement;
      if(!parent)return;
      function failed(){parent.classList.remove(readyClass);if(parent.hasAttribute('data-no-fallback'))parent.remove();else image.remove()}
      function loaded(){if(image.naturalWidth)parent.classList.add(readyClass);else failed()}
      image.addEventListener('load',loaded,{once:true});
      image.addEventListener('error',failed,{once:true});
      if(image.complete){if(image.naturalWidth)loaded();else failed()}
    }
    document.querySelectorAll('.wordmark img').forEach(function(image){settleImage(image,'has-image')});
    document.querySelectorAll('.media img').forEach(function(image){settleImage(image,'has-asset')});

    var journeyLinks=Array.from(document.querySelectorAll('[data-journey-link]'));
    function scrollInlineIntoView(node){
      var rail=node&&node.parentElement;
      if(!rail)return;
      var start=rail.scrollLeft;
      var visibleEnd=start+rail.clientWidth;
      var nodeStart=node.offsetLeft;
      var nodeEnd=nodeStart+node.offsetWidth;
      var next=start;
      if(nodeStart<start)next=Math.max(0,nodeStart-12);
      else if(nodeEnd>visibleEnd)next=Math.max(0,nodeEnd-rail.clientWidth+12);
      if(Math.abs(next-start)>1)rail.scrollTo({left:next,behavior:reducedMotion?'auto':'smooth'});
    }
    function setActiveSection(sectionId){
      journeyLinks.forEach(function(link){
        var active=link.getAttribute('data-journey-link')===sectionId;
        if(active)link.setAttribute('aria-current','location');else link.removeAttribute('aria-current');
        if(active)scrollInlineIntoView(link);
      });
    }
    document.querySelectorAll('[data-scroll-target]').forEach(function(control){
      control.addEventListener('click',function(){
        var target=this.getAttribute('data-scroll-target');
        var node=target&&document.getElementById(target);
        var area=this.closest('.journey-nav')?'journey-nav':this.closest('.nav')?'header':this.classList.contains('skip-link')?'skip-link':'hero';
        var actionEvent=this.getAttribute('data-action-event')||'anchor_click';
        window.flzAnalytic(actionEvent,{area:area,targetId:target,ctaId:this.getAttribute('data-flz-cta-id')||undefined});
        if(node){node.scrollIntoView({behavior:reducedMotion?'auto':'smooth',block:'start'});setActiveSection(target);if(this.classList.contains('skip-link'))node.focus({preventScroll:true})}
      });
    });

    document.querySelectorAll('a[target="_blank"]').forEach(function(link){
      link.addEventListener('click',function(){
        var area=this.closest('.close')?'close':this.closest('.footer')?'footer':'hero';
        var hrefHost;
        try{hrefHost=new URL(this.href).hostname}catch(_urlError){}
        window.flzAnalytic(this.getAttribute('data-action-event')||'cta_click',{area:area,ctaId:this.getAttribute('data-flz-cta-id')||'external-link',hrefHost:hrefHost});
      });
    });
    document.querySelectorAll('[data-content-dialog]').forEach(function(control){
      control.addEventListener('click',function(){
        var dialogId=this.getAttribute('data-content-dialog');
        var dialog=dialogId&&document.getElementById(dialogId);
        window.flzAnalytic(this.getAttribute('data-action-event')||'topic_select',{area:'resources',ctaId:this.getAttribute('data-flz-cta-id')||undefined});
        if(dialog&&typeof dialog.showModal==='function')dialog.showModal();
      });
    });

    var tabs=Array.from(document.querySelectorAll('[role="tab"]'));
    function selectLens(tab,focus,announce){
      var lensIndex=tabs.indexOf(tab);
      tabs.forEach(function(item){var selected=item===tab;item.setAttribute('aria-selected',String(selected));item.tabIndex=selected?0:-1;var panel=document.getElementById(item.getAttribute('aria-controls'));if(panel)panel.hidden=!selected});
      scrollInlineIntoView(tab);
      if(focus)tab.focus();
      if(announce)window.flzAnalytic('topic_select',{area:'decision-lenses',lensIndex:lensIndex,lensId:'lens-'+lensIndex})
    }
    tabs.forEach(function(tab,index){
      tab.addEventListener('click',function(){selectLens(tab,false,true)});
      tab.addEventListener('keydown',function(event){var next=index;if(event.key==='ArrowRight'||event.key==='ArrowDown')next=(index+1)%tabs.length;else if(event.key==='ArrowLeft'||event.key==='ArrowUp')next=(index-1+tabs.length)%tabs.length;else if(event.key==='Home')next=0;else if(event.key==='End')next=tabs.length-1;else return;event.preventDefault();selectLens(tabs[next],true,true)});
    });
    document.querySelectorAll('[data-signature-lens-index],[data-resource-lens-index]').forEach(function(control){
      control.addEventListener('click',function(){
        var attribute=this.hasAttribute('data-resource-lens-index')?'data-resource-lens-index':'data-signature-lens-index';
        var index=Number(this.getAttribute(attribute));
        var tab=tabs[index];
        var path=document.getElementById('decision-path');
        if(tab)selectLens(tab,false,false);
        window.flzAnalytic(attribute==='data-resource-lens-index'?'topic_select':'signature_select',{area:attribute==='data-resource-lens-index'?'resources':'signature',lensIndex:index,lensId:'lens-'+index,ctaId:this.getAttribute('data-flz-cta-id')||undefined});
        if(path){path.scrollIntoView({behavior:reducedMotion?'auto':'smooth',block:'start'});setActiveSection('decision-path')}
      });
    });

    document.querySelectorAll('[data-flz-editable]').forEach(function(block){
      block.addEventListener('click',function(){
        if(this.closest('button,a'))return;
        window.flzAnalytic('editable_block_select',{blockId:this.getAttribute('data-flz-block-id'),blockKind:this.getAttribute('data-flz-block-kind')});
      });
    });

    var viewedSections={};
    var journeySections=Array.from(document.querySelectorAll('[data-journey-section]'));
    function observeSection(section){
      var sectionId=section.getAttribute('data-journey-section');
      if(!sectionId)return;
      setActiveSection(sectionId);
      if(!viewedSections[sectionId]){viewedSections[sectionId]=true;window.flzAnalytic('section_view',{sectionId:sectionId})}
    }
    if('IntersectionObserver' in window){
      var sectionObserver=new IntersectionObserver(function(entries){var visible=entries.filter(function(entry){return entry.isIntersecting}).sort(function(a,b){return b.intersectionRatio-a.intersectionRatio})[0];if(visible)observeSection(visible.target)},{rootMargin:'-18% 0px -62% 0px',threshold:[0,.15,.5]});
      journeySections.forEach(function(section){sectionObserver.observe(section)});
    }else if(journeySections[0])observeSection(journeySections[0]);

    var engagementCleanup=function(){};
    try{
      var visibleStartedAt=document.visibilityState==='visible'?Date.now():0;
      var accumulatedVisibleMs=0;
      var reportedVisibleSeconds=0;
      var dwellStates={};
      function visibleMilliseconds(){return accumulatedVisibleMs+(visibleStartedAt?Date.now()-visibleStartedAt:0)}
      function heartbeat(){
        if(document.visibilityState!=='visible')return;
        var totalSeconds=Math.floor(visibleMilliseconds()/1000);
        var elapsedSeconds=totalSeconds-reportedVisibleSeconds;
        if(elapsedSeconds>=1){reportedVisibleSeconds=totalSeconds;window.flzAnalytic('page_heartbeat',{seconds:Math.min(elapsedSeconds,3600)})}
      }
      function dwellState(section){
        var id=section.getAttribute('data-journey-section');
        if(!id)return;
        if(!dwellStates[id])dwellStates[id]={sectionId:id,inside:false,startedAt:0,elapsedMs:0};
        return dwellStates[id];
      }
      function pauseDwell(state,emit){
        if(state.startedAt){state.elapsedMs+=Date.now()-state.startedAt;state.startedAt=0}
        var seconds=Math.floor(state.elapsedMs/1000);
        if(emit&&seconds>=3){window.flzAnalytic('section_dwell',{sectionId:state.sectionId,seconds:Math.min(seconds,3600)});state.elapsedMs=0}
      }
      function resumeDwell(state){if(state.inside&&document.visibilityState==='visible'&&!state.startedAt)state.startedAt=Date.now()}
      var dwellObserver;
      if('IntersectionObserver' in window){
        dwellObserver=new IntersectionObserver(function(entries){entries.forEach(function(entry){var state=dwellState(entry.target);if(!state)return;state.inside=entry.isIntersecting&&entry.intersectionRatio>=.35;if(state.inside)resumeDwell(state);else pauseDwell(state,true)})},{threshold:[0,.35,.7]});
        journeySections.forEach(function(section){dwellObserver.observe(section)});
      }
      function visibilityChanged(){
        if(document.visibilityState==='hidden'){
          if(visibleStartedAt){accumulatedVisibleMs+=Date.now()-visibleStartedAt;visibleStartedAt=0}
          Object.keys(dwellStates).forEach(function(id){pauseDwell(dwellStates[id],false)});
        }else{
          if(!visibleStartedAt)visibleStartedAt=Date.now();
          Object.keys(dwellStates).forEach(function(id){resumeDwell(dwellStates[id])});
        }
      }
      document.addEventListener('visibilitychange',visibilityChanged);
      var heartbeatTimer=window.setInterval(heartbeat,15000);
      engagementCleanup=function(){
        heartbeat();
        window.clearInterval(heartbeatTimer);
        document.removeEventListener('visibilitychange',visibilityChanged);
        if(dwellObserver)dwellObserver.disconnect();
        Object.keys(dwellStates).forEach(function(id){pauseDwell(dwellStates[id],true)});
      };
    }catch(_engagementTimerError){}

    var fullscreenControl=document.querySelector('[data-fullscreen-toggle]');
    function syncFullscreen(){
      if(!fullscreenControl)return;
      var active=Boolean(document.fullscreenElement);
      body.classList.toggle('is-fullscreen',active);
      fullscreenControl.setAttribute('aria-pressed',String(active));
      fullscreenControl.setAttribute('aria-label',active?'Exit full screen':'Enter full screen');
      var label=fullscreenControl.querySelector('[data-fullscreen-label]');
      if(label)label.textContent=active?'Exit full screen':'Full screen';
      window.flzAnalytic('fullscreen_change',{state:active?'entered':'exited'});
    }
    if(fullscreenControl&&document.documentElement.requestFullscreen&&document.exitFullscreen){
      fullscreenControl.hidden=false;
      fullscreenControl.addEventListener('click',function(){
        var request=document.fullscreenElement?document.exitFullscreen():document.documentElement.requestFullscreen();
        if(request&&request.catch)request.catch(function(){window.flzAnalytic('fullscreen_change',{state:'unavailable'})});
      });
      document.addEventListener('fullscreenchange',syncFullscreen);
      document.addEventListener('fullscreenerror',function(){window.flzAnalytic('fullscreen_change',{state:'unavailable'})});
    }
    window.addEventListener('pagehide',function(){if(boundaryWheelFrame)window.cancelAnimationFrame(boundaryWheelFrame);window.removeEventListener('wheel',handOffPreviewWheel);engagementCleanup()},{once:true});
  })();
</script>
</body>
</html>`;
}
