import { describe, expect, it } from "vitest";

import { buildSimulatedEngagement, rolesForAudience } from "@/lib/simulated-engagement";

describe("simulated engagement proof", () => {
  it("is deterministic per session and always marked as example data", () => {
    const first = buildSimulatedEngagement({ sessionId: "session-123", audienceLabel: "Enterprise architects" });
    const second = buildSimulatedEngagement({ sessionId: "session-123", audienceLabel: "Enterprise architects" });

    expect(first).toEqual(second);
    expect(first).toHaveLength(3);
    expect(first.every((signal) => signal.isExample)).toBe(true);
    expect(first.map((signal) => signal.actorLabel)).toEqual(["John Smith", "Sarah Chen", "Michael Torres"]);
  });

  it("derives role titles from the selected audience", () => {
    expect(rolesForAudience("Demand generation and campaign leaders")).toEqual([
      "VP Marketing",
      "Director of Demand Generation",
      "Revenue Operations Lead"
    ]);
    expect(rolesForAudience("Security architecture and risk leaders")[0]).toBe(
      "Chief Information Security Officer"
    );
  });

  it("varies stable depth details across sessions without changing the story shape", () => {
    const first = buildSimulatedEngagement({ sessionId: "alpha", audienceLabel: "Data platform leaders" });
    const second = buildSimulatedEngagement({ sessionId: "bravo", audienceLabel: "Data platform leaders" });

    expect(first[0].label).not.toBe(second[0].label);
    expect(first.map((signal) => signal.type)).toEqual(["view", "choice", "cta"]);
    expect(second.map((signal) => signal.roleLabel)).toEqual(first.map((signal) => signal.roleLabel));
  });
});

