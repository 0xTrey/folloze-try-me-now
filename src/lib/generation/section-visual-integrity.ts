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
  repeatedSubstantiveImages: string[];
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

  type RgbaColor = {
    red: number;
    green: number;
    blue: number;
    alpha: number;
  };

  const clampUnit = (value: number): number => Math.min(1, Math.max(0, value));

  const parseUnitChannel = (token: string): number | undefined => {
    const trimmed = token.trim();
    if (!trimmed) return undefined;
    const percentage = trimmed.match(/^([+-]?(?:\d+(?:\.\d*)?|\.\d+))%$/);
    const value = percentage ? Number(percentage[1]) / 100 : Number(trimmed);
    return Number.isFinite(value) ? clampUnit(value) : undefined;
  };

  const parseRgbChannel = (token: string): number | undefined => {
    const trimmed = token.trim();
    if (!trimmed) return undefined;
    const percentage = trimmed.match(/^([+-]?(?:\d+(?:\.\d*)?|\.\d+))%$/);
    const value = percentage ? Number(percentage[1]) / 100 : Number(trimmed) / 255;
    return Number.isFinite(value) ? clampUnit(value) : undefined;
  };

  const parseCssColor = (color: string): RgbaColor | undefined => {
    const normalized = color.trim();
    if (normalized.toLowerCase() === "transparent") {
      return { red: 0, green: 0, blue: 0, alpha: 0 };
    }

    const hex = normalized.match(/^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
    if (hex) {
      const raw = hex[1];
      const expanded =
        raw.length <= 4
          ? raw
              .split("")
              .map((channel) => `${channel}${channel}`)
              .join("")
          : raw;
      return {
        red: Number.parseInt(expanded.slice(0, 2), 16) / 255,
        green: Number.parseInt(expanded.slice(2, 4), 16) / 255,
        blue: Number.parseInt(expanded.slice(4, 6), 16) / 255,
        alpha: expanded.length === 8 ? Number.parseInt(expanded.slice(6, 8), 16) / 255 : 1
      };
    }

    const srgb = normalized.match(/^color\(\s*srgb\s+(.+)\)$/i);
    if (srgb) {
      const [channelText, alphaText, ...extra] = srgb[1].split("/");
      if (extra.length > 0) return undefined;
      const channels = channelText.trim().split(/\s+/).map(parseUnitChannel);
      const alpha = alphaText === undefined ? 1 : parseUnitChannel(alphaText);
      if (channels.length !== 3 || channels.some((channel) => channel === undefined) || alpha === undefined) {
        return undefined;
      }
      return {
        red: channels[0] as number,
        green: channels[1] as number,
        blue: channels[2] as number,
        alpha
      };
    }

    const rgb = normalized.match(/^rgba?\((.+)\)$/i);
    if (!rgb) return undefined;
    const [channelText, slashAlphaText, ...extra] = rgb[1].split("/");
    if (extra.length > 0) return undefined;
    const commaSyntax = channelText.includes(",");
    const components = commaSyntax
      ? channelText.split(",").map((component) => component.trim())
      : channelText.trim().split(/\s+/);
    const legacyAlphaText = commaSyntax && components.length === 4 ? components.pop() : undefined;
    if (components.length !== 3 || (slashAlphaText !== undefined && legacyAlphaText !== undefined)) {
      return undefined;
    }
    const channels = components.map(parseRgbChannel);
    const alphaText = slashAlphaText ?? legacyAlphaText;
    const alpha = alphaText === undefined ? 1 : parseUnitChannel(alphaText);
    if (channels.some((channel) => channel === undefined) || alpha === undefined) return undefined;
    return {
      red: channels[0] as number,
      green: channels[1] as number,
      blue: channels[2] as number,
      alpha
    };
  };

  const compositeColors = (foreground: RgbaColor, background: RgbaColor): RgbaColor => {
    const alpha = foreground.alpha + background.alpha * (1 - foreground.alpha);
    if (alpha === 0) return { red: 0, green: 0, blue: 0, alpha: 0 };
    const compositeChannel = (foregroundChannel: number, backgroundChannel: number) =>
      (foregroundChannel * foreground.alpha +
        backgroundChannel * background.alpha * (1 - foreground.alpha)) /
      alpha;
    return {
      red: compositeChannel(foreground.red, background.red),
      green: compositeChannel(foreground.green, background.green),
      blue: compositeChannel(foreground.blue, background.blue),
      alpha
    };
  };

  const relativeLuminance = ({ red, green, blue }: RgbaColor): number => {
    const channel = (value: number) => {
      return value <= 0.04045
        ? value / 12.92
        : ((value + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue);
  };

  const contrastRatio = (foreground: string, background: RgbaColor): number | undefined => {
    const parsedForeground = parseCssColor(foreground);
    if (!parsedForeground || background.alpha < 1) return undefined;
    const renderedForeground = compositeColors(parsedForeground, background);
    const lighter = Math.max(
      relativeLuminance(renderedForeground),
      relativeLuminance(background)
    );
    const darker = Math.min(
      relativeLuminance(renderedForeground),
      relativeLuminance(background)
    );
    return (lighter + 0.05) / (darker + 0.05);
  };

  const effectiveBackground = (element: HTMLElement): RgbaColor | undefined => {
    let composedBackground: RgbaColor | undefined;
    let current: HTMLElement | null = element;
    while (current) {
      const style = getComputedStyle(current);
      const parsed = parseCssColor(style.backgroundColor);
      if (!parsed) return undefined;
      composedBackground = composedBackground
        ? compositeColors(composedBackground, parsed)
        : parsed;
      if (composedBackground.alpha >= 1) return composedBackground;
      current = current.parentElement;
    }
    return compositeColors(
      composedBackground ?? { red: 0, green: 0, blue: 0, alpha: 0 },
      { red: 1, green: 1, blue: 1, alpha: 1 }
    );
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
    ".thesis-body",
    ".urgency-section p,.urgency-section li,.urgency-section dd,.composition-evidence-lead .credibility-anchor p,.composition-chapter-journey .framework-starting-points p,.composition-chapter-journey .framework-starting-points li"
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
      if (!background) return true;
      const ratio = contrastRatio(style.color, background);
      if (ratio === undefined) return true;
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

  const substantiveImageCounts = new Map<string, number>();
  document.querySelectorAll<HTMLImageElement>(".media img").forEach((image) => {
    if (image.currentSrc) {
      substantiveImageCounts.set(image.currentSrc, (substantiveImageCounts.get(image.currentSrc) ?? 0) + 1);
    }
  });
  const repeatedSubstantiveImages = [...substantiveImageCounts]
    .filter(([, count]) => count > 1).map(([source]) => source).slice(0, 12);

  return {
    horizontalOverflow: documentScrollWidth > documentClientWidth + tolerance,
    documentScrollWidth,
    documentClientWidth,
    sectionsOutsideViewport,
    clippedFocusTargets,
    clippedVisibleText,
    lowContrastText,
    emptyMediaContainers,
    repeatedSubstantiveImages,
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
    metrics.repeatedSubstantiveImages.length === 0 &&
    metrics.emptyMediaContainers.length === 0 &&
    metrics.brokenImages === 0
  );
}
