import type { BrandProfile } from "@/lib/types";
import type { ContentClaim, ContentProof, SourceArtifact } from "@/lib/content-intelligence";
import { compilerEvidencePermissions, type CompilerEvidenceItem, type CompilerEvidenceType } from "./messaging-compiler-contracts";
import { compilerDigest } from "./compiler-digest";

const VERSION = "source-product-knowledge-v5";
const TTL_MS = 24 * 60 * 60_000;
const MAX_ENTRIES = 32;
const cache = new Map<string, { at: number; value: CompilerEvidenceItem[] }>();
const normalize = (value: string) => value.replace(/\s+/g, " ").trim();
const terms = (value: string) => value.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const unsafe = /<[^>]*>|```|\b(?:ignore|disregard)\b.{0,80}\b(?:instructions?|rules?)\b|system prompt|developer message|api key|password|secret token/i;

function sourceUrl(artifact: SourceArtifact, seller: BrandProfile): string | undefined {
  if (artifact.source.kind !== "public-url" || seller.source === "fallback") return undefined;
  try {
    const url = new URL(artifact.source.finalUrl ?? artifact.source.sourceUrl ?? "");
    const hosts = [seller.domain, seller.canonicalDomain, ...(seller.domainAliases ?? [])]
      .filter((value): value is string => Boolean(value)).map((value) => value.toLowerCase().replace(/^www\./, ""));
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    return url.protocol === "https:" && !url.username && !url.password && !url.port &&
      hosts.some((allowed) => host === allowed || host.endsWith(`.${allowed}`)) ? url.href : undefined;
  } catch { return undefined; }
}

/**
 * A linked-card child section owns its description, while its nearest prior
 * shallower section supplies the page's stated grouping. Keeping both avoids
 * losing a visible "Focus Areas" or "Capabilities" classification merely
 * because extraction correctly separated sibling cards.
 */
function sectionHeadingsWithContext(artifact: SourceArtifact, sections: readonly SourceArtifact["content"]["sections"][number][]): string {
  const headings = new Set<string>();
  for (const section of sections) {
    headings.add(section.title);
    const index = artifact.content.sections.findIndex((candidate) => candidate.id === section.id);
    const parent = artifact.content.sections.slice(0, index).reverse()
      .find((candidate) => candidate.level < section.level);
    if (parent) headings.add(parent.title);
  }
  return [...headings].join(" ");
}

function sectionHasQuestionAnswerShape(sections: readonly SourceArtifact["content"]["sections"][number][]): boolean {
  return sections.some((section) => /\?\s*$/.test(section.title));
}

function nonNarrativeSection(sections: readonly SourceArtifact["content"]["sections"][number][]): boolean {
  return sections.some((section) =>
    /\b(?:footnotes?|disclaimers?|filters?)\b/i.test(section.title) || /\|/.test(section.text)
  );
}

function normalizedContains(value: string | undefined, phrase: string): boolean {
  const haystack = terms(value ?? "");
  const needle = terms(phrase);
  return Boolean(needle) && haystack.includes(needle);
}

const nonProductPageTitle = /^(?:home|homepage|overview|products?|services?|solutions?)$/i;
const excludedSectionHeading = /\b(?:latest from|related (?:articles|insights|resources)|upcoming (?:events|webinars)|newsroom)\b/i;
const capabilityLanguage = /\b(?:accelerat(?:e|es|ing)|analyz(?:e|es|ing)|automat(?:e|es|ed|ing|ically)|connect(?:s|ed|ing)?|correlat(?:e|es|ed|ing)|detect(?:s|ed|ing)?|deliver(?:s|ed|ing)?|enable(?:s|d|ing)?|enrich(?:es|ed|ing)?|guide(?:s|d|ing)?|help(?:s|ed|ing)?|identif(?:y|ies|ied|ying)|include(?:s|d|ing)?|monitor(?:s|ed|ing)?|prioritiz(?:e|es|ed|ing)|provide(?:s|d|ing)?|remediat(?:e|es|ed|ing)|review(?:s|ed|ing)?|route(?:s|d|ing)?|support(?:s|ed|ing)?|surface(?:s|d|ing)?|trigger(?:s|ed|ing)?|unif(?:y|ies|ied|ying))\b/i;

/**
 * A visitor may paste an official product page while naming one promise or
 * subsection from that page. The page can establish the canonical product
 * identity only when its own title agrees with its H1 and the visitor's label
 * appears in a separate, non-navigation section on the same cited artifact.
 */
function productFocusedSource(artifact: SourceArtifact, offer: string, seller: BrandProfile): boolean {
  const title = normalize((artifact.content.title ?? "").split(/[|:]/)[0] ?? "");
  const direct = normalizedContains(title, offer) || artifact.content.sections.some((section) =>
    section.level === 1 && normalizedContains(section.title, offer));
  if (direct) return true;
  if (!title || nonProductPageTitle.test(title) || terms(title) === terms(seller.companyName) || terms(title).split(" ").length < 2) {
    return false;
  }
  const titleOwnsPage = artifact.content.sections.some((section) =>
    section.level === 1 && normalizedContains(section.title, title));
  const offerNamesSection = artifact.content.sections.some((section) =>
    section.level > 1 && !excludedSectionHeading.test(section.title) && normalizedContains(section.title, offer));
  return titleOwnsPage && offerNamesSection;
}

export function clearSourceBackedProductKnowledgeCacheForTests() { cache.clear(); }

/** Public, already-extracted seller material only. No new network/model calls. */
export function compilerEvidenceFromProductSource(input: {
  artifact?: SourceArtifact; seller: BrandProfile; offer: string; now?: Date;
}): CompilerEvidenceItem[] {
  const { artifact, seller, offer } = input;
  if (!artifact || artifact.status !== "ready" || artifact.extraction.status !== "complete" ||
      artifact.extraction.truncated || artifact.confidence === "low" || !terms(offer)) return [];
  const url = sourceUrl(artifact, seller);
  if (!url) return [];
  const now = input.now?.getTime() ?? Date.now();
  if (!Number.isFinite(now)) return [];
  const key = compilerDigest(VERSION, { url, offer, seller: seller.companyName,
    content: artifact.content, understanding: artifact.understanding, confidence: artifact.confidence });
  const cached = cache.get(key);
  if (cached && now >= cached.at && now - cached.at < TTL_MS) return structuredClone(cached.value);
  cache.delete(key);
  const citations = new Map(artifact.content.citations.map((citation) => [citation.id, citation]));
  const output = new Map<string, CompilerEvidenceItem>();
  const sourceIsProductFocused = productFocusedSource(artifact, offer, seller);
  const add = (item: ContentClaim | ContentProof, proofKind?: ContentProof["kind"]) => {
    const text = normalize(item.text);
    if (!text || text.length > 400 || unsafe.test(text) || item.confidence === "low") return;
    const carriesOwnership = item.sourceSectionId !== undefined || item.sourceSectionTitle !== undefined;
    if (carriesOwnership && (!item.sourceSectionId || !item.sourceSectionTitle)) return;
    const ownedSection = carriesOwnership
      ? artifact.content.sections.find((section) =>
        section.id === item.sourceSectionId && normalize(section.title) === normalize(item.sourceSectionTitle!) &&
        normalize(section.text).includes(text) &&
        section.citationIds.some((id) => item.citationIds.includes(id)))
      : undefined;
    // Metadata is a restriction, never a hint. When it is present, accepting
    // a different section would let a sibling card borrow the wrong service's
    // description through a shared or stale citation id.
    if (carriesOwnership && !ownedSection) return;
    const sections = ownedSection ? [ownedSection] : artifact.content.sections.filter((section) =>
      section.citationIds.some((id) => item.citationIds.includes(id)) && normalize(section.text).includes(text));
    const citation = item.citationIds.map((id) => citations.get(id)).find((candidate) => candidate && sections.some((section) =>
      section.citationIds.includes(candidate.id) && normalize(section.text).includes(text) &&
      normalize(candidate.excerpt).includes(text)));
    if (!citation || citation.locator.kind !== "url-block") return;
    try { if (new URL(citation.locator.sourceUrl).origin !== new URL(url).origin) return; } catch { return; }
    const containsOffer = (value: string) => ` ${terms(value)} `.includes(` ${terms(offer)} `);
    const adjacentOffer = sections.some((section) => containsOffer(`${section.title} ${section.text}`)) || containsOffer(text);
    // Outcome proof needs product scope in its own quote/section. A portfolio
    // title or another section sharing a citation cannot establish that scope.
    if (!adjacentOffer && (!sourceIsProductFocused || proofKind === "metric" || proofKind === "example")) return;
    if (terms(offer) === terms(seller.companyName)) return;
    const headings = sectionHeadingsWithContext(artifact, sections);
    // Related articles and site navigation are not descriptions of this offer.
    // A product-focused page title must not promote those blocks into product facts.
    if (excludedSectionHeading.test(headings)) return;
    // Tables, filter controls, and legal footnotes can state true numbers or
    // constraints, but they are not standalone product capability claims.
    if (nonNarrativeSection(sections)) return;
    let evidenceType: CompilerEvidenceType = proofKind === "mechanism" ? "workflow"
      : /\b(?:features?|capabilities|focus areas|our (?:services|solutions))\b/i.test(headings) ? "capability"
      : /\b(?:pricing|plans? and pricing)\b/i.test(headings) ? "pricing"
      : /\b(?:security|compliance)\b/i.test(headings) ? "security"
      : /\b(?:implementation|deployment|migration|integration)\b/i.test(headings) ? "implementation"
      : /\b(?:how it works|workflow)\b/i.test(headings) ? "workflow"
      : capabilityLanguage.test(text) ? "capability" : "positioning";
    // A cited answer under an offer-specific FAQ is a direct product
    // description. Treat it as a capability without guessing from a verb so
    // first-party facts such as form factor, efficiency, or included AI
    // functions survive the compiler. Tables, filters, and footnotes are not
    // question-and-answer descriptions and therefore cannot take this path.
    if (evidenceType === "positioning" && adjacentOffer && sectionHasQuestionAnswerShape(sections)) {
      evidenceType = "capability";
    }
    if (evidenceType === "positioning" && !adjacentOffer) return;
    const confidence = artifact.confidence === "high" && item.confidence === "high" ? "high" : "medium";
    const customerContext = /\b(?:customer|client|case study)\b/i.test(`${headings} ${text}`);
    const pastOutcome = /\b(?:increased|decreased|reduced|improved|saved|grew|achieved)\b/i.test(text);
    const prediction = /\b(?:will|could|potential|target|goal|expects?|aims?|up to)\b/i.test(text);
    if (confidence === "high" && customerContext && pastOutcome && !prediction) {
      if (proofKind === "metric" && /\d+(?:\.\d+)?\s*(?:%|percent|x|times|days?|hours?|minutes?|dollars?)/i.test(text)) evidenceType = "quantified-outcome";
      else if (proofKind === "example") evidenceType = "customer-outcome";
    }
    const permissions = compilerEvidencePermissions("fact", confidence);
    const isOutcome = evidenceType === "customer-outcome" || evidenceType === "quantified-outcome";
    const id = `source:${compilerDigest("claim", { url, text, evidenceType, sourceSectionId: item.sourceSectionId }).slice(0, 24)}`;
    output.set(id, { id, kind: "fact", claim: text, sourceAuthority: "seller-official",
      sourceRef: url, confidence, ...permissions,
      prohibitedUses: [...new Set([...permissions.prohibitedUses, ...(!isOutcome ? ["proof-point" as const] : [])])],
      evidenceType, subject: offer, entityRole: "seller",
      ...(ownedSection ? { sourceSectionId: ownedSection.id, sourceSectionTitle: ownedSection.title } : {}) });
  };
  for (const item of artifact.understanding.claims) add(item);
  for (const item of artifact.understanding.proof) add(item, item.kind);
  const value = [...output.values()].sort((a, b) => a.id.localeCompare(b.id)).slice(0, 32);
  while (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value!);
  cache.set(key, { at: now, value: structuredClone(value) });
  return structuredClone(value);
}
