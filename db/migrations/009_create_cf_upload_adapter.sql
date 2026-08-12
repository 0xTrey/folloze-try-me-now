-- Inactive Cloudflare adapter persistence. Apply only with an explicitly authorized Worker migration run.
CREATE TABLE IF NOT EXISTS cf_upload_capabilities (
  nonce TEXT PRIMARY KEY, session_id TEXT NOT NULL, upload_id TEXT NOT NULL,
  object_key TEXT NOT NULL, status_key TEXT NOT NULL UNIQUE, expires_at INTEGER NOT NULL,
  mime TEXT NOT NULL CHECK (mime = 'application/pdf'), max_bytes INTEGER NOT NULL CHECK (max_bytes > 0),
  UNIQUE(session_id, upload_id)
);
CREATE TABLE IF NOT EXISTS cf_upload_status (
  status_key TEXT PRIMARY KEY, status TEXT NOT NULL CHECK (status IN ('pending','processing','complete','failed')),
  version INTEGER NOT NULL, owner TEXT, lease_until INTEGER, attempts INTEGER NOT NULL DEFAULT 0, etag TEXT
);
CREATE TABLE IF NOT EXISTS cf_upload_sessions (session_id TEXT PRIMARY KEY, version INTEGER NOT NULL, data_json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS cf_upload_outcomes (status_key TEXT PRIMARY KEY, session_id TEXT NOT NULL, upload_id TEXT NOT NULL, outcome TEXT NOT NULL, created_at INTEGER NOT NULL DEFAULT (unixepoch()));
