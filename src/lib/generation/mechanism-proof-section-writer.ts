import {
  copyContractMetadata,
  sectionCopyWordCount,
  validateSectionCopyCandidate,
  type SectionCopyCandidate,
  type SectionEvidenceClaim,
  type SectionWriterArtifact,
  type SectionWriterInput,
  type SectionWriterSlot
} from "@/lib/generation/section-copy-types";

const OWNED_ROLES = new Set<SectionWriterSlot["role"]>(["mechanism", "proof"]);

const UNSAFE_COPY_PATTERN =
  /<\/?[a-z][^>]*>|```|^\s{0,3}(?:#{1,6}\s|[-*+]\s|\d+\.\s)|\[[^\]]+\]\([^)]+\)|\b(?:const|let|var|function|class|interface|import|export)\s+[a-z_$]|[.#]?[a-z][\w-]*\s*\{[^}]*\}/im;

const MECHANISM_PADDING = [
  "Trace each supported element from input through action to output.",
  "Confirm prerequisites, ownership, and handoffs against the actual workflow.",
  "Treat implementation details outside the cited evidence as validation questions.",
  "Check the described sequence against operating constraints before deciding fit.",
  "Verify where each handoff begins, who owns it, and what it produces.",
  "Test the supported mechanism with representative inputs before expanding its scope.",
  "Keep unreferenced capabilities, integrations, and operating steps out of the conclusion.",
  "Compare the supported sequence with current processes and document any unresolved gaps."
] as const;

const PROOF_PADDING = [
  "Use the cited sources to confirm scope, context, and applicability.",
  "Treat outcomes, customer examples, and quantities outside those sources as validation questions.",
  "Check whether the evidence matches the intended audience and use case.",
  "Confirm comparison terms and time periods before relying on them.",
  "Separate what the source demonstrates from what still requires evaluation.",
  "Review the source conditions before applying its conclusions to another team.",
  "Validate relevance, repeatability, and operating fit with the people responsible for the decision.",
  "Keep every conclusion bounded to the evidence available for this revision."
] as const;

const SHORT_PADDING = [
  "Confirm scope.",
  "Validate fit.",
  "Review prerequisites.",
  "Check applicability.",
  "Verify."
] as const;

function words(value: string): number {
  return value.trim() ? value.trim().split(/\s+/).length : 0;
}

function normalizedSentence(value: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return /[.!?]$/.test(normalized) ? normalized : `${normalized}.`;
}

function evidenceTopic(value: string, maxWords: number): string | undefined {
  const normalized = value
    .replace(/\s+/g, " ")
    .trim()
    .replace(
      /^[A-Z][\w&.'-]*(?:\s+[A-Z][\w&.'-]*)?\s+(?:is|are|has|have|describes?|emphasizes?|focuses? on|operates?)\s+/i,
      ""
    )
    .replace(
      /^(?:advancing|evaluating|expanding|investing in|prioritizing|publishing|scaling)\s+/i,
      ""
    )
    .replace(/[.!?].*$/, "")
    .replace(/[,:;]$/, "");
  const selected = normalized.split(/\s+/).slice(0, Math.max(2, maxWords));
  const qualifierAt = selected.findIndex(
    (word, index) => index >= 2 && /^(?:across|for|in|on|through|with)$/i.test(word)
  );
  if (qualifierAt >= 2) selected.splice(qualifierAt);
  while (selected.length > 2 && /^(?:across|and|for|in|on|or|through|to|with)$/i.test(selected.at(-1)!)) {
    selected.pop();
  }
  return selected.length >= 2 ? selected.join(" ") : undefined;
}

function targetHeadline(
  slot: SectionWriterSlot,
  claims: readonly SectionEvidenceClaim[]
): string | undefined {
  if (slot.v2Role !== "shared-opportunity") return undefined;
  const claim = claims.find(({ sourceRole }) => sourceRole === "target");
  if (!claim) return undefined;
  const maxHeadlineWords = slot.headlineWordBudget?.max ?? 11;
  const topic = evidenceTopic(claim.text, Math.min(4, maxHeadlineWords - 6));
  return topic ? `Turn ${topic} into a testable workstream` : undefined;
}

function safeClaim(claim: SectionEvidenceClaim): boolean {
  return (
    claim.text.trim().length > 0 &&
    Number.isFinite(claim.confidence) &&
    claim.confidence >= 0 &&
    claim.confidence <= 1 &&
    !UNSAFE_COPY_PATTERN.test(claim.text)
  );
}

function leadUsesClaimTopic(lead: string, claim: string): boolean {
  const ignored = new Set([
    "about", "across", "against", "and", "for", "from", "into", "the", "then", "through", "to", "with"
  ]);
  const terms = (value: string): Set<string> =>
    new Set(
      value
        .toLocaleLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, " ")
        .trim()
        .split(/\s+/)
        .filter((term) => term.length > 1 && !ignored.has(term))
    );
  const leadTerms = terms(lead);
  return [...terms(claim)].filter((term) => leadTerms.has(term)).length >= 2;
}

function currentClaimsForSlot(
  input: SectionWriterInput,
  slot: SectionWriterSlot
): SectionEvidenceClaim[] {
  const currentById = new Map(
    input.evidence
      .filter((claim) => claim.revision === input.revision && safeClaim(claim))
      .map((claim) => [claim.id, claim])
  );
  return [...new Set(slot.evidenceRefs)]
    .map((id) => currentById.get(id))
    .filter((claim): claim is SectionEvidenceClaim => claim !== undefined);
}

function appendWithinBudget(
  body: string,
  sentence: string,
  headlineWords: number,
  maxWords: number
): string | undefined {
  const candidate = body ? `${body} ${sentence}` : sentence;
  return headlineWords + words(candidate) <= maxWords ? candidate : undefined;
}

function padToMinimum(
  body: string,
  headlineWords: number,
  slot: SectionWriterSlot,
  padding: readonly string[]
): string | undefined {
  let result = body;
  for (const sentence of [...padding, ...SHORT_PADDING]) {
    if (headlineWords + words(result) >= slot.wordBudget.min) break;
    const appended = appendWithinBudget(
      result,
      sentence,
      headlineWords,
      slot.wordBudget.max
    );
    if (appended) result = appended;
  }
  return headlineWords + words(result) >= slot.wordBudget.min ? result : undefined;
}

function supportedBody(
  role: "mechanism" | "proof",
  claims: readonly SectionEvidenceClaim[],
  headlineWords: number,
  slot: SectionWriterSlot,
  directLead?: string
): { body: string; claims: SectionEvidenceClaim[] } | undefined {
  const prefix = directLead
    ? normalizedSentence(directLead)
    :
    role === "mechanism"
      ? "Current evidence describes the operating mechanism:"
      : "Current evidence supports these points:";
  let body = prefix;
  const selected: SectionEvidenceClaim[] = [];

  for (const claim of claims) {
    if (directLead && leadUsesClaimTopic(directLead, claim.text)) {
      selected.push(claim);
      continue;
    }
    const appended = appendWithinBudget(
      body,
      normalizedSentence(claim.text),
      headlineWords,
      slot.wordBudget.max
    );
    if (!appended) continue;
    body = appended;
    selected.push(claim);
  }

  if (selected.length === 0) return undefined;
  const padded = padToMinimum(
    body,
    headlineWords,
    slot,
    role === "mechanism" ? MECHANISM_PADDING : PROOF_PADDING
  );
  return padded ? { body: padded, claims: selected } : undefined;
}

function validationBody(
  role: "mechanism" | "proof",
  headlineWords: number,
  slot: SectionWriterSlot
): string | undefined {
  const body =
    role === "mechanism"
      ? "Current evidence does not establish an operating mechanism. Validate the inputs, actions, handoffs, and outputs before treating the approach as a fit."
      : "Current evidence does not support a declarative proof claim. Validate the mechanism, expected outcome, applicability, and fit using approved sources before relying on them. Confirm any customer example, quantified result, timeline, or comparison separately; none is asserted here.";
  if (headlineWords + words(body) > slot.wordBudget.max) return undefined;
  return padToMinimum(
    body,
    headlineWords,
    slot,
    role === "mechanism" ? MECHANISM_PADDING : PROOF_PADDING
  );
}

function omittedCandidate(slot: SectionWriterSlot): SectionCopyCandidate {
  return {
    sectionId: slot.id,
    role: slot.role,
    ...copyContractMetadata(slot),
    status: "omitted",
    evidenceRefs: [],
    wordCount: 0,
    omissionReason: "no_current_evidence"
  };
}

function headlineForSlot(
  slot: SectionWriterSlot,
  role: "mechanism" | "proof"
): string {
  if (slot.v2Role === "mechanism") {
    return "How the supported change works in practice";
  }
  if (slot.v2Role === "proof") {
    return "What the available evidence supports now";
  }
  if (slot.v2Role === "solution-mapping") {
    return "How the solution answers each evaluation criterion";
  }
  if (slot.v2Role === "shared-opportunity") {
    return "Turn the shared priority into practical workstreams";
  }
  if (slot.v2Role === "validation-plan") {
    return "Use relevant proof or a clear validation plan";
  }
  if (slot.v2Role === "proof-depth") {
    return "Review additional evidence for this decision";
  }
  return role === "mechanism"
    ? "How the mechanism works"
    : "What the evidence supports";
}

function completeCandidate(
  slot: SectionWriterSlot,
  role: "mechanism" | "proof",
  body: string,
  evidenceRefs: readonly string[],
  headlineOverride?: string
): SectionCopyCandidate {
  const headline = headlineOverride ?? headlineForSlot(slot, role);
  const candidate: SectionCopyCandidate = {
    sectionId: slot.id,
    role,
    ...copyContractMetadata(slot),
    status: "complete",
    headline,
    body,
    evidenceRefs,
    wordCount: 0
  };
  candidate.wordCount = sectionCopyWordCount(candidate);
  return candidate;
}

function failedArtifact(
  input: SectionWriterInput,
  status: "failed" | "stale",
  errorCode: string
): SectionWriterArtifact {
  return {
    worker: "mechanism-proof-writer",
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

/**
 * Writes only mechanism and proof slots. Copy is deterministic and bounded to
 * current-revision claims explicitly assigned to each slot.
 */
export function writeMechanismProofSections(
  input: SectionWriterInput
): SectionWriterArtifact {
  if (!Number.isSafeInteger(input.revision) || input.revision < 0) {
    return failedArtifact(
      input,
      "failed",
      "invalid_mechanism_proof_writer_revision"
    );
  }
  if (input.revision !== input.activeRevision) {
    return failedArtifact(
      input,
      "stale",
      "mechanism_proof_writer_stale_revision"
    );
  }
  if (input.worker !== "mechanism-proof-writer") {
    return failedArtifact(
      input,
      "failed",
      "mechanism_proof_writer_worker_mismatch"
    );
  }

  const slots = input.slots.filter((slot) => OWNED_ROLES.has(slot.role));
  if (slots.length === 0) {
    return failedArtifact(input, "failed", "mechanism_proof_writer_no_owned_slots");
  }

  const candidates: SectionCopyCandidate[] = [];
  const usedClaims: SectionEvidenceClaim[] = [];
  let usedFallback = false;

  for (const slot of slots) {
    const role = slot.role as "mechanism" | "proof";
    const claims = currentClaimsForSlot(input, slot);
    const headline = targetHeadline(slot, claims) ?? headlineForSlot(slot, role);
    const supported = supportedBody(
      role,
      claims,
      words(headline),
      slot,
      slot.v2Role === "shared-opportunity" ? input.brief.mechanism : undefined
    );

    if (supported) {
      candidates.push(
        completeCandidate(
          slot,
          role,
          supported.body,
          supported.claims.map(({ id }) => id),
          headline
        )
      );
      usedClaims.push(...supported.claims);
      continue;
    }

    usedFallback = true;
    if (role === "mechanism" && !slot.required) {
      candidates.push(omittedCandidate(slot));
      continue;
    }
    const body = validationBody(role, words(headline), slot);
    if (!body) {
      return failedArtifact(
        input,
        "failed",
        "mechanism_proof_writer_word_budget_unusable"
      );
    }
    candidates.push(completeCandidate(slot, role, body, []));
  }

  if (
    candidates.some((candidate, index) =>
      validateSectionCopyCandidate(
        candidate,
        slots[index]!,
        input.revision,
        input.evidence
      ).length > 0
    )
  ) {
    return failedArtifact(
      input,
      "failed",
      "mechanism_proof_writer_candidate_invalid"
    );
  }

  const uniqueClaims = [...new Map(usedClaims.map((claim) => [claim.id, claim])).values()];
  const evidenceRefs = uniqueClaims.map(({ id }) => id);
  const confidence =
    uniqueClaims.length > 0
      ? Math.min(...uniqueClaims.map(({ confidence: value }) => value))
      : 0;

  return {
    worker: "mechanism-proof-writer",
    sessionId: input.sessionId,
    revision: input.revision,
    status: usedFallback ? "fallback" : "complete",
    value: candidates,
    evidenceRefs,
    confidence: usedFallback ? Math.min(confidence, 0.55) : confidence,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    ...(usedFallback
      ? { fallbackCode: "mechanism_proof_writer_validation_required" }
      : {})
  };
}
