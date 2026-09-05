/** Shared presentation rules for new renders and already-saved app previews. */
export const EXPERIENCE_PRESENTATION_CSS = `
.media.media{container-type:inline-size;min-width:0}
.media.media:not(.has-asset){height:auto;min-height:280px;align-self:center}
.media.media.hero-media:not(.has-asset){min-height:clamp(320px,36vw,520px)}
.media.media>.media-fallback{position:relative;inset:auto;min-width:0;min-height:inherit;padding:clamp(22px,6cqw,40px);justify-content:center;gap:clamp(18px,4cqw,28px)}
.media.media .media-fallback>strong{display:block;min-width:0;width:100%;max-width:none;font-size:clamp(24px,8cqw,48px);line-height:1.08;overflow-wrap:break-word;text-wrap:pretty}
.media.media .media-fallback>.media-fallback-steps{width:100%;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:clamp(10px,3cqw,20px);padding-top:18px;border-top:1px solid color-mix(in srgb,var(--brand-ink) 20%,transparent)}
.media.media .media-fallback-steps i{min-width:0;font-size:clamp(10px,2.6cqw,12px);line-height:1.5;letter-spacing:.04em;overflow-wrap:anywhere}
`;

const PRESENTATION_MARKER = 'data-flz-presentation="responsive-media-v1"';

/**
 * Presentation-only compatibility for controlled renderer HTML. Stored copy,
 * assets, analytics, and release receipts are not rewritten or re-saved.
 */
export function upgradeStoredExperiencePresentation(html: string): string {
  const withoutLabels = html.replace(
    /<script\b[^>]*>[\s\S]*?<\/script\s*>|<style\b[^>]*>[\s\S]*?<\/style\s*>|<(p|span)\b([^>]*)>[^<]*<\/\1\s*>/gi,
    (markup, tag: string | undefined, attributes: string | undefined) => {
      if (!tag || !attributes) return markup;
      const classes = attributes.match(/\bclass\s*=\s*["']([^"']*)["']/i)?.[1].split(/\s+/) ?? [];
      return (tag.toLowerCase() === "p" && classes.includes("eyebrow"))
        || (tag.toLowerCase() === "span" && classes.includes("media-fallback-kicker")) ? "" : markup;
    }
  );
  if (withoutLabels.includes(PRESENTATION_MARKER)) return withoutLabels;
  return withoutLabels.replace(/<\/head\s*>/i, `<style ${PRESENTATION_MARKER}>${EXPERIENCE_PRESENTATION_CSS}</style></head>`);
}
