import type {
  BrandDesignDNA,
  BrandProfile,
  EntityIdentity,
  IntelligenceConfidence,
  SessionAnswers
} from "@/lib/types";
import { withBrandReadiness } from "@/lib/brand-readiness";
import {
  companyDomainStem,
  sharesRegistrableCompanyDomain
} from "@/lib/domain-identity";

/**
 * Provenance-backed visual compilation for a harvested brand. This is the
 * Workstream 3 seam between extraction and renderers: it never invents colors,
 * never promotes target recognition into seller system ownership, and lists
 * unresolved evidence instead of fabricating fallbacks.
 */
export type BrandImageryTreatment = "image-led" | "image-supported" | "type-led" | "diagram-led";
export type BrandSurfaceDensity = "airy" | "balanced" | "dense";
export type BrandNavigationMotif = "wordmark-led" | "minimal" | "utility";
export type BrandCtaMotif = "solid-pill" | "solid-rounded" | "solid-moderate" | "solid-square" | "outline";

export interface BrandFidelityCompilation {
  domain: string;
  canonicalDomain: string;
  companyName: string;
  confidence: IntelligenceConfidence;
  palette: {
    primary?: string;
    accent?: string;
    surface?: string;
    strategy?: NonNullable<NonNullable<BrandProfile["diagnostics"]>["palette"]>["strategy"];
    verified: boolean;
  };
  designDna?: BrandDesignDNA;
  typographyCharacter?: {
    display?: string;
    body?: string;
    fallback?: NonNullable<BrandDesignDNA["typography"]>["fallback"];
    headingWeight?: number;
  };
  geometry?: {
    buttonRadiusPx?: number;
    buttonHeightPx?: number;
    buttonBorderWidthPx?: number;
    cardRadiusPx?: number;
    surfaceDensity?: BrandSurfaceDensity;
  };
  imagery: {
    treatment: BrandImageryTreatment;
    sourceOwnedImageCount: number;
    logoVariants: { light?: boolean; dark?: boolean; portable?: boolean };
  };
  motifs: {
    hero?: NonNullable<BrandDesignDNA["theme"]>["hero"];
    motif?: NonNullable<BrandDesignDNA["theme"]>["motif"];
    navigation?: BrandNavigationMotif;
    cta?: BrandCtaMotif;
  };
  unresolvedEvidence: string[];
}

export interface BrandVisualAuthority {
  owner: "seller";
  seller: BrandFidelityCompilation;
  targetRecognition: {
    domain: string;
    canonicalDomain: string;
    companyName: string;
    markReady: boolean;
    /** Target color stays local; it never owns page surfaces, CTA, or navigation. */
    localAccentOnly: true;
    accentColor?: string;
    unresolvedEvidence: string[];
  } | null;
  unresolvedEvidence: string[];
}

export type BrandCategory =
  | "buyer-experience"
  | "integration-automation"
  | "network-security"
  | "cybersecurity"
  | "data-ai"
  | "commerce"
  | "finance-operations"
  | "people-operations"
  | "business-software";

export interface AudienceSuggestionContext {
  promotedOffer?: string;
  campaignType?: SessionAnswers["campaignType"];
  objective?: string;
}

export interface AudienceRecommendationRationaleInput {
  label: string;
  sellerName?: string;
  targetName?: string;
  offerLabel?: string;
  evidenceSignal?: string;
}

interface CategoryProfile {
  signals: RegExp;
  audiences: readonly [string, string, string, string];
  offerLabel: string;
  theme: string;
  heroHeadline: string;
  buyerOutcome: string;
  capabilitySentence: string;
  thesis: string;
  thesisBody: string;
  closingHeadline: string;
  closingBody: string;
  sectionHeadlines: readonly [string, string, string];
  sectionBodies: readonly [string, string, string];
  decisionQuestions: readonly [string, string, string];
  signalLabels: readonly [string, string, string];
}

interface TargetAudienceLens {
  id: string;
  signals: RegExp;
  technicalOwner: string;
  businessOwner: string;
  goToMarketOwner: string;
  operationsOwner: string;
  dataOwner: string;
  decisionContext: string;
  systemsContext: string;
  workflowContext: string;
  dataContext: string;
}

const unsafeIntelligenceText =
  /\b(ignore|disregard|override|instructions?|system prompt|developer message|assistant|password|secret|api key|jailbreak)\b/i;

function canonicalDomain(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split(/[/?#]/)[0] ?? "";
}

function identityKey(value: string): string {
  return value.toLocaleLowerCase().replace(/[^a-z0-9]/g, "");
}

const companyNameInitialismStopWords = new Set([
  "and",
  "company",
  "corporation",
  "inc",
  "incorporated",
  "limited",
  "llc",
  "ltd",
  "of",
  "plc",
  "the"
]);

function companyNameInitialism(value: string): string {
  return value
    .toLocaleLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word && !companyNameInitialismStopWords.has(word))
    .map((word) => word[0])
    .join("");
}

function domainIdentityKey(domain: string): string {
  return identityKey(companyDomainStem(canonicalDomain(domain)));
}

function withoutDomainPrefix(value: string): string {
  let result = value;
  for (const prefix of ["hello", "get", "use", "try", "join", "with", "meet", "my", "the"]) {
    if (result.startsWith(prefix) && result.length - prefix.length >= 4) {
      result = result.slice(prefix.length);
      break;
    }
  }
  return result;
}

function sourceHostMatches(
  sourceUrl: string,
  expectedDomain: string,
  aliases: Array<string | undefined> = []
): boolean {
  try {
    const host = canonicalDomain(new URL(sourceUrl).hostname);
    const allowed = new Set(
      [expectedDomain, ...aliases].map((value) => canonicalDomain(value ?? "")).filter(Boolean)
    );
    return [...allowed].some((domain) => host === domain || host.endsWith(`.${domain}`));
  } catch {
    return false;
  }
}

function descriptiveLogoOwner(logoUrl: string | undefined): string | null {
  if (!logoUrl) return null;
  try {
    const pathname = decodeURIComponent(new URL(logoUrl).pathname).toLocaleLowerCase();
    const file = pathname.split("/").at(-1)?.replace(/\.[a-z0-9]+$/i, "") ?? "";
    const match = file.match(/(?:^|[-_])([a-z0-9]{4,})(?:[-_])?logo(?:[-_]|$)|(?:^|[-_])logo(?:[-_])?([a-z0-9]{4,})(?:[-_]|$)/i);
    const owner = identityKey(match?.[1] || match?.[2] || "");
    return owner && !new Set([
      "brand",
      "company",
      "header",
      "primary",
      "footer",
      "white",
      "black",
      "color",
      "desktop",
      "mobile",
      "open",
      "graph",
      "social",
      "share",
      "default",
      "global",
      "site",
      "navigation",
      "light",
      "dark"
    ]).has(owner)
      ? owner
      : null;
  } catch {
    return null;
  }
}

function logoAssetMatchesBrandDomain(
  logoUrl: string | undefined,
  expectedDomain: string,
  aliases: Array<string | undefined> = []
): boolean {
  if (!logoUrl) return false;
  try {
    const assetDomain = canonicalDomain(new URL(logoUrl).hostname);
    return [expectedDomain, ...aliases]
      .map((value) => canonicalDomain(value ?? ""))
      .filter(Boolean)
      .some((domain) => sharesRegistrableCompanyDomain(assetDomain, domain));
  } catch {
    return false;
  }
}

function hasAuthoritativeBrandfetchMatch(
  profile: BrandProfile,
  expectedDomain: string
): boolean {
  const canonicalAlias = canonicalDomain(profile.canonicalDomain ?? "");
  return profile.diagnostics?.providers?.brandfetchBrandApi === "succeeded" && Boolean(
    canonicalAlias && sharesRegistrableCompanyDomain(canonicalAlias, expectedDomain)
  );
}

/**
 * Assess harvested identity independently from copy/category inference. A
 * profile can be useful for neutral styling while still requiring a person to
 * confirm that the company or logo is correct.
 */
export function assessBrandIdentity(
  profile: BrandProfile,
  expectedDomain: string,
  userConfirmed = false
): EntityIdentity {
  const expected = canonicalDomain(expectedDomain);
  const actual = canonicalDomain(profile.domain);
  const canonicalAlias = canonicalDomain(profile.canonicalDomain ?? "");
  const aliasNeedsConfirmation = Boolean(
    canonicalAlias &&
      canonicalAlias !== expected &&
      !sharesRegistrableCompanyDomain(canonicalAlias, expected) &&
      profile.diagnostics?.brandfetch?.claimed !== true
  );
  const domainKey = domainIdentityKey(expected);
  const nameKey = identityKey(profile.companyName);
  const relaxedDomainKey = withoutDomainPrefix(domainKey);
  const nameInitialism = companyNameInitialism(profile.companyName);
  const nameMatches = Boolean(
    nameKey &&
      (nameKey === domainKey ||
        nameKey === relaxedDomainKey ||
        (domainKey.length >= 2 && domainKey.length <= 6 && nameInitialism === domainKey) ||
        (relaxedDomainKey.length >= 2 &&
          relaxedDomainKey.length <= 6 &&
          nameInitialism === relaxedDomainKey) ||
        (Math.min(nameKey.length, domainKey.length) >= 4 &&
          (nameKey.includes(domainKey) || domainKey.includes(nameKey))) ||
        (Math.min(nameKey.length, relaxedDomainKey.length) >= 4 &&
          (nameKey.includes(relaxedDomainKey) || relaxedDomainKey.includes(nameKey))))
  );
  const domainMatches = actual === expected;
  const sourceMatches = sourceHostMatches(profile.sourceUrl, expected, [
    profile.canonicalDomain,
    ...(profile.domainAliases ?? [])
  ]);
  const brandfetchMatches = hasAuthoritativeBrandfetchMatch(profile, expected);
  const firstPartyLogo = logoAssetMatchesBrandDomain(profile.logoUrl, expected, [
    profile.canonicalDomain,
    ...(profile.domainAliases ?? [])
  ]);
  const logoOwner = descriptiveLogoOwner(profile.logoUrl);
  const logoMatches = brandfetchMatches || firstPartyLogo || !logoOwner ||
    [domainKey, relaxedDomainKey, nameKey].some(
      (key) => key.length >= 3 && (logoOwner.includes(key) || key.includes(logoOwner))
    );
  const effectiveNameMatches = nameMatches || brandfetchMatches;
  const reasons: string[] = [];
  if (domainMatches) reasons.push("The harvested profile matches the submitted domain.");
  else reasons.push(`The harvested profile belongs to ${actual || "an unknown domain"}, not ${expected}.`);
  if (sourceMatches) reasons.push("The public evidence came from the submitted company domain.");
  else reasons.push("The public evidence URL does not match the submitted company domain.");
  if (brandfetchMatches) reasons.push("Brandfetch returned a matching canonical-domain brand record.");
  if (effectiveNameMatches) reasons.push("The public company name matches the submitted domain.");
  else reasons.push("The public company name could not be reconciled with the submitted domain.");
  if (firstPartyLogo) reasons.push("The selected logo is hosted on the submitted brand's domain.");
  if (!logoMatches) reasons.push("The harvested logo filename appears to name a different company.");
  if (aliasNeedsConfirmation) {
    reasons.push(`Brandfetch resolved this to ${canonicalAlias}, but that alias is unclaimed and needs confirmation.`);
  }
  if (profile.source === "fallback") reasons.push("Only deterministic fallback identity is available.");

  let confidence: IntelligenceConfidence = "low";
  if (
    domainMatches &&
    (sourceMatches || brandfetchMatches) &&
    effectiveNameMatches &&
    logoMatches &&
    profile.source !== "fallback" &&
    !aliasNeedsConfirmation
  ) {
    confidence = "high";
  } else if (domainMatches && effectiveNameMatches && logoMatches && profile.source !== "fallback") {
    confidence = "medium";
  }
  const rejected = !domainMatches ||
    (!effectiveNameMatches && profile.source !== "fallback") ||
    !logoMatches;
  return {
    expectedDomain: expected,
    canonicalDomain: rejected ? expected : actual,
    canonicalName: profile.companyName,
    confidence: userConfirmed ? "high" : confidence,
    confirmationStatus: userConfirmed
      ? "confirmed"
      : rejected
        ? "rejected"
        : aliasNeedsConfirmation || confidence === "low"
          ? "needs-confirmation"
          : "confirmed",
    confirmedBy: userConfirmed ? "user" : confidence === "high" ? "system" : undefined,
    reasons,
    provenance: [
      {
        kind:
          profile.source === "fallback"
            ? "deterministic-fallback"
            : profile.source === "brand-harvester"
              ? "brand-harvester"
              : "public-page",
        sourceUrl: profile.sourceUrl,
        detail: `Identity harvested for ${expected}.`
      }
    ]
  };
}

export function withBrandIdentity(
  profile: BrandProfile,
  expectedDomain = profile.domain,
  userConfirmed = false
): BrandProfile {
  return withBrandReadiness({
    ...profile,
    identity: assessBrandIdentity(profile, expectedDomain, userConfirmed)
  });
}

const profiles: Record<BrandCategory, CategoryProfile> = {
  "buyer-experience": {
    signals: /\b(folloze|account[- ]based|\babm\b|buyer experience|demand generation|revenue marketing|campaign activation|microsite)\b/i,
    audiences: [
      "Account-based marketing leaders",
      "Demand generation and campaign teams",
      "Revenue marketing operations",
      "Digital buyer experience teams"
    ],
    offerLabel: "Buyer experience",
    theme: "account-based buyer experiences",
    heroHeadline: "Turn account interest into a journey sales can act on.",
    buyerOutcome: "shape relevant account experiences and see what each buying group explores",
    capabilitySentence: "Build governed destinations, adapt content around buyer interest, and pass useful engagement context to sales.",
    thesis: "Campaign execution should adapt as buyer interest becomes visible.",
    thesisBody: "Keep message, content, and engagement signals connected so each account can move through a coherent story.",
    closingHeadline: "Give the next account conversation real context.",
    closingBody: "Start with the account, the use case, and the content most likely to earn the next meaningful action.",
    sectionHeadlines: [
      "Build the account experience around one decision.",
      "Adapt the content path as buyer interest becomes visible.",
      "Give sales the context behind every meaningful click."
    ],
    sectionBodies: [
      "Bring the right message and content into a focused destination for each priority account or buying group.",
      "Organize the journey around the products, use cases, and proof the audience needs to evaluate next.",
      "Capture which topics and actions earn attention so follow-up can begin with useful context."
    ],
    decisionQuestions: [
      "Which account decision should this experience help buyers make?",
      "Which content earns the next layer of buyer attention?",
      "Which engagement signals should shape the sales follow-up?"
    ],
    signalLabels: ["Account story", "Buyer journey", "Engagement signal"]
  },
  "integration-automation": {
    signals: /\b(jitterbit|ipaas|integration|orchestration|workflow automation|app development|api management|\bedi\b|enterprise applications|mcp)\b/i,
    audiences: [
      "Integration and automation leaders",
      "Enterprise architects and platform owners",
      "Application and data operations teams",
      "IT leaders modernizing business workflows"
    ],
    offerLabel: "Integration and automation",
    theme: "integration, automation, and application development",
    heroHeadline: "Connect systems. Automate workflows. Keep AI accountable.",
    buyerOutcome: "connect applications, data, APIs, and workflows without creating another operational silo",
    capabilitySentence: "Bring integration, orchestration, application development, and governed AI into one operating model.",
    thesis: "Automation can move fast without making control an afterthought.",
    thesisBody: "Give technical and business teams a shared way to connect systems, govern interactions, and prove the first workflow.",
    closingHeadline: "Start with one workflow worth simplifying.",
    closingBody: "Map the systems, controls, and desired outcome, then choose the first path that can prove value.",
    sectionHeadlines: [
      "Connect the systems already carrying the business.",
      "Put governance around automation and AI interactions.",
      "Move from architecture questions to a practical first path."
    ],
    sectionBodies: [
      "Start with the applications, data, and workflows your teams are responsible for connecting.",
      "Orchestration, APIs, and application development can work as one accountable platform layer.",
      "Technical and business stakeholders get a clear route into the use case they need to validate first."
    ],
    decisionQuestions: [
      "Which systems and data flows define the first integration boundary?",
      "Where do automation speed and operating control need to meet?",
      "Which use case can prove the architecture without widening the scope?"
    ],
    signalLabels: ["Architecture", "Automation", "First use case"]
  },
  "network-security": {
    signals: /\b(cisco|networking|network infrastructure|data center|cloud control|digital resilience|observability|collaboration|workplace)\b/i,
    audiences: [
      "Network and infrastructure leaders",
      "Security and resilience teams",
      "Data center and cloud architects",
      "IT operations and platform teams"
    ],
    offerLabel: "Connected infrastructure",
    theme: "networking, security, and resilient infrastructure",
    heroHeadline: "Connect infrastructure, security, and operations for the AI era.",
    buyerOutcome: "design resilient infrastructure without separating network, security, and operating decisions",
    capabilitySentence: "Bring data center, cloud, workplace, and operational context into one connected architecture conversation.",
    thesis: "AI-ready infrastructure depends on shared control across every layer.",
    thesisBody: "Align networking, security, and operations around the environment the team must protect, run, and scale.",
    closingHeadline: "Make the first architecture decision concrete.",
    closingBody: "Choose the environment, control point, and technical outcome that the team should validate first.",
    sectionHeadlines: [
      "Start with the infrastructure outcome, not the full portfolio.",
      "Connect networking, security, and operations around the same decision.",
      "Give every stakeholder a clear next technical question."
    ],
    sectionBodies: [
      "Start with the environment the team is protecting, operating, or preparing for AI-era demand.",
      "Networking, security, and operations can each evaluate the layer they own without losing shared context.",
      "Architecture review moves forward when the first technical question and validation boundary are explicit."
    ],
    decisionQuestions: [
      "Which infrastructure outcome should anchor the architecture review?",
      "How should networking, security, and operations share control?",
      "What must the first technical validation prove?"
    ],
    signalLabels: ["Infrastructure", "Security", "Operations"]
  },
  cybersecurity: {
    signals: /\b(cybersecurity|threat|zero trust|soc|security operations|identity security|data protection|ransomware|breach)\b/i,
    audiences: [
      "Security and risk leaders",
      "Security operations teams",
      "Identity and data protection owners",
      "IT infrastructure and compliance teams"
    ],
    offerLabel: "Security and resilience",
    theme: "security, risk, and operational resilience",
    heroHeadline: "Make risk, control, and response part of one operating picture.",
    buyerOutcome: "reduce exposure without separating security strategy from day-to-day operations",
    capabilitySentence: "Connect the threat, the control, and the operating response across systems, identities, and data.",
    thesis: "Security decisions are strongest when risk and operating control stay connected.",
    thesisBody: "Give technical and business stakeholders one view of the exposure, the protection model, and the evidence required to act.",
    closingHeadline: "Start with the risk that needs a clearer answer.",
    closingBody: "Define the exposure, the control boundary, and the evidence that would make the next security decision defensible.",
    sectionHeadlines: [
      "Make the risk recognizable before explaining the platform.",
      "Connect controls to the environment the team must protect.",
      "Give security and business stakeholders one evaluation path."
    ],
    sectionBodies: [
      "Start with the attack surface, exposure, or operating pressure the team is accountable for reducing.",
      "Organize capabilities around the systems, identities, and data that require protection and governance.",
      "Sequence technical depth and business context so the next validation step is clear to every role."
    ],
    decisionQuestions: [
      "Which risk should the evaluation make concrete first?",
      "Which systems, identities, and data require the clearest control model?",
      "What evidence will align security and business stakeholders?"
    ],
    signalLabels: ["Risk", "Control", "Validation"]
  },
  "data-ai": {
    signals: /\b(data platform|analytics|artificial intelligence|\bai\b|machine learning|data cloud|data warehouse|database|business intelligence)\b/i,
    audiences: [
      "Data and AI platform leaders",
      "Analytics and business intelligence teams",
      "Data engineering and architecture teams",
      "IT leaders governing enterprise AI"
    ],
    offerLabel: "Data and AI",
    theme: "trusted data and enterprise AI",
    heroHeadline: "Put trusted data behind every AI decision.",
    buyerOutcome: "move from data foundations to governed AI and measurable business action",
    capabilitySentence: "Connect architecture, governance, analytics, and activation so every model and decision has dependable context.",
    thesis: "Enterprise AI is only as useful as the data and governance behind it.",
    thesisBody: "Keep source, model, control, and business action connected from the first architecture choice through activation.",
    closingHeadline: "Choose one decision that better data should improve.",
    closingBody: "Define the data, governance, and operating outcome needed to prove the first use case.",
    sectionHeadlines: [
      "Start with the decision the data must improve.",
      "Connect platform capability to governance and operating trust.",
      "Give technical and business teams a shared evaluation path."
    ],
    sectionBodies: [
      "Connect the data, model, and analytical outcome the team is accountable for delivering.",
      "Sequence architecture, governance, and activation so the platform story remains connected from source to action.",
      "Let every stakeholder explore the layer they own while keeping the decision in one coherent narrative."
    ],
    decisionQuestions: [
      "Which decision should better data improve first?",
      "What governance must hold from source through model and action?",
      "How will technical and business teams validate value together?"
    ],
    signalLabels: ["Data foundation", "AI governance", "Activation"]
  },
  commerce: {
    signals: /\b(ecommerce|e-commerce|commerce|retail|merchandising|checkout|customer experience|marketplace|order management)\b/i,
    audiences: [
      "Digital commerce leaders",
      "Customer experience and journey teams",
      "Commerce operations and merchandising",
      "Technology leaders responsible for growth systems"
    ],
    offerLabel: "Digital commerce",
    theme: "digital commerce and customer experience",
    heroHeadline: "Connect the customer moment to the systems that deliver it.",
    buyerOutcome: "improve digital commerce without separating experience ambition from operating reality",
    capabilitySentence: "Bring customer journey, data, merchandising, and commerce operations into one actionable view.",
    thesis: "Every commerce experience is shaped by the operating system behind it.",
    thesisBody: "Connect the customer moment to the data, workflow, and technology choices required to deliver it consistently.",
    closingHeadline: "Start with the customer moment that matters most.",
    closingBody: "Choose the experience, system dependency, and commercial outcome the team should validate first.",
    sectionHeadlines: [
      "Begin with the customer moment that needs to improve.",
      "Connect experience ambition to the systems behind it.",
      "Make the first commercial path easy to evaluate."
    ],
    sectionBodies: [
      "Focus on the discovery, purchase, service, or loyalty moment the team is working to improve.",
      "Show how data, operations, and experience decisions work together instead of presenting disconnected features.",
      "Give commerce and technology stakeholders a shared view of the outcome and the next validation step."
    ],
    decisionQuestions: [
      "Which customer moment should the experience improve first?",
      "Which systems and operating choices shape that moment?",
      "What would make the commercial path credible to both teams?"
    ],
    signalLabels: ["Customer moment", "Commerce stack", "Growth path"]
  },
  "finance-operations": {
    signals: /\b(finance|financial operations|accounts payable|accounts receivable|procurement|spend management|billing|payments|treasury|accounting|bookkeeping|tax|audit|assurance|advisory|controller|cfo)\b/i,
    audiences: [
      "Finance transformation leaders",
      "Accounting and financial operations teams",
      "Procurement and spend management leaders",
      "Business systems owners supporting finance"
    ],
    offerLabel: "Finance operations",
    theme: "finance operations and business control",
    heroHeadline: "Simplify finance operations without losing control.",
    buyerOutcome: "improve financial workflows while preserving accountability, governance, and system fit",
    capabilitySentence: "Connect process automation, operating control, and the business case behind each finance transformation decision.",
    thesis: "Faster finance processes still need visible control and accountability.",
    thesisBody: "Keep workflow change, governance, and measurable business impact connected from evaluation through implementation.",
    closingHeadline: "Start with the process creating the clearest drag.",
    closingBody: "Define the workflow, control requirement, and business result that would make the first change worth pursuing.",
    sectionHeadlines: [
      "Start with the process creating cost or delay.",
      "Keep automation connected to control and accountability.",
      "Give finance and systems teams one path to validation."
    ],
    sectionBodies: [
      "Start with the financial workflow and operating outcome the team is responsible for improving.",
      "Connect efficiency, governance, and system change without forcing buyers to assemble the story themselves.",
      "Sequence the business case and implementation questions so the next step is practical and defensible."
    ],
    decisionQuestions: [
      "Which financial workflow creates the clearest case for change?",
      "Where must automation preserve control and accountability?",
      "What would make the first implementation step defensible?"
    ],
    signalLabels: ["Process", "Control", "Business case"]
  },
  "people-operations": {
    signals: /\b(human resources|\bhr\b|people operations|talent|workforce|employee experience|payroll|benefits)\b/i,
    audiences: [
      "People operations leaders",
      "HR technology and systems teams",
      "Talent and employee experience leaders",
      "Business operations teams supporting the workforce"
    ],
    offerLabel: "People operations",
    theme: "people operations and employee experience",
    heroHeadline: "Make every workforce process work better for people.",
    buyerOutcome: "improve employee and manager moments without disconnecting experience, process, and systems",
    capabilitySentence: "Bring workforce outcomes, service delivery, and HR technology decisions into one practical operating view.",
    thesis: "Employee experience and operating process have to improve together.",
    thesisBody: "Connect the workforce moment to the service, workflow, and system choices that determine whether change will hold.",
    closingHeadline: "Start with one workforce moment worth improving.",
    closingBody: "Define the people outcome, process dependency, and system change the team should validate first.",
    sectionHeadlines: [
      "Begin with the employee or manager moment that needs to improve.",
      "Connect the experience to the process and system behind it.",
      "Give people and technology teams one route to a decision."
    ],
    sectionBodies: [
      "Start with the workforce outcome the team is accountable for improving.",
      "Show how process, service, and technology decisions work together across the employee journey.",
      "Sequence value and validation so HR and systems stakeholders can move forward with shared context."
    ],
    decisionQuestions: [
      "Which employee or manager moment should improve first?",
      "Which process and system choices shape that experience?",
      "What will help people and technology teams decide together?"
    ],
    signalLabels: ["Employee moment", "People process", "Systems fit"]
  },
  "business-software": {
    signals: /[\s\S]*/,
    audiences: [
      "Business transformation leaders",
      "Enterprise application owners",
      "Operations teams evaluating the solution",
      "IT and procurement stakeholders"
    ],
    offerLabel: "Business platform",
    theme: "the platform and the business outcome it supports",
    heroHeadline: "Connect the business outcome to the system that delivers it.",
    buyerOutcome: "evaluate business value, operating fit, and technical requirements in one view",
    capabilitySentence: "Bring the relevant capability, workflow, and validation questions into a focused business conversation.",
    thesis: "Platform value becomes credible when it is tied to the way the business operates.",
    thesisBody: "Connect the desired outcome to the workflow, stakeholders, and technical choices required to make it real.",
    closingHeadline: "Start with the outcome that needs a better system behind it.",
    closingBody: "Define the workflow, operating constraint, and proof point that should shape the first evaluation.",
    sectionHeadlines: [
      "Start with the operating outcome the audience owns.",
      "Connect capability to the way the team works.",
      "Make the first evaluation step clear and useful."
    ],
    sectionBodies: [
      "Start with a specific business or technical decision instead of asking buyers to navigate the full portfolio.",
      "Sequence the relevant capabilities, context, and proof so each stakeholder can understand the role the solution plays.",
      "Give the buying group one practical route to explore, validate, and continue the conversation."
    ],
    decisionQuestions: [
      "Which operating outcome should anchor the evaluation?",
      "How does the solution fit the way the team works today?",
      "What must the first validation step prove?"
    ],
    signalLabels: ["Business outcome", "Operating fit", "Next validation"]
  }
};

/**
 * Controlled target lenses turn public account evidence into plausible buying
 * responsibilities. Harvested headings are inputs to matching only; they are
 * never copied into audience labels.
 */
const targetAudienceLenses: readonly TargetAudienceLens[] = [
  {
    id: "network",
    signals: /\b(network(?:ing)?|network infrastructure|routing|switching|connectivity)\b/i,
    technicalOwner: "Network and infrastructure architects",
    businessOwner: "Infrastructure portfolio leaders",
    goToMarketOwner: "Infrastructure product marketing teams",
    operationsOwner: "Network operations leaders",
    dataOwner: "Network data and telemetry teams",
    decisionContext: "network modernization decisions",
    systemsContext: "network, cloud, and operations systems",
    workflowContext: "hybrid infrastructure workflows",
    dataContext: "network and telemetry data"
  },
  {
    id: "security",
    signals: /\b(cybersecurity|security|zero trust|threat|soc|data protection)\b/i,
    technicalOwner: "Security architecture and operations leaders",
    businessOwner: "Security and risk leaders",
    goToMarketOwner: "Security product and field marketing teams",
    operationsOwner: "Security operations teams",
    dataOwner: "Security data and detection teams",
    decisionContext: "security and resilience evaluations",
    systemsContext: "security, identity, and infrastructure systems",
    workflowContext: "security response workflows",
    dataContext: "security and threat data"
  },
  {
    id: "cloud-data-center",
    signals: /\b(data cent(?:er|re)|hybrid cloud|cloud operations|multicloud|edge infrastructure)\b/i,
    technicalOwner: "Cloud and data center architects",
    businessOwner: "Cloud platform leaders",
    goToMarketOwner: "Cloud and data center marketing teams",
    operationsOwner: "Cloud operations leaders",
    dataOwner: "Cloud platform data teams",
    decisionContext: "hybrid cloud and data center choices",
    systemsContext: "hybrid cloud and data center systems",
    workflowContext: "hybrid cloud operations",
    dataContext: "cloud operations data"
  },
  {
    id: "resilience",
    signals: /\b(digital resilience|resilien(?:ce|t)|observability|incident response|business continuity)\b/i,
    technicalOwner: "Reliability and observability architects",
    businessOwner: "Digital resilience leaders",
    goToMarketOwner: "Resilience solution marketing teams",
    operationsOwner: "Service reliability teams",
    dataOwner: "Observability and operations data teams",
    decisionContext: "digital resilience priorities",
    systemsContext: "critical service and operations systems",
    workflowContext: "incident and recovery workflows",
    dataContext: "service health and operations data"
  },
  {
    id: "integration",
    signals: /\b(ipaas|integration platform|systems? integration|enterprise applications?)\b/i,
    technicalOwner: "Integration architects and platform owners",
    businessOwner: "Integration platform leaders",
    goToMarketOwner: "Integration product marketing teams",
    operationsOwner: "Integration operations teams",
    dataOwner: "Integration data services teams",
    decisionContext: "integration platform evaluations",
    systemsContext: "enterprise applications and data services",
    workflowContext: "cross-application integration workflows",
    dataContext: "application and integration data"
  },
  {
    id: "automation",
    signals: /\b(workflow automation|business automation|process automation|orchestration)\b/i,
    technicalOwner: "Automation architects and platform owners",
    businessOwner: "Business automation leaders",
    goToMarketOwner: "Automation demand generation teams",
    operationsOwner: "Workflow automation teams",
    dataOwner: "Automation analytics teams",
    decisionContext: "workflow automation decisions",
    systemsContext: "automation platforms and business systems",
    workflowContext: "cross-functional automation workflows",
    dataContext: "workflow and process data"
  },
  {
    id: "api-edi",
    signals: /\b(api management|apis?\b|\bedi\b|b2b integration|partner ecosystem)\b/i,
    technicalOwner: "API and B2B integration architects",
    businessOwner: "API and ecosystem leaders",
    goToMarketOwner: "API, EDI, and ecosystem marketers",
    operationsOwner: "API platform operations teams",
    dataOwner: "API and partner data teams",
    decisionContext: "API and EDI modernization",
    systemsContext: "API, EDI, and partner systems",
    workflowContext: "partner and API workflows",
    dataContext: "API and partner exchange data"
  },
  {
    id: "application-development",
    signals: /\b(application development|app development|low[- ]code|developer platform|software development)\b/i,
    technicalOwner: "Application development architects",
    businessOwner: "Application platform leaders",
    goToMarketOwner: "Application development product marketers",
    operationsOwner: "Application delivery teams",
    dataOwner: "Application data platform teams",
    decisionContext: "application modernization decisions",
    systemsContext: "application development and delivery systems",
    workflowContext: "application delivery workflows",
    dataContext: "application and product usage data"
  },
  {
    id: "data-ai",
    signals: /\b(data platform|artificial intelligence|enterprise ai|generative ai|machine learning|data cloud)\b/i,
    technicalOwner: "Data and AI platform architects",
    businessOwner: "Data and AI leaders",
    goToMarketOwner: "Data and AI product marketing teams",
    operationsOwner: "AI platform operations teams",
    dataOwner: "Data engineering and AI teams",
    decisionContext: "enterprise AI and data platform decisions",
    systemsContext: "data, model, and business systems",
    workflowContext: "governed AI workflows",
    dataContext: "trusted enterprise data"
  },
  {
    id: "analytics",
    signals: /\b(analytics|business intelligence|data warehouse|insights?|reporting)\b/i,
    technicalOwner: "Analytics architects and platform owners",
    businessOwner: "Analytics and insights leaders",
    goToMarketOwner: "Analytics product marketing teams",
    operationsOwner: "Business intelligence teams",
    dataOwner: "Analytics engineering teams",
    decisionContext: "analytics and insight priorities",
    systemsContext: "analytics and business intelligence systems",
    workflowContext: "insight-to-action workflows",
    dataContext: "analytics and decision data"
  },
  {
    id: "buyer-experience",
    signals: /\b(account[- ]based|\babm\b|buyer experience|customer experience|digital experience|microsite)\b/i,
    technicalOwner: "Marketing technology architects",
    businessOwner: "Account-based marketing leaders",
    goToMarketOwner: "Buyer experience and campaign teams",
    operationsOwner: "Demand generation operations",
    dataOwner: "Buyer engagement analytics teams",
    decisionContext: "account engagement decisions",
    systemsContext: "buyer experience and campaign systems",
    workflowContext: "campaign activation workflows",
    dataContext: "account and buyer engagement data"
  },
  {
    id: "demand-revenue",
    signals: /\b(demand generation|revenue marketing|revenue operations|pipeline|go[- ]to[- ]market|campaign activation)\b/i,
    technicalOwner: "Revenue technology and operations leaders",
    businessOwner: "Demand generation and revenue leaders",
    goToMarketOwner: "Demand generation and campaign teams",
    operationsOwner: "Revenue marketing operations",
    dataOwner: "Revenue analytics teams",
    decisionContext: "pipeline and campaign decisions",
    systemsContext: "marketing, sales, and engagement systems",
    workflowContext: "campaign-to-revenue workflows",
    dataContext: "account, engagement, and pipeline data"
  },
  {
    id: "commerce",
    signals: /\b(ecommerce|e-commerce|commerce|retail|merchandising|checkout|marketplace)\b/i,
    technicalOwner: "Commerce platform architects",
    businessOwner: "Digital commerce leaders",
    goToMarketOwner: "Commerce growth and lifecycle teams",
    operationsOwner: "Commerce operations teams",
    dataOwner: "Commerce data and insights teams",
    decisionContext: "digital commerce growth decisions",
    systemsContext: "commerce, customer, and order systems",
    workflowContext: "purchase and fulfillment workflows",
    dataContext: "customer, product, and transaction data"
  },
  {
    id: "finance",
    signals: /\b(finance|accounts payable|accounts receivable|procurement|spend management|billing|payments|treasury)\b/i,
    technicalOwner: "Finance systems architects",
    businessOwner: "Finance transformation leaders",
    goToMarketOwner: "Finance solution marketing teams",
    operationsOwner: "Financial operations teams",
    dataOwner: "Finance data and analytics teams",
    decisionContext: "finance transformation decisions",
    systemsContext: "finance, procurement, and payment systems",
    workflowContext: "controlled finance workflows",
    dataContext: "finance and spend data"
  },
  {
    id: "people",
    signals: /\b(human resources|\bhr\b|people operations|talent|workforce|employee experience|payroll|benefits)\b/i,
    technicalOwner: "HR technology architects",
    businessOwner: "People operations leaders",
    goToMarketOwner: "Workforce solution marketing teams",
    operationsOwner: "HR service delivery teams",
    dataOwner: "People analytics teams",
    decisionContext: "workforce experience decisions",
    systemsContext: "HR, workforce, and service systems",
    workflowContext: "employee and manager workflows",
    dataContext: "workforce and service data"
  },
  {
    id: "business-operations",
    signals: /\b(business operations|operating model|transformation|enterprise platform|productivity|efficiency)\b/i,
    technicalOwner: "Enterprise platform and application owners",
    businessOwner: "Business transformation leaders",
    goToMarketOwner: "Solution and industry marketing teams",
    operationsOwner: "Business operations teams",
    dataOwner: "Operations analytics teams",
    decisionContext: "operating model decisions",
    systemsContext: "enterprise applications and operating systems",
    workflowContext: "cross-functional business workflows",
    dataContext: "operational and performance data"
  }
];

const targetLensDefaults: Record<BrandCategory, readonly string[]> = {
  "buyer-experience": ["buyer-experience", "demand-revenue", "analytics", "business-operations"],
  "integration-automation": ["integration", "automation", "api-edi", "application-development"],
  "network-security": ["network", "security", "cloud-data-center", "resilience"],
  cybersecurity: ["security", "resilience", "cloud-data-center", "data-ai"],
  "data-ai": ["data-ai", "analytics", "cloud-data-center", "business-operations"],
  commerce: ["commerce", "buyer-experience", "data-ai", "business-operations"],
  "finance-operations": ["finance", "automation", "data-ai", "business-operations"],
  "people-operations": ["people", "automation", "analytics", "business-operations"],
  "business-software": ["business-operations", "data-ai", "automation", "buyer-experience"]
};

type AudienceRecipe = (lens: TargetAudienceLens) => string;

const targetAwareAudienceRecipes: Record<
  BrandCategory,
  readonly [AudienceRecipe, AudienceRecipe, AudienceRecipe, AudienceRecipe]
> = {
  "buyer-experience": [
    (lens) => `${lens.goToMarketOwner} shaping ${lens.decisionContext}`,
    (lens) => `${lens.goToMarketOwner} guiding multi-role ${lens.decisionContext}`,
    (lens) => `${lens.businessOwner} packaging proof for ${lens.decisionContext}`,
    (lens) => `${lens.goToMarketOwner} activating journeys around ${lens.decisionContext}`
  ],
  "integration-automation": [
    (lens) => `${lens.technicalOwner} connecting ${lens.systemsContext}`,
    (lens) => `${lens.operationsOwner} automating ${lens.workflowContext}`,
    (lens) => `${lens.technicalOwner} governing flows across ${lens.systemsContext}`,
    (lens) => `${lens.businessOwner} orchestrating ${lens.workflowContext}`
  ],
  "network-security": [
    (lens) => `${lens.technicalOwner} securing ${lens.systemsContext}`,
    (lens) => `${lens.operationsOwner} aligning control across ${lens.workflowContext}`,
    (lens) => `${lens.technicalOwner} designing resilient ${lens.systemsContext}`,
    (lens) => `${lens.businessOwner} validating ${lens.decisionContext}`
  ],
  cybersecurity: [
    (lens) => `${lens.technicalOwner} protecting ${lens.systemsContext}`,
    (lens) => `${lens.operationsOwner} reducing exposure across ${lens.workflowContext}`,
    (lens) => `${lens.dataOwner} connecting evidence across ${lens.dataContext}`,
    (lens) => `${lens.businessOwner} governing risk in ${lens.decisionContext}`
  ],
  "data-ai": [
    (lens) => `${lens.dataOwner} unifying ${lens.dataContext}`,
    (lens) => `${lens.technicalOwner} governing data across ${lens.systemsContext}`,
    (lens) => `${lens.businessOwner} applying AI to ${lens.workflowContext}`,
    (lens) => `${lens.operationsOwner} operationalizing data for ${lens.decisionContext}`
  ],
  commerce: [
    (lens) => `${lens.businessOwner} improving digital journeys around ${lens.decisionContext}`,
    (lens) => `${lens.operationsOwner} connecting commerce to ${lens.workflowContext}`,
    (lens) => `${lens.dataOwner} personalizing journeys with ${lens.dataContext}`,
    (lens) => `${lens.technicalOwner} modernizing ${lens.systemsContext}`
  ],
  "finance-operations": [
    (lens) => `${lens.businessOwner} funding change around ${lens.decisionContext}`,
    (lens) => `${lens.operationsOwner} controlling spend across ${lens.workflowContext}`,
    (lens) => `${lens.dataOwner} measuring value with ${lens.dataContext}`,
    (lens) => `${lens.technicalOwner} governing ${lens.systemsContext}`
  ],
  "people-operations": [
    (lens) => `${lens.businessOwner} leading adoption around ${lens.decisionContext}`,
    (lens) => `${lens.operationsOwner} improving work across ${lens.workflowContext}`,
    (lens) => `${lens.dataOwner} measuring change with ${lens.dataContext}`,
    (lens) => `${lens.technicalOwner} supporting teams across ${lens.systemsContext}`
  ],
  "business-software": [
    (lens) => `${lens.businessOwner} accountable for ${lens.decisionContext}`,
    (lens) => `${lens.operationsOwner} improving ${lens.workflowContext}`,
    (lens) => `${lens.technicalOwner} evaluating ${lens.systemsContext}`,
    (lens) => `${lens.dataOwner} proving value with ${lens.dataContext}`
  ]
};

function evidenceText(brand: BrandProfile): string {
  return [
    brand.domain,
    brand.companyName,
    brand.title,
    brand.description,
    brand.publicContext,
    ...brand.publicTopics
  ]
    .filter(
      (value): value is string =>
        typeof value === "string" && value.length > 0 && !unsafeIntelligenceText.test(value)
    )
    .join(" ")
    .slice(0, 10_000);
}

function identifyBrandCategoryFromText(text: string): BrandCategory | undefined {
  return (Object.entries(profiles) as Array<[BrandCategory, CategoryProfile]>).find(
    ([category, profile]) => category !== "business-software" && profile.signals.test(text)
  )?.[0];
}

export function identifyBrandCategory(brand: BrandProfile): BrandCategory {
  return identifyBrandCategoryFromText(evidenceText(brand)) ?? "business-software";
}

function targetLensesFor(target: BrandProfile): TargetAudienceLens[] {
  const evidence = [
    ...target.publicTopics.map((text, index) => ({ text, weight: Math.max(3, 7 - index) })),
    { text: target.description ?? "", weight: 5 },
    { text: target.publicContext ?? "", weight: 3 },
    { text: target.title ?? "", weight: 2 },
    { text: `${target.companyName} ${target.domain}`, weight: 1 }
  ].filter(({ text }) => text.trim().length > 0 && !unsafeIntelligenceText.test(text));
  const ranked = targetAudienceLenses
    .map((lens, index) => ({
      lens,
      index,
      score: evidence.reduce(
        (total, item) => total + (lens.signals.test(item.text) ? item.weight : 0),
        0
      )
    }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map(({ lens }) => lens);

  const byId = new Map(targetAudienceLenses.map((lens) => [lens.id, lens]));
  const defaults = targetLensDefaults[identifyBrandCategory(target)]
    .map((id) => byId.get(id))
    .filter((lens): lens is TargetAudienceLens => Boolean(lens));
  return [...ranked, ...defaults]
    .filter((lens, index, values) => values.findIndex((candidate) => candidate.id === lens.id) === index)
    .slice(0, 4);
}

function boundedAudience(value: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= 120) return normalized;
  const boundary = normalized.slice(0, 120).lastIndexOf(" ");
  return normalized.slice(0, boundary > 72 ? boundary : 120).trim();
}

function safeAudienceContext(value: string | undefined, max = 72): string | undefined {
  if (!value || unsafeIntelligenceText.test(value)) return undefined;
  const normalized = value
    .replace(/[<>\[\]{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (normalized.length < 2) return undefined;
  if (normalized.length <= max) return normalized;
  return normalized.slice(0, max).replace(/\s+\S*$/, "").trim() || normalized.slice(0, max);
}

function possessiveCompanyName(value: string): string {
  return /s$/i.test(value.trim()) ? `${value.trim()}'` : `${value.trim()}'s`;
}

export function audienceOfferContextLabel(
  brand: BrandProfile,
  context: AudienceSuggestionContext = {}
): string | undefined {
  const promotedOffer = safeAudienceContext(context.promotedOffer);
  if (!promotedOffer) return undefined;
  const companyName = safeAudienceContext(brand.companyName, 48);
  if (!companyName || promotedOffer.toLocaleLowerCase().includes(companyName.toLocaleLowerCase())) {
    return promotedOffer;
  }
  return `${possessiveCompanyName(companyName)} ${promotedOffer}`;
}

function conciseAudienceSuggestions(suggestions: string[]): string[] {
  return suggestions
    .map(boundedAudience)
    .filter((suggestion, index, values) => values.indexOf(suggestion) === index);
}

/**
 * Produces the short buyer-facing explanation shown beside an audience
 * recommendation. Evidence text is intentionally summarized by the caller;
 * this helper keeps the rendered result to one complete sentence.
 */
export function audienceRecommendationRationale(input: AudienceRecommendationRationaleInput): string {
  const role = input.label.replace(/\s+/g, " ").trim() || "this group";
  const target = input.targetName?.replace(/\s+/g, " ").trim();
  const seller = input.sellerName?.replace(/\s+/g, " ").trim();
  const offer = input.offerLabel?.replace(/\s+/g, " ").trim();
  const signal = input.evidenceSignal?.replace(/\s+/g, " ").replace(/[.!?]+$/g, "").trim();
  const offering = offer || (seller ? `${possessiveCompanyName(seller)} offering` : "the offer");

  if (target && signal) {
    return `Recommended for ${target} because its ${signal} context makes ${role} relevant to evaluating ${offering}.`;
  }
  if (target) return `Recommended for ${target} because ${role} can help evaluate ${offering}.`;
  if (seller && signal) {
    return `Recommended because ${possessiveCompanyName(seller)} public ${signal} context makes ${role} relevant to evaluating ${offering}.`;
  }
  return `Recommended because ${role} can help evaluate ${offering}.`;
}

function isCloudCostOffer(context: AudienceSuggestionContext): boolean {
  return /\b(?:cloud\s*)?(?:cost|spend|finops|fin-ops|cloud economics)\b/i.test(
    context.promotedOffer ?? ""
  );
}

function isAccountingAdvisoryOffer(context: AudienceSuggestionContext): boolean {
  const offer = context.promotedOffer ?? "";
  return (
    /\b(?:accounting|bookkeeping|tax|audit|assurance|cfo advisory|financial advisory|client accounting|business advisory)\b/i.test(offer) &&
    !/\b(?:payroll|human resources|hr|workforce|people operations|benefits)\b/i.test(offer)
  );
}

function accountingAdvisoryAudienceSuggestions(): string[] {
  return [
    "CFOs and finance executives",
    "Controllers and accounting leaders",
    "Business owners and executive teams",
    "Risk and compliance leaders"
  ].map(boundedAudience);
}

function cloudCostAudienceSuggestions(target?: BrandProfile): string[] {
  const targetContext = target ? ` in ${target.companyName}'s cloud environment` : "";
  return [
    `Cloud cost and FinOps leaders managing cloud spend${targetContext}`,
    `Finance and technology leaders accountable for cloud cost governance${targetContext}`,
    `Platform operations owners optimizing cloud usage and cost${targetContext}`,
    `Engineering leaders aligning cloud reliability with cost discipline${targetContext}`
  ].map(boundedAudience);
}

/**
 * Before a target is known, category roles are a useful seller-side fallback.
 * Once public target context is harvested, each option is recomposed from the
 * seller's offer category and a public target operating theme.
 */
export function audienceSuggestionsFor(
  brand: BrandProfile,
  target?: BrandProfile,
  context: AudienceSuggestionContext = {}
): string[] {
  const promotedOffer = context.promotedOffer ?? "";
  const offerCategory = promotedOffer && !unsafeIntelligenceText.test(promotedOffer)
    ? /\b(?:payroll|human resources|hr|workforce|people operations|benefits)\b/i.test(promotedOffer)
      ? "people-operations" as const
      : identifyBrandCategoryFromText(promotedOffer)
    : undefined;
  const sellerCategory = offerCategory ?? identifyBrandCategory(brand);
  if (isCloudCostOffer(context)) {
    return conciseAudienceSuggestions(cloudCostAudienceSuggestions(target));
  }
  if (!target && isAccountingAdvisoryOffer(context)) {
    return conciseAudienceSuggestions(accountingAdvisoryAudienceSuggestions());
  }
  if (!target) {
    return conciseAudienceSuggestions([...profiles[sellerCategory].audiences]);
  }
  const targetCategory = identifyBrandCategory(target);
  const hasPublicTargetContext = Boolean(
    [target.description, target.publicContext, ...target.publicTopics].some(
      (value) => Boolean(value?.trim()) && !unsafeIntelligenceText.test(value ?? "")
    )
  );
  if (!hasPublicTargetContext && targetCategory === "business-software") {
    return conciseAudienceSuggestions([...profiles[sellerCategory].audiences]);
  }

  const lenses = targetLensesFor(target);
  const suggestions = targetAwareAudienceRecipes[sellerCategory].map((recipe, index) =>
    boundedAudience(recipe(lenses[index]))
  );
  return conciseAudienceSuggestions(
    suggestions.filter((suggestion, index) => suggestions.indexOf(suggestion) === index)
  );
}

export function narrativeProfileFor(brand: BrandProfile): Omit<CategoryProfile, "signals" | "audiences"> {
  const {
    offerLabel,
    theme,
    heroHeadline,
    buyerOutcome,
    capabilitySentence,
    thesis,
    thesisBody,
    closingHeadline,
    closingBody,
    sectionHeadlines,
    sectionBodies,
    decisionQuestions,
    signalLabels
  } =
    profiles[identifyBrandCategory(brand)];
  return {
    offerLabel,
    theme,
    heroHeadline,
    buyerOutcome,
    capabilitySentence,
    thesis,
    thesisBody,
    closingHeadline,
    closingBody,
    sectionHeadlines,
    sectionBodies,
    decisionQuestions,
    signalLabels
  };
}

function paletteVerified(profile: BrandProfile): boolean {
  const palette = profile.diagnostics?.palette;
  return Boolean(
    palette &&
      palette.strategy !== "fallback" &&
      palette.confidence !== "low" &&
      profile.colors.length >= 3
  );
}

function surfaceDensityFor(designDna?: BrandDesignDNA): BrandSurfaceDensity | undefined {
  if (!designDna) return undefined;
  const section = designDna.spacing?.sectionBlockPx;
  const gap = designDna.spacing?.gridGapPx;
  const shadow = designDna.cards?.shadow;
  if (section !== undefined && section <= 72 && gap !== undefined && gap <= 12) return "dense";
  if (section !== undefined && section >= 112 && (shadow === "none" || gap !== undefined && gap >= 28)) {
    return "airy";
  }
  if (section !== undefined || gap !== undefined || shadow) return "balanced";
  return undefined;
}

function ctaMotifFor(designDna?: BrandDesignDNA): BrandCtaMotif | undefined {
  const radius = designDna?.buttons?.radiusPx;
  if (radius === undefined) return undefined;
  if (radius >= 999 || radius >= 40) return "solid-pill";
  if (radius >= 12) return "solid-rounded";
  if (radius >= 4) return "solid-moderate";
  return "solid-square";
}

function navigationMotifFor(profile: BrandProfile): BrandNavigationMotif | undefined {
  const strategy = profile.diagnostics?.logo.strategy ?? "none";
  if (["none", "favicon", "inline-svg-unportable"].includes(strategy)) return "utility";
  if (profile.logoUrl || profile.portableLogo) return "wordmark-led";
  return "minimal";
}

function imageryTreatmentFor(profile: BrandProfile): BrandImageryTreatment {
  const count = profile.imageUrls.length;
  if (count >= 2) return "image-led";
  if (count === 1) return "image-supported";
  if (profile.designDna?.theme?.motif === "technical-grid") return "diagram-led";
  return "type-led";
}

function fidelityConfidence(profile: BrandProfile): IntelligenceConfidence {
  const identity = profile.identity?.confidence;
  const palette = profile.diagnostics?.palette?.confidence;
  const design = profile.designDna?.confidence;
  const scores = { high: 3, medium: 2, low: 1 } as const;
  const values = [identity, palette, design]
    .filter((value): value is IntelligenceConfidence => Boolean(value))
    .map((value) => scores[value]);
  if (!values.length) return "low";
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  if (average >= 2.6 && paletteVerified(profile)) return "high";
  if (average >= 1.8) return "medium";
  return "low";
}

/**
 * Compile verified brand evidence into a renderer-safe fidelity receipt.
 * Missing roles become unresolvedEvidence; they are never invented here.
 */
export function compileBrandFidelity(profile: BrandProfile): BrandFidelityCompilation {
  const designDna = profile.designDna;
  const verified = paletteVerified(profile);
  const unresolvedEvidence: string[] = [];
  if (!verified) unresolvedEvidence.push("semantic-palette");
  if (!profile.portableLogo && !profile.logoUrl && !profile.logoSourceUrl) {
    unresolvedEvidence.push("deliverable-logo");
  }
  if (!designDna || designDna.confidence === "low") unresolvedEvidence.push("design-geometry");
  if (designDna?.buttons?.radiusPx === undefined) unresolvedEvidence.push("button-radius");
  if (!profile.displayFontFamily && !designDna?.typography?.fallback) {
    unresolvedEvidence.push("typography-delivery");
  }
  if (profile.imageUrls.length === 0) unresolvedEvidence.push("source-owned-imagery");
  if (profile.identity && profile.identity.confirmationStatus !== "confirmed") {
    unresolvedEvidence.push("company-identity");
  }
  const treatment = imageryTreatmentFor(profile);
  if (treatment === "type-led" || treatment === "diagram-led") {
    unresolvedEvidence.push(`imagery-fallback:${treatment}`);
  }

  return {
    domain: profile.domain,
    canonicalDomain: profile.canonicalDomain ?? profile.domain,
    companyName: profile.companyName,
    confidence: fidelityConfidence(profile),
    palette: {
      ...(verified
        ? {
            primary: profile.primaryColor,
            accent: profile.accentColor,
            surface: profile.surfaceColor
          }
        : {}),
      strategy: profile.diagnostics?.palette?.strategy,
      verified
    },
    ...(designDna ? { designDna } : {}),
    typographyCharacter: {
      display: profile.displayFontFamily,
      body: profile.bodyFontFamily,
      fallback: designDna?.typography?.fallback,
      headingWeight: designDna?.typography?.headingWeight
    },
    geometry: {
      buttonRadiusPx: designDna?.buttons?.radiusPx,
      buttonHeightPx: designDna?.buttons?.heightPx,
      buttonBorderWidthPx: designDna?.buttons?.borderWidthPx,
      cardRadiusPx: designDna?.cards?.radiusPx,
      surfaceDensity: surfaceDensityFor(designDna)
    },
    imagery: {
      treatment,
      sourceOwnedImageCount: profile.imageUrls.length,
      logoVariants: {
        light: Boolean(profile.logoUrl || profile.portableLogo),
        dark: Boolean(profile.logoUrlOnDark),
        portable: Boolean(profile.portableLogo)
      }
    },
    motifs: {
      hero: designDna?.theme?.hero,
      motif: designDna?.theme?.motif,
      navigation: navigationMotifFor(profile),
      cta: ctaMotifFor(designDna)
    },
    unresolvedEvidence: [...new Set(unresolvedEvidence)]
  };
}

/**
 * Separate seller visual authority from target recognition. Target accents stay
 * contained; they never replace seller palette, CTA, navigation, or surfaces.
 */
export function compileBrandVisualAuthority(
  seller: BrandProfile,
  target?: BrandProfile | null
): BrandVisualAuthority {
  const sellerFidelity = compileBrandFidelity(seller);
  const unresolvedEvidence = [...sellerFidelity.unresolvedEvidence];
  if (!target) {
    return {
      owner: "seller",
      seller: sellerFidelity,
      targetRecognition: null,
      unresolvedEvidence
    };
  }

  const targetReady = Boolean(
    target.portableLogo ||
      target.logoUrl ||
      target.logoSourceUrl ||
      (target.diagnostics?.logo.strategy &&
        !["none", "favicon", "inline-svg-unportable"].includes(target.diagnostics.logo.strategy))
  );
  const targetUnresolved: string[] = [];
  if (!targetReady) targetUnresolved.push("target-mark");
  if (target.identity && target.identity.confirmationStatus !== "confirmed") {
    targetUnresolved.push("target-identity");
  }
  // Never treat target system colors as seller authority even when present.
  if (target.accentColor && target.accentColor === seller.accentColor) {
    // Shared coincidence is fine; still keep ownership explicit via localAccentOnly.
  }
  unresolvedEvidence.push(...targetUnresolved.map((item) => `target:${item}`));

  return {
    owner: "seller",
    seller: sellerFidelity,
    targetRecognition: {
      domain: target.domain,
      canonicalDomain: target.canonicalDomain ?? target.domain,
      companyName: target.companyName,
      markReady: targetReady,
      localAccentOnly: true,
      ...(paletteVerified(target) ? { accentColor: target.accentColor } : {}),
      unresolvedEvidence: targetUnresolved
    },
    unresolvedEvidence: [...new Set(unresolvedEvidence)]
  };
}
