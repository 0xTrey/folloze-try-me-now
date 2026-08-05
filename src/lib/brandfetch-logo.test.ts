import { describe, expect, it } from "vitest";

import { brandfetchLogoApiUrl, isBrandfetchLogoApiUrl } from "@/lib/brandfetch-logo";

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

  it.each([
    "https://attacker.example/domain/cisco.com/w/320/h/96/theme/dark/fallback/404/type/logo?c=client_123456",
    "https://cdn.brandfetch.io/domain/cisco.com/type/icon?c=client_123456",
    "https://cdn.brandfetch.io/domain/cisco.com/w/320/h/96/theme/dark/fallback/404/type/logo?c=x",
    "https://user:pass@cdn.brandfetch.io/domain/cisco.com/w/320/h/96/theme/dark/fallback/404/type/logo?c=client_123456"
  ])("rejects untrusted or malformed logo URLs: %s", (url) => {
    expect(isBrandfetchLogoApiUrl(url)).toBe(false);
  });
});
