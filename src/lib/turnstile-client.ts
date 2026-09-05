const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
const MAX_TOKEN_LENGTH = 2048;
const TIMEOUT_MS = 30_000;
type Turnstile = { render(container: HTMLElement, options: Record<string, unknown>): string | number; remove(widget: string | number): void };
declare global { interface Window { turnstile?: Turnstile } }

let scriptPromise: Promise<void> | undefined;
let active: { action: string; promise: Promise<string | undefined> } | undefined;
const SCRIPT_TIMEOUT_MS = 5_000;

function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
    const script = existing ?? document.createElement("script");
    const done = () => {
      clearTimeout(timeout);
      if (window.turnstile) resolve();
      else { script.remove(); reject(new Error("Turnstile loaded without its API.")); }
    };
    script.addEventListener("load", done, { once: true });
    const timeout = setTimeout(() => { script.remove(); reject(new Error("Turnstile could not load in time.")); }, SCRIPT_TIMEOUT_MS);
    script.addEventListener("error", () => { clearTimeout(timeout); script.remove(); reject(new Error("Turnstile could not load.")); }, { once: true });
    if (!existing) { script.src = SCRIPT_SRC; script.async = true; script.defer = true; document.head.appendChild(script); }
  }).catch((error) => { scriptPromise = undefined; throw error; });
  return scriptPromise;
}

export function requestBotToken(action: string): Promise<string | undefined> {
  if (process.env.NEXT_PUBLIC_TURNSTILE_ENABLED !== "true") return Promise.resolve(undefined);
  if (!/^[A-Za-z0-9._:-]{1,80}$/.test(action)) return Promise.reject(new Error("Turnstile action is invalid."));
  if (active) return Promise.reject(new Error("A security check is already in progress."));
  const promise = runChallenge(action).finally(() => { active = undefined; });
  active = { action, promise };
  return promise;
}

async function runChallenge(action: string): Promise<string | undefined> {
  const deadline = Date.now() + TIMEOUT_MS;
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim();
  if (!siteKey) throw new Error("Turnstile is enabled but NEXT_PUBLIC_TURNSTILE_SITE_KEY is missing.");
  await loadScript();
  if (!window.turnstile) throw new Error("Turnstile is unavailable.");
  const container = document.createElement("div");
  container.setAttribute("role", "dialog");
  container.setAttribute("aria-label", "Security check");
  Object.assign(container.style, { position: "fixed", inset: "auto 20px 20px auto", zIndex: "10000", padding: "18px", background: "#fff", border: "1px solid #d7d9df", borderRadius: "12px", boxShadow: "0 18px 50px rgba(0,0,0,.18)" });
  const label = document.createElement("p"); label.textContent = "Security check"; label.style.margin = "0 0 10px"; container.appendChild(label);
  const cancel = document.createElement("button"); cancel.type = "button"; cancel.textContent = "Cancel"; cancel.style.marginTop = "10px"; container.appendChild(cancel);
  const challenge = document.createElement("div"); challenge.setAttribute("aria-live", "polite"); container.appendChild(challenge);
  document.body.appendChild(container);
  let widget: string | number | undefined;
  return new Promise<string | undefined>((resolve, reject) => {
    let settled = false;
    const cleanup = () => { if (widget !== undefined) window.turnstile?.remove(widget); container.remove(); };
    const finish = (error?: Error, token?: string) => { if (settled) return; settled = true; clearTimeout(timer); cleanup(); if (error) reject(error); else resolve(token); };
    const timer = setTimeout(() => finish(new Error("Turnstile security check timed out.")), Math.max(1, deadline - Date.now()));
    cancel.addEventListener("click", () => finish(new Error("Turnstile security check cancelled.")), { once: true });
    try {
      const rendered = window.turnstile!.render(challenge, { sitekey: siteKey, action, callback: (token: unknown) => typeof token === "string" && token.length > 0 && token.length <= MAX_TOKEN_LENGTH ? finish(undefined, token) : finish(new Error("Turnstile returned an invalid token.")), "error-callback": () => finish(new Error("Turnstile security check failed.")), "expired-callback": () => finish(new Error("Turnstile security check expired.")) });
      widget = rendered;
      if (settled) cleanup();
    } catch (error) { finish(error instanceof Error ? error : new Error("Turnstile could not start.")); }
  });
}

export const turnstileClientConfig = { scriptSrc: SCRIPT_SRC, timeoutMs: TIMEOUT_MS, maxTokenLength: MAX_TOKEN_LENGTH } as const;
