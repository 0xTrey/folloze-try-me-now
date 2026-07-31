ALTER TABLE try_me_events
  ADD COLUMN IF NOT EXISTS event_id text;

ALTER TABLE try_me_events
  DROP CONSTRAINT IF EXISTS try_me_events_event_id_check;

ALTER TABLE try_me_events
  ADD CONSTRAINT try_me_events_event_id_check
  CHECK (event_id IS NULL OR length(event_id) BETWEEN 8 AND 128);

CREATE UNIQUE INDEX IF NOT EXISTS try_me_events_event_id_idx
  ON try_me_events (event_id);
