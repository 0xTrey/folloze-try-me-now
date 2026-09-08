import { copyContractMetadata, sectionCopyWordCount, type SectionCopyCandidate, type SectionCopyChoice, type SectionCopyChoices, type SectionEvidenceClaim, type SectionWriterSlot } from "./section-copy-types";

const normalized = (text: string) => text.replace(/\s+/g, " ").trim();
const unsafe = /<[^>]*>|```|javascript:|\b(?:ignore|disregard)\b.{0,80}\b(?:instructions?|rules?)\b|system prompt|developer message|api key|password|secret token|\u2014/i;

/** A source phrase, not an invented benefit or an internal card-job label. */
export function evidenceChoiceLabel(text: string): string {
  const clean = normalized(text);
  const predicate = /\s+(?:is|are|was|were|has|have|brings?|covers?|provides?|delivers?|supports?|helps?|enables?|connects?|assesses?|reviews?|includes?|simplif(?:y|ies)|records?|routes?|defines?|describes?|emphasizes?|identifies?|lists?|names?|reduces?|allows?|offers?|confirms?|introduces?|examines?|closes? with)\b/i.exec(clean);
  const subject = predicate ? clean.slice(0, predicate.index) : clean;
  const object = predicate ? clean.slice(predicate.index + predicate[0].length).trim() : "";
  const useObject = subject.split(/\s+/).length < 3 || /\b(?:source|guide|brief|report|webinar|recording|speaker|advisors?)$/i.test(subject);
  const phrase = useObject && object ? object : subject;
  const tokens = phrase.replace(/^(?:the|a|an)\s+/i, "").replace(/[.!?:;]+$/, "").split(/\s+/).slice(0, 8);
  while (tokens.length > 2 && /^(?:and|or|with|for|to|the|a|an|of|in|across)$/i.test(tokens.at(-1)!)) tokens.pop();
  return tokens.join(" ");
}

/** Complete source statements only. No made-up questions to fill empty cards. */
export function evidenceChoiceCandidate(input: {
  slot: SectionWriterSlot;
  claims: readonly SectionEvidenceClaim[];
  headline: string;
}): SectionCopyCandidate | undefined {
  const { slot } = input;
  const candidates: SectionCopyChoice[] = [];
  const texts = new Set<string>();
  const labels = new Set<string>();
  for (const claim of input.claims) {
    const body = normalized(claim.text);
    const sourceTitle = claim.sourceSectionId && claim.sourceSectionTitle
      ? normalized(claim.sourceSectionTitle) : "";
    const label = sourceTitle && !unsafe.test(sourceTitle) && !/\?$/.test(sourceTitle)
      ? sourceTitle : evidenceChoiceLabel(body);
    if (!body || unsafe.test(body) || /\?$/.test(body) || texts.has(body.toLowerCase()) || labels.has(label.toLowerCase())) continue;
    const choice = { label, body, evidenceRefs: [claim.id] };
    const wordCount = [input.headline, ...[...candidates, choice].flatMap((item) => [item.label, item.body])]
      .join(" ").split(/\s+/).filter(Boolean).length;
    if (wordCount > slot.wordBudget.max) continue;
    candidates.push(choice);
    texts.add(body.toLowerCase());
    labels.add(label.toLowerCase());
    if (candidates.length === 3) break;
  }
  if (!candidates.length) return undefined;
  const single = candidates.length === 1 ? candidates[0]! : undefined;
  const result: SectionCopyCandidate = { sectionId: slot.id, role: slot.role, ...copyContractMetadata(slot), status: "complete",
    headline: input.headline,
    ...(single ? { body: single.body } : { choices: candidates as unknown as SectionCopyChoices }),
    evidenceRefs: candidates.flatMap(({ evidenceRefs }) => evidenceRefs), wordCount: 0 };
  result.wordCount = sectionCopyWordCount(result);
  return result.wordCount <= slot.wordBudget.max ? result : undefined;
}
