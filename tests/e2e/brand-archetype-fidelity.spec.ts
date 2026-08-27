/**
 * Measures the rendered page against the brand decisions that produced it.
 *
 * Every fixture is an archetype — a shape of evidence, not a company — and
 * every family is exercised against every archetype, so a pass means the
 * compiler and renderer agree for a class of brands rather than for one site
 * that happened to be tuned. Assertions read the computed DOM, because a token
 * that is emitted but never applied is not fidelity.
 */

import { expect, test } from "@playwright/test";

import type { WireframeFamilyV2 } from "../../src/lib/generation/three-family-contract";
import { BRAND_ARCHETYPE_FIXTURES } from "../fixtures/brand-fidelity/archetypes";
import {
  archetypeRuntimeFixture,
  compileRuntimeVisualFixture,
  fulfillRuntimeAssets
} from "./three-family-runtime-fixture";

const FAMILIES: readonly WireframeFamilyV2[] = ["launch", "guide", "align"];

/** The two desktop widths the experience is designed to hold its shape at. */
const DESKTOP_WIDTHS = [1280, 1440] as const;

/** Radii are rounded through layout, and a pill clamps to half the height. */
const RADIUS_TOLERANCE_PX = 2;

function px(value: string): number {
  return Number.parseFloat(value) || 0;
}

function rgbChannels(value: string): [number, number, number] {
  const channels = value.match(/\d+(?:\.\d+)?/g)?.slice(0, 3).map(Number) ?? [0, 0, 0];
  return [channels[0] ?? 0, channels[1] ?? 0, channels[2] ?? 0];
}

function hexChannels(value: string): [number, number, number] {
  const hex = value.replace("#", "");
  const full = hex.length === 3 ? [...hex].map((part) => part + part).join("") : hex;
  return [
    Number.parseInt(full.slice(0, 2), 16),
    Number.parseInt(full.slice(2, 4), 16),
    Number.parseInt(full.slice(4, 6), 16)
  ];
}

/** Channel distance, so a rendered colour can be compared without exact string equality. */
function colorDistance(rendered: string, compiled: string): number {
  const [r1, g1, b1] = rgbChannels(rendered);
  const [r2, g2, b2] = hexChannels(compiled);
  return Math.max(Math.abs(r1 - r2), Math.abs(g1 - g2), Math.abs(b1 - b2));
}

for (const archetype of BRAND_ARCHETYPE_FIXTURES) {
  for (const family of FAMILIES) {
    for (const width of DESKTOP_WIDTHS) {
    test(`${archetype.id} renders ${family} faithfully to its compiled brand at ${width}px`, async ({ page }) => {
      const fixture = archetypeRuntimeFixture(archetype, family);
      const { semantics } = fixture;
      const compiled = await compileRuntimeVisualFixture(fixture);

      expect(compiled.page.familyDecision).toMatchObject({ family, locked: true });

      await page.setViewportSize({ width, height: 1000 });
      await page.emulateMedia({ reducedMotion: "reduce" });
      await fulfillRuntimeAssets(page);
      await page.setContent(compiled.html, { waitUntil: "domcontentloaded" });
      await expect(page.locator("h1")).toBeVisible();

      const measured = await page.evaluate(() => {
        const button = document.querySelector<HTMLElement>(".primary");
        const card = document.querySelector<HTMLElement>(
          ".lens-card, .role-card, .step-card, .proof-card, article"
        );
        const heading = document.querySelector<HTMLElement>("h1");
        const body = document.body;
        const buttonStyle = button ? getComputedStyle(button) : undefined;
        const cardStyle = card ? getComputedStyle(card) : undefined;
        const headingStyle = heading ? getComputedStyle(heading) : undefined;
        const bodyStyle = getComputedStyle(body);
        return {
          measuredButton: Boolean(button),
          measuredCard: Boolean(card),
          measuredHeading: Boolean(heading),
          buttonRadius: buttonStyle?.borderTopLeftRadius ?? "0px",
          buttonHeight: button?.getBoundingClientRect().height ?? 0,
          buttonBackground: buttonStyle?.backgroundColor ?? "rgb(0, 0, 0)",
          cardRadius: cardStyle?.borderTopLeftRadius,
          cardBorderWidth: cardStyle?.borderTopWidth,
          cardShadow: cardStyle?.boxShadow ?? "none",
          headingFamily: headingStyle?.fontFamily ?? "",
          headingWeight: Number.parseInt(headingStyle?.fontWeight ?? "400", 10),
          bodyFamily: bodyStyle.fontFamily,
          bodyColor: bodyStyle.color,
          surface: bodyStyle.backgroundColor,
          imageSources: [...document.querySelectorAll<HTMLImageElement>(
            "figure[data-asset-role] img"
          )].map((image) => image.getAttribute("src") ?? ""),
          designedTreatments: document.querySelectorAll(
            "figure[data-asset-role].no-asset-treatment"
          ).length,
          sectionCount: document.querySelectorAll("[data-journey-section]").length,
          documentWidth: document.documentElement.scrollWidth,
          viewportWidth: document.documentElement.clientWidth,
          // Widest element that nothing scrolls or clips. A tab strip is
          // allowed to scroll sideways; a section is not allowed to hang off
          // the edge of the page.
          widestElement: Math.max(
            0,
            ...[...document.querySelectorAll<HTMLElement>("body *")]
              .filter((element) => {
                for (
                  let parent = element.parentElement;
                  parent;
                  parent = parent.parentElement
                ) {
                  if (getComputedStyle(parent).overflowX !== "visible") return false;
                }
                return true;
              })
              .map((element) => element.getBoundingClientRect().right)
          ),
          placedSections: [...document.querySelectorAll<HTMLElement>(
            "figure[data-asset-section] img"
          )].map((image) => [
            image.closest("figure")?.getAttribute("data-asset-section") ?? "",
            image.getAttribute("src") ?? ""
          ])
        };
      });

      expect(measured.measuredButton).toBe(true);
      expect(measured.measuredCard).toBe(true);
      expect(measured.measuredHeading).toBe(true);

      // Geometry. A pill radius is expressed as a very large value upstream and
      // resolves to half the control height once laid out, so both readings are
      // accepted for the same decision.
      const compiledButtonRadius = semantics.geometry.buttonRadius.value;
      const renderedButtonRadius = px(measured.buttonRadius);
      if (compiledButtonRadius >= 100) {
        expect(renderedButtonRadius).toBeGreaterThanOrEqual(
          Math.min(compiledButtonRadius, measured.buttonHeight / 2) - RADIUS_TOLERANCE_PX
        );
      } else {
        expect(Math.abs(renderedButtonRadius - compiledButtonRadius))
          .toBeLessThanOrEqual(RADIUS_TOLERANCE_PX);
      }
      if (measured.cardRadius !== undefined) {
        expect(px(measured.cardRadius)).toBeLessThanOrEqual(
          Math.max(semantics.geometry.cardRadius.value, 4) + RADIUS_TOLERANCE_PX
        );
      }
      if (measured.cardBorderWidth !== undefined && semantics.geometry.borderWidth.value === 0) {
        expect(px(measured.cardBorderWidth)).toBeLessThanOrEqual(1);
      }
      if (semantics.geometry.shadowCharacter.value === "none") {
        expect(measured.cardShadow === "none" || measured.cardShadow.includes("0px 0px 0px"))
          .toBe(true);
      }

      // Typography.
      expect(measured.headingFamily.toLowerCase()).toContain(
        semantics.typography.headingFont.value.split(",")[0]!.trim().toLowerCase()
      );
      expect(measured.bodyFamily.toLowerCase()).toContain(
        semantics.typography.bodyFont.value.split(",")[0]!.trim().toLowerCase()
      );
      if (semantics.typography.weightCharacter.value === "bold") {
        expect(measured.headingWeight).toBeGreaterThanOrEqual(600);
      }

      // Semantic colour roles reach the elements that carry them.
      expect(colorDistance(measured.buttonBackground, semantics.colors.ctaBackground.value))
        .toBeLessThanOrEqual(24);
      expect(colorDistance(measured.bodyColor, semantics.colors.text.value))
        .toBeLessThanOrEqual(40);

      // Substantive imagery is used at most once, and an unfilled slot carries a
      // designed treatment rather than a repeat.
      const substantive = measured.imageSources.filter(Boolean);
      expect(new Set(substantive).size).toBe(substantive.length);
      if (!substantive.length) expect(measured.designedTreatments).toBeGreaterThan(0);
      expect(measured.sectionCount).toBeGreaterThanOrEqual(4);

      // The page holds its shape: nothing is pushed off the side at either width.
      expect(measured.documentWidth).toBeLessThanOrEqual(measured.viewportWidth + 1);
      expect(measured.widestElement).toBeLessThanOrEqual(measured.viewportWidth + 1);

      // Each rendered image sits in the section the plan compiled it for.
      const planned = new Map(
        compiled.assetPlan?.placements.map(({ sectionId, assetRef }) => [sectionId, assetRef])
          ?? []
      );
      for (const [sectionId, source] of measured.placedSections) {
        expect(planned.has(sectionId)).toBe(true);
        expect(source).toContain(planned.get(sectionId)!.split("/").pop()!);
      }

      // Incomplete or contradictory evidence still renders. The compiler says
      // so in its warnings instead of inventing a confident answer, and the
      // page keeps its designed fallbacks either way.
      if (archetype.expectation.expectsWarnings) {
        expect(semantics.warnings.length).toBeGreaterThan(0);
      }
      expect(semantics.score).toBeGreaterThan(0);
    });
    }
  }
}
