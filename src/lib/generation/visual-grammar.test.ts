import { describe, expect, it } from "vitest";

import { wireframeLibrary } from "@/lib/generation/wireframe-library";
import {
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
});
