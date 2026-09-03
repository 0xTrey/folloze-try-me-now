// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PublicPersonalizationRequest } from "@/lib/personalization-request-store";

import { ThreeAccountConversion } from "./three-account-conversion";

afterEach(cleanup);
beforeEach(() => vi.clearAllMocks());

const request = (status: PublicPersonalizationRequest["status"]): PublicPersonalizationRequest => ({
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
  variantCount: 3,
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
  it("captures email before showing exactly three target accounts", () => {
    const { rerender } = render(<ThreeAccountConversion {...baseProps} />);
    expect(screen.getByRole("heading", { name: "Build three account versions from this experience." })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Work email"), {
      target: { value: "buyer@example.com" }
    });
    expect(baseProps.onEmailChange).toHaveBeenCalledWith("buyer@example.com");
    rerender(<ThreeAccountConversion {...baseProps} email="buyer@example.com" />);
    fireEvent.click(screen.getByRole("button", { name: /Choose my 3 accounts/i }));
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

  it("shows honest parallel progress without promising email delivery", () => {
    render(
      <ThreeAccountConversion
        {...baseProps}
        email="buyer@example.com"
        request={request("generating")}
        status="polling"
      />
    );
    expect(screen.getByRole("heading", { name: "We are building all three versions in parallel." })).toBeInTheDocument();
    expect(screen.getByText("Building")).toBeInTheDocument();
    expect(screen.getByText(/Email delivery and Folloze publishing stay off until production/)).toBeInTheDocument();
  });

  it("shows only final ready links and records which position opened", () => {
    const onOpenLink = vi.fn();
    render(
      <ThreeAccountConversion
        {...baseProps}
        email="buyer@example.com"
        request={request("completed")}
        onOpenLink={onOpenLink}
      />
    );
    expect(screen.getAllByRole("link", { name: /Open/i })).toHaveLength(3);
    fireEvent.click(screen.getAllByRole("link", { name: /Open/i })[1]!);
    expect(onOpenLink).toHaveBeenCalledWith(2);
  });
});
