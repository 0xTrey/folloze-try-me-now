ALTER TABLE try_me_leads
  ADD COLUMN IF NOT EXISTS artifact_revision integer;

ALTER TABLE try_me_leads
  ADD COLUMN IF NOT EXISTS artifact_digest text;

UPDATE try_me_leads
SET artifact_revision = COALESCE(artifact_revision, 0),
    artifact_digest = COALESCE(artifact_digest, repeat('0', 64))
WHERE artifact_revision IS NULL OR artifact_digest IS NULL;

ALTER TABLE try_me_leads
  ALTER COLUMN artifact_revision SET NOT NULL,
  ALTER COLUMN artifact_digest SET NOT NULL;

ALTER TABLE try_me_leads
  DROP CONSTRAINT IF EXISTS try_me_leads_publish_status_check;

ALTER TABLE try_me_leads
  ADD CONSTRAINT try_me_leads_publish_status_check
  CHECK (publish_status IN ('pending', 'not-attempted', 'published', 'preview-only', 'failed'));

ALTER TABLE try_me_leads
  DROP CONSTRAINT IF EXISTS try_me_leads_email_status_check;

ALTER TABLE try_me_leads
  ADD CONSTRAINT try_me_leads_email_status_check
  CHECK (email_status IN ('pending', 'not-attempted', 'sent', 'skipped', 'failed'));
