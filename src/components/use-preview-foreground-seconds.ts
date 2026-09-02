"use client";

import { useEffect, useRef, useState } from "react";

const TICK_INTERVAL_MS = 250;

/**
 * Counts only foreground time for the currently revealed preview. The clock
 * starts fresh for each session and never derives duration from analytics
 * events or server timestamps.
 */
export function usePreviewForegroundSeconds(
  revealedSessionId: string | undefined,
  paused = false
): number {
  const [clock, setClock] = useState<{
    sessionId: string | undefined;
    seconds: number;
  }>({ sessionId: undefined, seconds: 0 });
  const timing = useRef<{
    sessionId: string | undefined;
    accumulatedMs: number;
    runningStartedAt?: number;
  }>({ sessionId: undefined, accumulatedMs: 0 });

  useEffect(() => {
    if (!revealedSessionId) return;
    if (timing.current.sessionId !== revealedSessionId) {
      timing.current = { sessionId: revealedSessionId, accumulatedMs: 0 };
    }

    const stop = () => {
      if (timing.current.runningStartedAt === undefined) return;
      timing.current.accumulatedMs += Math.max(0, Date.now() - timing.current.runningStartedAt);
      timing.current.runningStartedAt = undefined;
    };
    const reconcile = () => {
      if (paused || document.visibilityState !== "visible") {
        stop();
      } else if (timing.current.runningStartedAt === undefined) {
        timing.current.runningStartedAt = Date.now();
      }
    };
    const elapsedMs = () =>
      timing.current.accumulatedMs +
      (timing.current.runningStartedAt === undefined
        ? 0
        : Math.max(0, Date.now() - timing.current.runningStartedAt));
    const update = () => setClock({
      sessionId: revealedSessionId,
      seconds: Math.floor(elapsedMs() / 1_000)
    });
    const handleVisibilityChange = () => {
      reconcile();
      update();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    reconcile();
    update();
    const timer = window.setInterval(update, TICK_INTERVAL_MS);
    return () => {
      stop();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [revealedSessionId, paused]);

  return clock.sessionId === revealedSessionId ? clock.seconds : 0;
}
