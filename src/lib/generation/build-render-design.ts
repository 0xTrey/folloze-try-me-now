import type { BuildExperiencePlan } from "./build-experience-plan";
import { compilerDigest } from "./compiler-digest";
import type { SectionCopyCandidate } from "./section-copy-types";
import type { VisualRoleV2 } from "./three-family-contract";

export const BUILD_RENDER_DESIGN_VERSION = "build-render-design-v1" as const;

export type RenderDesignTarget =
  | "hero"
  | "context"
  | "mechanism"
  | "proof"
  | "paths"
  | "resources"
  | "close";

export interface BuildRenderDesign {
  version: typeof BUILD_RENDER_DESIGN_VERSION;
  digest: string;
  artDirection: "type-led" | "editorial" | "product-led" | "evidence-led";
  density: "open" | "balanced" | "dense" | "unknown";
  sections: readonly {
    id: string;
    target: RenderDesignTarget;
    visualRole: VisualRoleV2;
    occupancy: { headline: readonly [number, number]; body: readonly [number, number] };
    mobileIntent:
      | "copy-first-stack-visual-second"
      | "evidence-first"
      | "steps-in-source-order"
      | "choices-after-context"
      | "context-before-action"
      | "criteria-in-reading-order"
      | "scenario-in-reading-order"
      | "observations-in-reading-order";
  }[];
}

function targetFor(role: BuildExperiencePlan["sections"][number]["role"]): RenderDesignTarget {
  if (["buyer-outcome", "shared-priority", "market-change"].includes(role)) return "hero";
  if (["current-friction", "stakes", "account-relevance"].includes(role)) return "context";
  if (["mechanism", "solution-mapping"].includes(role)) return "mechanism";
  if (["proof", "proof-depth"].includes(role)) return "proof";
  if (role === "resource") return "resources";
  if (["next-move", "evaluation-close", "first-decision", "validation-plan"].includes(role)) return "close";
  return "paths";
}

const safeId = (value: string) => /^[a-z][a-z0-9-]{0,63}$/.test(value);

/**
 * Public projection for the HTML renderer. It deliberately excludes copied
 * prose, source URLs, evidence references, audience data, and CTA data.
 */
export function buildRenderDesign(
  plan: BuildExperiencePlan,
  retainedSections: readonly SectionCopyCandidate[]
): BuildRenderDesign {
  const retainedIds = new Set(
    retainedSections
      .filter((section) => section.status === "complete")
      .map((section) => section.sectionId)
  );
  const sections = plan.sections
    .filter((section) => retainedIds.has(section.id) && safeId(section.id))
    .map((section) => ({
      id: section.id,
      target: targetFor(section.role),
      visualRole: section.design.visual.role,
      occupancy: {
        headline: [...section.design.visual.occupancy.headline] as readonly [number, number],
        body: [...section.design.visual.occupancy.body] as readonly [number, number]
      },
      mobileIntent: section.design.visual.mobileIntent
    }));
  return {
    version: BUILD_RENDER_DESIGN_VERSION,
    digest: compilerDigest(BUILD_RENDER_DESIGN_VERSION, {
      plan: plan.digest,
      artDirection: plan.brandKit.artDirection.treatment,
      density: plan.brandKit.visual.density,
      sections
    }),
    artDirection: plan.brandKit.artDirection.treatment,
    density: plan.brandKit.visual.density,
    sections
  };
}
