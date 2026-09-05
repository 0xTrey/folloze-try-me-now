import { createRequire } from "node:module";
import { afterEach, describe, expect, it, vi } from "vitest";
import { appendOwnerHandoff } from "./owner-handoff";

type TestDom = { window: Window & typeof globalThis };
const { JSDOM } = createRequire(import.meta.url)("jsdom") as {
  JSDOM: new (html: string, options: { url: string; runScripts: string; beforeParse: (window: TestDom["window"]) => void }) => TestDom;
};
const windows: TestDom[] = [];
afterEach(() => { windows.forEach(dom => dom.window.close()); windows.length = 0; });
const flush = async () => { await new Promise(resolve => setTimeout(resolve, 0)); };
function runtime(status = 200, request?: { status: string }, reject = false) {
  const fetch = reject ? vi.fn().mockRejectedValue(new Error("offline")) : vi.fn().mockResolvedValue({ ok: status === 200, json: async () => ({ session: { id: "ready-session" }, request }) });
  const analytics = vi.fn();
  const dom = new JSDOM(appendOwnerHandoff("<html><body><button id='before'>Explore</button></body></html>", "ready-session", "test-nonce", false), {
    url: "https://preview.example/e/ready-session",
    runScripts: "dangerously",
    beforeParse(window) {
      window.fetch = fetch;
      Object.assign(window, { flzAnalytic: analytics });
      Object.defineProperty(window, "innerHeight", { value: 500 });
      window.HTMLDialogElement.prototype.showModal = function() { this.setAttribute("open", ""); this.querySelector<HTMLAnchorElement>("a")?.focus(); };
      window.HTMLDialogElement.prototype.close = function() { this.removeAttribute("open"); this.dispatchEvent(new window.Event("close")); };
    }
  });
  windows.push(dom);
  Object.defineProperty(dom.window.document.documentElement, "scrollHeight", { value: 1_000 });
  const scroll = (top: number) => { dom.window.document.documentElement.scrollTop = top; dom.window.dispatchEvent(new dom.window.Event("scroll")); };
  return { dom, fetch, analytics, scroll };
}

describe("standalone owner handoff", () => {
  it("does not inject into embedded or invalid locator documents", () => {
    const html = "<body>Experience</body>";
    expect(appendOwnerHandoff(html, "ready-session", "nonce", true)).toBe(html);
    expect(appendOwnerHandoff(html, "</script>", "nonce", false)).toBe(html);
    expect(appendOwnerHandoff(html, "ready-session", "nonce", false)).toContain('data-flz-handoff nonce="nonce"');
  });
  it("waits for a real bottom scroll then authenticates once and presents two owned links", async () => {
    const { dom, fetch, scroll } = runtime();
    const { document } = dom.window;
    document.querySelector<HTMLButtonElement>("#before")!.focus();
    expect(fetch).not.toHaveBeenCalled();
    scroll(150);
    expect(fetch).not.toHaveBeenCalled();
    scroll(500);
    await flush();
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[0][0]).toBe("/api/sessions/ready-session/resume");
    expect(fetch.mock.calls[0][1]).toMatchObject({ credentials: "same-origin", cache: "no-store" });
    const dialog = document.querySelector<HTMLDialogElement>("dialog")!;
    expect(dialog.hasAttribute("open")).toBe(true);
    const links = [...dialog.querySelectorAll<HTMLAnchorElement>("a")];
    expect(links.map(link => link.textContent)).toEqual(["View Engagement Analytics", "Personalize for 3 Accounts"]);
    expect(links.map(link => link.getAttribute("href"))).toEqual(["/?session=ready-session&panel=analytics", "/?session=ready-session&panel=personalize"]);
    expect(dialog.querySelector("form")).toBeNull();
    dialog.querySelector<HTMLButtonElement>("button")!.click();
    expect(document.querySelector("dialog")).toBeNull();
    expect(document.activeElement?.id).toBe("before");
    scroll(500);
    await flush();
    expect(fetch).toHaveBeenCalledOnce();
  });
  it.each([403, 410])("does not show private controls or retry scrolls after %s", async status => {
    const { dom, fetch, scroll } = runtime(status);
    scroll(500); await flush(); scroll(500); await flush();
    expect(dom.window.document.querySelector("dialog")).toBeNull();
    expect(fetch).toHaveBeenCalledOnce();
  });
  it("fails quietly when the owner check is unavailable", async () => {
    const { dom, fetch, scroll } = runtime(200, undefined, true);
    scroll(500); await flush(); scroll(500);
    expect(dom.window.document.querySelector("dialog")).toBeNull();
    expect(fetch).toHaveBeenCalledOnce();
  });
  it.each([["awaiting_targets", "Continue Personalization"], ["generating", "View Account Request"], ["ready", "View Account Versions"]])("preserves the %s request action", async (status, label) => {
    const { dom, scroll } = runtime(200, { status });
    scroll(500); await flush();
    expect(dom.window.document.querySelector('[data-choice="personalize-accounts"]')?.textContent).toBe(label);
  });
  it("carries safe activity to the requested panel without putting it in a URL", async () => {
    const { dom, analytics, scroll } = runtime();
    const flz = (dom.window as unknown as { flzAnalytic: (action: string, data: unknown) => void }).flzAnalytic;
    flz("section_view", { sectionId: "value", sectionTitle: "Value story", email: "private@example.com" });
    scroll(500); await flush();
    const link = dom.window.document.querySelector<HTMLAnchorElement>('[data-choice="view-engagement"]')!;
    link.addEventListener("click", event => event.preventDefault());
    link.click();
    const raw = dom.window.sessionStorage.getItem("tmn_handoff_ready-session")!;
    expect(raw).toContain("Value story");
    expect(raw).not.toContain("private@example.com");
    expect(analytics).not.toHaveBeenCalledWith("cta_click", expect.anything());
    expect(link.href).not.toContain("Value");
  });
});
