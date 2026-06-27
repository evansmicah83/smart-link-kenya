-- ============================================================
-- SmartLinkNet Phase 1: Network Foundation Migration
-- Router Abstraction Layer, Network Abstraction Layer,
-- Provider Abstraction Layer, Vendor Adapter Architecture
-- ============================================================
-- Rules enforced by this schema:
--   1. No business logic depends on specific IP addresses
--   2. No business logic depends on specific router models
--   3. No business logic depends on WAN providers
--   4. All infrastructure references are UUID-based
-- ============================================================

-- ============================================================
-- 1. ROUTER: Add adapter columns (non-destructive)
-- ============================================================
ALTER TABLE public.routers
  ADD COLUMN IF NOT EXISTS primary_adapter_type TEXT
    CHECK (primary_adapter_type IN (
      'mikrotik_rest','mikrotik_api','freeradius',
      'radius_proxy','ubiquiti','cisco','generic_snmp','openwrt'
    )),
  ADD COLUMN IF NOT EXISTS use_ssl              BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS vendor               TEXT    NOT NULL DEFAULT 'mikrotik',
  ADD COLUMN IF NOT EXISTS is_active            BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS firmware_version     TEXT,
  ADD COLUMN IF NOT EXISTS last_seen            TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cpu_load             INTEGER,
  ADD COLUMN IF NOT EXISTS memory_used          INTEGER,
  ADD COLUMN IF NOT EXISTS uptime               TEXT,
  ADD COLUMN IF NOT EXISTS tags                 TEXT[]  NOT NULL DEFAULT '{}';

-- ============================================================
-- 2. NETWORK ADAPTERS — per-router adapter registry
-- ============================================================
CREATE TABLE IF NOT EXISTS public.network_adapters (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id)  ON DELETE CASCADE,
  router_id       UUID NOT NULL REFERENCES public.routers(id)  ON DELETE CASCADE,
  adapter_type    TEXT NOT NULL CHECK (adapter_type IN (
    'mikrotik_rest','mikrotik_api','freeradius',
    'radius_proxy','ubiquiti','cisco','generic_snmp','openwrt'
  )),
  -- config stores adapter-specific settings (no raw IP literals in business logic)
  config          JSONB NOT NULL DEFAULT '{}',
  is_primary      BOOLEAN NOT NULL DEFAULT true,
  supported_features TEXT[] NOT NULL DEFAULT '{}',
  health_status   TEXT NOT NULL DEFAULT 'unknown'
    CHECK (health_status IN ('healthy','degraded','unhealthy','unknown')),
  last_checked    TIMESTAMPTZ,
  error_count     INTEGER NOT NULL DEFAULT 0,
  last_error      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (router_id, adapter_type)
);
CREATE INDEX IF NOT EXISTS idx_network_adapters_tenant   ON public.network_adapters(tenant_id);
CREATE INDEX IF NOT EXISTS idx_network_adapters_router   ON public.network_adapters(router_id);
CREATE INDEX IF NOT EXISTS idx_network_adapters_health   ON public.network_adapters(health_status);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.network_adapters TO authenticated;
GRANT ALL ON public.network_adapters TO service_role;
ALTER TABLE public.network_adapters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "network_adapters_tenant" ON public.network_adapters
  TO authenticated
  USING  (tenant_id = public.my_tenant_id())
  WITH CHECK (tenant_id = public.my_tenant_id());

-- ============================================================
-- 3. IP POOLS — UUID-referenced, no hardcoded CIDR in app code
-- ============================================================
CREATE TABLE IF NOT EXISTS public.ip_pools (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id)  ON DELETE CASCADE,
  router_id       UUID          REFERENCES public.routers(id)  ON DELETE SET NULL,
  name            TEXT NOT NULL,
  protocol        TEXT NOT NULL DEFAULT 'ipv4'
    CHECK (protocol IN ('ipv4','ipv6','dual_stack','cgnat')),
  -- CIDR stored in DB; never hardcoded in application layer
  cidr            TEXT NOT NULL,
  gateway         TEXT NOT NULL,
  dns             TEXT[] NOT NULL DEFAULT '{}',
  is_cgnat        BOOLEAN NOT NULL DEFAULT false,
  utilization     NUMERIC(5,2) NOT NULL DEFAULT 0,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);
CREATE INDEX IF NOT EXISTS idx_ip_pools_tenant   ON public.ip_pools(tenant_id, protocol);
CREATE INDEX IF NOT EXISTS idx_ip_pools_router   ON public.ip_pools(router_id);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.ip_pools TO authenticated;
GRANT ALL ON public.ip_pools TO service_role;
ALTER TABLE public.ip_pools ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ip_pools_tenant" ON public.ip_pools
  TO authenticated
  USING  (tenant_id = public.my_tenant_id())
  WITH CHECK (tenant_id = public.my_tenant_id());

-- ============================================================
-- 4. IP ASSIGNMENTS — dynamic, session-scoped, UUID-referenced
-- ============================================================
CREATE TABLE IF NOT EXISTS public.ip_assignments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id)    ON DELETE CASCADE,
  session_id      UUID          REFERENCES public.sessions(id)   ON DELETE SET NULL,
  pool_id         UUID          REFERENCES public.ip_pools(id)   ON DELETE SET NULL,
  -- Assigned address stored for logging/CGNAT compliance only
  assigned_address TEXT NOT NULL,
  prefix_length   INTEGER NOT NULL DEFAULT 32,
  protocol        TEXT NOT NULL DEFAULT 'ipv4'
    CHECK (protocol IN ('ipv4','ipv6','dual_stack','cgnat')),
  leased_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at      TIMESTAMPTZ,
  released_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ip_assignments_session ON public.ip_assignments(session_id);
CREATE INDEX IF NOT EXISTS idx_ip_assignments_pool    ON public.ip_assignments(pool_id, leased_at DESC);
CREATE INDEX IF NOT EXISTS idx_ip_assignments_tenant  ON public.ip_assignments(tenant_id, leased_at DESC);
GRANT SELECT,INSERT,UPDATE ON public.ip_assignments TO authenticated;
GRANT ALL ON public.ip_assignments TO service_role;
ALTER TABLE public.ip_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ip_assignments_tenant" ON public.ip_assignments
  FOR SELECT TO authenticated USING (tenant_id = public.my_tenant_id());

-- ============================================================
-- 5. CGNAT MAPPINGS — compliance logging (subscriber UUID, not IP)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.cgnat_mappings (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES public.tenants(id)   ON DELETE CASCADE,
  session_id       UUID          REFERENCES public.sessions(id)  ON DELETE SET NULL,
  private_address  TEXT NOT NULL,
  public_address   TEXT NOT NULL,
  port_range_start INTEGER NOT NULL,
  port_range_end   INTEGER NOT NULL,
  protocol         TEXT NOT NULL DEFAULT 'all'
    CHECK (protocol IN ('tcp','udp','icmp','all')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  released_at      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_cgnat_tenant   ON public.cgnat_mappings(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cgnat_session  ON public.cgnat_mappings(session_id);
-- Do NOT index by IP address — subscribers must be looked up by UUID
GRANT SELECT,INSERT,UPDATE ON public.cgnat_mappings TO authenticated;
GRANT ALL ON public.cgnat_mappings TO service_role;
ALTER TABLE public.cgnat_mappings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cgnat_mappings_tenant" ON public.cgnat_mappings
  FOR SELECT TO authenticated USING (tenant_id = public.my_tenant_id());

-- ============================================================
-- 6. WAN LINKS — Multi-WAN, provider-agnostic
-- ============================================================
CREATE TABLE IF NOT EXISTS public.wan_links (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id)  ON DELETE CASCADE,
  router_id       UUID NOT NULL REFERENCES public.routers(id)  ON DELETE CASCADE,
  name            TEXT NOT NULL,
  -- interface_name is read from NAS at runtime, not hardcoded
  interface_name  TEXT NOT NULL,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  priority        INTEGER NOT NULL DEFAULT 1,
  weight_percent  NUMERIC(5,2) NOT NULL DEFAULT 100,
  latency_ms      INTEGER,
  packet_loss     NUMERIC(5,2),
  bandwidth_mbps  NUMERIC(10,2),
  -- provider field is informational only — no business logic depends on it
  provider        TEXT,
  last_checked    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (router_id, interface_name)
);
CREATE INDEX IF NOT EXISTS idx_wan_links_router  ON public.wan_links(router_id, priority);
CREATE INDEX IF NOT EXISTS idx_wan_links_tenant  ON public.wan_links(tenant_id);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.wan_links TO authenticated;
GRANT ALL ON public.wan_links TO service_role;
ALTER TABLE public.wan_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wan_links_tenant" ON public.wan_links
  TO authenticated
  USING  (tenant_id = public.my_tenant_id())
  WITH CHECK (tenant_id = public.my_tenant_id());

-- ============================================================
-- 7. RADIUS USERS — FreeRADIUS subscriber table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.radius_users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id)      ON DELETE CASCADE,
  router_id       UUID          REFERENCES public.routers(id)      ON DELETE SET NULL,
  subscription_id UUID          REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  username        TEXT NOT NULL,
  -- password stored here for RADIUS PAP/CHAP — encrypted at rest via Vault in prod
  password        TEXT NOT NULL,
  profile         TEXT,
  rate_limit      TEXT,
  pool_name       TEXT,
  vlan_id         INTEGER,
  session_timeout INTEGER,
  idle_timeout    INTEGER,
  service_type    TEXT NOT NULL DEFAULT 'hotspot'
    CHECK (service_type IN ('hotspot','pppoe','dhcp','fiber','wimax','lte','static')),
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, username)
);
CREATE INDEX IF NOT EXISTS idx_radius_users_tenant   ON public.radius_users(tenant_id, is_active);
CREATE INDEX IF NOT EXISTS idx_radius_users_username ON public.radius_users(username);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.radius_users TO authenticated;
GRANT ALL ON public.radius_users TO service_role;
ALTER TABLE public.radius_users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "radius_users_tenant" ON public.radius_users
  TO authenticated
  USING  (tenant_id = public.my_tenant_id())
  WITH CHECK (tenant_id = public.my_tenant_id());

-- ============================================================
-- 8. PROVISIONING EVENTS — audit trail for adapter operations
-- ============================================================
CREATE TABLE IF NOT EXISTS public.provisioning_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id)        ON DELETE CASCADE,
  subscription_id UUID          REFERENCES public.subscriptions(id)  ON DELETE SET NULL,
  router_id       UUID          REFERENCES public.routers(id)        ON DELETE SET NULL,
  event           TEXT NOT NULL CHECK (event IN (
    'provisioned','suspended','reactivated','terminated',
    'bandwidth_updated','kicked','synced','failed'
  )),
  username        TEXT,
  service_type    TEXT,
  adapter_type    TEXT,
  error           TEXT,
  duration_ms     INTEGER,
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_prov_events_tenant  ON public.provisioning_events(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_prov_events_sub     ON public.provisioning_events(subscription_id);
CREATE INDEX IF NOT EXISTS idx_prov_events_router  ON public.provisioning_events(router_id);
GRANT SELECT,INSERT ON public.provisioning_events TO authenticated;
GRANT ALL ON public.provisioning_events TO service_role;
ALTER TABLE public.provisioning_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "prov_events_tenant" ON public.provisioning_events
  FOR SELECT TO authenticated USING (tenant_id = public.my_tenant_id());

-- ============================================================
-- 9. SESSIONS: Add NAS session tracking columns
-- ============================================================
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS nas_session_id TEXT,
  ADD COLUMN IF NOT EXISTS service_type   TEXT DEFAULT 'hotspot'
    CHECK (service_type IN ('hotspot','pppoe','dhcp','fiber','wimax','lte','static')),
  ADD COLUMN IF NOT EXISTS protocol       TEXT DEFAULT 'ipv4'
    CHECK (protocol IN ('ipv4','ipv6','dual_stack','cgnat')),
  ADD COLUMN IF NOT EXISTS pool_id        UUID REFERENCES public.ip_pools(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS vlan_id        INTEGER,
  ADD COLUMN IF NOT EXISTS terminated_by  TEXT,
  ADD COLUMN IF NOT EXISTS updated_at     TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_sessions_nas_id ON public.sessions(nas_session_id) WHERE nas_session_id IS NOT NULL;

-- ============================================================
-- 10. PACKAGES: Add bandwidth policy columns
-- ============================================================
ALTER TABLE public.packages
  ADD COLUMN IF NOT EXISTS speed_down_kbps      INTEGER,
  ADD COLUMN IF NOT EXISTS speed_up_kbps        INTEGER,
  ADD COLUMN IF NOT EXISTS burst_down_kbps      INTEGER,
  ADD COLUMN IF NOT EXISTS burst_up_kbps        INTEGER,
  ADD COLUMN IF NOT EXISTS burst_threshold_kbps INTEGER,
  ADD COLUMN IF NOT EXISTS burst_time_sec       INTEGER,
  ADD COLUMN IF NOT EXISTS priority             INTEGER NOT NULL DEFAULT 8,
  ADD COLUMN IF NOT EXISTS pool_id              UUID REFERENCES public.ip_pools(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS protocol             TEXT NOT NULL DEFAULT 'ipv4'
    CHECK (protocol IN ('ipv4','ipv6','dual_stack','cgnat'));

-- ============================================================
-- 11. UPDATED_AT TRIGGERS
-- ============================================================
DO $$ DECLARE tbl TEXT; BEGIN
  FOR tbl IN SELECT unnest(ARRAY[
    'network_adapters','ip_pools','wan_links','radius_users'
  ]) LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_%s_updated_at ON public.%s;
       CREATE TRIGGER trg_%s_updated_at BEFORE UPDATE ON public.%s
       FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at()',
      tbl, tbl, tbl, tbl
    );
  END LOOP;
END $$;

-- ============================================================
-- 12. VIEWS
-- ============================================================

-- Router health overview (no IP exposure — UUIDs only for joins)
CREATE OR REPLACE VIEW public.vw_router_health AS
  SELECT
    r.id,
    r.tenant_id,
    r.name,
    r.vendor,
    r.primary_adapter_type,
    r.status,
    r.cpu_load,
    r.memory_used,
    r.uptime,
    r.last_seen,
    r.is_active,
    COALESCE(a.health_status, 'unknown') AS adapter_health,
    COALESCE(a.error_count, 0)           AS adapter_errors,
    a.last_checked                       AS adapter_last_checked,
    COALESCE(
      (SELECT COUNT(*) FROM public.sessions s
       WHERE s.router_id = r.id AND s.ended_at IS NULL), 0
    )                                    AS active_sessions,
    COALESCE(
      (SELECT COUNT(*) FROM public.wan_links w
       WHERE w.router_id = r.id AND w.is_active), 0
    )                                    AS active_wan_links
  FROM public.routers r
  LEFT JOIN public.network_adapters a
    ON a.router_id = r.id AND a.is_primary = true;

-- IP pool utilization
CREATE OR REPLACE VIEW public.vw_ip_pool_utilization AS
  SELECT
    p.id,
    p.tenant_id,
    p.name,
    p.protocol,
    p.cidr,
    p.is_cgnat,
    p.router_id,
    p.utilization,
    COALESCE(
      (SELECT COUNT(*) FROM public.ip_assignments ia
       WHERE ia.pool_id = p.id AND ia.released_at IS NULL), 0
    ) AS assigned_count
  FROM public.ip_pools p
  WHERE p.is_active = true;

-- Network provisioning summary
CREATE OR REPLACE VIEW public.vw_network_provisioning AS
  SELECT
    pe.tenant_id,
    pe.event,
    pe.adapter_type,
    pe.service_type,
    COUNT(*)                             AS count,
    COUNT(*) FILTER (WHERE pe.error IS NOT NULL) AS failures,
    AVG(pe.duration_ms)                  AS avg_duration_ms,
    MAX(pe.created_at)                   AS latest
  FROM public.provisioning_events pe
  GROUP BY pe.tenant_id, pe.event, pe.adapter_type, pe.service_type;

-- ============================================================
-- 13. FUNCTION — Resolve subscriber's router by UUID
-- No IP address traversal in this function.
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_get_subscriber_router(
  _subscription_id UUID
) RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT router_id
  FROM public.subscriptions
  WHERE id = _subscription_id
  LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.fn_get_subscriber_router(UUID) TO authenticated;

-- ============================================================
-- 14. FUNCTION — Get adapter type for a router by UUID
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_get_adapter_type(
  _router_id UUID
) RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(primary_adapter_type, 'mikrotik_rest')
  FROM public.routers
  WHERE id = _router_id
  LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.fn_get_adapter_type(UUID) TO authenticated;

-- ============================================================
-- 15. PERFORMANCE INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_sessions_router_active
  ON public.sessions(router_id, ended_at)
  WHERE ended_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_sessions_customer_active
  ON public.sessions(customer_id, tenant_id)
  WHERE ended_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_radius_users_active
  ON public.radius_users(tenant_id, service_type)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_wan_links_active
  ON public.wan_links(router_id, priority)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_prov_events_recent
  ON public.provisioning_events(tenant_id, created_at DESC);
