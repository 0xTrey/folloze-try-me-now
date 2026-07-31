import type { ExperienceDraft } from "@/lib/generation/experience-schema";
import type { BrandProfile, SessionAnswers, UseCase } from "@/lib/types";

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>'"]/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char] ?? char
  );

const safeColor = (value: string, fallback: string) =>
  /^#[0-9a-f]{6}$/i.test(value) ? value.toUpperCase() : fallback;

function safeAssetUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function safePublicLinkUrl(value: string | undefined): string | undefined {
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
        new URL(url).pathname
      )
  );
  const selected = evergreen.length ? evergreen : candidates;
  return selected
    .map((url, index) => {
      const pathname = new URL(url).pathname.toLowerCase();
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

function wordmark(profile: BrandProfile, className: string): string {
  const logo = safeAssetUrl(profile.logoUrl);
  return `<span class="wordmark ${className}">
    ${logo ? `<img src="${escapeHtml(logo)}" alt="${escapeHtml(profile.companyName)}" onload="if(this.naturalWidth){this.parentElement.classList.add('has-image')}" onerror="this.parentElement.classList.remove('has-image');this.remove()">` : ""}
    <span class="wordmark-fallback">${escapeHtml(profile.companyName)}</span>
  </span>`;
}

function imageFigure(url: string | undefined, alt: string, className: string, eager = false): string {
  const safeUrl = safeAssetUrl(url);
  const roleClass = safeUrl && /diagram|architecture|marketecture|workflow|chart/i.test(safeUrl) ? " is-diagram" : "";
  return `<figure class="media ${className}${roleClass}">
    <div class="media-fallback" aria-hidden="true"><span></span><span></span><span></span></div>
    ${safeUrl ? `<img src="${escapeHtml(safeUrl)}" alt="${escapeHtml(alt)}" ${eager ? 'loading="eager" fetchpriority="high"' : 'loading="lazy"'} onload="if(this.naturalWidth){this.parentElement.classList.add('has-asset')}" onerror="this.parentElement.classList.remove('has-asset');this.remove()">` : ""}
  </figure>`;
}

type RenderLayoutVariant = "standard" | "narrative" | "modular" | "immersive" | "compact";
type RenderStyleVariant = "standard" | "brand-led" | "editorial" | "technical" | "minimal";

interface ExperienceReceipt {
  title: string;
  detail: string;
  href?: string;
  score?: number;
  signals: string[];
}

function compactText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized ? normalized.slice(0, maxLength) : undefined;
}

function layoutVariant(answers: SessionAnswers): RenderLayoutVariant {
  const runtimeAnswers = answers as SessionAnswers & Record<string, unknown>;
  const requested = compactText(
    runtimeAnswers.layoutVariant ?? runtimeAnswers.visualVariant ?? runtimeAnswers.experienceVariant,
    32
  )?.toLowerCase();

  if (["narrative", "story", "reading"].includes(requested ?? "")) return "narrative";
  if (["modular", "cards", "grid"].includes(requested ?? "")) return "modular";
  if (["immersive", "cinematic", "visual"].includes(requested ?? "")) return "immersive";
  if (["compact", "executive", "dense"].includes(requested ?? "")) return "compact";
  return "standard";
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

function receiptFromInput(input: {
  answers: SessionAnswers;
  brand: BrandProfile;
  targetBrand?: BrandProfile;
  useCase: UseCase;
  sourceUrl?: string;
  qualityReceipt?: unknown;
}): ExperienceReceipt | undefined {
  const runtimeAnswers = input.answers as SessionAnswers & Record<string, unknown>;
  const rawReceipt = input.qualityReceipt ?? runtimeAnswers.qualityReceipt ?? runtimeAnswers.provenanceReceipt;

  if (rawReceipt && typeof rawReceipt === "object" && !Array.isArray(rawReceipt)) {
    const receipt = rawReceipt as Record<string, unknown>;
    const checks = Array.isArray(receipt.checks)
      ? receipt.checks
          .map((check) => {
            if (!check || typeof check !== "object" || Array.isArray(check)) return undefined;
            const candidate = check as Record<string, unknown>;
            const label = compactText(candidate.label, 56);
            const status = compactText(candidate.status, 32);
            return label && ["passed", "warning", "not-applicable"].includes(status ?? "")
              ? { label, status }
              : undefined;
          })
          .filter((check): check is { label: string; status: string } => Boolean(check))
      : [];
    if (checks.length) {
      const applicable = checks.filter((check) => check.status !== "not-applicable");
      const passed = applicable.filter((check) => check.status === "passed");
      const score = applicable.length ? Math.round((passed.length / applicable.length) * 100) : undefined;
      return {
        title: receipt.status === "passed" ? "Quality checks passed" : "Quality review available",
        detail: `${passed.length} of ${applicable.length} applicable experience checks passed.`,
        score,
        signals: checks.slice(0, 3).map((check) => check.label)
      };
    }
    const title = compactText(receipt.title ?? receipt.label, 96);
    const detail = compactText(receipt.detail ?? receipt.sourceName, 180);
    const href = safePublicLinkUrl(compactText(receipt.sourceUrl, 2048));
    const score =
      typeof receipt.score === "number" && Number.isFinite(receipt.score)
        ? Math.max(0, Math.min(100, Math.round(receipt.score)))
        : undefined;
    const signals = Array.isArray(receipt.signals)
      ? receipt.signals
          .map((signal) => compactText(signal, 56))
          .filter((signal): signal is string => Boolean(signal))
          .slice(0, 3)
      : [];

    if (title || detail || href || score !== undefined || signals.length) {
      return {
        title: title ?? "Experience quality receipt",
        detail: detail ?? "Grounded inputs and presentation signals are available for review.",
        href,
        score,
        signals
      };
    }
  }

  if (input.useCase === "content" && (input.sourceUrl || input.answers.sourceName)) {
    let sourceHost: string | undefined;
    try {
      sourceHost = input.sourceUrl ? new URL(input.sourceUrl).hostname.replace(/^www\./, "") : undefined;
    } catch {
      sourceHost = undefined;
    }
    return {
      title: "Built from the original",
      detail:
        compactText(input.answers.sourceName, 140) ??
        sourceHost ??
        "The supplied source material",
      href: input.sourceUrl,
      signals: ["Original linked", "Brand-matched presentation"]
    };
  }

  if (
    input.targetBrand &&
    input.brand.source !== "fallback" &&
    input.targetBrand.source !== "fallback"
  ) {
    return {
      title: "Account context applied",
      detail: `${input.brand.companyName} × ${input.targetBrand.companyName}`,
      signals: ["Seller brand profile", "Account brand profile"]
    };
  }

  return undefined;
}

function editableBlock(blockId: string, kind: string): string {
  return `data-flz-editable="true" data-flz-block-id="${escapeHtml(blockId)}" data-flz-block-kind="${escapeHtml(kind)}"`;
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
}): string {
  const { draft, brand, targetBrand } = input;
  const selectedVariant = layoutVariant(input.answers);
  const selectedStyle = styleVariant(input.answers);
  const candidatePrimary = safeColor(brand.primaryColor, "#1C293F");
  const primary = colorLuminance(candidatePrimary) < 0.42 ? candidatePrimary : "#1C293F";
  const accent = safeColor(brand.accentColor, "#5B5BFF");
  const surface = safeColor(brand.surfaceColor, "#FFFFFF");
  const onAccent = colorLuminance(accent) > 0.42 ? "#071428" : "#FFFFFF";
  const displayFontName = safeFontName(brand.displayFontFamily, "Brand Display");
  const bodyFontName = safeFontName(brand.bodyFontFamily, "Brand Sans");
  const displayFont = safeFontFamily(brand.displayFontFamily, 'ui-serif,Georgia,serif');
  const bodyFont = safeFontFamily(brand.bodyFontFamily, 'Inter,ui-sans-serif,system-ui,sans-serif');
  const images = experienceImages(brand.imageUrls);
  const heroImage = images[0];
  const supportingImages = images.filter((image) => image !== heroImage);
  const vendorUrl = safePublicLinkUrl(`https://${brand.domain}`) ?? "https://www.folloze.com";
  const sourceUrl =
    input.useCase === "content"
      ? safePublicLinkUrl(input.answers.sourceUrl)
      : draft.campaignRegister === "campaign-event"
        ? safePublicLinkUrl(input.answers.eventSource)
        : undefined;
  const sourceLinkLabel = input.useCase === "content" ? "Open original" : "View event source";
  const themeLink = input.themeUrl
    ? `<link rel="stylesheet" href="${escapeHtml(input.themeUrl)}">`
    : "";
  const contextLabel = targetBrand
    ? `${brand.companyName} for ${targetBrand.companyName}`
    : brand.companyName;
  const sectionIds: Record<ExperienceDraft["sectionSequence"][number], string> = {
    thesis: "campaign-thesis",
    "decision-lenses": "decision-path",
    "guided-questions": "guided-questions"
  };
  const firstSectionTarget = sectionIds[draft.sectionSequence[0]];
  const journeyLabels: Record<ExperienceDraft["sectionSequence"][number], string> = {
    thesis: "Why it matters",
    "decision-lenses": draft.campaignRegister === "content-magic" ? "Reading paths" : "Decision paths",
    "guided-questions": "Questions"
  };
  const journeyNavItems = [
    { id: "experience-overview", label: "Overview" },
    ...draft.sectionSequence.map((section) => ({ id: sectionIds[section], label: journeyLabels[section] })),
    { id: "next-step", label: "Next step" }
  ];
  const journeyNavButtons = journeyNavItems
    .map(
      (item, index) => `<button type="button" data-scroll-target="${escapeHtml(item.id)}" data-journey-link="${escapeHtml(item.id)}" ${index === 0 ? 'aria-current="location"' : ""}>
        <span aria-hidden="true"></span>${escapeHtml(item.label)}
      </button>`
    )
    .join("");
  const receipt = receiptFromInput({
    answers: input.answers,
    brand,
    targetBrand,
    useCase: input.useCase,
    sourceUrl,
    qualityReceipt: input.qualityReceipt
  });
  const receiptHtml = receipt
    ? `<aside class="quality-receipt" aria-label="Experience quality details" data-quality-receipt="true">
        <div class="receipt-mark" aria-hidden="true"><span>✓</span></div>
        <div class="receipt-copy">
          <p class="eyebrow">Experience receipt</p>
          <h2>${escapeHtml(receipt.title)}</h2>
          <p>${escapeHtml(receipt.detail)}</p>
        </div>
        <div class="receipt-signals" aria-label="Quality signals">
          ${receipt.score !== undefined ? `<span><strong>${receipt.score}</strong>/100 quality</span>` : ""}
          ${receipt.signals.map((signal) => `<span>${escapeHtml(signal)}</span>`).join("")}
          ${receipt.href ? `<a href="${escapeHtml(receipt.href)}" target="_blank" rel="noopener" data-flz-cta-id="receipt-source">Review original <span aria-hidden="true">↗</span></a>` : ""}
        </div>
      </aside>`
    : "";

  const lensButtons = draft.signalLabels
    .map(
      (label, index) => `<button type="button" role="tab" id="lens-tab-${index}" aria-controls="lens-panel-${index}" aria-selected="${index === 0}" tabindex="${index === 0 ? 0 : -1}" data-lens-index="${index}" ${editableBlock(`lens.${index}.label`, "tab-label")}>${escapeHtml(label)}</button>`
    )
    .join("");

  const lensPanels = draft.sections
    .map(
      (section, index) => `<section class="lens-panel" id="lens-panel-${index}" role="tabpanel" aria-labelledby="lens-tab-${index}" tabindex="0" ${index === 0 ? "" : "hidden"}>
        <div class="lens-number" aria-hidden="true">0${index + 1}</div>
        <div class="lens-copy"><p class="eyebrow" ${editableBlock(`lens.${index}.eyebrow`, "eyebrow")}>${escapeHtml(section.eyebrow)}</p><h2 ${editableBlock(`lens.${index}.headline`, "headline")}>${escapeHtml(section.headline)}</h2><p ${editableBlock(`lens.${index}.body`, "body")}>${escapeHtml(section.body)}</p></div>
        ${imageFigure(supportingImages[index] ?? supportingImages[0] ?? heroImage, `${brand.companyName}: ${section.eyebrow}`, "lens-media")}
      </section>`
    )
    .join("");

  const journeyCards = draft.sections
    .map(
      (section, index) => `<article class="journey-card">
        <div class="journey-index" aria-hidden="true">0${index + 1}</div>
        <div class="journey-copy"><p class="eyebrow" ${editableBlock(`question.${index}.eyebrow`, "eyebrow")}>${escapeHtml(section.eyebrow)}</p><h3 ${editableBlock(`question.${index}.prompt`, "question")}>${escapeHtml(section.proof)}</h3></div>
        <button type="button" class="journey-action" data-journey-lens-index="${index}" data-flz-cta-id="question-${index}">Explore this lens <span aria-hidden="true">→</span></button>
      </article>`
    )
    .join("");

  const regions: Record<ExperienceDraft["sectionSequence"][number], string> = {
    thesis: `<section class="thesis experience-region" id="campaign-thesis" data-journey-section="campaign-thesis" aria-labelledby="campaign-thesis-heading">
      <p class="eyebrow" ${editableBlock("thesis.label", "section-label")}>${escapeHtml(draft.sectionLabels.thesis)}</p>
      <h2 id="campaign-thesis-heading" ${editableBlock("thesis.headline", "headline")}>${escapeHtml(draft.thesisHeadline)}</h2>
      <p ${editableBlock("thesis.body", "body")}>${escapeHtml(draft.thesisBody)}</p>
    </section>`,
    "decision-lenses": `<section class="lens-lab experience-region" id="decision-path" data-journey-section="decision-path" aria-labelledby="decision-path-heading">
      <header class="region-heading"><h2 id="decision-path-heading" ${editableBlock("lenses.heading", "section-heading")}>${escapeHtml(draft.sectionLabels.lenses)}</h2></header>
      <div class="lens-tabs" role="tablist" aria-orientation="horizontal" aria-label="${escapeHtml(draft.sectionLabels.lenses)}">${lensButtons}</div>
      ${lensPanels}
    </section>`,
    "guided-questions": `<section class="journey experience-region" id="guided-questions" data-journey-section="guided-questions" aria-labelledby="guided-questions-heading">
      <header class="journey-header"><p class="eyebrow">Meeting-ready</p><h2 id="guided-questions-heading" ${editableBlock("questions.heading", "section-heading")}>${escapeHtml(draft.sectionLabels.journey)}</h2></header>
      <div class="journey-grid">${journeyCards}</div>
    </section>`
  };
  const experienceFlow = draft.sectionSequence.map((section) => regions[section]).join("");
  const signatureButtons = draft.sections
    .map(
      (section, index) => `<button type="button" data-signature-lens-index="${index}" data-flz-cta-id="signature-${index}">
        <span class="signature-index" aria-hidden="true">0${index + 1}</span>
        <span class="signature-item-copy"><strong ${editableBlock(`signature.${index}.label`, "eyebrow")}>${escapeHtml(section.eyebrow)}</strong><span ${editableBlock(`signature.${index}.copy`, "path-copy")}>${escapeHtml(
          draft.campaignRegister === "one-to-one-abm" ? section.proof : section.headline
        )}</span></span>
      </button>`
    )
    .join("");
  const signatureMoment =
    draft.campaignRegister === "one-to-one-abm"
      ? `<section class="signature signature-abm" aria-label="Account decision paths">
          <div class="signature-intro"><p class="eyebrow">Three decisions for ${escapeHtml(targetBrand?.companyName ?? draft.audienceLabel)}</p><h2>${escapeHtml(draft.narrativeArc)}</h2><p>${escapeHtml(brand.companyName)} × ${escapeHtml(targetBrand?.companyName ?? draft.audienceLabel)}</p></div>
          <div class="signature-items">${signatureButtons}</div>
        </section>`
      : draft.campaignRegister === "content-magic"
        ? `<section class="signature signature-content" aria-label="Content reading paths">
            <div class="signature-intro"><p class="eyebrow">Ways into the idea</p><h2>${escapeHtml(draft.title)}</h2><p>${escapeHtml(draft.narrativeArc)}</p></div>
            <nav class="signature-items" aria-label="Choose a reading path">${signatureButtons}</nav>
          </section>`
        : draft.campaignRegister === "campaign-event"
          ? `<section class="signature signature-event" aria-label="Event follow-up paths">
              <div class="signature-intro"><p class="eyebrow">Carry one question forward</p><h2>${escapeHtml(draft.narrativeArc)}</h2></div>
              <div class="signature-items">${signatureButtons}</div>
            </section>`
          : draft.campaignRegister === "campaign-product"
            ? `<section class="signature signature-product" aria-label="Product use-case paths">
                <div class="signature-intro"><p class="eyebrow">Three ways to start</p><h2>${escapeHtml(draft.narrativeArc)}</h2></div>
                <div class="signature-items">${signatureButtons}</div>
              </section>`
            : `<section class="signature signature-demand" aria-label="Campaign offer paths">
                <div class="signature-intro"><p class="eyebrow">Find your starting point</p><h2>${escapeHtml(draft.narrativeArc)}</h2><p>For ${escapeHtml(draft.audienceLabel)}</p></div>
                <div class="signature-items">${signatureButtons}</div>
              </section>`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="referrer" content="strict-origin-when-cross-origin">
  <title>${escapeHtml(draft.title)}</title>
  ${themeLink}
  <style>
    ${fontFace(displayFontName, brand.displayFontUrl, input.fontDeliveryUrls?.display, "400 800")}
    ${fontFace(bodyFontName, brand.bodyFontUrl, input.fontDeliveryUrls?.body, "300 800")}
    :root{color-scheme:light;--brand-ink:${primary};--brand-accent:${accent};--brand-surface:${surface};--brand-on-accent:${onAccent};--deep:#071428;--text:#20324b;--muted:#66778d;--line:#dce3e9;--soft:color-mix(in srgb,var(--brand-ink) 13%,#fff);--display:${displayFont};--body:${bodyFont}}
    *{box-sizing:border-box}[hidden]{display:none!important}html{scroll-behavior:smooth;overflow-x:clip;scroll-padding-top:70px}body{margin:0;background:var(--brand-surface);color:var(--brand-ink);font-family:var(--body);line-height:1.5;overflow-x:clip;overscroll-behavior-y:contain;-webkit-font-smoothing:antialiased}button,a{font:inherit;touch-action:manipulation}.hero-copy,.lens-copy,.journey-copy,.close>div,.region-heading{min-width:0}.shell{max-width:1600px;min-height:100dvh;margin:0 auto;background:var(--brand-surface);overflow:clip}.eyebrow{margin:0 0 18px;color:var(--brand-accent);font-size:12px;font-weight:800;letter-spacing:.14em;text-transform:uppercase}.skip-link{position:fixed;left:16px;top:12px;z-index:1000;padding:10px 14px;border-radius:6px;background:var(--brand-ink);color:#fff;text-decoration:none;transform:translateY(-180%);transition:transform .16s ease}.skip-link:focus{transform:translateY(0)}.nav{height:78px;padding:0 clamp(22px,6vw,96px);display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--line);background:var(--brand-surface)}.brand-lockup{display:flex;flex:0 0 auto;align-items:center;gap:16px}.lockup-divider{color:var(--muted);font-size:14px}.wordmark{display:inline-flex;flex:0 0 auto;align-items:center;max-width:172px;color:var(--brand-ink);font-weight:800;font-size:19px;white-space:nowrap}.wordmark img{display:block;width:auto;height:32px;max-width:172px;object-fit:contain;opacity:0}.wordmark.has-image img{opacity:1}.wordmark.has-image .wordmark-fallback{display:none}.target-wordmark{max-width:142px}.target-wordmark img{height:28px;max-width:142px}.nav-action{border:0;background:transparent;color:var(--brand-ink);min-height:44px;padding:0;cursor:pointer;font-weight:750}.nav-action:hover,.nav-action:focus-visible{color:var(--brand-accent)}
    .journey-nav{position:sticky;top:0;z-index:40;min-height:58px;border-bottom:1px solid color-mix(in srgb,var(--brand-ink) 14%,transparent);background:color-mix(in srgb,var(--brand-surface) 92%,transparent);box-shadow:0 12px 34px color-mix(in srgb,var(--brand-ink) 7%,transparent);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px)}.journey-nav-inner{min-height:58px;padding:0 clamp(22px,6vw,96px);display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:clamp(18px,3vw,42px)}.journey-nav-title{display:grid;min-width:124px;line-height:1.1}.journey-nav-title strong{font-size:11px;letter-spacing:.13em;text-transform:uppercase}.journey-nav-title small{max-width:170px;margin-top:4px;overflow:hidden;color:var(--muted);font-size:11px;text-overflow:ellipsis;white-space:nowrap}.journey-links{min-width:0;width:100%;display:flex;align-self:stretch;align-items:center;justify-content:center;gap:clamp(4px,1vw,14px);overflow-x:auto;overscroll-behavior-inline:contain;scrollbar-width:none}.journey-links::-webkit-scrollbar{display:none}.journey-links button{position:relative;display:inline-flex;flex:0 0 auto;align-items:center;gap:8px;min-height:44px;padding:0 9px;border:0;background:transparent;color:var(--muted);cursor:pointer;font-size:12px;font-weight:750;white-space:nowrap}.journey-links button>span{width:5px;height:5px;border-radius:50%;background:currentColor;opacity:.35;transition:opacity .18s ease,transform .18s ease}.journey-links button:after{content:"";position:absolute;left:9px;right:9px;bottom:0;height:2px;background:var(--brand-accent);transform:scaleX(0);transform-origin:center;transition:transform .18s ease}.journey-links button:hover,.journey-links button:focus-visible,.journey-links button[aria-current="location"]{color:var(--brand-ink)}.journey-links button[aria-current="location"]>span{background:var(--brand-accent);opacity:1;transform:scale(1.45)}.journey-links button[aria-current="location"]:after{transform:scaleX(1)}.fullscreen-control{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:40px;padding:7px 10px;border:1px solid var(--line);border-radius:999px;background:var(--brand-surface);color:var(--brand-ink);cursor:pointer;font-size:11px;font-weight:800;white-space:nowrap}.fullscreen-control svg{width:17px;height:17px;fill:none;stroke:currentColor;stroke-linecap:round;stroke-linejoin:round;stroke-width:1.6}.fullscreen-control:hover,.fullscreen-control:focus-visible,.fullscreen-control[aria-pressed="true"]{border-color:var(--brand-accent);color:var(--brand-accent)}
    .hero{position:relative;min-height:650px;padding:clamp(70px,8vw,128px) clamp(24px,7vw,112px);display:grid;grid-template-columns:minmax(0,1.04fr) minmax(360px,.76fr);gap:clamp(44px,7vw,108px);align-items:center;background:linear-gradient(132deg,var(--brand-surface) 0 58%,var(--soft) 58% 100%)}.hero-copy{position:relative;z-index:2}.hero h1{max-width:940px;margin:0;font-family:var(--display);font-size:clamp(46px,4.6vw,72px);font-weight:700;line-height:.98;letter-spacing:-.045em;text-wrap:balance;overflow-wrap:break-word}.hero .subhead{max-width:780px;margin:28px 0 34px;color:var(--text);font-size:clamp(18px,1.65vw,22px);line-height:1.5}.primary,.secondary{display:inline-flex;align-items:center;justify-content:center;min-height:52px;padding:13px 22px;border-radius:999px;text-decoration:none;font-weight:750;cursor:pointer;transition:transform .18s ease,background-color .18s ease,color .18s ease,border-color .18s ease}.primary{border:1px solid var(--brand-accent);background:var(--brand-accent);color:var(--brand-on-accent)}.primary:hover,.primary:focus-visible{transform:translateY(-2px)}.secondary{border:1px solid color-mix(in srgb,var(--brand-ink) 22%,transparent);background:transparent;color:var(--brand-ink)}.secondary:hover,.secondary:focus-visible{border-color:var(--brand-accent);color:var(--brand-accent)}.actions{display:flex;gap:12px;flex-wrap:wrap}.hero-media{width:100%;max-width:100%;height:clamp(380px,42vw,560px);min-height:0;align-self:center;border:1px solid color-mix(in srgb,var(--brand-ink) 12%,transparent);box-shadow:0 28px 80px color-mix(in srgb,var(--brand-ink) 16%,transparent)}.media{position:relative;margin:0;overflow:hidden;background:var(--soft)}.media img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:center;opacity:0;transition:opacity .2s ease}.hero-media img,.media.is-diagram img{object-fit:contain}.media.has-asset img{opacity:1}.media-fallback{position:absolute;inset:0;display:grid;place-items:center;isolation:isolate}.media-fallback:before,.media-fallback:after,.media-fallback span{content:"";position:absolute;border:1px solid color-mix(in srgb,var(--brand-accent) 42%,transparent);border-radius:50%}.media-fallback:before{width:70%;aspect-ratio:1}.media-fallback:after{width:48%;aspect-ratio:1}.media-fallback span:nth-child(1){width:16px;height:16px;background:var(--brand-accent)}.media-fallback span:nth-child(2){width:42%;height:1px;border:0;border-top:1px solid var(--brand-accent);transform:rotate(30deg)}.media-fallback span:nth-child(3){width:42%;height:1px;border:0;border-top:1px solid var(--brand-accent);transform:rotate(-30deg)}.media.has-asset .media-fallback{opacity:0}.context-note{display:inline-flex;align-items:center;gap:9px;margin-top:24px;padding:9px 13px;border:1px solid var(--line);border-radius:999px;color:var(--muted);font-size:13px}.context-note:before{content:"";width:8px;height:8px;border-radius:50%;background:var(--brand-accent)}
    .signature{padding:clamp(58px,7vw,104px) clamp(24px,7vw,112px)}.signature-intro h2{max-width:1060px;margin:0;font-family:var(--display);font-size:clamp(38px,4.4vw,66px);line-height:1.03;letter-spacing:-.035em}.signature-intro>p:last-child{margin:22px 0 0;color:var(--muted);font-weight:700}.signature-items button{appearance:none;width:100%;border:0;text-align:left;color:inherit;font:inherit;cursor:pointer}.signature-index{font:800 13px/1 var(--body);letter-spacing:.12em}.signature-item-copy{display:grid;gap:8px}.signature-item-copy strong{font-size:13px;letter-spacing:.1em;text-transform:uppercase}.signature-item-copy>span{font-family:var(--display);font-size:clamp(18px,1.7vw,25px);line-height:1.18}.signature-abm{display:grid;grid-template-columns:minmax(300px,.82fr) minmax(420px,1.08fr);gap:clamp(44px,7vw,110px);background:var(--soft);border-top:1px solid var(--line);border-bottom:1px solid var(--line)}.signature-abm .signature-items{display:grid;border-top:1px solid color-mix(in srgb,var(--brand-ink) 20%,transparent)}.signature-abm button{display:grid;grid-template-columns:52px 1fr;gap:18px;padding:24px 0;background:transparent;border-bottom:1px solid color-mix(in srgb,var(--brand-ink) 20%,transparent)}.signature-abm button:hover,.signature-abm button:focus-visible{color:var(--brand-accent);padding-left:10px}.signature-product{background:var(--brand-accent);color:var(--brand-on-accent)}.signature-product .eyebrow{color:inherit;opacity:.72}.signature-product .signature-items{display:grid;grid-template-columns:repeat(3,1fr);margin-top:54px;border-top:1px solid color-mix(in srgb,currentColor 34%,transparent)}.signature-product button{position:relative;display:grid;gap:34px;min-height:220px;padding:26px 30px;background:transparent;border-right:1px solid color-mix(in srgb,currentColor 34%,transparent)}.signature-product button:last-child{border-right:0}.signature-product button:after{content:"";position:absolute;right:28px;bottom:26px;width:12px;height:12px;border-top:2px solid currentColor;border-right:2px solid currentColor;transform:rotate(45deg)}.signature-product button:hover,.signature-product button:focus-visible{background:color-mix(in srgb,var(--brand-surface) 14%,transparent)}.signature-event{position:relative;overflow:hidden;text-align:center;background:var(--brand-ink);color:#fff}.signature-event:before{content:"";position:absolute;inset:-80% 58% -80% -15%;border:1px solid color-mix(in srgb,var(--brand-accent) 55%,transparent);border-radius:50%}.signature-event .signature-intro{position:relative;max-width:980px;margin:0 auto}.signature-event .eyebrow{color:var(--brand-accent)}.signature-event .signature-items{position:relative;display:flex;justify-content:center;gap:12px;margin-top:48px}.signature-event button{max-width:310px;padding:24px;background:color-mix(in srgb,#fff 8%,transparent);border:1px solid color-mix(in srgb,#fff 22%,transparent);text-align:center}.signature-event button:hover,.signature-event button:focus-visible{background:var(--brand-accent);color:var(--brand-on-accent)}.signature-event .signature-index{display:block;margin-bottom:16px}.signature-content{display:grid;grid-template-columns:minmax(300px,.7fr) minmax(440px,1.05fr);gap:clamp(48px,9vw,138px);align-items:start;background:var(--brand-surface);border-top:1px solid var(--line);border-bottom:1px solid var(--line)}.signature-content .signature-intro{position:sticky;top:24px}.signature-content .signature-items{display:grid;border-top:1px solid var(--brand-ink)}.signature-content button{display:grid;grid-template-columns:54px 1fr;gap:18px;padding:28px 0;background:transparent;border-bottom:1px solid var(--line)}.signature-content button:hover,.signature-content button:focus-visible{color:var(--brand-accent)}.signature-content .signature-index{padding-top:5px}.signature-demand{background:var(--brand-surface)}.signature-demand .signature-intro{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:22px;align-items:end}.signature-demand .signature-intro .eyebrow{grid-column:1/-1}.signature-demand .signature-items{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:48px}.signature-demand button{display:grid;gap:44px;min-height:230px;padding:26px;background:var(--soft);border:1px solid var(--line)}.signature-demand button:hover,.signature-demand button:focus-visible{transform:translateY(-5px);border-color:var(--brand-accent)}
    .thesis{padding:clamp(72px,8vw,126px) clamp(24px,7vw,112px);background:var(--brand-ink);color:#fff}.thesis h2{max-width:1120px;margin:0;font-family:var(--display);font-size:clamp(42px,5.4vw,78px);font-weight:700;line-height:1.02;letter-spacing:-.04em;overflow-wrap:anywhere}.thesis p{max-width:760px;margin:26px 0 0;color:color-mix(in srgb,#fff 74%,var(--brand-ink));font-size:19px;line-height:1.55}
    .lens-lab{padding:clamp(70px,8vw,118px) clamp(24px,7vw,112px) clamp(76px,8vw,126px);background:var(--soft)}.region-heading{max-width:1060px;margin:0 0 50px}.region-heading h2{margin:0;font-family:var(--display);font-size:clamp(40px,4.8vw,70px);line-height:1.03;letter-spacing:-.04em}.lens-tabs{display:flex;gap:8px;padding:0 0 28px;overflow-x:auto;scrollbar-width:thin}.lens-tabs button{flex:0 0 auto;min-height:46px;padding:10px 16px;border:1px solid color-mix(in srgb,var(--brand-ink) 28%,transparent);background:transparent;color:var(--brand-ink);font-weight:750;cursor:pointer}.lens-tabs button[aria-selected="true"]{border-color:var(--brand-ink);background:var(--brand-ink);color:#fff}.lens-tabs button:focus-visible{outline:3px solid color-mix(in srgb,var(--brand-accent) 45%,transparent);outline-offset:3px}.lens-panel{display:grid;grid-template-columns:120px minmax(0,.94fr) minmax(320px,.78fr);gap:clamp(34px,5vw,76px);align-items:center;min-height:520px}.lens-panel[hidden]{display:none}.lens-number{align-self:start;padding-top:10px;color:color-mix(in srgb,var(--brand-ink) 18%,transparent);font:700 clamp(82px,10vw,150px)/.82 var(--display)}.lens-copy h2{margin:0;font-family:var(--display);font-size:clamp(38px,4.5vw,66px);line-height:1.04;letter-spacing:-.035em}.lens-copy>p:not(.eyebrow){max-width:650px;margin:24px 0;color:var(--text);font-size:19px}.lens-media{min-height:390px;background:var(--brand-surface)}
    .journey{padding:clamp(68px,7vw,104px) clamp(24px,7vw,112px);background:var(--brand-surface)}.journey-header{max-width:980px;margin-bottom:44px}.journey-header h2{margin:0;font-family:var(--display);font-size:clamp(42px,5vw,68px);line-height:1.03;letter-spacing:-.04em}.journey-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.journey-card{min-height:330px;padding:28px;display:flex;flex-direction:column;border:1px solid var(--line);background:var(--soft);transition:transform .18s ease,border-color .18s ease,box-shadow .18s ease}.journey-card:hover{transform:translateY(-5px);border-color:var(--brand-accent);box-shadow:0 22px 56px color-mix(in srgb,var(--brand-ink) 12%,transparent)}.journey-index{color:var(--brand-accent);font:800 14px/1 var(--body);letter-spacing:.13em}.journey-copy{margin-top:46px}.journey-copy .eyebrow{margin-bottom:12px}.journey-copy h3{margin:0;font-family:var(--display);font-size:clamp(25px,2.2vw,34px);line-height:1.08;letter-spacing:-.025em}.journey-action{min-height:44px;margin-top:auto;padding:20px 0 0;display:flex;align-items:center;justify-content:space-between;border:0;border-top:1px solid color-mix(in srgb,var(--brand-ink) 16%,transparent);background:transparent;color:var(--brand-ink);font-weight:750;cursor:pointer}.journey-action:hover,.journey-action:focus-visible{color:var(--brand-accent)}
    .close{margin:0 clamp(14px,3vw,46px) clamp(14px,3vw,46px);padding:clamp(66px,8vw,116px);display:grid;grid-template-columns:minmax(0,1fr) auto;gap:54px;align-items:end;background:radial-gradient(circle at 90% 10%,color-mix(in srgb,var(--brand-accent) 58%,transparent),transparent 30%),var(--brand-ink);color:#fff}.close h2{max-width:980px;margin:0;font-family:var(--display);font-size:clamp(42px,5.2vw,76px);line-height:1.01;letter-spacing:-.04em}.close p{max-width:720px;margin:24px 0 0;color:color-mix(in srgb,#fff 76%,var(--brand-ink));font-size:18px}.close .primary{white-space:nowrap;background:#fff;border-color:#fff;color:var(--brand-ink)}.quality-receipt{margin:0 clamp(24px,6vw,96px);padding:26px 0;display:grid;grid-template-columns:auto minmax(220px,1fr) minmax(280px,auto);gap:22px;align-items:center;border-top:1px solid var(--line);border-bottom:1px solid var(--line)}.receipt-mark{width:44px;height:44px;display:grid;place-items:center;border:1px solid color-mix(in srgb,var(--brand-accent) 42%,transparent);border-radius:50%;background:color-mix(in srgb,var(--brand-accent) 9%,var(--brand-surface));color:var(--brand-accent);font-weight:900}.receipt-copy .eyebrow{margin:0 0 4px;font-size:10px}.receipt-copy h2{margin:0;font-family:var(--display);font-size:19px;letter-spacing:-.01em}.receipt-copy>p:last-child{margin:3px 0 0;color:var(--muted);font-size:13px}.receipt-signals{display:flex;align-items:center;justify-content:flex-end;gap:8px;flex-wrap:wrap}.receipt-signals>span,.receipt-signals>a{display:inline-flex;align-items:center;min-height:34px;padding:6px 10px;border:1px solid var(--line);border-radius:999px;color:var(--muted);font-size:11px;font-weight:750;text-decoration:none;white-space:nowrap}.receipt-signals strong{color:var(--brand-ink);font-size:13px}.receipt-signals>a{color:var(--brand-ink)}.receipt-signals>a:hover,.receipt-signals>a:focus-visible{border-color:var(--brand-accent);color:var(--brand-accent)}.footer{padding:26px clamp(24px,6vw,96px);display:flex;justify-content:space-between;gap:24px;color:var(--muted);font-size:12px}.footer a{color:inherit;text-decoration:none}.footer a:hover,.footer a:focus-visible{color:var(--brand-accent)}.experience-region,.close,#next-step,.hero{scroll-margin-top:70px}
    .signal-toast{position:fixed;left:50%;bottom:max(24px,env(safe-area-inset-bottom));z-index:90;width:min(calc(100vw - 32px),430px);padding:14px 17px;display:grid;grid-template-columns:auto 1fr;gap:12px;align-items:center;border:1px solid color-mix(in srgb,var(--brand-accent) 36%,var(--line));border-radius:14px;background:color-mix(in srgb,var(--brand-ink) 94%,#000);box-shadow:0 22px 80px color-mix(in srgb,var(--brand-ink) 30%,transparent);color:#fff;transform:translate(-50%,18px);opacity:0;pointer-events:none;transition:opacity .22s ease,transform .22s ease}.signal-toast.is-visible{transform:translate(-50%,0);opacity:1}.signal-toast-mark{width:32px;height:32px;display:grid;place-items:center;border-radius:50%;background:color-mix(in srgb,var(--brand-accent) 22%,transparent)}.signal-toast-mark>span{width:9px;height:9px;border-radius:50%;background:var(--brand-accent);box-shadow:0 0 0 7px color-mix(in srgb,var(--brand-accent) 18%,transparent)}.signal-toast>span:last-child{display:grid;gap:2px}.signal-toast strong{font-size:12px;letter-spacing:.08em;text-transform:uppercase}.signal-toast [data-signal-copy]{color:color-mix(in srgb,#fff 74%,transparent);font-size:12px}
    html:fullscreen,html:fullscreen body,html:fullscreen .shell{width:100%;max-width:none;min-height:100%;background:var(--brand-surface)}body.is-fullscreen .shell{max-width:none}body.is-fullscreen .journey-nav{padding-left:env(safe-area-inset-left);padding-right:env(safe-area-inset-right)}body.is-fullscreen .hero{min-height:calc(100dvh - 58px)}
    body.variant-immersive .hero{min-height:calc(100dvh - 58px);grid-template-columns:minmax(0,.8fr) minmax(460px,1.2fr)}body.variant-immersive .hero-media{height:min(68dvh,720px);border-radius:clamp(18px,3vw,42px)}body.variant-immersive .signature{padding-top:clamp(86px,10vw,150px);padding-bottom:clamp(86px,10vw,150px)}body.variant-narrative .shell{max-width:1460px}body.variant-narrative .hero{grid-template-columns:minmax(0,.82fr) minmax(380px,.72fr)}body.variant-narrative .hero h1{max-width:820px}body.variant-narrative .thesis p{max-width:900px}body.variant-modular .hero{min-height:590px}body.variant-modular .signature .signature-items{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;border:0}body.variant-modular .signature .signature-items button{min-height:190px;padding:24px;display:grid;grid-template-columns:1fr;align-content:space-between;gap:30px;border:1px solid color-mix(in srgb,currentColor 24%,var(--line));background:color-mix(in srgb,var(--brand-surface) 8%,transparent)}body.variant-modular .journey-card{border-radius:18px}body.variant-compact .hero{min-height:540px;padding-top:64px;padding-bottom:64px}body.variant-compact .hero-media{height:390px}body.variant-compact .signature,body.variant-compact .thesis,body.variant-compact .lens-lab,body.variant-compact .journey{padding-top:64px;padding-bottom:64px}body.variant-compact .lens-panel{min-height:430px}body.variant-compact .journey-card{min-height:270px}
    body.style-editorial .hero h1,body.style-editorial .signature-intro h2,body.style-editorial .thesis h2,body.style-editorial .region-heading h2,body.style-editorial .journey-header h2{letter-spacing:-.025em}body.style-editorial .eyebrow{letter-spacing:.18em}body.style-technical .primary,body.style-technical .secondary,body.style-technical .fullscreen-control,body.style-technical .receipt-signals>span,body.style-technical .receipt-signals>a{border-radius:4px}body.style-technical .hero{background-image:linear-gradient(color-mix(in srgb,var(--brand-ink) 5%,transparent) 1px,transparent 1px),linear-gradient(90deg,color-mix(in srgb,var(--brand-ink) 5%,transparent) 1px,transparent 1px);background-size:42px 42px}body.style-minimal .hero{background:var(--brand-surface)}body.style-minimal .hero-media{box-shadow:none}body.style-minimal .signature,body.style-minimal .lens-lab,body.style-minimal .journey{background:var(--brand-surface)}body.style-minimal .journey-card{background:transparent}
    body[data-edit-mode="true"] [data-flz-editable]{cursor:text;outline:1px dashed color-mix(in srgb,var(--brand-accent) 62%,transparent);outline-offset:5px}
    body.register-campaign-demand .hero{background:var(--brand-ink);color:#fff}body.register-campaign-demand .hero .subhead{color:color-mix(in srgb,#fff 78%,var(--brand-ink))}body.register-campaign-demand .hero .eyebrow{color:color-mix(in srgb,var(--brand-accent) 84%,#fff)}body.register-campaign-demand .hero .context-note{border-color:color-mix(in srgb,#fff 28%,transparent);color:color-mix(in srgb,#fff 72%,transparent)}body.register-campaign-demand .hero-media{border-color:color-mix(in srgb,#fff 18%,transparent);box-shadow:0 34px 100px color-mix(in srgb,#000 42%,transparent)}
    body.register-campaign-product .hero{grid-template-columns:minmax(360px,.78fr) minmax(0,1.04fr);background:linear-gradient(150deg,var(--soft),var(--brand-surface) 64%)}body.register-campaign-product .hero-media{order:-1;height:clamp(430px,46vw,620px)}
    body.register-campaign-event .hero{grid-template-columns:1fr;text-align:center;padding-bottom:0}body.register-campaign-event .hero-copy{max-width:1120px;margin:0 auto}body.register-campaign-event .hero h1,body.register-campaign-event .hero .subhead{margin-left:auto;margin-right:auto}body.register-campaign-event .actions{justify-content:center}body.register-campaign-event .context-note{justify-content:center}body.register-campaign-event .hero-media{height:clamp(260px,32vw,430px);margin-top:18px;border-bottom:0}
    body.register-content-magic .hero{grid-template-columns:1fr;padding-bottom:0;background:var(--brand-surface)}body.register-content-magic .hero-copy{max-width:1220px}body.register-content-magic .hero h1{max-width:1180px;font-size:clamp(52px,6.5vw,98px);line-height:.94}body.register-content-magic .hero .subhead{max-width:880px}body.register-content-magic .hero-media{height:clamp(360px,48vw,680px);margin-top:28px;border-bottom:0}body.register-content-magic .lens-lab{background:var(--brand-surface);border-top:1px solid var(--line);border-bottom:1px solid var(--line)}body.register-content-magic .journey{background:var(--soft)}
    body.register-one-to-one-abm .thesis h2{max-width:1240px}body.register-one-to-one-abm .lens-tabs button{border-radius:0}body.design-source-brand-technical .primary,body.design-source-brand-technical .secondary,body.design-source-brand-technical .lens-tabs button{border-radius:6px}body.design-source-brand-editorial .hero h1,body.design-source-brand-editorial .thesis h2,body.design-source-brand-editorial .region-heading h2{letter-spacing:-.028em}body.design-neutral-fallback .hero-media{box-shadow:none}
    button:focus-visible,a:focus-visible{outline:3px solid color-mix(in srgb,var(--brand-accent) 45%,transparent);outline-offset:4px}
    @media(max-width:980px){.hero,body.register-campaign-product .hero{grid-template-columns:1fr;min-height:auto}.hero-media,body.register-campaign-product .hero-media{height:clamp(380px,58vw,540px);order:initial}.signature-abm,.signature-content{grid-template-columns:1fr}.signature-content .signature-intro{position:static}.signature-product .signature-items,.signature-demand .signature-items{grid-template-columns:1fr}.signature-product button{min-height:160px;border-right:0;border-bottom:1px solid color-mix(in srgb,currentColor 34%,transparent)}.signature-event .signature-items{display:grid;grid-template-columns:1fr}.signature-event button{max-width:none}.lens-panel{grid-template-columns:90px 1fr}.lens-media{grid-column:2}.journey-grid{grid-template-columns:1fr}.journey-card{min-height:230px}.journey-copy{margin-top:30px}.close{grid-template-columns:1fr;align-items:start}}
    @media(max-width:620px){.nav{height:68px;padding:0 20px}.brand-lockup{gap:10px}.seller-wordmark{max-width:116px}.seller-wordmark img{height:27px;max-width:116px}.target-wordmark,.lockup-divider{display:none}.nav-action{font-size:13px}.hero{padding:50px 22px 42px;background:var(--brand-surface)}.hero h1{font-size:clamp(38px,10.5vw,46px);line-height:1.02}.hero .subhead{font-size:17px}.actions{align-items:stretch;flex-direction:column}.actions>*{width:100%}.hero-media{height:auto;min-height:280px;margin-top:12px;box-shadow:0 18px 48px color-mix(in srgb,var(--brand-ink) 14%,transparent)}.context-note{border-radius:14px;align-items:flex-start}.signature{padding:54px 22px}.signature-intro h2{font-size:36px}.signature-abm button,.signature-content button{grid-template-columns:40px 1fr}.signature-demand .signature-intro{grid-template-columns:1fr}.signature-demand .signature-intro .eyebrow{grid-column:auto}.thesis{padding:58px 22px}.thesis h2{font-size:clamp(34px,9.6vw,46px)}.thesis p{font-size:17px}.lens-lab{padding:54px 22px 64px}.lens-tabs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;overflow:visible}.lens-tabs button{min-width:0;padding:9px 7px;white-space:normal;font-size:12px;line-height:1.2}.lens-panel{grid-template-columns:1fr;min-height:0;gap:28px}.lens-number{font-size:68px}.lens-media{grid-column:1;min-height:270px}.lens-copy h2{font-size:37px}.lens-copy>p:not(.eyebrow){font-size:17px}.journey{padding:58px 22px}.journey-header{margin-bottom:34px}.journey-card{min-height:260px;padding:24px}.journey-copy h3{font-size:28px}.close{margin:0 10px 10px;padding:56px 24px;gap:32px}.close h2{font-size:40px}.close .primary{width:100%}.footer{padding:26px 22px;flex-direction:column;gap:8px}}
    @media(max-width:980px){body.variant-immersive .hero,body.variant-narrative .hero{grid-template-columns:1fr;min-height:auto}body.variant-modular .signature .signature-items{grid-template-columns:1fr}.journey-nav-inner{grid-template-columns:minmax(0,1fr) auto;gap:12px}.journey-nav-title{display:none}.journey-links{justify-content:flex-start}.quality-receipt{grid-template-columns:auto 1fr}.receipt-signals{grid-column:2;justify-content:flex-start}}
    @media(max-width:620px){html{scroll-padding-top:58px}.journey-nav,.journey-nav-inner{min-height:54px}.journey-nav-inner{padding-left:max(12px,env(safe-area-inset-left));padding-right:max(12px,env(safe-area-inset-right))}.journey-links{gap:2px;scroll-snap-type:x proximity}.journey-links button{min-height:50px;padding:0 8px;scroll-snap-align:start;font-size:11px}.journey-links button:after{left:8px;right:8px}.fullscreen-control{width:40px;height:40px;padding:0}.fullscreen-control [data-fullscreen-label]{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}.quality-receipt{margin:0 22px;padding:24px 0;grid-template-columns:auto 1fr;gap:14px}.receipt-signals{grid-column:1/-1;justify-content:flex-start}.receipt-signals>span,.receipt-signals>a{white-space:normal}.signal-toast{bottom:max(14px,env(safe-area-inset-bottom));border-radius:12px}body.variant-immersive .hero-media{height:auto;min-height:300px;border-radius:18px}body.variant-compact .hero{min-height:auto}body.is-fullscreen .nav{display:none}body.is-fullscreen .hero{min-height:auto}.experience-region,.close,#next-step,.hero{scroll-margin-top:62px}}
    @media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}.skip-link,.primary,.secondary,.journey-links button>span,.journey-links button:after,.journey-card,.media img,.signal-toast{transition:none!important;animation:none!important}.signal-toast{transform:translate(-50%,0)}.journey-links{scroll-behavior:auto}}
    @media(forced-colors:active){.journey-links button[aria-current="location"]{outline:2px solid currentColor}.signal-toast,.receipt-mark{border:2px solid currentColor}.signal-toast-mark>span{box-shadow:none}}
  </style>
</head>
<body class="register-${escapeHtml(draft.campaignRegister)} design-${escapeHtml(draft.designRegister)} variant-${selectedVariant} style-${selectedStyle}" data-wireframe="${escapeHtml(draft.wireframeName)}" data-experience-shape="${escapeHtml(draft.experienceShape)}" data-experience-register="${escapeHtml(draft.campaignRegister)}" data-layout-variant="${selectedVariant}" data-style-variant="${selectedStyle}">
<button class="skip-link" type="button" data-scroll-target="main-content">Skip to experience</button>
<div class="shell">
  <header class="nav">
    <div class="brand-lockup">
      ${wordmark(brand, "seller-wordmark")}
      ${targetBrand ? `<span class="lockup-divider">for</span>${wordmark(targetBrand, "target-wordmark")}` : ""}
    </div>
    <button type="button" class="nav-action" data-scroll-target="next-step" data-flz-cta-id="header-next-step">${escapeHtml(draft.sectionLabels.close)}</button>
  </header>
  <nav class="journey-nav" aria-label="Experience journey" data-flz-journey-nav>
    <div class="journey-nav-inner">
      <span class="journey-nav-title" aria-hidden="true"><strong>Explore</strong><small>${escapeHtml(contextLabel)}</small></span>
      <div class="journey-links">${journeyNavButtons}</div>
      <button type="button" class="fullscreen-control" data-fullscreen-toggle aria-pressed="false" aria-label="Enter full screen" hidden>
        <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3.5 7V3.5H7M13 3.5h3.5V7M16.5 13v3.5H13M7 16.5H3.5V13"/></svg>
        <span data-fullscreen-label>Full screen</span>
      </button>
    </div>
  </nav>
  <main id="main-content" tabindex="-1">
    <section class="hero" id="experience-overview" data-journey-section="experience-overview" aria-labelledby="experience-headline">
      <div class="hero-copy">
        <p class="eyebrow" ${editableBlock("hero.eyebrow", "eyebrow")}>${escapeHtml(draft.eyebrow)}</p>
        <h1 id="experience-headline" ${editableBlock("hero.headline", "headline")}>${escapeHtml(draft.headline)}</h1>
        <p class="subhead" ${editableBlock("hero.subhead", "subhead")}>${escapeHtml(draft.subhead)}</p>
        <div class="actions">
          <button type="button" class="primary" data-scroll-target="${escapeHtml(firstSectionTarget)}" data-flz-cta-id="hero-primary" ${editableBlock("hero.primaryCta", "cta")}>${escapeHtml(draft.primaryCta)}</button>
          ${sourceUrl ? `<a class="secondary" href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener" data-flz-cta-id="hero-source">${sourceLinkLabel}</a>` : ""}
        </div>
        <span class="context-note" ${editableBlock("hero.audience", "audience")}>For ${escapeHtml(draft.audienceLabel)}</span>
      </div>
      ${imageFigure(heroImage, `${brand.companyName} platform visual`, "hero-media", true)}
    </section>
    ${signatureMoment}
    ${experienceFlow}
    <section class="close" id="next-step" data-journey-section="next-step" aria-labelledby="next-step-heading">
      <div><p class="eyebrow" ${editableBlock("close.label", "section-label")}>${escapeHtml(draft.sectionLabels.close)}</p><h2 id="next-step-heading" ${editableBlock("close.headline", "headline")}>${escapeHtml(draft.closingHeadline)}</h2><p ${editableBlock("close.body", "body")}>${escapeHtml(draft.closingBody)}</p></div>
      <a class="primary" href="${escapeHtml(vendorUrl)}" target="_blank" rel="noopener" data-flz-cta-id="close-primary" ${editableBlock("close.primaryCta", "cta")}>${escapeHtml(draft.primaryCta)}</a>
    </section>
  </main>
  ${receiptHtml}
  <footer class="footer"><span>${escapeHtml(contextLabel)}</span><a href="${escapeHtml(vendorUrl)}" target="_blank" rel="noopener">${escapeHtml(brand.domain)}</a></footer>
</div>
<div class="signal-toast" data-signal-toast role="status" aria-live="polite" aria-atomic="true" hidden>
  <span class="signal-toast-mark" aria-hidden="true"><span></span></span>
  <span><strong>Signal captured</strong><span data-signal-copy>Your path is now in focus.</span></span>
</div>
<script>
  (function(){
    var body=document.body;
    var reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var allowedEvents={anchor_click:true,cta_click:true,topic_select:true,signature_select:true,question_select:true,section_view:true,section_dwell:true,page_heartbeat:true,experience_view:true,fullscreen_change:true,editable_block_select:true};
    var durableEvents={anchor_click:true,cta_click:true,topic_select:true,signature_select:true,question_select:true,section_dwell:true,page_heartbeat:true,experience_view:true};
    var stringKeys={area:true,targetId:true,sectionId:true,ctaId:true,lensId:true,hrefHost:true,state:true,blockId:true,blockKind:true};
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
    function persistEvent(action,payload){
      if(!experienceSessionId||!durableEvents[action]||!window.fetch)return;
      try{
        var request=window.fetch('/api/events',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'omit',keepalive:true,body:JSON.stringify({sessionId:experienceSessionId,event:action,context:durableContext(payload)})});
        if(request&&request.catch)request.catch(function(){})
      }catch(_eventSinkError){}
    }
    window.flzAnalytic=function(action,data){
      if(!allowedEvents[action])return;
      var payload=cleanPayload(data);
      try{if(window.parent&&window.parent!==window)window.parent.postMessage({source:'folloze-experience',version:1,event:action,action:action,payload:payload,data:payload},parentOrigin)}catch(_messageError){}
      persistEvent(action,payload);
    };
    window.flzAnalytic('experience_view',{});

    var toast=document.querySelector('[data-signal-toast]');
    var toastCopy=toast&&toast.querySelector('[data-signal-copy]');
    var signalShown=false;
    var toastTimer;
    function shortLabel(node){return (node&&node.textContent||'').replace(/\\s+/g,' ').trim().slice(0,64)}
    function showSignal(message){
      if(signalShown||!toast||!toastCopy)return;
      signalShown=true;
      toastCopy.textContent=message;
      toast.hidden=false;
      window.requestAnimationFrame(function(){toast.classList.add('is-visible')});
      toastTimer=window.setTimeout(function(){toast.classList.remove('is-visible');window.setTimeout(function(){toast.hidden=true},reducedMotion?0:240)},4200);
    }

    var journeyLinks=Array.from(document.querySelectorAll('[data-journey-link]'));
    function setActiveSection(sectionId){
      journeyLinks.forEach(function(link){
        var active=link.getAttribute('data-journey-link')===sectionId;
        if(active)link.setAttribute('aria-current','location');else link.removeAttribute('aria-current');
        if(active)link.scrollIntoView({behavior:reducedMotion?'auto':'smooth',block:'nearest',inline:'nearest'});
      });
    }
    document.querySelectorAll('[data-scroll-target]').forEach(function(control){
      control.addEventListener('click',function(){
        var target=this.getAttribute('data-scroll-target');
        var node=target&&document.getElementById(target);
        var area=this.closest('.journey-nav')?'journey-nav':this.closest('.nav')?'header':this.classList.contains('skip-link')?'skip-link':'hero';
        window.flzAnalytic('anchor_click',{area:area,targetId:target,ctaId:this.getAttribute('data-flz-cta-id')||undefined});
        if(node){node.scrollIntoView({behavior:reducedMotion?'auto':'smooth',block:'start'});setActiveSection(target);if(this.classList.contains('skip-link'))node.focus({preventScroll:true})}
        showSignal(this.classList.contains('skip-link')?'Experience content is in focus.':'Now viewing '+shortLabel(this)+'.');
      });
    });

    document.querySelectorAll('a[target="_blank"]').forEach(function(link){
      link.addEventListener('click',function(){
        var area=this.closest('.close')?'close':this.closest('.footer')?'footer':this.closest('.quality-receipt')?'receipt':'hero';
        var hrefHost;
        try{hrefHost=new URL(this.href).hostname}catch(_urlError){}
        window.flzAnalytic('cta_click',{area:area,ctaId:this.getAttribute('data-flz-cta-id')||'external-link',hrefHost:hrefHost});
        showSignal(area==='receipt'?'Original source opened for review.':'Next step opened in a new tab.');
      });
    });

    var tabs=Array.from(document.querySelectorAll('[role="tab"]'));
    function selectLens(tab,focus,announce){
      var lensIndex=tabs.indexOf(tab);
      tabs.forEach(function(item){var selected=item===tab;item.setAttribute('aria-selected',String(selected));item.tabIndex=selected?0:-1;var panel=document.getElementById(item.getAttribute('aria-controls'));if(panel)panel.hidden=!selected});
      tab.scrollIntoView({behavior:reducedMotion?'auto':'smooth',block:'nearest',inline:'nearest'});
      if(focus)tab.focus();
      if(announce){window.flzAnalytic('topic_select',{area:'decision-lenses',lensIndex:lensIndex,lensId:'lens-'+lensIndex});showSignal('Now exploring '+shortLabel(tab)+'.')}
    }
    tabs.forEach(function(tab,index){
      tab.addEventListener('click',function(){selectLens(tab,false,true)});
      tab.addEventListener('keydown',function(event){var next=index;if(event.key==='ArrowRight'||event.key==='ArrowDown')next=(index+1)%tabs.length;else if(event.key==='ArrowLeft'||event.key==='ArrowUp')next=(index-1+tabs.length)%tabs.length;else if(event.key==='Home')next=0;else if(event.key==='End')next=tabs.length-1;else return;event.preventDefault();selectLens(tabs[next],true,true)});
    });
    document.querySelectorAll('[data-signature-lens-index],[data-journey-lens-index]').forEach(function(control){
      control.addEventListener('click',function(){
        var attribute=this.hasAttribute('data-journey-lens-index')?'data-journey-lens-index':'data-signature-lens-index';
        var index=Number(this.getAttribute(attribute));
        var tab=tabs[index];
        var path=document.getElementById('decision-path');
        if(tab)selectLens(tab,false,false);
        window.flzAnalytic(attribute==='data-journey-lens-index'?'question_select':'signature_select',{area:attribute==='data-journey-lens-index'?'questions':'signature',lensIndex:index,lensId:'lens-'+index,ctaId:this.getAttribute('data-flz-cta-id')||undefined});
        showSignal('Your path now favors '+shortLabel(tab||this)+'.');
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
      if(active)showSignal('Fullscreen view enabled.');
    }
    if(fullscreenControl&&document.documentElement.requestFullscreen&&document.exitFullscreen){
      fullscreenControl.hidden=false;
      fullscreenControl.addEventListener('click',function(){
        var request=document.fullscreenElement?document.exitFullscreen():document.documentElement.requestFullscreen();
        if(request&&request.catch)request.catch(function(){window.flzAnalytic('fullscreen_change',{state:'unavailable'});showSignal('Fullscreen is unavailable in this browser.')});
      });
      document.addEventListener('fullscreenchange',syncFullscreen);
      document.addEventListener('fullscreenerror',function(){window.flzAnalytic('fullscreen_change',{state:'unavailable'})});
    }
    window.addEventListener('pagehide',function(){if(toastTimer)window.clearTimeout(toastTimer);engagementCleanup()},{once:true});
  })();
</script>
</body>
</html>`;
}
