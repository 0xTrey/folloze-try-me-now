import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const manifestPath = resolve(
  process.cwd(),
  "docs/cursor-handoffs/2026-08-23-three-family-production-system/evidence/visual-evidence-manifest.json"
);

const expectedFamilies = {
  apple: "guide",
  adp: "launch",
  servicetitan: "align",
  "no-logo-recovery": "launch"
};

function mutatedManifest(mutation = "current") {
  const fixtures = structuredClone(JSON.parse(readFileSync(manifestPath, "utf8")));
  const fixture = (id) => fixtures.find((candidate) => candidate.fixture === id);
  if (mutation === "family-threshold") fixture("apple").family = "launch";
  if (mutation === "section-shape") fixture("adp").sectionPlan.pop();
  if (mutation === "evidence-authority") fixture("servicetitan").familyEvidenceRefs = [];
  if (mutation === "sparse-asset") fixture("no-logo-recovery").brokenImages = 1;
  if (mutation === "cta-semantics") fixture("adp").buttonColor = "rgba(0, 0, 0, 0)";
  if (mutation === "copy-hierarchy") fixture("apple").documentHeight = 1_500;
  return fixtures;
}

export function evaluateThreeFamilyArtifacts(mutation = "current") {
  const fixtures = mutatedManifest(mutation);
  const blockers = [];
  const familyCoverage = new Set(fixtures.map(({ family }) => family));
  const expectedRouting = fixtures.every(
    ({ fixture, family }) => expectedFamilies[fixture] === family
  );
  const boundedSections = fixtures.every(
    ({ sectionPlan }) => sectionPlan.length >= 5 && sectionPlan.length <= 8
  );
  const uniqueSectionRoles = fixtures.every(({ sectionPlan }) => (
    new Set(sectionPlan.map(({ role }) => role)).size === sectionPlan.length
  ));
  const evidenceBound = fixtures.every(({ familyEvidenceRefs }) => familyEvidenceRefs.length > 0);
  const noBrokenImages = fixtures.every(({ brokenImages }) => brokenImages === 0);
  const noOverflow = fixtures.every(({ horizontalOverflow }) => !horizontalOverflow);
  const usableCtas = fixtures.every(({ buttonColor, buttonRadius }) => (
    buttonColor !== "rgba(0, 0, 0, 0)" && buttonRadius !== ""
  ));
  const longForm = fixtures.every(({ documentHeight }) => documentHeight >= 4_000);

  if (!expectedRouting) blockers.push("family_misroute");
  if (!boundedSections) blockers.push("invalid_section_count");
  if (!evidenceBound) blockers.push("ungrounded_family_decision");
  if (!noBrokenImages) blockers.push("broken_asset");
  if (!noOverflow) blockers.push("desktop_overflow");
  if (!usableCtas) blockers.push("invalid_cta_semantics");

  const familySelection = [
    familyCoverage.size === 3 ? 10 : familyCoverage.size * 3,
    expectedRouting ? 5 : 0,
    boundedSections ? 5 : 0,
    uniqueSectionRoles ? 5 : 0
  ].reduce((sum, value) => sum + value, 0);

  const brandFidelity = [
    new Set(fixtures.map(({ brandTokens }) => JSON.stringify(brandTokens))).size >= 3 ? 8 : 0,
    noBrokenImages ? 7 : 0,
    fixtures.every(({ brandTokens }) => brandTokens.primary && brandTokens.action) ? 5 : 0,
    fixtureState(fixtures, "no-logo-recovery")?.logoImageVisible === false ? 5 : 0
  ].reduce((sum, value) => sum + value, 0);

  const audienceRelevance = [
    fixtureState(fixtures, "servicetitan")?.subtype === "account" ? 8 : 0,
    fixtureState(fixtures, "apple")?.subtype === "industry" ? 5 : 0,
    fixtureState(fixtures, "adp")?.subtype === "product" ? 4 : 0,
    evidenceBound ? 4 : 0,
    uniqueSectionRoles ? 4 : 0
  ].reduce((sum, value) => sum + value, 0);

  const artifactIntegrity = [
    noOverflow ? 7 : 0,
    noBrokenImages ? 5 : 0,
    usableCtas ? 5 : 0,
    fixtures.length === 4 ? 3 : 0,
    longForm ? 5 : 0
  ].reduce((sum, value) => sum + value, 0);

  const rubric = {
    familySelection,
    brandFidelity,
    audienceRelevance,
    artifactIntegrity
  };
  return {
    target: "custom",
    mutation,
    score: Object.values(rubric).reduce((sum, value) => sum + value, 0),
    rubric,
    blockers,
    passed: blockers.length === 0,
    fixtureCount: fixtures.length
  };
}

function fixtureState(fixtures, id) {
  return fixtures.find(({ fixture }) => fixture === id);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const mutation = process.argv[2] ?? "current";
  process.stdout.write(`${JSON.stringify(evaluateThreeFamilyArtifacts(mutation), null, 2)}\n`);
}
