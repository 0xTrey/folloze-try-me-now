import type { SectionEvidenceClaim } from "@/lib/generation/section-copy-types";
import type { SessionEvidenceItem } from "@/lib/types";

export const ACCOUNT_PERSONALIZATION_FIELDS = [
  "tension", "whyNow", "promise", "mechanism", "decisionHelp", "proofPlan", "nextAction"
] as const;
export type AccountPersonalizationField = (typeof ACCOUNT_PERSONALIZATION_FIELDS)[number];

export interface AccountPersonalizationCompilerInput {
  revision: number;
  sellerName: string;
  targetName: string;
  targetDomain: string;
  offer: string;
  audience: string;
  objective: string;
  evidence: readonly SessionEvidenceItem[];
}

export interface AccountPersonalizationDirectives {
  tension?: string; whyNow?: string; promise?: string; mechanism?: string;
  decisionHelp?: string; proofPlan?: string; nextAction?: string;
}

export interface AccountPersonalizationQualityReceipt {
  substantiveFieldCount: number;
  status: "ready" | "limited" | "insufficient";
  evidenceDepth: "multi-signal" | "single-signal" | "none";
  distinctEvidenceCount: number;
  distinctSignalCount: number;
  rejectedEvidenceIds: string[];
}

export interface AccountPersonalizationCompilerResult {
  directives: AccountPersonalizationDirectives;
  directiveEvidenceRefs: Partial<Record<AccountPersonalizationField, string[]>>;
  claims: SectionEvidenceClaim[];
  evidenceRefs: string[];
  quality: AccountPersonalizationQualityReceipt;
  receipt: AccountPersonalizationQualityReceipt;
}

const UNSAFE =
  /<\/?[a-z][^>]*>|```|\b(?:confidential|not for distribution|will buy|must buy|purchase intent)\b/i;
const UNSAFE_METADATA =
  /<\/?[a-z][^>]*>|```|javascript:|(?:^|\s)(?:class|const|export|function|import|let|script|var)\s*(?:=|\s)|[\u0000-\u001f]/i;
const SIGNAL_STOP_WORDS = new Set([
  "public",
  "publicly",
  "company",
  "business",
  "solutions",
  "services"
]);
const TYPE_PRIORITY: Record<SessionEvidenceItem["type"], number> = {
  "public-focus-area": 0,
  "public-operating-context": 1,
  "public-positioning": 2
};

const clean = (value: string | undefined, maxLength = 320): string | undefined => {
  const normalized = value?.replace(/\s+/g, " ").trim();
  return normalized ? normalized.slice(0, maxLength) : undefined;
};

function safeMetadata(value: string | undefined, fallback: string, maxLength: number): string {
  const normalized = clean(value, maxLength);
  return normalized && !UNSAFE_METADATA.test(normalized) ? normalized : fallback;
}

function normalizedHost(value: string | undefined): string | undefined {
  const normalized = clean(value, 240);
  if (!normalized || UNSAFE_METADATA.test(normalized)) return undefined;
  try {
    const parsed = new URL(/^https?:\/\//i.test(normalized) ? normalized : `https://${normalized}`);
    return parsed.hostname.toLocaleLowerCase().replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

function matchesTargetOrigin(sourceUrl: string, targetDomain: string): boolean {
  const sourceHost = normalizedHost(sourceUrl);
  const targetHost = normalizedHost(targetDomain);
  return Boolean(
    sourceHost && targetHost &&
    (sourceHost === targetHost || sourceHost.endsWith(`.${targetHost}`))
  );
}

function sentence(value: string): string {
  const normalized = value.replace(/[;,:\s]+$/, "").trim();
  return /[.!?]$/.test(normalized) ? normalized : `${normalized}.`;
}

function possessive(value: string): string {
  return /s$/i.test(value) ? `${value}'` : `${value}'s`;
}

function lowerInitial(value: string): string {
  if (/^[A-Z]{2,}(?:\s|$)/.test(value)) return value;
  return value ? `${value[0]!.toLocaleLowerCase()}${value.slice(1)}` : value;
}

function boundedSignal(item: SessionEvidenceItem): string {
  const exact = item.signals
    .map((signal) => clean(signal, 96))
    .find(
      (signal): signal is string =>
        Boolean(
          signal &&
            signal.split(/\s+/).length >= 2 &&
            !SIGNAL_STOP_WORDS.has(signal.toLocaleLowerCase()) &&
            !UNSAFE.test(signal)
        )
    );
  if (exact) {
    return lowerInitial(
      exact
        .replace(/[.!?]$/, "")
        .split(/\s+/)
        .slice(0, 6)
        .join(" ")
    );
  }

  const text = clean(item.text, 220) ?? "the cited public context";
  const withoutCompanyLead = text.replace(/^[A-Z][\w&.'-]*(?:\s+[A-Z][\w&.'-]*)?\s+(?:is|are|has|have)\s+/i, "");
  const words = withoutCompanyLead.replace(/[.!?].*$/, "").split(/\s+/).slice(0, 6);
  return lowerInitial(words.join(" ").replace(/[,:;.!?]$/, ""));
}

function usable(item: SessionEvidenceItem, targetDomain: string): boolean {
  if (
    item.disposition === "excluded" ||
    item.entityRole !== "target" ||
    item.confidence === "low"
  ) return false;
  const text = clean(item.text);
  if (!text || text.length < 12 || UNSAFE.test(text)) return false;
  return Boolean(
    clean(item.id) &&
    clean(item.sourceUrl) &&
    /^https:\/\//i.test(item.sourceUrl) &&
    matchesTargetOrigin(item.sourceUrl, targetDomain)
  );
}

/** Deterministic, public-safe account argument compiler. It only derives copy from target evidence. */
export function compileAccountPersonalization(
  input: AccountPersonalizationCompilerInput
): AccountPersonalizationCompilerResult {
  const rejectedEvidenceIds = input.evidence
    .filter((item) => !usable(item, input.targetDomain))
    .map((item) => item.id);
  const items = input.evidence
    .filter((item) => usable(item, input.targetDomain))
    .sort(
      (left, right) =>
        TYPE_PRIORITY[left.type] - TYPE_PRIORITY[right.type] || left.id.localeCompare(right.id)
    );
  const first = items[0];
  const second = items[1] ?? first;
  if (!first) {
    const quality = {
      substantiveFieldCount: 0,
      status: "insufficient" as const,
      evidenceDepth: "none" as const,
      distinctEvidenceCount: 0,
      distinctSignalCount: 0,
      rejectedEvidenceIds
    };
    return {
      directives: {},
      directiveEvidenceRefs: {},
      claims: [],
      evidenceRefs: [],
      quality,
      receipt: quality
    };
  }
  const primarySignal = boundedSignal(first);
  const secondarySignal = boundedSignal(second!);
  const primaryLabel = safeMetadata(first.label, "the cited public signal", 80);
  const secondaryLabel = safeMetadata(second!.label, primaryLabel, 80);
  const targetName = safeMetadata(input.targetName, "The target account", 100);
  const sellerName = safeMetadata(input.sellerName, "The seller", 100);
  const offer = safeMetadata(input.offer, "the offer", 140);
  const audience = safeMetadata(input.audience, "the buying team", 140);
  const objective = safeMetadata(input.objective, "the first decision", 160);
  const refs = [...new Set(items.map((e) => e.id))];
  const directives: AccountPersonalizationDirectives = {
    tension: sentence(
      `${possessive(targetName)} public materials emphasize ${primarySignal}; the conversation should start there instead of with a generic product pitch`
    ),
    whyNow: sentence(
      `That public focus gives ${audience} a concrete lens for ${objective}, while timing and internal ownership remain validation questions`
    ),
    promise: sentence(`Evaluate ${offer} for ${possessive(targetName)} ${primarySignal}`),
    mechanism: sentence(
      `Start with ${primarySignal}, connect it to ${possessive(sellerName)} supported ${offer} workflow, then validate the handoffs and outputs with ${targetName}`
    ),
    decisionHelp: sentence(
      `Compare the supported path with ${secondarySignal}, then identify the first decision ${audience} can validate`
    ),
    proofPlan: sentence(
      `Use ${primaryLabel} and ${secondaryLabel} as public context; treat internal priorities, timing, and results as open questions`
    ),
    nextAction: `Plan a working session around ${primarySignal.split(/\s+/).slice(0, 5).join(" ")}`
  };
  const claims: SectionEvidenceClaim[] = items.map((item) => ({
    id: item.id,
    text: clean(item.text)!,
    confidence: item.confidence === "high" ? 1 : item.confidence === "low" ? 0.5 : 0.75,
    revision: input.revision,
    sourceRole: "target"
  }));
  const directiveEvidenceRefs: Record<AccountPersonalizationField, string[]> = {
    tension: [first.id],
    whyNow: [first.id],
    promise: [first.id],
    mechanism: [first.id],
    decisionHelp: [second!.id],
    proofPlan: [...new Set([first.id, second!.id])],
    nextAction: [first.id]
  };
  const distinctSignalCount = new Set([primarySignal, secondarySignal]).size;
  const quality = {
    substantiveFieldCount: Object.keys(directives).length,
    status: refs.length >= 2 && distinctSignalCount >= 2
      ? ("ready" as const)
      : ("limited" as const),
    evidenceDepth: refs.length >= 2 && distinctSignalCount >= 2
      ? ("multi-signal" as const)
      : ("single-signal" as const),
    distinctEvidenceCount: refs.length,
    distinctSignalCount,
    rejectedEvidenceIds
  };
  return {
    directives,
    directiveEvidenceRefs,
    claims,
    evidenceRefs: refs,
    quality,
    receipt: quality
  };
}

export const compileAccountPersonalizationDirectives = compileAccountPersonalization;
