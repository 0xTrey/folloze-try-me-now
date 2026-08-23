import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const manifestPath = resolve(
  process.cwd(),
  "docs/cursor-handoffs/2026-08-23-three-family-production-system/evidence/visual-evidence-manifest.json"
);

const expectedFamilies = {
  "adp-launch": "launch",
  "apple-guide": "guide",
  "servicetitan-align": "align"
};

function mutatedManifest(mutation = "current") {
  const fixtures = structuredClone(JSON.parse(readFileSync(manifestPath, "utf8")));
  const fixture = (id) => fixtures.find((candidate) => candidate.fixture === id);
  if (mutation === "family-threshold") fixture("apple-guide").family = "launch";
  if (mutation === "section-shape") fixture("adp-launch").sectionPlan.pop();
  if (mutation === "evidence-authority") fixture("servicetitan-align").familyEvidenceRefs = [];
  if (mutation === "sparse-asset") fixture("adp-launch").brokenImages = 1;
  if (mutation === "cta-semantics") fixture("adp-launch").buttonColor = "rgba(0, 0, 0, 0)";
  if (mutation === "copy-hierarchy") fixture("apple-guide").documentHeight = 1_500;
  return fixtures;
}

export function evaluateThreeFamilyArtifacts(mutation = "current") {
  const fixtures = mutatedManifest(mutation);
  const productionFixtures = fixtures.filter(({ outcome }) => outcome === "production-page");
  const recoveryFixture = fixtureState(fixtures, "brand-help-recovery");
  const blockers = [];
  const familyCoverage = new Set(productionFixtures.map(({ family }) => family));
  const expectedRouting = productionFixtures.every(
    ({ fixture, family }) => expectedFamilies[fixture] === family
  );
  const boundedSections = productionFixtures.every(
    ({ sectionPlan }) => sectionPlan.length >= 5 && sectionPlan.length <= 8
  );
  const uniqueSectionRoles = productionFixtures.every(({ sectionPlan }) => (
    new Set(sectionPlan.map(({ role }) => role)).size === sectionPlan.length
  ));
  const evidenceBound = productionFixtures.every(
    ({ familyEvidenceRefs }) => familyEvidenceRefs.length > 0
  );
  const noBrokenImages = productionFixtures.every(({ brokenImages }) => brokenImages === 0);
  const noOverflow = productionFixtures.every(({ horizontalOverflow }) => !horizontalOverflow);
  const usableCtas = productionFixtures.every(({ buttonColor, buttonRadius }) => (
    buttonColor !== "rgba(0, 0, 0, 0)" && buttonRadius !== ""
  ));
  const longForm = productionFixtures.every(({ documentHeight }) => documentHeight >= 4_000);
  const runtimeBacked = fixtures.every(
    ({ runtimePath }) => runtimePath === "session-production-engine"
  );
  const purposefulMedia = productionFixtures.every(
    ({ selectedImages }) =>
      selectedImages.length > 0 &&
      selectedImages.every(({ purpose, role }) => purpose && ["hero", "supporting"].includes(role))
  );
  const recoveryHonest = Boolean(
    recoveryFixture?.outcome === "brand_help_required" &&
    recoveryFixture.customerReadyHtml === false &&
    recoveryFixture.recoveryVisible === true
  );

  if (!expectedRouting) blockers.push("family_misroute");
  if (!boundedSections) blockers.push("invalid_section_count");
  if (!evidenceBound) blockers.push("ungrounded_family_decision");
  if (!noBrokenImages) blockers.push("broken_asset");
  if (!noOverflow) blockers.push("desktop_overflow");
  if (!usableCtas) blockers.push("invalid_cta_semantics");
  if (!runtimeBacked) blockers.push("non_runtime_fixture");
  if (!purposefulMedia) blockers.push("unpurposeful_fixture_media");
  if (!recoveryHonest) blockers.push("recovery_exposes_customer_html");

  const familySelection = [
    familyCoverage.size === 3 ? 10 : familyCoverage.size * 3,
    expectedRouting ? 5 : 0,
    boundedSections ? 5 : 0,
    uniqueSectionRoles ? 5 : 0
  ].reduce((sum, value) => sum + value, 0);

  const brandFidelity = [
    new Set(productionFixtures.map(({ brandTokens }) => JSON.stringify(brandTokens))).size >= 3 ? 8 : 0,
    noBrokenImages ? 7 : 0,
    productionFixtures.every(({ brandTokens }) => brandTokens.primary && brandTokens.action) ? 5 : 0,
    purposefulMedia && recoveryHonest ? 5 : 0
  ].reduce((sum, value) => sum + value, 0);

  const audienceRelevance = [
    fixtureState(fixtures, "servicetitan-align")?.subtype === "account" ? 8 : 0,
    fixtureState(fixtures, "apple-guide")?.subtype === "solution" ? 5 : 0,
    fixtureState(fixtures, "adp-launch")?.subtype === "product" ? 4 : 0,
    evidenceBound ? 4 : 0,
    uniqueSectionRoles ? 4 : 0
  ].reduce((sum, value) => sum + value, 0);

  const artifactIntegrity = [
    noOverflow ? 7 : 0,
    noBrokenImages ? 5 : 0,
    usableCtas ? 5 : 0,
    runtimeBacked && recoveryHonest ? 3 : 0,
    longForm ? 5 : 0
  ].reduce((sum, value) => sum + value, 0);

  const rubric = {
    familySelection,
    brandFidelity,
    audienceRelevance,
    artifactIntegrity
  };
  return {
    metric: "manifest_contract_score",
    disclaimer: "Contract/runtime integrity only; not a product-design or live-provider score.",
    mutation,
    manifestContractScore: Object.values(rubric).reduce((sum, value) => sum + value, 0),
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
