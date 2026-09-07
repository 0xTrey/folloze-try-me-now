import { assignStickyVariant } from "./buyer-journey-evaluation";

export type OutcomeArm = { id: string; label?: string };
export type OutcomeExposure = { exposureId: string; experimentId: string; version: string; armId: string; unitId: string; eligible: boolean; qualifiedAction: boolean; observedAt: string; assignedArmId?: string; exclusionReasonCode?: string };
export type OutcomeRegistration = { experimentId: string; version: string; arms: readonly OutcomeArm[]; randomizationUnit: "anonymous" | "session"; qualifiedActionDefinition: string; registeredAt: string; startsAt: string; horizonEndsAt: string; minimumUnits: number; exclusions: readonly string[] };

const MAX_EXPOSURES = 100_000;
const validText = (value: unknown, max = 200) => typeof value === "string" && value.trim().length > 0 && value.length <= max;
const validDate = (value: unknown) => typeof value === "string" && validText(value, 64) && Number.isFinite(Date.parse(value));
function wilson(successes: number, total: number) { if (total === 0) return { rate: 0, low: 0, high: 0 }; const z = 1.96, p = successes / total, d = 1 + z * z / total, centre = (p + z * z / (2 * total)) / d, spread = z * Math.sqrt(p * (1 - p) / total + z * z / (4 * total * total)) / d; return { rate: p, low: Math.max(0, centre - spread), high: Math.min(1, centre + spread) }; }

export function validateOutcomeRegistration(r: OutcomeRegistration): void {
  if (!r || !validText(r.experimentId) || !validText(r.version) || !validText(r.qualifiedActionDefinition, 1_000)) throw new Error("invalid outcome registration identifiers");
  if (r.randomizationUnit !== "anonymous" && r.randomizationUnit !== "session") throw new Error("invalid randomization unit");
  if (!Array.isArray(r.arms) || r.arms.length < 2 || r.arms.length > 20 || r.arms.some((a) => !validText(a?.id) || (a.label !== undefined && !validText(a.label)))) throw new Error("invalid outcome arms");
  if (new Set(r.arms.map((a) => a.id)).size !== r.arms.length) throw new Error("duplicate outcome arm");
  if (!validDate(r.registeredAt) || !validDate(r.startsAt) || !validDate(r.horizonEndsAt)) throw new Error("invalid outcome dates");
  const registered = Date.parse(r.registeredAt), start = Date.parse(r.startsAt), end = Date.parse(r.horizonEndsAt);
  if (registered > start || start >= end) throw new Error("invalid outcome date order");
  if (!Number.isInteger(r.minimumUnits) || r.minimumUnits < 1 || r.minimumUnits > 1_000_000) throw new Error("invalid minimum units");
  if (!Array.isArray(r.exclusions) || r.exclusions.length > 100 || r.exclusions.some((code) => !validText(code, 100)) || new Set(r.exclusions).size !== r.exclusions.length) throw new Error("invalid exclusions");
}

export function assignRegisteredOutcome(r: OutcomeRegistration, unitId: string) { validateOutcomeRegistration(r); if (!validText(unitId)) throw new Error("invalid randomization unit id"); return assignStickyVariant(r.experimentId, unitId, r.version, r.arms); }

export function summarizeRegisteredOutcomes(r: OutcomeRegistration, exposures: readonly OutcomeExposure[], now: Date | string = new Date()) {
  validateOutcomeRegistration(r); if (!Array.isArray(exposures) || exposures.length > MAX_EXPOSURES) throw new Error("invalid exposure volume");
  const analysisAt = typeof now === "string" ? Date.parse(now) : now.getTime(); if (!Number.isFinite(analysisAt)) throw new Error("invalid analysis time");
  const end = Date.parse(r.horizonEndsAt), base = { version: "build-flow-outcomes-v2", registration: r, winner: undefined as string | undefined, winnerDeclared: false, limitations: ["Descriptive only; no causal claim or production decision."] };
  if (analysisAt < end) return { ...base, state: "incomplete" as const, variants: [], invalidRecords: 0, excludedRecords: 0, deduplicatedRecords: 0, limitations: [...base.limitations, "Fixed horizon has not ended. No result or winner is available."] };
  const arms = new Set(r.arms.map((a) => a.id)), byUnit = new Map<string, OutcomeExposure>(); let invalidRecords = 0, excludedRecords = 0, deduplicatedRecords = 0;
  for (const e of exposures) {
    const observed = Date.parse(e?.observedAt ?? ""), valid = validText(e?.exposureId) && validText(e?.unitId) && e.experimentId === r.experimentId && e.version === r.version && arms.has(e.armId) && typeof e.eligible === "boolean" && typeof e.qualifiedAction === "boolean" && Number.isFinite(observed) && observed >= Date.parse(r.startsAt) && observed <= end;
    if (!valid) { invalidRecords++; continue; }
    if (e.exclusionReasonCode !== undefined) { if (!r.exclusions.includes(e.exclusionReasonCode)) { invalidRecords++; continue; } excludedRecords++; continue; }
    const assigned = assignRegisteredOutcome(r, e.unitId).variantId;
    if ((e.assignedArmId !== undefined && e.assignedArmId !== assigned) || e.armId !== assigned) { invalidRecords++; continue; }
    const prior = byUnit.get(e.unitId); if (prior) { if (prior.armId !== e.armId || prior.qualifiedAction !== e.qualifiedAction || prior.eligible !== e.eligible) throw new Error("conflicting duplicate unit record"); deduplicatedRecords++; continue; } byUnit.set(e.unitId, e);
  }
  const variants = r.arms.map((arm) => { const rows = [...byUnit.values()].filter((e) => e.armId === arm.id && e.eligible), successes = rows.filter((e) => e.qualifiedAction).length; return { armId: arm.id, eligibleUnits: rows.length, qualifiedActions: successes, uncertainty: wilson(successes, rows.length) }; });
  const enough = variants.every((v) => v.eligibleUnits >= r.minimumUnits);
  return { ...base, state: enough ? "complete" as const : "insufficient_sample" as const, variants, invalidRecords, excludedRecords, deduplicatedRecords, limitations: enough ? base.limitations : [...base.limitations, "Minimum eligible units have not been reached in every arm. No winner is available."] };
}
