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
  it("shows one question at a time and collapses finished answers", () => {
    const onAnswer = vi.fn();
    const onStepChange = vi.fn();
    render(
      <StreamingBriefComposer
        mode="campaign"
        questions={questions}
        currentQuestionId="audience"
        answers={[{ questionId: "intent", label: "Campaign", value: "Harmony for operations leaders" }]}
        canSkip
        onAnswer={onAnswer}
        onStepChange={onStepChange}
        onSkip={vi.fn()}
      />
    );

    expect(screen.queryByText("What are you taking to market?")).not.toBeInTheDocument();
    expect(screen.getByText("Who should this reach?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Harmony for operations leaders/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Harmony for operations leaders/i }));
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
});
