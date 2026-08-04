// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { PublicTryMeSession } from "@/lib/types";

import {
  AssemblyPreview,
  CampaignOverviewRail,
  OptionalContextComposer,
  PreviewUpdateNotice,
  ProgressiveQuestions,
  SaveExperienceDialog
} from "./try-me-now-app";

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

describe("guided campaign workspace", () => {
  it("renders a compact campaign overview from the canonical brief and live answers", () => {
    render(
      <CampaignOverviewRail
        session={{
          ...readySession,
          status: "collecting",
          experience: undefined,
          answers: { campaignType: "product", audience: "Enterprise architects" },
          stages: {
            brand: { status: "complete" },
            audience: { status: "complete" },
            story: { status: "pending" }
          },
          campaignBrief: {
            revision: 2,
            fingerprint: "brief-fingerprint",
            updatedAt: "2026-07-31T10:00:08.000Z",
            fields: {
              seller: {
                key: "seller",
                label: "Building as",
                value: "Jitterbit",
                provenance: "research",
                citations: [],
                userEdited: false,
                locked: false,
                required: true,
                dependencies: ["seller-brand"]
              },
              audience: {
                key: "audience",
                label: "For",
                value: "Enterprise architects",
                provenance: "inferred",
                citations: [],
                userEdited: false,
                locked: false,
                required: true,
                dependencies: ["audience-lens"]
              }
            }
          }
        }}
      />
    );

    expect(screen.getByRole("heading", { name: "Campaign Overview" })).toBeInTheDocument();
    expect(screen.getByLabelText("3 of 4 details collected")).toBeInTheDocument();
    expect(screen.getByText("Jitterbit")).toBeInTheDocument();
    expect(screen.getByText("Product campaign")).toBeInTheDocument();
    expect(screen.getByText("Enterprise architects")).toBeInTheDocument();
    expect(document.querySelector('[data-overview-field="target"]')).not.toBeInTheDocument();
  });

  it("accepts one optional URL or PDF source across paths without changing the path", () => {
    const onPatch = vi.fn().mockResolvedValue(undefined);
    const onUpload = vi.fn().mockResolvedValue(undefined);
    const session = {
      ...readySession,
      useCase: "abm" as const,
      status: "collecting" as const,
      experience: undefined,
      answers: {}
    };
    render(
      <OptionalContextComposer
        session={session}
        answers={session.answers}
        isSaving={false}
        onPatch={onPatch}
        onUpload={onUpload}
      />
    );

    expect(screen.getByRole("heading", { name: "Add anything that should shape the result." })).toBeInTheDocument();
    expect(screen.getByRole("tablist", { name: "Additional guidance or context type" })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Message or helpful context"), {
      target: { value: "Lead with the cost of disconnected buyer journeys." }
    });
    fireEvent.click(screen.getByRole("button", { name: "Add to brief" }));
    expect(onPatch).toHaveBeenCalledWith({
      messageBelief: "Lead with the cost of disconnected buyer journeys."
    });

    fireEvent.click(screen.getByRole("tab", { name: "URL" }));
    const urlInput = screen.getByLabelText("Public HTTPS URL");
    expect(urlInput).toBeEnabled();
    fireEvent.change(urlInput, { target: { value: "https://example.com/account-proof" } });
    fireEvent.click(screen.getByRole("button", { name: "Use this URL" }));
    expect(onPatch).toHaveBeenLastCalledWith({ sourceUrl: "https://example.com/account-proof" });

    fireEvent.click(screen.getByRole("tab", { name: "PDF" }));
    expect(screen.getByText("Add a supporting PDF")).toBeInTheDocument();
    const fileInput = document.querySelector('input[type="file"]');
    expect(fileInput).toBeEnabled();
    fireEvent.change(fileInput!, { target: { files: [new File(["proof"], "proof.pdf", { type: "application/pdf" })] } });
    expect(onUpload).toHaveBeenCalledWith(expect.objectContaining({ name: "proof.pdf" }));

    cleanup();
    render(
      <OptionalContextComposer
        session={{ ...session, answers: { sourceUrl: "https://source-provided.invalid/" } }}
        answers={{ sourceUrl: "https://source-provided.invalid/" }}
        isSaving={false}
        onPatch={onPatch}
        onUpload={onUpload}
      />
    );
    fireEvent.click(screen.getByRole("tab", { name: "URL" }));
    expect(screen.getByLabelText("Public HTTPS URL")).toBeDisabled();
    expect(screen.getByText("One source is already attached to this brief.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "PDF" }));
    expect(screen.getByText("One source is already attached")).toBeInTheDocument();
    expect(document.querySelector('input[type="file"]')).not.toBeInTheDocument();
  });

  it("makes PDF upload progress, acceptance, and errors unmistakable in the guided shell", () => {
    const contentSession = {
      ...readySession,
      useCase: "content" as const,
      status: "collecting" as const,
      experience: undefined,
      answers: {}
    };
    const props = {
      session: contentSession,
      answers: contentSession.answers,
      isSaving: true,
      onPatch: vi.fn().mockResolvedValue(undefined),
      onWorkspacePatch: vi.fn().mockResolvedValue(undefined),
      onUpload: vi.fn().mockResolvedValue(undefined)
    };
    const { rerender } = render(
      <ProgressiveQuestions
        {...props}
        pdfUpload={{ status: "uploading", fileName: "platform-guide.pdf", message: "Checking the file, then uploading it securely." }}
      />
    );
    fireEvent.click(screen.getByRole("tab", { name: "PDF upload" }));
    expect(screen.getByRole("tabpanel")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("status")).toHaveTextContent("Uploading securely");
    expect(screen.getByText("Uploading platform-guide.pdf")).toBeInTheDocument();

    rerender(
      <ProgressiveQuestions
        {...props}
        isSaving={false}
        pdfUpload={{ status: "error", fileName: "platform-guide.pdf", message: "Choose a PDF under 10 MB." }}
      />
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Upload needs attention");
    expect(screen.getAllByText("Choose a PDF under 10 MB.").length).toBeGreaterThan(0);

    cleanup();
    render(
      <OptionalContextComposer
        session={{ ...contentSession, answers: { sourceName: "platform-guide.pdf", sourceTitle: "Platform Guide" } }}
        answers={{ sourceName: "platform-guide.pdf", sourceTitle: "Platform Guide" }}
        isSaving={false}
        pdfUpload={{ status: "accepted", fileName: "platform-guide.pdf", message: "Platform Guide is ready and shaping the experience." }}
        onPatch={props.onPatch}
        onUpload={props.onUpload}
      />
    );
    fireEvent.click(screen.getByRole("tab", { name: "PDF" }));
    expect(screen.getByText("PDF accepted and added")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("PDF accepted");
    expect(screen.queryByText("Choose PDF")).not.toBeInTheDocument();
  });

  it("shows the support reference when experience generation fails", () => {
    const failed = {
      ...readySession,
      status: "generation_failed" as const,
      experience: undefined,
      answers: {
        campaignType: "product" as const,
        audience: "Enterprise architects",
        objective: "Generate demand"
      },
      stages: {
        brand: { status: "complete" as const },
        audience: { status: "complete" as const },
        story: { status: "failed" as const }
      }
    };
    render(
      <ProgressiveQuestions
        session={failed}
        answers={failed.answers}
        isSaving={false}
        onPatch={vi.fn().mockResolvedValue(undefined)}
        onWorkspacePatch={vi.fn().mockResolvedValue(undefined)}
        onUpload={vi.fn().mockResolvedValue(undefined)}
      />
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Support reference: TMN-DESKTOPPREV");
  });
});
