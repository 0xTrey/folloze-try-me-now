import type { ProductionArtifact } from "@/lib/orchestration/worker-types";
import type { CtaType } from "@/lib/types";

export const objectiveCtaMotions = [
  "campaign",
  "product",
  "industry",
  "abm",
  "event",
  "webinar"
] as const;

export type ObjectiveCtaMotion = (typeof objectiveCtaMotions)[number];

export const objectiveCtaEvidenceSignals = [
  "campaign-offer",
  "product-evaluation",
  "industry-priority",
  "abm-active-evaluation",
  "abm-buying-group-alignment",
  "event-registration-open",
  "webinar-registration-open",
  "webinar-on-demand"
] as const;

export type ObjectiveCtaEvidenceSignal = (typeof objectiveCtaEvidenceSignals)[number];

export type ObjectiveCtaEvidenceProvenance =
  | "visitor-input"
  | "official-seller-page"
  | "official-event-page"
  | "official-target-page"
  | "reliable-third-party";

export interface ObjectiveCtaEvidence {
  id: string;
  revision: number;
  signal: ObjectiveCtaEvidenceSignal;
  provenance: ObjectiveCtaEvidenceProvenance;
  confidence: number;
}

export type ObjectiveCtaReasonCode =
  | "generic-book-meeting-default"
  | "campaign-motion"
  | "product-motion"
  | "industry-motion"
  | "abm-motion"
  | "event-motion"
  | "webinar-motion"
  | "action-family-evaluate"
  | "action-family-engage"
  | "action-family-offer-specific"
  | "campaign-offer-evidence"
  | "product-evaluation-evidence"
  | "industry-priority-evidence"
  | "abm-active-evaluation-evidence"
  | "abm-buying-group-evidence"
  | "event-registration-evidence"
  | "webinar-registration-evidence"
  | "webinar-on-demand-evidence"
  | "weak-evidence-book-meeting-fallback";

export type ObjectiveCtaActionFamily = "evaluate" | "engage" | "offer-specific";

export interface ObjectiveCtaCandidate {
  id: string;
  objective: string;
  actionFamily: ObjectiveCtaActionFamily;
  cta: {
    type: CtaType;
    label: string;
  };
  recommended: boolean;
  reasonCodes: readonly ObjectiveCtaReasonCode[];
  provenance: {
    strategy: "deterministic-policy" | "evidence-backed";
    evidenceRefs: readonly string[];
  };
  confidence: number;
  revision: number;
}

export interface ObjectiveCtaRecommendationSet {
  revision: number;
  motion: ObjectiveCtaMotion;
  candidates: readonly [
    ObjectiveCtaCandidate,
    ObjectiveCtaCandidate,
    ObjectiveCtaCandidate
  ];
  recommendedCandidateId: string;
  reasonCodes: readonly ObjectiveCtaReasonCode[];
}

export interface ObjectiveCtaRecommendationInput {
  sessionId: string;
  revision: number;
  activeRevision: number;
  motion: ObjectiveCtaMotion;
  evidence?: readonly ObjectiveCtaEvidence[];
  startedAt: string;
  completedAt: string;
}

type CandidateSeed = {
  id: string;
  objective: string;
  actionFamily: ObjectiveCtaActionFamily;
  ctaType: CtaType;
  ctaLabel: string;
};

type RecommendationPlan = {
  candidates: readonly [CandidateSeed, CandidateSeed, CandidateSeed];
  recommendedId: string;
  reasonCodes: readonly ObjectiveCtaReasonCode[];
  supportingEvidence: readonly ObjectiveCtaEvidence[];
  fallback: boolean;
};

const DEFAULT_CONFIDENCE = 0.6;
const FALLBACK_CONFIDENCE = 0.45;
const EVIDENCE_THRESHOLD = 0.7;

const defaultPlans = {
  campaign: [
    {
      id: "campaign-explore-offer",
      objective: "Learn about the offer",
      actionFamily: "evaluate",
      ctaType: "explore",
      ctaLabel: "Explore the offer"
    },
    {
      id: "campaign-book-meeting",
      objective: "Start a sales conversation",
      actionFamily: "engage",
      ctaType: "book-meeting",
      ctaLabel: "Book a meeting"
    },
    {
      id: "campaign-download-overview",
      objective: "Review supporting materials",
      actionFamily: "offer-specific",
      ctaType: "download",
      ctaLabel: "Download the overview"
    }
  ],
  product: [
    {
      id: "product-explore-use-case",
      objective: "Explore a product use case",
      actionFamily: "evaluate",
      ctaType: "explore",
      ctaLabel: "Explore the first use case"
    },
    {
      id: "product-book-walkthrough",
      objective: "Evaluate the product",
      actionFamily: "engage",
      ctaType: "book-meeting",
      ctaLabel: "Book a product walkthrough"
    },
    {
      id: "product-download-brief",
      objective: "Compare product details",
      actionFamily: "offer-specific",
      ctaType: "download",
      ctaLabel: "Download the product brief"
    }
  ],
  industry: [
    {
      id: "industry-explore-priorities",
      objective: "Explore industry priorities",
      actionFamily: "evaluate",
      ctaType: "explore",
      ctaLabel: "Explore the industry perspective"
    },
    {
      id: "industry-book-session",
      objective: "Apply the industry perspective",
      actionFamily: "engage",
      ctaType: "book-meeting",
      ctaLabel: "Book an industry working session"
    },
    {
      id: "industry-review-playbook",
      objective: "Review the industry playbook",
      actionFamily: "offer-specific",
      ctaType: "download",
      ctaLabel: "Download the industry brief"
    }
  ],
  abm: [
    {
      id: "abm-explore-perspective",
      objective: "Share an account perspective",
      actionFamily: "evaluate",
      ctaType: "explore",
      ctaLabel: "Explore the account perspective"
    },
    {
      id: "abm-book-meeting",
      objective: "Discuss account priorities",
      actionFamily: "engage",
      ctaType: "book-meeting",
      ctaLabel: "Book an account meeting"
    },
    {
      id: "abm-review-account-brief",
      objective: "Review the account brief",
      actionFamily: "offer-specific",
      ctaType: "download",
      ctaLabel: "Download the account brief"
    }
  ],
  event: [
    {
      id: "event-explore-topic",
      objective: "Explore the event topic",
      actionFamily: "evaluate",
      ctaType: "explore",
      ctaLabel: "Explore the topic"
    },
    {
      id: "event-book-meeting",
      objective: "Discuss the event topic",
      actionFamily: "engage",
      ctaType: "book-meeting",
      ctaLabel: "Book a meeting"
    },
    {
      id: "event-register",
      objective: "Reserve a seat",
      actionFamily: "offer-specific",
      ctaType: "register",
      ctaLabel: "Register for the event"
    }
  ],
  webinar: [
    {
      id: "webinar-explore-topic",
      objective: "Explore the webinar topic",
      actionFamily: "evaluate",
      ctaType: "explore",
      ctaLabel: "Explore the topic"
    },
    {
      id: "webinar-book-meeting",
      objective: "Discuss the webinar topic",
      actionFamily: "engage",
      ctaType: "book-meeting",
      ctaLabel: "Book a meeting"
    },
    {
      id: "webinar-watch",
      objective: "Increase webinar viewing",
      actionFamily: "offer-specific",
      ctaType: "explore",
      ctaLabel: "Watch the webinar"
    }
  ]
} as const satisfies Record<
  ObjectiveCtaMotion,
  readonly [CandidateSeed, CandidateSeed, CandidateSeed]
>;

const actionFamilyReasonCodes: Record<ObjectiveCtaActionFamily, ObjectiveCtaReasonCode> = {
  evaluate: "action-family-evaluate",
  engage: "action-family-engage",
  "offer-specific": "action-family-offer-specific"
};

const motionReasonCodes: Record<ObjectiveCtaMotion, ObjectiveCtaReasonCode> = {
  campaign: "campaign-motion",
  product: "product-motion",
  industry: "industry-motion",
  abm: "abm-motion",
  event: "event-motion",
  webinar: "webinar-motion"
};

function currentEvidence(
  input: ObjectiveCtaRecommendationInput
): ObjectiveCtaEvidence[] {
  return (input.evidence ?? [])
    .filter(
      (item) =>
        item.revision === input.revision &&
        Number.isFinite(item.confidence) &&
        item.confidence >= EVIDENCE_THRESHOLD
    )
    .sort((left, right) => right.confidence - left.confidence || left.id.localeCompare(right.id));
}

function evidenceFor(
  evidence: readonly ObjectiveCtaEvidence[],
  signal: ObjectiveCtaEvidenceSignal,
  allowedProvenance: readonly ObjectiveCtaEvidenceProvenance[]
): ObjectiveCtaEvidence[] {
  return evidence.filter(
    (item) => item.signal === signal && allowedProvenance.includes(item.provenance)
  );
}

function engageCandidate(motion: ObjectiveCtaMotion): CandidateSeed {
  const candidate = defaultPlans[motion].find((item) => item.actionFamily === "engage");
  if (!candidate) throw new Error(`Missing engage candidate for ${motion}`);
  return candidate;
}

function defaultPlan(
  motion: ObjectiveCtaMotion,
  supportingEvidence: readonly ObjectiveCtaEvidence[] = [],
  evidenceCode?: ObjectiveCtaReasonCode
): RecommendationPlan {
  const weakExceptionEvidence =
    (motion === "abm" || motion === "event" || motion === "webinar") &&
    supportingEvidence.length === 0;
  const recommended = engageCandidate(motion);
  return {
    candidates: defaultPlans[motion],
    recommendedId: recommended.id,
    reasonCodes: [
      "generic-book-meeting-default",
      motionReasonCodes[motion],
      actionFamilyReasonCodes[recommended.actionFamily],
      ...(evidenceCode ? [evidenceCode] : []),
      ...(weakExceptionEvidence ? ["weak-evidence-book-meeting-fallback" as const] : [])
    ],
    supportingEvidence,
    fallback: weakExceptionEvidence
  };
}

function planFor(input: ObjectiveCtaRecommendationInput): RecommendationPlan {
  const evidence = currentEvidence(input);

  if (input.motion === "abm") {
    const activeEvaluation = evidenceFor(evidence, "abm-active-evaluation", ["visitor-input"]);
    if (activeEvaluation.length > 0) {
      return {
        candidates: [
          {
            id: "abm-active-evaluation",
            objective: "Support the active evaluation",
            actionFamily: "engage",
            ctaType: "book-meeting",
            ctaLabel: "Plan a decision working session"
          },
          defaultPlans.abm[0],
          defaultPlans.abm[2]
        ],
        recommendedId: "abm-active-evaluation",
        reasonCodes: [
          "abm-motion",
          "abm-active-evaluation-evidence",
          "action-family-engage"
        ],
        supportingEvidence: activeEvaluation,
        fallback: false
      };
    }
    const buyingGroup = evidenceFor(evidence, "abm-buying-group-alignment", ["visitor-input"]);
    if (buyingGroup.length > 0) {
      return {
        candidates: [
          {
            id: "abm-plan-session",
            objective: "Align the buying group",
            actionFamily: "engage",
            ctaType: "book-meeting",
            ctaLabel: "Plan an account working session"
          },
          defaultPlans.abm[0],
          defaultPlans.abm[2]
        ],
        recommendedId: "abm-plan-session",
        reasonCodes: [
          "abm-motion",
          "abm-buying-group-evidence",
          "action-family-engage"
        ],
        supportingEvidence: buyingGroup,
        fallback: false
      };
    }
    return defaultPlan("abm");
  }

  if (input.motion === "event" || input.motion === "webinar") {
    const registrationSignal =
      input.motion === "event" ? "event-registration-open" : "webinar-registration-open";
    const registration = evidenceFor(evidence, registrationSignal, [
      "visitor-input",
      "official-seller-page",
      "official-event-page"
    ]);
    if (registration.length > 0) {
      const label = input.motion === "event" ? "Register for the event" : "Register for the webinar";
      const id = `${input.motion}-register`;
      return {
        candidates: [
          {
            id,
            objective: "Drive registrations",
            actionFamily: "offer-specific",
            ctaType: "register",
            ctaLabel: label
          },
          defaultPlans[input.motion][0],
          defaultPlans[input.motion][1]
        ],
        recommendedId: id,
        reasonCodes: [
          motionReasonCodes[input.motion],
          input.motion === "event"
            ? "event-registration-evidence"
            : "webinar-registration-evidence",
          "action-family-offer-specific"
        ],
        supportingEvidence: registration,
        fallback: false
      };
    }
    if (input.motion === "webinar") {
      const onDemand = evidenceFor(evidence, "webinar-on-demand", [
        "visitor-input",
        "official-seller-page",
        "official-event-page"
      ]);
      if (onDemand.length > 0) {
        return {
          candidates: [
            defaultPlans.webinar[2],
            defaultPlans.webinar[0],
            defaultPlans.webinar[1]
          ],
          recommendedId: defaultPlans.webinar[2].id,
          reasonCodes: [
            "webinar-motion",
            "webinar-on-demand-evidence",
            "action-family-offer-specific"
          ],
          supportingEvidence: onDemand,
          fallback: false
        };
      }
    }
    return defaultPlan(input.motion);
  }

  const signalByMotion = {
    campaign: ["campaign-offer", "campaign-offer-evidence"],
    product: ["product-evaluation", "product-evaluation-evidence"],
    industry: ["industry-priority", "industry-priority-evidence"]
  } as const;
  const [signal, reasonCode] = signalByMotion[input.motion];
  const supportingEvidence = evidenceFor(evidence, signal, [
    "visitor-input",
    "official-seller-page"
  ]);
  return defaultPlan(input.motion, supportingEvidence, supportingEvidence.length ? reasonCode : undefined);
}

function candidateConfidence(
  recommended: boolean,
  evidence: readonly ObjectiveCtaEvidence[],
  fallback: boolean
): number {
  if (!recommended) return fallback ? 0.4 : 0.5;
  if (fallback) return FALLBACK_CONFIDENCE;
  if (evidence.length === 0) return DEFAULT_CONFIDENCE;
  return Math.min(0.95, Math.max(...evidence.map((item) => item.confidence)));
}

function candidateFor(input: {
  seed: CandidateSeed;
  plan: RecommendationPlan;
  motion: ObjectiveCtaMotion;
  revision: number;
  evidenceRefs: readonly string[];
}): ObjectiveCtaCandidate {
  const recommended = input.seed.id === input.plan.recommendedId;
  const reasonCodes = recommended
    ? input.plan.reasonCodes
    : [
        motionReasonCodes[input.motion],
        actionFamilyReasonCodes[input.seed.actionFamily]
      ];
  return {
    id: input.seed.id,
    objective: input.seed.objective,
    actionFamily: input.seed.actionFamily,
    cta: { type: input.seed.ctaType, label: input.seed.ctaLabel },
    recommended,
    reasonCodes,
    provenance: {
      strategy:
        recommended && input.evidenceRefs.length > 0
          ? "evidence-backed"
          : "deterministic-policy",
      evidenceRefs: recommended ? input.evidenceRefs : []
    },
    confidence: candidateConfidence(
      recommended,
      input.plan.supportingEvidence,
      input.plan.fallback
    ),
    revision: input.revision
  };
}

export function recommendObjectiveCtas(
  input: ObjectiveCtaRecommendationInput
): ProductionArtifact<ObjectiveCtaRecommendationSet> {
  if (input.revision !== input.activeRevision) {
    return {
      worker: "objective-cta-strategist",
      sessionId: input.sessionId,
      revision: input.revision,
      status: "stale",
      evidenceRefs: [],
      confidence: 0,
      startedAt: input.startedAt,
      completedAt: input.completedAt,
      errorCode: "objective_cta_stale_revision"
    };
  }

  const plan = planFor(input);
  const evidenceRefs = [...new Set(plan.supportingEvidence.map((item) => item.id))].sort();
  const candidateInput = (seed: CandidateSeed) => ({
    seed,
    plan,
    motion: input.motion,
    revision: input.revision,
    evidenceRefs
  });
  const candidates: ObjectiveCtaRecommendationSet["candidates"] = [
    candidateFor(candidateInput(plan.candidates[0])),
    candidateFor(candidateInput(plan.candidates[1])),
    candidateFor(candidateInput(plan.candidates[2]))
  ];
  const confidence = candidates.find((candidate) => candidate.recommended)?.confidence ?? 0;

  return {
    worker: "objective-cta-strategist",
    sessionId: input.sessionId,
    revision: input.revision,
    status: plan.fallback ? "fallback" : "complete",
    value: {
      revision: input.revision,
      motion: input.motion,
      candidates,
      recommendedCandidateId: plan.recommendedId,
      reasonCodes: plan.reasonCodes
    },
    evidenceRefs,
    confidence,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    ...(plan.fallback ? { fallbackCode: "objective_cta_weak_evidence_default" } : {})
  };
}

export type ObjectiveCtaSelectionOrigin =
  | "recommended"
  | "visitor-candidate"
  | "visitor-custom";

export interface ObjectiveCtaSelection {
  origin: ObjectiveCtaSelectionOrigin;
  candidateId?: string;
  objective: string;
  cta: {
    type: CtaType;
    label: string;
  };
  revision: number;
}

export interface ObjectiveCtaRecommendationState {
  recommendations?: ProductionArtifact<ObjectiveCtaRecommendationSet>;
  selection?: ObjectiveCtaSelection;
}

export type ObjectiveCtaMergeReasonCode =
  | "current-revision-recommendations-applied"
  | "recommended-selection-refreshed"
  | "visitor-selection-preserved"
  | "visitor-custom-preserved"
  | "stale-revision-ignored";

export interface ObjectiveCtaMergeResult {
  state: ObjectiveCtaRecommendationState;
  applied: boolean;
  reasonCode: ObjectiveCtaMergeReasonCode;
}

function recommendedSelectionFor(
  artifact: ProductionArtifact<ObjectiveCtaRecommendationSet>
): ObjectiveCtaSelection | undefined {
  const recommended = artifact.value?.candidates.find((candidate) => candidate.recommended);
  if (!recommended) return undefined;
  return {
    origin: "recommended",
    candidateId: recommended.id,
    objective: recommended.objective,
    cta: { ...recommended.cta },
    revision: artifact.revision
  };
}

/**
 * Applies current-revision recommendation updates without replacing an explicit
 * visitor candidate or custom response. Candidate selections are snapshots so
 * changing recommendation copy cannot silently change what the visitor chose.
 */
export function mergeObjectiveCtaRecommendations(input: {
  activeRevision: number;
  current: ObjectiveCtaRecommendationState;
  incoming: ProductionArtifact<ObjectiveCtaRecommendationSet>;
}): ObjectiveCtaMergeResult {
  if (
    input.incoming.revision !== input.activeRevision ||
    input.incoming.status === "stale" ||
    input.incoming.value?.revision !== input.activeRevision
  ) {
    return {
      state: input.current,
      applied: false,
      reasonCode: "stale-revision-ignored"
    };
  }

  if (input.current.selection?.origin === "visitor-custom") {
    return {
      state: { recommendations: input.incoming, selection: input.current.selection },
      applied: true,
      reasonCode: "visitor-custom-preserved"
    };
  }
  if (input.current.selection?.origin === "visitor-candidate") {
    return {
      state: { recommendations: input.incoming, selection: input.current.selection },
      applied: true,
      reasonCode: "visitor-selection-preserved"
    };
  }
  if (input.current.selection?.origin === "recommended") {
    return {
      state: {
        recommendations: input.incoming,
        selection: recommendedSelectionFor(input.incoming)
      },
      applied: true,
      reasonCode: "recommended-selection-refreshed"
    };
  }
  return {
    state: { recommendations: input.incoming },
    applied: true,
    reasonCode: "current-revision-recommendations-applied"
  };
}
