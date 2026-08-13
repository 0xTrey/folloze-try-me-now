// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StreamingBriefComposer } from "./streaming-brief-composer";

afterEach(cleanup);

const questions = [
  { id: "format", label: "Campaign format", prompt: "What are you taking to market?", choices: ["Product launch", "Demand campaign"], required: true },
  { id: "audience", label: "Buyer group", prompt: "Who should this reach?", placeholder: "Enterprise architects", required: true }
] as const;

describe("StreamingBriefComposer", () => {
  it("submits the current raw answer and renders it as a compact prior message", () => {
    const onAnswer = vi.fn();
    const { rerender } = render(
      <StreamingBriefComposer mode="campaign" questions={questions} currentQuestionId="format" answers={[]} onAnswer={onAnswer} />
    );

    fireEvent.click(screen.getByRole("button", { name: "Product launch" }));
    expect(onAnswer).toHaveBeenCalledWith({ questionId: "format", label: "Campaign format", value: "Product launch" });

    rerender(<StreamingBriefComposer mode="campaign" questions={questions} currentQuestionId="audience" answers={[{ questionId: "format", label: "Campaign format", value: "Product launch" }]} onAnswer={onAnswer} />);
    expect(screen.getByText("Product launch")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /Who should this reach/i })).toBeInTheDocument();
  });

  it("uses event-specific copy, streams truthful receipts, and exposes a collapsed Live Brief", () => {
    render(
      <StreamingBriefComposer
        mode="event"
        questions={questions}
        currentQuestionId="format"
        answers={[]}
        receipts={[{ id: "identity", label: "Brand matched", detail: "Public company cues are ready.", state: "complete" }]}
        brief={{ Offer: "Architecture Summit", Audience: "IT leaders" }}
        onAnswer={vi.fn()}
      />
    );

    expect(screen.getByText(/reason to attend/i)).toBeInTheDocument();
    expect(screen.getByLabelText("Live build progress")).toHaveTextContent("Public company cues are ready.");
    const brief = screen.getByText(/Live Brief/i).closest("details")!;
    expect(brief).not.toHaveAttribute("open");
    fireEvent.click(screen.getByText(/Live Brief/i));
    expect(screen.getByText("Architecture Summit")).toBeInTheDocument();
  });

  it("lets the parent change the one visible question without mutating raw data", () => {
    const onStepChange = vi.fn();
    render(<StreamingBriefComposer mode="campaign" questions={questions} currentQuestionId="format" answers={[]} onAnswer={vi.fn()} onStepChange={onStepChange} />);

    fireEvent.change(screen.getByLabelText("Change brief question"), { target: { value: "audience" } });
    expect(onStepChange).toHaveBeenCalledWith("audience");
  });
});
