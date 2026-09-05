// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { usePreviewForegroundSeconds } from "./use-preview-foreground-seconds";

function Harness({ sessionId, paused = false }: { sessionId?: string; paused?: boolean }) {
  const seconds = usePreviewForegroundSeconds(sessionId, paused);
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

  it("pauses and resumes without counting paused time", () => {
    vi.useFakeTimers();
    setVisibility("visible");
    const { rerender } = render(<Harness sessionId="session-a" />);
    act(() => vi.advanceTimersByTime(15_000));
    rerender(<Harness sessionId="session-a" paused />);
    act(() => vi.advanceTimersByTime(60_000));
    expect(screen.getByLabelText("Foreground seconds")).toHaveTextContent("15");
    rerender(<Harness sessionId="session-a" />);
    act(() => vi.advanceTimersByTime(2_000));
    expect(screen.getByLabelText("Foreground seconds")).toHaveTextContent("17");
  });

  it("resets when switching sessions while paused and never resumes while hidden", () => {
    vi.useFakeTimers();
    setVisibility("visible");
    const { rerender } = render(<Harness sessionId="session-a" paused />);
    act(() => vi.advanceTimersByTime(500));
    rerender(<Harness sessionId="session-b" paused />);
    expect(screen.getByLabelText("Foreground seconds")).toHaveTextContent("0");
    act(() => setVisibility("hidden"));
    rerender(<Harness sessionId="session-b" />);
    act(() => vi.advanceTimersByTime(5_000));
    expect(screen.getByLabelText("Foreground seconds")).toHaveTextContent("0");
  });

  it("retains fractional seconds across repeated pauses and ignores visibility changes while paused", () => {
    vi.useFakeTimers();
    setVisibility("visible");
    const { rerender } = render(<Harness sessionId="session-a" />);
    act(() => vi.advanceTimersByTime(750));
    rerender(<Harness sessionId="session-a" paused />);
    act(() => { setVisibility("hidden"); setVisibility("visible"); vi.advanceTimersByTime(60_000); });
    expect(screen.getByLabelText("Foreground seconds")).toHaveTextContent("0");
    rerender(<Harness sessionId="session-a" />);
    act(() => vi.advanceTimersByTime(750));
    rerender(<Harness sessionId="session-a" paused />);
    expect(screen.getByLabelText("Foreground seconds")).toHaveTextContent("1");
    act(() => vi.advanceTimersByTime(60_000));
    rerender(<Harness sessionId="session-a" />);
    act(() => vi.advanceTimersByTime(500));
    expect(screen.getByLabelText("Foreground seconds")).toHaveTextContent("2");
  });
});
