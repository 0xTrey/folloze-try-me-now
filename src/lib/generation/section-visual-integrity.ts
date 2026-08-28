/**
 * DOM metrics every rendered experience should pass before release.
 *
 * The collector is browser-safe so Playwright can pass it to `page.evaluate`
 * without re-implementing the same assertions in each fixture spec.
 */
export interface SectionVisualIntegrityMetrics {
  horizontalOverflow: boolean;
  documentScrollWidth: number;
  documentClientWidth: number;
  sectionsOutsideViewport: string[];
  clippedFocusTargets: string[];
  clippedVisibleText: string[];
  lowContrastText: string[];
  emptyMediaContainers: string[];
  brokenImages: number;
}

export function collectSectionVisualIntegrityMetrics(): SectionVisualIntegrityMetrics {
  const tolerance = 1;
  const viewportWidth = window.innerWidth;
  const documentScrollWidth = document.documentElement.scrollWidth;
  const documentClientWidth = document.documentElement.clientWidth;
  const BODY_TEXT_CONTRAST_MIN = 4.5;
  const LARGE_TEXT_CONTRAST_MIN = 3;

  const parseRgb = (color: string): [number, number, number] | undefined => {
    const hex = color.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (hex) {
      const raw = hex[1];
      const expanded =
        raw.length === 3 ? raw.split("").map((channel) => `${channel}${channel}`).join("") : raw;
      return [
        Number.parseInt(expanded.slice(0, 2), 16),
        Number.parseInt(expanded.slice(2, 4), 16),
        Number.parseInt(expanded.slice(4, 6), 16)
      ];
    }
    const rgb = color
      .trim()
      .match(/^rgba?\(\s*(\d{1,3})\s*(?:,\s*|\s+)(\d{1,3})\s*(?:,\s*|\s+)(\d{1,3})/i);
    if (!rgb) return undefined;
    const channels = rgb.slice(1, 4).map(Number);
    if (channels.some((channel) => channel < 0 || channel > 255)) return undefined;
    return channels as [number, number, number];
  };

  const relativeLuminance = ([red, green, blue]: [number, number, number]): number => {
    const channel = (value: number) => {
      const normalized = value / 255;
      return normalized <= 0.03928
        ? normalized / 12.92
        : ((normalized + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue);
  };

  const contrastRatio = (foreground: string, background: string): number | undefined => {
    const fg = parseRgb(foreground);
    const bg = parseRgb(background);
    if (!fg || !bg) return undefined;
    const lighter = Math.max(relativeLuminance(fg), relativeLuminance(bg));
    const darker = Math.min(relativeLuminance(fg), relativeLuminance(bg));
    return (lighter + 0.05) / (darker + 0.05);
  };

  const effectiveBackground = (element: HTMLElement): string | undefined => {
    let current: HTMLElement | null = element;
    while (current) {
      const style = getComputedStyle(current);
      const parsed = parseRgb(style.backgroundColor);
      if (parsed && style.backgroundColor !== "rgba(0, 0, 0, 0)") {
        return style.backgroundColor;
      }
      current = current.parentElement;
    }
    const bodyBackground = getComputedStyle(document.body).backgroundColor;
    return parseRgb(bodyBackground) ? bodyBackground : undefined;
  };

  const elementLabel = (element: HTMLElement): string =>
    element.id || element.className.split(/\s+/)[0] || element.tagName.toLowerCase();

  const insideHorizontalScrollRail = (element: HTMLElement): boolean => {
    let parent = element.parentElement;
    while (parent) {
      const style = getComputedStyle(parent);
      if (
        (style.overflowX === "auto" || style.overflowX === "scroll") &&
        parent.scrollWidth > parent.clientWidth + tolerance
      ) {
        return true;
      }
      parent = parent.parentElement;
    }
    return false;
  };

  const sectionSelectors = [
    "main > section",
    ".framework-section",
    ".hero",
    ".thesis",
    ".lens-lab",
    ".journey",
    ".close"
  ];
  const sectionsOutsideViewport = Array.from(
    document.querySelectorAll<HTMLElement>(sectionSelectors.join(","))
  )
    .filter((section) => {
      const style = getComputedStyle(section);
      if (style.display === "none" || style.visibility === "hidden") return false;
      const rect = section.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return false;
      return rect.left < -tolerance || rect.right > viewportWidth + tolerance;
    })
    .map((section) => section.id || section.className.split(/\s+/)[0] || section.tagName);

  const clippedFocusTargets = Array.from(
    document.querySelectorAll<HTMLElement>(
      'a, button, [role="tab"], input, textarea, select, [tabindex]:not([tabindex="-1"])'
    )
  )
    .filter((element) => {
      const style = getComputedStyle(element);
      if (style.display === "none" || style.visibility === "hidden") return false;
      if (insideHorizontalScrollRail(element)) return false;
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return false;
      return rect.left < -tolerance || rect.right > viewportWidth + tolerance;
    })
    .map((element) => element.id || element.className || element.tagName)
    .slice(0, 12);

  const headlineSelectors = [
    "main h1",
    "main h2",
    "main h3",
    ".headline",
    ".section-headline",
    ".hero-headline",
    ".thesis-headline"
  ];
  const clippedVisibleText = Array.from(
    document.querySelectorAll<HTMLElement>(headlineSelectors.join(","))
  )
    .filter((element) => {
      const style = getComputedStyle(element);
      if (style.display === "none" || style.visibility === "hidden") return false;
      if (!element.textContent?.trim()) return false;
      const overflows =
        element.scrollHeight > element.clientHeight + tolerance ||
        element.scrollWidth > element.clientWidth + tolerance;
      if (!overflows) return false;
      const clippedBySelf =
        style.overflow === "hidden" ||
        style.textOverflow === "ellipsis" ||
        style.webkitLineClamp !== "none";
      if (clippedBySelf) return true;
      let parent = element.parentElement;
      while (parent) {
        const parentStyle = getComputedStyle(parent);
        if (
          (parentStyle.overflow === "hidden" || parentStyle.overflowY === "hidden") &&
          (parent.scrollHeight > parent.clientHeight + tolerance ||
            parent.scrollWidth > parent.clientWidth + tolerance)
        ) {
          return true;
        }
        parent = parent.parentElement;
      }
      return false;
    })
    .map(elementLabel)
    .slice(0, 12);

  const bodyTextSelectors = [
    "main p.body-copy",
    "main p.section-body",
    "main p.thesis-body",
    "main li.body-copy",
    ".body-copy",
    ".section-body",
    ".thesis-body"
  ];
  const lowContrastText = Array.from(
    document.querySelectorAll<HTMLElement>(bodyTextSelectors.join(","))
  )
    .filter((element) => {
      const style = getComputedStyle(element);
      if (style.display === "none" || style.visibility === "hidden") return false;
      if (element.closest(".eyebrow, .sectionKicker, .kicker")) return false;
      if (!element.textContent?.trim()) return false;
      const background = effectiveBackground(element);
      if (!background) return false;
      const ratio = contrastRatio(style.color, background);
      if (ratio === undefined) return false;
      const fontSize = Number.parseFloat(style.fontSize) || 16;
      const fontWeight = Number.parseInt(style.fontWeight, 10) || 400;
      const largeText = fontSize >= 24 || (fontSize >= 18.66 && fontWeight >= 700);
      const minimum = largeText ? LARGE_TEXT_CONTRAST_MIN : BODY_TEXT_CONTRAST_MIN;
      return ratio < minimum;
    })
    .map(elementLabel)
    .slice(0, 12);

  const emptyMediaContainers = Array.from(document.querySelectorAll<HTMLElement>(".media"))
    .filter((figure) => {
      const style = getComputedStyle(figure);
      if (style.display === "none" || style.visibility === "hidden") return false;
      return !figure.querySelector("img") && !figure.querySelector(".media-fallback");
    })
    .map((figure) => figure.dataset.assetSection ?? figure.className.split(/\s+/)[1] ?? "media");

  return {
    horizontalOverflow: documentScrollWidth > documentClientWidth + tolerance,
    documentScrollWidth,
    documentClientWidth,
    sectionsOutsideViewport,
    clippedFocusTargets,
    clippedVisibleText,
    lowContrastText,
    emptyMediaContainers,
    brokenImages: [...document.images].filter(
      (image) => !image.complete || image.naturalWidth === 0
    ).length
  };
}

export function sectionVisualIntegrityPasses(
  metrics: SectionVisualIntegrityMetrics
): boolean {
  return (
    !metrics.horizontalOverflow &&
    metrics.sectionsOutsideViewport.length === 0 &&
    metrics.clippedFocusTargets.length === 0 &&
    metrics.clippedVisibleText.length === 0 &&
    metrics.lowContrastText.length === 0 &&
    metrics.emptyMediaContainers.length === 0 &&
    metrics.brokenImages === 0
  );
}
