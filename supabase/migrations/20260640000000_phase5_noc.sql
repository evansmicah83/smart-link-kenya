-- ============================================================
-- SmartLinkNet Phase 5: Network Operations Center
-- ============================================================

-- 1. Extend router_uptime_logs with full telemetry
ALTER TABLE public.router_uptime_logs
  ADD COLUMN IF NOT EXISTS temperature_c    NUMERIC(5,1),
  ADD COLUMN IF NOT EXISTS jitter_ms        NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS throughput_mbps  NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS wan_latency_ms   INTEGER,
  ADD COLUMN IF NOT EXISTS wan_available    BOOLEAN,
  ADD COLUMN IF NOT EXISTS active_sessions  INTEGER,
  ADD COLUMN IF NOT EXISTS uptime_seconds   BIGINT,
  ADD COLUMN IF NOT EXISTS health_score     NUMERIC(5,2);  -- 0-100

-- 2. Network metrics time-series (per-router, per-metric)
CREATE TABLE IF NOT EXISTS public.network_metrics (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  router_id     UUID REFERENCES public.routers(id) ON DELETE CASCADE,
  service_name  TEXT,                        -- for non-router metrics
  metric_name   TEXT NOT NULL,               -- cpu_pct|mem_pct|temp_c|latency_ms|packet_loss|jitter_ms|throughput_mbps|sessions|wan_latency_ms
  value         NUMERIC NOT NULL,
  unit          TEXT NOT NULL DEFAULT '',
  labels        JSONB NOT NULL DEFAULT '{}',
  recorded_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_nm_router_metric ON public.network_metrics(router_id, metric_name, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_nm_tenant_metric ON public.network_metrics(tenant_id, metric_name, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_nm_service       ON public.network_metrics(service_name, metric_name, recorded_at DESC)
  WHERE service_name IS NOT NULL;
GRANT INSERT,SELECT ON public.network_metrics TO authenticated;
GRANT ALL ON public.network_metrics TO service_role;
ALTER TABLE public.network_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nm_tenant" ON public.network_metrics
  FOR SELECT TO authenticated USING (tenant_id = public.my_tenant_id());

-- 3. Extend noc_incidents with escalation, impact, customer count
ALTER TABLE public.noc_incidents
  ADD COLUMN IF NOT EXISTS escalation_level    INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS impact_score        NUMERIC(5,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS affected_customers  INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS auto_detected       BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS detection_source    TEXT,
  ADD COLUMN IF NOT EXISTS escalated_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS escalated_to        UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS time_to_ack_mins    INTEGER,
  ADD COLUMN IF NOT EXISTS time_to_resolve_mins INTEGER,
  ADD COLUMN IF NOT EXISTS sla_breached        BOOLEAN NOT NULL DEFAULT false;

-- 4. SLA records (per-incident SLA tracking)
CREATE TABLE IF NOT EXISTS public.sla_records (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  incident_id         UUID REFERENCES public.noc_incidents(id) ON DELETE CASCADE,
  service_name        TEXT NOT NULL,
  sla_type            TEXT NOT NULL CHECK (sla_type IN ('response','resolution','availability')),
  target_mins         INTEGER NOT NULL,
  actual_mins         INTEGER,
  breached            BOOLEAN NOT NULL DEFAULT false,
  breach_margin_mins  INTEGER,           -- negative = met early, positive = overdue
  period_start        TIMESTAMPTZ NOT NULL DEFAULT now(),
  period_end          TIMESTAMPTZ,
  uptime_pct          NUMERIC(6,3),      -- for availability SLAs
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sla_tenant    ON public.sla_records(tenant_id, period_start DESC);
CREATE INDEX IF NOT EXISTS idx_sla_incident  ON public.sla_records(incident_id);
CREATE INDEX IF NOT EXISTS idx_sla_breached  ON public.sla_records(tenant_id, breached) WHERE breached = true;
GRANT SELECT,INSERT,UPDATE ON public.sla_records TO authenticated;
GRANT ALL ON public.sla_records TO service_role;
ALTER TABLE public.sla_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sla_tenant" ON public.sla_records
  TO authenticated USING (tenant_id = public.my_tenant_id()) WITH CHECK (tenant_id = public.my_tenant_id());

-- 5. Alert escalation policies
CREATE TABLE IF NOT EXISTS public.alert_escalation_policies (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  severity        TEXT NOT NULL CHECK (severity IN ('info','warning','critical')),
  escalate_after_mins INTEGER NOT NULL DEFAULT 30,
  escalate_to_users   UUID[] NOT NULL DEFAULT '{}',
  notify_channels     TEXT[] NOT NULL DEFAULT '{email}',
  repeat_every_mins   INTEGER NOT NULL DEFAULT 60,
  max_escalations     INTEGER NOT NULL DEFAULT 3,
  is_active           BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.alert_escalation_policies TO authenticated;
GRANT ALL ON public.alert_escalation_policies TO service_role;
ALTER TABLE public.alert_escalation_policies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "aep_tenant" ON public.alert_escalation_policies
  TO authenticated USING (tenant_id = public.my_tenant_id()) WITH CHECK (tenant_id = public.my_tenant_id());

-- 6. NOC escalation log
CREATE TABLE IF NOT EXISTS public.noc_escalations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  incident_id   UUID NOT NULL REFERENCES public.noc_incidents(id) ON DELETE CASCADE,
  level         INTEGER NOT NULL DEFAULT 1,
  escalated_to  UUID REFERENCES auth.users(id),
  channel       TEXT NOT NULL DEFAULT 'email',
  message       TEXT,
  acknowledged  BOOLEAN NOT NULL DEFAULT false,
  ack_at        TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_esc_incident ON public.noc_escalations(incident_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_esc_tenant   ON public.noc_escalations(tenant_id, created_at DESC);
GRANT SELECT,INSERT,UPDATE ON public.noc_escalations TO authenticated;
GRANT ALL ON public.noc_escalations TO service_role;
ALTER TABLE public.noc_escalations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "esc_tenant" ON public.noc_escalations
  TO authenticated USING (tenant_id = public.my_tenant_id()) WITH CHECK (tenant_id = public.my_tenant_id());

-- 7. Service impact records
CREATE TABLE IF NOT EXISTS public.service_impact (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  incident_id     UUID REFERENCES public.noc_incidents(id) ON DELETE CASCADE,
  service_name    TEXT NOT NULL,
  impact_type     TEXT NOT NULL CHECK (impact_type IN ('outage','degraded','partial','none')),
  affected_count  INTEGER NOT NULL DEFAULT 0,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at     TIMESTAMPTZ,
  duration_mins   INTEGER,
  revenue_impact  NUMERIC(12,2) DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_si_tenant   ON public.service_impact(tenant_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_si_incident ON public.service_impact(incident_id);
GRANT SELECT,INSERT,UPDATE ON public.service_impact TO authenticated;
GRANT ALL ON public.service_impact TO service_role;
ALTER TABLE public.service_impact ENABLE ROW LEVEL SECURITY;
CREATE POLICY "si_tenant" ON public.service_impact
  TO authenticated USING (tenant_id = public.my_tenant_id()) WITH CHECK (tenant_id = public.my_tenant_id());

-- 8. Add updated_at to alert_history for resolution tracking
ALTER TABLE public.alert_history
  ADD COLUMN IF NOT EXISTS escalated     BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS acknowledged  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ack_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS escalation_count INTEGER NOT NULL DEFAULT 0;

-- 9. Health score function (0-100 composite per router)
CREATE OR REPLACE FUNCTION public.fn_router_health_score(
  _cpu        NUMERIC,
  _mem        NUMERIC,
  _temp       NUMERIC,
  _latency    INTEGER,
  _pkt_loss   NUMERIC,
  _wan_avail  BOOLEAN
) RETURNS NUMERIC
LANGUAGE sql IMMUTABLE AS $$
  SELECT GREATEST(0, LEAST(100,
    100
    - CASE WHEN _cpu       > 90 THEN 30 WHEN _cpu       > 75 THEN 15 WHEN _cpu       > 60 THEN 5  ELSE 0 END
    - CASE WHEN _mem       > 90 THEN 25 WHEN _mem       > 75 THEN 12 WHEN _mem       > 60 THEN 4  ELSE 0 END
    - CASE WHEN _temp      > 70 THEN 20 WHEN _temp      > 60 THEN 10 WHEN _temp      > 50 THEN 3  ELSE 0 END
    - CASE WHEN _latency   > 500 THEN 20 WHEN _latency  > 200 THEN 10 WHEN _latency  > 100 THEN 3 ELSE 0 END
    - CASE WHEN _pkt_loss  > 10  THEN 20 WHEN _pkt_loss > 5   THEN 10 WHEN _pkt_loss > 1   THEN 3 ELSE 0 END
    - CASE WHEN NOT COALESCE(_wan_avail, true) THEN 30 ELSE 0 END
  ));
$$;

-- 10. SLA stats function
CREATE OR REPLACE FUNCTION public.fn_sla_stats(
  _tenant_id UUID,
  _days      INTEGER DEFAULT 30
) RETURNS TABLE(
  service_name    TEXT,
  total_incidents BIGINT,
  breached        BIGINT,
  met             BIGINT,
  avg_resolve_mins NUMERIC,
  uptime_pct      NUMERIC
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    s.service_name,
    COUNT(*)                                          AS total_incidents,
    COUNT(*) FILTER (WHERE s.breached)                AS breached,
    COUNT(*) FILTER (WHERE NOT s.breached)            AS met,
    ROUND(AVG(s.actual_mins) FILTER (WHERE s.actual_mins IS NOT NULL), 1) AS avg_resolve_mins,
    ROUND(AVG(s.uptime_pct)  FILTER (WHERE s.uptime_pct  IS NOT NULL), 3) AS uptime_pct
  FROM public.sla_records s
  WHERE s.tenant_id = _tenant_id
    AND s.period_start > now() - make_interval(days => _days)
  GROUP BY s.service_name
  ORDER BY s.service_name;
$$;
GRANT EXECUTE ON FUNCTION public.fn_sla_stats(UUID,INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_sla_stats(UUID,INTEGER) TO service_role;

-- 11. Network health overview function
CREATE OR REPLACE FUNCTION public.fn_network_health(
  _tenant_id UUID
) RETURNS TABLE(
  total_routers   BIGINT,
  online          BIGINT,
  offline         BIGINT,
  degraded        BIGINT,
  avg_cpu         NUMERIC,
  avg_mem         NUMERIC,
  avg_health_score NUMERIC,
  open_incidents  BIGINT,
  active_sessions BIGINT
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    COUNT(*)                                              AS total_routers,
    COUNT(*) FILTER (WHERE r.status = 'online')           AS online,
    COUNT(*) FILTER (WHERE r.status = 'offline')          AS offline,
    COUNT(*) FILTER (WHERE r.status = 'degraded')         AS degraded,
    ROUND(AVG(r.cpu_load),    1)                          AS avg_cpu,
    ROUND(AVG(r.memory_used), 1)                          AS avg_mem,
    ROUND(AVG(
      public.fn_router_health_score(
        r.cpu_load, r.memory_used, NULL, NULL, NULL, r.status = 'online'
      )
    ), 1)                                                 AS avg_health_score,
    (SELECT COUNT(*) FROM public.noc_incidents i
     WHERE i.tenant_id = _tenant_id AND i.status IN ('open','investigating')) AS open_incidents,
    (SELECT COUNT(*) FROM public.sessions s
     WHERE s.tenant_id = _tenant_id AND s.ended_at IS NULL)                   AS active_sessions
  FROM public.routers r
  WHERE r.tenant_id = _tenant_id AND r.is_active = true;
$$;
GRANT EXECUTE ON FUNCTION public.fn_network_health(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_network_health(UUID) TO service_role;

-- 12. Views

-- Live NOC incident view with SLA breach status
CREATE OR REPLACE VIEW public.vw_noc_incidents AS
  SELECT
    i.*,
    EXTRACT(EPOCH FROM (COALESCE(i.resolved_at, now()) - i.created_at)) / 60 AS age_mins,
    CASE
      WHEN i.resolved_at IS NULL AND
           EXTRACT(EPOCH FROM (now() - i.created_at)) / 60 > i.sla_target_mins
      THEN true ELSE false
    END AS sla_overdue,
    (SELECT COUNT(*) FROM public.noc_escalations e WHERE e.incident_id = i.id) AS escalation_count
  FROM public.noc_incidents i;
GRANT SELECT ON public.vw_noc_incidents TO authenticated;

-- Router health summary view
CREATE OR REPLACE VIEW public.vw_router_health AS
  SELECT
    r.id, r.tenant_id, r.name, r.location, r.model, r.vendor,
    r.status, r.cpu_load, r.memory_used, r.last_seen, r.ip_address,
    public.fn_router_health_score(
      r.cpu_load, r.memory_used, NULL, NULL, NULL, r.status = 'online'
    ) AS health_score,
    (SELECT l.latency_ms   FROM public.router_uptime_logs l WHERE l.router_id = r.id ORDER BY l.checked_at DESC LIMIT 1) AS last_latency_ms,
    (SELECT l.packet_loss  FROM public.router_uptime_logs l WHERE l.router_id = r.id ORDER BY l.checked_at DESC LIMIT 1) AS last_packet_loss,
    (SELECT l.temperature_c FROM public.router_uptime_logs l WHERE l.router_id = r.id ORDER BY l.checked_at DESC LIMIT 1) AS last_temp_c,
    (SELECT l.jitter_ms    FROM public.router_uptime_logs l WHERE l.router_id = r.id ORDER BY l.checked_at DESC LIMIT 1) AS last_jitter_ms,
    (SELECT l.throughput_mbps FROM public.router_uptime_logs l WHERE l.router_id = r.id ORDER BY l.checked_at DESC LIMIT 1) AS last_throughput_mbps,
    (SELECT l.wan_latency_ms FROM public.router_uptime_logs l WHERE l.router_id = r.id ORDER BY l.checked_at DESC LIMIT 1) AS last_wan_latency_ms,
    (SELECT l.active_sessions FROM public.router_uptime_logs l WHERE l.router_id = r.id ORDER BY l.checked_at DESC LIMIT 1) AS last_active_sessions
  FROM public.routers r
  WHERE r.is_active = true;
GRANT SELECT ON public.vw_router_health TO authenticated;

-- SLA dashboard view (30-day rolling)
CREATE OR REPLACE VIEW public.vw_sla_dashboard AS
  SELECT
    i.tenant_id,
    i.affected_service AS service_name,
    COUNT(*)                                                    AS total_incidents,
    COUNT(*) FILTER (WHERE i.sla_breached)                      AS sla_breached,
    COUNT(*) FILTER (WHERE NOT i.sla_breached AND i.resolved_at IS NOT NULL) AS sla_met,
    ROUND(AVG(i.time_to_resolve_mins) FILTER (WHERE i.time_to_resolve_mins IS NOT NULL), 1) AS avg_resolve_mins,
    ROUND(AVG(i.time_to_ack_mins)     FILTER (WHERE i.time_to_ack_mins     IS NOT NULL), 1) AS avg_ack_mins,
    COUNT(*) FILTER (WHERE i.status IN ('open','investigating'))  AS open_count,
    MAX(i.created_at)                                            AS last_incident_at
  FROM public.noc_incidents i
  WHERE i.created_at > now() - interval '30 days'
  GROUP BY i.tenant_id, i.affected_service;
GRANT SELECT ON public.vw_sla_dashboard TO authenticated;

-- 13. Indexes for time-series queries
CREATE INDEX IF NOT EXISTS idx_rul_router_time ON public.router_uptime_logs(router_id, checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_nm_time         ON public.network_metrics(recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_ni_open         ON public.noc_incidents(tenant_id, status, created_at DESC)
  WHERE status IN ('open','investigating');
