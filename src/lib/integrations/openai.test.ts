import { describe, expect, it } from "vitest";

import { audienceSuggestionsFor } from "@/lib/brand-intelligence";
import { compileCampaignContext } from "@/lib/generation/campaign-context";
import {
  deterministicDraft,
  experienceQualityFailure,
  isNonBlockingStyleFailure
} from "@/lib/integrations/openai";
import type { BrandProfile, SessionAnswers, UseCase } from "@/lib/types";

const jitterbit: BrandProfile = {
  domain: "jitterbit.com",
  companyName: "Jitterbit",
  description: "Integration, workflow automation, API management, and application development.",
  publicTopics: ["Automation with AI accountability at its core."],
  imageUrls: [],
  colors: ["#1B3E51", "#F44414", "#FFFFFF"],
  primaryColor: "#1B3E51",
  accentColor: "#F44414",
  surfaceColor: "#FFFFFF",
  sourceUrl: "https://jitterbit.com",
  source: "fast-extractor"
};

const cisco: BrandProfile = {
  ...jitterbit,
  domain: "cisco.com",
  companyName: "Cisco",
  description: "Networking, security, collaboration, and observability technology.",
  publicTopics: ["Networking", "Security", "Infrastructure", "Observability"]
};

const workday: BrandProfile = {
  ...jitterbit,
  domain: "workday.com",
  companyName: "Workday",
  description: "Human capital management, workforce planning, finance, and enterprise analytics.",
  publicContext:
    "Workday brings workforce planning, financial operations, and enterprise analytics into cloud applications.",
  publicTopics: [
    "Human capital management",
    "Workforce planning",
    "Finance",
    "Enterprise analytics"
  ]
};

const governedAutomationSource = {
  sourceUrl: "https://example.com/governed-automation",
  title: "The Governed Automation Field Guide",
  description:
    "Approval checkpoints keep automated workflows accountable before high-impact actions run.",
  excerpt:
    "The Governed Automation Field Guide. Approval checkpoints keep automated workflows accountable before high-impact actions run. Reusable integration patterns reduce duplicate business logic across teams. Clear exception ownership gives operations teams an escalation path when automation needs human review."
};

function draftFor(useCase: UseCase, answers: SessionAnswers, targetBrand?: BrandProfile) {
  const context = compileCampaignContext({ brand: jitterbit, targetBrand, useCase, answers });
  const draft = deterministicDraft({ brand: jitterbit, targetBrand, useCase, answers, context });
  return { context, draft };
}

describe("deterministic experience copy", () => {
  it("keeps repaired content drafts when only token-distribution grounding is imperfect", () => {
    const contentContext = compileCampaignContext({
      brand: jitterbit,
      useCase: "content",
      answers: {
        sourceName: "AI integration guide.pdf",
        audience: "Enterprise integration leaders",
        objective: "Educate buyers"
      }
    });
    const abmContext = compileCampaignContext({
      brand: jitterbit,
      targetBrand: cisco,
      useCase: "abm",
      answers: {
        targetDomain: "cisco.com",
        audience: "Infrastructure leaders",
        objective: "Book a meeting"
      }
    });

    expect(
      isNonBlockingStyleFailure("copy_quality_missing_source_grounding", contentContext)
    ).toBe(true);
    expect(
      isNonBlockingStyleFailure(
        "copy_quality_source_grounding_not_distributed",
        contentContext
      )
    ).toBe(true);
    expect(
      isNonBlockingStyleFailure("copy_quality_unsupported_number", contentContext)
    ).toBe(false);
    expect(
      isNonBlockingStyleFailure("copy_quality_missing_source_grounding", abmContext)
    ).toBe(false);
  });

  it("creates a Jitterbit-specific content story for the selected audience and objective", () => {
    const draft = deterministicDraft({
      brand: jitterbit,
      useCase: "content",
      answers: {
        audience: "Enterprise architects and platform owners",
        objective: "Educate buyers",
        sourceName: "Enterprise automation guide.pdf"
      }
    });
    const copy = JSON.stringify(draft);
    expect(draft.headline).toMatch(/Enterprise automation guide/i);
    expect(copy).toMatch(/integration|automation|architecture/i);
    expect(copy).toContain("Enterprise architects and platform owners");
    expect(copy).not.toMatch(/make the next move easier to believe|generic pages|relevance is a sequence|one clear goal|objective|grounded in|source:/i);
    expect(draft.sections.every((section) => section.proof.endsWith("?"))).toBe(true);
    expect(draft.closingHeadline).not.toBe(draft.headline);
  });

  it("turns public source facts into a grounded content story across hero, thesis, and sections", () => {
    const answers = {
      sourceUrl: governedAutomationSource.sourceUrl,
      audience: "Enterprise architects and platform owners",
      objective: "Educate buyers"
    };
    const context = compileCampaignContext({
      brand: jitterbit,
      useCase: "content",
      answers,
      sourceContent: governedAutomationSource
    });
    const draft = deterministicDraft({
      brand: jitterbit,
      useCase: "content",
      answers,
      sourceContent: governedAutomationSource,
      context
    });

    expect(draft.headline).toContain(
      "Approval checkpoints keep automated workflows accountable before high-impact actions run"
    );
    expect(`${draft.thesisHeadline} ${draft.thesisBody}`).toContain(
      "Reusable integration patterns reduce duplicate business logic across teams"
    );
    expect(JSON.stringify(draft.sections)).toContain(
      "Clear exception ownership gives operations teams an escalation path"
    );
    expect(JSON.stringify(draft)).not.toMatch(/42%|threefold|industry-leading/i);
    expect(
      experienceQualityFailure({
        draft,
        brand: jitterbit,
        useCase: "content",
        answers,
        context,
        sourceContent: governedAutomationSource
      })
    ).toBeUndefined();
  });

  it("skips source-title and page-chrome artifacts before choosing content evidence", () => {
    const sourceContent = {
      sourceUrl: "https://example.com/jitterbit-mcp",
      title: "Jitterbit MCP: The Secure Foundation for Enterprise AI Agents",
      description:
        "AI agents need governed access to enterprise systems before they can take action safely.",
      excerpt:
        "Jitterbit MCP: The Secure Foundation for Enterprise AI Agents | Jitterbit 8times. Agent access must stay connected to orchestration, observability, and accountability. Security teams need a reviewable control model before autonomous actions scale."
    };
    const answers = {
      sourceUrl: sourceContent.sourceUrl,
      audience: "Enterprise AI platform and security leaders",
      objective: "Educate buyers"
    };
    const context = compileCampaignContext({
      brand: jitterbit,
      useCase: "content",
      answers,
      sourceContent
    });
    const draft = deterministicDraft({
      brand: jitterbit,
      useCase: "content",
      answers,
      sourceContent,
      context
    });

    expect(JSON.stringify(draft)).not.toContain("8times");
    expect(JSON.stringify(draft)).toContain(
      "Agent access must stay connected to orchestration, observability, and accountability"
    );
  });

  it("never exposes a promotional or truncated deterministic content headline", () => {
    const sourceContent = {
      sourceUrl: "https://example.com/ai-ipaas",
      title: "How AI-Powered iPaaS Drives Smarter Integration",
      description:
        "See what Gartner and other experts are saying about integrating AI—and why it matters.",
      excerpt:
        "See what Gartner and other experts are saying about integrating AI—and why it matters."
    };
    const answers = {
      sourceUrl: sourceContent.sourceUrl,
      audience: "Enterprise integration leaders",
      objective: "Educate buyers"
    };
    const draft = deterministicDraft({
      brand: jitterbit,
      useCase: "content",
      answers,
      sourceContent
    });

    expect(draft.headline).toBe(sourceContent.title);
    expect(draft.headline).not.toMatch(/\u2026|\.\.\.|see what/i);
    expect(draft.headline.split(/\s+/).length).toBeLessThanOrEqual(11);
  });

  it("uses the source title instead of clipping a long source sentence mid-thought", () => {
    const sourceContent = {
      sourceUrl: "https://example.com/enterprise-ai-agents",
      title: "Jitterbit MCP: The Secure Foundation for Enterprise AI Agents",
      description:
        "Enterprises are racing to deploy AI agents, but most lack the governed infrastructure needed to let those agents act safely across critical systems.",
      excerpt:
        "Enterprises are racing to deploy AI agents, but most lack the governed infrastructure needed to let those agents act safely across critical systems."
    };
    const answers = {
      sourceUrl: sourceContent.sourceUrl,
      audience: "Enterprise architects and platform owners",
      objective: "Educate buyers"
    };
    const draft = deterministicDraft({
      brand: jitterbit,
      useCase: "content",
      answers,
      sourceContent
    });

    expect(draft.headline).toBe(sourceContent.title);
    expect(draft.headline).not.toContain("but most lack");
  });

  it("rejects title-only content wrapping that ignores the supplied public source", () => {
    const answers = {
      sourceUrl: governedAutomationSource.sourceUrl,
      audience: "Enterprise architects and platform owners",
      objective: "Educate buyers"
    };
    const context = compileCampaignContext({
      brand: jitterbit,
      useCase: "content",
      answers,
      sourceContent: governedAutomationSource
    });
    const grounded = deterministicDraft({
      brand: jitterbit,
      useCase: "content",
      answers,
      sourceContent: governedAutomationSource,
      context
    });
    const titleOnly = {
      ...grounded,
      headline: "The Governed Automation Field Guide: choose the next operating question.",
      thesisBody:
        "Connect the central idea to the operating implication and the next question the team needs to examine.",
      sections: grounded.sections.map((section, index) => ({
        ...section,
        headline: [
          "Clarify the operating question.",
          "Connect the question to Jitterbit.",
          "Choose the next practical action."
        ][index],
        body: [
          "Start with the decision the audience needs to make.",
          "Jitterbit connects integration and automation to a practical operating lens.",
          "Carry one focused question into the next team conversation."
        ][index]
      })) as typeof grounded.sections
    };

    expect(
      experienceQualityFailure({
        draft: titleOnly,
        brand: jitterbit,
        useCase: "content",
        answers,
        context,
        sourceContent: governedAutomationSource
      })
    ).toBe("copy_quality_missing_source_grounding");
  });

  it("rejects source facts packed into one region instead of shaping the full content journey", () => {
    const answers = {
      sourceUrl: governedAutomationSource.sourceUrl,
      audience: "Enterprise architects and platform owners",
      objective: "Educate buyers"
    };
    const context = compileCampaignContext({
      brand: jitterbit,
      useCase: "content",
      answers,
      sourceContent: governedAutomationSource
    });
    const grounded = deterministicDraft({
      brand: jitterbit,
      useCase: "content",
      answers,
      sourceContent: governedAutomationSource,
      context
    });
    const heroOnly = {
      ...grounded,
      headline:
        "Approval checkpoints keep automated workflows accountable before high-impact actions run.",
      subhead:
        "Jitterbit connects the argument to automation. Reusable integration patterns reduce duplicate business logic across teams. Clear exception ownership gives operations teams an escalation path when automation needs human review.",
      thesisBody: "The operating implication should lead to one decision the team can examine.",
      sections: grounded.sections.map((section, index) => ({
        ...section,
        headline: [
          "Clarify the operating question.",
          "Connect the question to Jitterbit.",
          "Choose the next practical action."
        ][index],
        body: [
          "Start with the decision the audience needs to make.",
          "Jitterbit connects integration and automation to a practical operating lens.",
          "Carry one focused question into the next team conversation."
        ][index]
      })) as typeof grounded.sections
    };

    expect(
      experienceQualityFailure({
        draft: heroOnly,
        brand: jitterbit,
        useCase: "content",
        answers,
        context,
        sourceContent: governedAutomationSource
      })
    ).toBe("copy_quality_source_grounding_not_distributed");
  });

  it("rejects an invented content metric even when the rest of the source story is grounded", () => {
    const answers = {
      sourceUrl: governedAutomationSource.sourceUrl,
      audience: "Enterprise architects and platform owners",
      objective: "Educate buyers"
    };
    const context = compileCampaignContext({
      brand: jitterbit,
      useCase: "content",
      answers,
      sourceContent: governedAutomationSource
    });
    const grounded = deterministicDraft({
      brand: jitterbit,
      useCase: "content",
      answers,
      sourceContent: governedAutomationSource,
      context
    });

    expect(
      experienceQualityFailure({
        draft: { ...grounded, closingBody: `${grounded.closingBody} Teams move 42% faster.` },
        brand: jitterbit,
        useCase: "content",
        answers,
        context,
        sourceContent: governedAutomationSource
      })
    ).toBe("copy_quality_unsupported_number");
  });

  it("adds respectful target-account context without inventing private claims", () => {
    const answers = {
      targetDomain: "cisco.com",
      audience: "IT operations and platform teams",
      objective: "Book a meeting"
    };
    const { context, draft } = draftFor("abm", answers, cisco);
    expect(draft.eyebrow).toBe("Jitterbit for Cisco");
    expect(draft.title).toMatch(/Jitterbit for Cisco/i);
    expect(draft.headline).toMatch(/Cisco: connect networking.*integration and automation/i);
    expect(draft.subhead).toMatch(/networking.*security/i);
    expect(JSON.stringify(draft)).not.toMatch(/we know|your current process|struggles with|intent|budget/i);
    expect(draft.primaryCta).toBe("Plan the working session");
    expect(
      experienceQualityFailure({
        draft,
        brand: jitterbit,
        targetBrand: cisco,
        useCase: "abm",
        answers,
        context
      })
    ).toBeUndefined();
  });

  it("routes ABM, demand, product, event, and content into distinct registers and page shapes", () => {
    const variants = [
      draftFor(
        "abm",
        { targetDomain: "cisco.com", audience: "IT operations", objective: "Book a meeting" },
        cisco
      ).draft,
      draftFor("campaign", {
        campaignType: "demand",
        audience: "Integration leaders",
        objective: "Generate demand"
      }).draft,
      draftFor("campaign", {
        campaignType: "product",
        audience: "Enterprise architects",
        objective: "Launch a product"
      }).draft,
      draftFor("campaign", {
        campaignType: "event",
        eventSource: "Enterprise Automation Summit",
        audience: "Platform owners",
        objective: "Continue event engagement"
      }).draft,
      draftFor("content", {
        sourceName: "The governed automation field guide.pdf",
        audience: "Application leaders",
        objective: "Educate buyers"
      }).draft
    ];

    expect(new Set(variants.map((draft) => draft.campaignRegister)).size).toBe(5);
    expect(new Set(variants.map((draft) => draft.wireframeName)).size).toBe(5);
    expect(new Set(variants.map((draft) => draft.headline)).size).toBe(5);
    expect(variants.map((draft) => draft.experienceShape)).toEqual([
      "narrative-workflow",
      "offer-landing-page",
      "interactive-workbench",
      "event-cohort",
      "resource-companion"
    ]);
  });

  it("rejects an ABM draft whose target can be swapped out of the narrative", () => {
    const answers = {
      targetDomain: "cisco.com",
      audience: "IT operations and platform teams",
      objective: "Book a meeting"
    };
    const { context, draft } = draftFor("abm", answers, cisco);
    const logoSwap = {
      ...draft,
      thesisHeadline: draft.thesisHeadline.replaceAll("Cisco", "the account"),
      thesisBody: draft.thesisBody.replaceAll("Cisco", "the account"),
      closingHeadline: draft.closingHeadline.replaceAll("Cisco", "the account"),
      closingBody: draft.closingBody.replaceAll("Cisco", "the account")
    };

    expect(
      experienceQualityFailure({
        draft: logoSwap,
        brand: jitterbit,
        targetBrand: cisco,
        useCase: "abm",
        answers,
        context
      })
    ).toBe("copy_quality_logo_swap_narrative");
  });

  it("rejects name-only ABM copy that ignores the target's public operating evidence", () => {
    const answers = {
      targetDomain: "cisco.com",
      audience: "IT operations and platform teams",
      objective: "Book a meeting"
    };
    const { context, draft } = draftFor("abm", answers, cisco);
    const genericLabels = [
      "Operating question",
      "Validation boundary",
      "Next action"
    ] as typeof draft.signalLabels;
    const nameOnly = {
      ...draft,
      signalLabels: genericLabels,
      thesisHeadline: "For Cisco, the first operating question should stay focused.",
      thesisBody:
        "Jitterbit connects the relevant mechanism, validation boundary, and next action without widening the first conversation.",
      narrativeArc: "What should Cisco and its IT operations teams validate first?",
      sections: draft.sections.map((section, index) => ({
        ...section,
        eyebrow: genericLabels[index],
        headline: "Make the first validation boundary concrete.",
        body: "Connect the systems, workflow, and result the team needs to examine.",
        proof: "Which operating boundary should the team validate first?"
      })) as typeof draft.sections
    };

    expect(
      experienceQualityFailure({
        draft: nameOnly,
        brand: jitterbit,
        targetBrand: cisco,
        useCase: "abm",
        answers,
        context
      })
    ).toBe("copy_quality_missing_target_signal_narrative");
  });

  it("rejects navigation labels presented as target-account insight", () => {
    const answers = {
      targetDomain: "cisco.com",
      audience: "IT operations and platform teams",
      objective: "Book a meeting"
    };
    const { context, draft } = draftFor("abm", answers, cisco);
    const navigationCopy = {
      ...draft,
      thesisBody: `${draft.thesisBody} Cisco's public focus on Products and Services creates the account case.`
    };

    expect(
      experienceQualityFailure({
        draft: navigationCopy,
        brand: jitterbit,
        targetBrand: cisco,
        useCase: "abm",
        answers,
        context
      })
    ).toBe("copy_quality_navigation_as_account_insight");
  });

  it("rejects copy that ends mid-thought", () => {
    const answers = {
      targetDomain: "cisco.com",
      audience: "IT operations and platform teams",
      objective: "Book a meeting"
    };
    const { context, draft } = draftFor("abm", answers, cisco);

    expect(
      experienceQualityFailure({
        draft: {
          ...draft,
          thesisHeadline:
            "For Cisco architects, Jitterbit connects integration and automation without treating"
        },
        brand: jitterbit,
        targetBrand: cisco,
        useCase: "abm",
        answers,
        context
      })
    ).toBe("copy_quality_incomplete_thought");
  });

  it("rejects a harvested heading spliced into a sentence", () => {
    const answers = {
      targetDomain: "cisco.com",
      audience: "IT operations and platform teams",
      objective: "Book a meeting"
    };
    const { context, draft } = draftFor("abm", answers, cisco);

    expect(
      experienceQualityFailure({
        draft: {
          ...draft,
          narrativeArc:
            "How should Cisco move at Enterprise operations at agentic AI speed?"
        },
        brand: jitterbit,
        targetBrand: cisco,
        useCase: "abm",
        answers,
        context
      })
    ).toBe("copy_quality_repeated_preposition");
  });

  it("produces materially different evidence-led stories and audiences for two targets", () => {
    const ciscoAudience = audienceSuggestionsFor(jitterbit, cisco)[0];
    const workdayAudience = audienceSuggestionsFor(jitterbit, workday)[0];
    const ciscoAnswers = {
      targetDomain: "cisco.com",
      audience: ciscoAudience,
      objective: "Book a meeting"
    };
    const workdayAnswers = {
      targetDomain: "workday.com",
      audience: workdayAudience,
      objective: "Book a meeting"
    };
    const ciscoExperience = draftFor("abm", ciscoAnswers, cisco);
    const workdayExperience = draftFor("abm", workdayAnswers, workday);
    const normalizeNames = (value: unknown) =>
      JSON.stringify(value)
        .replaceAll(/Cisco|Workday/gi, "TARGET")
        .replaceAll(/cisco\.com|workday\.com/gi, "target.example");

    expect(normalizeNames(ciscoExperience.draft)).not.toBe(normalizeNames(workdayExperience.draft));
    expect(JSON.stringify(ciscoExperience.draft)).toMatch(/networking|security|infrastructure/i);
    expect(JSON.stringify(workdayExperience.draft)).toMatch(/human capital|workforce|finance|analytics/i);
    expect(ciscoAudience).toMatch(/network|infrastructure/i);
    expect(workdayAudience).toMatch(/HR|workforce|people/i);
    expect(
      experienceQualityFailure({
        draft: ciscoExperience.draft,
        brand: jitterbit,
        targetBrand: cisco,
        useCase: "abm",
        answers: ciscoAnswers,
        context: ciscoExperience.context
      })
    ).toBeUndefined();
    expect(
      experienceQualityFailure({
        draft: workdayExperience.draft,
        brand: jitterbit,
        targetBrand: workday,
        useCase: "abm",
        answers: workdayAnswers,
        context: workdayExperience.context
      })
    ).toBeUndefined();
  });

  it("allows natural audience language without forcing a form label into the hero", () => {
    const answers = {
      targetDomain: "cisco.com",
      audience: "IT operations and platform teams",
      objective: "Book a meeting"
    };
    const { context, draft } = draftFor("abm", answers, cisco);
    const naturalHero = {
      ...draft,
      subhead: draft.subhead.replace(
        "IT operations and platform teams",
        "the teams connecting Cisco's operating systems"
      )
    };

    expect(naturalHero.audienceLabel).toBe(answers.audience);
    expect(
      experienceQualityFailure({
        draft: naturalHero,
        brand: jitterbit,
        targetBrand: cisco,
        useCase: "abm",
        answers,
        context
      })
    ).toBeUndefined();
  });

  it("rejects an unexpected script fragment in otherwise English copy", () => {
    const answers = {
      targetDomain: "cisco.com",
      audience: "IT operations and platform teams",
      objective: "Book a meeting"
    };
    const { context, draft } = draftFor("abm", answers, cisco);

    expect(
      experienceQualityFailure({
        draft: { ...draft, thesisBody: `${draft.thesisBody} app开发` },
        brand: jitterbit,
        targetBrand: cisco,
        useCase: "abm",
        answers,
        context
      })
    ).toBe("copy_quality_unexpected_script");

    expect(
      experienceQualityFailure({
        draft: { ...draft, eyebrow: "A working session for Cisco инфраструктура leaders" },
        brand: jitterbit,
        targetBrand: cisco,
        useCase: "abm",
        answers,
        context
      })
    ).toBe("copy_quality_unexpected_script");
  });

  it("rejects unsupported numeric proof when only mechanism proof is available", () => {
    const sparseBrand: BrandProfile = {
      ...jitterbit,
      domain: "acme.test",
      companyName: "Acme",
      description: undefined,
      publicTopics: [],
      source: "fallback"
    };
    const answers = { audience: "Operations leaders", objective: "Generate demand" };
    const context = compileCampaignContext({ brand: sparseBrand, useCase: "campaign", answers });
    const draft = deterministicDraft({ brand: sparseBrand, useCase: "campaign", answers, context });
    const unsupported = { ...draft, subhead: `${draft.subhead} Teams improve throughput by 37%.` };

    expect(context.brief.proofMode).toBe("mechanism-only");
    expect(
      experienceQualityFailure({
        draft: unsupported,
        brand: sparseBrand,
        useCase: "campaign",
        answers,
        context
      })
    ).toBe("copy_quality_unsupported_number");
  });

  it("rejects content headlines that consume the mobile first viewport", () => {
    const answers = {
      sourceName: "The governed automation field guide.pdf",
      audience: "Application leaders",
      objective: "Educate buyers"
    };
    const { context, draft } = draftFor("content", answers);
    const tooLong = {
      ...draft,
      headline: "The governed automation field guide for every enterprise application leader evaluating the next operating model"
    };

    expect(
      experienceQualityFailure({
        draft: tooLong,
        brand: jitterbit,
        useCase: "content",
        answers,
        context
      })
    ).toBe("copy_quality_headline_too_long");
  });

  it("rejects navigation and support boilerplate in content experiences", () => {
    const answers = {
      sourceName: "The governed automation field guide.pdf",
      audience: "Application leaders",
      objective: "Educate buyers"
    };
    const { context, draft } = draftFor("content", answers);

    expect(
      experienceQualityFailure({
        draft: { ...draft, thesisBody: `${draft.thesisBody} Contact Support Select Language.` },
        brand: jitterbit,
        useCase: "content",
        answers,
        context
      })
    ).toBe("copy_quality_source_boilerplate");
  });
});
