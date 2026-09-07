import { describe, expect, it } from "vitest";
import { assignRegisteredOutcome, summarizeRegisteredOutcomes, validateOutcomeRegistration } from "./build-flow-outcomes";

const registration = { experimentId: "exp-1", version: "v1", arms: [{ id: "a" }, { id: "b" }], randomizationUnit: "anonymous" as const, qualifiedActionDefinition: "clicked the existing CTA", registeredAt: "2026-01-01T00:00:00Z", startsAt: "2026-01-02T00:00:00Z", horizonEndsAt: "2026-02-01T00:00:00Z", minimumUnits: 1, exclusions: ["internal"] };
const exposure = (unitId: string, qualifiedAction = false) => ({ exposureId: `x-${unitId}`, experimentId: "exp-1", version: "v1", armId: assignRegisteredOutcome(registration, unitId).variantId, unitId, eligible: true, qualifiedAction, observedAt: "2026-01-03T00:00:00Z" });

describe("registered outcomes", () => {
  it("requires complete pre-registration", () => {
    expect(() => validateOutcomeRegistration({ ...registration, registeredAt: "bad" })).toThrow("dates");
    expect(() => validateOutcomeRegistration({ ...registration, startsAt: "2025-01-01T00:00:00Z" })).toThrow("date order");
    expect(() => validateOutcomeRegistration({ ...registration, randomizationUnit: "person" as never })).toThrow("randomization");
    expect(() => validateOutcomeRegistration({ ...registration, arms: [{ id: "a" }, { id: "a" }] })).toThrow("duplicate");
    expect(() => validateOutcomeRegistration({ ...registration, exclusions: ["x", "x"] })).toThrow("exclusions");
  });
  it("does not analyze or name a winner before the fixed horizon", () => {
    const result = summarizeRegisteredOutcomes(registration, [exposure("u1", true)], "2026-01-31T23:59:59Z");
    expect(result.state).toBe("incomplete"); expect(result.variants).toEqual([]); expect(result.winnerDeclared).toBe(false);
  });
  it("requires valid, sticky, one-unit exposures and applies declared exclusions", () => {
    const first = exposure("u1", true), duplicate = { ...first, exposureId: "a-later-visit" }, invalidArm = { ...exposure("u2"), armId: "unknown" }, excluded = { ...exposure("u3"), exclusionReasonCode: "internal" }, unknownExclusion = { ...exposure("u4"), exclusionReasonCode: "other" }, invalidDate = { ...exposure("u5"), observedAt: "not-a-date" };
    const result = summarizeRegisteredOutcomes(registration, [first, duplicate, invalidArm, excluded, unknownExclusion, invalidDate], "2026-02-02T00:00:00Z");
    expect(result.variants.reduce((sum, variant) => sum + variant.eligibleUnits, 0)).toBe(1); expect(result.deduplicatedRecords).toBe(1); expect(result.excludedRecords).toBe(1); expect(result.invalidRecords).toBe(3);
  });
  it("rejects conflicting duplicate unit records and reports insufficient sample with Wilson uncertainty", () => {
    const row = exposure("u1", true);
    expect(() => summarizeRegisteredOutcomes(registration, [row, { ...row, exposureId: "other", qualifiedAction: false }], "2026-02-02T00:00:00Z")).toThrow("conflicting");
    const result = summarizeRegisteredOutcomes({ ...registration, minimumUnits: 2 }, [row, exposure("u2")], "2026-02-02T00:00:00Z");
    expect(result.state).toBe("insufficient_sample"); expect(result.winnerDeclared).toBe(false); expect(result.variants[0]?.uncertainty).toHaveProperty("low");
  });
});
