-- Private first-party build provenance. Additive: no existing table changes.
-- One row per build attempt, keyed so a retry of the same attempt is a no-op.
CREATE TABLE IF NOT EXISTS try_me_build_traces (
  attempt_id text PRIMARY KEY
    CONSTRAINT try_me_build_traces_attempt_id_check
    CHECK (length(attempt_id) BETWEEN 8 AND 128),
  trace_id text NOT NULL
    CONSTRAINT try_me_build_traces_trace_id_check
    CHECK (length(trace_id) BETWEEN 8 AND 128),
  session_id text NOT NULL
    CONSTRAINT try_me_build_traces_session_id_check
    CHECK (length(session_id) BETWEEN 4 AND 128),
  support_ref text NOT NULL
    CONSTRAINT try_me_build_traces_support_ref_check
    CHECK (length(support_ref) BETWEEN 8 AND 32),
  schema_version integer NOT NULL
    CONSTRAINT try_me_build_traces_schema_version_check
    CHECK (schema_version >= 1),
  pipeline_version text NOT NULL
    CONSTRAINT try_me_build_traces_pipeline_version_check
    CHECK (length(pipeline_version) BETWEEN 3 AND 64),
  revision integer NOT NULL
    CONSTRAINT try_me_build_traces_revision_check
    CHECK (revision >= 0),
  terminal_status text NOT NULL
    CONSTRAINT try_me_build_traces_terminal_status_check
    CHECK (terminal_status IN ('completed', 'fallback', 'needs_input', 'failed', 'stale')),
  section_count integer NOT NULL DEFAULT 0
    CONSTRAINT try_me_build_traces_section_count_check
    CHECK (section_count BETWEEN 0 AND 64),
  fallback_count integer NOT NULL DEFAULT 0
    CONSTRAINT try_me_build_traces_fallback_count_check
    CHECK (fallback_count BETWEEN 0 AND 256),
  byte_size integer NOT NULL
    CONSTRAINT try_me_build_traces_byte_size_check
    CHECK (byte_size BETWEEN 1 AND 262144),
  trace jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days')
);

CREATE INDEX IF NOT EXISTS try_me_build_traces_trace_created_idx
  ON try_me_build_traces (trace_id, created_at ASC);

CREATE INDEX IF NOT EXISTS try_me_build_traces_support_created_idx
  ON try_me_build_traces (support_ref, created_at ASC);

CREATE INDEX IF NOT EXISTS try_me_build_traces_session_revision_idx
  ON try_me_build_traces (session_id, revision DESC);

CREATE INDEX IF NOT EXISTS try_me_build_traces_expires_idx
  ON try_me_build_traces (expires_at);
