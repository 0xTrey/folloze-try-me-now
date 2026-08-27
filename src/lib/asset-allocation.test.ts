import { describe, expect, it } from "vitest";

import {
  allocateExperienceAssets,
  assetDuplicateKey,
  rejectAssetCandidate,
  substantiveAssetsAreUnique,
  type AssetCandidateInput,
  type AssetSlotRequest
} from "@/lib/asset-allocation";

const hashSourceUrl = (assetRef: string) => `sh_${assetRef.length.toString(16).padStart(20, "0")}`;

function candidate(
  overrides: Partial<AssetCandidateInput> & Pick<AssetCandidateInput, "assetRef" | "purpose">
): AssetCandidateInput {
  return {
    evidenceRef: `evidence:${overrides.assetRef}`,
    sourceAuthority: "seller_official",
    width: 1200,
    height: 800,
    renderStatus: "verified",
    confidence: 0.8,
    ...overrides
  };
}

function slot(
  sectionId: string,
  semanticRole: AssetSlotRequest["semanticRole"],
  slotContext?: string
): AssetSlotRequest {
  return { sectionId, semanticRole, ...(slotContext ? { slotContext } : {}) };
}

describe("asset eligibility", () => {
  it.each([
    ["data uri", "data:image/png;base64,iVBORw0KGgo=", "data_uri"],
    ["javascript url", "javascript:alert(1)", "javascript_url"],
    ["plain http", "http://cdn.example.com/a.png", "not_https"],
    ["private host", "https://192.168.1.4/a.png", "private_host"],
    ["loopback host", "https://localhost/a.png", "private_host"],
    ["malformed url", "not-a-url", "unsafe_url"]
  ])("rejects a %s", (_label, assetRef, code) => {
    expect(rejectAssetCandidate(candidate({ assetRef, purpose: "product" }))).toBe(code);
  });

  it("rejects an image that failed to render", () => {
    expect(
      rejectAssetCandidate(
        candidate({
          assetRef: "https://cdn.example.com/broken.png",
          purpose: "product",
          renderStatus: "failed"
        })
      )
    ).toBe("render_failed");
  });

  it("rejects a tiny substantive image but keeps a small logo", () => {
    expect(
      rejectAssetCandidate(
        candidate({
          assetRef: "https://cdn.example.com/small.png",
          purpose: "product",
          width: 64,
          height: 64
        })
      )
    ).toBe("too_small");
    expect(
      rejectAssetCandidate(
        candidate({
          assetRef: "https://cdn.example.com/logo.svg",
          purpose: "logo",
          width: 120,
          height: 32
        })
      )
    ).toBeUndefined();
  });

  it("rejects navigation, icon, and tracking assets", () => {
    expect(
      rejectAssetCandidate(
        candidate({
          assetRef: "https://cdn.example.com/nav-chevron.svg",
          purpose: "supporting"
        })
      )
    ).toBe("icon_or_navigation");
    expect(
      rejectAssetCandidate(
        candidate({
          assetRef: "https://cdn.example.com/tracking-pixel.gif",
          purpose: "supporting"
        })
      )
    ).toBe("tracking_pixel");
  });

  it("rejects a third-party asset and an extreme aspect ratio", () => {
    expect(
      rejectAssetCandidate(
        candidate({
          assetRef: "https://cdn.other.example/a.png",
          purpose: "product",
          sourceAuthority: "third_party"
        })
      )
    ).toBe("role_mismatch");
    expect(
      rejectAssetCandidate(
        candidate({
          assetRef: "https://cdn.example.com/strip.png",
          purpose: "product",
          width: 3600,
          height: 200
        })
      )
    ).toBe("extreme_aspect_ratio");
  });

  it("collapses responsive crops of one source onto a single key", () => {
    const base = assetDuplicateKey(
      candidate({ assetRef: "https://cdn.example.com/media/console.png", purpose: "product" })
    );

    expect(
      assetDuplicateKey(
        candidate({
          assetRef: "https://cdn.example.com/media/console-1200x800.png",
          purpose: "product"
        })
      )
    ).toBe(base);
    expect(
      assetDuplicateKey(
        candidate({
          assetRef: "https://cdn.example.com/media/console-thumb.png",
          purpose: "product"
        })
      )
    ).toBe(base);
  });
});

describe("global allocation", () => {
  it("never places a substantive image in more than one slot", () => {
    const plan = allocateExperienceAssets({
      candidates: [
        candidate({ assetRef: "https://cdn.example.com/console.png", purpose: "product" })
      ],
      slots: [
        slot("hero", "hero"),
        slot("mechanism", "product"),
        slot("proof", "proof"),
        slot("close", "supporting")
      ],
      hashSourceUrl
    });

    expect(plan.allocations).toHaveLength(1);
    expect(substantiveAssetsAreUnique(plan)).toBe(true);
    expect(plan.treatments).toHaveLength(3);
    expect(plan.treatments.every(({ treatment }) => treatment === "designed_non_image")).toBe(
      true
    );
  });

  it("uses a designed non-image treatment instead of duplicating imagery", () => {
    const plan = allocateExperienceAssets({
      candidates: [],
      slots: [slot("hero", "hero"), slot("proof", "proof")],
      hashSourceUrl
    });

    expect(plan.allocations).toHaveLength(0);
    expect(plan.treatments.map(({ reason }) => reason)).toEqual([
      "no_credible_asset_available",
      "no_credible_asset_available"
    ]);
  });

  it("spreads distinct assets across distinct slots", () => {
    const plan = allocateExperienceAssets({
      candidates: [
        candidate({
          assetRef: "https://cdn.example.com/dashboard.png",
          purpose: "product",
          altText: "Dispatch dashboard interface"
        }),
        candidate({
          assetRef: "https://cdn.example.com/crew.jpg",
          purpose: "people",
          altText: "Field crew team portrait"
        }),
        candidate({
          assetRef: "https://cdn.example.com/workflow.svg",
          purpose: "process",
          altText: "Integration workflow diagram"
        })
      ],
      slots: [slot("s1", "product"), slot("s2", "people"), slot("s3", "process")],
      hashSourceUrl
    });

    expect(plan.allocations).toHaveLength(3);
    expect(new Set(plan.allocations.map(({ assetRef }) => assetRef)).size).toBe(3);
    expect(substantiveAssetsAreUnique(plan)).toBe(true);
    expect(
      plan.allocations.find(({ sectionId }) => sectionId === "s1")?.assetRef
    ).toContain("dashboard");
    expect(
      plan.allocations.find(({ sectionId }) => sectionId === "s2")?.assetRef
    ).toContain("crew");
  });

  it("allows a logo to repeat across slots", () => {
    const plan = allocateExperienceAssets({
      candidates: [
        candidate({
          assetRef: "https://cdn.example.com/logo.svg",
          purpose: "logo",
          width: 200,
          height: 48
        })
      ],
      slots: [slot("nav", "logo"), slot("footer", "logo")],
      hashSourceUrl
    });

    expect(plan.allocations).toHaveLength(2);
    expect(plan.reusableCount).toBe(2);
    expect(plan.substantiveCount).toBe(0);
    expect(substantiveAssetsAreUnique(plan)).toBe(true);
  });

  it("allows an explicitly decorative motif to repeat", () => {
    const plan = allocateExperienceAssets({
      candidates: [
        candidate({
          assetRef: "https://cdn.example.com/pattern.svg",
          purpose: "decorative",
          decorative: true,
          width: 800,
          height: 800
        })
      ],
      slots: [slot("a", "decorative"), slot("b", "decorative")],
      hashSourceUrl
    });

    expect(plan.allocations).toHaveLength(2);
    expect(plan.reusableCount).toBe(2);
  });

  it("drops a duplicate crop before allocation", () => {
    const plan = allocateExperienceAssets({
      candidates: [
        candidate({ assetRef: "https://cdn.example.com/media/hero.png", purpose: "product" }),
        candidate({
          assetRef: "https://cdn.example.com/media/hero-1200x800.png",
          purpose: "product"
        })
      ],
      slots: [slot("s1", "product"), slot("s2", "supporting")],
      hashSourceUrl
    });

    expect(plan.rejections).toContainEqual({
      assetRef: "https://cdn.example.com/media/hero-1200x800.png",
      code: "duplicate_crop"
    });
    expect(plan.allocations).toHaveLength(1);
  });

  it("records a hashed source url rather than the raw asset url", () => {
    const plan = allocateExperienceAssets({
      candidates: [
        candidate({ assetRef: "https://cdn.example.com/console.png", purpose: "product" })
      ],
      slots: [slot("s1", "product")],
      hashSourceUrl
    });

    expect(plan.allocations[0]?.sourceUrlHash).toMatch(/^sh_[a-f0-9]{20}$/);
    expect(plan.allocations[0]?.sourceUrlHash).not.toContain("cdn.example.com");
  });

  it("is deterministic for the same inputs", () => {
    const input = {
      candidates: [
        candidate({ assetRef: "https://cdn.example.com/a.png", purpose: "product" }),
        candidate({ assetRef: "https://cdn.example.com/b.png", purpose: "proof" })
      ],
      slots: [slot("s1", "product"), slot("s2", "proof")],
      hashSourceUrl
    };

    expect(allocateExperienceAssets(input)).toEqual(allocateExperienceAssets(input));
  });
});
