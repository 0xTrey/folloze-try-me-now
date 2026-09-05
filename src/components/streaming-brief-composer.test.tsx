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
        onSummaryEdit={vi.fn()}
      />
    );

    expect(screen.queryByRole("heading", { name: "What are you taking to market?" })).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Who should this reach/i)).toBeInTheDocument();
    expect(screen.getByText("Question 2 of 3")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Review your answers"));
    expect(screen.getByRole("heading", { name: "Live Brief" })).toBeInTheDocument();
    expect(screen.getByText("Product campaign")).toBeInTheDocument();
    expect(screen.queryByText("What are you taking to market?")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Edit Campaign: Harmony for operations leaders/i })).not.toBeInTheDocument();
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

  it("keeps a sparse audience state free-form instead of showing a generic recommendation", () => {
    render(
      <StreamingBriefComposer
        mode="campaign"
        questions={[
          questions[0],
          {
            ...questions[1],
            choices: [],
            recommendedChoice: undefined,
            placeholder: "Describe the buyer role most likely to evaluate this offer"
          },
          questions[2]
        ]}
        currentQuestionId="audience"
        answers={[{ questionId: "intent", label: "Campaign", value: "A source with limited buyer evidence" }]}
        onAnswer={vi.fn()}
      />
    );

    expect(screen.getByLabelText(/Who should this reach/i)).toHaveAttribute(
      "placeholder",
      "Describe the buyer role most likely to evaluate this offer"
    );
    expect(screen.queryByText("Recommended")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Enterprise architects|Revenue leaders/i })).not.toBeInTheDocument();
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

    fireEvent.click(screen.getByText("Review your answers"));
    fireEvent.click(screen.getByRole("button", { name: "Edit Offer" }));
    expect(onSummaryEdit).toHaveBeenCalledWith("offer");
  });

  it("clears an existing answer without leaking it into the next question", () => {
    const { rerender } = render(
      <StreamingBriefComposer
        mode="campaign"
        questions={questions}
        currentQuestionId="intent"
        answers={[{ questionId: "intent", label: "Campaign", value: "Old answer" }]}
        onAnswer={vi.fn()}
      />
    );
    const input = screen.getByRole("textbox");
    expect(input).toHaveValue("Old answer");
    fireEvent.change(input, { target: { value: "" } });
    expect(input).toHaveValue("");
    rerender(
      <StreamingBriefComposer
        mode="campaign"
        questions={questions}
        currentQuestionId="audience"
        answers={[{ questionId: "intent", label: "Campaign", value: "Old answer" }]}
        onAnswer={vi.fn()}
      />
    );
    expect(screen.getByRole("textbox")).toHaveValue("");
  });

});
