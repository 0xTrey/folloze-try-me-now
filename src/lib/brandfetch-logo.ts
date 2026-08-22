import type { ProductionArtifact } from "@/lib/orchestration/worker-types";
import type { PortableBrandLogo } from "@/lib/types";

const BRANDFETCH_LOGO_HOST = "cdn.brandfetch.io";
const BRANDFETCH_CLIENT_ID = /^[A-Za-z0-9_-]{8,80}$/;
const PUBLIC_DOMAIN = /^(?=.{1,253}$)(?!-)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;
const HEX_COLOR = /^#[A-F0-9]{6}$/;
const DEFAULT_RETRIEVER_DEADLINE_MS = 8_000;

export type BrandfetchLogoTheme = "light" | "dark";
export type BrandfetchLogoType = "logo" | "symbol" | "icon";

export type BrandfetchProviderStatus =
  | "hit"
  | "missing"
  | "unauthorized"
  | "rate_limited"
  | "invalid_response"
  | "failed";

export interface BrandfetchProviderResult {
  status: BrandfetchProviderStatus;
  payload?: unknown;
}

/**
 * Server-side provider boundary. Implementations own authenticated Brandfetch
 * requests and optional safe-fetch asset copying; the retriever never accepts
 * credentials or makes an unbounded network request itself.
 */
export interface BrandfetchRetrieverProvider {
  lookup(domain: string, signal: AbortSignal): Promise<BrandfetchProviderResult>;
  loadPortableLogo?(
    url: string,
    signal: AbortSignal
  ): Promise<PortableBrandLogo | undefined>;
}

export interface BrandfetchRetrieverRequest {
  sessionId: string;
  revision: number;
  canonicalDomain: string;
  aliases?: string[];
  signal?: AbortSignal;
  deadlineMs?: number;
  now?: () => Date;
}

export interface BrandfetchColorEvidence {
  hex: string;
  type?: string;
}

export interface BrandfetchFontEvidence {
  name: string;
  type?: string;
}

export interface BrandfetchOfficialLogoEvidence {
  status: "verified" | "missing" | "rejected";
  source: "brandfetch";
  delivery?: "brandfetch-hotlink" | "portable";
  url?: string;
  urlOnDark?: string;
  portable?: PortableBrandLogo;
  candidateCount: number;
  rejectedCandidateCount: number;
}

export interface BrandfetchEvidence {
  canonicalDomain: string;
  matchedDomain: string;
  aliases: string[];
  companyName?: string;
  description?: string;
  colors: BrandfetchColorEvidence[];
  fonts: BrandfetchFontEvidence[];
  claimed?: boolean;
  qualityTier: "high" | "medium" | "low" | "unknown";
  logo: BrandfetchOfficialLogoEvidence;
}

export type BrandfetchEvidenceArtifact = ProductionArtifact<BrandfetchEvidence>;

interface NormalizedLogoCandidate {
  src: string;
  theme: string;
  score: number;
}

class BrandfetchRetrieverTimeout extends Error {
  constructor() {
    super("Brandfetch retrieval exceeded its deadline.");
    this.name = "BrandfetchRetrieverTimeout";
  }
}

function normalizeLogoDomain(value: string): string | undefined {
  try {
    const candidate = value.trim().toLowerCase();
    const parsed = new URL(candidate.includes("://") ? candidate : `https://${candidate}`);
    if (parsed.username || parsed.password || parsed.port) return undefined;
    const hostname = parsed.hostname.replace(/^www\./, "").replace(/\.$/, "");
    return PUBLIC_DOMAIN.test(hostname) ? hostname : undefined;
  } catch {
    return undefined;
  }
}

function boundedProviderText(value: unknown, maximum: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value
    .replace(/<[^>]*>/g, " ")
    .replace(/[\u0000-\u001f\u007f<>\[\]{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return normalized ? normalized.slice(0, maximum) : undefined;
}

function normalizeProviderColor(value: unknown): BrandfetchColorEvidence | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const color = value as Record<string, unknown>;
  const hex = typeof color.hex === "string" ? color.hex.trim().toUpperCase() : "";
  if (!HEX_COLOR.test(hex)) return undefined;
  return {
    hex,
    type: boundedProviderText(color.type, 24)?.toLowerCase()
  };
}

function normalizeProviderFont(value: unknown): BrandfetchFontEvidence | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const font = value as Record<string, unknown>;
  const name = boundedProviderText(font.name, 80);
  if (!name) return undefined;
  return {
    name,
    type: boundedProviderText(font.type, 24)?.toLowerCase()
  };
}

function providerQualityTier(value: unknown): BrandfetchEvidence["qualityTier"] {
  if (typeof value !== "number" || !Number.isFinite(value)) return "unknown";
  if (value >= 2 / 3) return "high";
  if (value >= 1 / 3) return "medium";
  return "low";
}

function normalizeProviderLogoCandidates(payload: Record<string, unknown>): {
  candidates: NormalizedLogoCandidate[];
  rejectedCandidateCount: number;
} {
  let rejectedCandidateCount = 0;
  const logos = Array.isArray(payload.logos) ? payload.logos : [];
  const candidates = logos
    .filter((logo): logo is Record<string, unknown> => Boolean(
      logo && typeof logo === "object" && !Array.isArray(logo)
    ))
    .flatMap((logo) => {
      const type = boundedProviderText(logo.type, 24)?.toLowerCase() ?? "";
      const theme = boundedProviderText(logo.theme, 24)?.toLowerCase() ?? "";
      const typeScore = type === "logo" ? 200 : type === "symbol" ? 80 : type === "icon" ? 20 : 0;
      const formats = Array.isArray(logo.formats) ? logo.formats : [];
      return formats
        .filter((format): format is Record<string, unknown> => Boolean(
          format && typeof format === "object" && !Array.isArray(format)
        ))
        .map((format): NormalizedLogoCandidate | undefined => {
          const src = typeof format.src === "string" ? format.src.trim() : "";
          if (!isBrandfetchHostedLogoUrl(src)) {
            rejectedCandidateCount += 1;
            return undefined;
          }
          const formatName = boundedProviderText(format.format, 24)?.toLowerCase();
          return {
            src,
            theme,
            score:
              typeScore +
              (formatName === "svg" ? 40 : formatName === "webp" ? 30 : formatName === "png" ? 25 : 10)
          };
        });
    })
    .filter((candidate): candidate is NormalizedLogoCandidate => Boolean(candidate))
    .sort((left, right) => right.score - left.score)
    .filter((candidate, index, values) =>
      values.findIndex(({ src }) => src === candidate.src) === index
    )
    .slice(0, 6);
  return { candidates, rejectedCandidateCount };
}

async function selectProviderLogo(
  payload: Record<string, unknown>,
  provider: BrandfetchRetrieverProvider,
  signal: AbortSignal
): Promise<BrandfetchOfficialLogoEvidence> {
  const normalized = normalizeProviderLogoCandidates(payload);
  if (!normalized.candidates.length) {
    return {
      status: normalized.rejectedCandidateCount ? "rejected" : "missing",
      source: "brandfetch",
      candidateCount: 0,
      rejectedCandidateCount: normalized.rejectedCandidateCount
    };
  }
  if (provider.loadPortableLogo) {
    let rejectedCandidateCount = normalized.rejectedCandidateCount;
    for (const candidate of normalized.candidates) {
      const portable = await provider.loadPortableLogo(candidate.src, signal);
      if (portable?.source === "brandfetch") {
        return {
          status: "verified",
          source: "brandfetch",
          delivery: "portable",
          url: candidate.src,
          portable,
          candidateCount: normalized.candidates.length,
          rejectedCandidateCount
        };
      }
      rejectedCandidateCount += 1;
    }
    return {
      status: "rejected",
      source: "brandfetch",
      candidateCount: normalized.candidates.length,
      rejectedCandidateCount
    };
  }
  const lightSurface = normalized.candidates.find(({ theme }) => theme === "dark")
    ?? normalized.candidates[0];
  const darkSurface = normalized.candidates.find(({ theme }) => theme === "light")
    ?? lightSurface;
  return {
    status: "verified",
    source: "brandfetch",
    delivery: "brandfetch-hotlink",
    url: lightSurface?.src,
    urlOnDark: darkSurface?.src,
    candidateCount: normalized.candidates.length,
    rejectedCandidateCount: normalized.rejectedCandidateCount
  };
}

function artifactBase(
  request: BrandfetchRetrieverRequest,
  startedAt: string,
  completedAt: string
): Pick<
  BrandfetchEvidenceArtifact,
  "worker" | "sessionId" | "revision" | "startedAt" | "completedAt"
> {
  return {
    worker: "brandfetch-retriever",
    sessionId: request.sessionId,
    revision: request.revision,
    startedAt,
    completedAt
  };
}

/**
 * Retrieve bounded official Brandfetch evidence for identity-authorized
 * canonical or alias domains. Provider payloads and asset URLs never enter
 * evidence refs, fallback codes, or errors.
 */
export async function retrieveBrandfetchEvidence(
  request: BrandfetchRetrieverRequest,
  provider: BrandfetchRetrieverProvider
): Promise<BrandfetchEvidenceArtifact> {
  const now = request.now ?? (() => new Date());
  const startedAt = now().toISOString();
  const canonicalDomain = normalizeLogoDomain(request.canonicalDomain);
  const domains = [...new Set([
    canonicalDomain,
    ...(request.aliases ?? []).map(normalizeLogoDomain)
  ].filter((domain): domain is string => Boolean(domain)))];
  if (!canonicalDomain) {
    const completedAt = now().toISOString();
    return {
      ...artifactBase(request, startedAt, completedAt),
      status: "failed",
      evidenceRefs: [],
      confidence: 0,
      errorCode: "brandfetch_invalid_domain"
    };
  }

  const controller = new AbortController();
  const timeoutMs = Math.min(
    Math.max(request.deadlineMs ?? DEFAULT_RETRIEVER_DEADLINE_MS, 1),
    DEFAULT_RETRIEVER_DEADLINE_MS
  );
  let timedOut = false;
  const onAbort = () => controller.abort(request.signal?.reason);
  request.signal?.addEventListener("abort", onAbort, { once: true });
  if (request.signal?.aborted) onAbort();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort();
      reject(new BrandfetchRetrieverTimeout());
    }, timeoutMs);
  });

  let terminalStatus: Exclude<BrandfetchProviderStatus, "hit"> = "missing";
  try {
    for (const domain of domains) {
      const lookup = await Promise.race([
        provider.lookup(domain, controller.signal),
        deadline
      ]);
      if (lookup.status !== "hit") {
        terminalStatus = lookup.status;
        continue;
      }
      if (!lookup.payload || typeof lookup.payload !== "object" || Array.isArray(lookup.payload)) {
        terminalStatus = "invalid_response";
        continue;
      }
      const payload = lookup.payload as Record<string, unknown>;
      const returnedDomain = typeof payload.domain === "string"
        ? normalizeLogoDomain(payload.domain)
        : undefined;
      if (!returnedDomain || !domains.includes(returnedDomain)) {
        terminalStatus = "invalid_response";
        continue;
      }
      const logo = await Promise.race([
        selectProviderLogo(payload, provider, controller.signal),
        deadline
      ]);
      const colors = (Array.isArray(payload.colors) ? payload.colors : [])
        .map(normalizeProviderColor)
        .filter((color): color is BrandfetchColorEvidence => Boolean(color))
        .filter((color, index, values) =>
          values.findIndex(({ hex }) => hex === color.hex) === index
        )
        .slice(0, 8);
      const fonts = (Array.isArray(payload.fonts) ? payload.fonts : [])
        .map(normalizeProviderFont)
        .filter((font): font is BrandfetchFontEvidence => Boolean(font))
        .filter((font, index, values) =>
          values.findIndex(({ name }) => name.toLowerCase() === font.name.toLowerCase()) === index
        )
        .slice(0, 8);
      const value: BrandfetchEvidence = {
        canonicalDomain,
        matchedDomain: returnedDomain,
        aliases: domains.filter((candidate) => candidate !== canonicalDomain),
        companyName: boundedProviderText(payload.name, 120),
        description: boundedProviderText(
          payload.description ?? payload.longDescription,
          500
        ),
        colors,
        fonts,
        claimed: typeof payload.claimed === "boolean" ? payload.claimed : undefined,
        qualityTier: providerQualityTier(payload.qualityScore),
        logo
      };
      const completedAt = now().toISOString();
      return {
        ...artifactBase(request, startedAt, completedAt),
        status: logo.status === "verified" ? "complete" : "fallback",
        value,
        evidenceRefs: [
          "brandfetch:brand-record",
          ...(logo.status === "verified" ? ["brandfetch:official-logo"] : [])
        ],
        confidence: logo.status === "verified"
          ? payload.claimed === true ? 0.98 : 0.9
          : colors.length || fonts.length ? 0.72 : 0.55,
        ...(logo.status === "verified"
          ? {}
          : { fallbackCode: `brandfetch_logo_${logo.status}` })
      };
    }
    const completedAt = now().toISOString();
    const missing = terminalStatus === "missing";
    return {
      ...artifactBase(request, startedAt, completedAt),
      status: missing ? "fallback" : "failed",
      evidenceRefs: [],
      confidence: 0,
      ...(missing
        ? { fallbackCode: "brandfetch_not_found" }
        : { errorCode: `brandfetch_${terminalStatus}` })
    };
  } catch (error) {
    const completedAt = now().toISOString();
    const stale = request.signal?.aborted && !timedOut;
    const timeout = timedOut || error instanceof BrandfetchRetrieverTimeout;
    return {
      ...artifactBase(request, startedAt, completedAt),
      status: stale ? "stale" : timeout ? "timed_out" : "failed",
      evidenceRefs: [],
      confidence: 0,
      ...(stale
        ? { fallbackCode: "brandfetch_stale" }
        : timeout
          ? { fallbackCode: "brandfetch_timeout" }
          : { errorCode: "brandfetch_provider_failed" })
    };
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
    request.signal?.removeEventListener("abort", onAbort);
  }
}

/**
 * Build the Logo API hotlink Brandfetch requires. The client ID is explicitly
 * a browser credential; the server-only Brand API key never enters this URL.
 */
export function brandfetchLogoApiUrl(
  domain: string,
  clientId: string | undefined,
  theme: BrandfetchLogoTheme,
  type: BrandfetchLogoType = "logo"
): string | undefined {
  const normalized = normalizeLogoDomain(domain);
  const normalizedClientId = clientId?.trim();
  if (!normalized || !normalizedClientId || !BRANDFETCH_CLIENT_ID.test(normalizedClientId)) {
    return undefined;
  }
  const url = new URL(
    `https://${BRANDFETCH_LOGO_HOST}/domain/${encodeURIComponent(normalized)}` +
      `/w/320/h/96/theme/${theme}/fallback/404/type/${type}`
  );
  url.searchParams.set("c", normalizedClientId);
  return url.toString();
}

/**
 * Return a bounded render recovery chain without ever falling back to a
 * generic or broken image. The browser tries the wordmark first, then a
 * symbol and icon from the same verified brand/domain.
 */
export function brandfetchLogoApiCandidates(
  domain: string,
  clientId: string | undefined,
  theme: BrandfetchLogoTheme
): string[] {
  return (["logo", "symbol", "icon"] as const)
    .map((type) => brandfetchLogoApiUrl(domain, clientId, theme, type))
    .filter((value): value is string => Boolean(value));
}

export function brandfetchLogoRecoveryUrls(
  value: string | undefined,
  expectedDomain?: string
): string[] {
  if (!isBrandfetchLogoApiUrl(value, expectedDomain) || !value) return value ? [value] : [];
  const parsed = new URL(value);
  const match = parsed.pathname.match(
    /^\/domain\/([^/]+)\/w\/320\/h\/96\/theme\/(light|dark)\/fallback\/404\/type\/(logo|symbol|icon)$/
  );
  if (!match?.[1] || !match[2]) return [value];
  const domain = decodeURIComponent(match[1]);
  const clientId = parsed.searchParams.get("c") ?? undefined;
  return brandfetchLogoApiCandidates(domain, clientId, match[2] as BrandfetchLogoTheme);
}

/**
 * Trust only the exact Logo API URL shape emitted above. This permits direct
 * browser hotlinking while preventing arbitrary remote images from bypassing
 * the session-scoped image delivery boundary.
 */
export function isBrandfetchLogoApiUrl(
  value: string | undefined,
  expectedDomain?: string
): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.hostname !== BRANDFETCH_LOGO_HOST ||
      url.port ||
      url.username ||
      url.password ||
      url.hash
    ) return false;
    if (url.searchParams.size !== 1) return false;
    const clientId = url.searchParams.get("c");
    if (!clientId || !BRANDFETCH_CLIENT_ID.test(clientId)) return false;
    const match = url.pathname.match(
      /^\/domain\/([^/]+)\/w\/320\/h\/96\/theme\/(light|dark)\/fallback\/404\/type\/(logo|symbol|icon)$/
    );
    const embeddedDomain = match?.[1]
      ? normalizeLogoDomain(decodeURIComponent(match[1]))
      : undefined;
    const expected = expectedDomain ? normalizeLogoDomain(expectedDomain) : undefined;
    return Boolean(embeddedDomain && (!expectedDomain || embeddedDomain === expected));
  } catch {
    return false;
  }
}

/**
 * Brand API responses include versioned CDN asset URLs that are intended to
 * be rendered directly. Keep them on the same browser-hotlink path as Logo
 * API URLs instead of sending them through the first-party image proxy.
 */
export function isBrandfetchHostedLogoUrl(
  value: string | undefined,
  expectedDomain?: string
): boolean {
  if (isBrandfetchLogoApiUrl(value, expectedDomain)) return true;
  if (!value) return false;
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:"
      || url.hostname !== BRANDFETCH_LOGO_HOST
      || url.port
      || url.username
      || url.password
      || url.hash
      || url.searchParams.size !== 1
    ) return false;
    const clientId = url.searchParams.get("c");
    return Boolean(
      clientId
        && BRANDFETCH_CLIENT_ID.test(clientId)
        && /^\/[A-Za-z0-9_-]{4,80}(?:\/[A-Za-z0-9._-]{1,80}){2,12}$/.test(url.pathname)
    );
  } catch {
    return false;
  }
}
