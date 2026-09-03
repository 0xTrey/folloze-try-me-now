import {
  copyContractMetadata,
  sectionCopyWordCount,
  validateSectionCopyCandidate,
  type SectionCopyCandidate,
  type SectionCopyChoice,
  type SectionEvidenceClaim,
  type SectionWriterArtifact,
  type SectionWriterInput,
  type SectionWriterSlot
} from "@/lib/generation/section-copy-types";
import type { WireframeSectionRole } from "@/lib/generation/wireframe-library";

const ownedRoles = new Set<WireframeSectionRole>([
  "pathways",
  "agenda",
  "chapter-navigation",
  "decision-support",
  "resources"
]);

const unsafeCopyPattern =
  /<[^>]+>|```|javascript:|(?:^|\s)(?:const|let|var|function|class|import|export)\s|[.#][a-z0-9_-]+\s*\{|@media\b/i;
const bannedCopyPattern =
  /\b(?:unlock value|transform your business|seamless|best-in-class|make progress with confidence)\b/i;

const headlines: Record<
  Extract<
    WireframeSectionRole,
    "pathways" | "agenda" | "chapter-navigation" | "decision-support" | "resources"
  >,
  string
> = {
  pathways: "Choose what to evaluate first",
  agenda: "A focused agenda for the session",
  "chapter-navigation": "Move through the current evidence",
  "decision-support": "Compare what the decision requires",
  resources: "Continue with supported evidence"
};

type OwnedRole = keyof typeof headlines;

function headlineForSlot(
  slot: SectionWriterSlot,
  input: SectionWriterInput
): string {
  if (slot.v2Role === "use-cases") {
    return "Choose the buyer job that matters most";
  }
  if (slot.v2Role === "evaluation-criteria") {
    return "Evaluate the solution against observable criteria";
  }
  if (slot.v2Role === "applications") {
    return "See where this decision applies in practice";
  }
  if (slot.v2Role === "priority-paths") {
    return "Choose the priority to validate first";
  }
  if (slot.v2Role === "resource") {
    return "Continue with evidence for the next question";
  }
  return slot.role === "decision-support" && isTechnical(input)
    ? "Resolve the technical decision"
    : headlines[slot.role as OwnedRole];
}

const sectionBodies: Record<OwnedRole, string> = {
  pathways:
    "Compare the current evidence and choose the question that matters most to the evaluation.",
  agenda:
    "Move from current context to focused evaluation questions, then identify what still needs validation.",
  "chapter-navigation":
    "Review supported points in sequence while keeping unanswered questions visible.",
  "decision-support":
    "Compare decision requirements, constraints, and validation evidence before choosing a next step.",
  resources:
    "Review the available references, then confirm unanswered details before relying on them."
};

const paddingClauses = [
  "Compare only the current evidence.",
  "Keep unknowns framed as questions.",
  "Validate each point before deciding.",
  "Use the available sources as boundaries."
] as const;

function unique(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value.trim()))].sort();
}

function normalizedText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function safeClaimText(claim: SectionEvidenceClaim): string | undefined {
  const text = normalizedText(claim.text);
  if (!text || unsafeCopyPattern.test(text) || bannedCopyPattern.test(text)) {
    return undefined;
  }
  const words = text.split(/\s+/);
  if (words.length <= 18) return text.replace(/[.?!]+$/, "");

  const firstSentence = text.split(/(?<=[.?!])\s+/, 1)[0];
  if (firstSentence && firstSentence.split(/\s+/).length <= 18) {
    return firstSentence.replace(/[.?!]+$/, "");
  }
  return `the referenced ${claim.sourceRole} evidence`;
}

function currentClaimsForSlot(
  input: SectionWriterInput,
  slot: SectionWriterSlot
): SectionEvidenceClaim[] {
  const allowedRefs = new Set(slot.evidenceRefs);
  const seenText = new Set<string>();
  const claims: SectionEvidenceClaim[] = [];

  for (const claim of input.evidence) {
    if (claim.revision !== input.revision || !allowedRefs.has(claim.id)) continue;
    const safeText = safeClaimText(claim);
    if (!safeText) continue;
    const key = safeText.toLocaleLowerCase();
    if (seenText.has(key)) continue;
    seenText.add(key);
    claims.push(claim);
  }

  return claims;
}

function isTechnical(input: SectionWriterInput): boolean {
  return /\b(?:api|architecture|configuration|constraint|data|deployment|engineering|implementation|integration|platform|requirement|security|technical)\b/i.test(
    [
      input.objective,
      input.brief.audience,
      input.brief.mechanism,
      input.brief.decisionHelp,
      ...input.evidence.map(({ text }) => text)
    ].join(" ")
  );
}

function richChoiceLabels(
  role: SectionWriterSlot["role"],
  technical: boolean
): readonly [string, string, string] {
  if (role === "agenda") {
    return ["Opening context", "Core discussion", "Questions to resolve"];
  }
  if (role === "chapter-navigation") {
    return ["Start with context", "Explore the detail", "Carry it forward"];
  }
  if (role === "decision-support" && technical) {
    return ["Requirements check", "Constraint review", "Validation evidence"];
  }
  if (role === "decision-support") {
    return ["Outcome fit", "Operating fit", "Evidence fit"];
  }
  if (role === "resources") {
    return ["Evidence to review", "Evidence to compare", "Evidence to validate"];
  }
  return ["Evidence focus", "Evaluation focus", "Validation focus"];
}

function richChoiceBody(
  role: SectionWriterSlot["role"],
  index: number,
  claim: string,
  technical: boolean
): string {
  const templates: Record<number, string> =
    role === "agenda"
      ? {
          0: "Open with the supported context",
          1: "Center the discussion on this evidence",
          2: "Connect this evidence to the next decision"
        }
      : role === "chapter-navigation"
        ? {
            0: "Start with this current evidence",
            1: "Continue with this supported detail",
            2: "Use this evidence to frame the questions that follow"
          }
        : role === "decision-support" && technical
          ? {
              0: "Check the requirement against this supported point",
              1: "Test constraints using this current evidence",
              2: "Ask what validation this supported point requires"
            }
          : role === "decision-support"
            ? {
                0: "Compare the desired outcome with this supported point",
                1: "Test operating fit using this current evidence",
                2: "Ask what further validation this supported point requires"
              }
            : role === "resources"
              ? {
                  0: "Review this current evidence",
                  1: "Use this supported point for comparison",
                  2: "Keep this evidence available for validation"
                }
              : {
                  0: "Review this supported point before choosing a focus",
                  1: "Examine this evidence during the evaluation",
                  2: "Use this supported point to identify the next validation need"
                };
  return `${templates[index]}: ${claim}.`;
}

function sparseChoices(
  role: SectionWriterSlot["role"],
  technical: boolean,
  claims: readonly SectionEvidenceClaim[]
): [SectionCopyChoice, SectionCopyChoice, SectionCopyChoice] {
  const definitions: readonly [
    readonly [string, string],
    readonly [string, string],
    readonly [string, string]
  ] =
    role === "agenda"
      ? [
          ["Frame the topic", "What supported context should open the session?"],
          ["Examine the evidence", "Which current evidence deserves focused discussion?"],
          ["Name open questions", "What must attendees validate before choosing a next step?"]
        ]
      : role === "chapter-navigation"
        ? [
            ["Start with context", "What does the current evidence establish first?"],
            ["Review available evidence", "Which supported detail should be examined next?"],
            ["Carry questions forward", "What remains unresolved after reviewing the evidence?"]
          ]
        : role === "decision-support" && technical
          ? [
              ["Check requirements", "Which technical requirements are supported by current evidence?"],
              ["Test constraints", "Which constraints still need direct validation?"],
              ["Define proof", "What evidence would make the technical decision supportable?"]
            ]
          : role === "decision-support"
            ? [
                ["Confirm the outcome", "What outcome does the current evidence support?"],
                ["Inspect operating fit", "What operating details still need confirmation?"],
                ["Set the evidence bar", "What evidence would support the stated objective?"]
              ]
            : role === "resources"
              ? [
                  ["Review current evidence", "Which current source directly supports the decision?"],
                  ["Locate the gap", "Which unanswered question needs another source?"],
                  ["Confirm before use", "What must be verified before relying on a resource?"]
                ]
              : [
                  [
                    "Confirm the outcome",
                    "What outcome does the current evidence support, and what remains unverified?"
                  ],
                  [
                    "Inspect the mechanism",
                    "What operating details must be confirmed before this path can be evaluated?"
                  ],
                  [
                    "Test decision fit",
                    "What evidence would show whether this option fits the stated objective?"
                  ]
                ];

  const choice = (index: 0 | 1 | 2): SectionCopyChoice => {
    const [label, body] = definitions[index];
    const claim = claims[index % Math.max(claims.length, 1)];
    return {
      label,
      body,
      evidenceRefs: claim ? [claim.id] : []
    };
  };
  return [choice(0), choice(1), choice(2)];
}

function choicesForSlot(
  input: SectionWriterInput,
  slot: SectionWriterSlot,
  claims: readonly SectionEvidenceClaim[]
): [SectionCopyChoice, SectionCopyChoice, SectionCopyChoice] {
  const technical = isTechnical(input);
  if (slot.v2Role === "priority-paths") {
    const targetClaims = claims.filter(({ sourceRole }) => sourceRole === "target");
    const primary = targetClaims[0];
    if (primary) {
      const topic = (claim: SectionEvidenceClaim): string => {
        const selected = safeClaimText(claim)!
          .replace(
            /^[A-Z][\w&.'-]*(?:\s+[A-Z][\w&.'-]*)?\s+(?:is|are|has|have|describes?|emphasizes?|focuses? on|operates?)\s+/i,
            ""
          )
          .replace(/[.!?].*$/, "")
          .split(/\s+/)
          .slice(0, 6);
        while (selected.length > 2 && /^(?:and|or|with|for|to)$/i.test(selected.at(-1)!)) {
          selected.pop();
        }
        return selected.join(" ");
      };
      const secondary = targetClaims[1] ?? primary;
      return [
        {
          label: "Public focus",
          body: `Test ${topic(primary)} against the selected objective.`,
          evidenceRefs: [primary.id]
        },
        {
          label: "Operating fit",
          body: `Compare the supported approach with ${topic(secondary)}.`,
          evidenceRefs: [secondary.id]
        },
        {
          label: "First decision",
          body: `Define what ${input.brief.targetName ?? "the account team"} must validate before choosing a path.`,
          evidenceRefs: [...new Set([primary.id, secondary.id])]
        }
      ];
    }
  }
  if (slot.v2Role === "applications") {
    const definitions = [
      [
        "Operational application",
        "Operational workflow ownership"
      ],
      [
        "Cross-team application",
        "Cross-team coordination trigger"
      ],
      [
        "Expansion application",
        "Validated expansion scope"
      ]
    ] as const;
    const choice = (index: 0 | 1 | 2): SectionCopyChoice => {
      const [label, prefix] = definitions[index];
      const claim = claims[index % Math.max(claims.length, 1)];
      const detail = claim ? safeClaimText(claim) : undefined;
      return {
        label,
        body: `${prefix}: ${detail ?? "confirm the relevant evidence before choosing this scenario"}.`,
        evidenceRefs: claim ? [claim.id] : []
      };
    };
    return [choice(0), choice(1), choice(2)];
  }
  if (claims.length < 3) return sparseChoices(slot.role, technical, claims);

  const labels = richChoiceLabels(slot.role, technical);
  const choice = (index: 0 | 1 | 2): SectionCopyChoice => {
    const claim = claims[index]!;
    return {
      label: labels[index],
      body: richChoiceBody(slot.role, index, safeClaimText(claim)!, technical),
      evidenceRefs: [claim.id]
    };
  };
  return [choice(0), choice(1), choice(2)];
}

function fitCandidateToBudget(
  candidate: SectionCopyCandidate,
  slot: SectionWriterSlot
): SectionCopyCandidate | undefined {
  candidate.wordCount = sectionCopyWordCount(candidate);
  if (candidate.wordCount > slot.wordBudget.max) return undefined;

  for (const clause of paddingClauses) {
    if (candidate.wordCount >= slot.wordBudget.min) break;
    const body = `${candidate.body} ${clause}`;
    const next = { ...candidate, body };
    const nextCount = sectionCopyWordCount(next);
    if (nextCount <= slot.wordBudget.max) {
      candidate.body = body;
      candidate.wordCount = nextCount;
    }
  }

  return candidate.wordCount >= slot.wordBudget.min ? candidate : undefined;
}

function candidateForSlot(
  input: SectionWriterInput,
  slot: SectionWriterSlot
): { candidate?: SectionCopyCandidate; sparse: boolean } {
  const claims = currentClaimsForSlot(input, slot);
  const role = slot.role as OwnedRole;
  const build = (
    choices: [SectionCopyChoice, SectionCopyChoice, SectionCopyChoice]
  ): SectionCopyCandidate | undefined => {
    const evidenceRefs = unique(
      choices.flatMap((choice) => choice.evidenceRefs)
    );
    return fitCandidateToBudget({
      sectionId: slot.id,
      role: slot.role,
      ...copyContractMetadata(slot),
      status: "complete",
      headline: headlineForSlot(slot, input),
      body:
        slot.v2Role === "priority-paths" && input.brief.targetName
          ? `${input.brief.sellerName ?? "The seller"} and ${input.brief.targetName} can compare the current evidence, then choose the first priority to validate together.`
          : sectionBodies[role],
      choices,
      evidenceRefs,
      wordCount: 0
    }, slot);
  };
  const choices = choicesForSlot(input, slot, claims);
  let candidate = build(choices);
  let usedBudgetFallback = false;
  if (!candidate && slot.family && claims.length >= 3) {
    candidate = build(sparseChoices(slot.role, isTechnical(input), claims));
    usedBudgetFallback = candidate !== undefined;
  }

  return { candidate, sparse: claims.length < 3 || usedBudgetFallback };
}

function failedArtifact(
  input: SectionWriterInput,
  status: "failed" | "stale",
  errorCode: string
): SectionWriterArtifact {
  return {
    worker: "exploration-writer",
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

function invalidSlotRefs(input: SectionWriterInput, slots: readonly SectionWriterSlot[]): boolean {
  const currentIds = new Set(
    input.evidence
      .filter(({ revision }) => revision === input.revision)
      .map(({ id }) => id)
  );
  return slots.some((slot) =>
    slot.evidenceRefs.some((evidenceRef) => !currentIds.has(evidenceRef))
  );
}

/**
 * Writes only exploration-owned section slots. Every choice is revision-bound,
 * evidence-referenced when evidence exists, and constrained by the selected slot.
 */
export function writeExplorationSections(input: SectionWriterInput): SectionWriterArtifact {
  if (
    !Number.isSafeInteger(input.revision) ||
    input.revision < 0 ||
    input.worker !== "exploration-writer"
  ) {
    return failedArtifact(input, "failed", "invalid_exploration_writer_input");
  }
  if (input.revision !== input.activeRevision) {
    return failedArtifact(input, "stale", "exploration_writer_stale_revision");
  }

  const slots = input.slots.filter((slot) => ownedRoles.has(slot.role));
  if (new Set(slots.map(({ id }) => id)).size !== slots.length) {
    return failedArtifact(input, "failed", "exploration_writer_duplicate_slot");
  }
  if (invalidSlotRefs(input, slots)) {
    return failedArtifact(input, "failed", "exploration_writer_invalid_evidence_ref");
  }

  const written = slots.map((slot) => ({
    slot,
    ...candidateForSlot(input, slot)
  }));
  if (written.some(({ candidate }) => candidate === undefined)) {
    return failedArtifact(input, "failed", "exploration_writer_word_budget");
  }

  const candidates = written.map(({ candidate }) => candidate!);
  const hasValidationIssue = candidates.some((candidate, index) => {
    const slot = written[index]!.slot;
    const choiceRefs = candidate.choices?.flatMap((choice) => choice.evidenceRefs) ?? [];
    const currentIds = new Set(
      input.evidence
        .filter(({ revision }) => revision === input.revision)
        .map(({ id }) => id)
    );
    return (
      choiceRefs.some((ref) => !currentIds.has(ref) || !slot.evidenceRefs.includes(ref)) ||
      validateSectionCopyCandidate(candidate, slot, input.revision, input.evidence).length > 0
    );
  });
  if (hasValidationIssue) {
    return failedArtifact(input, "failed", "exploration_writer_invalid_candidate");
  }

  const evidenceRefs = unique(candidates.flatMap((candidate) => candidate.evidenceRefs));
  const confidenceValues = input.evidence
    .filter(
      ({ id, revision }) =>
        revision === input.revision && evidenceRefs.includes(id)
    )
    .map(({ confidence }) =>
      Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0
    );
  const sparse = written.some((item) => item.sparse);
  const confidence = confidenceValues.length
    ? confidenceValues.reduce((sum, value) => sum + value, 0) /
      confidenceValues.length
    : 0;

  return {
    worker: "exploration-writer",
    sessionId: input.sessionId,
    revision: input.revision,
    status: sparse ? "fallback" : "complete",
    value: candidates,
    evidenceRefs,
    confidence: sparse ? Math.min(confidence, 0.55) : confidence,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    ...(sparse
      ? { fallbackCode: "exploration_writer_sparse_evidence" }
      : {})
  };
}
