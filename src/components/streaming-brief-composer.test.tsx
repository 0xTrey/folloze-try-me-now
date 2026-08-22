// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StreamingBriefComposer } from "./streaming-brief-composer";

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
        canSkip
        onAnswer={onAnswer}
        onStepChange={onStepChange}
        onSummaryEdit={vi.fn()}
        onSkip={vi.fn()}
      />
    );

    expect(screen.queryByRole("heading", { name: "What are you taking to market?" })).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Who should this reach/i)).toBeInTheDocument();
    expect(screen.getByText("Next signal · Audience")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Edit Campaign: Harmony for operations leaders/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Live Brief" })).toBeInTheDocument();
    expect(screen.getByText("Product campaign")).toBeInTheDocument();
    expect(screen.getByText("What are you taking to market?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Edit Campaign: Harmony for operations leaders/i }));
    expect(onStepChange).toHaveBeenCalledWith("intent");
    fireEvent.click(screen.getByRole("button", { name: "Enterprise architects" }));
    expect(onAnswer).toHaveBeenCalledWith({
      questionId: "audience",
      label: "Audience",
      value: "Enterprise architects"
    });
  });

  it("keeps skip to preview disabled until the brief is viable", () => {
    const onSkip = vi.fn();
    render(
      <StreamingBriefComposer
        mode="campaign"
        questions={questions}
        currentQuestionId="intent"
        answers={[]}
        canSkip={false}
        onAnswer={vi.fn()}
        onSkip={onSkip}
      />
    );

    expect(screen.getByRole("button", { name: "Skip to preview" })).toBeDisabled();
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
});
