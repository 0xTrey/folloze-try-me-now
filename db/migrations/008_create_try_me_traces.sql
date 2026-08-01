CREATE TABLE IF NOT EXISTS try_me_traces (
  event_id text PRIMARY KEY
    CONSTRAINT try_me_traces_event_id_check
    CHECK (length(event_id) BETWEEN 8 AND 128),
  trace_id text NOT NULL
    CONSTRAINT try_me_traces_trace_id_check
    CHECK (length(trace_id) BETWEEN 8 AND 128),
  support_ref text NOT NULL
    CONSTRAINT try_me_traces_support_ref_check
    CHECK (length(support_ref) BETWEEN 8 AND 32),
  event_name text NOT NULL
    CONSTRAINT try_me_traces_event_name_check
    CHECK (length(event_name) BETWEEN 3 AND 128),
  stage text NOT NULL
    CONSTRAINT try_me_traces_stage_check
    CHECK (stage IN ('session', 'brand', 'audience', 'story', 'render', 'preview', 'claim', 'maintenance')),
  outcome text NOT NULL
    CONSTRAINT try_me_traces_outcome_check
    CHECK (outcome IN ('started', 'success', 'fallback', 'error', 'info')),
  request_id text,
  span_id text,
  duration_ms integer
    CONSTRAINT try_me_traces_duration_check
    CHECK (duration_ms IS NULL OR duration_ms BETWEEN 0 AND 300000),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days')
);

CREATE INDEX IF NOT EXISTS try_me_traces_trace_created_idx
  ON try_me_traces (trace_id, created_at ASC);

CREATE INDEX IF NOT EXISTS try_me_traces_support_created_idx
  ON try_me_traces (support_ref, created_at ASC);

CREATE INDEX IF NOT EXISTS try_me_traces_expires_idx
  ON try_me_traces (expires_at);
