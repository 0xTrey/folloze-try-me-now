ALTER TABLE try_me_leads
  ADD COLUMN IF NOT EXISTS claim_attempt_id text;

ALTER TABLE try_me_leads
  ADD COLUMN IF NOT EXISTS claim_attempt_started_at timestamptz;

UPDATE try_me_leads
SET claim_attempt_id = COALESCE(claim_attempt_id, 'legacy:' || session_id),
    claim_attempt_started_at = COALESCE(claim_attempt_started_at, captured_at)
WHERE claim_attempt_id IS NULL OR claim_attempt_started_at IS NULL;

ALTER TABLE try_me_leads
  ALTER COLUMN claim_attempt_id SET NOT NULL,
  ALTER COLUMN claim_attempt_started_at SET NOT NULL;

ALTER TABLE try_me_leads
  DROP CONSTRAINT IF EXISTS try_me_leads_claim_attempt_id_check;

ALTER TABLE try_me_leads
  ADD CONSTRAINT try_me_leads_claim_attempt_id_check
  CHECK (length(claim_attempt_id) BETWEEN 8 AND 128);

ALTER TABLE try_me_leads
  DROP CONSTRAINT IF EXISTS try_me_leads_artifact_revision_check;

ALTER TABLE try_me_leads
  ADD CONSTRAINT try_me_leads_artifact_revision_check
  CHECK (artifact_revision >= 0);

ALTER TABLE try_me_leads
  DROP CONSTRAINT IF EXISTS try_me_leads_artifact_digest_check;

ALTER TABLE try_me_leads
  ADD CONSTRAINT try_me_leads_artifact_digest_check
  CHECK (artifact_digest ~ '^[a-f0-9]{64}$');

CREATE INDEX IF NOT EXISTS try_me_leads_pending_reconciliation_idx
  ON try_me_leads (updated_at)
  WHERE claim_status = 'captured';
