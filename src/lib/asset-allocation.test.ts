import { describe, expect, it } from "vitest";

import {
  allocateExperienceAssets,
  assetDuplicateKey,
  rejectAssetCandidate,
  substantiveAssetsAreUnique,
  toAssetRenderPlan,
  withDeliberateDuplicateAllocation,
  type AssetCandidateInput,
  type AssetSlotRequest
} from "@/lib/asset-allocation";
import {
  brandProfileToBrandSystemEvidence,
  resolveAssetCandidateDuplicateKey
} from "@/lib/brand-system";
import type { BrandProfile } from "@/lib/types";

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

describe("duplicate-group ranking", () => {
  const crops = [
    candidate({
      assetRef: "https://cdn.example.com/media/console-thumb.png",
      purpose: "product",
      width: 640,
      height: 420,
      confidence: 0.4
    }),
    candidate({
      assetRef: "https://cdn.example.com/media/console.png",
      purpose: "product",
      width: 2400,
      height: 1600,
      altText: "The scheduling console during a shift handover",
      confidence: 0.9
    })
  ];

  it.each([
    ["strongest first", crops],
    ["strongest last", [...crops].reverse()]
  ])("keeps the same representative when candidates arrive %s", (_label, candidates) => {
    const plan = allocateExperienceAssets({
      candidates,
      slots: [slot("s1", "product")],
      hashSourceUrl
    });

    expect(plan.allocations).toHaveLength(1);
    expect(plan.allocations[0]?.assetRef).toBe("https://cdn.example.com/media/console.png");
    expect(plan.rejections).toContainEqual({
      assetRef: "https://cdn.example.com/media/console-thumb.png",
      code: "duplicate_crop"
    });
  });

  it("produces an identical plan whatever order the whole candidate set arrives in", () => {
    const candidates = [
      candidate({ assetRef: "https://cdn.example.com/a-console.png", purpose: "product" }),
      candidate({ assetRef: "https://cdn.example.com/b-workflow.png", purpose: "process" }),
      candidate({ assetRef: "https://cdn.example.com/c-customer.png", purpose: "proof" })
    ];
    const slots = [slot("s1", "product"), slot("s2", "process"), slot("s3", "proof")];

    const forward = allocateExperienceAssets({ candidates, slots, hashSourceUrl });
    const reversed = allocateExperienceAssets({
      candidates: [...candidates].reverse(),
      slots,
      hashSourceUrl
    });

    expect(reversed.allocations).toEqual(forward.allocations);
  });
});

const ADVISORY_ASSET_ORIGIN = "https://cdn.advisory-fixture.test";
const AUDIO_PRODUCT_ORIGIN = "https://cdn.audio-product-fixture.test";

describe("advisory and product-suite allocation fixtures", () => {
  it("spreads distinct advisory imagery across hero and tab slots without reuse", () => {
    const plan = allocateExperienceAssets({
      candidates: [
        candidate({
          assetRef: `${ADVISORY_ASSET_ORIGIN}/cfo-advisory-dashboard.png`,
          purpose: "hero",
          altText: "CFO advisory dashboard"
        }),
        candidate({
          assetRef: `${ADVISORY_ASSET_ORIGIN}/erp-selection-workflow.png`,
          purpose: "product",
          altText: "ERP system selection workflow"
        }),
        candidate({
          assetRef: `${ADVISORY_ASSET_ORIGIN}/client-accounting-team.jpg`,
          purpose: "people",
          altText: "Client accounting team portrait"
        }),
        candidate({
          assetRef: `${ADVISORY_ASSET_ORIGIN}/advisory-services-outcomes.png`,
          purpose: "proof",
          altText: "Advisory services outcomes"
        })
      ],
      slots: [
        { sectionId: "hero", semanticRole: "hero", required: true },
        slot("lens-0", "supporting", "CFO advisory path"),
        slot("lens-1", "product", "ERP selection path"),
        slot("lens-2", "process", "Client accounting workflow")
      ],
      hashSourceUrl
    });

    expect(plan.allocations).toHaveLength(4);
    expect(substantiveAssetsAreUnique(plan)).toBe(true);
    expect(new Set(plan.allocations.map(({ sourceIdentityKey }) => sourceIdentityKey)).size).toBe(4);
    expect(plan.allocations.map(({ sectionId }) => sectionId)).toEqual([
      "hero",
      "lens-0",
      "lens-1",
      "lens-2"
    ]);
  });

  it("derives duplicateKey for transformed URL crops and rejects allocator reuse", () => {
    const origin = "https://cdn.jabra-product-fixture.test";
    const heroRef = `${origin}/evolve2-65-ms-teams-black.png`;
    const desktopRef = `${origin}/evolve2-65-ms-teams-black-desktop.png`;
    const wirelessRef = `${origin}/evolve2-55-wireless.png`;
    const heroKey = resolveAssetCandidateDuplicateKey({
      ref: heroRef,
      kind: "product-ui",
      width: 1200,
      height: 800
    });
    const desktopKey = resolveAssetCandidateDuplicateKey({
      ref: desktopRef,
      kind: "product-ui",
      width: 2400,
      height: 1600
    });
    expect(desktopKey).toBe(heroKey);
    expect(
      resolveAssetCandidateDuplicateKey({
        ref: wirelessRef,
        kind: "product-ui"
      })
    ).not.toBe(heroKey);

    const harvestProfile: BrandProfile = {
      domain: "jabra.com",
      companyName: "Jabra",
      publicTopics: ["Evolve2 75", "Panacast 50"],
      imageUrls: [heroRef, desktopRef, wirelessRef],
      imageMetadata: {
        [heroRef]: {
          width: 1200,
          height: 800,
          contentHash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        },
        [desktopRef]: {
          width: 2400,
          height: 1600,
          contentHash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        }
      },
      colors: ["#000000", "#FFFFFF"],
      primaryColor: "#000000",
      accentColor: "#FFB500",
      surfaceColor: "#FFFFFF",
      sourceUrl: "https://www.jabra.com/",
      source: "brand-harvester"
    };
    const evidence = brandProfileToBrandSystemEvidence(harvestProfile, {
      revision: 1,
      observedAt: "2026-08-28T00:00:00.000Z"
    });
    const compiledKeys = (evidence.imagery?.candidates ?? []).map(
      (entry) => entry.value.duplicateKey
    );
    expect(compiledKeys[0]).toBe("content:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    expect(compiledKeys[1]).toBe(compiledKeys[0]);

    const plan = allocateExperienceAssets({
      candidates: [
        candidate({
          assetRef: heroRef,
          purpose: "hero",
          duplicateKey: heroKey,
          width: 1200,
          height: 800
        }),
        candidate({
          assetRef: desktopRef,
          purpose: "product",
          duplicateKey: desktopKey,
          width: 2400,
          height: 1600
        }),
        candidate({
          assetRef: wirelessRef,
          purpose: "product",
          width: 1200,
          height: 800
        }),
        candidate({
          assetRef: `${origin}/office-headset-workflow.jpg`,
          purpose: "process",
          width: 1200,
          height: 800
        })
      ],
      slots: [
        { sectionId: "hero", semanticRole: "hero", required: true },
        slot("lens-0", "product", "Desk collaboration"),
        slot("lens-1", "product", "Mobile collaboration"),
        slot("lens-2", "process", "Deployment workflow")
      ],
      hashSourceUrl
    });

    expect(substantiveAssetsAreUnique(plan)).toBe(true);
    expect(plan.rejections.some(({ code }) => code === "duplicate_crop")).toBe(true);
    expect(plan.allocations).toHaveLength(3);
  });

  it("keeps headset product imagery unique even when crops share an upstream digest", () => {
    const sharedDigest = "phash:evolve2-hero-black";
    const plan = allocateExperienceAssets({
      candidates: [
        candidate({
          assetRef: `${AUDIO_PRODUCT_ORIGIN}/evolve2-65-ms-teams-black.png`,
          purpose: "hero",
          duplicateKey: sharedDigest,
          altText: "Evolve2 65 MS Teams headset"
        }),
        candidate({
          assetRef: `${AUDIO_PRODUCT_ORIGIN}/evolve2-65-ms-teams-black-desktop.png`,
          purpose: "product",
          width: 2400,
          height: 1600,
          duplicateKey: sharedDigest,
          altText: "Evolve2 65 desktop crop"
        }),
        candidate({
          assetRef: `${AUDIO_PRODUCT_ORIGIN}/evolve2-55-wireless.png`,
          purpose: "product",
          duplicateKey: "phash:evolve2-wireless",
          altText: "Evolve2 55 wireless headset"
        }),
        candidate({
          assetRef: `${AUDIO_PRODUCT_ORIGIN}/office-headset-workflow.jpg`,
          purpose: "process",
          altText: "Office headset workflow"
        })
      ],
      slots: [
        { sectionId: "hero", semanticRole: "hero", required: true },
        slot("lens-0", "product", "Desk collaboration"),
        slot("lens-1", "product", "Mobile collaboration"),
        slot("lens-2", "process", "Deployment workflow")
      ],
      hashSourceUrl
    });

    expect(substantiveAssetsAreUnique(plan)).toBe(true);
    expect(plan.rejections.filter(({ code }) => code === "duplicate_crop")).toHaveLength(1);
    expect(
      plan.rejections.some(
        ({ assetRef, code }) =>
          code === "duplicate_crop" &&
          assetRef.includes("evolve2-65-ms-teams-black")
      )
    ).toBe(true);
    expect(plan.allocations).toHaveLength(3);
    expect(plan.allocations.map(({ sectionId }) => sectionId)).toEqual([
      "hero",
      "lens-0",
      "lens-2"
    ]);
    expect(plan.treatments).toEqual([
      expect.objectContaining({
        sectionId: "lens-1",
        semanticRole: "product",
        treatment: "designed_non_image"
      })
    ]);
    expect(
      plan.allocations.find(({ sectionId }) => sectionId === "lens-0")?.assetRef
    ).toContain("evolve2-55-wireless");
  });

  it("blocks the same upstream digest from occupying two semantic roles", () => {
    const digest = "content:shared-advisory-hero";
    const plan = allocateExperienceAssets({
      candidates: [
        candidate({
          assetRef: `${ADVISORY_ASSET_ORIGIN}/path-a/cfo-advisory.jpg`,
          purpose: "hero",
          duplicateKey: digest
        }),
        candidate({
          assetRef: `${ADVISORY_ASSET_ORIGIN}/path-b/cfo-advisory.jpg`,
          purpose: "product",
          duplicateKey: digest
        })
      ],
      slots: [
        { sectionId: "hero", semanticRole: "hero", required: true },
        slot("lens-0", "product", "CFO advisory")
      ],
      hashSourceUrl
    });

    expect(plan.allocations).toHaveLength(1);
    expect(plan.treatments).toEqual([
      expect.objectContaining({
        sectionId: "lens-0",
        semanticRole: "product",
        treatment: "designed_non_image",
        reason: "assets_exhausted"
      })
    ]);
    expect(substantiveAssetsAreUnique(plan)).toBe(true);
  });

  it("uses designed fallbacks for sparse advisory inventory across tabs", () => {
    const plan = allocateExperienceAssets({
      candidates: [
        candidate({
          assetRef: `${ADVISORY_ASSET_ORIGIN}/cfo-advisory-dashboard.png`,
          purpose: "hero",
          altText: "CFO advisory dashboard"
        })
      ],
      slots: [
        { sectionId: "hero", semanticRole: "hero", required: true },
        slot("lens-0", "supporting", "CFO advisory"),
        slot("lens-1", "product", "ERP selection"),
        slot("lens-2", "process", "Client accounting")
      ],
      hashSourceUrl
    });

    expect(plan.allocations).toHaveLength(1);
    expect(plan.treatments).toHaveLength(3);
    expect(plan.treatments.every(({ treatment }) => treatment === "designed_non_image")).toBe(true);
    expect(substantiveAssetsAreUnique(plan)).toBe(true);
  });
});

describe("allocation benchmark guard", () => {
  it("fails the deliberate duplicate-allocation mutation used by compiler benchmarks", () => {
    const plan = allocateExperienceAssets({
      candidates: [
        candidate({
          assetRef: `${ADVISORY_ASSET_ORIGIN}/cfo-advisory-dashboard.png`,
          purpose: "hero"
        }),
        candidate({
          assetRef: `${ADVISORY_ASSET_ORIGIN}/erp-selection-workflow.png`,
          purpose: "product"
        })
      ],
      slots: [
        { sectionId: "hero", semanticRole: "hero", required: true },
        slot("lens-0", "product", "ERP selection")
      ],
      hashSourceUrl
    });

    expect(substantiveAssetsAreUnique(plan)).toBe(true);
    const mutated = withDeliberateDuplicateAllocation(plan);
    expect(substantiveAssetsAreUnique(mutated)).toBe(false);
    expect(mutated.allocations).toHaveLength(plan.allocations.length + 1);
  });
});

describe("unsafe source matrix", () => {
  it.each([
    ["loopback ipv4", "https://127.0.0.1/logo.png"],
    ["any-address ipv4", "https://0.0.0.0/logo.png"],
    ["private class a", "https://10.1.2.3/logo.png"],
    ["private class b", "https://172.20.0.5/logo.png"],
    ["private class c", "https://192.168.1.9/logo.png"],
    ["link-local ipv4", "https://169.254.169.254/latest/meta-data/"],
    ["carrier-grade nat", "https://100.72.4.1/logo.png"],
    ["benchmark range", "https://198.19.0.1/logo.png"],
    ["ipv6 loopback", "https://[::1]/logo.png"],
    ["ipv6 unspecified", "https://[::]/logo.png"],
    ["ipv6 unique-local", "https://[fd00::1]/logo.png"],
    ["ipv6 link-local", "https://[fe80::1]/logo.png"],
    ["ipv4-mapped ipv6", "https://[::ffff:127.0.0.1]/logo.png"],
    ["bare hostname", "https://intranet/logo.png"],
    ["mdns host", "https://printer.local/logo.png"],
    ["internal suffix", "https://assets.internal/logo.png"],
    ["home arpa", "https://nas.home.arpa/logo.png"],
    ["onion service", "https://abcd1234.onion/logo.png"],
    ["credentials in url", "https://user:secret@cdn.example.com/logo.png"],
    ["explicit port", "https://cdn.example.com:8443/logo.png"]
  ])("rejects %s", (_label, assetRef) => {
    expect(rejectAssetCandidate(candidate({ assetRef, purpose: "product" }))).toBeDefined();
  });

  it.each([
    ["ftp", "ftp://cdn.example.com/logo.png", "not_https"],
    ["file", "file:///etc/passwd", "not_https"],
    ["protocol-relative", "//cdn.example.com/logo.png", "unsafe_url"],
    ["blob", "blob:https://cdn.example.com/abc", "not_https"]
  ])("rejects a %s source", (_label, assetRef, code) => {
    expect(rejectAssetCandidate(candidate({ assetRef, purpose: "product" }))).toBe(code);
  });

  it("accepts a public https source and a first-party delivery path", () => {
    expect(
      rejectAssetCandidate(
        candidate({ assetRef: "https://cdn.example.com/console.png", purpose: "product" })
      )
    ).toBeUndefined();
    expect(
      rejectAssetCandidate(
        candidate({ assetRef: "/api/sessions/abc/image/1", purpose: "product" })
      )
    ).toBeUndefined();
  });
});

describe("public render projection", () => {
  it("carries placements without the evidence or scores behind them", () => {
    const plan = allocateExperienceAssets({
      candidates: [
        candidate({ assetRef: "https://cdn.example.com/console.png", purpose: "product" })
      ],
      slots: [{ sectionId: "hero", semanticRole: "hero", required: true }],
      hashSourceUrl
    });
    const renderPlan = toAssetRenderPlan(plan);
    const serialized = JSON.stringify(renderPlan);

    expect(renderPlan.placements[0]).toEqual({
      sectionId: "hero",
      semanticRole: "hero",
      assetRef: "https://cdn.example.com/console.png",
      reusable: false,
      required: true
    });
    for (const field of ["evidenceRef", "sourceUrlHash", "score", "allocationKey", "purpose"]) {
      expect(serialized).not.toContain(field);
    }
    expect(serialized).not.toContain("evidence:");
  });
});
