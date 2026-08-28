import { describe, expect, it } from "vitest";

import {
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
  emptyMediaContainers: [],
  brokenImages: 0
};

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
