import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
// @ts-expect-error The CLI is intentionally JavaScript for direct Node use.
import { analyzeOutcomeInput, runCli } from "./build-flow-outcomes.mjs";

const registration = {
  experimentId: "offline-exp",
  version: "v1",
  arms: [{ id: "control" }, { id: "variant" }],
  randomizationUnit: "anonymous",
  qualifiedActionDefinition: "used an existing CTA",
  registeredAt: "2026-01-01T00:00:00Z",
  startsAt: "2026-01-02T00:00:00Z",
  horizonEndsAt: "2026-02-01T00:00:00Z",
  minimumUnits: 1,
  exclusions: ["internal"]
};

const input = () => ({
  version: "build-flow-outcomes-input-v2",
  registration,
  exposures: [
    { exposureId: "exposure-1", experimentId: "offline-exp", version: "v1", armId: "variant", assignedArmId: "variant", unitId: "private-unit-1", eligible: true, qualifiedAction: true, observedAt: "2026-01-03T00:00:00Z" },
    { exposureId: "exposure-2", experimentId: "offline-exp", version: "v1", armId: "control", assignedArmId: "control", unitId: "private-unit-2", eligible: true, qualifiedAction: false, observedAt: "2026-01-03T00:00:00Z" }
  ]
});

describe("offline outcome CLI", () => {
  it("writes an immutable aggregate-only report in a temporary git repo", async () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), "build-flow-outcomes-"));
    try {
      execFileSync("git", ["init", "-q"], { cwd: temp });
      fs.writeFileSync(path.join(temp, "input.json"), JSON.stringify(input()));
      const script = path.resolve(process.cwd(), "scripts/build-flow-outcomes.mjs");
      execFileSync(process.execPath, [script, "--input", "input.json", "--output", "report.json", "--as-of", "2026-02-02T00:00:00Z"], { cwd: temp });
      const report = JSON.parse(fs.readFileSync(path.join(temp, "report.json"), "utf8"));
      expect(report).toMatchObject({ state: "complete", winnerDeclared: false, aggregate: { variants: expect.any(Array) } });
      expect(JSON.stringify(report)).not.toContain("private-unit");
      expect(JSON.stringify(report)).not.toContain("exposure-1");
      await expect(runCli(["--input", "input.json", "--output", "report.json", "--as-of", "2026-02-02T00:00:00Z"], temp)).rejects.toThrow();
      fs.symlinkSync("input.json", path.join(temp, "linked.json"));
      await expect(runCli(["--input", "linked.json", "--output", "other.json", "--as-of", "2026-02-02T00:00:00Z"], temp)).rejects.toThrow("symlink");
    } finally {
      fs.rmSync(temp, { recursive: true, force: true });
    }
  });

  it("rejects invalid fixed horizons and conflicting unit records", async () => {
    await expect(analyzeOutcomeInput({ ...input(), registration: { ...registration, horizonEndsAt: "2026-01-01T00:00:00Z" } }, "2026-02-02T00:00:00Z")).rejects.toThrow("date order");
    const conflicting = input();
    conflicting.exposures.push({ ...conflicting.exposures[0], exposureId: "exposure-conflict", qualifiedAction: false });
    await expect(analyzeOutcomeInput(conflicting, "2026-02-02T00:00:00Z")).rejects.toThrow("conflicting duplicate unit");
  });

  it("keeps a fixed horizon incomplete rather than naming a winner", async () => {
    const report = await analyzeOutcomeInput(input(), "2026-01-31T23:59:59Z");
    expect(report).toMatchObject({ state: "incomplete", winnerDeclared: false, aggregate: { variants: [] } });
  });
});
