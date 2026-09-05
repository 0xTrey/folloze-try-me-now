import type { CtaType, ExperienceActionContract, TryMeSession } from "@/lib/types";

function publicDestination(value?: string) {
  try {
    const url = new URL(value ?? "");
    if (url.protocol !== "https:" || url.username || url.password || url.port) return undefined;
    if ([...url.searchParams.keys()].some((key) => /token|secret|password|api.?key|authorization|signature|session/i.test(key))) return undefined;
    // Keep query parameters that a real registration or resource link requires.
    return url.href;
  } catch { return undefined; }
}

export function selectedBuyerCta(session: Pick<TryMeSession, "answers" | "objectiveRecommendations">): { type: CtaType; label: string } {
  const resolved = session.objectiveRecommendations?.find((candidate) => candidate.label === session.answers.objective)
    ?? session.objectiveRecommendations?.find((candidate) => candidate.recommended);
  return { type: session.answers.ctaType ?? resolved?.cta?.type ?? "book-meeting",
    label: resolved?.cta?.label || (session.answers.campaignType === "event" ? "Register now" : "Book a meeting") };
}

/** One interaction contract for the compiler, API spec, and rendered button. */
export function resolveBuyerCtaOffer(input: { intent: CtaType; label: string; sourceUrl?: string; meetingUrl?: string }) {
  const source = publicDestination(input.sourceUrl);
  const meeting = publicDestination(input.meetingUrl);
  const usesSource = ["register", "download", "explore"].includes(input.intent);
  const destination = usesSource ? source : meeting;
  // An arbitrary public URL is not evidence of a registration or download flow.
  const sourceLabel = input.intent === "register" ? "View event details"
    : input.intent === "download" ? "Read the resource" : "Explore product details";
  const label = destination ? usesSource ? sourceLabel : input.label : "Explore the page";
  const expectation = destination ? "Opens the linked page in a new tab. No form is submitted here."
    : "Moves to the next-step section on this page. No meeting or registration is booked.";
  const action: ExperienceActionContract = {
    id: "primary-conversion", purpose: destination ? "primary-conversion" : "guided-exploration",
    label, actionType: destination ? "external-link" : "scroll", destination: destination ?? "#next-step",
    access: "public", analyticsEvent: "cta_click", analyticsOwner: "try-me-now",
    verification: destination ? "verified" : "fallback",
    ...(!destination ? { fallbackReason: "No matching public destination was configured." } : {})
  };
  return { action, expectation, requestedIntent: input.intent };
}
