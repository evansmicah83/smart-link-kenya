-- ============================================================
-- SmartLinkNet Phase 2: AAA & RADIUS Platform Migration
-- Centralized Auth, Authz, Accounting, NAS Management,
-- RADIUS Client Mgmt, Dynamic Assignment, Failover,
-- Multi-Server, Accounting Redundancy, Health Monitoring
-- ============================================================

-- ============================================================
-- 1. RADIUS SERVERS — Enhanced with failover + health columns
-- ============================================================
ALTER TABLE public.radius_servers
  ADD COLUMN IF NOT EXISTS coa_port            INTEGER NOT NULL DEFAULT 3799,
  ADD COLUMN IF NOT EXISTS role                TEXT NOT NULL DEFAULT 'primary'
    CHECK (role IN ('primary','secondary','tertiary','backup')),
  ADD COLUMN IF NOT EXISTS failover_strategy   TEXT NOT NULL DEFAULT 'priority'
    CHECK (failover_strategy IN ('priority','round_robin','least_latency','random')),
  ADD COLUMN IF NOT EXISTS consecutive_failures INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_failure_reason TEXT,
  ADD COLUMN IF NOT EXISTS latency_ms          INTEGER,
  ADD COLUMN IF NOT EXISTS updated_at          TIMESTAMPTZ NOT NULL DEFAULT now();

-- Trigger
DO $$ BEGIN
  DROP TRIGGER IF EXISTS trg_radius_servers_updated_at ON public.radius_servers;
  CREATE TRIGGER trg_radius_servers_updated_at BEFORE UPDATE ON public.radius_servers
    FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();
END $$;

-- ============================================================
-- 2. NAS DEVICES — Enhanced with dynamic assignment config
-- ============================================================
ALTER TABLE public.nas_devices
  ADD COLUMN IF NOT EXISTS radius_server_id        UUID REFERENCES public.radius_servers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS dynamic_vlan_enabled    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS dynamic_profile_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS dynamic_ip_enabled      BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS updated_at              TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_nas_devices_nas_identifier
  ON public.nas_devices(nas_identifier) WHERE nas_identifier IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_nas_devices_nas_ip
  ON public.nas_devices(nas_ip) WHERE nas_ip IS NOT NULL;

DO $$ BEGIN
  DROP TRIGGER IF EXISTS trg_nas_devices_updated_at ON public.nas_devices;
  CREATE TRIGGER trg_nas_devices_updated_at BEFORE UPDATE ON public.nas_devices
    FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();
END $$;

-- ============================================================
-- 3. RADIUS PROFILES — Enhanced with VLAN name + simultaneous_use
-- ============================================================
ALTER TABLE public.radius_profiles
  ADD COLUMN IF NOT EXISTS vlan_name        TEXT,
  ADD COLUMN IF NOT EXISTS ip_pool_ref      UUID REFERENCES public.ip_pools(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS simultaneous_use INTEGER,
  ADD COLUMN IF NOT EXISTS updated_at       TIMESTAMPTZ NOT NULL DEFAULT now();

DO $$ BEGIN
  DROP TRIGGER IF EXISTS trg_radius_profiles_updated_at ON public.radius_profiles;
  CREATE TRIGGER trg_radius_profiles_updated_at BEFORE UPDATE ON public.radius_profiles
    FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();
END $$;

-- ============================================================
-- 4. RADIUS ACCOUNTING — Redundancy columns
-- ============================================================
ALTER TABLE public.radius_accounting
  ADD COLUMN IF NOT EXISTS received_by_server UUID REFERENCES public.radius_servers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_replicated      BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS replica_targets    UUID[]  NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_radius_acct_replication
  ON public.radius_accounting(is_replicated, received_at DESC)
  WHERE is_replicated = false;

-- ============================================================
-- 5. SESSION ACCOUNTING — Enhanced session table
-- ============================================================
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS duration_seconds INTEGER,
  ADD COLUMN IF NOT EXISTS subscription_id  UUID REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS last_connected   TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_sessions_subscription
  ON public.sessions(subscription_id) WHERE subscription_id IS NOT NULL;

-- ============================================================
-- 6. RADIUS HEALTH CHECKS — Time-series health snapshots
-- ============================================================
CREATE TABLE IF NOT EXISTS public.radius_health_checks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  server_id   UUID REFERENCES public.radius_servers(id) ON DELETE CASCADE,
  is_healthy  BOOLEAN NOT NULL,
  latency_ms  INTEGER,
  status      TEXT NOT NULL DEFAULT 'unknown'
    CHECK (status IN ('healthy','degraded','unhealthy','unknown')),
  error       TEXT,
  checked_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_radius_health_server
  ON public.radius_health_checks(server_id, checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_radius_health_tenant
  ON public.radius_health_checks(tenant_id, checked_at DESC);
GRANT INSERT,SELECT ON public.radius_health_checks TO authenticated;
GRANT ALL ON public.radius_health_checks TO service_role;
ALTER TABLE public.radius_health_checks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "radius_health_tenant" ON public.radius_health_checks
  FOR SELECT TO authenticated USING (tenant_id = public.my_tenant_id() OR tenant_id IS NULL);

-- ============================================================
-- 7. AUTH EVENTS — Add nas_id FK (was TEXT before)
-- ============================================================
ALTER TABLE public.auth_events
  ADD COLUMN IF NOT EXISTS nas_id UUID REFERENCES public.nas_devices(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS radius_server_id UUID REFERENCES public.radius_servers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS subscription_id  UUID REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS latency_ms       INTEGER;

CREATE INDEX IF NOT EXISTS idx_auth_events_nas ON public.auth_events(nas_id) WHERE nas_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_auth_events_sub ON public.auth_events(subscription_id) WHERE subscription_id IS NOT NULL;

-- ============================================================
-- 8. RADIUS CLIENT REGISTRATIONS (external RADIUS clients)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.radius_clients (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  description   TEXT,
  -- client_ip stored in DB, never hardcoded in business logic
  client_ip     TEXT NOT NULL,
  shared_secret TEXT NOT NULL,
  vendor        TEXT NOT NULL DEFAULT 'generic'
    CHECK (vendor IN ('mikrotik','cisco','ubiquiti','freeradius','juniper','huawei','generic')),
  is_active     BOOLEAN NOT NULL DEFAULT true,
  last_seen     TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, client_ip)
);
CREATE INDEX IF NOT EXISTS idx_radius_clients_tenant ON public.radius_clients(tenant_id, is_active);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.radius_clients TO authenticated;
GRANT ALL ON public.radius_clients TO service_role;
ALTER TABLE public.radius_clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "radius_clients_tenant" ON public.radius_clients
  TO authenticated
  USING  (tenant_id = public.my_tenant_id())
  WITH CHECK (tenant_id = public.my_tenant_id());
DO $$ BEGIN
  DROP TRIGGER IF EXISTS trg_radius_clients_updated_at ON public.radius_clients;
  CREATE TRIGGER trg_radius_clients_updated_at BEFORE UPDATE ON public.radius_clients
    FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();
END $$;

-- ============================================================
-- 9. ACCOUNTING REPLICA TARGETS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.accounting_replica_targets (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  server_id         UUID NOT NULL REFERENCES public.radius_servers(id) ON DELETE CASCADE,
  -- endpoint is resolved from DB, not hardcoded
  endpoint          TEXT NOT NULL,
  is_active         BOOLEAN NOT NULL DEFAULT true,
  last_replicated_at TIMESTAMPTZ,
  pending_count     INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, server_id)
);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.accounting_replica_targets TO authenticated;
GRANT ALL ON public.accounting_replica_targets TO service_role;
ALTER TABLE public.accounting_replica_targets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "acct_replica_tenant" ON public.accounting_replica_targets
  TO authenticated
  USING  (tenant_id = public.my_tenant_id())
  WITH CHECK (tenant_id = public.my_tenant_id());

-- ============================================================
-- 10. DYNAMIC VLAN ASSIGNMENTS (audit trail)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.vlan_assignments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id)        ON DELETE CASCADE,
  session_id      UUID          REFERENCES public.sessions(id)       ON DELETE SET NULL,
  subscription_id UUID          REFERENCES public.subscriptions(id)  ON DELETE SET NULL,
  nas_id          UUID          REFERENCES public.nas_devices(id)    ON DELETE SET NULL,
  vlan_id         INTEGER NOT NULL,
  vlan_name       TEXT,
  assigned_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  released_at     TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_vlan_assignments_tenant ON public.vlan_assignments(tenant_id, assigned_at DESC);
CREATE INDEX IF NOT EXISTS idx_vlan_assignments_session ON public.vlan_assignments(session_id);
GRANT SELECT,INSERT,UPDATE ON public.vlan_assignments TO authenticated;
GRANT ALL ON public.vlan_assignments TO service_role;
ALTER TABLE public.vlan_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vlan_assignments_tenant" ON public.vlan_assignments
  FOR SELECT TO authenticated USING (tenant_id = public.my_tenant_id());

-- ============================================================
-- 11. VIEWS
-- ============================================================

-- RADIUS server pool status
CREATE OR REPLACE VIEW public.vw_radius_pool_status AS
  SELECT
    rs.id,
    rs.tenant_id,
    rs.name,
    rs.host,
    rs.role,
    rs.priority,
    rs.failover_strategy,
    rs.is_primary,
    rs.is_active,
    rs.is_healthy,
    rs.latency_ms,
    rs.consecutive_failures,
    rs.last_checked,
    rs.last_failure_reason,
    CASE
      WHEN rs.is_healthy IS NULL       THEN 'unknown'
      WHEN rs.is_healthy = true AND rs.consecutive_failures = 0 THEN 'healthy'
      WHEN rs.is_healthy = true        THEN 'degraded'
      ELSE 'unhealthy'
    END AS health_status,
    COALESCE(
      (SELECT COUNT(*) FROM public.auth_events ae
       WHERE ae.radius_server_id = rs.id
         AND ae.received_at > now() - interval '1 hour'), 0
    ) AS auth_requests_1h
  FROM public.radius_servers rs;

-- NAS device health summary
CREATE OR REPLACE VIEW public.vw_nas_health AS
  SELECT
    n.id,
    n.tenant_id,
    n.name,
    n.vendor,
    n.is_active,
    n.last_seen,
    n.dynamic_vlan_enabled,
    n.dynamic_profile_enabled,
    r.name AS router_name,
    r.status AS router_status,
    COALESCE(
      (SELECT COUNT(*) FROM public.sessions s
       WHERE s.tenant_id = n.tenant_id AND s.ended_at IS NULL), 0
    ) AS active_sessions,
    COALESCE(
      (SELECT COUNT(*) FROM public.auth_events ae
       WHERE ae.nas_id = n.id
         AND ae.event_type = 'auth_success'
         AND ae.received_at > now() - interval '1 hour'), 0
    ) AS auth_success_1h,
    COALESCE(
      (SELECT COUNT(*) FROM public.auth_events ae
       WHERE ae.nas_id = n.id
         AND ae.event_type IN ('auth_failure','auth_reject')
         AND ae.received_at > now() - interval '1 hour'), 0
    ) AS auth_failure_1h
  FROM public.nas_devices n
  LEFT JOIN public.routers r ON r.id = n.router_id;

-- Accounting summary by NAS (last 24h)
CREATE OR REPLACE VIEW public.vw_accounting_summary AS
  SELECT
    ra.tenant_id,
    n.name AS nas_name,
    ra.acct_status_type,
    COUNT(*)                  AS record_count,
    SUM(ra.acct_input_octets)  AS total_bytes_in,
    SUM(ra.acct_output_octets) AS total_bytes_out,
    MAX(ra.received_at)        AS latest
  FROM public.radius_accounting ra
  LEFT JOIN public.nas_devices n ON n.id = ra.nas_id
  WHERE ra.received_at > now() - interval '24 hours'
  GROUP BY ra.tenant_id, n.name, ra.acct_status_type;

-- Auth events summary
CREATE OR REPLACE VIEW public.vw_auth_summary AS
  SELECT
    tenant_id,
    event_type,
    DATE_TRUNC('hour', received_at) AS hour,
    COUNT(*) AS count
  FROM public.auth_events
  WHERE received_at > now() - interval '24 hours'
  GROUP BY tenant_id, event_type, DATE_TRUNC('hour', received_at);

-- ============================================================
-- 12. FUNCTIONS
-- ============================================================

-- Select best RADIUS server using priority failover
CREATE OR REPLACE FUNCTION public.fn_select_radius_server(_tenant_id UUID)
RETURNS TABLE(server_id UUID, host TEXT, auth_port INTEGER, shared_secret TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id, host, auth_port, shared_secret
  FROM public.radius_servers
  WHERE tenant_id = _tenant_id
    AND is_active = true
    AND (is_healthy IS NULL OR is_healthy = true)
  ORDER BY priority ASC, consecutive_failures ASC
  LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.fn_select_radius_server(UUID) TO authenticated;

-- Resolve NAS device from packet identifier
CREATE OR REPLACE FUNCTION public.fn_resolve_nas(
  _nas_identifier TEXT DEFAULT NULL,
  _nas_ip         TEXT DEFAULT NULL
) RETURNS TABLE(nas_id UUID, tenant_id UUID, shared_secret TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id, tenant_id, shared_secret
  FROM public.nas_devices
  WHERE is_active = true
    AND (
      (_nas_identifier IS NOT NULL AND nas_identifier = _nas_identifier)
      OR (_nas_ip IS NOT NULL AND nas_ip = _nas_ip)
    )
  LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.fn_resolve_nas(TEXT, TEXT) TO service_role;

-- AAA stats for a tenant (last N hours)
CREATE OR REPLACE FUNCTION public.fn_aaa_stats(_tenant_id UUID, _hours INTEGER DEFAULT 1)
RETURNS TABLE(
  auth_success BIGINT, auth_failure BIGINT, auth_reject BIGINT,
  acct_records BIGINT, active_sessions BIGINT, failure_rate_pct NUMERIC
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH ev AS (
    SELECT event_type FROM public.auth_events
    WHERE tenant_id = _tenant_id
      AND received_at > now() - make_interval(hours => _hours)
  ),
  totals AS (
    SELECT
      COUNT(*) FILTER (WHERE event_type = 'auth_success')              AS auth_success,
      COUNT(*) FILTER (WHERE event_type = 'auth_failure')              AS auth_failure,
      COUNT(*) FILTER (WHERE event_type = 'auth_reject')               AS auth_reject,
      COUNT(*)                                                          AS total
    FROM ev
  )
  SELECT
    t.auth_success,
    t.auth_failure,
    t.auth_reject,
    (SELECT COUNT(*) FROM public.radius_accounting
     WHERE tenant_id = _tenant_id AND received_at > now() - make_interval(hours => _hours)) AS acct_records,
    (SELECT COUNT(*) FROM public.sessions
     WHERE tenant_id = _tenant_id AND ended_at IS NULL)                AS active_sessions,
    CASE WHEN t.total > 0 THEN ROUND(((t.auth_failure + t.auth_reject)::NUMERIC / t.total) * 100, 1)
         ELSE 0 END                                                    AS failure_rate_pct
  FROM totals t;
$$;
GRANT EXECUTE ON FUNCTION public.fn_aaa_stats(UUID, INTEGER) TO authenticated;

-- ============================================================
-- 13. PERFORMANCE INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_auth_events_hour
  ON public.auth_events(tenant_id, received_at DESC, event_type);

CREATE INDEX IF NOT EXISTS idx_radius_accounting_status
  ON public.radius_accounting(tenant_id, acct_status_type, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_radius_health_latest
  ON public.radius_health_checks(server_id, checked_at DESC);

CREATE INDEX IF NOT EXISTS idx_radius_servers_priority
  ON public.radius_servers(tenant_id, priority, is_active)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_vlan_assignments_active
  ON public.vlan_assignments(session_id, released_at)
  WHERE released_at IS NULL;
