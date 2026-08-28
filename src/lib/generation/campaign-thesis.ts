/**
 * The Campaign Thesis: one internal message authority per active revision.
 *
 * Everything downstream of this file argues *from* the thesis rather than from
 * raw evidence, which only works if the thesis is honest about what it knows. So
 * every field carries its own evidence refs, status, confidence, and buyer-facing
 * permission, and a field with no permitted support resolves to `unknown` with no
 * value rather than to a plausible sentence. A caller cannot widen a field's
 * permissions: status, confidence, and buyer-facing all derive from the claims
 * that survived filtering, never from the proposal.
 *
 * The evidence input is deliberately structural. The executed Evidence Graph
 * lives in `src/lib/research/`; naming it here would couple message compilation
 * to research execution, so this module accepts the narrow shape it actually
 * reads and lets the caller adapt.
 *
 * Compilation is pure and deterministic: identical input produces an identical
 * thesis and an identical digest, so a private receipt can be checked against a
 * re-run.
 */

import { compilerDigest, compilerTextDigest } from "@/lib/generation/compiler-digest";

export const CAMPAIGN_THESIS_SCHEMA_VERSION = "1.0" as const;
/** Matches CONTRACT_VERSION_PATTERN so the version is trace-safe verbatim. */
export const CAMPAIGN_THESIS_VERSION = "campaign-thesis-v1.0.0";

export type ThesisStatus = "fact" | "inference" | "unknown";
export type ThesisConfidence = "high" | "medium" | "low";

export interface ThesisField {
  value?: string;
  evidenceRefs: string[];
  confidence: ThesisConfidence;
  status: ThesisStatus;
  buyerFacing: boolean;
}

export interface CampaignThesis {
  schemaVersion: typeof CAMPAIGN_THESIS_SCHEMA_VERSION;
  revision: number;
  seller: ThesisField;
  offer: ThesisField;
  audience: ThesisField;
  audienceJob: ThesisField;
  currentState: ThesisField;
  desiredOutcome: ThesisField;
  promise: ThesisField;
  mechanism: ThesisField;
  proof: ThesisField;
  objection: ThesisField;
  nextAction: ThesisField;
  whyNow?: ThesisField;
  unknowns: string[];
}

export const THESIS_FIELD_ROLES = [
  "seller",
  "offer",
  "audience",
  "audienceJob",
  "currentState",
  "desiredOutcome",
  "promise",
  "mechanism",
  "proof",
  "objection",
  "nextAction",
  "whyNow"
] as const;
export type ThesisFieldRole = (typeof THESIS_FIELD_ROLES)[number];

/**
 * Roles the schema itself marks optional. An unsupported optional role is
 * dropped from the thesis; an unsupported required role stays present as an
 * explicit `unknown` so a reader can see that it was asked and not answered.
 */
export const OPTIONAL_THESIS_FIELD_ROLES = ["whyNow"] as const satisfies readonly ThesisFieldRole[];
type OptionalThesisFieldRole = (typeof OPTIONAL_THESIS_FIELD_ROLES)[number];

/* -------------------------------------------------------------------------- */
/* Narrow evidence input                                                       */
/* -------------------------------------------------------------------------- */

export const THESIS_EVIDENCE_ENTITY_KINDS = [
  "seller",
  "offer",
  "audience",
  "proof",
  "category",
  "source"
] as const;
export type ThesisEvidenceEntityKind = (typeof THESIS_EVIDENCE_ENTITY_KINDS)[number];

export interface ThesisEvidenceEntity {
  id: string;
  kind: ThesisEvidenceEntityKind;
  canonicalName: string;
  aliases?: readonly string[];
}

/**
 * One executed claim. `allowedUses` and `prohibitedUses` stay as strings so an
 * upstream vocabulary can grow without a change here; this module reads only the
 * prohibitions it needs and treats an unrecognized permission as no permission.
 */
export interface ThesisEvidenceClaim {
  id: string;
  claim: string;
  status: ThesisStatus;
  confidence: ThesisConfidence;
  allowedUses: readonly string[];
  prohibitedUses: readonly string[];
  buyerFacing: boolean;
  subjectId?: string;
}

export interface ThesisEvidenceInput {
  revision: number;
  entities: readonly ThesisEvidenceEntity[];
  claims: readonly ThesisEvidenceClaim[];
  gaps?: readonly string[];
}

/** What the upstream layer believes a field says, and which claims back it. */
export interface ThesisFieldProposal {
  value?: string;
  claimIds: readonly string[];
}

export interface CampaignThesisInput {
  revision: number;
  evidence: ThesisEvidenceInput;
  proposals: Partial<Record<ThesisFieldRole, ThesisFieldProposal>>;
}

/* -------------------------------------------------------------------------- */
/* Compilation                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * What each role asserts, named as the use a claim must not prohibit. A role
 * with no entry states no new fact about the world: it frames the seller's own
 * offer, the buyer's job, or the action being asked for.
 */
const ROLE_ASSERTED_USE: Partial<Record<ThesisFieldRole, string>> = {
  currentState: "declarative-claim",
  proof: "proof-point",
  whyNow: "urgency-claim"
};

const ROLE_LABELS: Record<ThesisFieldRole, string> = {
  seller: "seller identity",
  offer: "promoted offer",
  audience: "buyer audience",
  audienceJob: "buyer job",
  currentState: "current constraint",
  desiredOutcome: "desired outcome",
  promise: "promise",
  mechanism: "operating mechanism",
  proof: "proof",
  objection: "highest-value objection",
  nextAction: "next action",
  whyNow: "why now"
};

const CONFIDENCE_RANK: Record<ThesisConfidence, number> = { high: 3, medium: 2, low: 1 };

function normalizedValue(value: string | undefined): string | undefined {
  const collapsed = value?.replace(/\s+/g, " ").trim();
  return collapsed ? collapsed.slice(0, 400) : undefined;
}

function unknownField(): ThesisField {
  return { evidenceRefs: [], confidence: "low", status: "unknown", buyerFacing: false };
}

interface CompiledField {
  field: ThesisField;
  droppedRefs: string[];
  reasonCodes: string[];
}

function compileField(
  role: ThesisFieldRole,
  proposal: ThesisFieldProposal | undefined,
  claimsById: ReadonlyMap<string, ThesisEvidenceClaim>
): CompiledField {
  const droppedRefs: string[] = [];
  const reasonCodes: string[] = [];
  const assertedUse = ROLE_ASSERTED_USE[role];
  const refs = [...new Set(proposal?.claimIds ?? [])].sort();

  const permitted: ThesisEvidenceClaim[] = [];
  for (const ref of refs) {
    const claim = claimsById.get(ref);
    if (!claim) {
      droppedRefs.push(ref);
      reasonCodes.push(`thesis_dangling_evidence_ref_${role}`);
      continue;
    }
    if (claim.status === "unknown") {
      droppedRefs.push(ref);
      reasonCodes.push(`thesis_evidence_unknown_${role}`);
      continue;
    }
    if (assertedUse && claim.prohibitedUses.includes(assertedUse)) {
      droppedRefs.push(ref);
      reasonCodes.push(`thesis_evidence_use_prohibited_${role}`);
      continue;
    }
    permitted.push(claim);
  }

  const value = normalizedValue(proposal?.value);
  if (!value || permitted.length === 0) {
    if (value && permitted.length === 0) reasonCodes.push(`thesis_field_unsupported_${role}`);
    return { field: unknownField(), droppedRefs, reasonCodes };
  }

  // The field is asserted at the strength of its best permitted support, and
  // may only be said out loud when every claim behind it is buyer-facing.
  const status: ThesisStatus = permitted.some((claim) => claim.status === "fact")
    ? "fact"
    : "inference";
  const confidence = permitted
    .filter((claim) => claim.status === status)
    .reduce<ThesisConfidence>(
      (strongest, claim) =>
        CONFIDENCE_RANK[claim.confidence] > CONFIDENCE_RANK[strongest] ? claim.confidence : strongest,
      "low"
    );

  return {
    field: {
      value,
      evidenceRefs: permitted.map(({ id }) => id).sort(),
      confidence,
      status,
      buyerFacing: permitted.every((claim) => claim.buyerFacing)
    },
    droppedRefs,
    reasonCodes
  };
}

export type ThesisProofMode = "evidence" | "validation-question";

export interface CampaignThesisCompilation {
  thesis: CampaignThesis;
  version: string;
  digest: string;
  /**
   * Whether proof may be stated or must be framed as an evaluation question.
   * Never a licence to invent a proof point: a validation question carries no
   * value on `thesis.proof`.
   */
  proofMode: ThesisProofMode;
  omittedFields: ThesisFieldRole[];
  unsupportedFields: ThesisFieldRole[];
  droppedEvidenceRefs: string[];
  reasonCodes: string[];
}

/**
 * Compiles one thesis. Call once per active revision: the result is a pure
 * function of the input, so a second call is duplicated work rather than a
 * second opinion.
 */
export function compileCampaignThesis(input: CampaignThesisInput): CampaignThesisCompilation {
  const claimsById = new Map(input.evidence.claims.map((claim) => [claim.id, claim]));
  const droppedEvidenceRefs = new Set<string>();
  const reasonCodes = new Set<string>();
  const omittedFields: ThesisFieldRole[] = [];
  const unsupportedFields: ThesisFieldRole[] = [];
  const unknowns = new Set<string>(input.evidence.gaps ?? []);
  const fields = {} as Record<ThesisFieldRole, ThesisField | undefined>;

  for (const role of THESIS_FIELD_ROLES) {
    const compiled = compileField(role, input.proposals[role], claimsById);
    for (const ref of compiled.droppedRefs) droppedEvidenceRefs.add(ref);
    for (const code of compiled.reasonCodes) reasonCodes.add(code);

    if (compiled.field.status === "unknown") {
      unsupportedFields.push(role);
      unknowns.add(`The ${ROLE_LABELS[role]} is not supported by current-revision evidence.`);
      if ((OPTIONAL_THESIS_FIELD_ROLES as readonly ThesisFieldRole[]).includes(role)) {
        omittedFields.push(role);
        reasonCodes.add(`thesis_optional_field_omitted_${role}`);
        continue;
      }
    }
    fields[role] = compiled.field;
  }

  const optional = (role: OptionalThesisFieldRole) =>
    fields[role] ? { [role]: fields[role]! } : {};

  const thesis: CampaignThesis = {
    schemaVersion: CAMPAIGN_THESIS_SCHEMA_VERSION,
    revision: input.revision,
    seller: fields.seller ?? unknownField(),
    offer: fields.offer ?? unknownField(),
    audience: fields.audience ?? unknownField(),
    audienceJob: fields.audienceJob ?? unknownField(),
    currentState: fields.currentState ?? unknownField(),
    desiredOutcome: fields.desiredOutcome ?? unknownField(),
    promise: fields.promise ?? unknownField(),
    mechanism: fields.mechanism ?? unknownField(),
    proof: fields.proof ?? unknownField(),
    objection: fields.objection ?? unknownField(),
    nextAction: fields.nextAction ?? unknownField(),
    ...optional("whyNow"),
    unknowns: [...unknowns].sort()
  };

  const proofMode: ThesisProofMode =
    thesis.proof.status === "fact" ? "evidence" : "validation-question";
  reasonCodes.add(`thesis_proof_${proofMode.replace(/-/g, "_")}`);

  return {
    thesis,
    version: CAMPAIGN_THESIS_VERSION,
    digest: campaignThesisDigest(thesis),
    proofMode,
    omittedFields,
    unsupportedFields,
    droppedEvidenceRefs: [...droppedEvidenceRefs].sort(),
    reasonCodes: [...reasonCodes].sort()
  };
}

/* -------------------------------------------------------------------------- */
/* Digest                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Digest-safe projection. Field wording is replaced by its own hash, so the
 * digest still moves when the argument changes without carrying the argument.
 */
export function campaignThesisDigestSource(thesis: CampaignThesis): unknown {
  return {
    schemaVersion: thesis.schemaVersion,
    version: CAMPAIGN_THESIS_VERSION,
    revision: thesis.revision,
    fields: THESIS_FIELD_ROLES.map((role) => {
      const field = thesis[role];
      if (!field) return { role, present: false };
      return {
        role,
        present: true,
        status: field.status,
        confidence: field.confidence,
        buyerFacing: field.buyerFacing,
        evidenceRefs: [...field.evidenceRefs].sort(),
        valueDigest: compilerTextDigest(field.value)
      };
    }),
    unknownCount: thesis.unknowns.length
  };
}

export function campaignThesisDigest(thesis: CampaignThesis): string {
  return `th_${compilerDigest("campaign-thesis-v1", campaignThesisDigestSource(thesis))}`;
}

/* -------------------------------------------------------------------------- */
/* Recipe-aware validation                                                     */
/* -------------------------------------------------------------------------- */

/**
 * What a recipe needs before it may argue. Held as data rather than as a recipe
 * import so this module stays below the recipe layer.
 */
export interface ThesisRequirement {
  requiredFields: readonly ThesisFieldRole[];
  /**
   * `evidence-or-validation-question` lets an unsupported proof field become an
   * open evaluation question. It never lets one be filled in.
   */
  proofPolicy: "evidence-required" | "evidence-or-validation-question";
}

export type ThesisValidationCode =
  | "invalid_thesis_schema_version"
  | "invalid_thesis_revision"
  | `missing_required_thesis_field_${ThesisFieldRole}`
  | `unsupported_thesis_field_value_${ThesisFieldRole}`
  | `empty_thesis_field_value_${ThesisFieldRole}`
  | `thesis_field_evidence_without_value_${ThesisFieldRole}`;

export interface ThesisValidation {
  valid: boolean;
  issues: ThesisValidationCode[];
}

/**
 * Returns every problem rather than the first, so a rejected thesis can say how
 * far it is from usable. A missing required field is reported, never supplied.
 */
export function validateCampaignThesis(
  thesis: CampaignThesis,
  requirement: ThesisRequirement
): ThesisValidation {
  const issues = new Set<ThesisValidationCode>();

  if (thesis.schemaVersion !== CAMPAIGN_THESIS_SCHEMA_VERSION) {
    issues.add("invalid_thesis_schema_version");
  }
  if (!Number.isSafeInteger(thesis.revision) || thesis.revision < 0) {
    issues.add("invalid_thesis_revision");
  }

  for (const role of THESIS_FIELD_ROLES) {
    const field = thesis[role];
    if (!field) continue;
    if (field.value !== undefined && !field.value.trim()) {
      issues.add(`empty_thesis_field_value_${role}`);
    }
    if (field.value && (field.status === "unknown" || field.evidenceRefs.length === 0)) {
      issues.add(`unsupported_thesis_field_value_${role}`);
    }
    if (!field.value && field.evidenceRefs.length > 0) {
      issues.add(`thesis_field_evidence_without_value_${role}`);
    }
  }

  const required = new Set<ThesisFieldRole>(requirement.requiredFields);
  if (requirement.proofPolicy === "evidence-required") required.add("proof");
  for (const role of required) {
    const field = thesis[role];
    if (!field?.value || field.status === "unknown" || field.evidenceRefs.length === 0) {
      issues.add(`missing_required_thesis_field_${role}`);
    }
  }

  const ordered = [...issues].sort();
  return { valid: ordered.length === 0, issues: ordered };
}

/** The supported value of a role, or undefined when the role is unknown. */
export function thesisFieldValue(
  thesis: CampaignThesis,
  role: ThesisFieldRole
): string | undefined {
  const field = thesis[role];
  return field?.status === "unknown" ? undefined : field?.value;
}

/** Every evidence ref the thesis actually leans on, deduped and ordered. */
export function thesisEvidenceRefs(thesis: CampaignThesis): string[] {
  return [
    ...new Set(THESIS_FIELD_ROLES.flatMap((role) => thesis[role]?.evidenceRefs ?? []))
  ].sort();
}
