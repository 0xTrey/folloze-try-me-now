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

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("generation timeout configuration", () => {
  it("defaults to a 25-second first-preview quality budget", async () => {
    expect(await generationTimeoutFor("")).toBe(25_000);
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
