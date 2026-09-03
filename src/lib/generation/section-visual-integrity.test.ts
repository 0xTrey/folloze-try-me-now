import { afterEach, describe, expect, it, vi } from "vitest";

import {
  collectSectionVisualIntegrityMetrics,
  sectionVisualIntegrityPasses,
  type SectionVisualIntegrityMetrics
} from "@/lib/generation/section-visual-integrity";

const cleanMetrics: SectionVisualIntegrityMetrics = {
  horizontalOverflow: false,
  documentScrollWidth: 1440,
  documentClientWidth: 1440,
  sectionsOutsideViewport: [],
  clippedFocusTargets: [],
  clippedVisibleText: [],
  lowContrastText: [],
  repeatedSubstantiveImages: [],
  emptyMediaContainers: [],
  brokenImages: 0
};

const collectLowContrastText = ({
  color,
  backgroundColor = "transparent",
  parentBackgroundColor
}: {
  color: string;
  backgroundColor?: string;
  parentBackgroundColor: string;
}): string[] => {
  const body = {
    parentElement: null
  } as unknown as HTMLElement;
  const text = {
    id: "target-copy",
    className: "body-copy",
    tagName: "P",
    parentElement: body,
    textContent: "Visible body copy",
    closest: () => null
  } as unknown as HTMLElement;

  vi.stubGlobal("window", { innerWidth: 1440 });
  vi.stubGlobal("document", {
    documentElement: { scrollWidth: 1440, clientWidth: 1440 },
    body,
    images: [],
    querySelectorAll: (selector: string) =>
      selector.includes("main p.body-copy") ? [text] : []
  });
  vi.stubGlobal("getComputedStyle", (element: HTMLElement) => ({
    display: "block",
    visibility: "visible",
    color,
    backgroundColor: element === text ? backgroundColor : parentBackgroundColor,
    fontSize: "16px",
    fontWeight: "400"
  }));

  return collectSectionVisualIntegrityMetrics().lowContrastText;
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("sectionVisualIntegrityPasses", () => {
  it("accepts a clean layout receipt", () => {
    expect(sectionVisualIntegrityPasses(cleanMetrics)).toBe(true);
  });

  it("rejects horizontal overflow or empty media containers", () => {
    expect(
      sectionVisualIntegrityPasses({
        ...cleanMetrics,
        horizontalOverflow: true,
        documentScrollWidth: 1500
      })
    ).toBe(false);
    expect(sectionVisualIntegrityPasses({ ...cleanMetrics, repeatedSubstantiveImages: ["hero.png"] })).toBe(false);
    expect(
      sectionVisualIntegrityPasses({
        ...cleanMetrics,
        emptyMediaContainers: ["hero"]
      })
    ).toBe(false);
  });

  it("rejects broken images, clipped headlines, and low-contrast body text", () => {
    expect(
      sectionVisualIntegrityPasses({
        ...cleanMetrics,
        brokenImages: 2
      })
    ).toBe(false);
    expect(
      sectionVisualIntegrityPasses({
        ...cleanMetrics,
        clippedVisibleText: ["hero-headline"]
      })
    ).toBe(false);
    expect(
      sectionVisualIntegrityPasses({
        ...cleanMetrics,
        lowContrastText: ["thesis-body"]
      })
    ).toBe(false);
  });
});

describe("collectSectionVisualIntegrityMetrics color contrast", () => {
  it("evaluates Chromium color(srgb ...) text and background values", () => {
    expect(
      collectLowContrastText({
        color: "color(srgb 1 1 1)",
        parentBackgroundColor: "color(srgb 0.0955294 0.164824 0.263294)"
      })
    ).toEqual([]);
  });

  it("composites translucent foreground and background colors before evaluating contrast", () => {
    expect(
      collectLowContrastText({
        color: "color(srgb 1 1 1 / 0.4)",
        parentBackgroundColor: "color(srgb 0 0 0)"
      })
    ).toEqual(["target-copy"]);
    expect(
      collectLowContrastText({
        color: "color(srgb 0 0 0)",
        backgroundColor: "color(srgb 1 1 1 / 0.4)",
        parentBackgroundColor: "color(srgb 0 0 0)"
      })
    ).toEqual(["target-copy"]);
  });

  it("fails closed when a visible text color cannot be evaluated", () => {
    expect(
      collectLowContrastText({
        color: "unparseable-color",
        parentBackgroundColor: "color(srgb 1 1 1)"
      })
    ).toEqual(["target-copy"]);
    expect(
      collectLowContrastText({
        color: "color(srgb 0 0 0)",
        parentBackgroundColor: "unparseable-color"
      })
    ).toEqual(["target-copy"]);
  });
});
