import { afterEach, describe, expect, it, vi } from "vitest";

async function configFor(env: Record<string, string>) {
  vi.resetModules();
  for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);
  const { config } = await import("@/lib/config");
  return config;
}

async function generationTimeoutFor(value: string): Promise<number> {
  return (await configFor({ TRY_ME_GENERATION_TIMEOUT_MS: value })).generationTimeoutMs;
}

async function brandHarvesterTimeoutFor(value: string): Promise<number> {
  return (await configFor({ TRY_ME_BRAND_HARVESTER_TIMEOUT_MS: value })).brandHarvesterTimeoutMs;
}

async function generationDeadlineFor(value: string): Promise<number> {
  return (await configFor({ TRY_ME_GENERATION_DEADLINE_MS: value })).generationDeadlineMs;
}

async function finalizationReserveFor(value: string): Promise<number> {
  return (await configFor({ TRY_ME_GENERATION_FINALIZATION_RESERVE_MS: value }))
    .generationFinalizationReserveMs;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("generation timeout configuration", () => {
  it("defaults to a 25-second first-preview quality budget", async () => {
    expect(await generationTimeoutFor("")).toBe(30_000);
  });

  it("preserves the useful 10-second lower clamp", async () => {
    expect(await generationTimeoutFor("1000")).toBe(10_000);
  });

  it("reserves the rest of the 60-second promise for enrichment and rendering", async () => {
    expect(await generationTimeoutFor("90000")).toBe(30_000);
  });

  it("accepts an override inside the bounded window", async () => {
    expect(await generationTimeoutFor("20000")).toBe(20_000);
  });
});

describe("end-to-end generation budget configuration", () => {
  it("defaults to a 60-second customer contract with a five-second finalization reserve", async () => {
    expect(await generationDeadlineFor("")).toBe(60_000);
    expect(await finalizationReserveFor("")).toBe(5_000);
  });

  it("never permits an environment override beyond the 60-second contract", async () => {
    expect(await generationDeadlineFor("90000")).toBe(60_000);
  });

  it("keeps the render/persist reserve inside a bounded operational range", async () => {
    expect(await finalizationReserveFor("100")).toBe(2_000);
    expect(await finalizationReserveFor("90000")).toBe(10_000);
  });
});

describe("brand harvester timeout configuration", () => {
  it("defaults to a 12-second browser-evidence budget", async () => {
    expect(await brandHarvesterTimeoutFor("")).toBe(12_000);
  });

  it("keeps a useful five-second lower bound", async () => {
    expect(await brandHarvesterTimeoutFor("1000")).toBe(5_000);
  });

  it("prevents browser enrichment from consuming the customer promise", async () => {
    expect(await brandHarvesterTimeoutFor("58000")).toBe(20_000);
  });
});

describe("trimmed-empty production configuration", () => {
  it("falls back from empty model and public-origin variables", async () => {
    const config = await configFor({
      OPENAI_MODEL: "   ",
      NEXT_PUBLIC_APP_URL: "",
      VERCEL_PROJECT_PRODUCTION_URL: "try-folloze.vercel.app",
      VERCEL_URL: "ignored-preview.vercel.app"
    });

    expect(config.openAIModel).toBe("gpt-5.6-terra");
    expect(config.appUrl).toBe("https://try-folloze.vercel.app");
  });

  it("trims explicit model and public-origin values", async () => {
    const config = await configFor({
      OPENAI_MODEL: "  gpt-5.6-sol  ",
      NEXT_PUBLIC_APP_URL: "  https://try.example.com/  "
    });

    expect(config.openAIModel).toBe("gpt-5.6-sol");
    expect(config.appUrl).toBe("https://try.example.com");
  });
});

describe("Marketo configuration", () => {
  it("is disabled by default and does not infer credentials from ambient environment", async () => {
    const { config, hasMarketo } = await import("@/lib/config");
    expect(config.marketoMode).toBe("disabled");
    expect(hasMarketo).toBe(false);
  });

  it("keeps Munchkin as an optional public identifier separate from REST sync", async () => {
    const config = await configFor({ NEXT_PUBLIC_MARKETO_MUNCHKIN_ID: "123-ABC-456" });
    expect(config.marketoMunchkinId).toBe("123-ABC-456");
    expect(config.marketoMode).toBe("disabled");
  });

  it("rejects malformed Munchkin identifiers before they reach generated scripts", async () => {
    const config = await configFor({ NEXT_PUBLIC_MARKETO_MUNCHKIN_ID: "</script>" });
    expect(config.marketoMunchkinId).toBeUndefined();
  });

  it("will not send credentials to a non-Marketo endpoint", async () => {
    const { hasMarketo } = await import("@/lib/config");
    expect(hasMarketo).toBe(false);
    const configured = await configFor({
      MARKETO_MODE: "sync",
      MARKETO_REST_ENDPOINT: "https://example.com",
      MARKETO_CLIENT_ID: "client",
      MARKETO_CLIENT_SECRET: "secret"
    });
    expect(configured.marketoEndpoint).toBe("https://example.com");
    const reloaded = await import("@/lib/config");
    expect(reloaded.hasMarketo).toBe(false);
  });
});

describe("public Folloze write boundary", () => {
  it("keeps the public runtime app-hosted HTML-only", async () => {
    const { publicRuntimeCapabilities, hasRemoteFolloze, canPublishFolloze } =
      await configFor({
        FOLLOZE_MODE: "publish",
        FOLLOZE_MCP_SERVER_URL: "https://example.invalid/mcp",
        FOLLOZE_MCP_AUTH_TOKEN: "configured-token"
      }).then(async () => import("@/lib/config"));

    expect(publicRuntimeCapabilities).toEqual({
      appHostedHtmlOnly: true,
      follozeWritesEnabled: false,
      follozePublishEnabled: false
    });
    expect(hasRemoteFolloze).toBe(false);
    expect(canPublishFolloze).toBe(false);
  });
});
