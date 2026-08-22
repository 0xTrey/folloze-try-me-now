/** @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PreviewEvidenceActivitySurface } from "@/components/preview-lifecycle-surface";
import type { PublicTryMeSession } from "@/lib/types";

afterEach(() => {
  cleanup();
});

const readySession: PublicTryMeSession = {
  id: "lifecycle-surface",
  supportRef: "TMN-SURFACE01",
  useCase: "abm",
  companyDomain: "jitterbit.com",
  status: "preview_ready_unclaimed",
  createdAt: "2026-08-22T10:00:00.000Z",
  updatedAt: "2026-08-22T10:00:20.000Z",
  temporaryUrl: "https://example.test/e/lifecycle-surface",
  revision: 2,
  stages: {
    brand: { status: "complete", detail: "Seller palette matched" },
    audience: { status: "failed", errorCode: "audience_timeout" },
    story: { status: "complete", detail: "Path composed" }
  },
  answers: {
    targetDomain: "cisco.com",
    audience: "Enterprise architects",
    objective: "Accelerate an opportunity"
  },
  brand: {
    domain: "jitterbit.com",
    companyName: "Jitterbit",
    colors: ["#1B3E51"],
    primaryColor: "#1B3E51",
    accentColor: "#F44414",
    surfaceColor: "#FFFFFF",
    source: "brand-harvester"
  },
  targetBrand: {
    domain: "cisco.com",
    companyName: "Cisco",
    colors: ["#049FD9"],
    primaryColor: "#049FD9",
    accentColor: "#049FD9",
    surfaceColor: "#FFFFFF",
    source: "brand-harvester"
  },
  audienceSuggestions: [],
  experience: {
    ready: true,
    title: "Jitterbit for Cisco",
    headline: "Connect Cisco workflows",
    readiness: "final",
    generationSource: "openai",
    artifactRevision: 2
  }
};

describe("PreviewEvidenceActivitySurface", () => {
  it("shows receipt-backed progress, large evidence, and stage retry without Folloze publish claims", () => {
    const onRetry = vi.fn();
    render(
      <PreviewEvidenceActivitySurface
        session={readySession}
        activity={[
          { id: "1", label: "Opened the experience", detail: "Preview entered the viewport." },
          { id: "2", label: "Viewed Decision paths", detail: "Reached a new section." }
        ]}
        evidence={[
          {
            id: "e1",
            label: "Operating context",
            text: "Cisco is expanding platform integrations across enterprise architecture teams."
          }
        ]}
        onRetryStage={onRetry}
      />
    );

    expect(screen.getByRole("heading", { name: "Evidence and activity" })).toBeInTheDocument();
    expect(screen.getByText("Preview ready")).toBeInTheDocument();
    expect(screen.getByText(/not published to Folloze/i)).toBeInTheDocument();
    expect(screen.getByText("Seller palette matched")).toBeInTheDocument();
    expect(screen.getByText(/Worker receipt: failed \(audience_timeout\)/)).toBeInTheDocument();
    expect(screen.getByText(/Cisco is expanding platform integrations/)).toBeInTheDocument();
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Retry Audience mapping/i }));
    expect(onRetry).toHaveBeenCalledWith("audience");
  });
});
