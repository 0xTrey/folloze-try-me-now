import { describe, expect, it } from "vitest";

import { buildResearchQueryPlanV2 } from "@/lib/orchestration/research-query-plan-v2";
import type { SessionAnswers, SessionEvidenceItem } from "@/lib/types";

import {
  EVIDENCE_USE,
  evidenceGraphDigest,
  type EvidenceClaimCandidate
} from "./evidence-graph";
import { executeEvidenceGraph } from "./evidence-graph-executor";
import {
  audienceEntityIdFor,
  buildEvidenceSeeds,
  curatedEvidenceClaims,
  missingAnswerGaps,
  offerEntityIdFor,
  seedEntitiesFor,
  sellerEntityIdFor,
  targetEntityIdFor,
  visitorAnswerClaims,
  type EvidenceSeedInput
} from "./evidence-seeds";
import { reconcileEvidenceGraphClaims } from "./evidence-reconciler";

const sellerCanonicalDomain = "acme.example";
const sellerId = sellerEntityIdFor(sellerCanonicalDomain);

const answers: SessionAnswers = {
  sellerConfirmed: true,
  audience: "Revenue operations leaders",
  objective: "Introduce a product",
  campaignType: "product",
  promotedOffer: "Approval Automation Suite",
  promotedOfferConfirmed: true,
  messageBelief: "manual approvals are quietly costing every deal a week",
  messageAction: "book a working session",
  ctaType: "book-meeting",
  ctaStyle: "solid",
  styleVariant: "brand-led",
  toneVariant: "executive",
  selectedAssetIds: ["asset-1"]
};

function seedInput(overrides: Partial<EvidenceSeedInput> = {}): EvidenceSeedInput {
  return {
    revision: 3,
    sellerCanonicalDomain,
    sellerCompanyName: "Acme",
    answers,
    ...overrides
  };
}

function claimFor(
  candidates: readonly EvidenceClaimCandidate[],
  topic: string
): EvidenceClaimCandidate | undefined {
  return candidates.find((candidate) => candidate.topic === topic);
}

function evidenceItem(
  overrides: Partial<SessionEvidenceItem> = {}
): SessionEvidenceItem {
  return {
    id: "evidence-1",
    type: "public-positioning",
    label: "Positioning",
    text: "Acme runs approval workflows for regulated operations teams.",
    sourceUrl: "https://acme.example/platform?utm_source=harvester",
    signals: ["workflow"],
    disposition: "available",
    entityRole: "seller",
    confidence: "medium",
    ...overrides
  };
}

describe("seedEntitiesFor", () => {
  it("anchors the seller entity on the domain and keeps the company name", () => {
    const entities = seedEntitiesFor(seedInput());
    const seller = entities.find((entity) => entity.kind === "seller");

    expect(seller).toEqual({
      id: sellerId,
      kind: "seller",
      canonicalName: "Acme",
      aliases: [sellerCanonicalDomain]
    });
  });

  it("creates the offer and audience entities the answers establish", () => {
    const entities = seedEntitiesFor(seedInput());

    expect(entities.map(({ id }) => id)).toContain(
      offerEntityIdFor("Approval Automation Suite")
    );
    expect(entities.map(({ id }) => id)).toContain(
      audienceEntityIdFor("Revenue operations leaders")
    );
  });

  it("keeps the target account separate from the seller", () => {
    const entities = seedEntitiesFor(
      seedInput({ answers: { ...answers, targetDomain: "https://www.target.example/buy" } })
    );

    expect(entities.map(({ id }) => id)).toContain(targetEntityIdFor("target.example"));
    expect(targetEntityIdFor("target.example")).not.toBe(sellerId);
  });

  it("emits no entities when no answer establishes one", () => {
    expect(
      seedEntitiesFor({ revision: 1, answers: {} })
    ).toEqual([]);
  });
});

describe("visitorAnswerClaims", () => {
  const candidates = visitorAnswerClaims(seedInput());

  it("marks a confirmed answer as a fact and an unconfirmed one as an inference", () => {
    expect(claimFor(candidates, "offer")?.claim).toMatchObject({
      status: "fact",
      confidence: "high",
      sourceAuthority: "visitor"
    });

    const unconfirmed = visitorAnswerClaims(
      seedInput({ answers: { ...answers, promotedOfferConfirmed: false } })
    );
    expect(claimFor(unconfirmed, "offer")?.claim).toMatchObject({
      status: "inference",
      confidence: "medium"
    });
  });

  it("never promotes an unconfirmable audience above an inference", () => {
    expect(claimFor(candidates, "audience")?.claim).toMatchObject({
      status: "inference",
      buyerFacing: true
    });
  });

  it("keeps the page objective internal", () => {
    expect(claimFor(candidates, "page_objective")?.claim).toMatchObject({
      buyerFacing: false,
      allowedUses: [EVIDENCE_USE.internalReasoning]
    });
    expect(claimFor(candidates, "page_objective")?.claim.prohibitedUses).toContain(
      EVIDENCE_USE.buyerFacingCopy
    );
  });

  it("never lets a visitor belief be cited as proof or reach the page", () => {
    const belief = claimFor(candidates, "visitor_belief")?.claim;

    expect(belief).toMatchObject({
      status: "inference",
      confidence: "low",
      buyerFacing: false
    });
    expect(belief?.prohibitedUses).toEqual(
      expect.arrayContaining([EVIDENCE_USE.proofPoint, EVIDENCE_USE.buyerFacingCopy])
    );
    expect(belief?.allowedUses).not.toContain(EVIDENCE_USE.proofPoint);
  });

  it("treats CTA and presentation answers as page decisions, not evidence", () => {
    const serialized = JSON.stringify(candidates);

    expect(candidates.map(({ topic }) => topic)).not.toContain("cta");
    expect(serialized).not.toContain("book-meeting");
    expect(serialized).not.toContain("solid");
    expect(serialized).not.toContain("brand-led");
    expect(serialized).not.toContain("asset-1");
  });

  it("prefers a custom audience over the selected one", () => {
    const custom = visitorAnswerClaims(
      seedInput({ answers: { ...answers, customAudience: "Heads of compliance" } })
    );

    expect(claimFor(custom, "audience")?.claim.claim).toBe(
      "The intended buyer is Heads of compliance."
    );
  });

  it("emits no claim for an answer the visitor never gave", () => {
    const sparse = visitorAnswerClaims(
      seedInput({ answers: { sellerConfirmed: true } })
    );

    expect(sparse.map(({ topic }) => topic)).toEqual(["seller_identity"]);
  });

  it("reduces a pasted tracking URL to a bare host and hashes the source ref", () => {
    const pasted = visitorAnswerClaims(
      seedInput({
        answers: {
          ...answers,
          promotedOffer: "Our launch page at https://acme.example/launch?utm_campaign=q3"
        }
      })
    );
    const serialized = JSON.stringify(pasted);

    expect(serialized).not.toContain("utm_campaign");
    expect(serialized).not.toContain("https://");
    expect(claimFor(pasted, "offer")?.claim.claim).toContain("acme.example");
    expect(claimFor(pasted, "offer")?.claim.sourceRef).toMatch(/^src_visitor_[a-f0-9]{20}$/);
  });

  it("produces an identical candidate list for identical input", () => {
    expect(visitorAnswerClaims(seedInput())).toEqual(visitorAnswerClaims(seedInput()));
  });
});

describe("curatedEvidenceClaims", () => {
  it("drops an item the visitor excluded", () => {
    expect(
      curatedEvidenceClaims(
        seedInput({ evidenceItems: [evidenceItem({ disposition: "excluded" })] })
      )
    ).toEqual([]);
  });

  it("attributes a target-role item to the target entity and keeps it internal", () => {
    const [candidate] = curatedEvidenceClaims(
      seedInput({
        answers: { ...answers, targetDomain: "target.example" },
        evidenceItems: [
          evidenceItem({
            id: "evidence-target",
            type: "public-focus-area",
            entityRole: "target",
            text: "Target published a supply chain resilience initiative."
          })
        ]
      })
    );

    expect(candidate?.claim.subjectId).toBe(targetEntityIdFor("target.example"));
    expect(candidate?.claim.subjectId).not.toBe(sellerId);
    expect(candidate?.claim).toMatchObject({
      sourceAuthority: "target_official",
      buyerFacing: false
    });
  });

  it("drops a target-role item when no target entity exists", () => {
    expect(
      curatedEvidenceClaims(
        seedInput({ evidenceItems: [evidenceItem({ entityRole: "target" })] })
      )
    ).toEqual([]);
  });

  it("keeps curated items at official authority rather than visitor authority", () => {
    const [candidate] = curatedEvidenceClaims(
      seedInput({ evidenceItems: [evidenceItem()] })
    );

    expect(candidate?.claim.sourceAuthority).toBe("seller_official");
  });

  it("ranks a pinned item at least as high as an available one", () => {
    const [available] = curatedEvidenceClaims(
      seedInput({ evidenceItems: [evidenceItem({ confidence: "low" })] })
    );
    const [pinned] = curatedEvidenceClaims(
      seedInput({
        evidenceItems: [evidenceItem({ confidence: "low", disposition: "pinned" })]
      })
    );

    expect(available?.claim.confidence).toBe("low");
    expect(pinned?.claim.confidence).toBe("medium");
  });

  it("keeps distinct focus areas as separate claims and reconciles positioning to one", () => {
    const focusAreas = curatedEvidenceClaims(
      seedInput({
        evidenceItems: [
          evidenceItem({
            id: "focus-1",
            type: "public-focus-area",
            label: "Compliance",
            text: "Acme highlights regulated compliance workflows."
          }),
          evidenceItem({
            id: "focus-2",
            type: "public-focus-area",
            label: "Onboarding",
            text: "Acme highlights faster supplier onboarding."
          })
        ]
      })
    );
    const positioning = curatedEvidenceClaims(
      seedInput({
        evidenceItems: [
          evidenceItem({ id: "pos-1", text: "Acme is a workflow automation platform." }),
          evidenceItem({ id: "pos-2", text: "Acme is an analytics vendor." })
        ]
      })
    );

    expect(reconcileEvidenceGraphClaims(focusAreas).claims).toHaveLength(2);
    expect(reconcileEvidenceGraphClaims(positioning).claims).toHaveLength(1);
  });

  it("never carries a harvested source URL into the claim", () => {
    const serialized = JSON.stringify(
      curatedEvidenceClaims(seedInput({ evidenceItems: [evidenceItem()] }))
    );

    expect(serialized).not.toContain("utm_source");
    expect(serialized).not.toContain("https://acme.example/platform");
  });
});

describe("missingAnswerGaps", () => {
  it("names each absent answer instead of defaulting it", () => {
    expect(missingAnswerGaps({ revision: 1, answers: {} })).toEqual([
      "answers:audience_missing",
      "answers:next_action_missing",
      "answers:objective_missing",
      "answers:offer_missing",
      "answers:seller_missing"
    ]);
  });

  it("reports a missing audience with no audience claim", () => {
    const input = seedInput({
      answers: { ...answers, audience: undefined, customAudience: undefined }
    });

    expect(missingAnswerGaps(input)).toContain("answers:audience_missing");
    expect(claimFor(visitorAnswerClaims(input), "audience")).toBeUndefined();
  });

  it("reports a missing target account only for an ABM run", () => {
    expect(missingAnswerGaps(seedInput())).not.toContain(
      "answers:target_account_missing"
    );
    expect(
      missingAnswerGaps(seedInput({ expectsTargetAccount: true }))
    ).toContain("answers:target_account_missing");
  });

  it("reports nothing missing once every material answer is present", () => {
    expect(
      missingAnswerGaps(
        seedInput({
          answers: { ...answers, messageAction: "book a working session" }
        })
      )
    ).toEqual([]);
  });
});

describe("authority ranking of seeded claims", () => {
  it("lets a confirmed public page beat an unconfirmed visitor guess", () => {
    const visitorGuess = claimFor(
      visitorAnswerClaims(
        seedInput({
          answers: {
            ...answers,
            promotedOffer: "Acme is an analytics vendor",
            promotedOfferConfirmed: false
          }
        })
      ),
      "offer"
    );
    const publicFact = curatedEvidenceClaims(
      seedInput({ evidenceItems: [evidenceItem({ confidence: "high" })] })
    )[0];
    const offerSubject = visitorGuess?.claim.subjectId ?? "";

    const result = reconcileEvidenceGraphClaims([
      { ...(visitorGuess as EvidenceClaimCandidate), topic: "positioning" },
      {
        ...(publicFact as EvidenceClaimCandidate),
        topic: "positioning",
        claim: { ...(publicFact as EvidenceClaimCandidate).claim, subjectId: offerSubject }
      }
    ]);

    expect(result.claims).toHaveLength(1);
    expect(result.claims[0]?.sourceAuthority).toBe("seller_official");
    expect(result.conflicts[0]?.resolution).toBe("claim_status");
  });

  it("lets a confirmed visitor fact beat an equally verified harvested fact", () => {
    const confirmed = claimFor(visitorAnswerClaims(seedInput()), "seller_identity");
    const harvested = curatedEvidenceClaims(
      seedInput({ evidenceItems: [evidenceItem({ confidence: "high" })] })
    )[0];

    const result = reconcileEvidenceGraphClaims([
      { ...(confirmed as EvidenceClaimCandidate), topic: "identity" },
      { ...(harvested as EvidenceClaimCandidate), topic: "identity" }
    ]);

    expect(result.claims[0]?.sourceAuthority).toBe("visitor");
    expect(result.conflicts[0]?.resolution).toBe("source_authority");
  });
});

describe("buildEvidenceSeeds through the executor", () => {
  const plan = buildResearchQueryPlanV2({
    sessionId: "session-seeds",
    revision: 3,
    sellerDomain: sellerCanonicalDomain,
    companyName: "Acme"
  });

  async function graphFor(input: EvidenceSeedInput) {
    const seeds = buildEvidenceSeeds(input);
    return executeEvidenceGraph({
      plan,
      revision: 3,
      inputFingerprint: "fp-acme-r3",
      deadlineMs: 500,
      now: () => 1_000,
      seedEntities: seeds.entities,
      seedCandidates: seeds.candidates,
      seedGaps: seeds.gaps,
      requiredTopics: seeds.requiredTopics
    });
  }

  it("produces an identical graph digest for identical input", async () => {
    const first = await graphFor(seedInput({ evidenceItems: [evidenceItem()] }));
    const second = await graphFor(seedInput({ evidenceItems: [evidenceItem()] }));

    expect(evidenceGraphDigest(second)).toBe(evidenceGraphDigest(first));
    expect(first.claims.length).toBeGreaterThan(0);
  });

  it("carries answer gaps and an explicit unknown for proof into the graph", async () => {
    const graph = await graphFor(
      seedInput({ answers: { ...answers, audience: undefined } })
    );

    expect(graph.gaps).toContain("answers:audience_missing");
    expect(
      graph.claims.filter((claim) => claim.status === "unknown")
    ).toHaveLength(1);
    expect(graph.claims.find((claim) => claim.status === "unknown")).toMatchObject({
      subjectId: sellerId,
      buyerFacing: false
    });
  });

  it("changes the digest when a curated item is excluded", async () => {
    const included = await graphFor(seedInput({ evidenceItems: [evidenceItem()] }));
    const excluded = await graphFor(
      seedInput({ evidenceItems: [evidenceItem({ disposition: "excluded" })] })
    );

    expect(evidenceGraphDigest(excluded)).not.toBe(evidenceGraphDigest(included));
    expect(excluded.claims.length).toBe(included.claims.length - 1);
  });
});
