import type { BrandProfile, SessionAnswers, UseCase } from "@/lib/types";
import type { ExperienceDraft } from "@/lib/generation/experience-schema";

const escapeHtml = (value: string) =>
  value.replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char] ?? char);

const safeColor = (value: string, fallback: string) => (/^#[0-9a-f]{6}$/i.test(value) ? value : fallback);

function safeAssetUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

export function renderExperienceHtml(input: {
  draft: ExperienceDraft;
  brand: BrandProfile;
  targetBrand?: BrandProfile;
  useCase: UseCase;
  answers: SessionAnswers;
  themeUrl?: string;
}): string {
  const { draft, brand, targetBrand, useCase, answers } = input;
  const primary = safeColor(brand.primaryColor, "#1C293F");
  const accent = safeColor(brand.accentColor, "#5B5BFF");
  const logo = safeAssetUrl(brand.logoUrl);
  const targetLogo = safeAssetUrl(targetBrand?.logoUrl);
  const vendorUrl = `https://${brand.domain}`;
  const themeLink = input.themeUrl
    ? `<link rel="stylesheet" href="${escapeHtml(input.themeUrl)}">`
    : "";
  const contextLabel =
    useCase === "abm" && targetBrand
      ? `${brand.companyName} × ${targetBrand.companyName}`
      : useCase === "campaign"
        ? answers.campaignType === "event"
          ? `${brand.companyName} event experience`
          : `${brand.companyName} campaign`
        : `${brand.companyName} guided content`;

  const sectionHtml = draft.sections
    .map(
      (section, index) => `
        <article class="story-card">
          <span class="story-index">0${index + 1}</span>
          <p class="eyebrow">${escapeHtml(section.eyebrow)}</p>
          <h2>${escapeHtml(section.headline)}</h2>
          <p>${escapeHtml(section.body)}</p>
          <div class="proof-line"><span></span>${escapeHtml(section.proof)}</div>
        </article>`
    )
    .join("");

  const signalButtons = draft.signalLabels
    .map(
      (label, index) => `<button type="button" class="signal-chip${index === 0 ? " is-active" : ""}" data-signal="${escapeHtml(label)}" onclick="this.parentElement.querySelectorAll('[data-signal]').forEach(function(item){item.classList.remove('is-active')});this.classList.add('is-active');flzAnalytic('topic_select',{text:this.innerText.trim(),area:'experience context'},this)">${escapeHtml(label)}</button>`
    )
    .join("");

  return `<!doctype html>
<html lang="en">
<head>${themeLink}</head>
<body>
<style>
  :root{--ink:${primary};--accent:${accent};--paper:#fbfbfe;--line:#e7e8ef;--muted:#687890;--dark:#071428;--white:#fff}
  *{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--paper);color:var(--ink);font-family:Inter,ui-sans-serif,system-ui,sans-serif;line-height:1.5}button,a{font:inherit}.shell{max-width:1536px;margin:0 auto;overflow:hidden;background:var(--white)}
  .nav{height:76px;display:flex;align-items:center;justify-content:space-between;padding:0 clamp(24px,5vw,78px);border-bottom:1px solid var(--line)}.brand-lockup{display:flex;align-items:center;gap:18px}.brand-lockup img{display:block;max-width:148px;max-height:34px;object-fit:contain}.brand-name{font-weight:700;font-size:18px}.plus{color:#9aa4b4}.nav button{border:0;background:transparent;color:var(--ink);cursor:pointer;font-weight:600}.nav button:hover{color:var(--accent)}
  .hero{min-height:620px;padding:clamp(70px,9vw,140px) clamp(24px,8vw,120px);position:relative;display:grid;align-items:center;background:linear-gradient(135deg,#fff 0%,#fff 62%,color-mix(in srgb,var(--accent) 9%,#fff) 100%)}.hero:after{content:"";position:absolute;width:480px;height:480px;right:-180px;top:80px;border:1px solid color-mix(in srgb,var(--accent) 25%,transparent);border-radius:50%;box-shadow:0 0 0 70px color-mix(in srgb,var(--accent) 5%,transparent),0 0 0 140px color-mix(in srgb,var(--accent) 3%,transparent)}.hero-copy{position:relative;z-index:1;max-width:920px}.eyebrow{text-transform:uppercase;letter-spacing:.14em;font-size:12px;font-weight:700;color:var(--accent);margin:0 0 18px}.hero h1{font-family:"Instrument Sans",Inter,sans-serif;font-size:clamp(48px,7vw,92px);line-height:.98;letter-spacing:-.045em;font-weight:550;max-width:1000px;margin:0}.hero .subhead{font-size:clamp(18px,2vw,23px);line-height:1.5;color:#40516b;max-width:760px;margin:30px 0 38px}.actions{display:flex;align-items:center;gap:14px;flex-wrap:wrap}.primary,.secondary{display:inline-flex;align-items:center;justify-content:center;min-height:54px;padding:14px 24px;border-radius:999px;text-decoration:none;cursor:pointer;transition:.2s cubic-bezier(.645,.045,.355,1)}.primary{background:var(--dark);color:white;border:1px solid var(--dark)}.primary:hover{background:var(--accent);border-color:var(--accent)}.secondary{background:white;color:var(--dark);border:1px solid var(--line)}.secondary:hover{color:var(--accent)}
  .context-strip{display:flex;justify-content:space-between;gap:24px;align-items:center;padding:26px clamp(24px,8vw,120px);background:var(--dark);color:white}.context-strip strong{font-size:18px}.context-strip span{font-size:14px;color:#b9c4d7}.signal-row{display:flex;gap:8px;flex-wrap:wrap}.signal-chip{border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.06);color:#dfe5ef;padding:9px 13px;border-radius:999px;cursor:pointer}.signal-chip.is-active,.signal-chip:hover{background:var(--accent);border-color:var(--accent);color:white}
  .story{padding:clamp(76px,9vw,130px) clamp(24px,8vw,120px)}.story-intro{max-width:900px;margin-bottom:58px}.story-intro h2{font-family:"Instrument Sans",Inter,sans-serif;font-size:clamp(38px,5vw,64px);line-height:1.04;letter-spacing:-.035em;margin:0}.story-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}.story-card{border:1px solid var(--line);border-radius:24px;padding:34px;min-height:390px;display:flex;flex-direction:column;background:white}.story-index{font:600 12px/1 Inter,sans-serif;color:#95a0b1;margin-bottom:80px}.story-card h2{font-family:"Instrument Sans",Inter,sans-serif;font-size:28px;line-height:1.08;letter-spacing:-.025em;margin:0 0 16px}.story-card>p:not(.eyebrow){color:#4d5f78;margin:0}.proof-line{margin-top:auto;border-top:1px solid var(--line);padding-top:20px;font-size:13px;color:#596a82}.proof-line span{display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--accent);margin-right:10px}
  .final{margin:0 clamp(18px,3vw,44px) 44px;border-radius:32px;padding:clamp(62px,8vw,110px);background:radial-gradient(circle at 85% 20%,color-mix(in srgb,var(--accent) 52%,transparent),transparent 34%),var(--dark);color:white;text-align:center}.final h2{font-family:"Instrument Sans",Inter,sans-serif;font-size:clamp(40px,5vw,66px);line-height:1.02;letter-spacing:-.035em;max-width:850px;margin:0 auto 20px}.final p{max-width:620px;margin:0 auto 32px;color:#c7d0df;font-size:18px}.final .primary{background:white;color:var(--dark);border-color:white}.final .primary:hover{color:var(--accent)}.footer{padding:26px clamp(24px,5vw,78px);display:flex;justify-content:space-between;color:#7b8799;font-size:12px}
  @media(max-width:900px){.story-grid{grid-template-columns:1fr}.story-card{min-height:310px}.story-index{margin-bottom:38px}.context-strip{align-items:flex-start;flex-direction:column}.hero{min-height:560px}.hero:after{display:none}}
  @media(max-width:560px){.nav{height:68px;padding:0 20px}.brand-lockup img{max-width:112px;max-height:28px}.plus,.target-wordmark{display:none}.hero{padding:72px 22px}.hero h1{font-size:47px}.actions{align-items:stretch;flex-direction:column}.actions a{width:100%}.story{padding:72px 22px}.story-card{padding:26px}.final{margin:0 12px 12px;border-radius:24px;padding:62px 24px}.footer{flex-direction:column;gap:8px}.signal-row{width:100%}}
  @media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important;transition:none!important}}
</style>
<div class="shell">
  <header class="nav">
    <div class="brand-lockup">
      ${logo ? `<img src="${escapeHtml(logo)}" alt="${escapeHtml(brand.companyName)}">` : `<span class="brand-name">${escapeHtml(brand.companyName)}</span>`}
      ${targetBrand ? `<span class="plus">×</span>${targetLogo ? `<img class="target-wordmark" src="${escapeHtml(targetLogo)}" alt="${escapeHtml(targetBrand.companyName)}">` : `<span class="target-wordmark brand-name">${escapeHtml(targetBrand.companyName)}</span>`}` : ""}
    </div>
    <button type="button" data-scroll-target="next-step" onclick="flzAnalytic('anchor_click',{text:this.innerText.trim(),area:'navigation',target:'next-step'},this);document.getElementById('next-step').scrollIntoView({behavior:'smooth',block:'start'})">${escapeHtml(draft.primaryCta)}</button>
  </header>
  <main>
    <section class="hero">
      <div class="hero-copy">
        <p class="eyebrow">${escapeHtml(draft.eyebrow)}</p>
        <h1>${escapeHtml(draft.headline)}</h1>
        <p class="subhead">${escapeHtml(draft.subhead)}</p>
        <div class="actions">
          <button type="button" class="primary" data-scroll-target="next-step" onclick="flzAnalytic('anchor_click',{text:this.innerText.trim(),area:'hero',target:'next-step'},this);document.getElementById('next-step').scrollIntoView({behavior:'smooth',block:'start'})">${escapeHtml(draft.primaryCta)}</button>
          <a class="secondary" href="${escapeHtml(vendorUrl)}" target="_blank" rel="noopener" onclick="flzAnalytic('cta_click',{text:this.innerText.trim(),area:'hero',url:this.href},this)">Visit ${escapeHtml(brand.companyName)}</a>
        </div>
      </div>
    </section>
    <section class="context-strip" aria-label="Experience context">
      <div><strong>${escapeHtml(contextLabel)}</strong><br><span>${escapeHtml(draft.audienceLabel)}</span></div>
      <div class="signal-row" aria-label="Explore topics">${signalButtons}</div>
    </section>
    <section class="story" id="story">
      <div class="story-intro"><p class="eyebrow">A path built around the decision</p><h2>${escapeHtml(draft.narrativeArc)}</h2></div>
      <div class="story-grid">${sectionHtml}</div>
    </section>
    <section class="final" id="next-step">
      <p class="eyebrow">One clear next move</p>
      <h2>${escapeHtml(draft.headline)}</h2>
      <p>${escapeHtml(draft.subhead)}</p>
      <a class="primary" href="${escapeHtml(vendorUrl)}" target="_blank" rel="noopener" onclick="flzAnalytic('cta_click',{text:this.innerText.trim(),area:'final CTA',url:this.href},this)">${escapeHtml(draft.primaryCta)}</a>
    </section>
  </main>
  <footer class="footer"><span>${escapeHtml(brand.companyName)}</span><span>Built for ${escapeHtml(draft.audienceLabel)}</span></footer>
</div>
<script>
  window.flzAnalytic=window.flzAnalytic||function(action,data){window.parent&&window.parent.postMessage({source:'folloze-experience',action:action,data:data},'*')};
</script>
</body>
</html>`;
}
