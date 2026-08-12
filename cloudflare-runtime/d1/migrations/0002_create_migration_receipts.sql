-- Unapplied, inactive migration layer. Never run by application startup or CI.
CREATE TABLE IF NOT EXISTS cf_migration_object_receipts (run_token TEXT NOT NULL, receipt_ref TEXT NOT NULL, ownership TEXT NOT NULL CHECK (ownership IN ('created','preexisting')), sha256 TEXT NOT NULL, content_type TEXT NOT NULL, PRIMARY KEY (run_token, receipt_ref));
CREATE TABLE IF NOT EXISTS cf_migration_mappings (source_identity_hash TEXT PRIMARY KEY, destination_ref TEXT NOT NULL UNIQUE, sha256 TEXT NOT NULL, bytes INTEGER NOT NULL CHECK (bytes >= 0), kind TEXT NOT NULL, created_run_token TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS cf_migration_mapping_receipts (run_token TEXT NOT NULL, receipt_ref TEXT NOT NULL, ownership TEXT NOT NULL CHECK (ownership IN ('created','preexisting')), PRIMARY KEY (run_token, receipt_ref));
CREATE INDEX IF NOT EXISTS cf_migration_mapping_receipt_run ON cf_migration_mapping_receipts (run_token);
