// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PublicPersonalizationRequest } from "@/lib/personalization-request-store";

import { ThreeAccountConversion } from "./three-account-conversion";

afterEach(cleanup);
beforeEach(() => vi.clearAllMocks());

const request = (
  status: PublicPersonalizationRequest["status"],
  selectionMode?: PublicPersonalizationRequest["selectionMode"]
): PublicPersonalizationRequest => ({
  id: "request-id",
  sessionId: "session-id",
  emailMasked: "b***@example.com",
  targetCount: status === "awaiting_targets" ? 0 : 3,
  targets: status === "awaiting_targets" ? [] : [
    { id: "one", position: 1, domain: "one.com", status: status === "completed" ? "ready" : "researching", ...(status === "completed" ? { link: "/e/one" } : {}) },
    { id: "two", position: 2, domain: "two.com", role: "CFO", status: status === "completed" ? "ready" : "pending", ...(status === "completed" ? { link: "/e/two" } : {}) },
    { id: "three", position: 3, domain: "three.com", status: status === "completed" ? "ready" : "pending", ...(status === "completed" ? { link: "/e/three" } : {}) }
  ],
  baselineArtifactRevision: 4,
  status,
  ...(selectionMode ? { selectionMode } : {}),
  variantCount: 3,
  delivery: {
    status: status === "completed" ? "accepted" : "pending",
    ...(status === "completed"
      ? { acceptedAt: "2026-09-03T10:00:02.000Z" }
      : {})
  },
  createdAt: "2026-09-03T10:00:00.000Z",
  updatedAt: "2026-09-03T10:00:01.000Z",
  expiresAt: "2026-10-03T10:00:00.000Z"
});

const baseProps = {
  email: "",
  status: "idle" as const,
  onEmailChange: vi.fn(),
  onSubmitEmail: vi.fn(),
  onSubmitTargets: vi.fn()
};

describe("ThreeAccountConversion", () => {
  it("keeps awaiting account choices interactive during a background status read", () => {
    render(<ThreeAccountConversion {...baseProps} status="polling" request={request("awaiting_targets")} onAutoSelectTargets={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Pick 3 accounts for me" })).toBeEnabled();
    expect(screen.getAllByLabelText("Company domain").every(input => !(input as HTMLInputElement).disabled)).toBe(true);
  });
  it("captures email before showing exactly three target accounts", () => {
    const { rerender } = render(<ThreeAccountConversion {...baseProps} />);
    expect(screen.getByRole("heading", { name: "Build three account versions from this experience." })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Work email"), {
      target: { value: "buyer@example.com" }
    });
    expect(baseProps.onEmailChange).toHaveBeenCalledWith("buyer@example.com");
    rerender(<ThreeAccountConversion {...baseProps} email="buyer@example.com" />);
    fireEvent.click(screen.getByRole("button", { name: /Continue/i }));
    expect(baseProps.onSubmitEmail).toHaveBeenCalledOnce();

    rerender(
      <ThreeAccountConversion
        {...baseProps}
        email="buyer@example.com"
        request={request("awaiting_targets")}
      />
    );
    expect(screen.getAllByLabelText("Company domain")).toHaveLength(3);
    expect(screen.getAllByLabelText(/Buyer role/)).toHaveLength(3);
  });

  it("submits three trimmed domains with an optional role", () => {
    const onSubmitTargets = vi.fn();
    render(
      <ThreeAccountConversion
        {...baseProps}
        email="buyer@example.com"
        request={request("awaiting_targets")}
        onSubmitTargets={onSubmitTargets}
      />
    );
    const domains = screen.getAllByLabelText("Company domain");
    const roles = screen.getAllByLabelText(/Buyer role/);
    fireEvent.change(domains[0]!, { target: { value: " one.com " } });
    fireEvent.change(domains[1]!, { target: { value: "two.com" } });
    fireEvent.change(domains[2]!, { target: { value: "three.com" } });
    fireEvent.change(roles[1]!, { target: { value: " CFO " } });
    fireEvent.click(screen.getByRole("button", { name: /Build 3 account versions/i }));
    expect(onSubmitTargets).toHaveBeenCalledWith([
      { domain: "one.com" },
      { domain: "two.com", role: "CFO" },
      { domain: "three.com" }
    ]);
  });

  it("supports a controlled manual target draft", () => {
    const onTargetDraftChange = vi.fn();
    render(
      <ThreeAccountConversion
        {...baseProps}
        email="buyer@example.com"
        request={request("awaiting_targets")}
        targetDraft={[{ domain: "saved.com" }, { domain: "" }, { domain: "" }]}
        onTargetDraftChange={onTargetDraftChange}
      />
    );
    expect(screen.getAllByLabelText("Company domain")[0]).toHaveValue("saved.com");
    fireEvent.change(screen.getAllByLabelText("Company domain")[1]!, { target: { value: "new.com" } });
    expect(onTargetDraftChange).toHaveBeenCalledWith([
      { domain: "saved.com" },
      { domain: "new.com" },
      { domain: "" }
    ]);
  });

  it("keeps manual entry and offers account selection with a busy state", async () => {
    let resolveSelection!: () => void;
    const onAutoSelectTargets = vi.fn(() => new Promise<void>((resolve) => { resolveSelection = resolve; }));
    render(<ThreeAccountConversion {...baseProps} email="buyer@example.com" request={request("awaiting_targets")} onAutoSelectTargets={onAutoSelectTargets} />);
    expect(screen.getAllByLabelText("Company domain")).toHaveLength(3);
    expect(screen.getByText("Choose one account path")).toBeInTheDocument();
    expect(screen.getByText("Option 1: Pick 3 accounts for me")).toBeInTheDocument();
    expect(screen.getByText("Option 2: Enter my own accounts")).toBeInTheDocument();
    const button = screen.getByRole("button", { name: "Pick 3 accounts for me" });
    fireEvent.click(button);
    expect(onAutoSelectTargets).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: /Choosing accounts/i })).toBeDisabled();
    expect(screen.getAllByLabelText("Company domain")).toHaveLength(3);
    await act(async () => resolveSelection());
  });

  it("gives account selection a clear retry state", () => {
    render(
      <ThreeAccountConversion
        {...baseProps}
        email="buyer@example.com"
        request={request("awaiting_targets")}
        onAutoSelectTargets={vi.fn()}
        error="Account selection failed"
      />
    );
    expect(screen.getByRole("button", { name: "Retry account selection" })).toBeEnabled();
    expect(screen.getAllByRole("status").some((node) => node.textContent?.includes("Try again, or enter your own below"))).toBe(true);
    expect(screen.getByText("Option 2: Enter my own accounts")).toBeInTheDocument();
  });

  it.each(["queued", "generating"] as const)("shows a concise %s confirmation without internal progress details", (state) => {
    const onDone = vi.fn();
    render(
      <ThreeAccountConversion
        {...baseProps}
        email="buyer@example.com"
        request={request(state, "representative")}
        status="polling"
        onDone={onDone}
      />
    );
    expect(screen.getByRole("heading", { name: "We're building all three versions for you." })).toBeInTheDocument();
    expect(screen.getByText("Check your email in about 5 minutes to see what they look like.")).toBeInTheDocument();
    expect(screen.queryByText(/final readback|representative companies|app-hosted for testing|one\.com|two\.com|three\.com/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Back to your experience" }));
    expect(onDone).toHaveBeenCalledOnce();
  });

  it("is honest when email delivery is not configured", () => {
    render(
      <ThreeAccountConversion
        {...baseProps}
        email="buyer@example.com"
        request={{ ...request("generating"), delivery: { status: "not_configured" } }}
        status="polling"
        onDone={vi.fn()}
      />
    );
    expect(screen.getByText(/email delivery is not connected/i)).toBeInTheDocument();
    expect(screen.queryByText(/about 5 minutes|keep this page open/i)).not.toBeInTheDocument();
  });

  it("shows only final ready links and records which position opened", () => {
    const onOpenLink = vi.fn();
    const onDone = vi.fn();
    render(
      <ThreeAccountConversion
        {...baseProps}
        email="buyer@example.com"
        request={request("completed")}
        onOpenLink={onOpenLink}
        onDone={onDone}
      />
    );
    expect(screen.getAllByRole("link", { name: /Open/i })).toHaveLength(3);
    expect(screen.getByText(/AgentMail accepted the email/)).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("link", { name: /Open/i })[1]!);
    expect(onOpenLink).toHaveBeenCalledWith(2);
    expect(screen.queryByText(/quality gate|app-hosted for testing/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Back to your experience" }));
    expect(onDone).toHaveBeenCalledOnce();
  });
});
