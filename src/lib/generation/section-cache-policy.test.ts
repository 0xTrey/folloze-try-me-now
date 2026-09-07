import { describe, expect, it } from "vitest";
import { sectionCacheKey } from "./section-cache-policy";

const contract = { sessionId: "private-session" } as never;
const base = { sectionId: "section-a", revision: 4, evidence: [{ id: "e1", text: "supported", revision: 4 }], nested: { revision: 4 } };

describe("section cache policy", () => {
  it("ignores revision and slot identity metadata, including nested evidence revisions", () => {
    const args = { contract, model: "model", schemaVersion: "schema", instructions: "write", requestInput: JSON.stringify(base) };
    const changed = { ...base, sectionId: "section-b", revision: 5, evidence: [{ id: "e1", text: "supported", revision: 5 }], nested: { revision: 5 } };
    expect(sectionCacheKey(args)).toBe(sectionCacheKey({ ...args, requestInput: JSON.stringify(changed) }));
  });

  it("does not produce a reusable key for malformed input", () => {
    expect(sectionCacheKey({ contract, model: "model", schemaVersion: "schema", instructions: "write", requestInput: "{" })).toBeUndefined();
  });
});
