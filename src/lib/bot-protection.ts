import { readJsonBody } from "@/lib/request-security";

const TURNSTILE_ENDPOINT = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const MAX_TOKEN_LENGTH = 2048;
const VERIFY_TIMEOUT_MS = 5_000;

export type BotVerificationResult =
  | { status: "verified"; success: true }
  | { status: "disabled" | "misconfigured" | "rejected"; success: false; reason: string };

type TurnstileResponse = {
  success?: boolean;
  hostname?: string;
  action?: string;
};

function expectedEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

/** Verify a client token server-side. Disabled and misconfigured states are explicit and fail closed. */
export async function verifyBotToken(token: unknown, action?: string): Promise<BotVerificationResult> {
  const enabled = process.env.TURNSTILE_ENABLED === "true";
  const secret = expectedEnv("TURNSTILE_SECRET_KEY");
  if (!enabled) return { status: "disabled", success: false, reason: "turnstile_disabled" };
  if (!secret) return { status: "misconfigured", success: false, reason: "turnstile_secret_missing" };
  const expectedHostname = expectedEnv("TURNSTILE_EXPECTED_HOSTNAME");
  if (!expectedHostname) return { status: "misconfigured", success: false, reason: "turnstile_hostname_missing" };
  if (typeof token !== "string" || token.length === 0 || token.length > MAX_TOKEN_LENGTH) {
    return { status: "rejected", success: false, reason: "turnstile_token_invalid" };
  }
  if (action !== undefined && (typeof action !== "string" || !/^[A-Za-z0-9._:-]{1,80}$/.test(action))) {
    return { status: "rejected", success: false, reason: "turnstile_action_invalid" };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), VERIFY_TIMEOUT_MS);
  try {
    const body = new URLSearchParams({ secret, response: token });
    const response = await fetch(TURNSTILE_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
      signal: controller.signal
    });
    if (!response.ok) return { status: "rejected", success: false, reason: "turnstile_provider_error" };
    const result = (await readJsonBody(response, 4096)) as TurnstileResponse;
    if (result?.success !== true) return { status: "rejected", success: false, reason: "turnstile_unsuccessful" };
    const expectedAction = expectedEnv("TURNSTILE_EXPECTED_ACTION");
    if (expectedHostname && result.hostname !== expectedHostname) {
      return { status: "rejected", success: false, reason: "turnstile_hostname_mismatch" };
    }
    if (expectedAction && result.action !== expectedAction) {
      return { status: "rejected", success: false, reason: "turnstile_action_mismatch" };
    }
    if (action && result.action !== action) {
      return { status: "rejected", success: false, reason: "turnstile_action_mismatch" };
    }
    return { status: "verified", success: true };
  } catch {
    return { status: "rejected", success: false, reason: "turnstile_unavailable" };
  } finally {
    clearTimeout(timeout);
  }
}

export const botProtectionConfig = {
  endpoint: TURNSTILE_ENDPOINT,
  timeoutMs: VERIFY_TIMEOUT_MS,
  maxTokenLength: MAX_TOKEN_LENGTH
} as const;
