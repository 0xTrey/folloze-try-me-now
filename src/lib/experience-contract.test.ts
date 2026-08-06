import { describe, expect, it } from "vitest";

import {
  audienceLensFor,
  buildExperienceSpec,
  campaignBriefFor,
  campaignOfferSourceFor,
  canonicalizeExperienceDraft,
  draftFromExperienceSpec,
  syncCampaignContracts
} from "@/lib/experience-contract";
import type { ExperienceDraft } from "@/lib/generation/experience-schema";
import { toPublicSession } from "@/lib/session-store";
import type { BrandProfile, TryMeSession } from "@/lib/types";

const now = "2026-07-31T12:00:00.000Z";

const seller: BrandProfile = {
  domain: "jitterbit.com",
  companyName: "Jitterbit",
  description: "Integration, automation, application development, and governed AI.",
  publicTopics: ["Integration", "Automation"],
  logoUrl: "https://jitterbit.com/logo.svg",
  imageUrls: [],
  colors: ["#123B4A", "#F4512C"],
  primaryColor: "#123B4A",
  accentColor: "#F4512C",
  surfaceColor: "#FFFFFF",
  designDna: {
    version: 1,
    source: "remote-harvester",
    confidence: "high",
    theme: { hero: "dark", motif: "technical-grid" },
    buttons: { radiusPx: 12, heightPx: 48 },
    cards: { radiusPx: 18, shadow: "soft" },
    spacing: { contentMaxWidthPx: 1320, sectionBlockPx: 92, gridGapPx: 20 }
  },
  sourceUrl: "https://jitterbit.com/?tracking=removed",
  source: "fast-extractor"
};

const target: BrandProfile = {
  ...seller,
  domain: "cisco.com",
  companyName: "Cisco",
  description: "Networking, security, and observability.",
  publicTopics: ["Networking", "Security"],
  logoUrl: "https://cisco.com/logo.svg",
  sourceUrl: "https://cisco.com/#overview"
};

const draft: ExperienceDraft = {
  campaignRegister: "one-to-one-abm",
  designRegister: "source-brand-technical",
  wireframeName: "abm-account-microsite",
  experienceShape: "narrative-workflow",
  sectionSequence: ["thesis", "decision-lenses", "guided-questions"],
  sectionLabels: {
    thesis: "Why now",
    lenses: "Decision lenses",
    journey: "Explore the path",
    close: "Next step"
  },
  title: "Jitterbit for Cisco",
  eyebrow: "Jitterbit for Cisco",
  headline: "Give connected infrastructure a governed automation layer.",
  subhead: "A focused path for infrastructure leaders evaluating how integration and automation work together.",
  thesisHeadline: "Move from disconnected workflows to an accountable operating model.",
  thesisBody: "Connect the integration, automation, and governance decisions that determine whether change scales safely.",
  primaryCta: "Plan the architecture session",
  audienceLabel: "Infrastructure platform leaders",
  narrativeArc: "Choose the decision that deserves the first working session.",
  sections: [
    {
      eyebrow: "Control",
      headline: "Govern the automation surface",
      body: "Make ownership and policy visible across connected systems and workflows.",
      proof: "Which policy boundary must stay consistent across the estate?"
    },
    {
      eyebrow: "Speed",
      headline: "Remove integration drag",
      body: "Give teams reusable patterns for the connections that slow delivery today.",
      proof: "Where does integration work repeatedly delay the roadmap?"
    },
    {
      eyebrow: "Scale",
      headline: "Turn reusable patterns into leverage",
      body: "Let platform teams standardize without becoming the bottleneck for every change.",
      proof: "Which teams need more autonomy without losing governance?"
    }
  ],
  signalLabels: ["Control", "Speed", "Scale"],
  closingHeadline: "Put the first architecture decision on the table.",
  closingBody: "Bring the platform, integration, and governance owners into one focused working session."
};

function session(): TryMeSession {
  return {
    id: "session-contract",
    editorTokenHash: "hash",
    useCase: "abm",
    companyDomain: seller.domain,
    status: "collecting",
    createdAt: now,
    updatedAt: now,
    temporaryUrl: "https://example.com/e/session-contract",
    revision: 3,
    stages: {
      brand: { status: "complete", completedAt: now },
      audience: { status: "complete", completedAt: now },
      story: { status: "pending" }
    },
    answers: {
      targetDomain: target.domain,
      promotedOffer: "Jitterbit Harmony",
      offerSourceUrl: "https://jitterbit.com/harmony/?utm_source=test#hero",
      offerSourceTitle: "Jitterbit Harmony",
      offerSourceConfirmed: true,
      audience: "Infrastructure platform leaders",
      objective: "Align the architecture team"
    },
    brand: seller,
    targetBrand: target,
    audienceSuggestions: ["Infrastructure platform leaders"],
    selectedAudienceRecommendationId: "audience_platform",
    audienceRecommendations: [
      {
        id: "audience_platform",
        label: "Infrastructure platform leaders",
        rationale: "Connects the offer to Cisco's public infrastructure priorities.",
        evidenceItemIds: ["evidence_networking"],
        confidence: "high",
        source: "seller-target-synthesis"
      }
    ],
    evidenceItems: [
      {
        id: "evidence_networking",
        type: "public-focus-area",
        label: "Public focus area",
        text: "Networking and security",
        sourceUrl: "https://cisco.com/solutions/?ref=test",
        signals: ["networking", "security"],
        disposition: "pinned"
      }
    ],
    curatedSections: [
      {
        id: "section_faq",
        family: "faq",
        position: 3,
        visible: true,
        locked: false,
        instruction: "Address the three architecture objections."
      }
    ],
    events: []
  };
}

describe("campaign contract", () => {
  it("keeps seller, target, and offer separate with provenance and dependencies", () => {
    const current = session();
    current.campaignOfferSource = campaignOfferSourceFor(current);
    const brief = campaignBriefFor(current, now);

    expect(brief.fields.seller).toMatchObject({
      label: "Building as",
      value: "Jitterbit",
      provenance: "research"
    });
    expect(brief.fields.target).toMatchObject({
      label: "Building for",
      value: "Cisco",
      provenance: "research"
    });
    expect(brief.fields.offer).toMatchObject({
      label: "Promoting",
      value: "Jitterbit Harmony",
      provenance: "research"
    });
    expect(brief.fields.target?.dependencies).toContain("audience-lens");
    expect(brief.fields.offer?.dependencies).toContain("offer-source");
    expect(brief.fields.audience?.provenance).toBe("inferred");
    expect(brief.fields.offer?.citations).toEqual(["https://jitterbit.com/harmony/"]);
  });

  it("increments only the brief revision when a generation-driving field changes", () => {
    const current = session();
    syncCampaignContracts(current);
    const first = current.campaignBrief!;
    current.campaignBrief = campaignBriefFor(current, "2026-07-31T12:01:00.000Z");
    expect(current.campaignBrief).toEqual(first);

    current.answers.objective = "Book the architecture workshop";
    current.campaignBrief = campaignBriefFor(current, "2026-07-31T12:02:00.000Z");
    expect(current.campaignBrief.revision).toBe(first.revision + 1);
    expect(current.campaignBrief.fields.objective?.dependencies).toEqual([
      "message-spine",
      "experience-sections",
      "cta"
    ]);
  });

  it("prepares an early cited audience lens and preserves evidence disposition", () => {
    const lens = audienceLensFor(session(), now);

    expect(lens).toMatchObject({
      status: "ready",
      accountDomain: "cisco.com",
      accountName: "Cisco"
    });
    expect(lens.findings).toEqual([
      expect.objectContaining({
        category: "buyer-concern",
        citationUrl: "https://cisco.com/solutions/",
        disposition: "pinned"
      })
    ]);
  });

  it("captures a sanitized campaign offer source without conflating it with target research", () => {
    const source = campaignOfferSourceFor(session());

    expect(source).toEqual({
      title: "Jitterbit Harmony",
      sourceUrl: "https://jitterbit.com/harmony/",
      sourceHost: "jitterbit.com",
      status: "confirmed",
      intelligenceStatus: "pending",
      confirmedAt: expect.any(String)
    });
  });

  it("builds one deterministic spec while preserving its selected renderer template", () => {
    const current = session();
    syncCampaignContracts(current);
    current.experienceSpecRevision = 3;
    const spec = buildExperienceSpec(current, draft, seller, target);

    expect(spec).toMatchObject({
      schemaVersion: "1.0",
      revision: 4,
      sourceBriefRevision: current.campaignBrief?.revision,
      sourceBriefFingerprint: current.campaignBrief?.fingerprint,
      grounding: {
        seller: {
          source: "fast-extractor",
          sourceUrl: "https://jitterbit.com/"
        },
        target: {
          source: "fast-extractor",
          sourceUrl: "https://cisco.com/"
        },
        source: {
          kind: "public-url",
          status: "confirmed",
          title: "Jitterbit Harmony",
          host: "jitterbit.com"
        },
        audience: {
          status: "ready",
          findingIds: ["evidence_networking"]
        }
      },
      identities: {
        seller: { domain: "jitterbit.com", name: "Jitterbit" },
        target: { domain: "cisco.com", name: "Cisco" },
        offer: { name: "Jitterbit Harmony", sourceHost: "jitterbit.com" }
      },
      renderers: {
        web: { status: "ready" },
        folloze: { status: "not-requested" }
      },
      cta: {
        intent: "explore",
        style: "solid",
        label: "Plan the architecture session"
      }
    });
    expect(spec.artifactDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(spec.brandTokens.designDna).toEqual(seller.designDna);
    expect(spec.brandTokens.designDna).not.toBe(seller.designDna);
    expect(spec.brandTokens.designReceipt).toMatchObject({
      source: "remote-harvester",
      confidence: "high",
      appliedFields: expect.arrayContaining([
        "theme.hero",
        "buttons.radiusPx",
        "cards.shadow",
        "spacing.contentMaxWidthPx"
      ])
    });
    expect(spec.curatedSections).toHaveLength(1);
    expect(spec.draft).toMatchObject({
      wireframeName: "abm-account-microsite",
      experienceShape: "narrative-workflow",
      sectionSequence: ["thesis", "decision-lenses", "guided-questions"]
    });
    expect(draftFromExperienceSpec(spec)).toEqual(canonicalizeExperienceDraft(draft));

    current.experienceSpec = spec;
    const projection = toPublicSession(current);
    expect(projection.answers).not.toHaveProperty("offerSourceUrl");
    expect(projection.campaignOfferSource).toEqual({
      title: "Jitterbit Harmony",
      sourceHost: "jitterbit.com",
      status: "confirmed",
      intelligenceStatus: "pending",
      confirmedAt: expect.any(String)
    });
    expect(projection.experienceSpec).toMatchObject({
      schemaVersion: "1.0",
      sourceBriefRevision: current.campaignBrief?.revision,
      sectionCount: 3
    });
    expect(projection.experienceSpec).not.toHaveProperty("draft");
  });
});
