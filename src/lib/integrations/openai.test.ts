import { beforeEach, describe, expect, it, vi } from "vitest";

const parseResponse = vi.hoisted(() => vi.fn());

vi.mock("openai", () => ({
  default: class OpenAIMock {
    responses = { parse: parseResponse };
  }
}));

vi.mock("@/lib/config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/config")>();
  return {
    ...actual,
    hasOpenAI: true,
    config: {
      ...actual.config,
      openAIModel: "test-openai-model",
      generationTimeoutMs: 52_000
    }
  };
});

vi.mock("@/lib/integrations/brand-harvester", () => ({
  extractPublicContent: vi.fn()
}));

import { audienceSuggestionsFor } from "@/lib/brand-intelligence";
import {
  CANONICAL_EXPERIENCE_STRUCTURE,
  compileCampaignContext
} from "@/lib/generation/campaign-context";
import {
  experienceDraftSchema,
  normalizeAudienceLabel
} from "@/lib/generation/experience-schema";
import {
  deterministicDraft,
  experienceQualityFailure,
  generateExperienceDraft,
  SourceFetchError,
  isNonBlockingStyleFailure
} from "@/lib/integrations/openai";
import { extractPublicContent } from "@/lib/integrations/brand-harvester";
import type { BrandProfile, SessionAnswers, UseCase } from "@/lib/types";
import { verifiedBrandProfileFor } from "@/lib/verified-brand-profiles";

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

describe("supplemental public source ingestion", () => {
  beforeEach(() => {
    parseResponse.mockReset();
    vi.mocked(extractPublicContent).mockReset();
  });

  it.each([
    {
      label: "ABM",
      useCase: "abm" as const,
      targetBrand: cisco,
      expectedTarget: "Cisco",
      answers: {
        targetDomain: "cisco.com",
        audience: "Infrastructure leaders",
        objective: "Plan a working session",
        promotedOffer: "Jitterbit Harmony",
        sourceUrl: governedAutomationSource.sourceUrl
      }
    },
    {
      label: "campaign",
      useCase: "campaign" as const,
      targetBrand: undefined,
      expectedTarget: null,
      answers: {
        campaignType: "demand" as const,
        audience: "Automation leaders",
        objective: "Generate qualified engagement",
        promotedOffer: "Jitterbit Harmony",
        sourceUrl: governedAutomationSource.sourceUrl
      }
    }
  ])(
    "includes the submitted source body as supplemental $label context without changing identity authority",
    async ({ useCase, targetBrand, expectedTarget, answers }) => {
      vi.mocked(extractPublicContent).mockResolvedValue(governedAutomationSource);
      const context = compileCampaignContext({
        brand: jitterbit,
        targetBrand,
        useCase,
        answers,
        sourceContent: governedAutomationSource
      });
      parseResponse.mockResolvedValue({
        output_parsed: deterministicDraft({
          brand: jitterbit,
          targetBrand,
          useCase,
          answers,
          sourceContent: governedAutomationSource,
          context
        })
      });

      const result = await generateExperienceDraft({
        brand: jitterbit,
        targetBrand,
        useCase,
        answers
      });

      expect(result.draft).toBeDefined();
      expect(parseResponse).toHaveBeenCalled();
      expect(extractPublicContent).toHaveBeenCalledWith(
        governedAutomationSource.sourceUrl,
        expect.any(AbortSignal)
      );
      const request = parseResponse.mock.calls[0]?.[0] as {
        input: Array<{ content: Array<{ type: string; text?: string }> }>;
      };
      const brief = JSON.parse(request.input[0]?.content[0]?.text ?? "{}") as {
        seller: { name: string };
        target: { name: string } | null;
        sourceContent: typeof governedAutomationSource;
        sourceEvidencePhrases: string[];
        campaignContext: {
          brief: { seller: { name: string }; targetAccount: { name: string } | null };
          designContext: { brandOwner: string; sourceDesignInputs: string[] };
        };
      };

      expect(brief.sourceContent).toEqual(governedAutomationSource);
      expect(brief.sourceEvidencePhrases).toEqual(
        expect.arrayContaining([
          "Approval checkpoints keep automated workflows accountable before high-impact actions run."
        ])
      );
      expect(brief.seller.name).toBe("Jitterbit");
      expect(brief.target?.name ?? null).toBe(expectedTarget);
      expect(brief.campaignContext.brief.seller.name).toBe("Jitterbit");
      expect(brief.campaignContext.brief.targetAccount?.name ?? null).toBe(expectedTarget);
      expect(brief.campaignContext.designContext).toMatchObject({
        brandOwner: "Jitterbit",
        sourceDesignInputs: [jitterbit.sourceUrl]
      });
    }
  );

  it.each([
    {
      useCase: "abm" as const,
      targetBrand: cisco,
      answers: {
        targetDomain: "cisco.com",
        audience: "Infrastructure leaders",
        objective: "Plan a working session",
        sourceUrl: governedAutomationSource.sourceUrl
      }
    },
    {
      useCase: "campaign" as const,
      targetBrand: undefined,
      answers: {
        campaignType: "demand" as const,
        audience: "Automation leaders",
        objective: "Generate qualified engagement",
        sourceUrl: governedAutomationSource.sourceUrl
      }
    }
  ])("fails closed when a $useCase context URL cannot be read", async ({ useCase, targetBrand, answers }) => {
    vi.mocked(extractPublicContent).mockRejectedValue(new Error("unreadable public source"));

    await expect(
      generateExperienceDraft({ brand: jitterbit, targetBrand, useCase, answers })
    ).rejects.toBeInstanceOf(SourceFetchError);
    expect(parseResponse).not.toHaveBeenCalled();
  });
});

describe("deterministic experience copy", () => {
  it("keeps the full 103-character audience hypothesis while generating a schema-safe role label", () => {
    const incidentAudience =
      "Automation architects and platform owners designing resilient automation platforms and business systems";
    const answers = {
      targetDomain: "cisco.com",
      audience: incidentAudience,
      objective: "Book a meeting"
    };
    const context = compileCampaignContext({
      brand: jitterbit,
      targetBrand: cisco,
      useCase: "abm",
      answers
    });
    const draft = deterministicDraft({
      brand: jitterbit,
      targetBrand: cisco,
      useCase: "abm",
      answers,
      context
    });

    expect(incidentAudience).toHaveLength(103);
    expect(context.brief.audience).toBe(incidentAudience);
    expect(normalizeAudienceLabel(incidentAudience)).toBe(
      "Automation architects and platform owners"
    );
    expect(draft.audienceLabel).toBe("Automation architects and platform owners");
    expect(experienceDraftSchema.safeParse(draft).success).toBe(true);
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

  it("rejects encyclopedia template markup before writing the content hero", () => {
    const sourceContent = {
      sourceUrl: "https://en.wikipedia.org/wiki/ServiceNow",
      title: "ServiceNow",
      description: undefined,
      excerpt:
        "2025 Annual Report (Form 10-K) |date=2026-01-29 |publisher=[[U.S. Securities and Exchange Commission]]. ServiceNow connects digital workflows across enterprise teams. Platform owners use governed workflows to coordinate work across systems."
    };
    const answers = {
      sourceUrl: sourceContent.sourceUrl,
      sourceTitle: "ServiceNow",
      audience: "Data and AI platform leaders",
      objective: "Increase content engagement"
    };
    const draft = deterministicDraft({
      brand: jitterbit,
      useCase: "content",
      answers,
      sourceContent
    });

    expect(draft.headline).toContain("Platform owners use governed workflows");
    expect(JSON.stringify(draft)).not.toMatch(/\|date=|\|publisher=|\[\[/i);
  });

  it("fails the copy gate when source template markup reaches visible copy", () => {
    const answers = {
      sourceUrl: governedAutomationSource.sourceUrl,
      sourceTitle: "Governed Automation Field Guide",
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

    expect(
      experienceQualityFailure({
        draft: {
          ...draft,
          headline: "Jitterbit report |date=2026-01-29 |publisher=[[U.S."
        },
        brand: jitterbit,
        useCase: "content",
        answers,
        context,
        sourceContent: governedAutomationSource
      })
    ).toBe("copy_quality_source_template_markup");
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

  it("does not let advisory source grounding mask an invented metric", () => {
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
    const weaklyGrounded = {
      ...grounded,
      headline: "Jitterbit gives automation teams a practical operating path.",
      thesisBody: "Connect the central idea to one operating decision the team can examine.",
      closingBody: "Choose a practical action that makes teams move 42% faster.",
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
        draft: weaklyGrounded,
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
    expect(draft.headline).toMatch(/integration and automation.*Cisco's networking/i);
    expect(`${draft.thesisHeadline} ${draft.thesisBody}`).toMatch(/Cisco.*security/i);
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

  it("falls back to concise target signals instead of turning homepage slogans into copy", () => {
    const sloganHeavyCisco: BrandProfile = {
      ...cisco,
      publicTopics: [
        "Enterprise operations at agentic AI speed",
        "The critical infrastructure for the AI era"
      ]
    };
    const answers = {
      targetDomain: "cisco.com",
      audience: "Infrastructure architects and platform owners",
      objective: "Book a working session"
    };
    const { draft } = draftFor("abm", answers, sloganHeavyCisco);
    const visibleCopy = JSON.stringify(draft);

    expect(draft.headline).toBe("Connect integration and automation to Cisco's infrastructure.");
    expect(draft.thesisHeadline).toContain("Cisco's infrastructure");
    expect(draft.thesisHeadline).toContain("security");
    expect(visibleCopy).not.toMatch(/agentic AI speed|critical infrastructure for the AI era/i);
    expect(visibleCopy).not.toContain("…");
  });

  it("does not splice imperative ServiceNow homepage headings into an ABM sentence", () => {
    const serviceNow = verifiedBrandProfileFor("servicenow.com");
    expect(serviceNow).toBeDefined();
    const answers = {
      targetDomain: "servicenow.com",
      audience: "Enterprise platform and workflow leaders",
      objective: "Book a working session"
    };
    const { draft } = draftFor("abm", answers, serviceNow);
    const visibleCopy = JSON.stringify(draft);

    expect(draft.headline).toBe(
      "Connect integration and automation to ServiceNow's data foundation."
    );
    expect(draft.thesisHeadline).toContain("AI governance");
    expect(visibleCopy).not.toMatch(
      /ServiceNow's (?:put AI to work|connect AI|meet the autonomous workforce)/i
    );
  });

  it("keeps fallback decision signals distinct when a public topic matches a category label", () => {
    const dataAiTarget: BrandProfile = {
      ...cisco,
      domain: "example.ai",
      companyName: "ExampleAI",
      description: "Enterprise data and AI governance platform.",
      publicContext: "ExampleAI supports governed data and enterprise AI operations.",
      publicTopics: ["AI governance"]
    };
    const { draft } = draftFor(
      "abm",
      {
        targetDomain: "example.ai",
        audience: "Data and AI platform leaders",
        objective: "Book a working session"
      },
      dataAiTarget
    );

    expect(draft.signalLabels[0]).toBe("AI governance");
    expect(draft.signalLabels[1]).toBe("data foundation");
    expect(new Set(draft.signalLabels).size).toBe(3);
    expect(draft.sections[0].eyebrow).not.toBe(draft.sections[1].eyebrow);
  });

  it("rejects imperative and company-prefixed public topics from possessive ABM copy", () => {
    const targets: BrandProfile[] = [
      {
        ...cisco,
        domain: "acme.example",
        companyName: "Acme",
        description: "Business software for digital operations.",
        publicContext: "Acme supports business systems and digital operations.",
        publicTopics: ["Accelerate digital transformation"]
      },
      {
        ...cisco,
        domain: "snowflake.example",
        companyName: "Snowflake",
        description: "Cloud data platform for analytics and enterprise AI.",
        publicContext: "Snowflake supports cloud data, analytics, and AI governance.",
        publicTopics: ["Snowflake Cortex AI"]
      }
    ];

    for (const target of targets) {
      const { draft } = draftFor(
        "abm",
        {
          targetDomain: target.domain,
          audience: "Enterprise platform leaders",
          objective: "Book a working session"
        },
        target
      );
      const visibleCopy = JSON.stringify(draft);

      expect(visibleCopy).not.toMatch(/'s accelerate digital transformation/i);
      expect(visibleCopy).not.toMatch(/'s snowflake cortex AI/i);
      expect(new Set(draft.signalLabels).size).toBe(3);
    }
  });

  it("rejects target-account copy that flattens harvested company-name casing", () => {
    const serviceNow: BrandProfile = {
      ...cisco,
      domain: "servicenow.com",
      companyName: "ServiceNow",
      description: "AI-powered workflows and enterprise service operations.",
      publicContext: "ServiceNow connects enterprise workflows, service operations, and governed AI.",
      publicTopics: ["Enterprise workflows", "Service operations", "Governed AI"]
    };
    const answers = {
      targetDomain: "servicenow.com",
      audience: "Enterprise platform leaders",
      objective: "Book a meeting"
    };
    const { context, draft } = draftFor("abm", answers, serviceNow);
    const flattened = JSON.parse(
      JSON.stringify(draft).replaceAll("ServiceNow", "Servicenow")
    ) as typeof draft;

    expect(
      experienceQualityFailure({
        draft: flattened,
        brand: jitterbit,
        targetBrand: serviceNow,
        useCase: "abm",
        answers,
        context
      })
    ).toBe("copy_quality_target_name_casing");
  });

  it("keeps a shared spec while selecting register-specific templates, labels, CTA, and copy", () => {
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
    expect(new Set(variants.map((draft) => draft.experienceShape)).size).toBe(4);
    expect(new Set(variants.map((draft) => draft.sectionSequence.join("|")))).toEqual(
      new Set([CANONICAL_EXPERIENCE_STRUCTURE.sectionSequence.join("|")])
    );
    expect(variants.every((draft) => draft.sections.length === 3)).toBe(true);
    expect(new Set(variants.map((draft) => JSON.stringify(draft.sectionLabels))).size).toBe(5);
    expect(new Set(variants.map((draft) => draft.primaryCta)).size).toBe(5);
    expect(new Set(variants.map((draft) => draft.headline)).size).toBe(5);
    expect(new Set(variants.map((draft) => JSON.stringify(draft.sections))).size).toBe(5);
  });

  it("rejects LLM output that mutates the selected template contract", () => {
    const answers = {
      campaignType: "product" as const,
      promotedOffer: "Governed AI automation",
      audience: "Enterprise architects",
      objective: "Launch or announce"
    };
    const { context, draft } = draftFor("campaign", answers);
    const mutations: Array<[string, typeof draft]> = [
      [
        "structure_wireframe_mismatch",
        { ...draft, wireframeName: "canonical-desktop-experience" }
      ],
      [
        "structure_shape_mismatch",
        { ...draft, experienceShape: "interactive-workbench" }
      ],
      [
        "structure_sequence_mismatch",
        { ...draft, sectionSequence: ["decision-lenses", "thesis", "guided-questions"] }
      ]
    ];

    for (const [failure, mutatedDraft] of mutations) {
      expect(
        experienceQualityFailure({
          draft: mutatedDraft,
          brand: jitterbit,
          useCase: "campaign",
          answers,
          context
        })
      ).toBe(failure);
    }
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
