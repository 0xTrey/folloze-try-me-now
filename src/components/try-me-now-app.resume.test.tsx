// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ExperienceNextStepsDialog, TryMeNowApp } from "./try-me-now-app";
import type { PublicTryMeSession } from "@/lib/types";

const readySession = {
  id: "valid-id", supportRef: "TMN-VALID", useCase: "campaign", companyDomain: "jitterbit.com",
  status: "preview_ready_unclaimed", createdAt: "2026-09-05T10:00:00Z", updatedAt: "2026-09-05T10:01:00Z",
  temporaryUrl: "https://example.test/e/valid-id", revision: 2,
  stages: { brand: { status: "complete" }, audience: { status: "complete" }, story: { status: "complete" } },
  answers: { campaignType: "product", promotedOffer: "Harmony", audience: "Enterprise architects", objective: "Generate demand" },
  brand: { domain: "jitterbit.com", companyName: "Jitterbit", colors: ["#1B3E51"], primaryColor: "#1B3E51", accentColor: "#F44414", surfaceColor: "#fff", source: "brand-harvester", readiness: { status: "ready", identityReady: true, logoReady: true, paletteReady: true, designReady: true, sourceEvidenceReady: true, reasons: [] } },
  audienceSuggestions: [], experience: { ready: true, title: "Jitterbit", headline: "Harmony", readiness: "final", artifactRevision: 1, generationSource: "fixture" },
  finalArtifact: { readiness: "final", artifactRevision: 1, structuralGate: "passed", truthGate: "passed", persistedAt: "2026-09-05T10:01:00Z", readBackAt: "2026-09-05T10:01:00Z" },
  evidence: [],
  generation: { status: "complete" }
} as unknown as PublicTryMeSession;

afterEach(() => { cleanup(); vi.restoreAllMocks(); window.history.replaceState({}, "", "/"); window.sessionStorage.clear(); });
beforeEach(() => {
  window.history.replaceState({}, "", "/?session=valid-id&panel=analytics");
  vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
});

describe("resume flow", () => {
  it("restores analytics and consumes transferred handoff activity without creating or patching", async () => {
    window.sessionStorage.setItem("tmn_handoff_valid-id", JSON.stringify({ savedAt: Date.now(), events: [{ action: "section_view", at: Date.now(), context: { sectionId: "experience-overview", sectionTitle: "Your value story" } }], engagedSeconds: 32 }));
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => new Response(String(input).includes("/resume") ? JSON.stringify({ session: readySession }) : JSON.stringify({}), { status: 200, headers: { "content-type": "application/json" } }));
    render(<TryMeNowApp />);
    await screen.findByRole("heading", { name: "See what buyers engage with." });
    expect(screen.getAllByText(/Your value story/).length).toBeGreaterThan(0);
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes("/api/sessions/valid-id/resume"))).toBe(true);
    expect(window.sessionStorage.getItem("tmn_handoff_valid-id")).toBeNull();
    expect(fetchMock.mock.calls.some(([input, init]) => String(input) === "/api/sessions" && init?.method === "POST")).toBe(false);
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "PATCH")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Close analytics signals" }));
    expect(screen.getByRole("heading", { name: "Your Jitterbit experience is ready." })).toBeInTheDocument();
    expect(screen.getByTitle("Generated buyer experience preview")).toBeInTheDocument();
  });

  it("reopens existing account versions and retains their top button after closing", async () => {
    window.history.replaceState({}, "", "/?session=valid-id&panel=personalize");
    const request = { id: "request-id", sessionId: "valid-id", emailMasked: "q***@example.com", status: "completed", targetCount: 3, variantCount: 3, baselineArtifactRevision: 1, delivery: { status: "accepted" }, targets: [
      { id: "one", position: 1, domain: "one.com", status: "ready", link: "/e/account-one" },
      { id: "two", position: 2, domain: "two.com", status: "ready", link: "/e/account-two" },
      { id: "three", position: 3, domain: "three.com", status: "ready", link: "/e/account-three" }
    ] };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async input => new Response(String(input).includes("/resume") ? JSON.stringify({ session: readySession, request }) : "{}", { status: 200, headers: { "content-type": "application/json" } }));
    render(<TryMeNowApp />);
    await screen.findByRole("button", { name: "Close personalization request" });
    expect(document.querySelector('a[href="/e/account-one"]')).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close personalization request" }));
    expect(screen.getByRole("button", { name: "View account versions" })).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes("personalization-request"))).toBe(false);
  });

  it.each([403, 410])("provides recovery without edit controls on a %s response", async status => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async input => new Response(JSON.stringify({ error: String(input).includes("/resume") ? "Open the original browser or start again." : "Unavailable" }), { status, headers: { "content-type": "application/json" } }));
    render(<TryMeNowApp />);
    await screen.findByRole("heading", { name: "We couldn't reopen this experience." });
    expect(screen.queryByRole("button", { name: "Edit Brief" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Start a new experience" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Build personalized campaign pages from the tools you already use." })).toBeInTheDocument());
    expect(window.location.search).toBe("");
  });

  it("provides the two next-step actions and closes on Escape", () => {
    const onClose = vi.fn(), onAnalytics = vi.fn(), onPersonalize = vi.fn();
    render(<ExperienceNextStepsDialog onClose={onClose} onAnalytics={onAnalytics} onPersonalize={onPersonalize} personalizationLabel="View account versions" />);
    fireEvent.click(screen.getByRole("button", { name: "View Engagement Analytics" }));
    fireEvent.click(screen.getByRole("button", { name: "View account versions" }));
    expect(onAnalytics).toHaveBeenCalledOnce(); expect(onPersonalize).toHaveBeenCalledOnce();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });
});
