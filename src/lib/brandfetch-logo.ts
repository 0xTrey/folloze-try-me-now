const BRANDFETCH_LOGO_HOST = "cdn.brandfetch.io";
const BRANDFETCH_CLIENT_ID = /^[A-Za-z0-9_-]{8,80}$/;
const PUBLIC_DOMAIN = /^(?=.{1,253}$)(?!-)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;

export type BrandfetchLogoTheme = "light" | "dark";

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

/**
 * Build the Logo API hotlink Brandfetch requires. The client ID is explicitly
 * a browser credential; the server-only Brand API key never enters this URL.
 */
export function brandfetchLogoApiUrl(
  domain: string,
  clientId: string | undefined,
  theme: BrandfetchLogoTheme
): string | undefined {
  const normalized = normalizeLogoDomain(domain);
  const normalizedClientId = clientId?.trim();
  if (!normalized || !normalizedClientId || !BRANDFETCH_CLIENT_ID.test(normalizedClientId)) {
    return undefined;
  }
  const url = new URL(
    `https://${BRANDFETCH_LOGO_HOST}/domain/${encodeURIComponent(normalized)}` +
      `/w/320/h/96/theme/${theme}/fallback/404/type/logo`
  );
  url.searchParams.set("c", normalizedClientId);
  return url.toString();
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
      /^\/domain\/([^/]+)\/w\/320\/h\/96\/theme\/(light|dark)\/fallback\/404\/type\/logo$/
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
