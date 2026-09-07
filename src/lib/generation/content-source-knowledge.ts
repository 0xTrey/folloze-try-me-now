import { isPrivateHost } from "@/lib/asset-allocation";
import type { SourceArtifact } from "@/lib/content-intelligence";
import { compilerDigest } from "./compiler-digest";
import type { CompilerEvidenceItem } from "./messaging-compiler-contracts";

const unsafe = /<[^>]*>|\`\`\`|\b(?:ignore|disregard)\b.{0,80}\b(?:instructions?|rules?)\b|system prompt|developer message|api key|password|secret token/i;
const normalized = (value: string) => value.replace(/\s+/g, " ").trim();

function canonicalPublicUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port ||
      isPrivateHost(url.hostname)) return undefined;
    url.hash = "";
    url.hostname = url.hostname.toLowerCase();
    if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, "");
    url.searchParams.sort();
    return url.toString();
  } catch {
    return undefined;
  }
}

function publicSourceRef(artifact: SourceArtifact): string | undefined {
  if (artifact.source.kind !== "public-url") return undefined;
  try {
    const url = new URL(artifact.source.finalUrl ?? artifact.source.sourceUrl ?? "");
    if (url.protocol !== "https:" || url.username || url.password || url.port || url.search || url.hash || isPrivateHost(url.hostname)) return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

/**
 * A public artifact belongs to the source the visitor selected, whether the
 * saved answer names the submitted URL or its verified final redirect. An
 * upload has no public URL to compare and remains private-artifact scoped.
 */
export function contentSourceMatchesSelectedInput(input: {
  artifact: SourceArtifact;
  sourceUrl?: string;
}): boolean {
  if (input.artifact.source.kind === "uploaded-pdf") return Boolean(sourceRef(input.artifact));
  const selected = input.sourceUrl ? canonicalPublicUrl(input.sourceUrl) : undefined;
  if (!selected) return false;
  return [input.artifact.source.sourceUrl, input.artifact.source.finalUrl]
    .some((url) => Boolean(url && canonicalPublicUrl(url) === selected));
}

function sourceRef(artifact: SourceArtifact): string | undefined {
  if (artifact.source.kind === "uploaded-pdf") {
    return /^[a-f0-9]{64}$/.test(artifact.digest)
      ? `source-artifact:${artifact.digest}`
      : undefined;
  }
  return publicSourceRef(artifact);
}

function safePublicUrl(value: string): URL | undefined {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port ||
      url.search || url.hash || isPrivateHost(url.hostname)) return undefined;
    return url;
  } catch {
    return undefined;
  }
}

/** Citations inherit the artifact's authority boundary, not merely URL syntax. */
function citationMatchesArtifact(artifact: SourceArtifact, citation: SourceArtifact["content"]["citations"][number]): boolean {
  if (unsafe.test(citation.excerpt) || unsafe.test(citation.locator.label)) return false;
  if (artifact.source.kind === "uploaded-pdf") {
    if (citation.locator.kind !== "pdf-page") return false;
    const pageCount = artifact.extraction.pageCount;
    return Number.isInteger(citation.locator.page) && citation.locator.page > 0 &&
      (pageCount === undefined || citation.locator.page <= pageCount);
  }
  if (citation.locator.kind !== "url-block") return false;
  const source = publicSourceRef(artifact);
  const citationUrl = safePublicUrl(citation.locator.sourceUrl);
  return Boolean(source && citationUrl && citationUrl.origin === new URL(source).origin);
}

function citationBacksClaim(artifact: SourceArtifact, citationIds: readonly string[], claim: string): boolean {
  const citations = new Map<string, SourceArtifact["content"]["citations"][number]>();
  for (const citation of artifact.content.citations) {
    if (citations.has(citation.id)) return false;
    citations.set(citation.id, citation);
  }
  const text = normalized(claim);
  if (!text || citationIds.length === 0 || citationIds.some((id) => {
    const citation = citations.get(id);
    return !citation || !citationMatchesArtifact(artifact, citation);
  })) return false;
  return citationIds.some((id) => {
    const citation = citations.get(id)!;
    const quoteBacked = normalized(citation.excerpt).includes(text);
    const sectionBacked = artifact.content.sections.some((section) =>
      section.citationIds.includes(id) && normalized(section.text).includes(text)
    );
    return quoteBacked || sectionBacked;
  });
}

/**
 * Private content-source ledger entries. These report what the supplied guide
 * says, never what a seller can do or what a customer achieved.
 */
export function compilerEvidenceFromContentSource(input: {
  artifact: SourceArtifact;
  offer: string;
}): CompilerEvidenceItem[] {
  const { artifact } = input;
  const offer = normalized(input.offer);
  if (
    artifact.status !== "ready" ||
    artifact.extraction.status !== "complete" ||
    artifact.extraction.truncated ||
    artifact.confidence === "low" ||
    !offer ||
    unsafe.test(offer)
  ) return [];
  const ref = sourceRef(artifact);
  if (!ref) return [];
  const output = new Map<string, CompilerEvidenceItem>();
  for (const item of artifact.understanding.claims) {
    const claim = normalized(item.text);
    if (!claim || item.confidence === "low" || unsafe.test(claim) ||
      !citationBacksClaim(artifact, item.citationIds, claim)) continue;
    const id = `content:${compilerDigest("content-source-evidence", {
      artifact: artifact.digest, claim, citations: [...item.citationIds].sort()
    })}`;
    output.set(id, {
      id,
      kind: "fact",
      claim,
      sourceAuthority: "content-source",
      sourceRef: ref,
      confidence: artifact.confidence === "high" && item.confidence === "high" ? "high" : "medium",
      allowedUses: ["choice", "mechanism", "team", "credibility"],
      prohibitedUses: ["competitive-comparison", "proof-point", "urgency-claim"],
      evidenceType: "resource",
      subject: offer,
      entityRole: "source"
    });
  }
  return [...output.values()].sort((left, right) => left.id.localeCompare(right.id));
}

/** Current-input authority wrapper used by production ledger and readiness gates. */
export function compilerEvidenceFromSelectedContentSource(input: {
  artifact: SourceArtifact;
  offer: string;
  sourceUrl?: string;
}): CompilerEvidenceItem[] {
  if (!contentSourceMatchesSelectedInput(input)) return [];
  return compilerEvidenceFromContentSource(input);
}
