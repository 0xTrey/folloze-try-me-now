const intFromEnv = (value: string | undefined, fallback: number) => {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const oneOf = <T extends string>(value: string | undefined, choices: readonly T[], fallback: T): T =>
  choices.includes(value as T) ? (value as T) : fallback;

const nonEmptyFromEnv = (value: string | undefined, fallback: string): string =>
  value?.trim() || fallback;

const marketoMunchkinId = process.env.NEXT_PUBLIC_MARKETO_MUNCHKIN_ID?.trim() ?? "";

const vercelHost = nonEmptyFromEnv(
  process.env.VERCEL_PROJECT_PRODUCTION_URL,
  process.env.VERCEL_URL?.trim() ?? ""
);
const inferredAppUrl = vercelHost ? `https://${vercelHost}` : "http://localhost:3000";
const follozeAllowedPublicHosts = (
  process.env.FOLLOZE_ALLOWED_PUBLIC_HOSTS ?? "engage.folloze.com,experience.folloze.com"
)
  .split(",")
  .map((host) => host.trim().toLowerCase())
  .filter(Boolean);

export const config = {
  appUrl: nonEmptyFromEnv(process.env.NEXT_PUBLIC_APP_URL, inferredAppUrl).replace(/\/$/, ""),
  generationMode: oneOf(process.env.GENERATION_MODE, ["fixture", "openai"] as const, "fixture"),
  brandMode: oneOf(process.env.BRAND_MODE, ["fast", "remote"] as const, "fast"),
  brandfetchMode: oneOf(
    process.env.BRANDFETCH_MODE,
    ["disabled", "logo", "fallback", "enrich"] as const,
    "disabled"
  ),
  follozeMode: oneOf(process.env.FOLLOZE_MODE, ["disabled", "draft", "publish"] as const, "disabled"),
  emailMode: oneOf(process.env.EMAIL_MODE, ["console", "resend"] as const, "console"),
  marketoMode: oneOf(process.env.MARKETO_MODE, ["disabled", "sync"] as const, "disabled"),
  marketoEndpoint: nonEmptyFromEnv(process.env.MARKETO_REST_ENDPOINT, "").replace(/\/$/, ""),
  marketoMunchkinId: /^\d{3}-[A-Za-z0-9]{3}-\d{3}$/.test(marketoMunchkinId)
    ? marketoMunchkinId.toUpperCase()
    : undefined,
  marketoCustomActivityTypeId: intFromEnv(process.env.MARKETO_CUSTOM_ACTIVITY_TYPE_ID, 0) || undefined,
  openAIModel: nonEmptyFromEnv(process.env.OPENAI_MODEL, "gpt-5.6-terra"),
  generationTimeoutMs: Math.min(
    Math.max(intFromEnv(process.env.TRY_ME_GENERATION_TIMEOUT_MS, 30_000), 10_000),
    30_000
  ),
  // This is the customer-facing generation contract measured from the moment
  // the brief becomes generation-ready. Provider-specific timeouts must fit
  // inside it; the last window belongs solely to render/persist/fallback.
  generationDeadlineMs: Math.min(
    Math.max(intFromEnv(process.env.TRY_ME_GENERATION_DEADLINE_MS, 60_000), 30_000),
    60_000
  ),
  generationFinalizationReserveMs: Math.min(
    Math.max(intFromEnv(process.env.TRY_ME_GENERATION_FINALIZATION_RESERVE_MS, 5_000), 2_000),
    10_000
  ),
  brandHarvesterTimeoutMs: Math.min(
    Math.max(intFromEnv(process.env.TRY_ME_BRAND_HARVESTER_TIMEOUT_MS, 12_000), 5_000),
    20_000
  ),
  sessionTtlSeconds: Math.min(
    Math.max(intFromEnv(process.env.TRY_ME_SESSION_TTL_SECONDS, 1800), 300),
    86400
  ),
  maxPdfBytes: Math.min(
    Math.max(intFromEnv(process.env.TRY_ME_MAX_PDF_BYTES, 10 * 1024 * 1024), 1024),
    25 * 1024 * 1024
  ),
  demoMode: process.env.TRY_ME_DEMO_MODE !== "false",
  demoCtaUrl: process.env.NEXT_PUBLIC_DEMO_CTA_URL ?? "https://www.folloze.com/book-a-meeting",
  follozeToolName: process.env.FOLLOZE_MCP_TOOL_NAME ?? "create_try_me_experience",
  follozeAllowedPublicHosts
};

export const hasRedis = Boolean(
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
);
export const hasBlob = Boolean(process.env.BLOB_READ_WRITE_TOKEN);
export const hasDatabase = Boolean(process.env.DATABASE_URL);

export const hasOpenAIKey = Boolean(process.env.OPENAI_API_KEY);
export const hasOpenAI = config.generationMode === "openai" && hasOpenAIKey;
export const hasRemoteBrandHarvester =
  config.brandMode === "remote" && Boolean(process.env.BRAND_HARVESTER_URL);
const validBrandfetchClientId = /^[A-Za-z0-9_-]{8,80}$/.test(
  process.env.BRANDFETCH_CLIENT_ID?.trim() ?? ""
);
const validBrandfetchApiKey = /^[A-Za-z0-9._-]{32,256}$/.test(
  process.env.BRANDFETCH_API_KEY?.trim() ?? ""
);
export const hasBrandfetchLogoApi =
  config.brandfetchMode !== "disabled" && validBrandfetchClientId;
export const hasBrandfetchBrandApi =
  ["fallback", "enrich"].includes(config.brandfetchMode) &&
  validBrandfetchApiKey;
/**
 * The public Try Me Now runtime is intentionally HTML-only. Keep the
 * Folloze configuration and integration code available for a future,
 * separately authorized internal handoff, but do not allow deployment
 * environment variables to turn this public app into a Folloze writer.
 */
export const publicRuntimeCapabilities = Object.freeze({
  appHostedHtmlOnly: true,
  follozeWritesEnabled: false,
  follozePublishEnabled: false
});
export const hasRemoteFolloze = false;
export const canPublishFolloze = false;
export const hasResend = config.emailMode === "resend" && Boolean(process.env.RESEND_API_KEY);
export const hasMarketo =
  config.marketoMode === "sync" &&
  /^https:\/\/[a-z0-9-]+\.mktorest\.com$/i.test(config.marketoEndpoint) &&
  Boolean(process.env.MARKETO_CLIENT_ID && process.env.MARKETO_CLIENT_SECRET);
