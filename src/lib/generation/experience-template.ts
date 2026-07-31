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

export function renderExperienceHtml(input: {
  draft: ExperienceDraft;
  brand: BrandProfile;
  targetBrand?: BrandProfile;
  useCase: UseCase;
  answers: SessionAnswers;
  themeUrl?: string;
  fontDeliveryUrls?: { display?: string; body?: string };
}): string {
  const { draft, brand, targetBrand } = input;
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
  const vendorUrl = `https://${brand.domain}`;
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

  const lensButtons = draft.signalLabels
    .map(
      (label, index) => `<button type="button" role="tab" id="lens-tab-${index}" aria-controls="lens-panel-${index}" aria-selected="${index === 0}" tabindex="${index === 0 ? 0 : -1}" data-lens-index="${index}">${escapeHtml(label)}</button>`
    )
    .join("");

  const lensPanels = draft.sections
    .map(
      (section, index) => `<section class="lens-panel" id="lens-panel-${index}" role="tabpanel" aria-labelledby="lens-tab-${index}" ${index === 0 ? "" : "hidden"}>
        <div class="lens-number" aria-hidden="true">0${index + 1}</div>
        <div class="lens-copy"><p class="eyebrow">${escapeHtml(section.eyebrow)}</p><h2>${escapeHtml(section.headline)}</h2><p>${escapeHtml(section.body)}</p></div>
        ${imageFigure(supportingImages[index] ?? supportingImages[0] ?? heroImage, `${brand.companyName}: ${section.eyebrow}`, "lens-media")}
      </section>`
    )
    .join("");

  const journeyCards = draft.sections
    .map(
      (section, index) => `<article class="journey-card">
        <div class="journey-index" aria-hidden="true">0${index + 1}</div>
        <div class="journey-copy"><p class="eyebrow">${escapeHtml(section.eyebrow)}</p><h3>${escapeHtml(section.proof)}</h3></div>
        <button type="button" class="journey-action" data-journey-lens-index="${index}">Explore this lens <span aria-hidden="true">→</span></button>
      </article>`
    )
    .join("");

  const regions: Record<ExperienceDraft["sectionSequence"][number], string> = {
    thesis: `<section class="thesis experience-region" id="campaign-thesis">
      <p class="eyebrow">${escapeHtml(draft.sectionLabels.thesis)}</p>
      <h2>${escapeHtml(draft.thesisHeadline)}</h2>
      <p>${escapeHtml(draft.thesisBody)}</p>
    </section>`,
    "decision-lenses": `<section class="lens-lab experience-region" id="decision-path">
      <header class="region-heading"><h2>${escapeHtml(draft.sectionLabels.lenses)}</h2></header>
      <div class="lens-tabs" role="tablist" aria-label="${escapeHtml(draft.sectionLabels.lenses)}">${lensButtons}</div>
      ${lensPanels}
    </section>`,
    "guided-questions": `<section class="journey experience-region" id="guided-questions">
      <header class="journey-header"><p class="eyebrow">Meeting-ready</p><h2>${escapeHtml(draft.sectionLabels.journey)}</h2></header>
      <div class="journey-grid">${journeyCards}</div>
    </section>`
  };
  const experienceFlow = draft.sectionSequence.map((section) => regions[section]).join("");
  const signatureButtons = draft.sections
    .map(
      (section, index) => `<button type="button" data-signature-lens-index="${index}">
        <span class="signature-index" aria-hidden="true">0${index + 1}</span>
        <span class="signature-item-copy"><strong>${escapeHtml(section.eyebrow)}</strong><span>${escapeHtml(
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
    :root{--brand-ink:${primary};--brand-accent:${accent};--brand-surface:${surface};--brand-on-accent:${onAccent};--deep:#071428;--text:#20324b;--muted:#66778d;--line:#dce3e9;--soft:color-mix(in srgb,var(--brand-ink) 13%,#fff);--display:${displayFont};--body:${bodyFont}}
    *{box-sizing:border-box}[hidden]{display:none!important}html{scroll-behavior:smooth;overflow-x:clip}body{margin:0;background:var(--brand-surface);color:var(--brand-ink);font-family:var(--body);line-height:1.5;overflow-x:clip}button,a{font:inherit}.hero-copy,.lens-copy,.journey-copy,.close>div,.region-heading{min-width:0}.shell{max-width:1600px;margin:0 auto;background:var(--brand-surface);overflow:hidden}.eyebrow{margin:0 0 18px;color:var(--brand-accent);font-size:12px;font-weight:800;letter-spacing:.14em;text-transform:uppercase}.nav{height:78px;padding:0 clamp(22px,6vw,96px);display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--line);background:var(--brand-surface)}.brand-lockup{display:flex;flex:0 0 auto;align-items:center;gap:16px}.lockup-divider{color:var(--muted);font-size:14px}.wordmark{display:inline-flex;flex:0 0 auto;align-items:center;max-width:172px;color:var(--brand-ink);font-weight:800;font-size:19px;white-space:nowrap}.wordmark img{display:block;width:auto;height:32px;max-width:172px;object-fit:contain;opacity:0}.wordmark.has-image img{opacity:1}.wordmark.has-image .wordmark-fallback{display:none}.target-wordmark{max-width:142px}.target-wordmark img{height:28px;max-width:142px}.nav-action{border:0;background:transparent;color:var(--brand-ink);min-height:44px;padding:0;cursor:pointer;font-weight:750}.nav-action:hover,.nav-action:focus-visible{color:var(--brand-accent)}
    .hero{position:relative;min-height:650px;padding:clamp(70px,8vw,128px) clamp(24px,7vw,112px);display:grid;grid-template-columns:minmax(0,1.04fr) minmax(360px,.76fr);gap:clamp(44px,7vw,108px);align-items:center;background:linear-gradient(132deg,var(--brand-surface) 0 58%,var(--soft) 58% 100%)}.hero-copy{position:relative;z-index:2}.hero h1{max-width:940px;margin:0;font-family:var(--display);font-size:clamp(46px,4.6vw,72px);font-weight:700;line-height:.98;letter-spacing:-.045em;text-wrap:balance;overflow-wrap:break-word}.hero .subhead{max-width:780px;margin:28px 0 34px;color:var(--text);font-size:clamp(18px,1.65vw,22px);line-height:1.5}.primary,.secondary{display:inline-flex;align-items:center;justify-content:center;min-height:52px;padding:13px 22px;border-radius:999px;text-decoration:none;font-weight:750;cursor:pointer;transition:transform .18s ease,background-color .18s ease,color .18s ease,border-color .18s ease}.primary{border:1px solid var(--brand-accent);background:var(--brand-accent);color:var(--brand-on-accent)}.primary:hover,.primary:focus-visible{transform:translateY(-2px)}.secondary{border:1px solid color-mix(in srgb,var(--brand-ink) 22%,transparent);background:transparent;color:var(--brand-ink)}.secondary:hover,.secondary:focus-visible{border-color:var(--brand-accent);color:var(--brand-accent)}.actions{display:flex;gap:12px;flex-wrap:wrap}.hero-media{width:100%;max-width:100%;height:clamp(380px,42vw,560px);min-height:0;align-self:center;border:1px solid color-mix(in srgb,var(--brand-ink) 12%,transparent);box-shadow:0 28px 80px color-mix(in srgb,var(--brand-ink) 16%,transparent)}.media{position:relative;margin:0;overflow:hidden;background:var(--soft)}.media img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:center;opacity:0;transition:opacity .2s ease}.hero-media img,.media.is-diagram img{object-fit:contain}.media.has-asset img{opacity:1}.media-fallback{position:absolute;inset:0;display:grid;place-items:center;isolation:isolate}.media-fallback:before,.media-fallback:after,.media-fallback span{content:"";position:absolute;border:1px solid color-mix(in srgb,var(--brand-accent) 42%,transparent);border-radius:50%}.media-fallback:before{width:70%;aspect-ratio:1}.media-fallback:after{width:48%;aspect-ratio:1}.media-fallback span:nth-child(1){width:16px;height:16px;background:var(--brand-accent)}.media-fallback span:nth-child(2){width:42%;height:1px;border:0;border-top:1px solid var(--brand-accent);transform:rotate(30deg)}.media-fallback span:nth-child(3){width:42%;height:1px;border:0;border-top:1px solid var(--brand-accent);transform:rotate(-30deg)}.media.has-asset .media-fallback{opacity:0}.context-note{display:inline-flex;align-items:center;gap:9px;margin-top:24px;padding:9px 13px;border:1px solid var(--line);border-radius:999px;color:var(--muted);font-size:13px}.context-note:before{content:"";width:8px;height:8px;border-radius:50%;background:var(--brand-accent)}
    .signature{padding:clamp(58px,7vw,104px) clamp(24px,7vw,112px)}.signature-intro h2{max-width:1060px;margin:0;font-family:var(--display);font-size:clamp(38px,4.4vw,66px);line-height:1.03;letter-spacing:-.035em}.signature-intro>p:last-child{margin:22px 0 0;color:var(--muted);font-weight:700}.signature-items button{appearance:none;width:100%;border:0;text-align:left;color:inherit;font:inherit;cursor:pointer}.signature-index{font:800 13px/1 var(--body);letter-spacing:.12em}.signature-item-copy{display:grid;gap:8px}.signature-item-copy strong{font-size:13px;letter-spacing:.1em;text-transform:uppercase}.signature-item-copy>span{font-family:var(--display);font-size:clamp(18px,1.7vw,25px);line-height:1.18}.signature-abm{display:grid;grid-template-columns:minmax(300px,.82fr) minmax(420px,1.08fr);gap:clamp(44px,7vw,110px);background:var(--soft);border-top:1px solid var(--line);border-bottom:1px solid var(--line)}.signature-abm .signature-items{display:grid;border-top:1px solid color-mix(in srgb,var(--brand-ink) 20%,transparent)}.signature-abm button{display:grid;grid-template-columns:52px 1fr;gap:18px;padding:24px 0;background:transparent;border-bottom:1px solid color-mix(in srgb,var(--brand-ink) 20%,transparent)}.signature-abm button:hover,.signature-abm button:focus-visible{color:var(--brand-accent);padding-left:10px}.signature-product{background:var(--brand-accent);color:var(--brand-on-accent)}.signature-product .eyebrow{color:inherit;opacity:.72}.signature-product .signature-items{display:grid;grid-template-columns:repeat(3,1fr);margin-top:54px;border-top:1px solid color-mix(in srgb,currentColor 34%,transparent)}.signature-product button{position:relative;display:grid;gap:34px;min-height:220px;padding:26px 30px;background:transparent;border-right:1px solid color-mix(in srgb,currentColor 34%,transparent)}.signature-product button:last-child{border-right:0}.signature-product button:after{content:"";position:absolute;right:28px;bottom:26px;width:12px;height:12px;border-top:2px solid currentColor;border-right:2px solid currentColor;transform:rotate(45deg)}.signature-product button:hover,.signature-product button:focus-visible{background:color-mix(in srgb,var(--brand-surface) 14%,transparent)}.signature-event{position:relative;overflow:hidden;text-align:center;background:var(--brand-ink);color:#fff}.signature-event:before{content:"";position:absolute;inset:-80% 58% -80% -15%;border:1px solid color-mix(in srgb,var(--brand-accent) 55%,transparent);border-radius:50%}.signature-event .signature-intro{position:relative;max-width:980px;margin:0 auto}.signature-event .eyebrow{color:var(--brand-accent)}.signature-event .signature-items{position:relative;display:flex;justify-content:center;gap:12px;margin-top:48px}.signature-event button{max-width:310px;padding:24px;background:color-mix(in srgb,#fff 8%,transparent);border:1px solid color-mix(in srgb,#fff 22%,transparent);text-align:center}.signature-event button:hover,.signature-event button:focus-visible{background:var(--brand-accent);color:var(--brand-on-accent)}.signature-event .signature-index{display:block;margin-bottom:16px}.signature-content{display:grid;grid-template-columns:minmax(300px,.7fr) minmax(440px,1.05fr);gap:clamp(48px,9vw,138px);align-items:start;background:var(--brand-surface);border-top:1px solid var(--line);border-bottom:1px solid var(--line)}.signature-content .signature-intro{position:sticky;top:24px}.signature-content .signature-items{display:grid;border-top:1px solid var(--brand-ink)}.signature-content button{display:grid;grid-template-columns:54px 1fr;gap:18px;padding:28px 0;background:transparent;border-bottom:1px solid var(--line)}.signature-content button:hover,.signature-content button:focus-visible{color:var(--brand-accent)}.signature-content .signature-index{padding-top:5px}.signature-demand{background:var(--brand-surface)}.signature-demand .signature-intro{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:22px;align-items:end}.signature-demand .signature-intro .eyebrow{grid-column:1/-1}.signature-demand .signature-items{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:48px}.signature-demand button{display:grid;gap:44px;min-height:230px;padding:26px;background:var(--soft);border:1px solid var(--line)}.signature-demand button:hover,.signature-demand button:focus-visible{transform:translateY(-5px);border-color:var(--brand-accent)}
    .thesis{padding:clamp(72px,8vw,126px) clamp(24px,7vw,112px);background:var(--brand-ink);color:#fff}.thesis h2{max-width:1120px;margin:0;font-family:var(--display);font-size:clamp(42px,5.4vw,78px);font-weight:700;line-height:1.02;letter-spacing:-.04em;overflow-wrap:anywhere}.thesis p{max-width:760px;margin:26px 0 0;color:color-mix(in srgb,#fff 74%,var(--brand-ink));font-size:19px;line-height:1.55}
    .lens-lab{padding:clamp(70px,8vw,118px) clamp(24px,7vw,112px) clamp(76px,8vw,126px);background:var(--soft)}.region-heading{max-width:1060px;margin:0 0 50px}.region-heading h2{margin:0;font-family:var(--display);font-size:clamp(40px,4.8vw,70px);line-height:1.03;letter-spacing:-.04em}.lens-tabs{display:flex;gap:8px;padding:0 0 28px;overflow-x:auto;scrollbar-width:thin}.lens-tabs button{flex:0 0 auto;min-height:46px;padding:10px 16px;border:1px solid color-mix(in srgb,var(--brand-ink) 28%,transparent);background:transparent;color:var(--brand-ink);font-weight:750;cursor:pointer}.lens-tabs button[aria-selected="true"]{border-color:var(--brand-ink);background:var(--brand-ink);color:#fff}.lens-tabs button:focus-visible{outline:3px solid color-mix(in srgb,var(--brand-accent) 45%,transparent);outline-offset:3px}.lens-panel{display:grid;grid-template-columns:120px minmax(0,.94fr) minmax(320px,.78fr);gap:clamp(34px,5vw,76px);align-items:center;min-height:520px}.lens-panel[hidden]{display:none}.lens-number{align-self:start;padding-top:10px;color:color-mix(in srgb,var(--brand-ink) 18%,transparent);font:700 clamp(82px,10vw,150px)/.82 var(--display)}.lens-copy h2{margin:0;font-family:var(--display);font-size:clamp(38px,4.5vw,66px);line-height:1.04;letter-spacing:-.035em}.lens-copy>p:not(.eyebrow){max-width:650px;margin:24px 0;color:var(--text);font-size:19px}.lens-media{min-height:390px;background:var(--brand-surface)}
    .journey{padding:clamp(68px,7vw,104px) clamp(24px,7vw,112px);background:var(--brand-surface)}.journey-header{max-width:980px;margin-bottom:44px}.journey-header h2{margin:0;font-family:var(--display);font-size:clamp(42px,5vw,68px);line-height:1.03;letter-spacing:-.04em}.journey-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.journey-card{min-height:330px;padding:28px;display:flex;flex-direction:column;border:1px solid var(--line);background:var(--soft);transition:transform .18s ease,border-color .18s ease,box-shadow .18s ease}.journey-card:hover{transform:translateY(-5px);border-color:var(--brand-accent);box-shadow:0 22px 56px color-mix(in srgb,var(--brand-ink) 12%,transparent)}.journey-index{color:var(--brand-accent);font:800 14px/1 var(--body);letter-spacing:.13em}.journey-copy{margin-top:46px}.journey-copy .eyebrow{margin-bottom:12px}.journey-copy h3{margin:0;font-family:var(--display);font-size:clamp(25px,2.2vw,34px);line-height:1.08;letter-spacing:-.025em}.journey-action{min-height:44px;margin-top:auto;padding:20px 0 0;display:flex;align-items:center;justify-content:space-between;border:0;border-top:1px solid color-mix(in srgb,var(--brand-ink) 16%,transparent);background:transparent;color:var(--brand-ink);font-weight:750;cursor:pointer}.journey-action:hover,.journey-action:focus-visible{color:var(--brand-accent)}
    .close{margin:0 clamp(14px,3vw,46px) clamp(14px,3vw,46px);padding:clamp(66px,8vw,116px);display:grid;grid-template-columns:minmax(0,1fr) auto;gap:54px;align-items:end;background:radial-gradient(circle at 90% 10%,color-mix(in srgb,var(--brand-accent) 58%,transparent),transparent 30%),var(--brand-ink);color:#fff}.close h2{max-width:980px;margin:0;font-family:var(--display);font-size:clamp(42px,5.2vw,76px);line-height:1.01;letter-spacing:-.04em}.close p{max-width:720px;margin:24px 0 0;color:color-mix(in srgb,#fff 76%,var(--brand-ink));font-size:18px}.close .primary{white-space:nowrap;background:#fff;border-color:#fff;color:var(--brand-ink)}.footer{padding:26px clamp(24px,6vw,96px);display:flex;justify-content:space-between;gap:24px;color:var(--muted);font-size:12px}.footer a{color:inherit;text-decoration:none}.footer a:hover,.footer a:focus-visible{color:var(--brand-accent)}.experience-region,.close,#next-step{scroll-margin-top:24px}
    body.register-campaign-demand .hero{background:var(--brand-ink);color:#fff}body.register-campaign-demand .hero .subhead{color:color-mix(in srgb,#fff 78%,var(--brand-ink))}body.register-campaign-demand .hero .eyebrow{color:color-mix(in srgb,var(--brand-accent) 84%,#fff)}body.register-campaign-demand .hero .context-note{border-color:color-mix(in srgb,#fff 28%,transparent);color:color-mix(in srgb,#fff 72%,transparent)}body.register-campaign-demand .hero-media{border-color:color-mix(in srgb,#fff 18%,transparent);box-shadow:0 34px 100px color-mix(in srgb,#000 42%,transparent)}
    body.register-campaign-product .hero{grid-template-columns:minmax(360px,.78fr) minmax(0,1.04fr);background:linear-gradient(150deg,var(--soft),var(--brand-surface) 64%)}body.register-campaign-product .hero-media{order:-1;height:clamp(430px,46vw,620px)}
    body.register-campaign-event .hero{grid-template-columns:1fr;text-align:center;padding-bottom:0}body.register-campaign-event .hero-copy{max-width:1120px;margin:0 auto}body.register-campaign-event .hero h1,body.register-campaign-event .hero .subhead{margin-left:auto;margin-right:auto}body.register-campaign-event .actions{justify-content:center}body.register-campaign-event .context-note{justify-content:center}body.register-campaign-event .hero-media{height:clamp(260px,32vw,430px);margin-top:18px;border-bottom:0}
    body.register-content-magic .hero{grid-template-columns:1fr;padding-bottom:0;background:var(--brand-surface)}body.register-content-magic .hero-copy{max-width:1220px}body.register-content-magic .hero h1{max-width:1180px;font-size:clamp(52px,6.5vw,98px);line-height:.94}body.register-content-magic .hero .subhead{max-width:880px}body.register-content-magic .hero-media{height:clamp(360px,48vw,680px);margin-top:28px;border-bottom:0}body.register-content-magic .lens-lab{background:var(--brand-surface);border-top:1px solid var(--line);border-bottom:1px solid var(--line)}body.register-content-magic .journey{background:var(--soft)}
    body.register-one-to-one-abm .thesis h2{max-width:1240px}body.register-one-to-one-abm .lens-tabs button{border-radius:0}body.design-source-brand-technical .primary,body.design-source-brand-technical .secondary,body.design-source-brand-technical .lens-tabs button{border-radius:6px}body.design-source-brand-editorial .hero h1,body.design-source-brand-editorial .thesis h2,body.design-source-brand-editorial .region-heading h2{letter-spacing:-.028em}body.design-neutral-fallback .hero-media{box-shadow:none}
    button:focus-visible,a:focus-visible{outline:3px solid color-mix(in srgb,var(--brand-accent) 45%,transparent);outline-offset:4px}
    @media(max-width:980px){.hero,body.register-campaign-product .hero{grid-template-columns:1fr;min-height:auto}.hero-media,body.register-campaign-product .hero-media{height:clamp(380px,58vw,540px);order:initial}.signature-abm,.signature-content{grid-template-columns:1fr}.signature-content .signature-intro{position:static}.signature-product .signature-items,.signature-demand .signature-items{grid-template-columns:1fr}.signature-product button{min-height:160px;border-right:0;border-bottom:1px solid color-mix(in srgb,currentColor 34%,transparent)}.signature-event .signature-items{display:grid;grid-template-columns:1fr}.signature-event button{max-width:none}.lens-panel{grid-template-columns:90px 1fr}.lens-media{grid-column:2}.journey-grid{grid-template-columns:1fr}.journey-card{min-height:230px}.journey-copy{margin-top:30px}.close{grid-template-columns:1fr;align-items:start}}
    @media(max-width:620px){.nav{height:68px;padding:0 20px}.brand-lockup{gap:10px}.seller-wordmark{max-width:116px}.seller-wordmark img{height:27px;max-width:116px}.target-wordmark,.lockup-divider{display:none}.nav-action{font-size:13px}.hero{padding:50px 22px 42px;background:var(--brand-surface)}.hero h1{font-size:clamp(38px,10.5vw,46px);line-height:1.02}.hero .subhead{font-size:17px}.actions{align-items:stretch;flex-direction:column}.actions>*{width:100%}.hero-media{height:auto;min-height:280px;margin-top:12px;box-shadow:0 18px 48px color-mix(in srgb,var(--brand-ink) 14%,transparent)}.context-note{border-radius:14px;align-items:flex-start}.signature{padding:54px 22px}.signature-intro h2{font-size:36px}.signature-abm button,.signature-content button{grid-template-columns:40px 1fr}.signature-demand .signature-intro{grid-template-columns:1fr}.signature-demand .signature-intro .eyebrow{grid-column:auto}.thesis{padding:58px 22px}.thesis h2{font-size:clamp(34px,9.6vw,46px)}.thesis p{font-size:17px}.lens-lab{padding:54px 22px 64px}.lens-tabs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;overflow:visible}.lens-tabs button{min-width:0;padding:9px 7px;white-space:normal;font-size:12px;line-height:1.2}.lens-panel{grid-template-columns:1fr;min-height:0;gap:28px}.lens-number{font-size:68px}.lens-media{grid-column:1;min-height:270px}.lens-copy h2{font-size:37px}.lens-copy>p:not(.eyebrow){font-size:17px}.journey{padding:58px 22px}.journey-header{margin-bottom:34px}.journey-card{min-height:260px;padding:24px}.journey-copy h3{font-size:28px}.close{margin:0 10px 10px;padding:56px 24px;gap:32px}.close h2{font-size:40px}.close .primary{width:100%}.footer{padding:26px 22px;flex-direction:column;gap:8px}}
    @media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}.primary,.secondary{transition:none}}
  </style>
</head>
<body class="register-${escapeHtml(draft.campaignRegister)} design-${escapeHtml(draft.designRegister)}" data-wireframe="${escapeHtml(draft.wireframeName)}" data-experience-shape="${escapeHtml(draft.experienceShape)}">
<div class="shell">
  <header class="nav">
    <div class="brand-lockup">
      ${wordmark(brand, "seller-wordmark")}
      ${targetBrand ? `<span class="lockup-divider">for</span>${wordmark(targetBrand, "target-wordmark")}` : ""}
    </div>
    <button type="button" class="nav-action" data-scroll-target="next-step">${escapeHtml(draft.sectionLabels.close)}</button>
  </header>
  <main>
    <section class="hero">
      <div class="hero-copy">
        <p class="eyebrow">${escapeHtml(draft.eyebrow)}</p>
        <h1>${escapeHtml(draft.headline)}</h1>
        <p class="subhead">${escapeHtml(draft.subhead)}</p>
        <div class="actions">
          <button type="button" class="primary" data-scroll-target="${escapeHtml(firstSectionTarget)}">${escapeHtml(draft.primaryCta)}</button>
          ${sourceUrl ? `<a class="secondary" href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener">${sourceLinkLabel}</a>` : ""}
        </div>
        <span class="context-note">For ${escapeHtml(draft.audienceLabel)}</span>
      </div>
      ${imageFigure(heroImage, `${brand.companyName} platform visual`, "hero-media", true)}
    </section>
    ${signatureMoment}
    ${experienceFlow}
    <section class="close" id="next-step">
      <div><p class="eyebrow">${escapeHtml(draft.sectionLabels.close)}</p><h2>${escapeHtml(draft.closingHeadline)}</h2><p>${escapeHtml(draft.closingBody)}</p></div>
      <a class="primary" href="${escapeHtml(vendorUrl)}" target="_blank" rel="noopener">${escapeHtml(draft.primaryCta)}</a>
    </section>
  </main>
  <footer class="footer"><span>${escapeHtml(contextLabel)}</span><a href="${escapeHtml(vendorUrl)}" target="_blank" rel="noopener">${escapeHtml(brand.domain)}</a></footer>
</div>
<script>
  window.flzAnalytic=window.flzAnalytic||function(action,data){try{window.parent&&window.parent.postMessage({source:'folloze-experience',action:action,data:data},'*')}catch(_error){}};
  document.querySelectorAll('[data-scroll-target]').forEach(function(control){control.addEventListener('click',function(){var target=this.getAttribute('data-scroll-target');var node=target&&document.getElementById(target);window.flzAnalytic('anchor_click',{text:this.innerText.trim(),area:this.closest('.nav')?'navigation':'hero',target:target},this);if(node)node.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'})})});
  document.querySelectorAll('a[target="_blank"]').forEach(function(link){link.addEventListener('click',function(){var area=this.closest('.close')?'final CTA':this.closest('.footer')?'footer':'hero';window.flzAnalytic('cta_click',{text:this.innerText.trim(),area:area,url:this.href},this)})});
  var tabs=Array.from(document.querySelectorAll('[role="tab"]'));
  function selectLens(tab,focus){tabs.forEach(function(item){var selected=item===tab;item.setAttribute('aria-selected',String(selected));item.tabIndex=selected?0:-1;var panel=document.getElementById(item.getAttribute('aria-controls'));if(panel)panel.hidden=!selected});if(focus)tab.focus();window.flzAnalytic('topic_select',{text:tab.innerText.trim(),area:'decision lenses'},tab)}
  tabs.forEach(function(tab,index){tab.addEventListener('click',function(){selectLens(tab,false)});tab.addEventListener('keydown',function(event){var next=index;if(event.key==='ArrowRight')next=(index+1)%tabs.length;else if(event.key==='ArrowLeft')next=(index-1+tabs.length)%tabs.length;else if(event.key==='Home')next=0;else if(event.key==='End')next=tabs.length-1;else return;event.preventDefault();selectLens(tabs[next],true)})});
  document.querySelectorAll('[data-signature-lens-index],[data-journey-lens-index]').forEach(function(control){control.addEventListener('click',function(){var index=Number(this.getAttribute('data-signature-lens-index')||this.getAttribute('data-journey-lens-index'));var tab=tabs[index];var path=document.getElementById('decision-path');if(tab)selectLens(tab,false);window.flzAnalytic(this.hasAttribute('data-journey-lens-index')?'question_select':'signature_select',{text:this.innerText.trim(),index:index},this);if(path)path.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'})})});
</script>
</body>
</html>`;
}
