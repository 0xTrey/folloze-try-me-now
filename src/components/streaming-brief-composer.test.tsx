// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StreamingBriefComposer, StreamingBuildStage } from "./streaming-brief-composer";

afterEach(() => {
  cleanup();
});

const questions = [
  {
    id: "intent",
    label: "Campaign",
    prompt: "What are you taking to market?",
    required: true
  },
  {
    id: "audience",
    label: "Audience",
    prompt: "Who should this reach?",
    choices: ["Enterprise architects", "Revenue leaders"],
    recommendedChoice: "Enterprise architects",
    required: true
  },
  {
    id: "goal",
    label: "Goal",
    prompt: "What should this experience achieve?",
    choices: ["Launch or announce", "Generate demand"],
    required: true
  }
] as const;

describe("StreamingBriefComposer", () => {
  it("shows one question at a time and keeps finished answers in the transcript", () => {
    const onAnswer = vi.fn();
    const onStepChange = vi.fn();
    render(
      <StreamingBriefComposer
        mode="unified"
        questions={questions}
        currentQuestionId="audience"
        answers={[{ questionId: "intent", label: "Campaign", value: "Harmony for operations leaders" }]}
        summaryFields={[
          { key: "seller", label: "Seller", value: "Folloze", editable: false },
          { key: "offer", label: "Offer", value: "Harmony", editable: true },
          { key: "experience_type", label: "Experience type", value: "Product campaign", editable: false }
        ]}
        onAnswer={onAnswer}
        onStepChange={onStepChange}
        onSummaryEdit={vi.fn()}
      />
    );

    expect(screen.queryByRole("heading", { name: "What are you taking to market?" })).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Who should this reach/i)).toBeInTheDocument();
    expect(screen.getByText("Question 2 of 3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Edit Campaign: Harmony for operations leaders/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Live Brief" })).toBeInTheDocument();
    expect(screen.getByText("Product campaign")).toBeInTheDocument();
    expect(screen.getByText("What are you taking to market?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Edit Campaign: Harmony for operations leaders/i }));
    expect(onStepChange).toHaveBeenCalledWith("intent");
    expect(screen.getByText("Recommended")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Enterprise architects, recommended" }));
    expect(onAnswer).toHaveBeenCalledWith({
      questionId: "audience",
      label: "Audience",
      value: "Enterprise architects"
    });
  });

  it("does not offer a shortcut around the guided brief", () => {
    render(
      <StreamingBriefComposer
        mode="campaign"
        questions={questions}
        currentQuestionId="intent"
        answers={[]}
        onAnswer={vi.fn()}
      />
    );

    expect(screen.queryByRole("button", { name: /skip to preview/i })).not.toBeInTheDocument();
  });

  it("lets sellers edit compact Live Brief fields from the summary", () => {
    const onSummaryEdit = vi.fn();
    render(
      <StreamingBriefComposer
        mode="unified"
        questions={questions}
        currentQuestionId="goal"
        answers={[
          { questionId: "intent", label: "Campaign", value: "Secure AI Live" },
          { questionId: "audience", label: "Audience", value: "Security leaders" }
        ]}
        summaryFields={[
          { key: "offer", label: "Offer", value: "Secure AI Live", editable: true },
          { key: "audience", label: "Audience", value: "Security leaders", editable: true },
          { key: "objective", label: "Objective", value: undefined, editable: true }
        ]}
        onAnswer={vi.fn()}
        onSummaryEdit={onSummaryEdit}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit Offer" }));
    expect(onSummaryEdit).toHaveBeenCalledWith("offer");
  });

  it("replaces the intake with an audience-specific, full-page build stage", () => {
    render(
      <StreamingBuildStage
        audience="Clinical laboratory directors"
        brandName="Thermo Fisher Scientific"
        brandLogoUrl="/brand/folloze-logo.svg"
        brandColors={["#ed1c24", "#005daa"]}
        receipts={[{ id: "brand", label: "Brand", detail: "Reading the public site", state: "working" }]}
      />
    );

    expect(screen.getByRole("heading", { name: "Building a buyer experience for Clinical laboratory directors." })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Thermo Fisher Scientific's brand, offer, audience, and objective");
    expect(document.querySelector('[data-build-stage="active"]')).toHaveAttribute("aria-busy", "true");
    expect(document.querySelector('[data-motion="orbit"]')).toBeInTheDocument();
    expect(screen.queryByText(/%|seconds remaining/i)).not.toBeInTheDocument();
  });

  it("keeps real receipt language visible without inventing completion", () => {
    render(
      <StreamingBuildStage
        audience="Security operations leaders"
        brandName="Cisco"
        receipts={[
          { id: "brand", label: "Brand verified", detail: "Official public identity captured", state: "complete" },
          { id: "composition", label: "Composing page structure", detail: "Messaging and imagery are being assembled", state: "working" }
        ]}
      />
    );

    expect(screen.getByText("Brand verified")).toBeInTheDocument();
    expect(screen.getByText("Composing page structure")).toBeInTheDocument();
    expect(screen.queryByText(/ready to explore/i)).not.toBeInTheDocument();
  });
});
