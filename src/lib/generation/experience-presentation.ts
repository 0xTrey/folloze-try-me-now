/** Shared presentation rules for new renders and already-saved app previews. */
export const EXPERIENCE_PRESENTATION_CSS = `
.media.media{min-width:0}
.hero.hero:not(:has(>.hero-media)){grid-template-columns:minmax(0,980px);min-height:auto}
.hero.hero:not(:has(>.hero-media)) .hero-copy{max-width:980px}
.credibility-anchor.credibility-anchor:not(:has(>.framework-media)){grid-template-columns:minmax(0,980px)}
.mechanism-section.mechanism-section:not(:has(>.framework-media)){grid-template-columns:minmax(0,1120px)}
.lens-panel.lens-panel:not(:has(>.lens-media)){grid-template-columns:84px minmax(0,1fr);min-height:0;align-items:start;gap:clamp(24px,4vw,58px)}
.lens-panel:not(:has(>.lens-media)) .lens-copy{max-width:980px}
.lens-panel:not(:has(>.lens-media)) .lens-copy>p{max-width:760px}
.composition-chapter-journey .lens-tabs button:before{content:counter(chapter) "  "}
@media(max-width:620px){.lens-panel.lens-panel:not(:has(>.lens-media)){grid-template-columns:minmax(0,1fr);gap:24px}}
`;

const PRESENTATION_MARKER = 'data-flz-presentation="content-led-media-v2"';
const NUMBER_CLASSES = new Set(["lens-number", "journey-index", "signature-index", "step-index", "role-index"]);
const classesOf = (attributes: string): string[] =>
  attributes.match(/\bclass\s*=\s*["']([^"']*)["']/i)?.[1].split(/\s+/) ?? [];

/**
 * Presentation-only compatibility for controlled renderer HTML. Main copy,
 * approved images, analytics, and stored release receipts are unchanged.
 * Script/style blocks are matched first and returned untouched.
 */
export function upgradeStoredExperiencePresentation(html: string): string {
  const contentLed = html.replace(
    /<script\b[^>]*>[\s\S]*?<\/script\s*>|<style\b[^>]*>[\s\S]*?<\/style\s*>|<figure\b([^>]*)>[\s\S]*?<\/figure\s*>/gi,
    (markup, attributes: string | undefined) => {
      if (attributes === undefined || !classesOf(attributes).includes("media")) return markup;
      if (!/<img\b[^>]*\bsrc\s*=/i.test(markup)) return "";
      // Renderer fallbacks contain only strong/span/i children, never nested divs.
      const realImage = markup.replace(/<div\b[^>]*class=["'][^"']*\bmedia-fallback\b[^"']*["'][^>]*>[\s\S]*?<\/div\s*>/gi, "");
      return /\bdata-no-fallback\b/i.test(attributes) ? realImage
        : realImage.replace(/<figure\b/i, '<figure data-no-fallback="true"');
    }
  ).replace(
    /<script\b[^>]*>[\s\S]*?<\/script\s*>|<style\b[^>]*>[\s\S]*?<\/style\s*>|<(p|span|div)\b([^>]*)>([^<]*)<\/\1\s*>/gi,
    (markup, tag: string | undefined, attributes: string | undefined, content: string | undefined) => {
      if (!tag || attributes === undefined || content === undefined) return markup;
      const classes = classesOf(attributes);
      if ((tag.toLowerCase() === "p" && classes.includes("eyebrow"))
        || (tag.toLowerCase() === "span" && classes.includes("media-fallback-kicker"))) return "";
      const numbered = classes.some(name => NUMBER_CLASSES.has(name));
      const urgencyLabel = tag.toLowerCase() === "span" && /^0[1-3] · (?:The change|The consequence|The better path)$/.test(content.trim());
      if (!numbered && !urgencyLabel) return markup;
      const cleanNumber = content.replace(/^(\s*)0([1-9])(?=\s|$)/, "$1$2");
      return `<${tag}${attributes}>${cleanNumber}</${tag}>`;
    }
  );
  if (contentLed.includes(PRESENTATION_MARKER)) return contentLed;
  return contentLed.replace(/<\/head\s*>/i, `<style ${PRESENTATION_MARKER}>${EXPERIENCE_PRESENTATION_CSS}</style></head>`);
}
