import {
  compileBrandFidelity,
  type BrandImageryTreatment
} from "@/lib/brand-intelligence";
import type { ExperienceDraft } from "@/lib/generation/experience-schema";
import {
  PERSONALIZATION_FIELD_KEYS,
  type AudienceRecommendation,
  type BrandProfile,
  type ExperiencePersonalizationPlan,
  type PersonalizationFieldKey,
  type PersonalizationFieldValue,
  type PersonalizationSafetyClassification,
  type PersonalizationVariantId,
  type PersonalizationVisibleVariant,
  type SessionAnswers,
  type SessionEvidenceItem,
  type UseCase
} from "@/lib/types";

export const PERSONALIZATION_VARIANT_ORDER = [
  "generic",
  "account",
  "account_industry",
  "account_industry_persona_a",
  "account_industry_persona_b"
] as const satisfies readonly PersonalizationVariantId[];

/** Editable-block ids the experience runtime may swap without regenerating. */
export const PERSONALIZATION_BLOCK_MAP: Record<
  Exclude<PersonalizationFieldKey, "imageryTreatment">,
  readonly string[]
> = {
  headline: ["hero.headline"],
  tension: ["hero.subhead", "thesis.body"],
  proofEmphasis: ["thesis.headline"],
  nextAction: ["hero.primaryCta", "close.primaryCta", "nextStep.ctaLabel"],
  audienceLabel: ["hero.audience"],
  eyebrow: ["hero.eyebrow"]
};

const VARIANT_LABELS: Record<PersonalizationVariantId, string> = {
  generic: "Generic",
  account: "Account",
  account_industry: "Account + industry",
  account_industry_persona_a: "Persona A",
  account_industry_persona_b: "Persona B"
};

function concise(value: string, max = 160): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= max) return normalized;
  return normalized.slice(0, max + 1).replace(/\s+\S*$/, "").replace(/[\s,;:.]+$/g, "");
}

function distinctiveTerm(text: string, banned: string[] = []): string | undefined {
  const bannedSet = new Set(banned.map((item) => item.toLocaleLowerCase()));
  const tokens = text
    .toLocaleLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length >= 5)
    .filter(
      (token) =>
        !bannedSet.has(token) &&
        !["about", "their", "there", "these", "those", "which", "where", "company", "platform", "public", "focus"].includes(
          token
        )
    );
  const original = text.split(/[^\p{L}\p{N}]+/u).find((token) => tokens.includes(token.toLocaleLowerCase()));
  return original;
}

function field(
  value: string | undefined,
  sourceRefs: string[],
  classification: PersonalizationSafetyClassification,
  reason: string
): PersonalizationFieldValue | undefined {
  const trimmed = value?.replace(/\s+/g, " ").trim();
  if (!trimmed) return undefined;
  if (!sourceRefs.length && classification !== "omitted") return undefined;
  return {
    value: trimmed,
    sourceRefs: [...new Set(sourceRefs)].slice(0, 8),
    classification,
    reason
  };
}

function usableTargetEvidence(
  evidenceItems: SessionEvidenceItem[] | undefined,
  target: BrandProfile | undefined
): SessionEvidenceItem[] {
  if (!target || !evidenceItems?.length) return [];
  const domain = target.domain.toLocaleLowerCase().replace(/^www\./, "");
  return evidenceItems.filter((item) => {
    if (item.disposition === "excluded") return false;
    if (item.entityRole && item.entityRole !== "target") return false;
    try {
      const host = new URL(item.sourceUrl).hostname.toLocaleLowerCase().replace(/^www\./, "");
      return host === domain || host.endsWith(`.${domain}`);
    } catch {
      return false;
    }
  });
}

function supportedPersonas(
  recommendations: AudienceRecommendation[] | undefined
): AudienceRecommendation[] {
  return (recommendations ?? []).filter(
    (item) =>
      item.evidenceItemIds.length > 0 &&
      (item.confidence === "high" || item.confidence === "medium") &&
      item.confirmationStatus !== "needs-confirmation"
  );
}

function industryTopic(target: BrandProfile | undefined): string | undefined {
  const topic = target?.publicTopics.find((value) => value.trim().length >= 4);
  return topic ? concise(topic, 64) : undefined;
}

function sellerCategory(seller: BrandProfile): string {
  return concise(
    seller.publicTopics[0] ||
      seller.description?.split(/[.!?]/)[0] ||
      `${seller.companyName} capabilities`,
    72
  );
}

function classificationFor(
  confidence: AudienceRecommendation["confidence"] | SessionEvidenceItem["confidence"] | BrandProfile["source"]
): PersonalizationSafetyClassification {
  if (confidence === "high" || confidence === "brand-harvester" || confidence === "fast-extractor") {
    return "approved";
  }
  if (confidence === "medium" || confidence === "hypothesis") return "safe_public";
  return "safe_public";
}

function buildVariant(input: {
  variantId: PersonalizationVariantId;
  audienceState: string;
  fields: Partial<Record<PersonalizationFieldKey, PersonalizationFieldValue>>;
  imageryTreatment?: BrandImageryTreatment;
  hasEvidence: boolean;
}): PersonalizationVisibleVariant {
  const omittedFields = PERSONALIZATION_FIELD_KEYS.filter((key) => {
    if (key === "imageryTreatment") return !input.imageryTreatment;
    return !input.fields[key];
  });
  return {
    variantId: input.variantId,
    label: VARIANT_LABELS[input.variantId],
    audienceState: input.audienceState,
    fields: input.fields,
    omittedFields,
    ...(input.imageryTreatment ? { imageryTreatment: input.imageryTreatment } : {}),
    hasEvidence: input.hasEvidence
  };
}

export interface CompilePersonalizationPlanInput {
  draft: ExperienceDraft;
  seller: BrandProfile;
  target?: BrandProfile;
  useCase: UseCase;
  answers: SessionAnswers;
  evidenceItems?: SessionEvidenceItem[];
  audienceRecommendations?: AudienceRecommendation[];
}

/**
 * Compile safe preview variants from one canonical experience. Variants change
 * argument, proof emphasis, imagery treatment, and next action when evidence
 * supports it. Unsupported fields are omitted rather than invented.
 */
export function compilePersonalizationPlan(
  input: CompilePersonalizationPlanInput
): ExperiencePersonalizationPlan {
  const { draft, seller, target, useCase, answers, evidenceItems, audienceRecommendations } = input;
  const sellerFidelity = compileBrandFidelity(seller);
  const sellerTreatment = sellerFidelity.imagery.treatment;
  const sellerRef = seller.sourceUrl || `seller:${seller.domain}`;
  const category = sellerCategory(seller);
  const audience =
    answers.customAudience ||
    answers.audience ||
    draft.audienceLabel ||
    "buyers evaluating the offer";
  const targetEvidence = usableTargetEvidence(evidenceItems, target);
  const primaryEvidence = targetEvidence[0];
  const secondaryEvidence = targetEvidence[1] ?? targetEvidence[0];
  const industry = industryTopic(target);
  const personas = supportedPersonas(audienceRecommendations);
  const offerName = answers.promotedOffer || draft.title.split(/\s+for\s+/i)[0] || seller.companyName;

  const genericFields: Partial<Record<PersonalizationFieldKey, PersonalizationFieldValue>> = {};
  const genericHeadline = field(
    concise(`Make ${category} decisions with a clearer operating path.`, 110),
    [sellerRef],
    classificationFor(seller.source),
    "Seller-category argument without account substitution."
  );
  const genericTension = field(
    concise(
      `Teams evaluating ${category} still stitch decisions across disconnected owners and tools.`,
      180
    ),
    [sellerRef],
    classificationFor(seller.source),
    "Category tension from public seller context."
  );
  const genericProof = field(
    concise(
      `Lead with ${seller.companyName}'s public mechanism for ${category}, not unnamed customer outcomes.`,
      180
    ),
    [sellerRef],
    classificationFor(seller.source),
    "Seller-mechanism proof emphasis."
  );
  const genericAction = field(
    concise(`Explore the ${category} path`, 72),
    [sellerRef],
    classificationFor(seller.source),
    "Generic next action for non-account preview."
  );
  const genericAudience = field(
    concise(audience, 90),
    [sellerRef],
    "safe_public",
    "Visitor-selected or recommended audience label."
  );
  const genericEyebrow = field(
    concise(`${seller.companyName} overview`, 72),
    [sellerRef],
    classificationFor(seller.source),
    "Generic seller eyebrow."
  );
  if (genericHeadline) genericFields.headline = genericHeadline;
  if (genericTension) genericFields.tension = genericTension;
  if (genericProof) genericFields.proofEmphasis = genericProof;
  if (genericAction) genericFields.nextAction = genericAction;
  if (genericAudience) genericFields.audienceLabel = genericAudience;
  if (genericEyebrow) genericFields.eyebrow = genericEyebrow;

  const variants: PersonalizationVisibleVariant[] = [
    buildVariant({
      variantId: "generic",
      audienceState: "category",
      fields: genericFields,
      imageryTreatment: sellerTreatment,
      hasEvidence: Boolean(seller.description || seller.publicTopics.length)
    })
  ];

  const canAccount =
    useCase === "abm" &&
    Boolean(target) &&
    targetEvidence.length >= 1 &&
    Boolean(distinctiveTerm(primaryEvidence?.text ?? "", [target!.companyName, seller.companyName]));

  if (canAccount && target && primaryEvidence) {
    const targetRef = primaryEvidence.sourceUrl;
    const term =
      distinctiveTerm(primaryEvidence.text, [target.companyName, seller.companyName]) ||
      concise(primaryEvidence.label, 40);
    const accountFields: Partial<Record<PersonalizationFieldKey, PersonalizationFieldValue>> = {};
    const accountHeadline = field(
      concise(
        `Connect ${target.companyName}'s ${term} priorities to a governed ${category} path.`,
        120
      ),
      [targetRef, sellerRef],
      classificationFor(primaryEvidence.confidence ?? "medium"),
      "Account argument uses distinctive public evidence, not a name swap."
    );
    const accountTension = field(
      concise(primaryEvidence.text, 180),
      [targetRef],
      classificationFor(primaryEvidence.confidence ?? "medium"),
      "Account tension from public target evidence."
    );
    const proofSource = secondaryEvidence ?? primaryEvidence;
    const accountProof = field(
      concise(
        `Emphasize evidence around ${proofSource.label}: ${concise(proofSource.text, 110)}`,
        180
      ),
      [proofSource.sourceUrl],
      classificationFor(proofSource.confidence ?? "medium"),
      "Proof emphasis from a second public account signal when available."
    );
    const accountAction = field(
      concise(`Plan the first ${target.companyName} working session`, 72),
      [targetRef],
      classificationFor(primaryEvidence.confidence ?? "medium"),
      "Account-specific next action."
    );
    const accountAudience = field(
      concise(audience, 90),
      [targetRef],
      "safe_public",
      "Account preview keeps the selected audience."
    );
    const accountEyebrow = field(
      concise(`${seller.companyName} for ${target.companyName}`, 72),
      [targetRef, sellerRef],
      "safe_public",
      "Account eyebrow with seller ownership."
    );
    if (accountHeadline) accountFields.headline = accountHeadline;
    if (accountTension) accountFields.tension = accountTension;
    if (accountProof) accountFields.proofEmphasis = accountProof;
    if (accountAction) accountFields.nextAction = accountAction;
    if (accountAudience) accountFields.audienceLabel = accountAudience;
    if (accountEyebrow) accountFields.eyebrow = accountEyebrow;

    const accountTreatment: BrandImageryTreatment =
      target.imageUrls.length > 0 || Boolean(target.logoUrl)
        ? "image-supported"
        : sellerTreatment === "image-led"
          ? "image-supported"
          : sellerTreatment;

    variants.push(
      buildVariant({
        variantId: "account",
        audienceState: "account",
        fields: accountFields,
        imageryTreatment: accountTreatment,
        hasEvidence: true
      })
    );

    if (industry) {
      const industryFields: Partial<Record<PersonalizationFieldKey, PersonalizationFieldValue>> = {
        ...accountFields
      };
      const industryHeadline = field(
        concise(
          `Help ${target.companyName} advance ${industry} outcomes with a sharper ${category} thesis.`,
          120
        ),
        [targetRef, sellerRef],
        classificationFor(primaryEvidence.confidence ?? "medium"),
        "Industry context reshapes the account argument."
      );
      const industryTension = field(
        concise(
          `${target.companyName}'s ${industry} context raises the cost of slow ${term} decisions.`,
          180
        ),
        [targetRef],
        classificationFor(primaryEvidence.confidence ?? "medium"),
        "Industry-aware tension from public topics plus account evidence."
      );
      const industryProof = field(
        concise(
          `Proof should privilege ${industry} operating signals over generic category claims.`,
          180
        ),
        [targetRef, ...(target.publicTopics[0] ? [`topic:${target.publicTopics[0]}`] : [])],
        "safe_public",
        "Industry proof emphasis from public topics."
      );
      const industryAction = field(
        concise(`Review the ${industry} path for ${target.companyName}`, 72),
        [targetRef],
        "safe_public",
        "Industry-specific next action."
      );
      if (industryHeadline) industryFields.headline = industryHeadline;
      if (industryTension) industryFields.tension = industryTension;
      if (industryProof) industryFields.proofEmphasis = industryProof;
      if (industryAction) industryFields.nextAction = industryAction;

      variants.push(
        buildVariant({
          variantId: "account_industry",
          audienceState: "account-industry",
          fields: industryFields,
          imageryTreatment: accountTreatment,
          hasEvidence: true
        })
      );

      const personaVariantIds: PersonalizationVariantId[] = [
        "account_industry_persona_a",
        "account_industry_persona_b"
      ];
      personaVariantIds.forEach((variantId, index) => {
        const persona = personas[index];
        if (!persona) return;
        const personaRefs = [
          ...persona.evidenceItemIds.map(
            (id) => evidenceItems?.find((item) => item.id === id)?.sourceUrl
          ),
          targetRef
        ].filter((value): value is string => Boolean(value));
        const personaFields: Partial<Record<PersonalizationFieldKey, PersonalizationFieldValue>> = {
          ...industryFields
        };
        const personaHeadline = field(
          concise(
            `Give ${persona.label} at ${target.companyName} a ${industry}-ready decision frame.`,
            120
          ),
          personaRefs,
          classificationFor(persona.confidence),
          "Persona changes the decision owner and argument."
        );
        const personaTension = field(
          concise(
            persona.rationale ||
              `${persona.label} need a clearer first decision across ${industry} and ${term}.`,
            180
          ),
          personaRefs,
          classificationFor(persona.confidence),
          "Persona tension from recommendation rationale and account evidence."
        );
        const personaProof = field(
          concise(
            persona.evidenceSummary
              ? `Lead with the signal that matters to ${persona.label}: ${persona.evidenceSummary}`
              : `Show ${persona.label} the ${industry} proof that unlocks the next decision.`,
            180
          ),
          personaRefs,
          classificationFor(persona.confidence),
          "Persona proof emphasis from recommendation evidence."
        );
        const personaAction = field(
          concise(`Align ${persona.label} on the first ${offerName} decision`, 72),
          personaRefs,
          classificationFor(persona.confidence),
          "Persona-specific next action."
        );
        const personaAudience = field(
          concise(persona.label, 90),
          personaRefs,
          classificationFor(persona.confidence),
          "Supported persona label."
        );
        if (personaHeadline) personaFields.headline = personaHeadline;
        if (personaTension) personaFields.tension = personaTension;
        if (personaProof) personaFields.proofEmphasis = personaProof;
        if (personaAction) personaFields.nextAction = personaAction;
        if (personaAudience) personaFields.audienceLabel = personaAudience;

        variants.push(
          buildVariant({
            variantId,
            audienceState: `account-industry-persona:${persona.id}`,
            fields: personaFields,
            imageryTreatment: "type-led",
            hasEvidence: true
          })
        );
      });
    }
  }

  const defaultVariantId: PersonalizationVariantId =
    variants.find((variant) => variant.variantId === "account")?.variantId ?? "generic";

  const safeFields = PERSONALIZATION_FIELD_KEYS.filter((key) =>
    variants.some((variant) =>
      key === "imageryTreatment" ? Boolean(variant.imageryTreatment) : Boolean(variant.fields[key])
    )
  );
  const omittedFields = PERSONALIZATION_FIELD_KEYS.filter((key) => !safeFields.includes(key));

  return {
    mode: "preview-variants",
    defaultVariantId,
    safeFields,
    omittedFields,
    visibleVariants: variants
  };
}

export function personalizationVariantById(
  plan: ExperiencePersonalizationPlan,
  variantId: PersonalizationVariantId | string | undefined
): PersonalizationVisibleVariant | undefined {
  if (!variantId) {
    return plan.visibleVariants.find((variant) => variant.variantId === plan.defaultVariantId);
  }
  return plan.visibleVariants.find((variant) => variant.variantId === variantId);
}

export function availablePersonalizationVariantIds(
  plan: ExperiencePersonalizationPlan | undefined
): PersonalizationVariantId[] {
  if (!plan) return ["generic"];
  return PERSONALIZATION_VARIANT_ORDER.filter((id) =>
    plan.visibleVariants.some((variant) => variant.variantId === id)
  );
}

/**
 * Apply a compiled variant onto the canonical draft. Missing/unsupported fields
 * keep the canonical value only when the variant omitted them intentionally
 * without a replacement — visible variant fields always win when present.
 */
export function applyPersonalizationVariant(
  draft: ExperienceDraft,
  plan: ExperiencePersonalizationPlan,
  variantId?: PersonalizationVariantId | string
): ExperienceDraft {
  const variant = personalizationVariantById(plan, variantId ?? plan.defaultVariantId);
  if (!variant) return draft;

  const headline = variant.fields.headline?.value;
  const tension = variant.fields.tension?.value;
  const proofEmphasis = variant.fields.proofEmphasis?.value;
  const nextAction = variant.fields.nextAction?.value;
  const audienceLabel = variant.fields.audienceLabel?.value;
  const eyebrow = variant.fields.eyebrow?.value;

  return {
    ...draft,
    ...(headline ? { headline, title: headline } : {}),
    ...(tension ? { subhead: tension, thesisBody: tension } : {}),
    ...(proofEmphasis ? { thesisHeadline: proofEmphasis } : {}),
    ...(nextAction ? { primaryCta: nextAction } : {}),
    ...(audienceLabel ? { audienceLabel } : {}),
    ...(eyebrow ? { eyebrow } : {})
  };
}

export function personalizationRuntimePayload(plan: ExperiencePersonalizationPlan): {
  defaultVariantId: PersonalizationVariantId;
  variants: Record<
    string,
    {
      fields: Record<string, string>;
      imageryTreatment?: BrandImageryTreatment;
      omittedFields: PersonalizationFieldKey[];
      hasEvidence: boolean;
    }
  >;
} {
  const variants: Record<
    string,
    {
      fields: Record<string, string>;
      imageryTreatment?: BrandImageryTreatment;
      omittedFields: PersonalizationFieldKey[];
      hasEvidence: boolean;
    }
  > = {};

  for (const variant of plan.visibleVariants) {
    const fields: Record<string, string> = {};
    for (const key of PERSONALIZATION_FIELD_KEYS) {
      if (key === "imageryTreatment") continue;
      const value = variant.fields[key]?.value;
      if (!value) continue;
      for (const blockId of PERSONALIZATION_BLOCK_MAP[key]) {
        fields[blockId] =
          key === "audienceLabel" && !/^for\s+/i.test(value) ? `For ${value}` : value;
      }
    }
    variants[variant.variantId] = {
      fields,
      ...(variant.imageryTreatment ? { imageryTreatment: variant.imageryTreatment } : {}),
      omittedFields: [...variant.omittedFields],
      hasEvidence: variant.hasEvidence
    };
  }

  return {
    defaultVariantId: plan.defaultVariantId,
    variants
  };
}

export function assertArgumentNotNameOnly(
  baseline: string,
  personalized: string,
  names: string[]
): boolean {
  const stripNames = (value: string) => {
    let next = value.toLocaleLowerCase();
    for (const name of names) {
      next = next.split(name.toLocaleLowerCase()).join(" ");
    }
    return next.replace(/\s+/g, " ").trim();
  };
  return stripNames(baseline) !== stripNames(personalized);
}
