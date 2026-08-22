"use client";

import { useEffect, useState } from "react";

const TICK_INTERVAL_MS = 250;

/**
 * Counts only foreground time for the currently revealed preview. The clock
 * starts fresh for each session and never derives duration from analytics
 * events or server timestamps.
 */
export function usePreviewForegroundSeconds(
  revealedSessionId: string | undefined
): number {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    setSeconds(0);
    if (!revealedSessionId) return;

    let accumulatedMs = 0;
    let visibleStartedAt =
      document.visibilityState === "visible" ? Date.now() : undefined;

    const elapsedMs = () =>
      accumulatedMs +
      (visibleStartedAt === undefined ? 0 : Math.max(0, Date.now() - visibleStartedAt));
    const update = () => setSeconds(Math.floor(elapsedMs() / 1_000));
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        if (visibleStartedAt !== undefined) {
          accumulatedMs += Math.max(0, Date.now() - visibleStartedAt);
          visibleStartedAt = undefined;
        }
      } else if (visibleStartedAt === undefined) {
        visibleStartedAt = Date.now();
      }
      update();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    const timer = window.setInterval(update, TICK_INTERVAL_MS);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [revealedSessionId]);

  return seconds;
}
