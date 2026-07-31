import { describe, expect, it } from "vitest";

import {
  brandWithFirstPartyImages,
  imageDeliverySources,
  imageDeliveryPath,
  isImageDeliveryPath,
  parseImageSlot,
  sourceImageUrlForSlot
} from "@/lib/image-delivery";
import type { BrandProfile } from "@/lib/types";

function profile(domain: string, role: "seller" | "target"): BrandProfile {
  return {
    domain,
    companyName: role,
    publicTopics: [],
    logoUrl: `https://cdn.example/${role}/logo.svg`,
    imageUrls: [
      `https://cdn.example/${role}/hero.jpg`,
      `https://cdn.example/${role}/platform.png`
    ],
    colors: ["#000000", "#ffffff"],
    primaryColor: "#000000",
    accentColor: "#ffffff",
    surfaceColor: "#ffffff",
    sourceUrl: `https://${domain}`,
    source: "brand-harvester"
  };
}

describe("session-bound image delivery slots", () => {
  const seller = profile("seller.example", "seller");
  const target = profile("target.example", "target");

  it("maps selected seller and target sources to exact first-party routes", () => {
    const selectedSellerUrl = "https://approved.example/selected-seller.jpg";
    const selectedTargetUrl = "https://approved.example/selected-target.jpg";
    const sources = imageDeliverySources({
      answers: { selectedAssetIds: ["seller_selected", "target_selected"] },
      availableAssets: [
        {
          id: "seller_selected",
          kind: "seller-image",
          label: "Selected seller image",
          url: selectedSellerUrl,
          source: "seller"
        },
        {
          id: "target_selected",
          kind: "target-image",
          label: "Selected target image",
          url: selectedTargetUrl,
          source: "target"
        }
      ],
      brand: seller,
      targetBrand: target
    });
    const selected = {
      ...seller,
      logoUrl: target.logoUrl,
      imageUrls: [selectedSellerUrl, selectedTargetUrl, "https://unknown.example/image.jpg"]
    };

    const delivered = brandWithFirstPartyImages(
      "session_123",
      selected,
      { ...sources, targetLogo: target.logoUrl },
      12
    );

    expect(delivered.logoUrl).toBe("/api/sessions/session_123/image/target-logo?v=12");
    expect(delivered.imageUrls).toEqual([
      "/api/sessions/session_123/image/seller-image-0?v=12",
      "/api/sessions/session_123/image/target-image-0?v=12"
    ]);
    expect(seller.imageUrls).toContain("https://cdn.example/seller/hero.jpg");
    expect(sources.sellerImages).toEqual([selectedSellerUrl]);
  });

  it("resolves a slot only from the image sources stored on that session", () => {
    const session = { answers: {}, brand: seller, targetBrand: target };

    expect(sourceImageUrlForSlot(session, "seller-logo")).toBe(seller.logoUrl);
    expect(sourceImageUrlForSlot(session, "seller-image-1")).toBe(seller.imageUrls[1]);
    expect(sourceImageUrlForSlot(session, "target-image-0")).toBe(target.imageUrls[0]);
    expect(sourceImageUrlForSlot(session, "target-image-5")).toBeUndefined();
  });

  it("accepts only bounded revision queries, not generic paths, queries, fragments, or extra slots", () => {
    const accepted = "/api/sessions/session_123/image/seller-image-0";
    expect(isImageDeliveryPath(accepted)).toBe(true);
    expect(imageDeliveryPath("session_123", "seller-image-0")).toBe(accepted);
    expect(isImageDeliveryPath(`${accepted}?v=12`)).toBe(true);
    expect(imageDeliveryPath("session_123", "seller-image-0", 12)).toBe(`${accepted}?v=12`);
    expect(parseImageSlot("target-logo")).toBe("target-logo");

    expect(isImageDeliveryPath("/uploads/logo.svg")).toBe(false);
    expect(isImageDeliveryPath(`${accepted}?url=https://attacker.example`)).toBe(false);
    expect(isImageDeliveryPath(`${accepted}?v=12&url=https://attacker.example`)).toBe(false);
    expect(isImageDeliveryPath(`${accepted}?v=0`)).toBe(false);
    expect(isImageDeliveryPath(`${accepted}#fragment`)).toBe(false);
    expect(isImageDeliveryPath("https://try.example/api/sessions/session_123/image/seller-logo")).toBe(false);
    expect(parseImageSlot("seller-image-6")).toBeUndefined();
    expect(imageDeliveryPath("../escape", "seller-logo")).toBeUndefined();
    expect(imageDeliveryPath("session_123", "seller-logo", -1)).toBeUndefined();
  });
});
