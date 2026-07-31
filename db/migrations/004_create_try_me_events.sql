CREATE TABLE IF NOT EXISTS try_me_events (
  id bigserial PRIMARY KEY,
  session_id text NOT NULL CONSTRAINT try_me_events_session_id_check
    CHECK (length(session_id) BETWEEN 8 AND 128),
  event_name text NOT NULL CONSTRAINT try_me_events_event_name_check
    CHECK (event_name IN (
      'anchor_click',
      'topic_select',
      'cta_click',
      'signature_select',
      'question_select',
      'section_dwell',
      'page_heartbeat',
      'experience_view'
    )),
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS try_me_events_session_created_idx
  ON try_me_events (session_id, created_at DESC);

CREATE INDEX IF NOT EXISTS try_me_events_created_idx
  ON try_me_events (created_at DESC);

