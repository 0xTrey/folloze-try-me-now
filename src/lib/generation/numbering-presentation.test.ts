import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("presentation numbering", () => {
  it("uses unpadded visual numbers in the experience and wireframe gallery", () => {
    const template = readFileSync(new URL("./experience-template.ts", import.meta.url), "utf8");
    const gallery = readFileSync(new URL("../../../public/wireframes/index.html", import.meta.url), "utf8");
    const galleryStyles = readFileSync(new URL("../../../public/wireframes/styles.css", import.meta.url), "utf8");
    expect(template).toContain("<span>1 · The change</span>");
    expect(template).toContain("<span>2 · The consequence</span>");
    expect(template).toContain("<span>3 · The better path</span>");
    expect(gallery).toContain("<strong>1</strong>");
    expect(gallery).toContain("<strong>2</strong>");
    expect(gallery).toContain("<strong>3</strong>");
    expect(galleryStyles).toContain("counter(sections, decimal)");
    expect(galleryStyles).not.toContain("decimal-leading-zero");
  });
});
