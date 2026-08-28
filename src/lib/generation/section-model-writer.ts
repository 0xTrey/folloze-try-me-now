import {
  boundedCtaV2,
  copyContractMetadata,
  sectionCopyWordCount,
  type SectionCopyCandidate,
  type SectionCopyChoice
} from "@/lib/generation/section-copy-types";
import {
  selectSectionCopy,
  type SectionSelection
} from "@/lib/generation/section-candidate-review";
import type { SectionWritingContract } from "@/lib/generation/section-writing-contract";
import type { CtaIdV2 } from "@/lib/generation/three-family-contract";

/** Sections generated concurrently. Keeps provider fan-out bounded per attempt. */
export const SECTION_WRITER_CONCURRENCY = 4;

/**
 * Hard limits on anything a provider returns.
 *
 * A candidate that breaks one of these is discarded rather than trimmed:
 * truncating a 4,000-character body produces a sentence that stops mid-word,
 * which is worse copy than the deterministic fallback it would displace.
 */
export const SECTION_MODEL_BOUNDS = {
  candidates: 4,
  eyebrowChars: 80,
  headlineChars: 180,
  bodyChars: 1200,
  choices: 3,
  choiceLabelChars: 90,
  choiceBodyChars: 400,
  ctaLabelChars: 60,
  evidenceRefs: 16
} as const;

/** Markup, control characters, and replacement characters are never copy. */
const UNSAFE_COPY = /[<>]|[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]|\uFFFD/;

const ALLOWED_CANDIDATE_FIELDS = new Set([
  "eyebrow",
  "headline",
  "body",
  "choices",
  "cta",
  "evidenceRefs",
  "omit",
  "omissionReason"
]);

/** Returns the trimmed text, or `undefined` when it breaks a bound. */
function boundedCopy(value: unknown, maxChars: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxChars) return undefined;
  if (UNSAFE_COPY.test(trimmed)) return undefined;
  return trimmed;
}

export type SectionWriterOutcome =
  | "model"
  | "model_partial"
  | "deadline"
  | "provider_unavailable"
  | "provider_error"
  | "malformed_response"
  | "quality_rejected";

export interface SectionModelCandidate {
  eyebrow?: string;
  headline?: string;
  body?: string;
  choices?: readonly SectionCopyChoice[];
  cta?: { id?: string; label: string; type: string };
  evidenceRefs?: readonly string[];
  omit?: boolean;
  omissionReason?: SectionCopyCandidate["omissionReason"];
}

export interface SectionModelResponse {
  sectionId: string;
  candidates: readonly SectionModelCandidate[];
}

export interface SectionModelClient {
  /**
   * Returns every requested candidate for one section in one structured
   * response. Implementations must honour the abort signal.
   */
  writeSection(
    contract: SectionWritingContract,
    signal: AbortSignal
  ): Promise<SectionModelResponse>;
}

export interface SectionWriterRunInput {
  contracts: readonly SectionWritingContract[];
  /** Absent when no provider is configured; the run then falls back cleanly. */
  client?: SectionModelClient;
  /** Deterministic copy used whenever the provider cannot deliver. */
  fallback: (contract: SectionWritingContract) => SectionCopyCandidate;
  /** Wall-clock budget for the whole writing stage. */
  deadlineMs: number;
  concurrency?: number;
  now?: () => number;
  signal?: AbortSignal;
  /** Receipt-backed progress for each retained section completion. */
  onSectionWritten?: (completed: number, total: number) => void | Promise<void>;
}

export interface SectionWriterResult {
  sectionId: string;
  candidate: SectionCopyCandidate;
  outcome: SectionWriterOutcome;
  selection?: SectionSelection;
  durationMs: number;
}

export interface SectionWriterRunResult {
  results: SectionWriterResult[];
  modelSectionCount: number;
  fallbackSectionCount: number;
  durationMs: number;
  deadlineExceeded: boolean;
}

/** The only reasons a section may declare for leaving itself out. */
const OMISSION_REASONS = new Set<NonNullable<SectionCopyCandidate["omissionReason"]>>([
  "unsupported_optional_slot",
  "no_current_evidence"
]);

/**
 * Every evidence reference a candidate cites, including the ones on its
 * choices. A provider that reaches outside its contract for any of them has
 * crossed the evidence boundary, and repairing that quietly would turn a
 * reportable violation into an accepted section.
 */
function citedRefs(candidate: SectionModelCandidate): string[] {
  return [
    ...(candidate.evidenceRefs ?? []),
    ...(candidate.choices ?? []).flatMap((choice) => choice?.evidenceRefs ?? [])
  ];
}

function normalizeChoices(
  candidate: SectionModelCandidate,
  allowedRefs: ReadonlySet<string>
): SectionCopyCandidate["choices"] | "invalid" | undefined {
  const choices = candidate.choices ?? [];
  if (!choices.length) return undefined;
  if (choices.length !== SECTION_MODEL_BOUNDS.choices) return "invalid";
  const bounded = choices.map((choice) => {
    const label = boundedCopy(choice?.label, SECTION_MODEL_BOUNDS.choiceLabelChars);
    const body = boundedCopy(choice?.body, SECTION_MODEL_BOUNDS.choiceBodyChars);
    if (!label || !body) return undefined;
    const refs = [...new Set(choice.evidenceRefs ?? [])].filter((ref) => allowedRefs.has(ref));
    if (refs.length > SECTION_MODEL_BOUNDS.evidenceRefs) return undefined;
    return { label, body, evidenceRefs: refs };
  });
  if (bounded.some((choice) => !choice)) return "invalid";
  return [bounded[0]!, bounded[1]!, bounded[2]!];
}

/**
 * Shapes a provider candidate into the internal contract, or rejects it.
 *
 * Nothing is trusted. A field the contract does not define, copy that carries
 * markup or control characters, a CTA outside the allowed set, an unscoped
 * evidence reference, or any value past its bound means the candidate is
 * discarded, not repaired.
 */
export function normalizeModelCandidate(
  contract: SectionWritingContract,
  candidate: SectionModelCandidate
): SectionCopyCandidate | undefined {
  if (!candidate || typeof candidate !== "object") return undefined;
  for (const field of Object.keys(candidate)) {
    if (!ALLOWED_CANDIDATE_FIELDS.has(field)) return undefined;
  }

  const allowedRefs = new Set(contract.evidenceRefs);
  // One reference outside the contract rejects the whole candidate. Filtering
  // it away would hand back an accepted section built on evidence the section
  // was never scoped to read.
  if (citedRefs(candidate).some((ref) => !allowedRefs.has(ref))) return undefined;
  const evidenceRefs = [...new Set(candidate.evidenceRefs ?? [])].sort();
  if (evidenceRefs.length > SECTION_MODEL_BOUNDS.evidenceRefs) return undefined;
  const base = {
    sectionId: contract.sectionId,
    role: contract.slot.role,
    ...copyContractMetadata(contract.slot),
    evidenceRefs
  };

  if (candidate.omit) {
    const omissionReason = candidate.omissionReason ?? "unsupported_optional_slot";
    if (!OMISSION_REASONS.has(omissionReason)) return undefined;
    return {
      ...base,
      status: "omitted",
      omissionReason,
      wordCount: 0
    };
  }

  // The library owns the label and type for every allowed CTA, so a provider
  // can pick one but can never define what it says or how it behaves.
  let cta: SectionCopyCandidate["cta"];
  if (candidate.cta) {
    const id = candidate.cta.id;
    if (!id || !contract.allowedCtas.includes(id as CtaIdV2)) return undefined;
    const bounded = boundedCtaV2(id as CtaIdV2);
    if (bounded.label.length > SECTION_MODEL_BOUNDS.ctaLabelChars) return undefined;
    cta = {
      id: bounded.id as NonNullable<SectionCopyCandidate["cta"]>["id"],
      label: bounded.label,
      type: bounded.type
    };
  }

  const eyebrow =
    candidate.eyebrow === undefined
      ? undefined
      : boundedCopy(candidate.eyebrow, SECTION_MODEL_BOUNDS.eyebrowChars);
  const headline =
    candidate.headline === undefined
      ? undefined
      : boundedCopy(candidate.headline, SECTION_MODEL_BOUNDS.headlineChars);
  const body =
    candidate.body === undefined
      ? undefined
      : boundedCopy(candidate.body, SECTION_MODEL_BOUNDS.bodyChars);
  if (
    (candidate.eyebrow !== undefined && !eyebrow)
    || (candidate.headline !== undefined && !headline)
    || (candidate.body !== undefined && !body)
  ) {
    return undefined;
  }

  const choices = normalizeChoices(candidate, allowedRefs);
  if (choices === "invalid") return undefined;

  const shaped: SectionCopyCandidate = {
    ...base,
    status: "complete",
    ...(eyebrow ? { eyebrow } : {}),
    ...(headline ? { headline } : {}),
    ...(body ? { body } : {}),
    ...(choices ? { choices } : {}),
    ...(cta ? { cta } : {}),
    wordCount: 0
  };
  return { ...shaped, wordCount: sectionCopyWordCount(shaped) };
}

/**
 * Rejects when the stage runs out of time. Losing this race abandons the
 * provider call rather than cancelling it, which is the point: an
 * unresponsive provider must not be able to extend the deadline.
 */
function abortedAfter(signal: AbortSignal, remainingMs: number): Promise<never> {
  return new Promise((_resolve, reject) => {
    const fail = () => {
      const error = new Error("Section writing deadline exceeded");
      error.name = "AbortError";
      reject(error);
    };
    if (signal.aborted) {
      fail();
      return;
    }
    const timer = setTimeout(fail, remainingMs);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        fail();
      },
      { once: true }
    );
  });
}

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index]!, index);
    }
  });
  await Promise.all(runners);
  return results;
}

/**
 * Runs every section contract through the provider in bounded parallel, then
 * evaluates and de-duplicates the results. A section that cannot produce
 * acceptable copy inside the deadline falls back to its own deterministic
 * writer, so a provider outage degrades copy quality instead of the render.
 */
export async function runSectionWriters(
  input: SectionWriterRunInput
): Promise<SectionWriterRunResult> {
  const now = input.now ?? Date.now;
  const startedAt = now();
  const deadlineAt = startedAt + input.deadlineMs;
  const contracts = [...input.contracts].sort((left, right) => left.order - right.order);

  const fallbackFor = (
    contract: SectionWritingContract,
    outcome: SectionWriterOutcome,
    durationMs: number
  ): SectionWriterResult => ({
    sectionId: contract.sectionId,
    candidate: input.fallback(contract),
    outcome,
    durationMs
  });

  if (!input.client) {
    let completed = 0;
    const results = [];
    for (const contract of contracts) {
      results.push(fallbackFor(contract, "provider_unavailable", 0));
      completed += 1;
      await input.onSectionWritten?.(completed, contracts.length);
    }
    return {
      results,
      modelSectionCount: 0,
      fallbackSectionCount: contracts.length,
      durationMs: now() - startedAt,
      deadlineExceeded: false
    };
  }

  const client = input.client;
  const controller = new AbortController();
  const remaining = Math.max(0, deadlineAt - now());
  const timer = setTimeout(() => controller.abort(), remaining);
  const signal = input.signal
    ? AbortSignal.any([controller.signal, input.signal])
    : controller.signal;

  let deadlineExceeded = false;
  type Attempt = {
    contract: SectionWritingContract;
    candidates: SectionCopyCandidate[];
    outcome: SectionWriterOutcome;
    durationMs: number;
  };

  let completedSections = 0;
  const reportSectionWritten = async () => {
    completedSections += 1;
    await input.onSectionWritten?.(completedSections, contracts.length);
  };

  let attempts: Attempt[];
  try {
    attempts = await mapWithConcurrency(
      contracts,
      input.concurrency ?? SECTION_WRITER_CONCURRENCY,
      async (contract): Promise<Attempt> => {
        const sectionStartedAt = now();
        if (now() >= deadlineAt || signal.aborted) {
          deadlineExceeded = true;
          const attempt = { contract, candidates: [], outcome: "deadline" as const, durationMs: 0 };
          await reportSectionWritten();
          return attempt;
        }
        try {
          // Racing the abort signal, not just passing it: a provider that
          // ignores the signal would otherwise hold the whole stage open past
          // its budget, and the deadline would be advisory rather than real.
          const response = await Promise.race([
            client.writeSection(contract, signal),
            abortedAfter(signal, Math.max(0, deadlineAt - now()))
          ]);
          const durationMs = now() - sectionStartedAt;
          if (
            !response
            || response.sectionId !== contract.sectionId
            || !Array.isArray(response.candidates)
            || response.candidates.length === 0
          ) {
            const attempt = {
              contract,
              candidates: [],
              outcome: "malformed_response" as const,
              durationMs
            };
            await reportSectionWritten();
            return attempt;
          }
          const requested = response.candidates.slice(
            0,
            Math.min(contract.candidateCount, SECTION_MODEL_BOUNDS.candidates)
          );
          const candidates = requested
            .map((candidate) => normalizeModelCandidate(contract, candidate))
            .filter((candidate): candidate is SectionCopyCandidate => Boolean(candidate));
          const attempt = {
            contract,
            candidates,
            // A provider whose candidates were partly discarded still wrote the
            // section, but the choice was made from a narrower field. Saying so
            // keeps a thin selection distinguishable from a full one in the
            // receipt instead of both reading as a clean model win. When
            // nothing survives, the provider wrote nothing usable and the
            // receipt must not credit it with the section at all.
            outcome: !candidates.length
              ? "malformed_response"
              : candidates.length < requested.length
                ? "model_partial"
                : "model",
            durationMs
          } satisfies Attempt;
          await reportSectionWritten();
          return attempt;
        } catch (error) {
          const durationMs = now() - sectionStartedAt;
          const aborted =
            signal.aborted || (error instanceof Error && error.name === "AbortError");
          if (aborted) deadlineExceeded = true;
          const attempt = {
            contract,
            candidates: [],
            outcome: aborted ? "deadline" : "provider_error",
            durationMs
          } satisfies Attempt;
          await reportSectionWritten();
          return attempt;
        }
      }
    );
  } finally {
    clearTimeout(timer);
  }

  const selections = selectSectionCopy(
    attempts
      .filter((attempt) => attempt.candidates.length)
      .map(({ contract, candidates }) => ({ contract, candidates }))
  );
  const selectionById = new Map(selections.map((selection) => [selection.sectionId, selection]));

  const results = attempts.map((attempt): SectionWriterResult => {
    const selection = selectionById.get(attempt.contract.sectionId);
    if (!attempt.candidates.length) {
      return fallbackFor(attempt.contract, attempt.outcome, attempt.durationMs);
    }
    if (!selection?.candidate) {
      return {
        ...fallbackFor(attempt.contract, "quality_rejected", attempt.durationMs),
        ...(selection ? { selection } : {})
      };
    }
    return {
      sectionId: attempt.contract.sectionId,
      candidate: selection.candidate,
      outcome: attempt.outcome,
      selection,
      durationMs: attempt.durationMs
    };
  });

  const modelSectionCount = results.filter(
    ({ outcome }) => outcome === "model" || outcome === "model_partial"
  ).length;
  return {
    results,
    modelSectionCount,
    fallbackSectionCount: results.length - modelSectionCount,
    durationMs: now() - startedAt,
    deadlineExceeded
  };
}
