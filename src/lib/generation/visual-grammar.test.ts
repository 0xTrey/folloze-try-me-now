import { describe, expect, it } from "vitest";

import { wireframeLibrary } from "@/lib/generation/wireframe-library";
import {
  MODEL_CONSTRAINED_CONTENT_SLOTS,
  rejectInventedGeometry,
  visualGrammarByArchetype,
  visualGrammarForArchetype,
  visualGrammarIds
} from "@/lib/generation/visual-grammar";

describe("visual grammar", () => {
  it("gives every archetype an explicit bounded grammar", () => {
    expect(Object.keys(visualGrammarByArchetype)).toHaveLength(17);
    expect(new Set(wireframeLibrary.map((item) => visualGrammarForArchetype(item.id).id))).toEqual(
      new Set(visualGrammarIds)
    );
    for (const archetype of wireframeLibrary) {
      const resolved = visualGrammarForArchetype(archetype.id);
      expect(resolved.allowHeroReuse).toBe(false);
      expect(resolved.modelMayInventGeometry).toBe(false);
      expect(resolved.constrainedContentSlots).toEqual([...MODEL_CONSTRAINED_CONTENT_SLOTS]);
      expect(resolved.motionProfile).toMatch(/quiet|guided|demonstrative/);
      expect(resolved.noAssetTreatment).toMatch(/editorial|proof|choice|system|data|chapter/);
    }
  });

  it("keeps content visual direction inside its source-preserving family", () => {
    for (const contentArchetype of wireframeLibrary.filter(({ family }) => family === "content")) {
      expect(contentArchetype.contentPolicy).toBe("source-preserving");
      expect(visualGrammarForArchetype(contentArchetype.id).heroMediaRole).toBeDefined();
    }
  });

  it("rejects invented geometry while preserving the selected reviewed grammar", () => {
    expect(rejectInventedGeometry("editorial-split", "workflow-spine")).toEqual({
      grammarId: "editorial-split",
      inventedGeometryRejected: true
    });
    expect(rejectInventedGeometry("editorial-split", "made-up-layout")).toEqual({
      grammarId: "editorial-split",
      inventedGeometryRejected: true
    });
    expect(rejectInventedGeometry("data-story", "data-story")).toEqual({
      grammarId: "data-story",
      inventedGeometryRejected: false
    });
  });
});
