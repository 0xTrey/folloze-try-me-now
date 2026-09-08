/**
 * This is deliberately a build-only reader. Production defaults to no rules;
 * callers must supply a separately validated, versioned artifact from a trusted ledger.
 */
import productionRegistry from "./approved-build-learning-registry.json" with { type: "json" };

export const APPROVED_BUILD_LEARNING_VERSION = "build-flow-learning-v2";
const MAX_RULES = 100;
const MAX_TRUSTED_ENTRIES = 500;

export type TrustedLearningEntry = { brandScope: string; offerScope: string; evidenceDigest: string; evidenceVersion: string; sourceBuild: string; sourceVersion: string; artifactVersion: string };
export type ApprovedBuildLearningRule = { id: string; approval: { reviewer: string; approvedAt: string }; sourceBuild: string; sourceVersion: string; brandScope: string; offerScope: string; evidenceDigest: string; evidenceVersion: string; evidenceRefs: readonly string[]; beforeText: string; afterText: string; reason: string };
export type ApprovedBuildLearningArtifact = { version: typeof APPROVED_BUILD_LEARNING_VERSION; trustedCallerLedgerVersion: string; rules: readonly ApprovedBuildLearningRule[] };
export type BuildLearningScope = { brandScope: string; offerScope: string; evidenceDigest: string; evidenceVersion: string; trustedCallerLedgerVersion: string; trustedEntries: readonly TrustedLearningEntry[] };
export type ApprovedBuildLearningHint = Pick<ApprovedBuildLearningRule, "id" | "evidenceRefs" | "beforeText" | "afterText" | "reason"> & { source: "reviewed-feedback-untrusted" };
export type ProductionBuildLearningContextInput = Pick<
  BuildLearningScope,
  "brandScope" | "offerScope" | "evidenceDigest" | "evidenceVersion"
>;

const boundedText = (value: unknown, max = 8_000): value is string =>
  typeof value === "string" && value.trim().length > 0 && value.length <= max;
const validTrustedEntry = (entry: unknown): entry is TrustedLearningEntry => {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return false;
  const value = entry as Record<string, unknown>;
  return ["brandScope", "offerScope", "evidenceDigest", "evidenceVersion", "sourceBuild", "sourceVersion", "artifactVersion"]
    .every((key) => boundedText(value[key], 200));
};
const unsafeSourceText = (rule: ApprovedBuildLearningRule) => /<script|javascript:|ignore\s+(all\s+)?previous|system\s+prompt|api[ _-]?key/i.test(`${rule.beforeText}\n${rule.afterText}\n${rule.reason}`);

/**
 * The only production source of reviewed-learning rules is this static JSON
 * registry. It is intentionally versioned in Git and never reads a session,
 * environment variable, or arbitrary disk path. Any malformed registry is an
 * empty context, so feedback cannot activate by accident.
 */
export function productionBuildLearningContext(
  input: ProductionBuildLearningContextInput
): { artifact?: ApprovedBuildLearningArtifact; scope?: BuildLearningScope } {
  const registry = productionRegistry as unknown;
  if (
    !registry ||
    typeof registry !== "object" ||
    Array.isArray(registry)
  ) return {};
  const value = registry as Record<string, unknown>;
  if (
    value.version !== APPROVED_BUILD_LEARNING_VERSION ||
    !boundedText(value.trustedCallerLedgerVersion, 200) ||
    !Array.isArray(value.rules) ||
    value.rules.length > MAX_RULES ||
    !Array.isArray(value.trustedEntries) ||
    value.trustedEntries.length > MAX_TRUSTED_ENTRIES ||
    !value.trustedEntries.every(validTrustedEntry) ||
    ![input.brandScope, input.offerScope, input.evidenceDigest, input.evidenceVersion]
      .every((item) => boundedText(item, 200))
  ) return {};
  return {
    artifact: {
      version: APPROVED_BUILD_LEARNING_VERSION,
      trustedCallerLedgerVersion: value.trustedCallerLedgerVersion,
      rules: value.rules as readonly ApprovedBuildLearningRule[]
    },
    scope: {
      brandScope: input.brandScope,
      offerScope: input.offerScope,
      evidenceDigest: input.evidenceDigest,
      evidenceVersion: input.evidenceVersion,
      trustedCallerLedgerVersion: value.trustedCallerLedgerVersion,
      trustedEntries: value.trustedEntries as readonly TrustedLearningEntry[]
    }
  };
}

/** Static registry projection retained for read-only diagnostics. */
export const PRODUCTION_APPROVED_BUILD_LEARNING: readonly ApprovedBuildLearningRule[] =
  productionBuildLearningContext({
    brandScope: "production",
    offerScope: "production",
    evidenceDigest: "production",
    evidenceVersion: "production"
  }).artifact?.rules ?? [];

export function selectApprovedBuildLearning(artifact: ApprovedBuildLearningArtifact | undefined, scope: BuildLearningScope): readonly ApprovedBuildLearningRule[] {
  if (!scope || ![scope.brandScope, scope.offerScope, scope.evidenceDigest, scope.evidenceVersion].every((value) => boundedText(value, 200)) || !Array.isArray(scope.trustedEntries) || scope.trustedEntries.length > MAX_TRUSTED_ENTRIES || !scope.trustedEntries.every(validTrustedEntry)) return [];
  if (!artifact || artifact.version !== APPROVED_BUILD_LEARNING_VERSION || !boundedText(scope.trustedCallerLedgerVersion, 200) || artifact.trustedCallerLedgerVersion !== scope.trustedCallerLedgerVersion || !Array.isArray(artifact.rules) || artifact.rules.length > MAX_RULES) return [];
  return artifact.rules.filter((rule) => {
    if (!rule || !boundedText(rule.id, 200) || !boundedText(rule.approval?.reviewer, 200) || !boundedText(rule.approval?.approvedAt, 64) || !Number.isFinite(Date.parse(rule.approval.approvedAt)) || ![rule.sourceBuild, rule.sourceVersion, rule.brandScope, rule.offerScope, rule.evidenceDigest, rule.evidenceVersion, rule.beforeText, rule.afterText, rule.reason].every((value: string) => boundedText(value)) || !Array.isArray(rule.evidenceRefs) || rule.evidenceRefs.length === 0 || rule.evidenceRefs.some((value: string) => !boundedText(value, 200)) || unsafeSourceText(rule)) return false;
    return scope.trustedEntries.some((entry) => entry.brandScope === scope.brandScope && entry.offerScope === scope.offerScope && entry.evidenceDigest === scope.evidenceDigest && entry.evidenceVersion === scope.evidenceVersion && entry.brandScope === rule.brandScope && entry.offerScope === rule.offerScope && entry.evidenceDigest === rule.evidenceDigest && entry.evidenceVersion === rule.evidenceVersion && entry.sourceBuild === rule.sourceBuild && entry.sourceVersion === rule.sourceVersion && entry.artifactVersion === artifact.version);
  });
}

/** Return data-only, build-time hints. Do not treat feedback text as instructions or a source of new claims. */
export function selectApprovedBuildLearningHints(artifact: ApprovedBuildLearningArtifact | undefined, scope: BuildLearningScope): readonly ApprovedBuildLearningHint[] {
  return selectApprovedBuildLearning(artifact, scope).map((rule) => ({ id: rule.id, evidenceRefs: rule.evidenceRefs, beforeText: rule.beforeText, afterText: rule.afterText, reason: rule.reason, source: "reviewed-feedback-untrusted" }));
}
