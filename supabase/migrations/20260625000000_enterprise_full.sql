-- ============================================================
-- SmartLinkNet Enterprise Full Migration
-- AAA/RADIUS, HA, Backup, Job Queue enhancements,
-- Observability, White-label, Compliance, NOC++
-- ============================================================

-- ============================================================
-- ENUM TYPES
-- ============================================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'nas_vendor') THEN
    CREATE TYPE public.nas_vendor AS ENUM ('mikrotik','cisco','ubiquiti','freeradius','generic');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'radius_protocol') THEN
    CREATE TYPE public.radius_protocol AS ENUM ('pap','chap','mschapv2','eap');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'backup_status') THEN
    CREATE TYPE public.backup_status AS ENUM ('pending','running','completed','failed','expired');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'backup_type') THEN
    CREATE TYPE public.backup_type AS ENUM ('full','incremental','differential','config');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'health_status') THEN
    CREATE TYPE public.health_status AS ENUM ('healthy','degraded','unhealthy','unknown');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'incident_severity') THEN
    CREATE TYPE public.incident_severity AS ENUM ('p1','p2','p3','p4');
  END IF;
END $$;

-- ============================================================
-- AAA — NAS DEVICES (Network Access Servers)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.nas_devices (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  router_id     UUID REFERENCES public.routers(id) ON DELETE SET NULL,
  name          TEXT NOT NULL,
  description   TEXT,
  vendor        public.nas_vendor NOT NULL DEFAULT 'mikrotik',
  nas_identifier TEXT,               -- RADIUS NAS-Identifier attribute
  nas_ip        TEXT,                -- NAS-IP-Address
  shared_secret TEXT NOT NULL,       -- RADIUS shared secret (stored encrypted at app layer)
  auth_port     INTEGER NOT NULL DEFAULT 1812,
  acct_port     INTEGER NOT NULL DEFAULT 1813,
  coa_port      INTEGER NOT NULL DEFAULT 3799,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  last_seen     TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_nas_devices_tenant ON public.nas_devices(tenant_id);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.nas_devices TO authenticated;
GRANT ALL ON public.nas_devices TO service_role;
ALTER TABLE public.nas_devices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nas_devices_tenant" ON public.nas_devices
  TO authenticated USING (tenant_id = public.my_tenant_id()) WITH CHECK (tenant_id = public.my_tenant_id());

-- ============================================================
-- AAA — RADIUS SERVERS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.radius_servers (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  host          TEXT NOT NULL,
  auth_port     INTEGER NOT NULL DEFAULT 1812,
  acct_port     INTEGER NOT NULL DEFAULT 1813,
  shared_secret TEXT NOT NULL,
  protocol      public.radius_protocol NOT NULL DEFAULT 'mschapv2',
  is_primary    BOOLEAN NOT NULL DEFAULT true,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  timeout_ms    INTEGER NOT NULL DEFAULT 3000,
  retry_count   INTEGER NOT NULL DEFAULT 3,
  priority      INTEGER NOT NULL DEFAULT 1,   -- lower = higher priority
  last_checked  TIMESTAMPTZ,
  is_healthy    BOOLEAN,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_radius_servers_tenant ON public.radius_servers(tenant_id);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.radius_servers TO authenticated;
GRANT ALL ON public.radius_servers TO service_role;
ALTER TABLE public.radius_servers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "radius_servers_tenant" ON public.radius_servers
  TO authenticated USING (tenant_id = public.my_tenant_id()) WITH CHECK (tenant_id = public.my_tenant_id());

-- ============================================================
-- AAA — RADIUS ACCOUNTING RECORDS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.radius_accounting (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  nas_id            UUID REFERENCES public.nas_devices(id) ON DELETE SET NULL,
  session_id        TEXT,                   -- Acct-Session-Id
  nas_identifier    TEXT,
  username          TEXT NOT NULL,
  framed_ip         TEXT,                   -- Framed-IP-Address
  calling_station   TEXT,                   -- MAC / phone number
  called_station    TEXT,
  acct_status_type  TEXT NOT NULL,          -- Start/Stop/Interim-Update
  acct_input_octets BIGINT DEFAULT 0,
  acct_output_octets BIGINT DEFAULT 0,
  acct_session_time INTEGER DEFAULT 0,
  acct_input_packets BIGINT DEFAULT 0,
  acct_output_packets BIGINT DEFAULT 0,
  acct_terminate_cause TEXT,
  service_type      TEXT,
  nas_port_type     TEXT,
  raw_attrs         JSONB DEFAULT '{}',
  received_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_radius_acct_tenant ON public.radius_accounting(tenant_id, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_radius_acct_username ON public.radius_accounting(username, tenant_id);
CREATE INDEX IF NOT EXISTS idx_radius_acct_session ON public.radius_accounting(session_id) WHERE session_id IS NOT NULL;
GRANT INSERT,SELECT ON public.radius_accounting TO authenticated;
GRANT ALL ON public.radius_accounting TO service_role;
ALTER TABLE public.radius_accounting ENABLE ROW LEVEL SECURITY;
CREATE POLICY "radius_accounting_tenant" ON public.radius_accounting
  FOR SELECT TO authenticated USING (tenant_id = public.my_tenant_id());

-- ============================================================
-- AAA — DYNAMIC RADIUS PROFILES (bandwidth/VLAN assignment)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.radius_profiles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  package_id      UUID REFERENCES public.packages(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  rate_limit      TEXT,          -- MikroTik format: "2M/1M" down/up
  speed_down_kbps INTEGER,
  speed_up_kbps   INTEGER,
  burst_down_kbps INTEGER,
  burst_up_kbps   INTEGER,
  burst_threshold_kbps INTEGER,
  burst_time_sec  INTEGER,
  vlan_id         INTEGER,
  ip_pool         TEXT,
  session_timeout INTEGER,       -- seconds
  idle_timeout    INTEGER,       -- seconds
  attributes      JSONB DEFAULT '{}',  -- additional VSAs
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_radius_profiles_tenant ON public.radius_profiles(tenant_id);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.radius_profiles TO authenticated;
GRANT ALL ON public.radius_profiles TO service_role;
ALTER TABLE public.radius_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "radius_profiles_tenant" ON public.radius_profiles
  TO authenticated USING (tenant_id = public.my_tenant_id()) WITH CHECK (tenant_id = public.my_tenant_id());

-- ============================================================
-- HIGH AVAILABILITY — SERVICE HEALTH CHECKS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.health_checks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  service_name TEXT NOT NULL,
  service_type TEXT NOT NULL,  -- database|router|radius|payment|sms|api
  status       public.health_status NOT NULL DEFAULT 'unknown',
  latency_ms   INTEGER,
  error        TEXT,
  metadata     JSONB DEFAULT '{}',
  checked_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_health_checks_service ON public.health_checks(service_name, checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_health_checks_tenant ON public.health_checks(tenant_id, checked_at DESC);
GRANT INSERT,SELECT ON public.health_checks TO authenticated;
GRANT ALL ON public.health_checks TO service_role;
ALTER TABLE public.health_checks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "health_checks_tenant" ON public.health_checks
  FOR SELECT TO authenticated USING (tenant_id = public.my_tenant_id() OR tenant_id IS NULL);

-- ============================================================
-- HIGH AVAILABILITY — CIRCUIT BREAKER STATE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.circuit_breakers (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  service_name  TEXT NOT NULL,
  state         TEXT NOT NULL DEFAULT 'closed' CHECK (state IN ('closed','open','half-open')),
  failure_count INTEGER NOT NULL DEFAULT 0,
  success_count INTEGER NOT NULL DEFAULT 0,
  last_failure  TIMESTAMPTZ,
  open_until    TIMESTAMPTZ,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, service_name)
);
GRANT SELECT,INSERT,UPDATE ON public.circuit_breakers TO authenticated;
GRANT ALL ON public.circuit_breakers TO service_role;
ALTER TABLE public.circuit_breakers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "circuit_breakers_tenant" ON public.circuit_breakers
  TO authenticated USING (tenant_id = public.my_tenant_id() OR tenant_id IS NULL);

-- ============================================================
-- HIGH AVAILABILITY — NOC INCIDENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.noc_incidents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  description     TEXT,
  severity        public.incident_severity NOT NULL DEFAULT 'p3',
  status          TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','investigating','resolved','closed')),
  affected_service TEXT,
  affected_routers UUID[],
  root_cause      TEXT,
  resolution      TEXT,
  sla_target_mins INTEGER NOT NULL DEFAULT 60,
  acknowledged_at TIMESTAMPTZ,
  resolved_at     TIMESTAMPTZ,
  closed_at       TIMESTAMPTZ,
  created_by      UUID REFERENCES auth.users(id),
  assigned_to     UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_noc_incidents_tenant ON public.noc_incidents(tenant_id, status);
GRANT SELECT,INSERT,UPDATE ON public.noc_incidents TO authenticated;
GRANT ALL ON public.noc_incidents TO service_role;
ALTER TABLE public.noc_incidents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "noc_incidents_tenant" ON public.noc_incidents
  TO authenticated USING (tenant_id = public.my_tenant_id()) WITH CHECK (tenant_id = public.my_tenant_id());

-- ============================================================
-- BACKUP — BACKUP JOBS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.backup_jobs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  type          public.backup_type NOT NULL DEFAULT 'full',
  target        TEXT NOT NULL,  -- database|router_config|customer_docs|settings|audit_logs
  target_id     UUID,           -- e.g. router_id for router config backups
  status        public.backup_status NOT NULL DEFAULT 'pending',
  file_url      TEXT,
  file_name     TEXT,
  size_bytes    BIGINT,
  checksum      TEXT,
  storage_path  TEXT,
  error         TEXT,
  retention_days INTEGER NOT NULL DEFAULT 30,
  expires_at    TIMESTAMPTZ,
  started_at    TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ,
  triggered_by  TEXT NOT NULL DEFAULT 'manual' CHECK (triggered_by IN ('manual','scheduled','api')),
  created_by    UUID REFERENCES auth.users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_backup_jobs_tenant ON public.backup_jobs(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_backup_jobs_status ON public.backup_jobs(status) WHERE status IN ('pending','running');
GRANT SELECT,INSERT,UPDATE ON public.backup_jobs TO authenticated;
GRANT ALL ON public.backup_jobs TO service_role;
ALTER TABLE public.backup_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "backup_jobs_tenant" ON public.backup_jobs
  TO authenticated USING (tenant_id = public.my_tenant_id()) WITH CHECK (tenant_id = public.my_tenant_id());

-- ============================================================
-- BACKUP — BACKUP SCHEDULES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.backup_schedules (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  target         TEXT NOT NULL,
  type           public.backup_type NOT NULL DEFAULT 'full',
  cron_expr      TEXT NOT NULL DEFAULT '0 2 * * *',  -- 2am daily
  is_active      BOOLEAN NOT NULL DEFAULT true,
  retention_days INTEGER NOT NULL DEFAULT 30,
  last_run       TIMESTAMPTZ,
  next_run       TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.backup_schedules TO authenticated;
GRANT ALL ON public.backup_schedules TO service_role;
ALTER TABLE public.backup_schedules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "backup_schedules_tenant" ON public.backup_schedules
  TO authenticated USING (tenant_id = public.my_tenant_id()) WITH CHECK (tenant_id = public.my_tenant_id());

-- ============================================================
-- OBSERVABILITY — APPLICATION LOGS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.app_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  level       TEXT NOT NULL DEFAULT 'info' CHECK (level IN ('debug','info','warn','error','critical')),
  category    TEXT NOT NULL,   -- auth|billing|provisioning|router|sms|payment|security|automation
  message     TEXT NOT NULL,
  context     JSONB DEFAULT '{}',
  user_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  request_id  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_app_logs_tenant ON public.app_logs(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_app_logs_level ON public.app_logs(level, created_at DESC) WHERE level IN ('error','critical');
GRANT INSERT,SELECT ON public.app_logs TO authenticated;
GRANT ALL ON public.app_logs TO service_role;
ALTER TABLE public.app_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_logs_tenant" ON public.app_logs
  FOR SELECT TO authenticated USING (tenant_id = public.my_tenant_id() OR tenant_id IS NULL);

-- ============================================================
-- OBSERVABILITY — METRICS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.metrics (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  value      DOUBLE PRECISION NOT NULL,
  labels     JSONB DEFAULT '{}',
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_metrics_tenant_name ON public.metrics(tenant_id, name, recorded_at DESC);
GRANT INSERT,SELECT ON public.metrics TO authenticated;
GRANT ALL ON public.metrics TO service_role;
ALTER TABLE public.metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "metrics_tenant" ON public.metrics
  FOR SELECT TO authenticated USING (tenant_id = public.my_tenant_id() OR tenant_id IS NULL);

-- ============================================================
-- WHITE-LABEL — TENANT BRANDING
-- ============================================================
CREATE TABLE IF NOT EXISTS public.tenant_branding (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE UNIQUE,
  logo_url            TEXT,
  favicon_url         TEXT,
  primary_color       TEXT DEFAULT '#3B82F6',
  secondary_color     TEXT DEFAULT '#1E293B',
  accent_color        TEXT DEFAULT '#06B6D4',
  custom_domain       TEXT UNIQUE,
  domain_verified     BOOLEAN DEFAULT false,
  invoice_header      TEXT,
  invoice_footer      TEXT,
  sms_sender_id       TEXT,
  email_from_name     TEXT,
  email_from_address  TEXT,
  welcome_message     TEXT,
  portal_tagline      TEXT,
  support_phone       TEXT,
  support_email       TEXT,
  social_links        JSONB DEFAULT '{}',
  css_overrides       TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT,INSERT,UPDATE ON public.tenant_branding TO authenticated;
GRANT ALL ON public.tenant_branding TO service_role;
ALTER TABLE public.tenant_branding ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_branding_tenant" ON public.tenant_branding
  TO authenticated USING (tenant_id = public.my_tenant_id()) WITH CHECK (tenant_id = public.my_tenant_id());

-- ============================================================
-- COMPLIANCE — CONSENT RECORDS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.consent_records (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  customer_id   UUID REFERENCES public.customers(id) ON DELETE CASCADE,
  user_id       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  consent_type  TEXT NOT NULL,  -- terms|privacy|marketing|data_processing
  version       TEXT NOT NULL,
  accepted      BOOLEAN NOT NULL,
  ip_address    TEXT,
  user_agent    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_consent_customer ON public.consent_records(customer_id, consent_type);
GRANT SELECT,INSERT ON public.consent_records TO authenticated;
GRANT ALL ON public.consent_records TO service_role;
ALTER TABLE public.consent_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "consent_records_tenant" ON public.consent_records
  TO authenticated USING (tenant_id = public.my_tenant_id()) WITH CHECK (tenant_id = public.my_tenant_id());

-- ============================================================
-- COMPLIANCE — DATA RETENTION POLICIES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.retention_policies (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  table_name        TEXT NOT NULL,
  retention_days    INTEGER NOT NULL DEFAULT 365,
  delete_strategy   TEXT NOT NULL DEFAULT 'soft' CHECK (delete_strategy IN ('soft','hard','archive')),
  last_purge        TIMESTAMPTZ,
  is_active         BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, table_name)
);
GRANT SELECT,INSERT,UPDATE ON public.retention_policies TO authenticated;
GRANT ALL ON public.retention_policies TO service_role;
ALTER TABLE public.retention_policies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "retention_policies_tenant" ON public.retention_policies
  TO authenticated USING (tenant_id = public.my_tenant_id()) WITH CHECK (tenant_id = public.my_tenant_id());

-- ============================================================
-- PROVISIONING — WORKFLOW STATE MACHINE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.provisioning_workflows (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  type            TEXT NOT NULL,  -- payment_success|payment_failure|subscription_expiry|renewal
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','running','completed','failed','rolled_back')),
  payload         JSONB NOT NULL DEFAULT '{}',
  steps           JSONB NOT NULL DEFAULT '[]',  -- [{step,status,completed_at,error}]
  current_step    INTEGER NOT NULL DEFAULT 0,
  idempotency_key TEXT UNIQUE,
  error           TEXT,
  retry_count     INTEGER NOT NULL DEFAULT 0,
  max_retries     INTEGER NOT NULL DEFAULT 3,
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_prov_workflows_tenant ON public.provisioning_workflows(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_prov_workflows_key ON public.provisioning_workflows(idempotency_key) WHERE idempotency_key IS NOT NULL;
GRANT SELECT,INSERT,UPDATE ON public.provisioning_workflows TO authenticated;
GRANT ALL ON public.provisioning_workflows TO service_role;
ALTER TABLE public.provisioning_workflows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "prov_workflows_tenant" ON public.provisioning_workflows
  TO authenticated USING (tenant_id = public.my_tenant_id()) WITH CHECK (tenant_id = public.my_tenant_id());

-- ============================================================
-- CUSTOMER SELF-SERVICE — USAGE ANALYTICS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.usage_snapshots (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  customer_id     UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  date            DATE NOT NULL DEFAULT CURRENT_DATE,
  bytes_in        BIGINT NOT NULL DEFAULT 0,
  bytes_out       BIGINT NOT NULL DEFAULT 0,
  session_count   INTEGER NOT NULL DEFAULT 0,
  peak_hour       INTEGER,           -- 0-23
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(customer_id, date)
);
CREATE INDEX IF NOT EXISTS idx_usage_snapshots_customer ON public.usage_snapshots(customer_id, date DESC);
GRANT SELECT,INSERT,UPDATE ON public.usage_snapshots TO authenticated;
GRANT ALL ON public.usage_snapshots TO service_role;
ALTER TABLE public.usage_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "usage_snapshots_tenant" ON public.usage_snapshots
  TO authenticated USING (tenant_id = public.my_tenant_id()) WITH CHECK (tenant_id = public.my_tenant_id());

-- ============================================================
-- NETWORK ABSTRACTION — ROUTER ADAPTERS CONFIG
-- ============================================================
ALTER TABLE public.routers
  ADD COLUMN IF NOT EXISTS adapter       TEXT NOT NULL DEFAULT 'mikrotik_rest'
    CHECK (adapter IN ('mikrotik_rest','mikrotik_api','freeradius','radius_proxy','generic_snmp')),
  ADD COLUMN IF NOT EXISTS ipv6_address  TEXT,
  ADD COLUMN IF NOT EXISTS wan_ip        TEXT,
  ADD COLUMN IF NOT EXISTS nas_ip        TEXT,
  ADD COLUMN IF NOT EXISTS vlan_support  BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS cgnat_enabled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS tags          TEXT[] DEFAULT '{}';

-- ============================================================
-- UPDATED_AT TRIGGERS for new tables
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DO $$ DECLARE tbl TEXT; BEGIN
  FOR tbl IN SELECT unnest(ARRAY[
    'nas_devices','radius_servers','radius_profiles',
    'noc_incidents','tenant_branding','provisioning_workflows'
  ]) LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_updated_at ON public.%s', tbl, tbl);
    EXECUTE format(
      'CREATE TRIGGER trg_%s_updated_at BEFORE UPDATE ON public.%s
       FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at()', tbl, tbl);
  END LOOP;
END $$;

-- ============================================================
-- JOB QUEUE — Extend existing with more types + DLQ column
-- ============================================================
ALTER TABLE public.job_queue
  ADD COLUMN IF NOT EXISTS dead_letter BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS queue_name TEXT NOT NULL DEFAULT 'default';

CREATE UNIQUE INDEX IF NOT EXISTS job_queue_idempotency
  ON public.job_queue(tenant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL AND status NOT IN ('completed','failed');

CREATE INDEX IF NOT EXISTS idx_job_queue_dlq ON public.job_queue(tenant_id) WHERE dead_letter = true;
CREATE INDEX IF NOT EXISTS idx_job_queue_queue ON public.job_queue(queue_name, status, run_at);

-- ============================================================
-- PERFORMANCE INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_radius_acct_tenant_date
  ON public.radius_accounting(tenant_id, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_app_logs_category
  ON public.app_logs(tenant_id, category, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_metrics_name_date
  ON public.metrics(name, recorded_at DESC);

-- ============================================================
-- HELPER FUNCTION — Aggregate daily usage from sessions
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_aggregate_daily_usage(_tenant_id UUID, _date DATE DEFAULT CURRENT_DATE)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.usage_snapshots (tenant_id, customer_id, subscription_id, date, bytes_in, bytes_out, session_count)
  SELECT
    s.tenant_id,
    s.customer_id,
    s.subscription_id,
    _date,
    COALESCE(SUM(s.bytes_in),0),
    COALESCE(SUM(s.bytes_out),0),
    COUNT(*)
  FROM public.sessions s
  WHERE s.tenant_id = _tenant_id
    AND s.customer_id IS NOT NULL
    AND s.started_at::date = _date
  GROUP BY s.tenant_id, s.customer_id, s.subscription_id
  ON CONFLICT (customer_id, date) DO UPDATE SET
    bytes_in      = EXCLUDED.bytes_in,
    bytes_out     = EXCLUDED.bytes_out,
    session_count = EXCLUDED.session_count;
END; $$;
GRANT EXECUTE ON FUNCTION public.fn_aggregate_daily_usage(UUID, DATE) TO authenticated;

-- ============================================================
-- VIEW — Active NAS Devices with router info
-- ============================================================
CREATE OR REPLACE VIEW public.vw_active_nas AS
  SELECT n.*, r.name AS router_name, r.ip_address AS router_ip, r.status AS router_status
  FROM public.nas_devices n
  LEFT JOIN public.routers r ON r.id = n.router_id
  WHERE n.is_active = true;

-- ============================================================
-- VIEW — Job Queue Summary
-- ============================================================
CREATE OR REPLACE VIEW public.vw_queue_summary AS
  SELECT
    tenant_id,
    queue_name,
    type,
    status,
    COUNT(*)         AS count,
    MIN(run_at)      AS oldest_job,
    MAX(created_at)  AS newest_job
  FROM public.job_queue
  GROUP BY tenant_id, queue_name, type, status;

-- ============================================================
-- Seed default retention policies (runs idempotently)
-- ============================================================
INSERT INTO public.retention_policies (tenant_id, table_name, retention_days, delete_strategy)
SELECT t.id, tbl, days, strat
FROM public.tenants t
CROSS JOIN (VALUES
  ('app_logs',          90,  'hard'),
  ('metrics',           30,  'hard'),
  ('radius_accounting', 365, 'hard'),
  ('audit_logs',        730, 'archive'),
  ('sessions',          180, 'hard'),
  ('sms_logs',          90,  'hard')
) AS policies(tbl, days, strat)
ON CONFLICT (tenant_id, table_name) DO NOTHING;
