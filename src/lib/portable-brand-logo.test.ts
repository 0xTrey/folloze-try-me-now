import { describe, expect, it } from "vitest";

import {
  decodePortableBrandLogo,
  portableBrandLogoFromBytes,
  portableBrandLogoFromSvg
} from "@/lib/portable-brand-logo";

describe("portable brand logo delivery", () => {
  it("round-trips validated Brandfetch SVG bytes with source attribution", () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 40"><title>Official</title><path d="M0 0h120v40H0z"/></svg>';
    const portable = portableBrandLogoFromSvg(svg, "brandfetch");

    expect(portable).toMatchObject({
      mediaType: "image/svg+xml",
      encoding: "base64",
      source: "brandfetch"
    });
    expect(new TextDecoder().decode(decodePortableBrandLogo(portable!))).toBe(svg);
  });

  it.each([
    '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><image href="https://attacker.example/a.png"/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>'
  ])("rejects active or externally loaded Brandfetch SVG: %s", (svg) => {
    expect(portableBrandLogoFromSvg(svg, "brandfetch")).toBeUndefined();
  });

  it("rejects content whose claimed media type or digest was changed in transit", () => {
    const pngHeader = Uint8Array.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a
    ]);
    const portable = portableBrandLogoFromBytes(pngHeader, "brandfetch");

    expect(portable).toBeDefined();
    expect(decodePortableBrandLogo({
      ...portable!,
      mediaType: "image/jpeg"
    })).toBeUndefined();
    expect(decodePortableBrandLogo({
      ...portable!,
      sha256: "0".repeat(64)
    })).toBeUndefined();
  });
});
