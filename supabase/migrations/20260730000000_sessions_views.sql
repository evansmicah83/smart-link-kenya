-- Live session views over the existing sessions table.
-- hotspot_sessions and pppoe_sessions are derived from subscriptions.type
-- so the routers page live counter works without new tables.

CREATE OR REPLACE VIEW public.hotspot_sessions AS
  SELECT
    s.id,
    s.tenant_id,
    s.customer_id,
    s.router_id,
    s.subscription_id,
    s.username,
    s.ip_address,
    s.mac_address,
    s.bytes_in,
    s.bytes_out,
    s.started_at,
    s.ended_at,
    s.duration_seconds,
    s.terminated_by,
    CASE WHEN s.ended_at IS NULL THEN 'active' ELSE 'ended' END AS status
  FROM public.sessions s
  LEFT JOIN public.subscriptions sub ON sub.id = s.subscription_id
  WHERE sub.type = 'hotspot' OR sub.id IS NULL;

GRANT SELECT ON public.hotspot_sessions TO authenticated;
GRANT SELECT ON public.hotspot_sessions TO service_role;

CREATE OR REPLACE VIEW public.pppoe_sessions AS
  SELECT
    s.id,
    s.tenant_id,
    s.customer_id,
    s.router_id,
    s.subscription_id,
    s.username,
    s.ip_address,
    s.mac_address,
    s.bytes_in,
    s.bytes_out,
    s.started_at,
    s.ended_at,
    s.duration_seconds,
    s.terminated_by,
    CASE WHEN s.ended_at IS NULL THEN 'active' ELSE 'ended' END AS status
  FROM public.sessions s
  LEFT JOIN public.subscriptions sub ON sub.id = s.subscription_id
  WHERE sub.type = 'pppoe';

GRANT SELECT ON public.pppoe_sessions TO authenticated;
GRANT SELECT ON public.pppoe_sessions TO service_role;
