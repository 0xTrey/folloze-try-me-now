import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import { buildPublicPayload } from "../src/contract.mjs";

const fixture = JSON.parse(await fs.readFile(new URL("./fixtures/rich-harvest.json", import.meta.url), "utf8"));

test("returns legacy profile, compact design DNA, and a ready fidelity receipt", () => {
  const result = buildPublicPayload(fixture, {
    domain: "example.com",
    sourceUrl: "https://www.example.com/product?campaign=secret#section",
    requestId: "receipt-1",
    durationMs: 12_345
  });
  assert.equal(result.designDna.schemaVersion, "brand-design-dna.v1");
  assert.equal(result.profile.companyName, "Acme");
  assert.equal(result.profile.primaryColor, "#101820");
  assert.equal(result.profile.accentColor, "#00A7E1");
  assert.equal(result.profile.surfaceColor, "#FFFFFF");
  assert.equal(result.profile.sourceUrl, "https://www.example.com/product");
  assert.equal(result.receipt.readiness.designReady, true);
  assert.equal(result.receipt.readiness.score, 100);
  assert.equal(result.receipt.readiness.evidence.excludedSignalCount, 3);
  assert.equal(result.designDna.evidence.screenshots.desktop.sha256, "a".repeat(64));
  assert.ok(Buffer.byteLength(JSON.stringify(result)) < 16_000, "public payload should remain compact");
});

test("never returns raw page copy, selectors, screenshot paths, query strings, or asset alt text", () => {
  const serialized = JSON.stringify(buildPublicPayload(fixture, {
    domain: "example.com",
    sourceUrl: "https://www.example.com/product?campaign=secret#section",
    requestId: "receipt-2",
    durationMs: 100
  }));
  for (const forbidden of [
    "THIS BODY COPY", "Private headline", "Private paragraph", "Private CTA", "Private image caption",
    "PRIVATE", ".private-hero", "/tmp/private", "campaign=secret", "cache=123", "width=1600", "token=secret"
  ]) assert.equal(serialized.includes(forbidden), false, forbidden);
});

test("fails closed when rendered design evidence is incomplete", () => {
  const incomplete = structuredClone(fixture);
  incomplete.mobile.status = "failed";
  incomplete.desktop.buttons = [];
  incomplete.desktop.layouts = [];
  incomplete.screenshots.desktop = undefined;
  incomplete.screenshots.mobile = undefined;
  const result = buildPublicPayload(incomplete, {
    domain: "example.com",
    sourceUrl: "https://example.com",
    requestId: "receipt-3",
    durationMs: 500
  });
  assert.equal(result.receipt.readiness.designReady, false);
  assert.ok(result.receipt.readiness.missing.includes("button_geometry"));
  assert.ok(result.receipt.readiness.missing.includes("layout_geometry"));
  assert.ok(result.receipt.readiness.missing.includes("screenshot_evidence"));
});

test("does not declare design ready when computed typography is absent", () => {
  const incomplete = structuredClone(fixture);
  incomplete.desktop.typography = [];
  const result = buildPublicPayload(incomplete, {
    domain: "example.com",
    sourceUrl: "https://example.com",
    requestId: "receipt-4",
    durationMs: 500
  });
  assert.equal(result.receipt.readiness.designReady, false);
  assert.ok(result.receipt.readiness.missing.includes("computed_typography"));
});
