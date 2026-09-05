// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
type Options = Record<string, unknown>;
let options: Options;
const remove = vi.fn();
const render = vi.fn((_container: HTMLElement, value: Options) => { options = value; return "widget"; });
const callback = (name: string, value?: unknown) => (options[name] as (value?: unknown) => void)(value);
const tick = async () => { await Promise.resolve(); await Promise.resolve(); };
async function module() { vi.resetModules(); return import("./turnstile-client"); }
function api() { window.turnstile = { render, remove }; }
beforeEach(() => {
  vi.useFakeTimers(); vi.clearAllMocks();
  process.env.NEXT_PUBLIC_TURNSTILE_ENABLED = "true";
  process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = "test-site-key";
  document.head.innerHTML = ""; document.body.innerHTML = "";
  delete window.turnstile;
  render.mockImplementation((_container, value) => { options = value; return "widget"; });
});
afterEach(() => {
  vi.useRealTimers(); delete window.turnstile;
  delete process.env.NEXT_PUBLIC_TURNSTILE_ENABLED; delete process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
});
describe("Turnstile client lifecycle", () => {
  it("does not load an external script when disabled", async () => {
    process.env.NEXT_PUBLIC_TURNSTILE_ENABLED = "false";
    expect(await (await module()).requestBotToken("session_create")).toBeUndefined();
    expect(document.querySelector("script")).toBeNull();
  });
  it("requires a site key", async () => {
    delete process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
    await expect((await module()).requestBotToken("session_create")).rejects.toThrow("missing");
  });
  it("loads the script, returns a token, and cleans up", async () => {
    const pending = (await module()).requestBotToken("session_create");
    const script = document.querySelector("script")!;
    expect(script.getAttribute("src")).toContain("challenges.cloudflare.com");
    api(); script.dispatchEvent(new Event("load")); await tick();
    expect(document.querySelector("[role=dialog] button")?.textContent).toBe("Cancel");
    callback("callback", "valid-token"); expect(await pending).toBe("valid-token");
    expect(remove).toHaveBeenCalledWith("widget"); expect(document.querySelector("[role=dialog]")).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("removes failed scripts and retries with a new element", async () => {
    const client = await module(); const pending = client.requestBotToken("session_create");
    const rejection = expect(pending).rejects.toThrow("load");
    document.querySelector("script")!.dispatchEvent(new Event("error")); await rejection;
    expect(document.querySelector("script")).toBeNull();
    const retry = client.requestBotToken("session_create");
    const script = document.querySelector("script")!; api(); script.dispatchEvent(new Event("load")); await tick();
    callback("callback", "next-token"); expect(await retry).toBe("next-token");
  });
  it("bounds script loading", async () => {
    const pending = (await module()).requestBotToken("session_create");
    const rejection = expect(pending).rejects.toThrow("load in time");
    await vi.advanceTimersByTimeAsync(5000); await rejection;
    expect(document.querySelector("script")).toBeNull();
  });
  it("rejects concurrent requests instead of sharing single-use tokens", async () => {
    api(); const client = await module(); const pending = client.requestBotToken("session_create"); await tick();
    await expect(client.requestBotToken("session_create")).rejects.toThrow("already in progress");
    callback("callback", "unique"); expect(await pending).toBe("unique");
  });
  it.each(["error-callback", "expired-callback"])("cleans up after %s", async (name) => {
    api(); const pending = (await module()).requestBotToken("session_create"); await tick();
    const rejection = expect(pending).rejects.toThrow(); callback(name); await rejection;
    expect(remove).toHaveBeenCalledWith("widget"); expect(document.body.children).toHaveLength(0);
  });
  it.each(["", 12, "x".repeat(2049)])("rejects invalid token %s", async (token) => {
    api(); const pending = (await module()).requestBotToken("session_create"); await tick();
    const rejection = expect(pending).rejects.toThrow("invalid token"); callback("callback", token); await rejection;
    expect(remove).toHaveBeenCalledWith("widget");
  });
  it("cleans up even when a provider callback runs synchronously", async () => {
    render.mockImplementation((_container, value) => { (value.callback as (token: string) => void)("sync-token"); return "widget"; });
    api(); expect(await (await module()).requestBotToken("session_create")).toBe("sync-token");
    expect(remove).toHaveBeenCalledWith("widget"); expect(document.body.children).toHaveLength(0);
  });
  it("allows cancellation", async () => {
    api(); const pending = (await module()).requestBotToken("session_create"); await tick();
    const rejection = expect(pending).rejects.toThrow("cancelled");
    document.querySelector("button")!.click(); await rejection;
    expect(remove).toHaveBeenCalledWith("widget");
  });
  it("bounds the complete challenge and clears its dialog", async () => {
    api(); const pending = (await module()).requestBotToken("session_create"); await tick();
    const rejection = expect(pending).rejects.toThrow("timed out");
    await vi.advanceTimersByTimeAsync(30_000); await rejection;
    expect(remove).toHaveBeenCalledWith("widget"); expect(document.body.children).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
  });
});
