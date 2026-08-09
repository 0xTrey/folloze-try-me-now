// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { PublicTryMeSession } from "@/lib/types";

import {
  AssemblyPreview,
  buildMoments,
  canClaimPreview,
  CampaignOverviewRail,
  getBuildPanelCopy,
  OptionalContextComposer,
  PreviewUpdateNotice,
  ProgressiveQuestions,
  SaveExperienceDialog,
  SourceUnderstandingSummary
} from "./try-me-now-app";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

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
    readiness: "final",
    generationSource: "openai",
    artifactRevision: 1
  }
};

const readyProductInsight: NonNullable<PublicTryMeSession["sourceInsight"]> = {
  status: "ready",
  confidence: "high",
  title: "Folloze Buyer Experience Platform",
  premise: "Folloze turns product and account context into guided buyer experiences.",
  topics: ["buyer experience"],
  claims: [],
  extraction: {
    method: "html-static",
    status: "complete",
    ocrStatus: "not-required",
    warnings: []
  },
  experiencePattern: "guided-brief",
  moduleKinds: ["hero"],
  assetCount: 0,
  citationCount: 1
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

describe("SourceUnderstandingSummary", () => {
  it("shows a compact cited understanding receipt without exposing raw source text", () => {
    render(
      <SourceUnderstandingSummary
        insight={{
          status: "ready",
          confidence: "high",
          title: "Enterprise Automation Guide",
          premise: "The guide explains how teams connect governed automation to operating decisions.",
          topics: ["automation", "governance"],
          claims: [{
            id: "claim-1",
            text: "Governance must stay visible as automation expands.",
            sourceLabels: ["Page 4"]
          }],
          extraction: {
            method: "pdf-text",
            status: "complete",
            pageCount: 8,
            extractedPageCount: 8,
            ocrStatus: "not-required",
            warnings: []
          },
          experiencePattern: "guided-brief",
          moduleKinds: ["hero", "key-findings"],
          assetCount: 2,
          citationCount: 12
        }}
      />
    );

    expect(screen.getByRole("heading", { name: "Here's what we understood." })).toBeInTheDocument();
    expect(screen.getByText("Enterprise Automation Guide")).toBeInTheDocument();
    expect(screen.getByText("Page 4")).toBeInTheDocument();
    expect(screen.getByText("12 cited source blocks")).toBeInTheDocument();
  });
});

describe("guided build state", () => {
  it("does not present a blocked brand pass as failed final assembly before the brief is complete", () => {
    const blocked = {
      ...readySession,
      useCase: "abm" as const,
      status: "collecting" as const,
      experience: undefined,
      answers: {},
      brand: {
        ...readySession.brand!,
        companyName: "GM",
        domain: "gm.com",
        readiness: {
          status: "incomplete" as const,
          identityReady: false,
          logoReady: false,
          paletteReady: false,
          designReady: false,
          sourceEvidenceReady: false,
          reasons: ["Company identity still needs confirmation."]
        }
      },
      stages: {
        brand: { status: "fallback" as const },
        audience: { status: "running" as const },
        story: { status: "failed" as const, errorCode: "brand_palette_unavailable" }
      }
    };

    expect(buildMoments(blocked).at(-1)).toMatchObject({
      title: "Page build waiting",
      status: "pending"
    });
    expect(getBuildPanelCopy(blocked).headline).toBe(
      "We found GM, but the brand system is not ready yet."
    );
  });

  it("keeps a failed product source in the input stage instead of calling it final assembly", () => {
    const blocked = {
      ...readySession,
      useCase: "abm" as const,
      status: "generation_failed" as const,
      experience: undefined,
      answers: {
        targetDomain: "nvidia.com",
        audience: "AI platform leaders",
        objective: "Introduce a product",
        sourceUrl: "https://example.com/unreadable"
      },
      sourceInsight: { ...readyProductInsight, status: "failed" as const },
      stages: {
        brand: { status: "complete" as const },
        audience: { status: "complete" as const },
        story: { status: "failed" as const, errorCode: "source_unreadable" }
      }
    };

    expect(buildMoments(blocked).at(-1)).toMatchObject({
      title: "Page build waiting",
      status: "pending"
    });
  });
});

describe("PreviewUpdateNotice", () => {
  it("shows the interactive first preview while keeping claim gated", () => {
    const provisional = {
      ...readySession,
      status: "preview_provisional" as const,
      experience: {
        ...readySession.experience!,
        readiness: "provisional" as const
      },
      stages: {
        ...readySession.stages,
        story: { status: "running" as const }
      }
    };

    render(
      <>
        <PreviewUpdateNotice session={provisional} onRetry={vi.fn()} />
        <AssemblyPreview session={provisional} />
      </>
    );

    const notice = screen.getByRole("status");
    expect(notice).toHaveAttribute("data-preview-update-state", "provisional");
    expect(notice).toHaveTextContent("Your first preview is ready.");
    expect(notice).toHaveTextContent("Quality pass running");
    expect(screen.getByTitle("Generated buyer experience preview")).toBeInTheDocument();
    expect(canClaimPreview(provisional)).toBe(false);
    expect(canClaimPreview(readySession)).toBe(true);
  });

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
        expiresLabel="24:00"
        url="https://experience.example/jitterbit-for-cisco"
        sellerName="Jitterbit"
        targetName="Cisco"
        headline="Connect Cisco workflows without losing control."
        email=""
        status="idle"
        onEmailChange={vi.fn()}
        onSave={onSave}
        onClose={onClose}
      />
    );

    expect(screen.getByRole("dialog")).toHaveAccessibleName("Keep this experience live.");
    expect(screen.getByText("Jitterbit for Cisco")).toBeInTheDocument();
    expect(screen.getByText("https://experience.example/jitterbit-for-cisco")).toBeInTheDocument();
    expect(screen.getByText("Private preview · expires in 24:00")).toBeInTheDocument();
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
          answers: {
            campaignType: "product",
            promotedOffer: "Jitterbit Harmony",
            audience: "Enterprise architects"
          },
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

    expect(screen.getByRole("heading", { name: "Your build brief" })).toBeInTheDocument();
    expect(screen.getByLabelText("3 of 4 details collected")).toBeInTheDocument();
    expect(screen.getByText("Jitterbit")).toBeInTheDocument();
    expect(screen.getByText("Jitterbit Harmony")).toBeInTheDocument();
    expect(screen.getByText("Enterprise architects")).toBeInTheDocument();
    expect(document.querySelector('[data-overview-field="target"]')).not.toBeInTheDocument();
  });

  it("keeps the campaign offer incomplete when only a campaign type is selected", () => {
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
          }
        }}
      />
    );

    expect(screen.getByLabelText("2 of 4 details collected")).toBeInTheDocument();
    expect(document.querySelector('[data-overview-field="offer"]')).toHaveTextContent("Campaign offer");
    expect(screen.queryByText("Product campaign")).not.toBeInTheDocument();
  });

  it("collects a named campaign offer and optional public source before audience selection", () => {
    const onPatch = vi.fn().mockResolvedValue(undefined);
    const campaignSession = {
      ...readySession,
      status: "collecting" as const,
      experience: undefined,
      answers: {}
    };
    render(
      <ProgressiveQuestions
        session={campaignSession}
        answers={campaignSession.answers}
        isSaving={false}
        onPatch={onPatch}
        onWorkspacePatch={vi.fn().mockResolvedValue(undefined)}
        onUpload={vi.fn().mockResolvedValue(undefined)}
      />
    );

    const productChoice = screen.getByRole("button", { name: /Product or solution/i });
    fireEvent.click(productChoice);
    expect(productChoice).toHaveAttribute("aria-pressed", "true");
    expect(productChoice).toHaveClass("isSelected");
    expect(screen.getByRole("button", { name: /Demand generation/i })).toHaveAttribute("aria-pressed", "false");
    fireEvent.change(screen.getByLabelText(/Product or solution name/i), {
      target: { value: "Ford Pro Intelligence" }
    });
    fireEvent.change(screen.getByLabelText(/Product page or source URL/i), {
      target: { value: "https://www.fordpro.com/en-us/intelligence/" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(onPatch).toHaveBeenCalledWith({
      campaignType: "product",
      promotedOffer: "Ford Pro Intelligence",
      promotedOfferConfirmed: true,
      offerSourceUrl: "https://www.fordpro.com/en-us/intelligence/",
      offerSourceConfirmed: true,
      eventSource: undefined
    });
  });

  it("uses a valid product URL as the offer input when the name is left blank", () => {
    const onPatch = vi.fn().mockResolvedValue(undefined);
    const campaignSession = {
      ...readySession,
      status: "collecting" as const,
      experience: undefined,
      answers: {}
    };
    render(
      <ProgressiveQuestions
        session={campaignSession}
        answers={campaignSession.answers}
        isSaving={false}
        onPatch={onPatch}
        onWorkspacePatch={vi.fn().mockResolvedValue(undefined)}
        onUpload={vi.fn().mockResolvedValue(undefined)}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Product or solution/i }));
    const continueButton = screen.getByRole("button", { name: "Continue" });
    expect(continueButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/Product page or source URL/i), {
      target: { value: "https://6sense.com/platform/revvyai/" }
    });

    expect(screen.getByRole("status")).toHaveTextContent(/identify the offer and research this page/i);
    expect(continueButton).toBeEnabled();
    fireEvent.click(continueButton);

    expect(onPatch).toHaveBeenCalledWith({
      campaignType: "product",
      promotedOffer: undefined,
      promotedOfferConfirmed: true,
      offerSourceUrl: "https://6sense.com/platform/revvyai/",
      offerSourceConfirmed: true,
      eventSource: undefined
    });
  });

  it("starts offer research after a short typing pause without waiting for Continue", async () => {
    vi.useFakeTimers();
    const onBackgroundPatch = vi.fn().mockResolvedValue(undefined);
    const campaignSession = {
      ...readySession,
      status: "collecting" as const,
      experience: undefined,
      answers: {}
    };
    render(
      <ProgressiveQuestions
        session={campaignSession}
        answers={campaignSession.answers}
        isSaving={false}
        onPatch={vi.fn().mockResolvedValue(undefined)}
        onBackgroundPatch={onBackgroundPatch}
        onWorkspacePatch={vi.fn().mockResolvedValue(undefined)}
        onUpload={vi.fn().mockResolvedValue(undefined)}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Product or solution/i }));
    fireEvent.change(screen.getByLabelText(/Product page or source URL/i), {
      target: { value: "https://6sense.com/platform/revvyai/" }
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(649);
    });
    expect(onBackgroundPatch).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(onBackgroundPatch).toHaveBeenCalledWith({
      campaignType: "product",
      offerSourceUrl: "https://6sense.com/platform/revvyai/",
      offerSourceConfirmed: false
    });
  });

  it("asks for URL, PDF, or product context when ABM is introducing a product", async () => {
    vi.useFakeTimers();
    const onPatch = vi.fn().mockResolvedValue(undefined);
    const onBackgroundPatch = vi.fn().mockResolvedValue(undefined);
    const onUpload = vi.fn().mockResolvedValue(undefined);
    const abmSession = {
      ...readySession,
      useCase: "abm" as const,
      status: "collecting" as const,
      experience: undefined,
      answers: {
        targetDomain: "nvidia.com",
        audience: "AI platform leaders"
      }
    };
    const { rerender } = render(
      <ProgressiveQuestions
        session={abmSession}
        answers={abmSession.answers}
        isSaving={false}
        onPatch={onPatch}
        onBackgroundPatch={onBackgroundPatch}
        onWorkspacePatch={vi.fn().mockResolvedValue(undefined)}
        onUpload={onUpload}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Introduce a product/i }));
    expect(screen.getByRole("heading", { name: "Tell us about the product." })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Product page" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Product PDF" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Tell us" })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Existing product page"), {
      target: { value: "https://www.folloze.com/platform" }
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(650);
    });
    expect(onBackgroundPatch).toHaveBeenCalledWith({
      sourceUrl: "https://www.folloze.com/platform"
    });
    const researchedSession = {
      ...abmSession,
      revision: abmSession.revision + 2,
      answers: {
        ...abmSession.answers,
        sourceUrl: "https://source-provided.invalid/"
      },
      sourceInsight: readyProductInsight
    };
    rerender(
      <ProgressiveQuestions
        session={researchedSession}
        answers={researchedSession.answers}
        isSaving={false}
        onPatch={onPatch}
        onBackgroundPatch={onBackgroundPatch}
        onWorkspacePatch={vi.fn().mockResolvedValue(undefined)}
        onUpload={onUpload}
      />
    );
    expect(screen.getByText(/Product page understood/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Build my experience/i }));
    expect(onPatch).toHaveBeenCalledWith({
      objective: "Introduce a product",
      messageBelief: undefined,
      sourceUrl: "https://www.folloze.com/platform"
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("tab", { name: "Product PDF" }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(onPatch).toHaveBeenCalledWith({ sourceUrl: "" });
    const fileInput = document.querySelector('.productContextQuestion input[type="file"]');
    fireEvent.change(fileInput!, {
      target: { files: [new File(["product"], "product.pdf", { type: "application/pdf" })] }
    });
    expect(onUpload).toHaveBeenCalledWith(expect.objectContaining({ name: "product.pdf" }));
  });

  it("lets a resumed product objective replace a failed URL", async () => {
    const onPatch = vi.fn().mockResolvedValue(undefined);
    const failedSession = {
      ...readySession,
      useCase: "abm" as const,
      status: "generation_failed" as const,
      experience: undefined,
      answers: {
        targetDomain: "nvidia.com",
        audience: "AI platform leaders",
        objective: "Introduce a product",
        sourceUrl: "https://example.com/unreadable"
      },
      sourceInsight: { ...readyProductInsight, status: "failed" as const }
    };
    render(
      <ProgressiveQuestions
        session={failedSession}
        answers={failedSession.answers}
        isSaving={false}
        onPatch={onPatch}
        onWorkspacePatch={vi.fn().mockResolvedValue(undefined)}
        onUpload={vi.fn().mockResolvedValue(undefined)}
      />
    );

    expect(screen.getByRole("heading", { name: "Tell us about the product." })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("We could not read that page");
    expect(screen.getByRole("button", { name: /Build my experience/i })).toBeDisabled();

    fireEvent.click(screen.getByRole("tab", { name: "Tell us" }));
    await waitFor(() => expect(onPatch).toHaveBeenCalledWith({ sourceUrl: "" }));
    fireEvent.change(screen.getByLabelText("What should buyers understand about the product?"), {
      target: { value: "A governed product story that gives every buyer a useful next step." }
    });
    expect(screen.getByRole("button", { name: /Build my experience/i })).toBeEnabled();
  });

  it("restarts background research when a resumed product URL is replaced", async () => {
    vi.useFakeTimers();
    const onBackgroundPatch = vi.fn().mockResolvedValue(undefined);
    const failedSession = {
      ...readySession,
      useCase: "abm" as const,
      status: "generation_failed" as const,
      experience: undefined,
      answers: {
        targetDomain: "nvidia.com",
        audience: "AI platform leaders",
        objective: "Introduce a product",
        sourceUrl: "https://example.com/unreadable"
      },
      sourceInsight: { ...readyProductInsight, status: "failed" as const }
    };
    render(
      <ProgressiveQuestions
        session={failedSession}
        answers={failedSession.answers}
        isSaving={false}
        onPatch={vi.fn().mockResolvedValue(undefined)}
        onBackgroundPatch={onBackgroundPatch}
        onWorkspacePatch={vi.fn().mockResolvedValue(undefined)}
        onUpload={vi.fn().mockResolvedValue(undefined)}
      />
    );

    fireEvent.change(screen.getByLabelText("Existing product page"), {
      target: { value: "https://www.folloze.com/platform" }
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(650);
    });
    expect(onBackgroundPatch).toHaveBeenCalledWith({
      sourceUrl: "https://www.folloze.com/platform"
    });
  });

  it("asks the product question when a resumed objective has no product context", () => {
    const resumedSession = {
      ...readySession,
      useCase: "abm" as const,
      status: "collecting" as const,
      experience: undefined,
      answers: {
        targetDomain: "nvidia.com",
        audience: "AI platform leaders",
        objective: "Introduce a product"
      }
    };
    render(
      <ProgressiveQuestions
        session={resumedSession}
        answers={resumedSession.answers}
        isSaving={false}
        onPatch={vi.fn().mockResolvedValue(undefined)}
        onWorkspacePatch={vi.fn().mockResolvedValue(undefined)}
        onUpload={vi.fn().mockResolvedValue(undefined)}
      />
    );

    expect(screen.getByRole("heading", { name: "Tell us about the product." })).toBeInTheDocument();
    expect(screen.queryByText("Brief complete")).not.toBeInTheDocument();
  });

  it("uses a short product description as messaging context", () => {
    const onPatch = vi.fn().mockResolvedValue(undefined);
    const abmSession = {
      ...readySession,
      useCase: "abm" as const,
      status: "collecting" as const,
      experience: undefined,
      answers: {
        targetDomain: "nvidia.com",
        audience: "AI platform leaders"
      }
    };
    render(
      <ProgressiveQuestions
        session={abmSession}
        answers={abmSession.answers}
        isSaving={false}
        onPatch={onPatch}
        onWorkspacePatch={vi.fn().mockResolvedValue(undefined)}
        onUpload={vi.fn().mockResolvedValue(undefined)}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Introduce a product/i }));
    fireEvent.click(screen.getByRole("tab", { name: "Tell us" }));
    fireEvent.change(screen.getByLabelText("What should buyers understand about the product?"), {
      target: { value: "A governed buyer experience platform that turns account signals into seller action." }
    });
    fireEvent.click(screen.getByRole("button", { name: /Build my experience/i }));

    expect(onPatch).toHaveBeenCalledWith({
      objective: "Introduce a product",
      messageBelief: "A governed buyer experience platform that turns account signals into seller action."
    });
  });

  it("adds optional outcome context in the same final campaign step", () => {
    const onPatch = vi.fn().mockResolvedValue(undefined);
    const campaignSession = {
      ...readySession,
      status: "collecting" as const,
      experience: undefined,
      answers: {
        campaignType: "product" as const,
        promotedOffer: "Ford Pro Intelligence",
        audience: "Fleet operations leaders"
      }
    };
    render(
      <ProgressiveQuestions
        session={campaignSession}
        answers={campaignSession.answers}
        isSaving={false}
        onPatch={onPatch}
        onWorkspacePatch={vi.fn().mockResolvedValue(undefined)}
        onUpload={vi.fn().mockResolvedValue(undefined)}
      />
    );

    const context = screen.getByLabelText(/What is new or worth noticing about Ford Pro Intelligence/i);
    fireEvent.change(context, {
      target: { value: "Disconnected fleet data makes it harder to act before downtime compounds." }
    });
    fireEvent.click(screen.getByRole("button", { name: /Build my experience/i }));

    expect(onPatch).toHaveBeenCalledWith({
      objective: "Launch or announce",
      messageBelief: "Disconnected fleet data makes it harder to act before downtime compounds."
    });
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
    expect(screen.getByRole("alert")).toHaveTextContent("Choose a PDF under 10 MB.");
    expect(screen.getAllByText("Choose a PDF under 10 MB.")).toHaveLength(1);

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

  it("keeps a failed PDF filename out of the public URL field", () => {
    const onUpload = vi.fn().mockResolvedValue(undefined);
    const contentSession = {
      ...readySession,
      useCase: "content" as const,
      status: "collecting" as const,
      experience: undefined,
      answers: {}
    };
    render(
      <ProgressiveQuestions
        session={contentSession}
        answers={contentSession.answers}
        isSaving={false}
        pdfUpload={{ status: "error", fileName: "campaign-builder-video-handoff.pdf", message: "Upload unavailable." }}
        onPatch={vi.fn().mockResolvedValue(undefined)}
        onWorkspacePatch={vi.fn().mockResolvedValue(undefined)}
        onUpload={onUpload}
      />
    );

    fireEvent.click(screen.getByRole("tab", { name: "PDF upload" }));
    const fileInput = document.querySelector('input[type="file"]');
    fireEvent.change(fileInput!, {
      target: {
        files: [new File(["%PDF-test"], "campaign-builder-video-handoff.pdf", { type: "application/pdf" })]
      }
    });
    expect(onUpload).toHaveBeenCalled();

    fireEvent.click(screen.getByRole("tab", { name: "Public URL" }));
    expect(screen.getByLabelText("Content URL")).toHaveValue("");
  });

  it("shows the support reference when experience generation fails", () => {
    const failed = {
      ...readySession,
      status: "generation_failed" as const,
      experience: undefined,
      answers: {
        campaignType: "product" as const,
        promotedOffer: "Governed automation",
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
