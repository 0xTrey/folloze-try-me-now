import { describe, expect, it } from "vitest";
import { BRAND_ARCHETYPE_FIXTURES } from "../../../tests/fixtures/brand-fidelity/archetypes";
import { archetypeRuntimeFixture, compileRuntimeVisualFixture } from "../../../tests/e2e/three-family-runtime-fixture";

describe("account-alignment runtime compatibility", () => {
  it.each(BRAND_ARCHETYPE_FIXTURES)("retains a coherent page for $id after bounding its headline", async (archetype) => {
    const result = await compileRuntimeVisualFixture(archetypeRuntimeFixture(archetype, "align"));
    expect(result.page.familyDecision).toMatchObject({ family: "align", locked: true });
    expect(result.page.sections.length).toBeGreaterThanOrEqual(4);
    expect(result.html).toContain("Archetype Company");
    expect(result.html).toContain("Target Company");
  });
});
