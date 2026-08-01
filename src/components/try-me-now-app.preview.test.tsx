// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { PublicTryMeSession } from "@/lib/types";

import { AssemblyPreview, PreviewUpdateNotice, SaveExperienceDialog } from "./try-me-now-app";

afterEach(() => cleanup());

const readySession: PublicTryMeSession = {
  id: "desktop-preview-session",
  supportRef: "TMN-DESKTOPPREV",
  useCase: "campaign",
  companyDomain: "jitterbit.com",
  status: "preview_ready_unclaimed",
  createdAt: "2026-07-31T10:00:00.000Z",
  updatedAt: "2026-07-31T10:00:10.000Z",
  temporaryUrl: "https://example.test/e/desktop-preview-session",
  revision: 2,
  stages: {
    brand: { status: "complete" },
    audience: { status: "complete" },
    story: { status: "complete" }
  },
  answers: { audience: "Enterprise architects", objective: "Generate demand" },
  brand: {
    domain: "jitterbit.com",
    companyName: "Jitterbit",
    colors: ["#1B3E51", "#F44414"],
    primaryColor: "#1B3E51",
    accentColor: "#F44414",
    surfaceColor: "#FFFFFF",
    source: "brand-harvester"
  },
  audienceSuggestions: [],
  experience: {
    ready: true,
    title: "Jitterbit campaign",
    headline: "A generated buyer experience",
    generationSource: "openai",
    artifactRevision: 1
  }
};

describe("AssemblyPreview", () => {
  it("keeps the generated desktop page as a focusable native scroll region", () => {
    render(<AssemblyPreview session={readySession} />);

    const frame = screen.getByTitle("Generated buyer experience preview");
    expect(frame).toHaveAttribute("src", "/e/desktop-preview-session?embed=1");
    expect(frame).toHaveAttribute("scrolling", "yes");
    expect(frame).toHaveAttribute("tabindex", "0");
    expect(frame).toHaveAttribute("data-preview-scroll", "contained");
  });

  it("uses the first-party image route for the in-progress brand logo", () => {
    render(
      <AssemblyPreview
        session={{
          ...readySession,
          status: "collecting",
          brand: {
            ...readySession.brand!,
            logoUrl: "https://cdn.example.test/jitterbit-logo.svg"
          },
          stages: {
            ...readySession.stages,
            story: { status: "running" }
          },
          experience: undefined
        }}
      />
    );

    expect(screen.getByRole("img", { name: "Jitterbit logo" })).toHaveAttribute(
      "src",
      "/api/sessions/desktop-preview-session/image/seller-logo"
    );
  });
});

describe("PreviewUpdateNotice", () => {
  it("keeps the current revision usable while a replacement is running", () => {
    const updating = {
      ...readySession,
      stages: {
        ...readySession.stages,
        story: { status: "running" as const }
      }
    };

    render(
      <>
        <PreviewUpdateNotice session={updating} onRetry={vi.fn()} />
        <AssemblyPreview session={updating} />
      </>
    );

    const notice = screen.getByRole("status");
    expect(notice).toHaveAttribute("data-preview-update-state", "running");
    expect(notice).toHaveTextContent("Updating this preview");
    expect(notice).toHaveTextContent("Revision 1 stays fully interactive");
    expect(screen.getByTitle("Generated buyer experience preview")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Retry update/i })).not.toBeInTheDocument();
  });

  it("shows preserved-preview recovery when story generation fails under a ready top-level status", () => {
    const retry = vi.fn();
    const preservedAfterFailure = {
      ...readySession,
      status: "preview_ready_unclaimed" as const,
      stages: {
        ...readySession.stages,
        story: { status: "failed" as const }
      }
    };

    render(<PreviewUpdateNotice session={preservedAfterFailure} onRetry={retry} />);

    const notice = screen.getByRole("alert");
    expect(notice).toHaveAttribute("data-preview-update-state", "failed");
    expect(notice).toHaveTextContent("Your current preview is still live.");
    expect(notice).toHaveTextContent("preserved revision 1");
    fireEvent.click(screen.getByRole("button", { name: /Retry update/i }));
    expect(retry).toHaveBeenCalledOnce();
  });
});

describe("SaveExperienceDialog", () => {
  it("asks for a business email only after the preview and closes accessibly", () => {
    const onClose = vi.fn();
    const onSave = vi.fn();
    render(
      <SaveExperienceDialog
        open
        expiresLabel="11:30 AM"
        email=""
        status="idle"
        onEmailChange={vi.fn()}
        onSave={onSave}
        onClose={onClose}
      />
    );

    expect(screen.getByRole("dialog")).toHaveAccessibleName("Save the URL before the preview disappears.");
    expect(screen.getByRole("textbox", { name: "Business email" })).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
    expect(onSave).not.toHaveBeenCalled();
  });
});
