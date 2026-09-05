// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EditBriefForm, ExperienceReady } from "./experience-ready";

afterEach(cleanup);
const answers = { promotedOffer: "Cloud monitoring", audience: "Other", customAudience: "Platform teams", objective: "Evaluate the product" };

describe("completed experience navigation", () => {
  it("opens the real experience separately and offers edit, personalization and secondary analytics", () => {
    const onEdit = vi.fn(), onPersonalize = vi.fn(), onAnalytics = vi.fn();
    render(<ExperienceReady companyName="Dynatrace" domain="dynatrace.com" href="/e/ready" preview={<span>Thumbnail</span>} onEdit={onEdit} onPersonalize={onPersonalize} personalizationLabel="Personalize for 3 accounts" onAnalytics={onAnalytics} publicationNote="Hosted test experience" />);
    expect(screen.getByRole("link", { name: "View Experience" })).toHaveAttribute("href", "/e/ready");
    expect(screen.getByRole("link", { name: "View Experience" })).toHaveAttribute("target", "_blank");
    expect(screen.getByLabelText("dynatrace.com experience preview")).toHaveTextContent("Thumbnail");
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Edit Brief" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit Brief" }));
    fireEvent.click(screen.getByRole("button", { name: "Personalize for 3 accounts" }));
    fireEvent.click(screen.getByRole("button", { name: "View Engagement" }));
    expect(onEdit).toHaveBeenCalledOnce();
    expect(onPersonalize).toHaveBeenCalledOnce();
    expect(onAnalytics).toHaveBeenCalledOnce();
  });
  it("retains original answers and cancels a local draft without sending changes", () => {
    const onRebuild = vi.fn(), onCancel = vi.fn();
    render(<EditBriefForm answers={answers} onRebuild={onRebuild} onCancel={onCancel} />);
    expect(screen.getByLabelText("Who should this reach?")).toHaveValue("Platform teams");
    expect(screen.getByRole("button", { name: "Rebuild experience" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("What are you taking to market?"), { target: { value: "New offering" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel changes" }));
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onRebuild).not.toHaveBeenCalled();
  });
  it("submits only on rebuild and retains the draft on failure for retry", async () => {
    const onRebuild = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    render(<EditBriefForm answers={answers} onRebuild={onRebuild} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("What are you taking to market?"), { target: { value: "New offering" } });
    expect(onRebuild).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Rebuild experience" }));
    await screen.findByRole("alert");
    expect(screen.getByLabelText("What are you taking to market?")).toHaveValue("New offering");
    fireEvent.click(screen.getByRole("button", { name: "Rebuild experience" }));
    await waitFor(() => expect(onRebuild).toHaveBeenCalledTimes(2));
    expect(onRebuild).toHaveBeenLastCalledWith({ ...answers, promotedOffer: "New offering" });
  });
});
