import type { ExperienceDraft } from "../../src/lib/generation/experience-schema";
import { renderExperienceHtml } from "../../src/lib/generation/experience-template";
import type { BrandProfile, SessionAnswers, UseCase } from "../../src/lib/types";

export const fixtureAssetOrigin = "https://assets.example.test";

export const sellerBrand: BrandProfile = {
  domain: "jitterbit.com",
  companyName: "Jitterbit",
  title: "AI-powered enterprise automation and integration",
  description:
    "Jitterbit connects applications, data, APIs, and workflows through one enterprise automation platform.",
  publicContext:
    "Harmony brings integration, workflow automation, application development, API management, EDI, and MCP into one platform.",
  publicTopics: ["enterprise automation", "integration", "API management", "workflow automation"],
  logoUrl: `${fixtureAssetOrigin}/jitterbit-logo.svg`,
  imageUrls: [
    `${fixtureAssetOrigin}/jitterbit-platform.svg`,
    `${fixtureAssetOrigin}/jitterbit-workflow.svg`,
    `${fixtureAssetOrigin}/jitterbit-governance.svg`
  ],
  colors: ["#1B3E51", "#F44414", "#FFFFFF"],
  primaryColor: "#1B3E51",
  accentColor: "#F44414",
  surfaceColor: "#FFFFFF",
  displayFontFamily: "Roboto Slab",
  bodyFontFamily: "Roboto",
  sourceUrl: "https://www.jitterbit.com/",
  source: "brand-harvester"
};

export const targetBrand: BrandProfile = {
  domain: "cisco.com",
  companyName: "Cisco",
  title: "Networking, security, and observability",
  description:
    "Cisco provides networking, security, collaboration, and observability technology for enterprise teams.",
  publicContext:
    "Cisco teams coordinate infrastructure, security, applications, and operations across a broad technology estate.",
  publicTopics: ["networking", "security", "infrastructure", "observability"],
  logoUrl: `${fixtureAssetOrigin}/cisco-logo.svg`,
  imageUrls: [],
  colors: ["#049FD9", "#0D274D", "#FFFFFF"],
  primaryColor: "#0D274D",
  accentColor: "#049FD9",
  surfaceColor: "#FFFFFF",
  displayFontFamily: "CiscoSans",
  bodyFontFamily: "CiscoSans",
  sourceUrl: "https://www.cisco.com/",
  source: "brand-harvester"
};

export const experienceDraft: ExperienceDraft = {
  campaignRegister: "one-to-one-abm",
  designRegister: "source-brand-image-led",
  wireframeName: "canonical-desktop-experience",
  experienceShape: "guided-buyer-experience",
  sectionSequence: ["thesis", "decision-lenses", "guided-questions"],
  sectionLabels: {
    thesis: "The account-level case",
    lenses: "Choose the decision lens",
    journey: "Questions for the next conversation",
    close: "Put the first question on the table"
  },
  title: "Jitterbit for Cisco | Governed enterprise automation",
  eyebrow: "Jitterbit for Cisco technology leaders",
  headline: "Connect automation across Cisco's technology estate without losing control.",
  subhead:
    "Give infrastructure, security, and application teams one governed path for connecting systems, coordinating workflows, and evaluating the next integration priority.",
  thesisHeadline: "The opportunity is not another isolated workflow. It is a shared operating layer.",
  thesisBody:
    "A governed automation approach can help teams connect work across applications and APIs while keeping ownership, reuse, and oversight visible.",
  primaryCta: "Review the integration path",
  audienceLabel: "Infrastructure, security, and application leaders",
  narrativeArc: "Align the operating model, examine the control points, then choose a practical first workflow.",
  sections: [
    {
      eyebrow: "Operating model",
      headline: "Create one route across systems and teams.",
      body:
        "Frame integration as a shared capability so infrastructure, security, and application owners can evaluate the same workflow context.",
      proof: "Which systems and teams need to share one integration operating model?"
    },
    {
      eyebrow: "Governance",
      headline: "Keep control visible as automation expands.",
      body:
        "Make ownership, reusable connections, and policy considerations part of the evaluation before isolated projects multiply.",
      proof: "Where should ownership and policy stay visible as workflows expand?"
    },
    {
      eyebrow: "First move",
      headline: "Choose a workflow that proves the operating model.",
      body:
        "Use one cross-system priority to clarify stakeholders, dependencies, and the evidence needed for a broader automation decision.",
      proof: "Which first workflow would make the broader automation case concrete?"
    }
  ],
  signalLabels: ["Operating model", "Governance", "First workflow"],
  closingHeadline: "Choose the first integration priority worth evaluating together.",
  closingBody:
    "Bring the relevant Cisco stakeholders into one working session around the workflow, systems, and control points that matter first."
};

export function generatedExperienceHtml(input: {
  seller?: BrandProfile;
  target?: BrandProfile | null;
  draft?: ExperienceDraft;
  useCase?: UseCase;
  answers?: SessionAnswers;
} = {}): string {
  const resolvedTarget = input.target === null ? undefined : input.target ?? targetBrand;
  return renderExperienceHtml({
    draft: input.draft ?? experienceDraft,
    brand: input.seller ?? sellerBrand,
    targetBrand: resolvedTarget,
    useCase: input.useCase ?? "abm",
    answers: input.answers ?? {
      targetDomain: "cisco.com",
      audience: experienceDraft.audienceLabel,
      objective: "Educate the buying group"
    }
  });
}

function canonicalExperienceCase(input: {
  id: "abm" | "campaign" | "content";
  useCase: UseCase;
  answers: SessionAnswers;
  draft: ExperienceDraft;
  target?: BrandProfile | null;
}) {
  return {
    id: input.id,
    headline: input.draft.headline,
    html: generatedExperienceHtml({
      seller: sellerBrand,
      target: input.target ?? null,
      draft: input.draft,
      useCase: input.useCase,
      answers: input.answers
    })
  };
}

const campaignExperienceDraft: ExperienceDraft = {
  ...experienceDraft,
  campaignRegister: "campaign-product",
  sectionLabels: {
    thesis: "The campaign idea",
    lenses: "Choose the launch lens",
    journey: "Questions for the next campaign move",
    close: "Turn the launch into a buyer path"
  },
  title: "Jitterbit | Governed AI automation campaign",
  eyebrow: "For enterprise architects",
  headline: "Put dependable context behind enterprise AI decisions.",
  subhead:
    "Give enterprise architects a focused way to evaluate how governed automation connects applications, data, and workflows for AI-ready operations.",
  thesisHeadline: "A launch becomes useful when it helps buyers make a decision.",
  thesisBody:
    "Lead with the operating question, organize the supporting proof, and give the buying group a clear path into the conversation.",
  primaryCta: "Explore the launch story",
  audienceLabel: "Enterprise architects",
  narrativeArc: "Frame the launch, compare the implications, then choose the first practical evaluation path.",
  sections: [
    {
      eyebrow: "Launch context",
      headline: "Connect the announcement to an operating priority.",
      body: "Help buyers see where governed automation fits before asking them to evaluate individual capabilities.",
      proof: "Which operating priority makes this launch matter now?"
    },
    {
      eyebrow: "Decision proof",
      headline: "Organize the evidence around the buying question.",
      body: "Sequence the platform story, governance considerations, and proof so the campaign advances a real decision.",
      proof: "What evidence would help the buying group move forward?"
    },
    {
      eyebrow: "First action",
      headline: "Offer one useful way into the launch story.",
      body: "Let each buyer start with the question closest to their role while keeping the larger narrative intact.",
      proof: "Which question should open the next campaign conversation?"
    }
  ],
  signalLabels: ["Launch context", "Decision proof", "First action"],
  closingHeadline: "Choose the launch question worth exploring together.",
  closingBody: "Bring the campaign into one focused conversation around the outcome, evidence, and next step that matter most."
};

const contentExperienceDraft: ExperienceDraft = {
  ...experienceDraft,
  campaignRegister: "content-magic",
  sectionLabels: {
    thesis: "The central idea",
    lenses: "Choose how to explore it",
    journey: "Questions the content should answer",
    close: "Carry the idea into the next conversation"
  },
  title: "Jitterbit | Governed automation field guide",
  eyebrow: "For application leaders",
  headline: "Turn the governed automation field guide into a decision experience.",
  subhead:
    "Preserve the source argument while giving application leaders a faster path through the implications, proof, and questions that matter to them.",
  thesisHeadline: "The best content should help a buyer think, not just finish a download.",
  thesisBody:
    "Reshape the source into a guided experience that keeps its facts intact and makes the most useful decision paths easier to explore.",
  primaryCta: "Explore the field guide",
  audienceLabel: "Application leaders",
  narrativeArc: "Surface the core idea, open role-relevant paths, then carry the strongest question forward.",
  sections: [
    {
      eyebrow: "Core argument",
      headline: "Start with the decision the source is trying to change.",
      body: "Translate the field guide into a concise point of view without losing the supporting facts or context.",
      proof: "What belief should change after someone explores this content?"
    },
    {
      eyebrow: "Evidence path",
      headline: "Let buyers inspect the proof that matters to their role.",
      body: "Organize the strongest source material into distinct paths instead of making every reader follow one linear document.",
      proof: "Which proof should an application leader evaluate first?"
    },
    {
      eyebrow: "Conversation bridge",
      headline: "Turn reading into a useful next question.",
      body: "Close with a practical prompt that connects the content to the buyer's environment and priorities.",
      proof: "Which source insight is worth discussing with the wider team?"
    }
  ],
  signalLabels: ["Core argument", "Evidence path", "Conversation bridge"],
  closingHeadline: "Choose the field-guide question worth carrying forward.",
  closingBody: "Use the source as the start of a focused conversation about governed automation, not the end of a download journey."
};

export const canonicalDesktopExperiences = [
  canonicalExperienceCase({
    id: "abm",
    useCase: "abm",
    target: targetBrand,
    draft: experienceDraft,
    answers: {
      targetDomain: "cisco.com",
      audience: "Infrastructure platform leaders",
      objective: "Book a meeting"
    }
  }),
  canonicalExperienceCase({
    id: "campaign",
    useCase: "campaign",
    draft: campaignExperienceDraft,
    answers: {
      campaignType: "product",
      promotedOffer: "Governed AI automation",
      audience: "Enterprise architects",
      objective: "Launch or announce"
    }
  }),
  canonicalExperienceCase({
    id: "content",
    useCase: "content",
    draft: contentExperienceDraft,
    answers: {
      sourceName: "The governed automation field guide.pdf",
      sourceUrl: "https://example.com/governed-automation-guide",
      audience: "Application leaders",
      objective: "Educate buyers"
    }
  })
] as const;

export const deterministicSvg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">
    <rect width="640" height="360" fill="#EEF3F6"/>
    <path d="M90 270 L220 120 L320 210 L430 80 L550 270" fill="none" stroke="#1B3E51" stroke-width="20"/>
    <circle cx="430" cy="80" r="24" fill="#F44414"/>
  </svg>`;
