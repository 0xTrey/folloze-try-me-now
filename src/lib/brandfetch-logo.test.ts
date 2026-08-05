import { describe, expect, it } from "vitest";

import {
  brandfetchLogoApiUrl,
  brandfetchLogoRecoveryUrls,
  isBrandfetchHostedLogoUrl,
  isBrandfetchLogoApiUrl
} from "@/lib/brandfetch-logo";

describe("Brandfetch Logo API URLs", () => {
  it("builds explicit, wordmark-only hotlinks with a 404 fallback", () => {
    const url = brandfetchLogoApiUrl("www.6sense.com", "client_123456", "dark");
    expect(url).toBe(
      "https://cdn.brandfetch.io/domain/6sense.com/w/320/h/96/theme/dark/fallback/404/type/logo?c=client_123456"
    );
    expect(isBrandfetchLogoApiUrl(url)).toBe(true);
    expect(isBrandfetchLogoApiUrl(url, "6sense.com")).toBe(true);
    expect(isBrandfetchLogoApiUrl(url, "cisco.com")).toBe(false);
  });

  it("builds a bounded wordmark, symbol, and icon recovery chain", () => {
    const wordmark = brandfetchLogoApiUrl("6sense.com", "client_123456", "dark");
    expect(brandfetchLogoRecoveryUrls(wordmark, "6sense.com")).toEqual([
      expect.stringContaining("/type/logo?"),
      expect.stringContaining("/type/symbol?"),
      expect.stringContaining("/type/icon?")
    ]);
  });

  it("accepts a bounded Brand API CDN asset for direct browser rendering", () => {
    const asset = "https://cdn.brandfetch.io/idj3Bp2d82/theme/dark/logo.svg?c=asset_client_12345";
    expect(isBrandfetchHostedLogoUrl(asset)).toBe(true);
    expect(brandfetchLogoRecoveryUrls(asset, "gm.com")).toEqual([asset]);
    expect(isBrandfetchHostedLogoUrl("https://cdn.brandfetch.io/idj3Bp2d82/theme/dark/logo.svg?c=x")).toBe(false);
  });

  it.each([
    "https://attacker.example/domain/cisco.com/w/320/h/96/theme/dark/fallback/404/type/logo?c=client_123456",
    "https://cdn.brandfetch.io/domain/cisco.com/type/icon?c=client_123456",
    "https://cdn.brandfetch.io/domain/cisco.com/w/320/h/96/theme/dark/fallback/404/type/logo?c=x",
    "https://user:pass@cdn.brandfetch.io/domain/cisco.com/w/320/h/96/theme/dark/fallback/404/type/logo?c=client_123456"
  ])("rejects untrusted or malformed logo URLs: %s", (url) => {
    expect(isBrandfetchLogoApiUrl(url)).toBe(false);
  });
});
