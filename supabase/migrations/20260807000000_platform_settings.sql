-- ============================================================
-- SmartLinkNet Platform Settings
-- Stores platform-level config (not per-tenant).
-- SmartLinkNet operator sets freeradius_ip once after deploying
-- the FreeRADIUS server. All ISP routers automatically use it.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.platform_settings (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Only service_role can read/write platform settings
GRANT SELECT, INSERT, UPDATE ON public.platform_settings TO service_role;
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_only" ON public.platform_settings
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Seed default FreeRADIUS platform config
-- Operator updates freeradius_ip after running freeradius/setup.sh
INSERT INTO public.platform_settings (key, value) VALUES
  ('freeradius', jsonb_build_object(
    'primary_ip',        null,
    'secondary_ip',      null,
    'auth_port',         1812,
    'acct_port',         1813,
    'coa_port',          3799,
    'interim_interval',  300,
    'timeout_ms',        3000,
    'retry_count',       3,
    'shared_secret',     null,
    'coa_shim_port',     8080,
    'deployed',          false
  ))
ON CONFLICT (key) DO NOTHING;
