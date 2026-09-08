import { describe, expect, it } from "vitest";
import { BRAND_ARCHETYPE_FIXTURES } from "../../../tests/fixtures/brand-fidelity/archetypes";
import { archetypeRuntimeFixture, compileRuntimeVisualFixture } from "../../../tests/e2e/three-family-runtime-fixture";

describe("brand fidelity runtime fixtures", () => {
  it.each(BRAND_ARCHETYPE_FIXTURES.flatMap((archetype) =>
    (["launch", "guide", "align"] as const).map((family) => ({ archetype, family, name: `${archetype.id} ${family}` }))
  ))("earns substantive cards for $name geometry checks", async ({ archetype, family }) => {
    const fixture = archetypeRuntimeFixture(archetype, family);
    const compiled = await compileRuntimeVisualFixture(fixture);
    const choices = compiled.page.sections.flatMap((section) => section.choices ?? []);
    expect(choices.length).toBeGreaterThanOrEqual(2);
    expect(choices.every((choice) => choice.body.trim() && choice.evidenceRefs.length && !choice.body.includes("?"))).toBe(true);
    expect(new Set(choices.map((choice) => choice.body)).size).toBe(choices.length);
    expect(compiled.html).toContain("<article>");
  });
});
