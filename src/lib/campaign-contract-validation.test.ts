import { describe, expect, it } from "vitest";

import { answersSchema, sessionWorkspacePatchSchema } from "@/lib/validation";

describe("campaign contract validation", () => {
  it("accepts a promoted offer and safe public offer source", () => {
    expect(
      answersSchema.parse({
        promotedOffer: "Jitterbit Harmony",
        offerSourceUrl: "https://jitterbit.com/harmony/",
        offerSourceTitle: "Jitterbit Harmony"
      })
    ).toEqual({
      promotedOffer: "Jitterbit Harmony",
      offerSourceUrl: "https://jitterbit.com/harmony/",
      offerSourceTitle: "Jitterbit Harmony"
    });
  });

  it("rejects unsafe offer URLs and unbounded section composition", () => {
    expect(() =>
      answersSchema.parse({
        promotedOffer: "Unsafe",
        offerSourceUrl: "http://localhost:3000/private"
      })
    ).toThrow("public HTTPS");

    expect(() =>
      sessionWorkspacePatchSchema.parse({
        operation: "update-workspace",
        curatedSections: [
          {
            id: "section_same",
            family: "faq",
            position: 2,
            visible: true,
            locked: false
          },
          {
            id: "section_same",
            family: "proof",
            position: 3,
            visible: true,
            locked: false
          }
        ]
      })
    ).toThrow("unique");
  });

  it("accepts an explicit offer confirmation and curated section plan", () => {
    expect(
      sessionWorkspacePatchSchema.parse({
        operation: "update-workspace",
        offerSourceConfirmation: "confirmed",
        curatedSections: [
          {
            id: "section_faq",
            family: "faq",
            position: 3,
            visible: true,
            locked: true,
            instruction: "Address the three architecture objections."
          }
        ]
      })
    ).toMatchObject({
      offerSourceConfirmation: "confirmed",
      curatedSections: [{ family: "faq", locked: true }]
    });
  });
});
