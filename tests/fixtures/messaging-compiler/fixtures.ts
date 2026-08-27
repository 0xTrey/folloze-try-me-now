/**
 * Messaging-compiler fixtures expressed as argument shapes, not as customers.
 *
 * Each entry describes a situation the compiler has to reason through: a
 * product launch with real proof, a category guide for a technical evaluator, a
 * named-account alignment page, an event registration, a brand whose visual
 * evidence is genuinely thin, and a session where nothing was researched at all.
 * The ids keep the shape labels already used by the three-family evidence
 * manifest so the two benchmarks can be read side by side; the sellers,
 * audiences, offers, and evidence below are invented. No customer page copy,
 * address, credential, or live URL appears anywhere in this file, which is what
 * lets the benchmark artifacts be published.
 *
 * `facts` are claims the compiler may state. `permittedInferences` may only
 * shape a question or a mechanism step. `visitorContext` is what the visitor
 * told us: authoritative for what the page is about, never proof that it is
 * true. `prohibitedClaims` are the specific sentences a degraded run tends to
 * invent, and the benchmark fails any run that emits one.
 */

import type {
  MessageContentVolume,
  MessageDecisionComplexity,
  MessageMotion,
  MessageOfferMaturity,
  MessageProofDensity
} from "@/lib/generation/message-spine";
import type { FamilyArgumentBaseline } from "@/lib/generation/message-strategy-compiler";
import type {
  CompilerEvidenceConfidence,
  MessageStrategyAngle
} from "@/lib/generation/messaging-compiler-contracts";
import type { WireframeFamilyV2 } from "@/lib/generation/three-family-contract";

export type MessagingCompilerFixtureId =
  | "adp-launch"
  | "apple-guide"
  | "servicetitan-align"
  | "product"
  | "event"
  | "sparse-brand"
  | "no-evidence";

export interface MessagingCompilerFixtureEvidence {
  id: string;
  claim: string;
  sourceAuthority: string;
  /** Opaque manifest reference. Never a live URL, query string, or address. */
  sourceRef: string;
  confidence: CompilerEvidenceConfidence;
}

export type BrandColorRoleName = "surface" | "ink" | "action" | "border";

export interface MessagingCompilerBrandFixture {
  /** The identity the page is allowed to claim, independent of the seed. */
  verifiedIdentity: string;
  /** Every brand evidence id that was actually verified for this fixture. */
  evidenceRefs: readonly string[];
  logoEvidenceRef: string;
  colorRoles: readonly { role: BrandColorRoleName; evidenceRef: string }[];
  typographyEvidenceRefs: readonly string[];
  /** First-party assets, one per semantic role, no cross-origin references. */
  imageAllocations: readonly { semanticRole: string; assetRef: string }[];
}

/** The signals the existing framework ranker consumes, minus the seeds already on the fixture. */
export interface MessagingCompilerFrameworkSignals {
  motion: MessageMotion;
  offerMaturity: MessageOfferMaturity;
  proofDensity: MessageProofDensity;
  contentVolume: MessageContentVolume;
  decisionComplexity: MessageDecisionComplexity;
}

export interface MessagingCompilerFixture {
  id: MessagingCompilerFixtureId;
  /** What this fixture is a shape of, in the terms the compiler reasons about. */
  description: string;
  family: WireframeFamilyV2;
  briefRevision: number;
  frameworkSignals: MessagingCompilerFrameworkSignals;
  sellerName: string;
  targetName?: string;
  offer: string;
  audienceLabel: string;
  audienceJob: string;
  objective: string;
  ctaLabel: string;
  /** The route contract's own wording for the slots the family owns. */
  baseline: FamilyArgumentBaseline;
  sectionPlanOptions?: { includeProofDepth?: boolean; includeResource?: boolean };
  /** Evidence the compiler is allowed to state. */
  facts: readonly MessagingCompilerFixtureEvidence[];
  /** Statements allowed only as an inference or a question. */
  permittedInferences: readonly MessagingCompilerFixtureEvidence[];
  /** What the visitor supplied: authoritative for topic, never for proof. */
  visitorContext: readonly MessagingCompilerFixtureEvidence[];
  /** Sentences that must not appear in any selected strategy slot. */
  prohibitedClaims: readonly string[];
  /** Terms the selected audience job must cover. */
  expectedAudienceJobs: readonly string[];
  /** What the CTA logic must resolve for the buyer. */
  expectedCtaLogic: readonly string[];
  /** Angles the selection may legitimately land on given this evidence. */
  acceptableAngles: readonly MessageStrategyAngle[];
  brand: MessagingCompilerBrandFixture;
}

function evidence(
  id: string,
  claim: string,
  confidence: CompilerEvidenceConfidence,
  sourceAuthority = "seller-official"
): MessagingCompilerFixtureEvidence {
  return { id, claim, confidence, sourceAuthority, sourceRef: `fixture:${id}` };
}

function brandFixture(input: {
  identity: string;
  prefix: string;
  colorRoles: readonly BrandColorRoleName[];
  typographyRoles: readonly ("heading" | "body")[];
  imageRoles: readonly string[];
}): MessagingCompilerBrandFixture {
  const roleRef = (role: string) => `${input.prefix}_${role}`;
  return {
    verifiedIdentity: input.identity,
    evidenceRefs: [
      roleRef("logo"),
      ...input.colorRoles.map(roleRef),
      ...input.typographyRoles.map(roleRef)
    ],
    logoEvidenceRef: roleRef("logo"),
    colorRoles: input.colorRoles.map((role) => ({ role, evidenceRef: roleRef(role) })),
    typographyEvidenceRefs: input.typographyRoles.map(roleRef),
    imageAllocations: input.imageRoles.map((semanticRole) => ({
      semanticRole,
      assetRef: `asset:${input.prefix}/${semanticRole}`
    }))
  };
}

export const MESSAGING_COMPILER_FIXTURES: readonly MessagingCompilerFixture[] = [
  {
    id: "adp-launch",
    description:
      "Launch route for a confirmed operations offer with three referenced facts and a named cycle deadline the buyer already owns.",
    family: "launch",
    briefRevision: 4,
    frameworkSignals: {
      motion: "product",
      offerMaturity: "confirmed",
      proofDensity: "rich",
      contentVolume: "standard",
      decisionComplexity: "medium"
    },
    sellerName: "Northgate Payroll Systems",
    offer: "Payroll Continuity Kit",
    audienceLabel: "Payroll operations leaders",
    audienceJob:
      "Decide whether payroll continuity can be proven before the next multi-state filing cycle closes.",
    objective: "Book a payroll continuity review",
    ctaLabel: "Book a continuity review",
    baseline: {
      promise:
        "Payroll operations leaders close a multi-state filing cycle without a manual reconciliation weekend, using the Payroll Continuity Kit.",
      mechanism:
        "The Payroll Continuity Kit reconciles filing calendars, jurisdiction rules, and pay-run exceptions into one queue payroll operations leaders clear before submission.",
      decisionHelp:
        "Help payroll operations leaders compare their current reconciliation effort against the exception queue they would clear instead.",
      nextAction:
        "Book a continuity review with the payroll implementation lead who would run the first filing cycle.",
      tension:
        "Multi-state filing cycles are reconciled by hand in the final days before submission."
    },
    facts: [
      evidence(
        "ev_adp_calendar",
        "Northgate publishes a multi-state filing calendar covering 41 jurisdictions.",
        "high"
      ),
      evidence(
        "ev_adp_queue",
        "The Payroll Continuity Kit ships an exception queue payroll teams clear before submission.",
        "high"
      ),
      evidence(
        "ev_adp_release",
        "Three regional payroll teams ran a full filing cycle through the exception queue during the limited release.",
        "medium"
      )
    ],
    permittedInferences: [
      evidence(
        "ev_adp_effort",
        "Teams reconciling by hand likely spend the final cycle days chasing exceptions.",
        "medium",
        "deterministic"
      )
    ],
    visitorContext: [
      evidence(
        "ev_adp_audience",
        "Buyer audience and owned job: Payroll operations leaders, prove continuity before the next filing cycle.",
        "high",
        "visitor"
      ),
      evidence(
        "ev_adp_objective",
        "Campaign objective: Book a payroll continuity review.",
        "high",
        "visitor"
      )
    ],
    prohibitedClaims: [
      "saves 40 hours per cycle",
      "reduces payroll errors by 92 percent",
      "the industry standard for payroll continuity",
      "trusted by every Fortune 500 payroll team"
    ],
    expectedAudienceJobs: ["payroll", "continuity", "cycle"],
    expectedCtaLogic: ["continuity review", "payroll"],
    acceptableAngles: ["tension", "upside", "mechanism", "proof"],
    brand: brandFixture({
      identity: "Northgate Payroll Systems",
      prefix: "adp",
      colorRoles: ["ink", "surface", "action", "border"],
      typographyRoles: ["heading", "body"],
      imageRoles: ["hero", "mechanism", "proof"]
    })
  },
  {
    id: "apple-guide",
    description:
      "Guide route for a technical evaluation audience: deep published positioning, moderate proof, no named account.",
    family: "guide",
    briefRevision: 3,
    frameworkSignals: {
      motion: "demand",
      offerMaturity: "confirmed",
      proofDensity: "moderate",
      contentVolume: "deep",
      decisionComplexity: "high"
    },
    sellerName: "Halden Device Cloud",
    offer: "Managed device attestation",
    audienceLabel: "Endpoint security architects",
    audienceJob:
      "Decide which attestation signals a fleet must require before a device reaches production data.",
    objective: "Run a device attestation working session",
    ctaLabel: "Book a working session",
    baseline: {
      promise:
        "Endpoint security architects require attestation signals per device class instead of trusting one enrollment check, through managed device attestation.",
      mechanism:
        "Managed device attestation collects boot measurement, key residency, and posture drift per device class, then maps each signal to the access rule that consumes it.",
      decisionHelp:
        "Help endpoint security architects test one attestation signal against a device class they already struggle to certify.",
      nextAction:
        "Book a working session to model device attestation signals against one device class.",
      tension:
        "Enrollment checks certify a device once and are not revisited when posture drifts."
    },
    facts: [
      evidence(
        "ev_apple_signals",
        "Halden documents three attestation signal classes: boot measurement, key residency, and posture drift.",
        "high"
      ),
      evidence(
        "ev_apple_rules",
        "Access rules in Halden Device Cloud consume attestation signals per device class rather than per enrollment.",
        "high"
      ),
      evidence(
        "ev_apple_drift",
        "Posture drift is re-evaluated on every access request in the published product reference.",
        "medium"
      )
    ],
    permittedInferences: [
      evidence(
        "ev_apple_certify",
        "Fleets certifying only at enrollment likely cannot answer posture questions between audits.",
        "medium",
        "deterministic"
      )
    ],
    visitorContext: [
      evidence(
        "ev_apple_audience",
        "Buyer audience and owned job: Endpoint security architects, choose the attestation signals a fleet must require.",
        "high",
        "visitor"
      ),
      evidence(
        "ev_apple_objective",
        "Campaign objective: Run a device attestation working session.",
        "high",
        "visitor"
      )
    ],
    prohibitedClaims: [
      "blocks 100 percent of compromised devices",
      "zero trust guaranteed",
      "the only attestation platform on the market",
      "certified by every major auditor"
    ],
    expectedAudienceJobs: ["attestation", "device", "signals"],
    expectedCtaLogic: ["working session", "attestation"],
    acceptableAngles: ["tension", "upside", "mechanism", "proof"],
    brand: brandFixture({
      identity: "Halden Device Cloud",
      prefix: "apple",
      colorRoles: ["ink", "surface", "action", "border"],
      typographyRoles: ["heading", "body"],
      imageRoles: ["hero", "criteria", "mechanism"]
    })
  },
  {
    id: "servicetitan-align",
    description:
      "Align route for a named account: target-official observations plus seller mechanism, first decision scoped to one region.",
    family: "align",
    briefRevision: 6,
    frameworkSignals: {
      motion: "account",
      offerMaturity: "emerging",
      proofDensity: "moderate",
      contentVolume: "standard",
      decisionComplexity: "high"
    },
    sellerName: "Tallgrass Field Operations",
    targetName: "Braxton Mechanical",
    offer: "Dispatch readiness program",
    audienceLabel: "Field service operations directors",
    audienceJob:
      "Decide whether dispatch readiness can be validated on one region before a national rollout is committed.",
    objective: "Plan a regional dispatch validation",
    ctaLabel: "Plan the first region",
    baseline: {
      promise:
        "Field service operations directors validate dispatch readiness on one region before committing a national rollout, through the dispatch readiness program.",
      mechanism:
        "The dispatch readiness program sequences technician availability, parts staging, and same-day reschedules onto one regional dispatch board the operations directors review each morning.",
      decisionHelp:
        "Help field service operations directors separate what Braxton Mechanical has published from what still needs validation in the first region.",
      nextAction:
        "Plan the first region with the Braxton Mechanical dispatch lead and agree what a validated region looks like.",
      tension:
        "Regional dispatch decisions are made from separate availability, parts, and reschedule views."
    },
    facts: [
      evidence(
        "ev_st_regions",
        "Braxton Mechanical operates dispatch centers in four regions under separate scheduling systems.",
        "high",
        "target-official"
      ),
      evidence(
        "ev_st_board",
        "The dispatch readiness program publishes one regional board covering availability, parts staging, and reschedules.",
        "high"
      ),
      evidence(
        "ev_st_release",
        "Tallgrass ran the regional dispatch board with two field service operators during limited release.",
        "medium"
      )
    ],
    permittedInferences: [
      evidence(
        "ev_st_rollout",
        "Separate scheduling systems likely make a national rollout hard to sequence.",
        "medium",
        "deterministic"
      )
    ],
    visitorContext: [
      evidence(
        "ev_st_audience",
        "Buyer audience and owned job: Field service operations directors, validate one region before a rollout.",
        "high",
        "visitor"
      ),
      evidence(
        "ev_st_objective",
        "Campaign objective: Plan a regional dispatch validation.",
        "high",
        "visitor"
      )
    ],
    prohibitedClaims: [
      "Braxton Mechanical reported a 30 percent lift",
      "Braxton Mechanical is already a Tallgrass customer",
      "a national agreement has been signed",
      "the industry's leading dispatch platform"
    ],
    expectedAudienceJobs: ["dispatch", "region", "validat"],
    expectedCtaLogic: ["first region", "dispatch"],
    acceptableAngles: ["tension", "upside", "mechanism", "proof"],
    brand: brandFixture({
      identity: "Tallgrass Field Operations",
      prefix: "servicetitan",
      colorRoles: ["ink", "surface", "action", "border"],
      typographyRoles: ["heading", "body"],
      imageRoles: ["hero", "account-observations", "validation"]
    })
  },
  {
    id: "product",
    description:
      "Launch route for a confirmed product with only two referenced facts: the argument must lean on mechanism rather than proof volume.",
    family: "launch",
    briefRevision: 2,
    frameworkSignals: {
      motion: "product",
      offerMaturity: "confirmed",
      proofDensity: "moderate",
      contentVolume: "standard",
      decisionComplexity: "medium"
    },
    sellerName: "Ridgeline Materials",
    offer: "Yield Variance Monitor",
    audienceLabel: "Plant quality managers",
    audienceJob:
      "Decide whether yield variance can be traced to a line and a shift before the next quality review.",
    objective: "Book a variance walkthrough",
    ctaLabel: "Book a variance walkthrough",
    baseline: {
      promise:
        "Plant quality managers trace yield variance to a line and a shift within the same day, using the Yield Variance Monitor.",
      mechanism:
        "The Yield Variance Monitor joins line telemetry, shift records, and material lots so plant quality managers see which combination moved the yield.",
      decisionHelp:
        "Help plant quality managers compare their current variance investigation against the traced view they would open instead.",
      nextAction:
        "Book a variance walkthrough on one production line the quality team already watches.",
      tension:
        "Yield variance is investigated after the quality review rather than during the shift."
    },
    facts: [
      evidence(
        "ev_product_join",
        "The Yield Variance Monitor joins line telemetry, shift records, and material lots in one traced view.",
        "high"
      ),
      evidence(
        "ev_product_lines",
        "Ridgeline documents the monitor running against extrusion and coating lines.",
        "medium"
      )
    ],
    permittedInferences: [
      evidence(
        "ev_product_review",
        "Variance found after a quality review likely costs more to correct than variance found during the shift.",
        "medium",
        "deterministic"
      )
    ],
    visitorContext: [
      evidence(
        "ev_product_audience",
        "Buyer audience and owned job: Plant quality managers, trace variance to a line and a shift.",
        "high",
        "visitor"
      ),
      evidence(
        "ev_product_objective",
        "Campaign objective: Book a variance walkthrough.",
        "high",
        "visitor"
      )
    ],
    prohibitedClaims: [
      "cuts scrap by half",
      "deployed at over 500 plants",
      "the most accurate variance monitor available",
      "certified to ISO standards"
    ],
    expectedAudienceJobs: ["variance", "shift", "quality"],
    expectedCtaLogic: ["variance walkthrough", "line"],
    acceptableAngles: ["tension", "upside", "mechanism", "proof"],
    brand: brandFixture({
      identity: "Ridgeline Materials",
      prefix: "product",
      colorRoles: ["ink", "surface", "action"],
      typographyRoles: ["heading", "body"],
      imageRoles: ["hero", "mechanism"]
    })
  },
  {
    id: "event",
    description:
      "Registration route: the offer is the event itself, urgency is a published session cap, and no outcome proof exists yet.",
    family: "launch",
    briefRevision: 1,
    frameworkSignals: {
      motion: "event",
      offerMaturity: "confirmed",
      proofDensity: "sparse",
      contentVolume: "light",
      decisionComplexity: "low"
    },
    sellerName: "Cairn Grid Services",
    offer: "Grid Resilience Summit",
    audienceLabel: "Utility operations planners",
    audienceJob:
      "Decide which Grid Resilience Summit track answers the outage planning question their region faces this winter.",
    objective: "Register for the Grid Resilience Summit",
    ctaLabel: "Save your seat",
    baseline: {
      promise:
        "Utility operations planners leave the Grid Resilience Summit with one outage planning approach they can test in their own region.",
      mechanism:
        "The Grid Resilience Summit runs three tracks, outage planning, load transfer, and restoration sequencing, each led by a planner who ran the scenario in a live region.",
      decisionHelp:
        "Help utility operations planners choose the track that matches the outage question their region is already asking.",
      nextAction:
        "Save your seat in the Grid Resilience Summit outage planning track before the published session cap is reached."
    },
    facts: [
      evidence(
        "ev_event_tracks",
        "The Grid Resilience Summit agenda lists three tracks: outage planning, load transfer, and restoration sequencing.",
        "high"
      ),
      evidence(
        "ev_event_speakers",
        "Every Grid Resilience Summit track session is led by a planner who ran the scenario in a live utility region.",
        "medium"
      )
    ],
    permittedInferences: [
      evidence(
        "ev_event_winter",
        "Regions facing winter peak load likely need the outage planning track first.",
        "medium",
        "deterministic"
      )
    ],
    visitorContext: [
      evidence(
        "ev_event_audience",
        "Buyer audience and owned job: Utility operations planners, pick the track matching their outage question.",
        "high",
        "visitor"
      ),
      evidence(
        "ev_event_objective",
        "Campaign objective: Register for the Grid Resilience Summit.",
        "high",
        "visitor"
      )
    ],
    prohibitedClaims: [
      "sold out every year",
      "1,200 attendees expected",
      "the largest utility event in North America",
      "guaranteed continuing education credits"
    ],
    expectedAudienceJobs: ["resilience", "outage", "region"],
    expectedCtaLogic: ["seat", "outage planning"],
    acceptableAngles: ["tension", "upside", "mechanism", "proof"],
    brand: brandFixture({
      identity: "Cairn Grid Services",
      prefix: "event",
      colorRoles: ["ink", "surface", "action"],
      typographyRoles: ["heading", "body"],
      imageRoles: ["hero", "agenda"]
    })
  },
  {
    id: "sparse-brand",
    description:
      "Message evidence is adequate but only a logo and two colours were verified: composition fidelity must lose points without inventing a brand.",
    family: "launch",
    briefRevision: 2,
    frameworkSignals: {
      motion: "demand",
      offerMaturity: "emerging",
      proofDensity: "moderate",
      contentVolume: "light",
      decisionComplexity: "medium"
    },
    sellerName: "Wrenfield Logistics",
    offer: "Dock Turnaround Plan",
    audienceLabel: "Distribution center managers",
    audienceJob:
      "Decide whether dock turnaround can be shortened without adding a second yard crew.",
    objective: "Book a dock turnaround review",
    ctaLabel: "Book a turnaround review",
    baseline: {
      promise:
        "Distribution center managers shorten dock turnaround without adding a second yard crew, using the Dock Turnaround Plan.",
      mechanism:
        "The Dock Turnaround Plan sequences appointment windows, door assignments, and yard moves so distribution center managers see the next constraint before a trailer arrives.",
      decisionHelp:
        "Help distribution center managers compare their current door assignment routine against the sequenced plan they would follow instead.",
      nextAction:
        "Book a turnaround review on the dock that misses the most appointment windows.",
      tension:
        "Door assignments are decided at the gate rather than before the trailer arrives."
    },
    facts: [
      evidence(
        "ev_sparse_sequence",
        "The Dock Turnaround Plan sequences appointment windows, door assignments, and yard moves in one view.",
        "high"
      ),
      evidence(
        "ev_sparse_windows",
        "Wrenfield documents appointment windows being published to carriers before arrival.",
        "medium"
      )
    ],
    permittedInferences: [
      evidence(
        "ev_sparse_crew",
        "Docks assigning doors at the gate likely absorb the delay with extra yard labour.",
        "medium",
        "deterministic"
      )
    ],
    visitorContext: [
      evidence(
        "ev_sparse_audience",
        "Buyer audience and owned job: Distribution center managers, shorten turnaround without a second crew.",
        "high",
        "visitor"
      ),
      evidence(
        "ev_sparse_objective",
        "Campaign objective: Book a dock turnaround review.",
        "high",
        "visitor"
      )
    ],
    prohibitedClaims: [
      "cuts turnaround by 35 minutes",
      "used by every major carrier",
      "the fastest dock platform in logistics",
      "no training required"
    ],
    expectedAudienceJobs: ["turnaround", "yard", "crew"],
    expectedCtaLogic: ["turnaround review", "dock"],
    acceptableAngles: ["tension", "upside", "mechanism", "proof"],
    brand: brandFixture({
      identity: "Wrenfield Logistics",
      prefix: "sparse",
      colorRoles: ["ink", "surface"],
      typographyRoles: [],
      imageRoles: ["hero"]
    })
  },
  {
    id: "no-evidence",
    description:
      "Nothing was researched: one low-confidence inference and the visitor's own answers. The page must omit proof and urgency rather than invent them.",
    family: "launch",
    briefRevision: 1,
    frameworkSignals: {
      motion: "demand",
      offerMaturity: "unconfirmed",
      proofDensity: "sparse",
      contentVolume: "light",
      decisionComplexity: "low"
    },
    sellerName: "Alder Grove Systems",
    offer: "Field Readiness Kit",
    audienceLabel: "Regional operations managers",
    audienceJob:
      "Decide whether field readiness can be checked before a crew leaves the yard.",
    objective: "Book a field readiness review",
    ctaLabel: "Book a readiness review",
    baseline: {
      promise:
        "Regional operations managers check field readiness before a crew leaves the yard, using the Field Readiness Kit.",
      mechanism:
        "The Field Readiness Kit lists the vehicle, parts, and permit checks a crew must clear and records which manager cleared them before the yard gate opens.",
      decisionHelp:
        "Help regional operations managers decide which readiness check is worth confirming first, and state plainly what has not been verified.",
      nextAction:
        "Book a readiness review and bring one recent morning where a crew left the yard short."
    },
    facts: [],
    permittedInferences: [
      evidence(
        "ev_none_checks",
        "Crews leaving the yard without a cleared check likely return for parts.",
        "low",
        "deterministic"
      )
    ],
    visitorContext: [
      evidence(
        "ev_none_audience",
        "Buyer audience and owned job: Regional operations managers, check readiness before a crew leaves.",
        "high",
        "visitor"
      ),
      evidence(
        "ev_none_offer",
        "Promoted offer: Field Readiness Kit.",
        "high",
        "visitor"
      ),
      evidence(
        "ev_none_objective",
        "Campaign objective: Book a field readiness review.",
        "high",
        "visitor"
      )
    ],
    prohibitedClaims: [
      "proven to cut return trips",
      "customers report fewer short crews",
      "trusted by leading regional operators",
      "92 percent of crews clear the check"
    ],
    expectedAudienceJobs: ["readiness", "crew", "yard"],
    expectedCtaLogic: ["readiness review", "crew"],
    acceptableAngles: ["upside", "mechanism"],
    brand: brandFixture({
      identity: "Alder Grove Systems",
      prefix: "noevidence",
      colorRoles: ["ink", "surface", "action"],
      typographyRoles: [],
      imageRoles: ["hero"]
    })
  }
];

export function messagingCompilerFixture(
  id: MessagingCompilerFixtureId
): MessagingCompilerFixture {
  const fixture = MESSAGING_COMPILER_FIXTURES.find((candidate) => candidate.id === id);
  if (!fixture) throw new Error(`Unknown messaging compiler fixture: ${id}`);
  return fixture;
}
