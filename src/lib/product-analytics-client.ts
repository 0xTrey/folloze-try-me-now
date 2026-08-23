"use client";

import posthog from "posthog-js";

import type {
  ProductEventCategory,
  ProductEventName,
  UnifiedProductEventName
} from "@/lib/product-analytics-contracts";
import {
  assertUnifiedProductEventProperties,
  isPrivateAnalyticsPropertyKey,
  productEventCategoryFor,
  UNIFIED_PRODUCT_EVENT_NAMES
} from "@/lib/product-analytics-contracts";

type ProductProperty = string | number | boolean | null;
type ProductProperties = Record<string, ProductProperty>;

const visitorStorageKey = "folloze_try_me_visitor_id";
const browserSessionStorageKey = "folloze_try_me_browser_session_id";
const eventEndpoint = "/api/analytics/events";
const posthogEnabled = Boolean(
  process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN && process.env.NEXT_PUBLIC_POSTHOG_HOST
);
const maxQueueSize = 60;
let activeSessionId: string | undefined;
let initialized = false;
let flushTimer: number | undefined;

type QueuedEvent = {
  eventId: string;
  visitorId: string;
  browserSessionId: string;
  sessionId?: string;
  event: ProductEventName;
  category: ProductEventCategory;
  path: string;
  outcome?: "started" | "success" | "failure" | "cancelled" | "info";
  durationMs?: number;
  properties?: ProductProperties;
  occurredAt: string;
  landing?: {
    path: string;
    utm?: Partial<Record<"source" | "medium" | "campaign" | "term" | "content", string>>;
    deviceClass: "desktop" | "tablet" | "mobile" | "unknown";
    browserFamily: string;
  };
};

const queue: QueuedEvent[] = [];

function opaqueId(prefix: "tmv" | "tmb" | "tme"): string {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`;
}

function storageId(
  storage: Storage,
  key: string,
  prefix: "tmv" | "tmb"
): string {
  const current = storage.getItem(key);
  if (current && new RegExp(`^${prefix}_[a-zA-Z0-9_-]{16,96}$`).test(current)) return current;
  const created = opaqueId(prefix);
  storage.setItem(key, created);
  return created;
}

export function productAnalyticsIdentity(): {
  visitorId: string;
  browserSessionId: string;
} | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    return {
      visitorId: storageId(window.localStorage, visitorStorageKey, "tmv"),
      browserSessionId: storageId(window.sessionStorage, browserSessionStorageKey, "tmb")
    };
  } catch {
    return undefined;
  }
}

export function productAnalyticsHeaders(): Record<string, string> {
  const identity = productAnalyticsIdentity();
  if (!identity) return {};
  const attribution = typeof window === "undefined" ? undefined : landingContext()?.utm;
  return {
        "X-Try-Me-Visitor-Id": identity.visitorId,
        "X-Try-Me-Browser-Session-Id": identity.browserSessionId,
        ...Object.fromEntries(Object.entries(attribution ?? {}).filter((entry): entry is [string, string] =>
          typeof entry[1] === "string"
        ).map(([key, value]) => [
          `X-Try-Me-Utm-${key}`,
          value
        ]))
      };
}

function safeText(value: string, max = 160): string {
  return value
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[email]")
    .replace(/https?:\/\/\S+/gi, "[url]")
    .replace(
      /\b(?:www\.)?(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:com|org|net|io|co|ai|dev|app|info|biz|edu|gov|cloud|tech|xyz|us|uk|ca|de|fr|au|jp|nl|eu|tv|me|cc)\b/gi,
      "[domain]"
    )
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function safeProperties(properties: ProductProperties | undefined): ProductProperties | undefined {
  if (!properties) return undefined;
  return Object.fromEntries(
    Object.entries(properties)
      .map(([key, value]) => [key.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase(), value] as const)
      .filter(([key]) => /^[a-z][a-z0-9_]{0,39}$/.test(key) && !isPrivateAnalyticsPropertyKey(key))
      .slice(0, 24)
      .map(([key, value]) => {
        if (typeof value !== "string") return [key, value] as const;
        if (/^TMN-[A-Z0-9]{8,16}$/.test(value)) return [key, value] as const;
        return [key, safeText(value)] as const;
      })
      .filter(([, value]) => typeof value !== "string" || value.length > 0)
      .filter(([, value]) => typeof value !== "string" || !/\[(?:email|url|domain)\]/i.test(value))
  );
}

function browserFamily(): string {
  const agent = navigator.userAgent;
  if (/Edg\//.test(agent)) return "Edge";
  if (/Chrome\//.test(agent)) return "Chrome";
  if (/Safari\//.test(agent) && !/Chrome\//.test(agent)) return "Safari";
  if (/Firefox\//.test(agent)) return "Firefox";
  return "Other";
}

function deviceClass(): "desktop" | "tablet" | "mobile" | "unknown" {
  if (/Mobi|Android/i.test(navigator.userAgent)) return "mobile";
  if (/iPad|Tablet/i.test(navigator.userAgent)) return "tablet";
  return window.innerWidth > 0 ? "desktop" : "unknown";
}

function landingContext(): QueuedEvent["landing"] {
  const parameters = new URLSearchParams(window.location.search);
  const utm = Object.fromEntries(
    (["source", "medium", "campaign", "term", "content"] as const)
      .map((key) => [key, safeText(parameters.get(`utm_${key}`) ?? "", 160)] as const)
      .filter((entry): entry is readonly [typeof entry[0], string] => Boolean(entry[1]))
  );
  return {
    path: window.location.pathname,
    utm,
    deviceClass: deviceClass(),
    browserFamily: browserFamily()
  };
}

function scheduleFlush(): void {
  if (flushTimer !== undefined) return;
  flushTimer = window.setTimeout(() => {
    flushTimer = undefined;
    void flushProductAnalytics();
  }, 350);
}

export function captureProductEvent(
  event: ProductEventName,
  options: {
    category?: ProductEventCategory;
    outcome?: QueuedEvent["outcome"];
    durationMs?: number;
    properties?: ProductProperties;
    sessionId?: string;
    immediate?: boolean;
  } = {}
): void {
  if (typeof window === "undefined") return;
  const identity = productAnalyticsIdentity();
  if (!identity) return;
  const eventId = opaqueId("tme");
  const properties = safeProperties(options.properties);
  queue.push({
    eventId,
    ...identity,
    sessionId: options.sessionId ?? activeSessionId,
    event,
    category: options.category ?? productEventCategoryFor(event),
    path: window.location.pathname,
    outcome: options.outcome,
    durationMs: options.durationMs,
    properties,
    occurredAt: new Date().toISOString(),
    ...(event === "visitor_session_started" ? { landing: landingContext() } : {})
  });
  if (posthogEnabled) {
    try {
      posthog.capture(`try_me_${event}`, {
        ...(properties ?? {}),
        $insert_id: eventId,
        try_me_event_id: eventId,
        try_me_visitor_id: identity.visitorId,
        try_me_browser_session_id: identity.browserSessionId,
        try_me_session_id: options.sessionId ?? activeSessionId,
        event_category: options.category ?? productEventCategoryFor(event),
        event_outcome: options.outcome,
        duration_ms: options.durationMs
      });
    } catch {
      // The first-party queue remains authoritative when PostHog is unavailable.
    }
  }
  if (queue.length > maxQueueSize) queue.splice(0, queue.length - maxQueueSize);
  if (options.immediate || queue.length >= 10) void flushProductAnalytics();
  else scheduleFlush();
}

/**
 * Typed seam for Wave 2 UI emit hooks. Enforces the unified event property contract
 * before enqueueing. Returns false when the payload is rejected for privacy or shape.
 */
export function captureUnifiedProductEvent(
  event: UnifiedProductEventName,
  options: {
    outcome?: QueuedEvent["outcome"];
    durationMs?: number;
    properties?: ProductProperties;
    sessionId?: string;
    immediate?: boolean;
  } = {}
): boolean {
  if (!(UNIFIED_PRODUCT_EVENT_NAMES as readonly string[]).includes(event)) return false;
  try {
    const properties = assertUnifiedProductEventProperties(
      event,
      options.properties as Record<string, string | number | boolean | null> | undefined
    );
    captureProductEvent(event, {
      category: productEventCategoryFor(event),
      outcome: options.outcome,
      durationMs: options.durationMs,
      properties,
      sessionId: options.sessionId,
      immediate: options.immediate
    });
    return true;
  } catch {
    return false;
  }
}

export async function flushProductAnalytics(useBeacon = false): Promise<void> {
  if (!queue.length) return;
  const batch = queue.splice(0, 20);
  const body = JSON.stringify({ events: batch });
  try {
    if (useBeacon && navigator.sendBeacon) {
      const sent = navigator.sendBeacon(eventEndpoint, new Blob([body], { type: "application/json" }));
      if (sent) return;
    }
    const response = await fetch(eventEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      keepalive: true,
      body
    });
    if (!response.ok) {
      if (response.status === 429 || response.status >= 500) {
        throw new Error(`Analytics request failed with ${response.status}.`);
      }
      return;
    }
  } catch {
    queue.unshift(...batch);
    if (queue.length > maxQueueSize) queue.splice(maxQueueSize);
  }
}

export function setProductAnalyticsSessionId(sessionId: string | undefined): void {
  activeSessionId = sessionId;
}

export function identifyProductVisitor(email: string): void {
  void email;
  const identity = productAnalyticsIdentity();
  if (!identity) return;
  captureProductEvent("visitor_identified", {
    category: "conversion",
    outcome: "success",
    properties: { identity_source: "business_email_claim" },
    immediate: true
  });
  if (!posthogEnabled) return;
  try {
    posthog.identify(identity.visitorId, { identity_source: "business_email_claim" });
  } catch {
    // The server-side lead and session ledgers remain authoritative.
  }
}

function elementDescription(element: Element): ProductProperties {
  const htmlElement = element as HTMLElement;
  const label = htmlElement.getAttribute("data-analytics-label")
    || htmlElement.getAttribute("aria-label")
    || htmlElement.getAttribute("title")
    || htmlElement.getAttribute("name")
    || htmlElement.id
    || element.tagName.toLowerCase();
  const analyticsArea = htmlElement.closest<HTMLElement>("[data-analytics-area]")?.dataset.analyticsArea;
  return {
    element_type: element.tagName.toLowerCase(),
    element_id: safeText(htmlElement.id || htmlElement.getAttribute("name") || "unlabeled", 80),
    label: safeText(label, 96),
    area: safeText(analyticsArea || "page", 80)
  };
}

export function resetProductAnalyticsVisitor(): void {
  if (typeof window === "undefined") return;
  void flushProductAnalytics(true);
  queue.length = 0;
  activeSessionId = undefined;
  window.localStorage.removeItem(visitorStorageKey);
  window.sessionStorage.removeItem(browserSessionStorageKey);
  if (posthogEnabled) {
    try {
      posthog.reset(true);
    } catch {
      // A new first-party identity is still created even if the optional sink is unavailable.
    }
  }
  productAnalyticsIdentity();
}

function fieldDescription(element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement): ProductProperties {
  const length = typeof element.value === "string" ? element.value.length : 0;
  return {
    field_name: safeText(element.name || element.id || element.getAttribute("aria-label") || "unlabeled", 80),
    field_type: element instanceof HTMLSelectElement ? "select" : element.type || "text",
    has_value: length > 0,
    length_bucket: length === 0 ? "empty" : length < 8 ? "short" : length < 40 ? "medium" : "long"
  };
}

export function initializeProductAnalytics(): () => void {
  if (typeof window === "undefined" || initialized) return () => undefined;
  initialized = true;
  captureProductEvent("visitor_session_started", { category: "navigation", immediate: true });
  captureProductEvent("page_viewed", { category: "navigation" });

  const onClick = (event: MouseEvent) => {
    const target = event.target instanceof Element
      ? event.target.closest("a,button,input,select,textarea,label,[role='button'],[role='tab'],[role='option']")
      : null;
    if (!target || target.closest("[data-analytics-ignore]")) return;
    captureProductEvent("ui_click", {
      category: "interaction",
      properties: elementDescription(target)
    });
  };
  const onChange = (event: Event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement)) return;
    captureProductEvent("field_interacted", {
      category: "input",
      properties: fieldDescription(target)
    });
  };
  const onError = (event: ErrorEvent) => {
    captureProductEvent("browser_error", {
      category: "error",
      outcome: "failure",
      properties: {
        error_name: safeText(event.error instanceof Error ? event.error.name : "Error", 80),
        message: safeText(event.message || "Browser error", 120)
      },
      immediate: true
    });
  };
  const onUnhandledRejection = (event: PromiseRejectionEvent) => {
    const reason = event.reason instanceof Error ? event.reason : undefined;
    captureProductEvent("unhandled_rejection", {
      category: "error",
      outcome: "failure",
      properties: {
        error_name: safeText(reason?.name || "UnhandledRejection", 80),
        message: safeText(reason?.message || "Unhandled promise rejection", 120)
      },
      immediate: true
    });
  };
  const onVisibilityChange = () => {
    if (document.visibilityState === "hidden") void flushProductAnalytics(true);
  };

  document.addEventListener("click", onClick, true);
  document.addEventListener("change", onChange, true);
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onUnhandledRejection);
  document.addEventListener("visibilitychange", onVisibilityChange);
  return () => {
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("change", onChange, true);
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onUnhandledRejection);
    document.removeEventListener("visibilitychange", onVisibilityChange);
    initialized = false;
    void flushProductAnalytics(true);
  };
}
