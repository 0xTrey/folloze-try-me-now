import { evaluateBrandFidelity, type BrandFidelityReport } from "@/lib/brand-fidelity-evaluator";
import type { BrandSystemV2 } from "@/lib/brand-system";
import type { BuildExperiencePlan } from "./build-experience-plan";
import { compilerDigest } from "./compiler-digest";
import { containsBannedInternalPhrase, containsInternalNarration } from "./section-writing-contract";
import type { SectionCopyCandidate, SectionEvidenceClaim } from "./section-copy-types";

export const BUILD_QUALITY_POLICY_VERSION = "build-quality-policy-v1" as const;
const FILLER = /\b(?:best[- ]in[- ]class|industry[- ]leading|world[- ]class|seamless(?:ly)?|unlock (?:value|potential)|transform your business|drive transformation|innovative solutions?|holistic|synergies)\b/i;
const STOP = new Set("a an and are as at be by can company does for from have helps how in into is it of on or our product service solution support supports team teams that the their this to use using with work workflow workflows you your".split(" "));
const words = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").split(/\s+/).filter((word) => word.length >= 3 && !STOP.has(word));
const normalize = (text: string) => text.replace(/\s+/g, " ").trim().toLowerCase();
const BRAND_FIDELITY_BLOCKERS = new Set([
  "identity_name_missing",
  "canonical_domain_missing",
  "color_role_not_resolved",
  "ink_equals_surface",
  "font_role_unresolved",
  "geometry_value_invalid",
  "layout_role_unresolved",
  "substantive_asset_repeated",
  "body_text_below_wcag_aa",
  "action_color_below_ui_contrast"
]);
const FACTUAL_SAFETY_BLOCKERS = new Set([
  "factuality_failed",
  "unknown_evidence_ref",
  "evidence_outside_plan",
  "section_not_in_plan",
  "internal_narration"
]);
const BUYER_USEFULNESS_BLOCKERS = new Set([
  "all_sections_validation_only",
  "no_substantive_middle_explanation",
  "repeated_section_argument",
  "insufficient_specificity",
  "unsupported_choice_copy",
  "question_only_section_intro",
  "prohibited_eyebrow",
  "prohibited_em_dash"
]);

/** A usefulness check, not a replacement for the factuality/permission editor. */
export function hasSubstantiveEvidenceUse(text: string, evidence: readonly { text: string }[], offer = ""): boolean {
  const ignored = new Set(words(offer));
  const used = new Set(words(text).filter((word) => !ignored.has(word)));
  return evidence.some((claim) => {
    const anchors = [...new Set(words(claim.text).filter((word) => !ignored.has(word)))];
    if (anchors.length < 2) return false;
    if (normalize(text).includes(normalize(claim.text)) && normalize(claim.text).length >= 24) return true;
    const overlap = anchors.filter((word) => used.has(word)).length;
    return overlap >= 2 && overlap / Math.min(anchors.length, 10) >= 0.4;
  });
}

export function isValidationOnlyCopy(text: string): boolean {
  const sentences = text.match(/[^.!?]+[.!?]*/g)?.map((sentence) => sentence.trim()).filter(Boolean) ?? [];
  return sentences.length > 0 && sentences.every((sentence) => /\?$/.test(sentence) ||
    /^(?:ask|check|choose|compare|confirm|consider|decide|discuss|evaluate|identify|review|start with|use this|validate|verify)\b/i.test(sentence));
}

export interface BuildQualityReport {
  version: typeof BUILD_QUALITY_POLICY_VERSION;
  digest: string;
  accepted: boolean;
  dimensions: {
    factualSafety: "passed-existing-editor" | "failed";
    brandFidelity: "pass" | "limited" | "fail";
    buyerUsefulness: "pass" | "fail";
  };
  blockers: string[];
  warnings: string[];
  brandReport: BrandFidelityReport;
  sections: { id: string; substantive: boolean; validationOnly: boolean; issues: string[] }[];
  humanApproval: "not-performed";
}

export function evaluateBuildQuality(input: {
  plan: BuildExperiencePlan;
  brand: BrandSystemV2;
  sections: readonly SectionCopyCandidate[];
  evidence: readonly SectionEvidenceClaim[];
  factualityPassed: boolean;
}): BuildQualityReport {
  const byId = new Map(input.evidence.map((claim) => [claim.id, claim]));
  const planned = new Map(input.plan.sections.map((section) => [section.id, section]));
  const blockers: string[] = [];
  const warnings: string[] = [];
  if (!input.factualityPassed) blockers.push("factuality_failed");
  if (input.plan.readiness.offerFactCount === 0) blockers.push("offer_explanation_missing");
  const argumentsSeen = new Set<string>();
  const bodiesSeen = new Set(input.sections.filter((section) => section.role === "hero" && section.status === "complete")
    .map((section) => normalize(section.body ?? "")));
  const sections = input.sections.filter((section) => section.status === "complete").map((section) => {
    const assignment = planned.get(section.sectionId);
    const text = [section.body, ...(section.choices ?? []).flatMap((choice) => [choice.label, choice.body])].filter(Boolean).join(" ");
    const allText = `${section.headline ?? ""} ${text}`;
    const permitted = new Set(assignment?.claimRefs ?? []);
    const claims = section.evidenceRefs.flatMap((id) => {
      const claim = byId.get(id);
      return claim && permitted.has(id) ? [claim] : [];
    });
    const issues: string[] = [];
    if (containsBannedInternalPhrase(allText) || containsInternalNarration(allText)) issues.push("internal_narration");
    if (FILLER.test(allText)) issues.push("generic_vendor_language");
    if (section.eyebrow?.trim()) issues.push("prohibited_eyebrow");
    if (/\u2014/.test(allText)) issues.push("prohibited_em_dash");
    if (section.evidenceRefs.some((id) => !byId.has(id))) issues.push("unknown_evidence_ref");
    if (!assignment) {
      issues.push("section_not_in_plan");
    } else if (section.evidenceRefs.some((id) => !permitted.has(id))) {
      issues.push("evidence_outside_plan");
    }
    // An evidence-bearing paragraph cannot make unrelated question cards useful.
    // Evaluate each card against its own permitted evidence, not its siblings.
    if (section.choices?.some((choice) => {
      const ownClaims = choice.evidenceRefs.flatMap((id) => {
        const claim = byId.get(id);
        return claim && permitted.has(id) ? [claim] : [];
      });
      return !hasSubstantiveEvidenceUse(choice.body, ownClaims, input.plan.buyer.product.label);
    })) issues.push("unsupported_choice_copy");
    const introSentences = (section.body ?? "").match(/[^.!?]+[.!?]*/g)?.map((sentence) => sentence.trim()).filter(Boolean) ?? [];
    if (section.choices && introSentences.length && introSentences.every((sentence) => /\?$/.test(sentence))) {
      issues.push("question_only_section_intro");
    }
    const argumentKey = normalize(allText);
    const bodyKey = normalize(section.body ?? "");
    const sentenceKeys = (section.body ?? "").split(/(?<=[.!?])\s+/).map(normalize).filter((sentence) => sentence.length >= 48);
    if (new Set(sentenceKeys).size < sentenceKeys.length) issues.push("repeated_section_argument");
    if (section.role !== "hero" && section.role !== "next-action" && argumentKey.length >= 48) {
      if (argumentsSeen.has(argumentKey) || (bodyKey.length >= 48 && bodiesSeen.has(bodyKey))) issues.push("repeated_section_argument");
      argumentsSeen.add(argumentKey);
      bodiesSeen.add(bodyKey);
    }
    const substantive = hasSubstantiveEvidenceUse(text, claims, input.plan.buyer.product.label);
    const validationOnly = isValidationOnlyCopy(section.body ?? "");
    if (assignment?.evidenceMode === "supported-facts" && section.claimType === "fact" && !substantive &&
        !["next-action", "seller-validation", "resources"].includes(section.role)) issues.push("insufficient_specificity");
    for (const code of issues) {
      if (["unknown_evidence_ref", "evidence_outside_plan", "section_not_in_plan", "internal_narration", "prohibited_eyebrow", "prohibited_em_dash", "insufficient_specificity", "unsupported_choice_copy", "question_only_section_intro"].includes(code)) blockers.push(code);
      else warnings.push(code);
    }
    return { id: section.sectionId, substantive, validationOnly, issues };
  });
  const middle = sections.filter((section) => {
    const role = planned.get(section.id)?.role;
    return role && !["buyer-outcome", "shared-priority", "market-change", "next-move", "evaluation-close", "first-decision", "resource"].includes(role);
  });
  if (middle.length && !middle.some((section) => section.substantive && !section.validationOnly)) blockers.push("no_substantive_middle_explanation");
  if (sections.length && sections.every((section) => section.validationOnly)) {
    blockers.push("all_sections_validation_only");
  }
  if (sections.some((section) => section.issues.includes("repeated_section_argument"))) blockers.push("repeated_section_argument");
  const brandReport = evaluateBrandFidelity({ brand: input.brand, sections: input.sections,
    availableEvidenceRefs: input.evidence.map(({ id }) => id) });
  const brandBlocking = brandReport.violations.filter((code) => BRAND_FIDELITY_BLOCKERS.has(code));
  blockers.push(...brandBlocking);
  warnings.push(...brandReport.warnings, ...brandReport.violations.filter((code) => !brandBlocking.includes(code)));
  const uniqueBlockers = [...new Set(blockers)].sort();
  const uniqueWarnings = [...new Set(warnings)].sort();
  const dimensions: BuildQualityReport["dimensions"] = {
    factualSafety: !uniqueBlockers.some((code) => FACTUAL_SAFETY_BLOCKERS.has(code)) ? "passed-existing-editor" : "failed",
    brandFidelity: brandBlocking.length ? "fail" : brandReport.repairDimensions.length ? "limited" : "pass",
    buyerUsefulness: uniqueBlockers.some((code) => BUYER_USEFULNESS_BLOCKERS.has(code)) ? "fail" : "pass"
  };
  return { version: BUILD_QUALITY_POLICY_VERSION,
    digest: compilerDigest(BUILD_QUALITY_POLICY_VERSION, { plan: input.plan.digest, dimensions, sections, blockers: uniqueBlockers }),
    accepted: !uniqueBlockers.length, dimensions, blockers: uniqueBlockers, warnings: uniqueWarnings,
    brandReport, sections, humanApproval: "not-performed" };
}

/** Only bounded codes and counts leave the private report. */
export function buildQualityReceipt(report: BuildQualityReport) {
  return { version: report.version, digest: report.digest, accepted: report.accepted,
    factualSafety: report.dimensions.factualSafety, brandFidelity: report.dimensions.brandFidelity,
    buyerUsefulness: report.dimensions.buyerUsefulness, blockers: report.blockers.join(","),
    warnings: report.warnings.join(","), substantiveSections: report.sections.filter((section) => section.substantive).length,
    validationOnlySections: report.sections.filter((section) => section.validationOnly).length,
    humanApproval: report.humanApproval };
}
