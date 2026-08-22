// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { usePreviewForegroundSeconds } from "./use-preview-foreground-seconds";

function Harness({ sessionId }: { sessionId?: string }) {
  const seconds = usePreviewForegroundSeconds(sessionId);
  return <output aria-label="Foreground seconds">{seconds}</output>;
}

function setVisibility(value: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value
  });
  document.dispatchEvent(new Event("visibilitychange"));
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  setVisibility("visible");
});

describe("usePreviewForegroundSeconds", () => {
  it("counts only visible time and resets for each revealed session", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-22T18:00:00.000Z"));
    setVisibility("visible");
    const { rerender } = render(<Harness sessionId="session-a" />);

    act(() => vi.advanceTimersByTime(14_999));
    expect(screen.getByLabelText("Foreground seconds")).toHaveTextContent("14");

    act(() => setVisibility("hidden"));
    act(() => vi.advanceTimersByTime(10_000));
    expect(screen.getByLabelText("Foreground seconds")).toHaveTextContent("14");

    act(() => setVisibility("visible"));
    act(() => vi.advanceTimersByTime(1_001));
    expect(screen.getByLabelText("Foreground seconds")).toHaveTextContent("16");

    rerender(<Harness sessionId="session-b" />);
    expect(screen.getByLabelText("Foreground seconds")).toHaveTextContent("0");
  });
});
