import type { NextRequest, NextResponse } from "next/server";

const LEGACY_EDITOR_COOKIE = "tmn_editor";
const EDITOR_COOKIE_PREFIX = "tmn_editor_";
const EDITOR_COOKIE_INDEX = "tmn_editor_index";
const MAX_SCOPED_EDITOR_COOKIES = 5;
const EDITOR_COOKIE_MAX_AGE_SECONDS = 86_400;

function safeSessionId(id: string): string {
  return id.replace(/[^a-z0-9_-]/gi, "_").slice(0, 128);
}

export function editorCookieName(id: string): string {
  return `${EDITOR_COOKIE_PREFIX}${safeSessionId(id)}`;
}

function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/api/sessions",
    maxAge: EDITOR_COOKIE_MAX_AGE_SECONDS
  };
}

function indexedSessionIds(request: NextRequest): string[] {
  const indexed = request.cookies
    .get(EDITOR_COOKIE_INDEX)
    ?.value.split(",")
    .map((value) => safeSessionId(value.trim()))
    .filter(Boolean);
  if (indexed?.length) return [...new Set(indexed)];

  // Cookies created between the scoped-cookie rollout and the index rollout are
  // still bounded even when no companion index exists yet.
  return request.cookies
    .getAll()
    .map(({ name }) =>
      name.startsWith(EDITOR_COOKIE_PREFIX) && name !== EDITOR_COOKIE_INDEX
        ? name.slice(EDITOR_COOKIE_PREFIX.length)
        : ""
    )
    .filter(Boolean);
}

export function readEditorToken(request: NextRequest, id: string): string | undefined {
  const scoped = request.cookies.get(editorCookieName(id))?.value;
  if (scoped) return scoped;

  // Transition support for sessions created before scoped cookies shipped.
  const legacy = request.cookies.get(LEGACY_EDITOR_COOKIE)?.value;
  if (!legacy) return undefined;
  const separator = legacy.indexOf(".");
  if (separator < 1) return undefined;
  return legacy.slice(0, separator) === id ? legacy.slice(separator + 1) || undefined : undefined;
}

export function setEditorTokenCookie(
  request: NextRequest,
  response: NextResponse,
  id: string,
  token: string
): void {
  const normalizedId = safeSessionId(id);
  const existing = indexedSessionIds(request).filter((candidate) => candidate !== normalizedId);
  const next = [normalizedId, ...existing].slice(0, MAX_SCOPED_EDITOR_COOKIES);
  const dropped = new Set(
    [...existing, ...indexedSessionIds(request)].filter((candidate) => !next.includes(candidate))
  );

  response.cookies.set(editorCookieName(normalizedId), token, cookieOptions());
  response.cookies.set(EDITOR_COOKIE_INDEX, next.join(","), cookieOptions());
  for (const staleId of dropped) {
    response.cookies.set(editorCookieName(staleId), "", {
      ...cookieOptions(),
      maxAge: 0
    });
  }
}
