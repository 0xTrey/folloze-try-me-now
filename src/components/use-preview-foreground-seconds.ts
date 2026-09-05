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
  const pausedRef = useRef(paused);
  const synchronizePause = useRef<(() => void) | undefined>(undefined);
  const [clock, setClock] = useState<{
    sessionId: string | undefined;
    seconds: number;
  }>({ sessionId: undefined, seconds: 0 });

  useEffect(() => {
    if (!revealedSessionId) return;

    let accumulatedMs = 0;
    let visibleStartedAt =
      document.visibilityState === "visible" && !pausedRef.current ? Date.now() : undefined;

    const elapsedMs = () =>
      accumulatedMs +
      (visibleStartedAt === undefined ? 0 : Math.max(0, Date.now() - visibleStartedAt));
    const update = () => {
      const seconds = Math.floor(elapsedMs() / 1_000);
      setClock(current => current.sessionId === revealedSessionId && current.seconds === seconds ? current : { sessionId: revealedSessionId, seconds });
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden" || pausedRef.current) {
        if (visibleStartedAt !== undefined) {
          accumulatedMs += Math.max(0, Date.now() - visibleStartedAt);
          visibleStartedAt = undefined;
        }
      } else if (visibleStartedAt === undefined && !pausedRef.current) {
        visibleStartedAt = Date.now();
      }
      update();
    };

    synchronizePause.current = handleVisibilityChange;
    document.addEventListener("visibilitychange", handleVisibilityChange);
    const timer = window.setInterval(update, TICK_INTERVAL_MS);
    return () => {
      window.clearInterval(timer);
      synchronizePause.current = undefined;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [revealedSessionId]);

  useEffect(() => {
    pausedRef.current = paused;
    if (!revealedSessionId) return;
    synchronizePause.current?.();
  }, [paused, revealedSessionId]);

  return clock.sessionId === revealedSessionId ? clock.seconds : 0;
}
