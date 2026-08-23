import { sanitizeObservabilityText } from "@/lib/observability-sanitize";

export const PRODUCT_EVENT_NAMES = [
  "analytics_panel_opened",
  "analytics_prompt_shown",
  "api_request_completed",
  "api_request_failed",
  "browser_error",
  "brand_help_requested",
  "brand_logo_failed",
  "brand_logo_rendered",
  "brief_field_confirmed",
  "brief_field_edited",
  "brief_field_skipped",
  "build_started",
  "campaign_type_selected",
  "claim_attempted",
  "claim_completed",
  "claim_failed",
  "claim_started",
  "composition_selected",
  "cta_interaction",
  "domain_stabilized",
  "domain_submitted",
  "domain_confirmed",
  "example_opened",
  "experience_claimed",
  "experience_revealed",
  "field_interacted",
  "final_rendered",
  "input_interpreted",
  "modal_displayed",
  "page_viewed",
  "path_selected",
  "pdf_upload_completed",
  "pdf_upload_failed",
  "pdf_upload_started",
  "personalization_variant_viewed",
  "preview_interaction",
  "preview_rendered",
  "preview_scrolled",
  "production_plan_ready",
  "provisional_rendered",
  "research_started",
  "resource_interaction",
  "retry_requested",
  "session_created",
  "session_status_changed",
  "audience_confirmed",
  "goal_confirmed",
  "save_opened",
  "save_completed",
  "support_reference_created",
  "ui_click",
  "unhandled_rejection",
  "unified_entry_started",
  "use_case_selected",
  "visitor_identified",
  "visitor_session_started",
  "worker_completed",
  "worker_failed",
  "worker_fell_back",
  "worker_started",
  "worker_timed_out"
] as const;

export type ProductEventName = (typeof PRODUCT_EVENT_NAMES)[number];

/** Wave-1 unified builder product events. Separate from generated-experience engagement names. */
export const UNIFIED_PRODUCT_EVENT_NAMES = [
  "unified_entry_started",
  "domain_stabilized",
  "input_interpreted",
  "brief_field_confirmed",
  "brief_field_edited",
  "brief_field_skipped",
  "brand_help_requested",
  "worker_started",
  "worker_completed",
  "worker_timed_out",
  "worker_fell_back",
  "worker_failed",
  "composition_selected",
  "production_plan_ready",
  "provisional_rendered",
  "final_rendered",
  "personalization_variant_viewed",
  "resource_interaction",
  "cta_interaction",
  "modal_displayed",
  "claim_attempted",
  "retry_requested",
  "support_reference_created"
] as const;

export type UnifiedProductEventName = (typeof UNIFIED_PRODUCT_EVENT_NAMES)[number];

export const PRODUCT_EVENT_CATEGORIES = [
  "navigation",
  "interaction",
  "input",
  "workflow",
  "conversion",
  "error",
  "performance"
] as const;
export type ProductEventCategory = (typeof PRODUCT_EVENT_CATEGORIES)[number];

const privateAnalyticsPropertyKey =
  /(?:authorization|cookie|credential|domain|hostname|host|sessionid|email|html|content|copy|password|passphrase|prompt(?:body|text|data|value)?|response(?:body|text|data|value)?|stack|cause|headers?|body|secret|token|apikey|sourceurl|sourcebody|sourcecontent|sourcename|filename|filepath|fileid|uploadid|uploadname|uploadpath|companydomain|targetdomain|businessemail|temporaryurl)$/i;

export const UNSAFE_ANALYTICS_PROPERTY_VALUE_PATTERN =
  /@|https?:\/\/|\b(?:www\.)?(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:com|org|net|io|co|ai|dev|app|info|biz|edu|gov|cloud|tech|xyz|us|uk|ca|de|fr|au|jp|nl|eu|tv|me|cc)\b/i;

export const UNIFIED_BRIEF_FIELD_KEYS = [
  "seller",
  "target",
  "audience",
  "offer",
  "objective",
  "experience_type"
] as const;

export const UNIFIED_WORKER_NAMES = [
  "brand",
  "audience",
  "story",
  "render",
  "enrichment",
  "composition",
  "claim"
] as const;

export const UNIFIED_VARIANT_IDS = [
  "generic",
  "account",
  "account_industry",
  "account_industry_persona_a",
  "account_industry_persona_b"
] as const;

export const UNIFIED_PRODUCT_EVENT_CONTRACTS: Record<
  UnifiedProductEventName,
  {
    category: ProductEventCategory;
    allowedProperties: readonly string[];
  }
> = {
  unified_entry_started: {
    category: "navigation",
    allowedProperties: ["entry_surface", "device_class"]
  },
  domain_stabilized: {
    category: "input",
    allowedProperties: ["domain_role", "normalization", "has_value"]
  },
  input_interpreted: {
    category: "input",
    allowedProperties: ["interpretation", "field_count", "has_offer", "has_objective"]
  },
  brief_field_confirmed: {
    category: "input",
    allowedProperties: ["field_key", "has_value"]
  },
  brief_field_edited: {
    category: "input",
    allowedProperties: ["field_key", "has_value"]
  },
  brief_field_skipped: {
    category: "input",
    allowedProperties: ["field_key"]
  },
  brand_help_requested: {
    category: "workflow",
    allowedProperties: ["artifact_revision", "requested_input_kind", "duration_bucket"]
  },
  worker_started: {
    category: "workflow",
    allowedProperties: ["worker_name", "attempt_bucket"]
  },
  worker_completed: {
    category: "workflow",
    allowedProperties: ["worker_name", "duration_bucket", "attempt_bucket"]
  },
  worker_timed_out: {
    category: "workflow",
    allowedProperties: ["worker_name", "duration_bucket", "attempt_bucket"]
  },
  worker_fell_back: {
    category: "workflow",
    allowedProperties: ["worker_name", "fallback_kind", "duration_bucket"]
  },
  worker_failed: {
    category: "error",
    allowedProperties: ["worker_name", "error_code", "duration_bucket", "retryable"]
  },
  composition_selected: {
    category: "workflow",
    allowedProperties: ["composition_id", "route_family", "rank"]
  },
  production_plan_ready: {
    category: "performance",
    allowedProperties: ["artifact_revision", "section_count", "duration_bucket"]
  },
  provisional_rendered: {
    category: "performance",
    allowedProperties: ["artifact_revision", "duration_bucket", "quality_gate"]
  },
  final_rendered: {
    category: "performance",
    allowedProperties: ["artifact_revision", "duration_bucket", "quality_gate"]
  },
  personalization_variant_viewed: {
    category: "interaction",
    allowedProperties: ["variant_id", "has_evidence"]
  },
  resource_interaction: {
    category: "interaction",
    allowedProperties: ["interaction_type", "interaction_target", "area"]
  },
  cta_interaction: {
    category: "interaction",
    allowedProperties: ["interaction_type", "interaction_target", "area", "cta_kind"]
  },
  modal_displayed: {
    category: "conversion",
    allowedProperties: ["modal_kind", "trigger"]
  },
  claim_attempted: {
    category: "conversion",
    allowedProperties: ["claim_step", "has_value"]
  },
  retry_requested: {
    category: "workflow",
    allowedProperties: ["retry_scope", "worker_name"]
  },
  support_reference_created: {
    category: "error",
    allowedProperties: ["support_ref", "failure_stage"]
  }
};

export function isPrivateAnalyticsPropertyKey(key: string): boolean {
  return privateAnalyticsPropertyKey.test(key.replace(/[^a-z0-9]/gi, ""));
}

export function productEventCategoryFor(event: ProductEventName): ProductEventCategory {
  if (event in UNIFIED_PRODUCT_EVENT_CONTRACTS) {
    return UNIFIED_PRODUCT_EVENT_CONTRACTS[event as UnifiedProductEventName].category;
  }
  if (
    event === "domain_submitted"
    || event === "domain_confirmed"
    || event === "field_interacted"
    || event === "campaign_type_selected"
    || event === "audience_confirmed"
    || event === "goal_confirmed"
    || event === "use_case_selected"
  ) {
    return "input";
  }
  if (
    event === "experience_claimed"
    || event === "claim_started"
    || event === "claim_completed"
    || event === "claim_failed"
    || event === "save_opened"
    || event === "save_completed"
  ) {
    return "conversion";
  }
  if (event.endsWith("_failed") || event === "browser_error" || event === "unhandled_rejection") {
    return "error";
  }
  if (event === "page_viewed" || event === "visitor_session_started" || event === "example_opened") {
    return "navigation";
  }
  if (event === "preview_rendered" || event === "api_request_completed") {
    return "performance";
  }
  if (
    event === "build_started"
    || event === "research_started"
    || event === "session_created"
    || event === "session_status_changed"
    || event === "pdf_upload_started"
    || event === "pdf_upload_completed"
    || event === "pdf_upload_failed"
  ) {
    return "workflow";
  }
  return "interaction";
}

export function assertUnifiedProductEventProperties(
  event: UnifiedProductEventName,
  properties: Record<string, string | number | boolean | null> | undefined
): Record<string, string | number | boolean | null> | undefined {
  if (!properties) return undefined;
  const contract = UNIFIED_PRODUCT_EVENT_CONTRACTS[event];
  const allowed = new Set(contract.allowedProperties);
  const next: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(properties)) {
    if (!allowed.has(key)) {
      throw new Error(`Unified analytics event ${event} does not allow property ${key}.`);
    }
    if (isPrivateAnalyticsPropertyKey(key)) {
      throw new Error(`Analytics property key ${key} is not permitted.`);
    }
    if (typeof value === "string") {
      if (event === "support_reference_created" && key === "support_ref") {
        if (!/^TMN-[A-Z0-9]{8,16}$/.test(value)) {
          throw new Error("support_ref must be a public TMN support reference.");
        }
        next[key] = value;
        continue;
      }
      const scrubbed = sanitizeObservabilityText(value, 160);
      if (UNSAFE_ANALYTICS_PROPERTY_VALUE_PATTERN.test(value) || /\[redacted-/i.test(scrubbed)) {
        throw new Error(`Analytics property ${key} contains identifying or sensitive content.`);
      }
      next[key] = scrubbed;
      continue;
    }
    next[key] = value;
  }
  return Object.keys(next).length ? next : undefined;
}
