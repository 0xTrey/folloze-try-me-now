// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { BuildProgressState, PublicTryMeSession } from "@/lib/types";

import { FinalBuildShell } from "./final-build-shell";

afterEach(cleanup);

function buildingSession(buildProgress: BuildProgressState): PublicTryMeSession {
  return {
    id: "build-shell-session",
    supportRef: "TMN-BUILDSHELL",
    useCase: "campaign",
    companyDomain: "jitterbit.com",
    status: "generating",
    createdAt: "2026-07-31T10:00:00.000Z",
    updatedAt: "2026-07-31T10:00:20.000Z",
    temporaryUrl: "https://example.test/e/build-shell-session",
    revision: 3,
    stages: {
      brand: { status: "complete" },
      audience: { status: "complete" },
      story: { status: "running" }
    },
    answers: {
      campaignType: "product",
      promotedOffer: "Jitterbit Harmony",
      audience: "Enterprise architects",
      objective: "Generate demand"
    },
    audienceSuggestions: [],
    buildProgress
  };
}

const workingProgress: BuildProgressState = {
  phase: "writing",
  startedAt: "2026-07-31T10:00:00.000Z",
  updatedAt: "2026-07-31T10:00:20.000Z",
  slow: false,
  receipts: [
    {
      phase: "queued",
      status: "complete",
      detail: "Prepared the build from your brief",
      completedAt: "2026-07-31T10:00:01.000Z"
    },
    {
      phase: "researching",
      status: "complete",
      detail: "Read the public brand, offer, and buyer context",
      evidenceNote: "6 public sources kept"
    },
    { phase: "planning", status: "complete", detail: "Chose the strongest story for this buyer" },
    { phase: "writing", status: "active", detail: "Writing each step of the buyer journey" }
  ]
};

function renderShell(session: PublicTryMeSession, onRetry = vi.fn()) {
  return render(
    <FinalBuildShell
      session={session}
      brandName="Jitterbit"
      audience="Enterprise architects"
      brandColors={["#1B3E51", "#F44414"]}
      onRetry={onRetry}
    />
  );
}

describe("FinalBuildShell", () => {
  it("renders one row per build phase with receipt-backed statuses and no page preview", () => {
    const { container } = renderShell(buildingSession(workingProgress));

    const rows = container.querySelectorAll("[data-phase]");
    expect(rows).toHaveLength(6);
    expect(container.querySelector('[data-phase="researching"]')).toHaveAttribute("data-status", "complete");
    expect(container.querySelector('[data-phase="writing"]')).toHaveAttribute("data-status", "active");
    // Phases with no receipt yet read as queued rather than as partial progress.
    expect(container.querySelector('[data-phase="checking"]')).toHaveAttribute("data-status", "queued");
    expect(container.querySelector('[data-phase="finalizing"]')).toHaveAttribute("data-status", "queued");

    expect(screen.getByText("Writing each step of the buyer journey")).toBeInTheDocument();
    expect(screen.getByText("6 public sources kept")).toBeInTheDocument();
    expect(container.querySelector("iframe")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
  });

  it("never renders a percentage, a progress bar, or an estimated finish time", () => {
    const { container } = renderShell(buildingSession(workingProgress));

    expect(container.textContent).not.toMatch(/%/);
    expect(container.textContent).not.toMatch(/\bsecond|\bminute|remaining|estimat/i);
    expect(container.querySelector("progress")).toBeNull();
    expect(container.querySelector('[role="progressbar"]')).toBeNull();
  });

  it("keeps active, complete, and queued distinguishable without relying on color", () => {
    renderShell(buildingSession(workingProgress));

    expect(screen.getAllByText("Done")).toHaveLength(3);
    expect(screen.getAllByText("Working")).toHaveLength(1);
    expect(screen.getAllByText("Queued")).toHaveLength(2);
  });

  it("names the current work only when the server reports a slow build", () => {
    const { container, rerender } = renderShell(buildingSession(workingProgress));
    expect(container.querySelector("[data-build-slow]")).toBeNull();
    expect(container.querySelector("[data-build-shell]")).toHaveAttribute("data-build-shell", "working");

    rerender(
      <FinalBuildShell
        session={buildingSession({ ...workingProgress, slow: true })}
        brandName="Jitterbit"
        audience="Enterprise architects"
      />
    );

    const slow = container.querySelector("[data-build-slow]");
    expect(slow).toHaveTextContent("This one is taking longer than usual.");
    expect(slow).toHaveTextContent("Your brief is safe. Writing each step of the buyer journey");
    expect(container.querySelector("[data-build-shell]")).toHaveAttribute("data-build-shell", "slow");
  });

  it("shows the reported next action and a retry affordance when the build fails", () => {
    const onRetry = vi.fn();
    const { container } = renderShell(
      buildingSession({
        phase: "failed",
        startedAt: "2026-07-31T10:00:00.000Z",
        updatedAt: "2026-07-31T10:00:58.000Z",
        slow: false,
        receipts: [
          { phase: "queued", status: "complete", detail: "Prepared the build from your brief" },
          { phase: "checking", status: "failed", detail: "The claims check did not pass" }
        ],
        failure: {
          code: "truth_gate_failed",
          nextAction: "Add one proof point to the brief, then run the build again.",
          retryable: true
        }
      }),
      onRetry
    );

    expect(container.querySelector("[data-build-shell]")).toHaveAttribute("data-build-shell", "failed");
    expect(screen.getByRole("heading", { name: "The build stopped before it finished." })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Add one proof point to the brief, then run the build again."
    );
    expect(container.querySelector('[data-phase="checking"]')).toHaveAttribute("data-status", "failed");
    expect(container.querySelector("[data-build-shell]")).not.toHaveAttribute("aria-busy");

    fireEvent.click(screen.getByRole("button", { name: /Try the build again/i }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("omits retry when the reported failure is not retryable", () => {
    renderShell(
      buildingSession({
        phase: "failed",
        startedAt: "2026-07-31T10:00:00.000Z",
        updatedAt: "2026-07-31T10:00:58.000Z",
        slow: false,
        receipts: [],
        failure: {
          code: "session_expired",
          nextAction: "Start a new brief to build this experience.",
          retryable: false
        }
      })
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Start a new brief to build this experience.");
    expect(screen.queryByRole("button", { name: /Try the build again/i })).not.toBeInTheDocument();
  });

  it("keeps internal recipe, strategy, evidence, and provider labels out of the shell", () => {
    const { container } = renderShell(buildingSession(workingProgress));

    expect(container.textContent).not.toMatch(
      /recipe|strategy|thesis|digest|trace|openai|anthropic|gpt|claude|evidence id/i
    );
  });
});
