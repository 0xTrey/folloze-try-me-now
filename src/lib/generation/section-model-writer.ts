import {
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

/** Sections generated concurrently. Keeps provider fan-out bounded per attempt. */
export const SECTION_WRITER_CONCURRENCY = 4;

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

function normalizeChoices(
  candidate: SectionModelCandidate
): SectionCopyCandidate["choices"] {
  const choices = candidate.choices ?? [];
  if (choices.length !== 3) return undefined;
  return [
    { ...choices[0]!, evidenceRefs: [...choices[0]!.evidenceRefs] },
    { ...choices[1]!, evidenceRefs: [...choices[1]!.evidenceRefs] },
    { ...choices[2]!, evidenceRefs: [...choices[2]!.evidenceRefs] }
  ];
}

/**
 * Shapes a provider candidate into the internal contract. Nothing is trusted:
 * unknown CTA ids and unscoped evidence refs are dropped here so the evaluator
 * scores a well-formed candidate rather than raw provider output.
 */
export function normalizeModelCandidate(
  contract: SectionWritingContract,
  candidate: SectionModelCandidate
): SectionCopyCandidate {
  const allowedRefs = new Set(contract.evidenceRefs);
  const base = {
    sectionId: contract.sectionId,
    role: contract.slot.role,
    ...copyContractMetadata(contract.slot),
    evidenceRefs: [...new Set(candidate.evidenceRefs ?? [])]
      .filter((ref) => allowedRefs.has(ref))
      .sort()
  };

  if (candidate.omit) {
    return {
      ...base,
      status: "omitted",
      omissionReason: candidate.omissionReason ?? "unsupported_optional_slot",
      wordCount: 0
    };
  }

  const cta =
    candidate.cta
    && candidate.cta.id
    && contract.allowedCtas.includes(candidate.cta.id as never)
      ? {
          id: candidate.cta.id as NonNullable<SectionCopyCandidate["cta"]>["id"],
          label: candidate.cta.label,
          type: candidate.cta.type as NonNullable<SectionCopyCandidate["cta"]>["type"]
        }
      : undefined;

  const shaped: SectionCopyCandidate = {
    ...base,
    status: "complete",
    ...(candidate.eyebrow ? { eyebrow: candidate.eyebrow.trim() } : {}),
    ...(candidate.headline ? { headline: candidate.headline.trim() } : {}),
    ...(candidate.body ? { body: candidate.body.trim() } : {}),
    ...(normalizeChoices(candidate) ? { choices: normalizeChoices(candidate) } : {}),
    ...(cta ? { cta } : {}),
    wordCount: 0
  };
  return { ...shaped, wordCount: sectionCopyWordCount(shaped) };
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
    return {
      results: contracts.map((contract) => fallbackFor(contract, "provider_unavailable", 0)),
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

  let attempts: Attempt[];
  try {
    attempts = await mapWithConcurrency(
      contracts,
      input.concurrency ?? SECTION_WRITER_CONCURRENCY,
      async (contract): Promise<Attempt> => {
        const sectionStartedAt = now();
        if (now() >= deadlineAt || signal.aborted) {
          deadlineExceeded = true;
          return { contract, candidates: [], outcome: "deadline", durationMs: 0 };
        }
        try {
          const response = await client.writeSection(contract, signal);
          const durationMs = now() - sectionStartedAt;
          if (
            !response
            || response.sectionId !== contract.sectionId
            || !Array.isArray(response.candidates)
            || response.candidates.length === 0
          ) {
            return { contract, candidates: [], outcome: "malformed_response", durationMs };
          }
          return {
            contract,
            candidates: response.candidates
              .slice(0, contract.candidateCount)
              .map((candidate) => normalizeModelCandidate(contract, candidate)),
            outcome: "model",
            durationMs
          };
        } catch (error) {
          const durationMs = now() - sectionStartedAt;
          const aborted =
            signal.aborted || (error instanceof Error && error.name === "AbortError");
          if (aborted) deadlineExceeded = true;
          return {
            contract,
            candidates: [],
            outcome: aborted ? "deadline" : "provider_error",
            durationMs
          };
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
      outcome: "model",
      selection,
      durationMs: attempt.durationMs
    };
  });

  const modelSectionCount = results.filter(({ outcome }) => outcome === "model").length;
  return {
    results,
    modelSectionCount,
    fallbackSectionCount: results.length - modelSectionCount,
    durationMs: now() - startedAt,
    deadlineExceeded
  };
}
