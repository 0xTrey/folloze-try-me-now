CREATE TABLE IF NOT EXISTS try_me_visitors (
  visitor_id text PRIMARY KEY
    CONSTRAINT try_me_visitors_id_check
    CHECK (visitor_id ~ '^tmv_[a-zA-Z0-9_-]{16,96}$'),
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  first_landing_path text,
  first_referrer_host text,
  first_utm jsonb NOT NULL DEFAULT '{}'::jsonb,
  identified_at timestamptz,
  claimed_session_id text,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '365 days')
);

CREATE INDEX IF NOT EXISTS try_me_visitors_last_seen_idx
  ON try_me_visitors (last_seen_at DESC);

CREATE INDEX IF NOT EXISTS try_me_visitors_expires_idx
  ON try_me_visitors (expires_at);

CREATE TABLE IF NOT EXISTS try_me_browser_sessions (
  browser_session_id text PRIMARY KEY
    CONSTRAINT try_me_browser_sessions_id_check
    CHECK (browser_session_id ~ '^tmb_[a-zA-Z0-9_-]{16,96}$'),
  visitor_id text NOT NULL REFERENCES try_me_visitors(visitor_id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  landing_path text,
  referrer_host text,
  utm jsonb NOT NULL DEFAULT '{}'::jsonb,
  device_class text
    CONSTRAINT try_me_browser_sessions_device_check
    CHECK (device_class IS NULL OR device_class IN ('desktop', 'tablet', 'mobile', 'unknown')),
  browser_family text,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '180 days')
);

CREATE INDEX IF NOT EXISTS try_me_browser_sessions_visitor_activity_idx
  ON try_me_browser_sessions (visitor_id, last_activity_at DESC);

CREATE INDEX IF NOT EXISTS try_me_browser_sessions_expires_idx
  ON try_me_browser_sessions (expires_at);

CREATE TABLE IF NOT EXISTS try_me_product_sessions (
  session_id text PRIMARY KEY
    CONSTRAINT try_me_product_sessions_id_check
    CHECK (length(session_id) BETWEEN 8 AND 128),
  visitor_id text REFERENCES try_me_visitors(visitor_id) ON DELETE SET NULL,
  browser_session_id text REFERENCES try_me_browser_sessions(browser_session_id) ON DELETE SET NULL,
  trace_id text,
  support_ref text,
  use_case text NOT NULL
    CONSTRAINT try_me_product_sessions_use_case_check
    CHECK (use_case IN ('abm', 'campaign', 'content')),
  status text NOT NULL,
  company_domain text NOT NULL,
  target_domain text,
  business_email text,
  input_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL,
  last_activity_at timestamptz NOT NULL,
  preview_ready_at timestamptz,
  identified_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '365 days')
);

CREATE INDEX IF NOT EXISTS try_me_product_sessions_visitor_activity_idx
  ON try_me_product_sessions (visitor_id, last_activity_at DESC);

CREATE INDEX IF NOT EXISTS try_me_product_sessions_email_idx
  ON try_me_product_sessions (lower(business_email))
  WHERE business_email IS NOT NULL;

CREATE INDEX IF NOT EXISTS try_me_product_sessions_support_ref_idx
  ON try_me_product_sessions (support_ref)
  WHERE support_ref IS NOT NULL;

CREATE INDEX IF NOT EXISTS try_me_product_sessions_activity_idx
  ON try_me_product_sessions (last_activity_at DESC);

CREATE INDEX IF NOT EXISTS try_me_product_sessions_expires_idx
  ON try_me_product_sessions (expires_at);

CREATE TABLE IF NOT EXISTS try_me_product_events (
  event_id text PRIMARY KEY
    CONSTRAINT try_me_product_events_id_check
    CHECK (event_id ~ '^tme_[a-zA-Z0-9_-]{16,128}$'),
  visitor_id text REFERENCES try_me_visitors(visitor_id) ON DELETE SET NULL,
  browser_session_id text REFERENCES try_me_browser_sessions(browser_session_id) ON DELETE SET NULL,
  session_id text,
  event_name text NOT NULL
    CONSTRAINT try_me_product_events_name_check
    CHECK (event_name ~ '^[a-z][a-z0-9_]{2,79}$'),
  category text NOT NULL
    CONSTRAINT try_me_product_events_category_check
    CHECK (category IN ('navigation', 'interaction', 'input', 'workflow', 'conversion', 'error', 'performance')),
  source text NOT NULL
    CONSTRAINT try_me_product_events_source_check
    CHECK (source IN ('builder', 'server', 'generated_experience')),
  path text,
  outcome text
    CONSTRAINT try_me_product_events_outcome_check
    CHECK (outcome IS NULL OR outcome IN ('started', 'success', 'failure', 'cancelled', 'info')),
  duration_ms integer
    CONSTRAINT try_me_product_events_duration_check
    CHECK (duration_ms IS NULL OR duration_ms BETWEEN 0 AND 300000),
  properties jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '365 days')
);

CREATE INDEX IF NOT EXISTS try_me_product_events_session_created_idx
  ON try_me_product_events (session_id, created_at ASC);

CREATE INDEX IF NOT EXISTS try_me_product_events_browser_created_idx
  ON try_me_product_events (browser_session_id, created_at ASC);

CREATE INDEX IF NOT EXISTS try_me_product_events_visitor_created_idx
  ON try_me_product_events (visitor_id, created_at DESC);

CREATE INDEX IF NOT EXISTS try_me_product_events_name_created_idx
  ON try_me_product_events (event_name, created_at DESC);

CREATE INDEX IF NOT EXISTS try_me_product_events_expires_idx
  ON try_me_product_events (expires_at);
