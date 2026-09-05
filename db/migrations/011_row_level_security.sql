-- Apply on an isolated database branch first. Provision login roles separately.
-- No password, login, or role membership is created by this migration.
-- The runtime login must inherit try_me_runtime and must NOT own tables or have
-- BYPASSRLS. Maintenance credentials must never be used by public request code.
CREATE ROLE try_me_runtime NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
CREATE ROLE try_me_maintenance NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
GRANT USAGE ON SCHEMA public TO try_me_runtime, try_me_maintenance;
REVOKE ALL ON try_me_leads, try_me_events, try_me_rate_limits, try_me_traces,
  try_me_build_traces, try_me_visitors, try_me_browser_sessions,
  try_me_product_sessions, try_me_product_events FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON try_me_leads TO try_me_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON try_me_leads TO try_me_maintenance;
ALTER TABLE try_me_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE try_me_leads FORCE ROW LEVEL SECURITY;
CREATE POLICY try_me_lead_scope ON try_me_leads TO try_me_runtime
  USING (session_id = current_setting('tmn.session_id', true))
  WITH CHECK (session_id = current_setting('tmn.session_id', true));
CREATE POLICY try_me_lead_maintenance ON try_me_leads TO try_me_maintenance
  USING (true) WITH CHECK (true);

-- These tables serve server-side telemetry and abuse prevention, not browser
-- database access. Trusted service policies do not replace API record checks.
GRANT SELECT, INSERT, UPDATE, DELETE ON try_me_events, try_me_rate_limits,
  try_me_traces, try_me_build_traces, try_me_visitors, try_me_browser_sessions,
  try_me_product_sessions, try_me_product_events TO try_me_runtime, try_me_maintenance;
GRANT USAGE, SELECT ON SEQUENCE try_me_events_id_seq TO try_me_runtime, try_me_maintenance;
ALTER TABLE try_me_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE try_me_events FORCE ROW LEVEL SECURITY;
CREATE POLICY try_me_events_service ON try_me_events TO try_me_runtime, try_me_maintenance USING (true) WITH CHECK (true);
ALTER TABLE try_me_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE try_me_rate_limits FORCE ROW LEVEL SECURITY;
CREATE POLICY try_me_rate_limits_service ON try_me_rate_limits TO try_me_runtime, try_me_maintenance USING (true) WITH CHECK (true);
ALTER TABLE try_me_traces ENABLE ROW LEVEL SECURITY;
ALTER TABLE try_me_traces FORCE ROW LEVEL SECURITY;
CREATE POLICY try_me_traces_service ON try_me_traces TO try_me_runtime, try_me_maintenance USING (true) WITH CHECK (true);
ALTER TABLE try_me_build_traces ENABLE ROW LEVEL SECURITY;
ALTER TABLE try_me_build_traces FORCE ROW LEVEL SECURITY;
CREATE POLICY try_me_build_traces_service ON try_me_build_traces TO try_me_runtime, try_me_maintenance USING (true) WITH CHECK (true);
ALTER TABLE try_me_visitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE try_me_visitors FORCE ROW LEVEL SECURITY;
CREATE POLICY try_me_visitors_service ON try_me_visitors TO try_me_runtime, try_me_maintenance USING (true) WITH CHECK (true);
ALTER TABLE try_me_browser_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE try_me_browser_sessions FORCE ROW LEVEL SECURITY;
CREATE POLICY try_me_browser_sessions_service ON try_me_browser_sessions TO try_me_runtime, try_me_maintenance USING (true) WITH CHECK (true);
ALTER TABLE try_me_product_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE try_me_product_sessions FORCE ROW LEVEL SECURITY;
CREATE POLICY try_me_product_sessions_service ON try_me_product_sessions TO try_me_runtime, try_me_maintenance USING (true) WITH CHECK (true);
ALTER TABLE try_me_product_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE try_me_product_events FORCE ROW LEVEL SECURITY;
CREATE POLICY try_me_product_events_service ON try_me_product_events TO try_me_runtime, try_me_maintenance USING (true) WITH CHECK (true);
