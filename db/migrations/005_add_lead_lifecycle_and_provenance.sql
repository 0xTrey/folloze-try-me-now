ALTER TABLE try_me_leads
  ADD COLUMN IF NOT EXISTS cta_type text,
  ADD COLUMN IF NOT EXISTS cta_style text,
  ADD COLUMN IF NOT EXISTS source_host text,
  ADD COLUMN IF NOT EXISTS source_title text,
  ADD COLUMN IF NOT EXISTS preview_url text,
  ADD COLUMN IF NOT EXISTS preview_status text,
  ADD COLUMN IF NOT EXISTS save_status text,
  ADD COLUMN IF NOT EXISTS saved_experience_url text;

UPDATE try_me_leads
SET preview_url = COALESCE(preview_url, experience_url),
    preview_status = COALESCE(preview_status, 'ready'),
    save_status = COALESCE(
      save_status,
      CASE
        WHEN claim_status = 'claimed' THEN 'saved'
        WHEN claim_status = 'failed' THEN 'failed'
        ELSE 'pending'
      END
    ),
    saved_experience_url = COALESCE(
      saved_experience_url,
      CASE WHEN claim_status = 'claimed' THEN experience_url ELSE NULL END
    )
WHERE preview_url IS NULL OR preview_status IS NULL OR save_status IS NULL;

-- Keep the expanded lifecycle columns nullable during this release so the
-- previous deployment can continue writing while the new deployment rolls
-- out. The application always supplies them, and a later contract migration
-- can add NOT NULL constraints after old functions have drained.

ALTER TABLE try_me_leads
  DROP CONSTRAINT IF EXISTS try_me_leads_preview_status_check;

ALTER TABLE try_me_leads
  ADD CONSTRAINT try_me_leads_preview_status_check
  CHECK (preview_status IN ('ready'));

ALTER TABLE try_me_leads
  DROP CONSTRAINT IF EXISTS try_me_leads_save_status_check;

ALTER TABLE try_me_leads
  ADD CONSTRAINT try_me_leads_save_status_check
  CHECK (save_status IN ('pending', 'saved', 'failed'));

ALTER TABLE try_me_leads
  DROP CONSTRAINT IF EXISTS try_me_leads_cta_type_check;

ALTER TABLE try_me_leads
  ADD CONSTRAINT try_me_leads_cta_type_check
  CHECK (
    cta_type IS NULL OR cta_type IN (
      'book-meeting',
      'contact-sales',
      'register',
      'download',
      'explore',
      'custom'
    )
  );

ALTER TABLE try_me_leads
  DROP CONSTRAINT IF EXISTS try_me_leads_cta_style_check;

ALTER TABLE try_me_leads
  ADD CONSTRAINT try_me_leads_cta_style_check
  CHECK (cta_style IS NULL OR cta_style IN ('solid', 'outline', 'text'));

ALTER TABLE try_me_leads
  DROP CONSTRAINT IF EXISTS try_me_leads_source_host_check;

ALTER TABLE try_me_leads
  ADD CONSTRAINT try_me_leads_source_host_check
  CHECK (
    source_host IS NULL OR (
      length(source_host) BETWEEN 1 AND 253
      AND source_host !~ '[/@]'
    )
  );

ALTER TABLE try_me_leads
  DROP CONSTRAINT IF EXISTS try_me_leads_source_title_check;

ALTER TABLE try_me_leads
  ADD CONSTRAINT try_me_leads_source_title_check
  CHECK (source_title IS NULL OR length(source_title) BETWEEN 1 AND 160);

CREATE INDEX IF NOT EXISTS try_me_leads_save_status_idx
  ON try_me_leads (save_status, updated_at DESC);
