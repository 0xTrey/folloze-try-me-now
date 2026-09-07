import type { BuildExperiencePlan } from "./build-experience-plan";
import { hasSubstantiveEvidenceUse, isValidationOnlyCopy } from "./build-quality-policy";
import { copyContractMetadata, sectionCopyWordCount, type SectionCopyCandidate, type SectionCopyChoice, type SectionEvidenceClaim, type SectionWriterArtifact, type SectionWriterSlot } from "./section-copy-types";

const normalized = (value: string) => value.replace(/\s+/g, " ").trim();
const count = (value: string) => normalized(value).split(/\s+/).filter(Boolean).length;
const safe = (value: string) => !/<[^>]*>|```|\b(?:ignore|disregard)\b.{0,80}\b(?:instructions?|rules?)\b|system prompt|developer message|api key|password|secret token|\u2014/i.test(value);
const choiceRoles = new Set(["pathways", "agenda", "chapter-navigation", "decision-support"]);

function heading(slot: SectionWriterSlot, offer: string): string {
  const named = slot.role === "hero" ? offer : slot.role === "mechanism" ? `How ${offer} works` : "";
  if (named && count(named) <= (slot.headlineWordBudget?.max ?? 10)) return named;
  if (slot.v2Role === "evaluation-criteria") return "Requirements to plan around";
  if (slot.v2Role === "account-relevance") return "The account's operating context";
  if (slot.v2Role === "current-friction" || slot.v2Role === "stakes") return "Where the work gets difficult";
  if (slot.role === "proof") return "Results and their conditions";
  if (slot.role === "resources") return "Continue with the source material";
  if (choiceRoles.has(slot.role)) return "Choose the question to explore";
  return "What the workflow includes";
}

/**
 * Repairs only deterministic build copy, before provider work and the unchanged
 * factuality editor. Complete cited statements are never truncated into claims.
 */
export function repairBuildFallbacks(input: {
  plan: BuildExperiencePlan;
  artifacts: readonly SectionWriterArtifact[];
  slots: readonly SectionWriterSlot[];
  evidence: readonly SectionEvidenceClaim[];
  targetName?: string;
  sellerName?: string;
}): readonly SectionWriterArtifact[] {
  const evidence = new Map(input.evidence.filter((claim) => claim.revision === input.plan.revision && safe(claim.text))
    .map((claim) => [claim.id, claim]));
  const slots = new Map(input.slots.map((slot) => [slot.id, slot]));
  const useCounts = new Map<string, number>();
  const seenBodies = new Set<string>();
  const repaired = new Map<string, SectionCopyCandidate>();
  const claimScope = new Map((input.plan.claims ?? []).map((claim) => [claim.id, claim.scope]));
  const original = new Map(input.artifacts.flatMap((artifact) => artifact.value ?? []).map((section) => [section.sectionId, section]));
  for (const planned of input.plan.sections) {
    const slot = slots.get(planned.id);
    const current = original.get(planned.id);
    if (!slot || !current || slot.role === "next-action" || slot.role === "seller-validation") continue;
    const allowed = new Set(planned.claimRefs);
    const claims = [...allowed].flatMap((id) => evidence.has(id) ? [evidence.get(id)!] : [])
      .sort((a, b) => {
        // Keep a scarce working detail for the explanation below the opening.
        const scopeRank = (id: string) =>
          slot.role === "hero" && claimScope.get(id) === "offer" ? 0 : 1;
        return scopeRank(a.id) - scopeRank(b.id) || (useCounts.get(a.id) ?? 0) - (useCounts.get(b.id) ?? 0) || a.id.localeCompare(b.id);
      });
    const omit = (): SectionCopyCandidate => ({ sectionId: slot.id, role: slot.role, ...copyContractMetadata(slot),
      status: "omitted", evidenceRefs: [], wordCount: 0,
      omissionReason: planned.optional ? "unsupported_optional_slot" : "no_current_evidence" });
    if (!claims.length && (planned.optional || slot.claimType === "fact" || current.evidenceRefs.some((id) => !allowed.has(id)))) {
      repaired.set(planned.id, omit());
      continue;
    }
    const bodyKey = normalized(current.body ?? "").toLowerCase();
    const hasDetail = hasSubstantiveEvidenceUse(current.body ?? "", claims, input.plan.buyer.product.label);
    const sharedExplanation = slot.role === "hero" || slot.role === "mechanism" || choiceRoles.has(slot.role);
    const missingAccountFrame = slot.family === "align" && input.targetName &&
      !`${current.headline} ${current.body}`.toLowerCase().includes(input.targetName.toLowerCase());
    const needsRepair = sharedExplanation || missingAccountFrame || current.status === "omitted" || !hasDetail || isValidationOnlyCopy(current.body ?? "") ||
      seenBodies.has(bodyKey) || current.evidenceRefs.some((id) => !allowed.has(id)) ||
      current.wordCount > slot.wordBudget.max;
    if (!needsRepair || !claims.length) {
      if (current.status === "complete") seenBodies.add(bodyKey);
      current.evidenceRefs.forEach((id) => useCounts.set(id, (useCounts.get(id) ?? 0) + 1));
      continue;
    }
    const offer = input.plan.buyer.product.label ?? "The offer";
    const headline = slot.role === "hero" && current.headline && count(current.headline) <= (slot.headlineWordBudget?.max ?? 12)
      ? current.headline : input.plan.buyer.offerKind === "event" && slot.role === "mechanism" ? "Inside the session"
      : input.plan.buyer.offerKind === "content" && slot.role === "mechanism" ? "The idea in practice" : heading(slot, offer);
    const candidates: SectionCopyCandidate[] = [];
    const context = slot.family === "align" && input.targetName && slot.v2Role !== "account-relevance"
      ? `For ${input.targetName}: ` : "";
    if (choiceRoles.has(slot.role)) {
      // Put the source detail inside the choices, rather than repeating the
      // mechanism paragraph above another set of generic evaluation questions.
      const body = `${context}What should ${input.sellerName ?? "the seller"} demonstrate about ${offer} for your first evaluation?`;
      // A decision surface may cite one detail that has not yet been
      // explained. Once every detail is on the page, retain three useful
      // questions rather than duplicate a capability paragraph.
      const unexplained = claims.filter((claim) => !(useCounts.get(claim.id) ?? 0));
      for (const size of [unexplained.length ? 1 : 0]) {
        const selected = unexplained.slice(0, size);
        const choices: SectionCopyChoice[] = selected.map((claim, index) => ({
          label: index === 0 ? "The working detail" : "The review sequence",
          body: normalized(claim.text), evidenceRefs: [claim.id]
        }));
        const questions = [
          { label: "Your requirements", body: "Which documented requirements should the team confirm before selecting the first workflow?", evidenceRefs: [] },
          { label: "Your next decision", body: "Which decision owner should agree on the validation sequence before the working session?", evidenceRefs: [] },
          { label: "Your operating context", body: "Which operating constraint should shape the first evaluation conversation?", evidenceRefs: [] }
        ];
        choices.push(...questions.slice(0, 3 - choices.length));
        const candidate: SectionCopyCandidate = { sectionId: slot.id, role: slot.role, ...copyContractMetadata(slot),
          status: "complete", headline, body, choices: choices as unknown as SectionCopyCandidate["choices"],
          evidenceRefs: selected.map(({ id }) => id), wordCount: 0 };
        candidate.wordCount = sectionCopyWordCount(candidate);
        if (candidate.wordCount <= slot.wordBudget.max) { candidates.push(candidate); break; }
      }
    }
    for (const claim of claims) {
      if (choiceRoles.has(slot.role)) break;
      const text = normalized(claim.text);
      const relevanceQuestion = slot.v2Role === "account-relevance" && input.sellerName
        ? ` What should ${input.sellerName} demonstrate for this priority?` : "";
      const body = `${context}${text}${/[.!?]$/.test(text) ? "" : "."}${relevanceQuestion}`;
      const candidate: SectionCopyCandidate = {
        sectionId: slot.id, role: slot.role, ...copyContractMetadata(slot), status: "complete",
        headline, body,
        ...(current.cta ? { cta: current.cta } : {}), evidenceRefs: [claim.id], wordCount: 0
      };
      candidate.wordCount = sectionCopyWordCount(candidate);
      if (candidate.wordCount <= slot.wordBudget.max) candidates.push(candidate);
    }
    const next = candidates.find((candidate) => !seenBodies.has(normalized(candidate.body ?? "").toLowerCase()));
    if (next) {
      repaired.set(planned.id, next);
      seenBodies.add(normalized(next.body ?? "").toLowerCase());
      next.evidenceRefs.forEach((id) => useCounts.set(id, (useCounts.get(id) ?? 0) + 1));
    } else if (!choiceRoles.has(slot.role) || seenBodies.has(bodyKey) || current.evidenceRefs.some((id) => !allowed.has(id)) || current.status === "omitted" || !hasDetail) {
      // No permitted, fitting, unexplained claim remains. The original may
      // concatenate duplicate source entries, so it is not a safe backup.
      repaired.set(planned.id, omit());
    }
  }
  return input.artifacts.map((artifact) => artifact.value ? {
    ...artifact,
    value: artifact.value.map((section) => repaired.get(section.sectionId) ?? section),
    evidenceRefs: [...new Set(artifact.value.flatMap((section) => (repaired.get(section.sectionId) ?? section).evidenceRefs))]
  } : artifact);
}
