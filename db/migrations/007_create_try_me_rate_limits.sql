CREATE TABLE IF NOT EXISTS try_me_rate_limits (
  bucket_key text PRIMARY KEY
    CONSTRAINT try_me_rate_limits_bucket_key_check
    CHECK (length(bucket_key) BETWEEN 16 AND 128),
  request_count integer NOT NULL
    CONSTRAINT try_me_rate_limits_request_count_check
    CHECK (request_count >= 1),
  reset_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS try_me_rate_limits_reset_at_idx
  ON try_me_rate_limits (reset_at);
