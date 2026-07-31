import type { ExperienceDraft } from "../../src/lib/generation/experience-schema";
import { renderExperienceHtml } from "../../src/lib/generation/experience-template";
import type { BrandProfile } from "../../src/lib/types";

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
  wireframeName: "abm-account-microsite",
  experienceShape: "narrative-workflow",
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
  target?: BrandProfile;
  draft?: ExperienceDraft;
} = {}): string {
  return renderExperienceHtml({
    draft: input.draft ?? experienceDraft,
    brand: input.seller ?? sellerBrand,
    targetBrand: input.target ?? targetBrand,
    useCase: "abm",
    answers: {
      targetDomain: "cisco.com",
      audience: experienceDraft.audienceLabel,
      objective: "Educate the buying group"
    }
  });
}

export const deterministicSvg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">
    <rect width="640" height="360" fill="#EEF3F6"/>
    <path d="M90 270 L220 120 L320 210 L430 80 L550 270" fill="none" stroke="#1B3E51" stroke-width="20"/>
    <circle cx="430" cy="80" r="24" fill="#F44414"/>
  </svg>`;
