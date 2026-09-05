export const HANDOFF_EVENT_ACTIONS = ["anchor_click", "cta_click", "topic_select", "signature_select", "question_select", "section_view", "fullscreen_change", "journey_complete"] as const;
export const HANDOFF_CONTEXT_KEYS = ["sectionId", "sectionTitle", "sectionHeadline", "targetId", "ctaId", "lensId", "lensTitle", "lensHeadline", "area", "position", "completionKey"] as const;
type AnalyticsEventContext = { [Key in typeof HANDOFF_CONTEXT_KEYS[number]]?: string };

export type ExperienceHandoffEvent = { action: string; context: AnalyticsEventContext; at: number };

export function experienceResumeTarget(search: string): { sessionId: string; panel: "analytics" | "personalize" } | undefined {
  const params = new URLSearchParams(search);
  const sessionId = params.get("session");
  const panel = params.get("panel");
  if (!sessionId || !/^[a-z0-9_-]{8,128}$/i.test(sessionId) || (panel !== "analytics" && panel !== "personalize")) return undefined;
  return { sessionId, panel };
}

/** This tab's bounded, non-contact activity only. Never used for authentication. */
export function parseExperienceHandoff(raw: string | null, now = Date.now()): { events: ExperienceHandoffEvent[]; engagedSeconds: number } {
  const empty = { events: [], engagedSeconds: 0 };
  if (!raw || raw.length > 40_000) return empty;
  try {
    const data = JSON.parse(raw);
    if (!data || !Number.isFinite(data.savedAt) || data.savedAt > now || now - data.savedAt > 300_000 || !Array.isArray(data.events)) return empty;
    const events: ExperienceHandoffEvent[] = [];
    for (const event of data.events.slice(-24)) {
      if (!event || !HANDOFF_EVENT_ACTIONS.includes(event.action) || !Number.isFinite(event.at) || event.at > now || now - event.at > 86_400_000) continue;
      const context: AnalyticsEventContext = {};
      for (const key of HANDOFF_CONTEXT_KEYS) {
        const value = event.context?.[key];
        if (typeof value === "string" && value.length <= 160 && !/[@\u0000-\u001f\u007f]/.test(value)) context[key] = value;
      }
      events.push({ action: event.action, at: event.at, context });
    }
    return { events, engagedSeconds: Number.isInteger(data.engagedSeconds) ? Math.max(0, Math.min(data.engagedSeconds, 86_400)) : 0 };
  } catch { return empty; }
}
