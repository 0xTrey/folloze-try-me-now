import {
  BUYER_FACING_JARGON_PATTERN
} from "@/lib/generation/message-spine";
import {
  isBoundedCtaV2,
  sectionCopyWordCount,
  type SectionCopyCandidate,
  type SectionCopyChoice,
  type SectionEvidenceClaim,
  type SectionWriterArtifact,
  type SectionWriterKind,
  type SectionWriterSlot
} from "@/lib/generation/section-copy-types";
import type {
  CtaIdV2,
  WireframeFamilyV2
} from "@/lib/generation/three-family-contract";
import type { ProductionArtifact } from "@/lib/orchestration/worker-types";
import type { CtaType } from "@/lib/types";

const WORKER = "copy-factuality-editor" as const;

const SECTION_WRITERS = new Set<SectionWriterKind>([
  "opening-writer",
  "problem-urgency-writer",
  "exploration-writer",
  "mechanism-proof-writer",
  "team-cta-writer"
]);

const USABLE_ARTIFACT_STATUSES = new Set<ProductionArtifact<unknown>["status"]>([
  "complete",
  "fallback",
  "timed_out"
]);

const CHOICE_ROLES = new Set<SectionWriterSlot["role"]>([
  "pathways",
  "agenda",
  "chapter-navigation",
  "decision-support",
  "resources"
]);

const GENERIC_FILLER_PATTERN =
  /\b(?:make progress with confidence|a better way to move forward|unlock value|drive transformation|synerg(?:y|ies)|best[- ]in[- ]class|next[- ]level|holistic approach|transform your business|seamless|transformative|robust|streamline|leverage)\b/i;
const BANNED_PROSPECT_COPY_PATTERN =
  /\b(?:(?:launch|guide|align|wireframe)\s+(?:family|template)|production receipts?|quality grades?|template names?|debug language|business transformation leaders|solution overview)\b/i;

const UNSAFE_MARKUP_OR_CODE_PATTERN =
  /<\/?[a-z][^>]*>|```|javascript:|(?:^|\s)(?:className|const|export|function|import|interface|let|script|var)\s*(?:=|\s)|(?:^|\s)style\s*=|\bclass\s+[a-z_$][\w$]*\s*(?:\{|extends\b)|(?:^|\s)(?:[.#][a-z][\w-]*|@media)\s*\{|(?:^|[;{]\s*)(?:background|color|display|font|margin|padding)\s*:/im;

const NUMERIC_CLAIM_PATTERN =
  /(?:[$£€]\s?\d[\d,.]*|\b\d[\d,.]*(?:\s*(?:%|percent\b|x\b|times\b|hours?\b|days?\b|weeks?\b|months?\b|years?\b|users?\b|customers?\b|teams?\b|revenue\b|savings?\b))?)/gi;
const QUOTED_CLAIM_PATTERN = /["“]([^"”]{4,})["”]/g;
const GUARANTEE_PATTERN =
  /\b(?:guarantee(?:d|s)?|assured result|risk[- ]free|will always|will never fail)\b/i;
const URGENCY_PATTERN =
  /\b(?:act now|before it(?:'s| is) too late|deadline|last chance|limited time|now more than ever|today only|urgent(?:ly)?|urgency is rising)\b/i;

const STYLE_REPLACEMENTS: readonly [RegExp, string][] = [
  [/\baccount thesis\b/gi, "overview"],
  [/\bdecision paths?\b/gi, "evaluation options"],
  [/\bdecision lenses?\b/gi, "evaluation criteria"],
  [/\bsupporting proof\b/gi, "evidence"],
  [/\bnarrative arc\b/gi, "context"],
  [/\bstakeholder map\b/gi, "team roles"],
  [/\bbuying committee\b/gi, "evaluation team"],
  [/\bmake progress with confidence\b/gi, "evaluate the evidence"],
  [/\ba better way to move forward\b/gi, "a supported next step"],
  [/\bunlock value\b/gi, "evaluate the opportunity"],
  [/\bdrive transformation\b/gi, "support the change"],
  [/\bsynergies\b/gi, "coordination"],
  [/\bsynergy\b/gi, "coordination"],
  [/\bbest[- ]in[- ]class\b/gi, "supported"],
  [/\bnext[- ]level\b/gi, "stronger"],
  [/\bholistic approach\b/gi, "complete review"],
  [/\btransform your business\b/gi, "evaluate the proposed change"],
  [/\bseamless\b/gi, "coordinated"],
  [/\btransformative\b/gi, "material"],
  [/\brobust\b/gi, "supported"],
  [/\bstreamline\b/gi, "reduce steps in"],
  [/\bleverage\b/gi, "use"],
  [/\b(?:launch|guide|align|wireframe)\s+(?:family|template)\b/gi, "experience"],
  [/\bproduction receipts?\b/gi, "status"],
  [/\bquality grades?\b/gi, "review"],
  [/\btemplate names?\b/gi, "page"],
  [/\bdebug language\b/gi, "details"],
  [/\bbusiness transformation leaders\b/gi, "business leaders"],
  [/\bsolution overview\b/gi, "solution details"]
];

export type CopyFactualityIssueCode =
  | "missing_writer_candidate"
  | "duplicate_section_candidate"
  | "unknown_section"
  | "slot_mismatch"
  | "required_section_omitted"
  | "missing_omission_reason"
  | "missing_section_copy"
  | "word_count_mismatch"
  | "word_budget_violation"
  | "invalid_evidence_ref"
  | "choice_evidence_mismatch"
  | "choices_required"
  | "choice_count_invalid"
  | "duplicate_choice"
  | "buyer_facing_jargon"
  | "banned_prospect_phrase"
  | "generic_filler"
  | "unsafe_markup_or_code"
  | "unsupported_numeric_claim"
  | "unsupported_quote"
  | "unsupported_guarantee"
  | "unsupported_urgency"
  | "headline_word_budget_violation"
  | "claim_type_mismatch"
  | "fact_without_evidence"
  | "competitor_swap_risk"
  | "account_swap_risk"
  | "insufficient_section_novelty"
  | "duplicate_headline"
  | "duplicate_body"
  | "duplicate_headline_body"
  | "cta_missing"
  | "cta_mismatch"
  | "cta_unbounded"
  | "cta_objective_mismatch";

export type CopyFactualityRepairCode =
  | "normalized_whitespace"
  | "replaced_buyer_facing_jargon"
  | "replaced_banned_prospect_phrase"
  | "replaced_generic_filler"
  | "recalculated_word_count";

export interface CopyFactualityRepairReceipt {
  code: CopyFactualityRepairCode;
  fields: string[];
}

export interface CopyFactualityIssueReceipt {
  sectionId: string;
  outcome: "accepted" | "omitted" | "rejected";
  before: CopyFactualityIssueCode[];
  after: CopyFactualityIssueCode[];
  repairs: CopyFactualityRepairReceipt[];
}

export interface ClaimEvidenceReference {
  id: string;
  confidence: number;
  sourceRole: SectionEvidenceClaim["sourceRole"];
}

export interface ClaimEvidenceMapping {
  claimId: string;
  sectionId: string;
  field:
    | "eyebrow"
    | "headline"
    | "body"
    | `choice.${number}.label`
    | `choice.${number}.body`
    | "cta.label";
  text: string;
  claimType?: SectionCopyCandidate["claimType"];
  evidence: ClaimEvidenceReference[];
}

export interface CopyFactualityEditorValue {
  acceptedSections: readonly SectionCopyCandidate[];
  omittedSectionIds: readonly string[];
  rejectedSectionIds: readonly string[];
  issueReceipts: readonly CopyFactualityIssueReceipt[];
  claimToEvidence: readonly ClaimEvidenceMapping[];
}

export interface CopyFactualityEditorInput {
  sessionId: string;
  revision: number;
  activeRevision: number;
  startedAt: string;
  completedAt: string;
  slots: readonly SectionWriterSlot[];
  evidence: readonly SectionEvidenceClaim[];
  objective: string;
  cta: {
    type: CtaType;
    label: string;
    id?: CtaIdV2;
  };
  familyContext?: {
    family: WireframeFamilyV2;
    sellerName: string;
    targetName?: string;
    competitorNames?: readonly string[];
  };
  writerArtifacts: readonly SectionWriterArtifact[];
}

export type CopyFactualityEditorArtifact =
  ProductionArtifact<CopyFactualityEditorValue>;

const ISSUE_ORDER: readonly CopyFactualityIssueCode[] = [
  "missing_writer_candidate",
  "duplicate_section_candidate",
  "unknown_section",
  "slot_mismatch",
  "required_section_omitted",
  "missing_omission_reason",
  "missing_section_copy",
  "word_count_mismatch",
  "word_budget_violation",
  "invalid_evidence_ref",
  "choice_evidence_mismatch",
  "choices_required",
  "choice_count_invalid",
  "duplicate_choice",
  "buyer_facing_jargon",
  "banned_prospect_phrase",
  "generic_filler",
  "unsafe_markup_or_code",
  "unsupported_numeric_claim",
  "unsupported_quote",
  "unsupported_guarantee",
  "unsupported_urgency",
  "headline_word_budget_violation",
  "claim_type_mismatch",
  "fact_without_evidence",
  "competitor_swap_risk",
  "account_swap_risk",
  "insufficient_section_novelty",
  "duplicate_headline",
  "duplicate_body",
  "duplicate_headline_body",
  "cta_missing",
  "cta_mismatch",
  "cta_unbounded",
  "cta_objective_mismatch"
];

function unique(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value.trim()))].sort();
}

function stableIssues(
  issues: readonly CopyFactualityIssueCode[]
): CopyFactualityIssueCode[] {
  const issueSet = new Set(issues);
  return ISSUE_ORDER.filter((issue) => issueSet.has(issue));
}

function boundedConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function normalizedKey(value: string | undefined): string {
  return (value ?? "")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

const SPECIFICITY_STOP_WORDS = new Set([
  "about",
  "after",
  "against",
  "available",
  "before",
  "between",
  "business",
  "compare",
  "current",
  "decision",
  "evidence",
  "evaluate",
  "from",
  "into",
  "next",
  "only",
  "review",
  "supported",
  "team",
  "that",
  "their",
  "these",
  "this",
  "through",
  "using",
  "validate",
  "what",
  "with",
  "your"
]);

function materialTokens(value: string): Set<string> {
  return new Set(
    normalizedKey(value)
      .split(" ")
      .filter(
        (token) =>
          token.length >= 4 &&
          !SPECIFICITY_STOP_WORDS.has(token) &&
          !/^\d+$/.test(token)
      )
  );
}

function candidateText(candidate: SectionCopyCandidate): string {
  return allCopyFields(candidate)
    .filter(({ field }) => field !== "cta.label")
    .map(({ value }) => value)
    .join(" ");
}

function hasMaterialOverlap(left: string, right: string): boolean {
  const leftTokens = materialTokens(left);
  const rightTokens = materialTokens(right);
  return [...leftTokens].some((token) => rightTokens.has(token));
}

function sectionNoveltyIssue(
  candidate: SectionCopyCandidate,
  accepted: readonly SectionCopyCandidate[]
): boolean {
  const tokens = materialTokens(candidateText(candidate));
  if (tokens.size === 0 || accepted.length === 0) return false;
  const priorTokens = new Set(
    accepted.flatMap((section) => [...materialTokens(candidateText(section))])
  );
  const newTokenCount = [...tokens].filter((token) => !priorTokens.has(token)).length;
  return newTokenCount / tokens.size < 0.2;
}

function allCopyFields(candidate: SectionCopyCandidate): Array<{
  field: string;
  value: string;
  evidenceRefs: readonly string[];
}> {
  const fields: Array<{
    field: string;
    value: string;
    evidenceRefs: readonly string[];
  }> = [];
  const add = (
    field: string,
    value: string | undefined,
    evidenceRefs: readonly string[]
  ): void => {
    if (value?.trim()) fields.push({ field, value, evidenceRefs });
  };

  add("eyebrow", candidate.eyebrow, candidate.evidenceRefs);
  add("headline", candidate.headline, candidate.evidenceRefs);
  add("body", candidate.body, candidate.evidenceRefs);
  candidate.choices?.forEach((choice, index) => {
    add(`choice.${index + 1}.label`, choice.label, choice.evidenceRefs);
    add(`choice.${index + 1}.body`, choice.body, choice.evidenceRefs);
  });
  add("cta.label", candidate.cta?.label, []);
  return fields;
}

function repairedText(value: string): string {
  let repaired = value;
  for (const [pattern, replacement] of STYLE_REPLACEMENTS) {
    repaired = repaired.replace(pattern, replacement);
  }
  return repaired
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/([,.;:!?])\1+/g, "$1")
    .trim();
}

function repairCandidate(candidate: SectionCopyCandidate): {
  candidate: SectionCopyCandidate;
  repairs: CopyFactualityRepairReceipt[];
} {
  const rawFields = allCopyFields(candidate);
  const repairFields = (
    predicate: (value: string) => boolean
  ): string[] => rawFields.filter(({ value }) => predicate(value)).map(({ field }) => field);
  const jargonFields = repairFields((value) => BUYER_FACING_JARGON_PATTERN.test(value));
  const bannedPhraseFields = repairFields((value) =>
    BANNED_PROSPECT_COPY_PATTERN.test(value)
  );
  const fillerFields = repairFields((value) => GENERIC_FILLER_PATTERN.test(value));
  const whitespaceFields = repairFields(
    (value) => value !== value.replace(/\s+/g, " ").replace(/\s+([,.;:!?])/g, "$1").trim()
  );

  const repairChoice = (choice: SectionCopyChoice): SectionCopyChoice => ({
    label: repairedText(choice.label),
    body: repairedText(choice.body),
    evidenceRefs: unique(choice.evidenceRefs)
  });
  const repairedChoices = candidate.choices?.map(repairChoice) as
    | readonly [SectionCopyChoice, SectionCopyChoice, SectionCopyChoice]
    | undefined;
  const repaired: SectionCopyCandidate = {
    ...candidate,
    ...(candidate.eyebrow ? { eyebrow: repairedText(candidate.eyebrow) } : {}),
    ...(candidate.headline ? { headline: repairedText(candidate.headline) } : {}),
    ...(candidate.body ? { body: repairedText(candidate.body) } : {}),
    ...(repairedChoices ? { choices: repairedChoices } : {}),
    ...(candidate.cta
      ? {
          cta: {
            type: candidate.cta.type,
            label: repairedText(candidate.cta.label),
            ...(candidate.cta.id ? { id: candidate.cta.id } : {})
          }
        }
      : {}),
    evidenceRefs: unique(candidate.evidenceRefs),
    wordCount: 0
  };
  repaired.wordCount = sectionCopyWordCount(repaired);

  const repairs: CopyFactualityRepairReceipt[] = [];
  if (whitespaceFields.length > 0) {
    repairs.push({ code: "normalized_whitespace", fields: unique(whitespaceFields) });
  }
  if (jargonFields.length > 0) {
    repairs.push({
      code: "replaced_buyer_facing_jargon",
      fields: unique(jargonFields)
    });
  }
  if (bannedPhraseFields.length > 0) {
    repairs.push({
      code: "replaced_banned_prospect_phrase",
      fields: unique(bannedPhraseFields)
    });
  }
  if (fillerFields.length > 0) {
    repairs.push({
      code: "replaced_generic_filler",
      fields: unique(fillerFields)
    });
  }
  if (candidate.wordCount !== repaired.wordCount) {
    repairs.push({ code: "recalculated_word_count", fields: ["wordCount"] });
  }
  return { candidate: repaired, repairs };
}

function evidenceSupports(
  fragment: string,
  evidenceRefs: readonly string[],
  evidenceById: ReadonlyMap<string, SectionEvidenceClaim>
): boolean {
  const normalizedFragment = normalizedKey(fragment);
  if (!normalizedFragment) return false;
  return evidenceRefs.some((ref) => {
    const claim = evidenceById.get(ref);
    return claim ? normalizedKey(claim.text).includes(normalizedFragment) : false;
  });
}

function factualityIssues(
  candidate: SectionCopyCandidate,
  evidenceById: ReadonlyMap<string, SectionEvidenceClaim>
): CopyFactualityIssueCode[] {
  const issues: CopyFactualityIssueCode[] = [];
  for (const { value, evidenceRefs } of allCopyFields(candidate)) {
    const numericClaims = [...value.matchAll(NUMERIC_CLAIM_PATTERN)].map(
      (match) => match[0]
    );
    if (
      numericClaims.some(
        (claim) => !evidenceSupports(claim, evidenceRefs, evidenceById)
      )
    ) {
      issues.push("unsupported_numeric_claim");
    }

    const quotedClaims = [...value.matchAll(QUOTED_CLAIM_PATTERN)].map(
      (match) => match[1] ?? ""
    );
    if (
      quotedClaims.some(
        (claim) => !evidenceSupports(claim, evidenceRefs, evidenceById)
      )
    ) {
      issues.push("unsupported_quote");
    }

    if (
      GUARANTEE_PATTERN.test(value) &&
      !evidenceSupports(value, evidenceRefs, evidenceById)
    ) {
      issues.push("unsupported_guarantee");
    }
    if (
      URGENCY_PATTERN.test(value) &&
      !evidenceSupports(value, evidenceRefs, evidenceById)
    ) {
      issues.push("unsupported_urgency");
    }
  }
  return issues;
}

function swapGateIssues(
  candidate: SectionCopyCandidate,
  slot: SectionWriterSlot,
  evidenceById: ReadonlyMap<string, SectionEvidenceClaim>,
  familyContext: CopyFactualityEditorInput["familyContext"]
): CopyFactualityIssueCode[] {
  if (!slot.family || slot.claimType === "instruction") return [];
  const text = candidateText(candidate);
  const assignedClaims = candidate.evidenceRefs.flatMap((ref) => {
    const claim = evidenceById.get(ref);
    return claim ? [claim] : [];
  });
  const sellerEvidence = assignedClaims
    .filter(({ sourceRole }) => sourceRole !== "target")
    .map(({ text: claimText }) => claimText)
    .join(" ");
  const sellerNamed =
    Boolean(familyContext?.sellerName.trim()) &&
    normalizedKey(text).includes(normalizedKey(familyContext?.sellerName));
  const competitorNamed = (familyContext?.competitorNames ?? []).some(
    (name) => name.trim() && normalizedKey(text).includes(normalizedKey(name))
  );
  const issues: CopyFactualityIssueCode[] = [];
  if (
    competitorNamed ||
    (!sellerNamed && !hasMaterialOverlap(text, sellerEvidence))
  ) {
    issues.push("competitor_swap_risk");
  }

  if (slot.family === "align") {
    const targetEvidence = assignedClaims
      .filter(({ sourceRole }) => sourceRole === "target")
      .map(({ text: claimText }) => claimText)
      .join(" ");
    const targetNamed =
      Boolean(familyContext?.targetName?.trim()) &&
      normalizedKey(text).includes(normalizedKey(familyContext?.targetName));
    if (!targetNamed && !hasMaterialOverlap(text, targetEvidence)) {
      issues.push("account_swap_risk");
    }
  }
  return issues;
}

function inferredObjectiveCtaType(objective: string): CtaType | undefined {
  if (/\b(?:register|registration|reserve (?:a )?(?:seat|spot)|attend)\b/i.test(objective)) {
    return "register";
  }
  if (/\b(?:download|ebook|whitepaper)\b/i.test(objective)) return "download";
  if (/\b(?:book|schedule).*(?:demo|meeting|session)|\b(?:demo|meeting) request\b/i.test(objective)) {
    return "book-meeting";
  }
  if (/\bcontact sales\b/i.test(objective)) return "contact-sales";
  if (/\b(?:explore|browse|view details)\b/i.test(objective)) return "explore";
  return undefined;
}

function ctaLabelMatchesType(type: CtaType, label: string): boolean {
  if (type === "custom") return Boolean(label.trim());
  const patterns: Record<Exclude<CtaType, "custom">, RegExp> = {
    "book-meeting":
      /\b(?:book|consult|conversation|demo|meeting|plan|review|schedule|session)\b/i,
    "contact-sales": /\b(?:contact|sales|speak|talk)\b/i,
    register: /\b(?:attend|register|registration|reserve|save (?:a|your) (?:seat|spot))\b/i,
    download: /\b(?:download|get|guide|report|resource|whitepaper|ebook)\b/i,
    explore: /\b(?:browse|discover|evaluate|explore|learn|read|review|view)\b/i
  };
  return patterns[type].test(label);
}

function objectiveCtaMismatch(input: CopyFactualityEditorInput): boolean {
  const inferred = inferredObjectiveCtaType(input.objective);
  return (
    (inferred !== undefined && inferred !== input.cta.type) ||
    !ctaLabelMatchesType(input.cta.type, input.cta.label)
  );
}

function candidateIssues(
  candidate: SectionCopyCandidate,
  slot: SectionWriterSlot | undefined,
  evidenceById: ReadonlyMap<string, SectionEvidenceClaim>,
  selectedCta: CopyFactualityEditorInput["cta"],
  hasObjectiveCtaMismatch: boolean,
  familyContext: CopyFactualityEditorInput["familyContext"]
): CopyFactualityIssueCode[] {
  const issues: CopyFactualityIssueCode[] = [];
  if (!slot) {
    issues.push("unknown_section");
    return stableIssues(issues);
  }
  if (candidate.sectionId !== slot.id || candidate.role !== slot.role) {
    issues.push("slot_mismatch");
  }
  if (
    slot.family &&
    (candidate.family !== slot.family ||
      candidate.v2Role !== slot.v2Role ||
      candidate.claimType !== slot.claimType ||
      familyContext?.family !== slot.family)
  ) {
    issues.push("claim_type_mismatch");
  }
  if (candidate.status === "omitted") {
    if (slot.required) issues.push("required_section_omitted");
    if (!candidate.omissionReason) issues.push("missing_omission_reason");
    return stableIssues(issues);
  }
  if (!candidate.headline?.trim() || !candidate.body?.trim()) {
    issues.push("missing_section_copy");
  }
  const headlineWordCount = candidate.headline?.trim()
    ? candidate.headline.trim().split(/\s+/).length
    : 0;
  if (
    slot.headlineWordBudget &&
    (headlineWordCount < slot.headlineWordBudget.min ||
      headlineWordCount > slot.headlineWordBudget.max)
  ) {
    issues.push("headline_word_budget_violation");
  }

  const actualWordCount = sectionCopyWordCount(candidate);
  if (candidate.wordCount !== actualWordCount) issues.push("word_count_mismatch");
  if (
    actualWordCount < slot.wordBudget.min ||
    actualWordCount > slot.wordBudget.max
  ) {
    issues.push("word_budget_violation");
  }

  const assignedRefs = new Set(slot.evidenceRefs);
  const validRef = (ref: string): boolean =>
    evidenceById.has(ref) && assignedRefs.has(ref);
  if (candidate.evidenceRefs.some((ref) => !validRef(ref))) {
    issues.push("invalid_evidence_ref");
  }
  if (slot.claimType === "fact" && candidate.evidenceRefs.length === 0) {
    issues.push("fact_without_evidence");
  }
  const candidateRefs = new Set(candidate.evidenceRefs);
  if (
    candidate.choices?.some((choice) =>
      choice.evidenceRefs.some(
        (ref) => !validRef(ref) || !candidateRefs.has(ref)
      )
    )
  ) {
    issues.push("choice_evidence_mismatch");
  }

  if (CHOICE_ROLES.has(slot.role) && !candidate.choices) {
    issues.push("choices_required");
  }
  if (candidate.choices) {
    if (candidate.choices.length !== 3) {
      issues.push("choice_count_invalid");
    } else {
      const labels = candidate.choices.map(({ label }) => normalizedKey(label));
      const bodies = candidate.choices.map(({ body }) => normalizedKey(body));
      if (
        labels.some((label) => !label) ||
        bodies.some((body) => !body) ||
        new Set(labels).size !== 3 ||
        new Set(bodies).size !== 3
      ) {
        issues.push("duplicate_choice");
      }
    }
  }

  const fields = allCopyFields(candidate);
  if (fields.some(({ value }) => BUYER_FACING_JARGON_PATTERN.test(value))) {
    issues.push("buyer_facing_jargon");
  }
  if (fields.some(({ value }) => BANNED_PROSPECT_COPY_PATTERN.test(value))) {
    issues.push("banned_prospect_phrase");
  }
  if (fields.some(({ value }) => GENERIC_FILLER_PATTERN.test(value))) {
    issues.push("generic_filler");
  }
  if (fields.some(({ value }) => UNSAFE_MARKUP_OR_CODE_PATTERN.test(value))) {
    issues.push("unsafe_markup_or_code");
  }
  issues.push(...factualityIssues(candidate, evidenceById));
  issues.push(
    ...swapGateIssues(candidate, slot, evidenceById, familyContext)
  );

  if (
    normalizedKey(candidate.headline) &&
    normalizedKey(candidate.headline) === normalizedKey(candidate.body)
  ) {
    issues.push("duplicate_headline_body");
  }

  if (slot.role === "next-action" && !candidate.cta) {
    issues.push("cta_missing");
  }
  if (
    candidate.cta &&
    (candidate.cta.type !== selectedCta.type ||
      normalizedKey(candidate.cta.label) !== normalizedKey(selectedCta.label) ||
      (selectedCta.id !== undefined && candidate.cta.id !== selectedCta.id))
  ) {
    issues.push("cta_mismatch");
  }
  if (
    candidate.cta &&
    slot.allowedCtas &&
    (!candidate.cta.id ||
      !slot.allowedCtas.includes(candidate.cta.id) ||
      !isBoundedCtaV2(candidate.cta))
  ) {
    issues.push("cta_unbounded");
  }
  if (candidate.cta && hasObjectiveCtaMismatch) {
    issues.push("cta_objective_mismatch");
  }

  return stableIssues(issues);
}

function failedArtifact(
  input: CopyFactualityEditorInput,
  status: "failed" | "stale",
  errorCode: string
): CopyFactualityEditorArtifact {
  return {
    worker: WORKER,
    sessionId: input.sessionId,
    revision: input.revision,
    status,
    evidenceRefs: [],
    confidence: 0,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    errorCode
  };
}

function claimMappings(
  candidate: SectionCopyCandidate,
  evidenceById: ReadonlyMap<string, SectionEvidenceClaim>
): ClaimEvidenceMapping[] {
  return allCopyFields(candidate).map(({ field, value, evidenceRefs }) => ({
    claimId: `${candidate.sectionId}:${field}`,
    sectionId: candidate.sectionId,
    field: field as ClaimEvidenceMapping["field"],
    text: value,
    ...(candidate.claimType ? { claimType: candidate.claimType } : {}),
    evidence: unique(evidenceRefs).flatMap((id) => {
      const evidence = evidenceById.get(id);
      return evidence
        ? [{
            id,
            confidence: boundedConfidence(evidence.confidence),
            sourceRole: evidence.sourceRole
          }]
        : [];
    })
  }));
}

/**
 * Combines current-revision writer artifacts, repairs bounded style defects,
 * and rejects unsupported or structurally unsafe sections before spec compile.
 */
export function editCopyForFactuality(
  input: CopyFactualityEditorInput
): CopyFactualityEditorArtifact {
  if (
    !input.sessionId.trim() ||
    !Number.isSafeInteger(input.revision) ||
    input.revision < 0
  ) {
    return failedArtifact(input, "failed", "invalid_copy_factuality_editor_input");
  }
  if (input.revision !== input.activeRevision) {
    return failedArtifact(input, "stale", "copy_factuality_editor_stale_revision");
  }
  if (
    input.writerArtifacts.some(
      (artifact) =>
        artifact.revision !== input.revision || artifact.status === "stale"
    )
  ) {
    return failedArtifact(
      input,
      "stale",
      "copy_factuality_editor_stale_writer_artifact"
    );
  }
  if (
    input.writerArtifacts.some(
      (artifact) => artifact.sessionId !== input.sessionId
    )
  ) {
    return failedArtifact(
      input,
      "failed",
      "copy_factuality_editor_writer_session_mismatch"
    );
  }
  if (
    input.writerArtifacts.some(
      (artifact) => !SECTION_WRITERS.has(artifact.worker as SectionWriterKind)
    )
  ) {
    return failedArtifact(
      input,
      "failed",
      "copy_factuality_editor_worker_mismatch"
    );
  }

  const slotIds = input.slots.map(({ id }) => id);
  const currentEvidence = input.evidence.filter(
    ({ revision }) => revision === input.revision
  );
  const currentEvidenceIds = currentEvidence.map(({ id }) => id);
  if (
    new Set(slotIds).size !== slotIds.length ||
    new Set(currentEvidenceIds).size !== currentEvidenceIds.length ||
    input.slots.some(
      ({ wordBudget }, index) =>
        !Number.isSafeInteger(wordBudget.min) ||
        !Number.isSafeInteger(wordBudget.max) ||
        wordBudget.min < 1 ||
        wordBudget.min > wordBudget.max ||
        (input.slots[index]?.family !== undefined &&
          (!Number.isSafeInteger(input.slots[index]?.spineOrder) ||
            (index > 0 &&
              (input.slots[index]?.spineOrder ?? 0) <=
                (input.slots[index - 1]?.spineOrder ?? 0)) ||
            input.familyContext?.family !== input.slots[index]?.family))
    )
  ) {
    return failedArtifact(
      input,
      "failed",
      "copy_factuality_editor_invalid_contract"
    );
  }

  const evidenceById = new Map(currentEvidence.map((claim) => [claim.id, claim]));
  const candidates = input.writerArtifacts.flatMap((artifact) =>
    artifact.value && USABLE_ARTIFACT_STATUSES.has(artifact.status)
      ? [...artifact.value]
      : []
  );
  const candidatesBySection = new Map<string, SectionCopyCandidate[]>();
  for (const candidate of candidates) {
    const grouped = candidatesBySection.get(candidate.sectionId) ?? [];
    grouped.push(candidate);
    candidatesBySection.set(candidate.sectionId, grouped);
  }

  const acceptedSections: SectionCopyCandidate[] = [];
  const omittedSectionIds: string[] = [];
  const rejectedSectionIds: string[] = [];
  const issueReceipts: CopyFactualityIssueReceipt[] = [];
  const claimToEvidence: ClaimEvidenceMapping[] = [];
  const acceptedHeadlines = new Set<string>();
  const acceptedBodies = new Set<string>();
  const hasObjectiveCtaMismatch = objectiveCtaMismatch(input);

  for (const slot of input.slots) {
    const grouped = candidatesBySection.get(slot.id) ?? [];
    if (grouped.length === 0) {
      const issue: CopyFactualityIssueCode = "missing_writer_candidate";
      if (slot.required) rejectedSectionIds.push(slot.id);
      else omittedSectionIds.push(slot.id);
      issueReceipts.push({
        sectionId: slot.id,
        outcome: slot.required ? "rejected" : "omitted",
        before: [issue],
        after: [issue],
        repairs: []
      });
      continue;
    }
    if (grouped.length > 1) {
      rejectedSectionIds.push(slot.id);
      issueReceipts.push({
        sectionId: slot.id,
        outcome: "rejected",
        before: ["duplicate_section_candidate"],
        after: ["duplicate_section_candidate"],
        repairs: []
      });
      continue;
    }

    const raw = grouped[0]!;
    if (raw.status === "omitted") {
      const issues = candidateIssues(
        raw,
        slot,
        evidenceById,
        input.cta,
        hasObjectiveCtaMismatch,
        input.familyContext
      );
      const rejected = issues.length > 0;
      (rejected ? rejectedSectionIds : omittedSectionIds).push(slot.id);
      issueReceipts.push({
        sectionId: slot.id,
        outcome: rejected ? "rejected" : "omitted",
        before: issues,
        after: issues,
        repairs: []
      });
      continue;
    }

    const before = candidateIssues(
      raw,
      slot,
      evidenceById,
      input.cta,
      hasObjectiveCtaMismatch,
      input.familyContext
    );
    const repairedResult = repairCandidate(raw);
    const repaired = repairedResult.candidate;
    const after = candidateIssues(
      repaired,
      slot,
      evidenceById,
      input.cta,
      hasObjectiveCtaMismatch,
      input.familyContext
    );
    const headlineKey = normalizedKey(repaired.headline);
    const bodyKey = normalizedKey(repaired.body);
    if (headlineKey && acceptedHeadlines.has(headlineKey)) {
      after.push("duplicate_headline");
    }
    if (bodyKey && acceptedBodies.has(bodyKey)) {
      after.push("duplicate_body");
    }
    if (
      slot.family &&
      !after.includes("duplicate_headline") &&
      !after.includes("duplicate_body") &&
      sectionNoveltyIssue(repaired, acceptedSections)
    ) {
      after.push("insufficient_section_novelty");
    }
    const stableAfter = stableIssues(after);
    if (stableAfter.length > 0) {
      rejectedSectionIds.push(slot.id);
      issueReceipts.push({
        sectionId: slot.id,
        outcome: "rejected",
        before,
        after: stableAfter,
        repairs: repairedResult.repairs
      });
      continue;
    }

    acceptedSections.push(repaired);
    if (headlineKey) acceptedHeadlines.add(headlineKey);
    if (bodyKey) acceptedBodies.add(bodyKey);
    claimToEvidence.push(...claimMappings(repaired, evidenceById));
    issueReceipts.push({
      sectionId: slot.id,
      outcome: "accepted",
      before,
      after: [],
      repairs: repairedResult.repairs
    });
  }

  const knownSlotIds = new Set(slotIds);
  for (const sectionId of unique(
    candidates
      .filter((candidate) => !knownSlotIds.has(candidate.sectionId))
      .map(({ sectionId }) => sectionId)
  )) {
    rejectedSectionIds.push(sectionId);
    issueReceipts.push({
      sectionId,
      outcome: "rejected",
      before: ["unknown_section"],
      after: ["unknown_section"],
      repairs: []
    });
  }

  const value: CopyFactualityEditorValue = {
    acceptedSections,
    omittedSectionIds: unique(omittedSectionIds),
    rejectedSectionIds: unique(rejectedSectionIds),
    issueReceipts,
    claimToEvidence
  };
  const evidenceRefs = unique(
    acceptedSections.flatMap((candidate) => candidate.evidenceRefs)
  );
  const evidenceConfidence =
    evidenceRefs.length > 0
      ? Math.min(
          ...evidenceRefs.map((ref) =>
            boundedConfidence(evidenceById.get(ref)?.confidence ?? 0)
          )
        )
      : acceptedSections.length > 0
        ? 0.6
        : 0;
  const changed = issueReceipts.some(
    (receipt) =>
      receipt.before.length > 0 ||
      receipt.repairs.length > 0 ||
      receipt.outcome !== "accepted"
  );

  if (acceptedSections.length === 0) {
    return {
      worker: WORKER,
      sessionId: input.sessionId,
      revision: input.revision,
      status: "failed",
      value,
      evidenceRefs: [],
      confidence: 0,
      startedAt: input.startedAt,
      completedAt: input.completedAt,
      errorCode: "copy_factuality_editor_no_valid_sections"
    };
  }

  return {
    worker: WORKER,
    sessionId: input.sessionId,
    revision: input.revision,
    status: changed ? "fallback" : "complete",
    value,
    evidenceRefs,
    confidence: changed ? Math.min(evidenceConfidence, 0.55) : evidenceConfidence,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    ...(changed
      ? {
          fallbackCode:
            value.rejectedSectionIds.length > 0 ||
            value.omittedSectionIds.length > 0
              ? "copy_factuality_editor_partial_acceptance"
              : "copy_factuality_editor_repaired_copy"
        }
      : {})
  };
}
