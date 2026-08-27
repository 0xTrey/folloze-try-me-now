# Architecture and scope

## Current architecture to preserve

The product is already a partial compiler:

| Layer | Current authority |
| --- | --- |
| Campaign brief | `src/lib/types.ts` |
| Evidence reconciliation | `src/lib/research/evidence-reconciler.ts` |
| Message framework and spine | `src/lib/generation/message-spine.ts`, `production-message-spine.ts` |
| Wireframe family and section plan | `three-family-contract.ts`, `wireframe-library.ts` |
| Section instructions | `section-writing-contract.ts` |
| Candidate generation and review | `section-model-writer.ts`, `section-candidate-review.ts` |
| Production assembly | `generic-production-engine.ts`, `session-production-engine.ts` |
| Personalization | `personalization-preview.ts` |
| Rendering | `experience-renderers.ts`, `experience-template.ts` |
| Provenance | `production-build-trace.ts`, `build-trace.ts`, `trace-store.ts` |
| Timing | `generation-budget.ts`, `preview-benchmark.ts` |

The implementation must extend these authorities rather than introduce a parallel product stack.

## Missing compiler layer

The current framework ranker chooses one framework before prose. It does not persist a useful set of competing strategies or score their quality as complete arguments. Add four private, versioned artifacts:

```ts
interface CompilerEvidenceItem {
  id: string;
  kind: "fact" | "inference" | "visitor-context";
  claim: string;
  sourceAuthority: string;
  sourceRef: string;
  confidence: "high" | "medium" | "low";
  allowedUses: readonly MessageSpineSectionUse[];
  prohibitedUses: readonly string[];
}

interface MessageStrategyCandidate {
  id: string;
  version: string;
  frameworkId: MessageFrameworkId;
  angle: "tension" | "upside" | "mechanism" | "proof";
  audienceJob: string;
  tension?: string;
  bigIdea: string;
  promise: string;
  mechanism: string;
  proofPlan: string;
  objectionPlan: string;
  ctaLogic: string;
  evidenceRefs: string[];
  unknowns: string[];
}

interface StrategyEvaluation {
  candidateId: string;
  /** Weighted strategy-quality score from 0 through 100. */
  total: number;
  /** Each component is normalized from 0 through 100 before weighting. */
  dimensions: {
    audienceRelevance: number;
    offerSpecificity: number;
    differentiation: number;
    evidenceStrength: number;
    narrativeCoherence: number;
    ctaAlignment: number;
  };
  hardFailures: string[];
  reasonCodes: string[];
}

interface MessagingCompilerArtifact {
  schemaVersion: "1.0";
  compilerVersion: string;
  briefRevision: number;
  evidenceLedger: CompilerEvidenceItem[];
  strategies: MessageStrategyCandidate[];
  evaluations: StrategyEvaluation[];
  selectedStrategyId: string;
  pagePlan: {
    family: WireframeFamilyV2;
    sectionPlan: Array<{ id: string; role: SectionRoleV2; strategyJobs: string[] }>;
  };
  baseExperienceDigest?: string;
  variantPatchDigests?: string[];
}
```

Exact names may change to fit local conventions. The behavior and provenance may not.

## Compile sequence

1. Normalize the visitor brief and existing CampaignBrief.
2. Adapt existing `SessionEvidenceItem` and reconciled evidence into one private compiler ledger.
3. Generate three or four deterministic strategy candidates from the existing ranked frameworks, route, audience job, offer, objective, CTA, proof density, and known unknowns.
   - Candidate order and IDs are stable for identical inputs.
   - Candidates use at least three materially different supported angles or frameworks when evidence permits.
   - A different headline on the same argument does not count as a different strategy.
4. Reject candidates with wrong identity, unresolved evidence references, unsupported facts, generic audience language, or CTA mismatch.
5. Score remaining candidates with deterministic weighted evaluation.
   - Audience relevance: 20 percent.
   - Offer specificity: 20 percent.
   - Differentiation: 15 percent.
   - Evidence strength: 20 percent.
   - Narrative coherence: 15 percent.
   - CTA alignment: 10 percent.
   - This candidate score is separate from the four-dimension 100-point release score in `acceptance-and-autoresearch.md`.
6. Select the highest score with a stable tie-breaker. A model may validate or rank within the bounded candidate set but may not create an untracked alternative.
7. Compile the existing production message spine from the selected strategy.
8. Select the existing wireframe family and bind every section role to one distinct strategy job.
9. Generate section candidates using the existing per-role contracts.
10. Review factuality, duplication, section fitness, and evidence coverage.
11. Render the base page through the current deterministic renderer.
12. Compile personalization as patches against the base page. Each changed field retains source refs and one plain-language reason.
13. Persist only private digests, scores, versions, evidence references, timing, and decision receipts in BuildTrace.

## First vertical slice

This release covers campaign production through the existing Launch/Guide/Align families. It must work for product, solution, industry, event, sparse-brand, and no-evidence fixtures. It does not create a new durable queue or replace the current `after()` orchestration. A first-class GenerationJob remains a later infrastructure project unless this work exposes a concrete correctness blocker.

## Explicit non-goals

- no new wireframe family;
- no visitor-facing strategy picker;
- no user-visible internal framework names;
- no new external research provider;
- no Folloze publish path;
- no Vercel deployment;
- no PostHog trace linkage;
- no raw source text in benchmark logs;
- no Jabra-specific branch or styling exception.
