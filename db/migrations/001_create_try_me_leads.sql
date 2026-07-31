CREATE TABLE IF NOT EXISTS try_me_leads (
  session_id text PRIMARY KEY,
  claim_attempt_id text NOT NULL CONSTRAINT try_me_leads_claim_attempt_id_check CHECK (length(claim_attempt_id) BETWEEN 8 AND 128),
  claim_attempt_started_at timestamptz NOT NULL,
  email text NOT NULL,
  email_domain text NOT NULL,
  company_domain text NOT NULL,
  target_domain text,
  use_case text NOT NULL CONSTRAINT try_me_leads_use_case_check CHECK (use_case IN ('abm', 'campaign', 'content')),
  audience text,
  objective text,
  campaign_type text,
  source_kind text NOT NULL CONSTRAINT try_me_leads_source_kind_check CHECK (source_kind IN ('url', 'pdf', 'none')),
  experience_url text NOT NULL,
  artifact_revision integer NOT NULL CONSTRAINT try_me_leads_artifact_revision_check CHECK (artifact_revision >= 0),
  artifact_digest text NOT NULL CONSTRAINT try_me_leads_artifact_digest_check CHECK (artifact_digest ~ '^[a-f0-9]{64}$'),
  generation_source text,
  claim_status text NOT NULL CONSTRAINT try_me_leads_claim_status_check CHECK (claim_status IN ('captured', 'claimed', 'failed')),
  publish_status text NOT NULL CONSTRAINT try_me_leads_publish_status_check CHECK (publish_status IN ('pending', 'not-attempted', 'published', 'preview-only', 'failed')),
  email_status text NOT NULL CONSTRAINT try_me_leads_email_status_check CHECK (email_status IN ('pending', 'not-attempted', 'sent', 'skipped', 'failed')),
  consent_scope text NOT NULL DEFAULT 'transactional_experience_delivery',
  captured_at timestamptz NOT NULL,
  claimed_at timestamptz,
  updated_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS try_me_leads_captured_at_idx
  ON try_me_leads (captured_at DESC);

CREATE INDEX IF NOT EXISTS try_me_leads_email_idx
  ON try_me_leads (lower(email));

CREATE INDEX IF NOT EXISTS try_me_leads_company_domain_idx
  ON try_me_leads (company_domain, captured_at DESC);
