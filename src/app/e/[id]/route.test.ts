import { describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ html: '<html><head><title>Saved copy</title></head><body><p class="eyebrow">Reasons to believe</p><h2>Existing headline</h2><script data-flz-runtime>window.flzAnalytic=function(){};</script></body></html>' }));
vi.mock("@/lib/session-store", () => ({ getSession: vi.fn(async () => ({ id: "saved-session", experience: { html: state.html } })), toPublicSession: vi.fn(value => value) }));
vi.mock("@/lib/preview-lifecycle", () => ({ canRevealFinalExperience: vi.fn(() => true) }));
import { GET } from "./route";

describe("saved experience presentation delivery", () => {
  it.each(["", "?embed=1"])("upgrades saved HTML without changing its copy, stored artifact, or runtime protections (%s)", async suffix => {
    const original = state.html;
    const response = await GET(new Request(`https://preview.example/e/saved-session${suffix}`), { params: Promise.resolve({ id: "saved-session" }) });
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(html).not.toContain('<p class="eyebrow">');
    expect(html).toContain("<h2>Existing headline</h2>");
    expect(html).toContain('data-flz-presentation="responsive-media-v1"');
    expect(html).toMatch(/<script data-flz-runtime nonce="[^"]+"/);
    expect(response.headers.get("content-security-policy")).toContain("script-src 'nonce-");
    expect(html.includes("data-flz-handoff")).toBe(!suffix);
    expect(state.html).toBe(original);
  });
});
