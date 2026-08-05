import { createHash } from "node:crypto";

import { z } from "zod";

export const SOURCE_ARTIFACT_VERSION = 1 as const;

const confidenceSchema = z.enum(["high", "medium", "low"]);

export const sourceCitationSchema = z.object({
  id: z.string().min(1).max(80),
  locator: z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal("url-block"),
      block: z.number().int().positive(),
      label: z.string().min(1).max(180),
      sourceUrl: z.string().url()
    }),
    z.object({
      kind: z.literal("pdf-page"),
      page: z.number().int().positive(),
      label: z.string().min(1).max(180)
    })
  ]),
  excerpt: z.string().min(1).max(320)
});

export type SourceCitation = z.infer<typeof sourceCitationSchema>;

export const sourceSectionSchema = z.object({
  id: z.string().min(1).max(80),
  title: z.string().min(1).max(180),
  level: z.number().int().min(1).max(6),
  order: z.number().int().nonnegative(),
  text: z.string().max(30_000),
  citationIds: z.array(z.string().min(1).max(80)).max(100)
});

export type SourceSection = z.infer<typeof sourceSectionSchema>;

export const sourceLinkSchema = z.object({
  id: z.string().min(1).max(80),
  label: z.string().min(1).max(180),
  url: z.string().url(),
  citationIds: z.array(z.string().min(1).max(80)).max(8)
});

export type SourceLink = z.infer<typeof sourceLinkSchema>;

export const sourceAssetCandidateSchema = z.object({
  id: z.string().min(1).max(80),
  kind: z.enum(["image", "chart", "diagram", "table", "embedded-visual"]),
  sourceUrl: z.string().url().optional(),
  alt: z.string().max(240).optional(),
  caption: z.string().max(320).optional(),
  page: z.number().int().positive().optional(),
  confidence: confidenceSchema,
  citationIds: z.array(z.string().min(1).max(80)).max(8)
});

export type SourceAssetCandidate = z.infer<typeof sourceAssetCandidateSchema>;

export const sourceContentSchema = z.object({
  title: z.string().min(1).max(240).optional(),
  description: z.string().min(1).max(1_000).optional(),
  text: z.string().max(180_000),
  sections: z.array(sourceSectionSchema).max(250),
  links: z.array(sourceLinkSchema).max(200),
  assets: z.array(sourceAssetCandidateSchema).max(250),
  citations: z.array(sourceCitationSchema).max(500)
});

export type SourceContent = z.infer<typeof sourceContentSchema>;

export const contentClaimSchema = z.object({
  id: z.string().min(1).max(80),
  text: z.string().min(1).max(420),
  kind: z.enum(["claim", "metric", "recommendation"]),
  confidence: confidenceSchema,
  citationIds: z.array(z.string().min(1).max(80)).min(1).max(8)
});

export type ContentClaim = z.infer<typeof contentClaimSchema>;

export const contentProofSchema = z.object({
  id: z.string().min(1).max(80),
  text: z.string().min(1).max(420),
  kind: z.enum(["metric", "example", "mechanism", "attribution"]),
  confidence: confidenceSchema,
  citationIds: z.array(z.string().min(1).max(80)).min(1).max(8)
});

export type ContentProof = z.infer<typeof contentProofSchema>;

export const audienceSuggestionSchema = z.object({
  id: z.string().min(1).max(80),
  name: z.string().min(1).max(120),
  reason: z.string().min(1).max(320),
  confidence: confidenceSchema,
  citationIds: z.array(z.string().min(1).max(80)).min(1).max(12)
});

export type AudienceSuggestion = z.infer<typeof audienceSuggestionSchema>;

export const plannedSourceAssetSchema = z.object({
  assetId: z.string().min(1).max(80),
  recommendedUse: z.enum(["hero", "proof", "chapter", "supporting"]),
  reason: z.string().min(1).max(240),
  confidence: confidenceSchema
});

export type PlannedSourceAsset = z.infer<typeof plannedSourceAssetSchema>;

export const contentExperienceModuleSchema = z.object({
  id: z.string().min(1).max(80),
  kind: z.enum([
    "hero",
    "summary",
    "key-findings",
    "chapters",
    "proof",
    "interactive-path",
    "resources",
    "cta"
  ]),
  title: z.string().min(1).max(160),
  sourceCitationIds: z.array(z.string().min(1).max(80)).max(40)
});

export type ContentExperienceModule = z.infer<typeof contentExperienceModuleSchema>;

export const contentUnderstandingSchema = z.object({
  premise: z.string().min(1).max(520).optional(),
  summary: z.string().min(1).max(1_000).optional(),
  topics: z.array(z.string().min(1).max(80)).max(12),
  claims: z.array(contentClaimSchema).max(12),
  proof: z.array(contentProofSchema).max(12),
  audiences: z.array(audienceSuggestionSchema).max(8),
  nextAction: z.object({
    label: z.string().min(1).max(120),
    url: z.string().url().optional(),
    citationIds: z.array(z.string().min(1).max(80)).max(8)
  }).optional(),
  plannedAssets: z.array(plannedSourceAssetSchema).max(16),
  experiencePlan: z.object({
    pattern: z.enum([
      "guided-brief",
      "chapter-journey",
      "evidence-path",
      "assessment",
      "resource-companion"
    ]),
    modules: z.array(contentExperienceModuleSchema).min(1).max(12)
  })
});

export type ContentUnderstanding = z.infer<typeof contentUnderstandingSchema>;

export const sourceArtifactSchema = z.object({
  version: z.literal(SOURCE_ARTIFACT_VERSION),
  artifactId: z.string().regex(/^src_[a-f0-9]{24}$/),
  digest: z.string().regex(/^[a-f0-9]{64}$/),
  createdAt: z.string().datetime({ offset: true }),
  status: z.enum(["ready", "needs-review", "unreadable", "failed"]),
  confidence: confidenceSchema,
  source: z.object({
    kind: z.enum(["public-url", "uploaded-pdf"]),
    sourceUrl: z.string().url().optional(),
    displayName: z.string().min(1).max(255).optional(),
    mediaType: z.enum(["text/html", "application/pdf"]),
    finalUrl: z.string().url().optional()
  }),
  extraction: z.object({
    method: z.enum(["html-static", "pdf-text", "pdf-mixed", "pdf-image-only"]),
    status: z.enum(["complete", "partial", "failed"]),
    truncated: z.boolean(),
    pageCount: z.number().int().positive().optional(),
    extractedPageCount: z.number().int().nonnegative().optional(),
    ocr: z.object({
      status: z.enum(["not-required", "recommended", "required", "unavailable"]),
      pageNumbers: z.array(z.number().int().positive()).max(500),
      reason: z.string().min(1).max(320)
    }),
    warnings: z.array(z.string().min(1).max(240)).max(30)
  }),
  content: sourceContentSchema,
  understanding: contentUnderstandingSchema,
  diagnostics: z.object({
    textLength: z.number().int().nonnegative(),
    sectionCount: z.number().int().nonnegative(),
    citationCount: z.number().int().nonnegative(),
    claimCount: z.number().int().nonnegative(),
    assetCount: z.number().int().nonnegative(),
    warnings: z.array(z.string().min(1).max(240)).max(30),
    failureCode: z.string().regex(/^[a-z0-9_-]{1,80}$/).optional()
  })
});

export type SourceArtifactV1 = z.infer<typeof sourceArtifactSchema>;
export type SourceArtifact = SourceArtifactV1;

export interface SourceArtifactInput {
  source: SourceArtifactV1["source"];
  extraction: SourceArtifactV1["extraction"];
  content: SourceContent;
  createdAt?: string;
  failureCode?: string;
}

const topicStopWords = new Set([
  "about", "after", "again", "also", "and", "are", "because", "been", "before",
  "being", "between", "both", "business", "can", "company", "content", "could",
  "document", "each", "experience", "first", "for", "from", "guide", "has", "have",
  "how", "into", "its", "more", "most", "new", "not", "our", "page", "report",
  "should", "source", "that", "the", "their", "them", "these", "they", "this",
  "through", "use", "using", "was", "what", "when", "where", "which", "will", "with",
  "your"
]);

const navigationText = /^(?:about|all resources|careers|company|contact|home|learn more|menu|news|privacy|products|resources|services|solutions|support)$/i;
const recommendationLanguage = /\b(?:must|need(?:s)? to|recommend(?:s|ed)?|should|requires?|prioritize)\b/i;
const evidenceLanguage = /\b(?:according to|benchmark|case study|customer|data shows?|evidence|found|measured|research|result(?:s)?|study)\b/i;
const metricLanguage = /(?:\$\s?\d|\b\d+(?:\.\d+)?\s?(?:%|percent|x|times|days?|hours?|minutes?|million|billion|k|m|b)\b)/i;

export function cleanSourceText(value: string, max = 180_000): string {
  return value
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, max);
}

function shortText(value: string, max: number): string {
  const cleaned = cleanSourceText(value, max + 80).replace(/\s+/g, " ");
  if (cleaned.length <= max) return cleaned;
  const clipped = cleaned.slice(0, max + 1);
  const sentenceEnd = Math.max(clipped.lastIndexOf(". "), clipped.lastIndexOf("? "), clipped.lastIndexOf("! "));
  const wordEnd = clipped.lastIndexOf(" ");
  return `${clipped.slice(0, sentenceEnd >= max * 0.55 ? sentenceEnd + 1 : wordEnd > 0 ? wordEnd : max).trim()}…`;
}

function stableId(prefix: string, value: string): string {
  return `${prefix}_${createHash("sha256").update(value).digest("hex").slice(0, 16)}`;
}

function sentences(value: string): string[] {
  return cleanSourceText(value)
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => shortText(sentence, 420))
    .filter((sentence) => sentence.length >= 28 && !navigationText.test(sentence));
}

function dedupeByMeaning<T>(items: T[], textFor: (item: T) => string): T[] {
  const keys = new Set<string>();
  return items.filter((item) => {
    const key = textFor(item)
      .toLocaleLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim()
      .slice(0, 160);
    if (!key || keys.has(key)) return false;
    keys.add(key);
    return true;
  });
}

function citationForSection(content: SourceContent, section: SourceSection): string[] {
  return section.citationIds.filter((id) => content.citations.some((citation) => citation.id === id));
}

function extractTopics(content: SourceContent): string[] {
  const headingTopics = [content.title, ...content.sections.map((section) => section.title)]
    .filter((value): value is string => Boolean(value))
    .map((value) => shortText(value, 80))
    .filter((value) => value.length >= 5 && !navigationText.test(value));
  const counts = new Map<string, number>();
  const topicText = [content.title, content.description, content.text.slice(0, 16_000)]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase();
  for (const token of topicText.match(/[\p{L}\p{N}+#-]{3,}/gu) ?? []) {
    const normalized = token.replace(/^[+#-]+|[+#-]+$/g, "");
    if (!normalized || topicStopWords.has(normalized)) continue;
    counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
  }
  const repeated = [...counts.entries()]
    .filter(([, count]) => count >= 2)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([token]) => token === "ai" ? "AI" : token)
    .slice(0, 8);
  return dedupeByMeaning([...headingTopics.slice(0, 4), ...repeated], (topic) => topic).slice(0, 10);
}

function candidateSentences(content: SourceContent): Array<{ text: string; citationIds: string[] }> {
  return dedupeByMeaning(
    content.sections.flatMap((section) =>
      sentences(section.text).map((text) => ({
        text,
        citationIds: citationForSection(content, section)
      }))
    ).filter((candidate) => candidate.citationIds.length > 0),
    (candidate) => candidate.text
  );
}

function deriveClaims(content: SourceContent): ContentClaim[] {
  return candidateSentences(content)
    .map((candidate) => {
      const kind: ContentClaim["kind"] = metricLanguage.test(candidate.text)
        ? "metric"
        : recommendationLanguage.test(candidate.text)
          ? "recommendation"
          : "claim";
      const score =
        (kind === "metric" ? 35 : 0) +
        (kind === "recommendation" ? 15 : 0) +
        (evidenceLanguage.test(candidate.text) ? 20 : 0) +
        Math.min(candidate.text.length, 220) / 12;
      return { ...candidate, kind, score };
    })
    .sort((left, right) => right.score - left.score)
    .slice(0, 8)
    .map((candidate) => ({
      id: stableId("claim", candidate.text),
      text: candidate.text,
      kind: candidate.kind,
      confidence: candidate.kind === "metric" || evidenceLanguage.test(candidate.text) ? "high" : "medium",
      citationIds: candidate.citationIds.slice(0, 8)
    }));
}

function deriveProof(content: SourceContent): ContentProof[] {
  return candidateSentences(content)
    .filter((candidate) => metricLanguage.test(candidate.text) || evidenceLanguage.test(candidate.text))
    .slice(0, 8)
    .map((candidate) => {
      const kind: ContentProof["kind"] = metricLanguage.test(candidate.text)
        ? "metric"
        : /\baccording to|research|study\b/i.test(candidate.text)
          ? "attribution"
          : /\bcase study|customer|example\b/i.test(candidate.text)
            ? "example"
            : "mechanism";
      return {
        id: stableId("proof", candidate.text),
        text: candidate.text,
        kind,
        confidence: kind === "metric" || kind === "attribution" ? "high" : "medium",
        citationIds: candidate.citationIds.slice(0, 8)
      };
    });
}

const audienceRules: Array<{ name: string; match: RegExp; reason: string }> = [
  {
    name: "Demand generation and content leaders",
    match: /\b(?:campaign|content|demand generation|marketing|buyer engagement)\b/i,
    reason: "The source discusses campaign, content, or buyer-engagement outcomes."
  },
  {
    name: "Revenue and sales leaders",
    match: /\b(?:pipeline|revenue|sales|seller|opportunit(?:y|ies)|account)\b/i,
    reason: "The source connects its premise to pipeline, sales, or account outcomes."
  },
  {
    name: "IT and technical leaders",
    match: /\b(?:architecture|automation|cloud|developer|integration|IT|platform|software|system)\b/i,
    reason: "The source contains technical, platform, or architecture decisions."
  },
  {
    name: "Data and AI leaders",
    match: /\b(?:AI|artificial intelligence|analytics|data|machine learning|model)\b/i,
    reason: "The source addresses data, analytics, or AI priorities."
  },
  {
    name: "Security and risk leaders",
    match: /\b(?:compliance|governance|privacy|risk|secure|security|threat)\b/i,
    reason: "The source contains security, governance, or risk considerations."
  },
  {
    name: "Operations and transformation leaders",
    match: /\b(?:change management|operations|process|transformation|workflow)\b/i,
    reason: "The source focuses on process, workflow, or transformation outcomes."
  },
  {
    name: "Finance and procurement leaders",
    match: /\b(?:budget|cost|finance|procurement|purchase|ROI|spend)\b/i,
    reason: "The source includes financial, procurement, or return considerations."
  }
];

function deriveAudiences(content: SourceContent, topics: string[]): AudienceSuggestion[] {
  const suggestions = audienceRules.flatMap((rule) => {
    const matchingSections = content.sections.filter((section) => rule.match.test(section.text) || rule.match.test(section.title));
    const citationIds = [...new Set(matchingSections.flatMap((section) => citationForSection(content, section)))];
    return citationIds.length
      ? [{
          id: stableId("audience", rule.name),
          name: rule.name,
          reason: rule.reason,
          confidence: matchingSections.length >= 2 || rule.match.test(content.title ?? "") ? "high" as const : "medium" as const,
          citationIds: citationIds.slice(0, 12)
        }]
      : [];
  });
  if (suggestions.length > 0) return suggestions.slice(0, 5);
  const firstCitation = content.citations[0];
  if (!firstCitation) return [];
  const topic = topics[0] ?? content.title ?? "this initiative";
  return [{
    id: stableId("audience", topic),
    name: `Leaders evaluating ${shortText(topic, 72)}`,
    reason: "The source identifies this as its primary subject, but does not name a more specific role.",
    confidence: "low",
    citationIds: [firstCitation.id]
  }];
}

function deriveNextAction(content: SourceContent): ContentUnderstanding["nextAction"] {
  const ranked = content.links
    .map((link) => ({
      link,
      score:
        (/\b(?:request|book|schedule|register|download|get started|contact)\b/i.test(link.label) ? 100 : 0) +
        (/\b(?:read|explore|view|learn)\b/i.test(link.label) ? 35 : 0) -
        (/privacy|terms|cookie|legal/i.test(link.label) ? 100 : 0)
    }))
    .sort((left, right) => right.score - left.score)[0];
  if (!ranked || ranked.score <= 0) return undefined;
  return {
    label: shortText(ranked.link.label, 120),
    url: ranked.link.url,
    citationIds: ranked.link.citationIds.slice(0, 8)
  };
}

export function rankSourceAssets(assets: SourceAssetCandidate[]): PlannedSourceAsset[] {
  return assets
    .map((asset) => {
      const descriptor = `${asset.alt ?? ""} ${asset.caption ?? ""}`;
      const recommendedUse: PlannedSourceAsset["recommendedUse"] = asset.kind === "chart" || asset.kind === "table"
        ? "proof"
        : asset.kind === "diagram"
          ? "chapter"
          : /hero|cover|overview/i.test(descriptor)
            ? "hero"
            : "supporting";
      const score =
        (asset.confidence === "high" ? 30 : asset.confidence === "medium" ? 20 : 5) +
        (recommendedUse === "proof" ? 20 : recommendedUse === "hero" ? 15 : 5) +
        (asset.alt || asset.caption ? 10 : 0);
      return {
        assetId: asset.id,
        recommendedUse,
        reason:
          recommendedUse === "proof"
            ? "Use this source visual beside the claim or metric it supports."
            : recommendedUse === "hero"
              ? "This source-owned visual is a plausible hero candidate."
              : recommendedUse === "chapter"
                ? "Use this visual to explain the related source chapter."
                : "Use this as supporting source imagery, not as unsupported decoration.",
        confidence: asset.confidence,
        score
      };
    })
    .sort((left, right) => right.score - left.score)
    .slice(0, 12)
    .map((asset) => ({
      assetId: asset.assetId,
      recommendedUse: asset.recommendedUse,
      reason: asset.reason,
      confidence: asset.confidence
    }));
}

export function deriveContentUnderstanding(content: SourceContent): ContentUnderstanding {
  const topics = extractTopics(content);
  const claims = deriveClaims(content);
  const proof = deriveProof(content);
  const audiences = deriveAudiences(content, topics);
  const sourceSentences = sentences([content.description, ...content.sections.map((section) => section.text)].filter(Boolean).join("\n"));
  const premise = sourceSentences[0] ? shortText(sourceSentences[0], 520) : content.title;
  const summaryParts = dedupeByMeaning(sourceSentences, (sentence) => sentence).slice(0, 3);
  const summary = summaryParts.length > 0 ? shortText(summaryParts.join(" "), 1_000) : premise;
  const plannedAssets = rankSourceAssets(content.assets);
  const nextAction = deriveNextAction(content);
  const firstCitationIds = content.citations.slice(0, 2).map((citation) => citation.id);
  const claimCitationIds = [...new Set(claims.flatMap((claim) => claim.citationIds))].slice(0, 20);
  const proofCitationIds = [...new Set(proof.flatMap((item) => item.citationIds))].slice(0, 20);
  const pattern: ContentUnderstanding["experiencePlan"]["pattern"] = /\bassessment|scorecard|quiz\b/i.test(content.title ?? "")
    ? "assessment"
    : content.sections.length >= 4
      ? "chapter-journey"
      : proof.length >= 3
        ? "evidence-path"
        : content.links.length > 2
          ? "resource-companion"
          : "guided-brief";
  const modules: ContentExperienceModule[] = [
    { id: "hero", kind: "hero", title: content.title ?? "Source overview", sourceCitationIds: firstCitationIds },
    ...(summary ? [{ id: "summary", kind: "summary" as const, title: "The premise", sourceCitationIds: firstCitationIds }] : []),
    ...(claims.length > 0 ? [{ id: "key-findings", kind: "key-findings" as const, title: "Key findings", sourceCitationIds: claimCitationIds }] : []),
    ...(content.sections.length >= 2 ? [{ id: "chapters", kind: "chapters" as const, title: "Explore the source", sourceCitationIds: content.sections.flatMap((section) => section.citationIds).slice(0, 24) }] : []),
    ...(proof.length > 0 ? [{ id: "proof", kind: "proof" as const, title: "Evidence and proof", sourceCitationIds: proofCitationIds }] : []),
    ...(claims.length >= 3 ? [{ id: "interactive-path", kind: "interactive-path" as const, title: "Choose what matters", sourceCitationIds: claimCitationIds }] : []),
    ...(content.assets.length > 0 || content.links.length > 1 ? [{ id: "resources", kind: "resources" as const, title: "Source resources", sourceCitationIds: content.assets.flatMap((asset) => asset.citationIds).slice(0, 20) }] : []),
    ...(nextAction ? [{ id: "cta", kind: "cta" as const, title: nextAction.label, sourceCitationIds: nextAction.citationIds }] : [])
  ];
  return contentUnderstandingSchema.parse({
    ...(premise ? { premise } : {}),
    ...(summary ? { summary } : {}),
    topics,
    claims,
    proof,
    audiences,
    ...(nextAction ? { nextAction } : {}),
    plannedAssets,
    experiencePlan: { pattern, modules }
  });
}

function confidenceFor(content: SourceContent, input: SourceArtifactInput, understanding: ContentUnderstanding): SourceArtifactV1["confidence"] {
  let score = 0;
  if (content.text.length >= 1_200) score += 30;
  else if (content.text.length >= 400) score += 20;
  else if (content.text.length >= 120) score += 10;
  if (content.title) score += 10;
  if (content.description) score += 5;
  if (content.citations.length >= 3) score += 20;
  else if (content.citations.length > 0) score += 10;
  if (understanding.claims.length >= 3) score += 15;
  else if (understanding.claims.length > 0) score += 5;
  if (content.sections.length >= 2) score += 10;
  if (input.extraction.status === "partial") score -= 10;
  if (input.extraction.truncated) score -= 10;
  if (input.extraction.ocr.status === "required") score -= 25;
  return score >= 70 ? "high" : score >= 40 ? "medium" : "low";
}

function artifactDigest(input: SourceArtifactInput, content: SourceContent): string {
  return createHash("sha256")
    .update(JSON.stringify({
      source: input.source,
      method: input.extraction.method,
      title: content.title,
      description: content.description,
      text: content.text,
      sections: content.sections.map(({ id, title, order, citationIds }) => ({ id, title, order, citationIds })),
      links: content.links.map(({ label, url }) => ({ label, url })),
      assets: content.assets.map(({ kind, sourceUrl, alt, page }) => ({ kind, sourceUrl, alt, page }))
    }))
    .digest("hex");
}

export function createSourceArtifact(input: SourceArtifactInput): SourceArtifact {
  const content = sourceContentSchema.parse({
    ...input.content,
    title: input.content.title ? shortText(input.content.title, 240) : undefined,
    description: input.content.description ? shortText(input.content.description, 1_000) : undefined,
    text: cleanSourceText(input.content.text)
  });
  const understanding = deriveContentUnderstanding(content);
  const confidence = input.extraction.status === "failed" ? "low" : confidenceFor(content, input, understanding);
  const status: SourceArtifactV1["status"] = input.extraction.status === "failed"
    ? "failed"
    : content.text.length < 80
      ? "unreadable"
      : confidence === "low" || input.extraction.status === "partial" || input.extraction.ocr.status === "required"
        ? "needs-review"
        : "ready";
  const digest = artifactDigest(input, content);
  return sourceArtifactSchema.parse({
    version: SOURCE_ARTIFACT_VERSION,
    artifactId: `src_${digest.slice(0, 24)}`,
    digest,
    createdAt: input.createdAt ?? new Date().toISOString(),
    status,
    confidence,
    source: input.source,
    extraction: input.extraction,
    content,
    understanding,
    diagnostics: {
      textLength: content.text.length,
      sectionCount: content.sections.length,
      citationCount: content.citations.length,
      claimCount: understanding.claims.length,
      assetCount: content.assets.length,
      warnings: input.extraction.warnings,
      ...(input.failureCode ? { failureCode: input.failureCode } : {})
    }
  });
}

export function createFailedSourceArtifact(input: {
  kind: SourceArtifactV1["source"]["kind"];
  sourceUrl?: string;
  displayName?: string;
  mediaType: SourceArtifactV1["source"]["mediaType"];
  method: SourceArtifactV1["extraction"]["method"];
  failureCode: string;
  warning: string;
  createdAt?: string;
}): SourceArtifact {
  return createSourceArtifact({
    source: {
      kind: input.kind,
      mediaType: input.mediaType,
      ...(input.sourceUrl ? { sourceUrl: input.sourceUrl } : {}),
      ...(input.displayName ? { displayName: shortText(input.displayName, 255) } : {})
    },
    extraction: {
      method: input.method,
      status: "failed",
      truncated: false,
      ocr: {
        status: input.kind === "uploaded-pdf" ? "unavailable" : "not-required",
        pageNumbers: [],
        reason: input.kind === "uploaded-pdf"
          ? "OCR need could not be assessed because PDF extraction failed."
          : "OCR does not apply to HTML sources."
      },
      warnings: [shortText(input.warning, 240)]
    },
    content: {
      text: "",
      sections: [],
      links: [],
      assets: [],
      citations: []
    },
    createdAt: input.createdAt,
    failureCode: input.failureCode
  });
}

/** Incremental adapter for the current generation pipeline. */
export function sourceArtifactToPublicContentEvidence(artifact: SourceArtifact): {
  sourceUrl: string;
  title?: string;
  description?: string;
  excerpt: string;
} | null {
  const sourceUrl = artifact.source.finalUrl ?? artifact.source.sourceUrl;
  if (!sourceUrl || artifact.status === "failed" || artifact.status === "unreadable") return null;
  return {
    sourceUrl,
    ...(artifact.content.title ? { title: artifact.content.title } : {}),
    ...(artifact.content.description ? { description: artifact.content.description } : {}),
    excerpt: artifact.content.text.slice(0, 12_000)
  };
}
