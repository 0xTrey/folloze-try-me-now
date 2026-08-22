import { describe, expect, it, vi } from "vitest";

import {
  brandfetchLogoApiUrl,
  brandfetchLogoRecoveryUrls,
  isBrandfetchHostedLogoUrl,
  isBrandfetchLogoApiUrl,
  retrieveBrandfetchEvidence,
  type BrandfetchRetrieverProvider
} from "@/lib/brandfetch-logo";
import { portableBrandLogoFromSvg } from "@/lib/portable-brand-logo";

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

const officialDarkLogo =
  "https://cdn.brandfetch.io/idOfficial/theme/dark/logo.svg?c=asset_client_12345";
const officialLightLogo =
  "https://cdn.brandfetch.io/idOfficial/theme/light/logo.svg?c=asset_client_12345";

function provider(
  lookup: BrandfetchRetrieverProvider["lookup"],
  loadPortableLogo?: BrandfetchRetrieverProvider["loadPortableLogo"]
): BrandfetchRetrieverProvider {
  return { lookup, loadPortableLogo };
}

function request(overrides: Partial<Parameters<typeof retrieveBrandfetchEvidence>[0]> = {}) {
  return {
    sessionId: "session-1",
    revision: 3,
    canonicalDomain: "official.example",
    deadlineMs: 100,
    ...overrides
  };
}

describe("Brandfetch evidence retriever", () => {
  it("returns bounded official logo and metadata in a ProductionArtifact", async () => {
    const artifact = await retrieveBrandfetchEvidence(
      request(),
      provider(async () => ({
        status: "hit",
        payload: {
          domain: "official.example",
          name: "<b>Official Company</b>",
          description: "  Trusted <script>ignored</script> metadata. ",
          claimed: true,
          qualityScore: 0.9,
          colors: [
            { hex: "#10243e", type: "dark" },
            { hex: "not-a-color", type: "accent" }
          ],
          fonts: [{ name: "Official Sans", type: "title" }],
          logos: [
            {
              type: "logo",
              theme: "dark",
              formats: [{ src: officialDarkLogo, format: "svg" }]
            },
            {
              type: "logo",
              theme: "light",
              formats: [{ src: officialLightLogo, format: "svg" }]
            }
          ]
        }
      }))
    );

    expect(artifact).toMatchObject({
      worker: "brandfetch-retriever",
      sessionId: "session-1",
      revision: 3,
      status: "complete",
      confidence: 0.98,
      evidenceRefs: ["brandfetch:brand-record", "brandfetch:official-logo"],
      value: {
        canonicalDomain: "official.example",
        matchedDomain: "official.example",
        companyName: "Official Company",
        claimed: true,
        qualityTier: "high",
        colors: [{ hex: "#10243E", type: "dark" }],
        fonts: [{ name: "Official Sans", type: "title" }],
        logo: {
          status: "verified",
          delivery: "brandfetch-hotlink",
          url: officialDarkLogo,
          urlOnDark: officialLightLogo,
          candidateCount: 2,
          rejectedCandidateCount: 0
        }
      }
    });
    expect(JSON.stringify(artifact)).not.toContain("<script");
  });

  it("queries an identity-authorized alias and accepts its exact provider record", async () => {
    const lookup = vi.fn<BrandfetchRetrieverProvider["lookup"]>()
      .mockResolvedValueOnce({ status: "missing" })
      .mockResolvedValueOnce({
        status: "hit",
        payload: {
          domain: "official-alias.example",
          name: "Official Company",
          logos: [{
            type: "logo",
            formats: [{ src: officialDarkLogo, format: "svg" }]
          }]
        }
      });

    const artifact = await retrieveBrandfetchEvidence(
      request({ aliases: ["official-alias.example"] }),
      provider(lookup)
    );

    expect(lookup).toHaveBeenNthCalledWith(
      1,
      "official.example",
      expect.any(AbortSignal)
    );
    expect(lookup).toHaveBeenNthCalledWith(
      2,
      "official-alias.example",
      expect.any(AbortSignal)
    );
    expect(artifact).toMatchObject({
      status: "complete",
      value: {
        canonicalDomain: "official.example",
        matchedDomain: "official-alias.example",
        aliases: ["official-alias.example"],
        logo: { status: "verified" }
      }
    });
  });

  it("returns an honest fallback when no canonical or alias record exists", async () => {
    const artifact = await retrieveBrandfetchEvidence(
      request({ aliases: ["official-alias.example"] }),
      provider(async () => ({ status: "missing" }))
    );

    expect(artifact).toMatchObject({
      status: "fallback",
      confidence: 0,
      evidenceRefs: [],
      fallbackCode: "brandfetch_not_found"
    });
    expect(artifact.value).toBeUndefined();
  });

  it("returns timed_out when the provider misses the bounded deadline", async () => {
    const artifact = await retrieveBrandfetchEvidence(
      request({ deadlineMs: 5 }),
      provider(() => new Promise(() => undefined))
    );

    expect(artifact).toMatchObject({
      status: "timed_out",
      confidence: 0,
      fallbackCode: "brandfetch_timeout"
    });
  });

  it("rejects malformed or unrelated assets without inventing logo evidence", async () => {
    const artifact = await retrieveBrandfetchEvidence(
      request(),
      provider(async () => ({
        status: "hit",
        payload: {
          domain: "official.example",
          name: "Official Company",
          colors: [{ hex: "#10243E", type: "dark" }],
          logos: [{
            type: "logo",
            formats: [
              { src: "https://attacker.example/official.svg", format: "svg" },
              { src: "javascript:alert(1)", format: "svg" }
            ]
          }]
        }
      }))
    );

    expect(artifact).toMatchObject({
      status: "fallback",
      fallbackCode: "brandfetch_logo_rejected",
      evidenceRefs: ["brandfetch:brand-record"],
      value: {
        logo: {
          status: "rejected",
          candidateCount: 0,
          rejectedCandidateCount: 2
        }
      }
    });
    expect(artifact.value?.logo.url).toBeUndefined();
    expect(artifact.value?.logo.portable).toBeUndefined();
  });

  it("tries the next safe provider asset and returns validated portable delivery", async () => {
    const portable = portableBrandLogoFromSvg(
      '<svg xmlns="http://www.w3.org/2000/svg"><title>Official</title><path d="M0 0h20v10H0z"/></svg>',
      "brandfetch"
    );
    const loadPortableLogo = vi.fn<NonNullable<BrandfetchRetrieverProvider["loadPortableLogo"]>>()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(portable);

    const artifact = await retrieveBrandfetchEvidence(
      request(),
      provider(
        async () => ({
          status: "hit",
          payload: {
            domain: "official.example",
            logos: [{
              type: "logo",
              formats: [
                { src: officialDarkLogo, format: "svg" },
                { src: officialLightLogo, format: "svg" }
              ]
            }]
          }
        }),
        loadPortableLogo
      )
    );

    expect(loadPortableLogo).toHaveBeenCalledTimes(2);
    expect(artifact).toMatchObject({
      status: "complete",
      value: {
        logo: {
          status: "verified",
          delivery: "portable",
          url: officialLightLogo,
          portable: { source: "brandfetch", mediaType: "image/svg+xml" },
          candidateCount: 2,
          rejectedCandidateCount: 1
        }
      }
    });
  });

  it("rejects a provider record for a domain outside the authorized identity set", async () => {
    const artifact = await retrieveBrandfetchEvidence(
      request({ aliases: ["official-alias.example"] }),
      provider(async () => ({
        status: "hit",
        payload: {
          domain: "unrelated.example",
          name: "Wrong Company",
          logos: [{
            type: "logo",
            formats: [{ src: officialDarkLogo, format: "svg" }]
          }]
        }
      }))
    );

    expect(artifact).toMatchObject({
      status: "failed",
      confidence: 0,
      errorCode: "brandfetch_invalid_response"
    });
    expect(artifact.value).toBeUndefined();
  });
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
