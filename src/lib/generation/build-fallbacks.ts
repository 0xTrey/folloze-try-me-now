import type { BuildExperiencePlan } from "./build-experience-plan";
import { hasSubstantiveEvidenceUse, isValidationOnlyCopy } from "./build-quality-policy";
import { evidenceChoiceCandidate } from "./evidence-choice-copy";
import { copyContractMetadata, sectionCopyWordCount, type SectionCopyCandidate, type SectionEvidenceClaim, type SectionWriterArtifact, type SectionWriterSlot } from "./section-copy-types";

const normalized = (value: string) => value.replace(/\s+/g, " ").trim();
const count = (value: string) => normalized(value).split(/\s+/).filter(Boolean).length;
const safe = (value: string) => !/<[^>]*>|```|\b(?:ignore|disregard)\b.{0,80}\b(?:instructions?|rules?)\b|system prompt|developer message|api key|password|secret token|\u2014/i.test(value);
const choiceRoles = new Set(["pathways", "agenda", "chapter-navigation", "decision-support"]);

function heading(slot: SectionWriterSlot, offer: string): string {
  const named = slot.role === "hero" ? offer : slot.role === "mechanism" ? `How ${offer} works` : "";
  if (named && count(named) <= (slot.headlineWordBudget?.max ?? 10)) return named;
  if (slot.v2Role === "evaluation-criteria") return "Capabilities that shape the decision";
  if (slot.v2Role === "account-relevance") return "The account's operating context";
  if (slot.v2Role === "current-friction" || slot.v2Role === "stakes") return "Where the work gets difficult";
  if (slot.v2Role === "validation-plan") return "Further details for your evaluation";
  if (slot.role === "proof") return "Results and their conditions";
  if (slot.role === "resources") return "Continue with the source material";
  if (choiceRoles.has(slot.role)) return "Capabilities and their scope";
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
    const sharedExplanation = slot.role === "hero" || slot.role === "mechanism" ||
      slot.v2Role === "account-relevance" || choiceRoles.has(slot.role);
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
      : input.plan.buyer.offerKind === "content" && slot.role === "mechanism" ? "The idea in practice"
      : slot.v2Role === "priority-paths" && input.targetName ? `Priorities for ${input.targetName}` : heading(slot, offer);
    const candidates: SectionCopyCandidate[] = [];
    const context = slot.family === "align" && input.targetName && slot.v2Role !== "account-relevance"
      ? `For ${input.targetName}: ` : "";
    if (choiceRoles.has(slot.role)) {
      const unexplained = claims.filter((claim) => !(useCounts.get(claim.id) ?? 0));
      const reserved = new Set<string>();
      const later = input.plan.sections.slice(input.plan.sections.indexOf(planned) + 1);
      for (const next of later) {
        const nextSlot = slots.get(next.id);
        if (next.optional || !nextSlot || ["next-action", "seller-validation"].includes(nextSlot.role)) continue;
        const detail = unexplained.find((claim) => next.claimRefs.includes(claim.id) && !reserved.has(claim.id));
        if (detail) reserved.add(detail.id);
      }
      const candidate = evidenceChoiceCandidate({ slot, claims: unexplained.filter(({ id }) => !reserved.has(id)), headline });
      if (candidate) candidates.push(candidate);
    }
    for (const claim of claims) {
      if (choiceRoles.has(slot.role)) break;
      const text = normalized(claim.text);
      const relevanceQuestion = slot.v2Role === "account-relevance" && input.sellerName
        ? ` What should ${input.sellerName} demonstrate for this priority?` : "";
      const body = `${context}${text}${/[.!?]$/.test(text) ? "" : "."}${relevanceQuestion}`;
      const candidate: SectionCopyCandidate = {
        sectionId: slot.id, role: slot.role, ...copyContractMetadata(slot), status: "complete",
        headline: slot.role === "hero" && normalized(headline).replace(/[.!?]+$/, "").toLowerCase() === text.replace(/[.!?]+$/, "").toLowerCase()
          ? offer : slot.v2Role === "validation-plan" && claim.sourceSectionTitle && safe(claim.sourceSectionTitle) &&
          !claim.sourceSectionTitle.includes("?") &&
          count(claim.sourceSectionTitle) <= (slot.headlineWordBudget?.max ?? 10) ? claim.sourceSectionTitle : headline, body,
        ...(current.cta ? { cta: current.cta } : {}), evidenceRefs: [claim.id], wordCount: 0
      };
      candidate.wordCount = sectionCopyWordCount(candidate);
      if (candidate.wordCount <= slot.wordBudget.max) candidates.push(candidate);
    }
    const next = candidates.find((candidate) => !candidate.body || !seenBodies.has(normalized(candidate.body).toLowerCase()));
    if (next) {
      repaired.set(planned.id, next);
      if (next.body) seenBodies.add(normalized(next.body).toLowerCase());
      next.evidenceRefs.forEach((id) => useCounts.set(id, (useCounts.get(id) ?? 0) + 1));
    } else {
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
