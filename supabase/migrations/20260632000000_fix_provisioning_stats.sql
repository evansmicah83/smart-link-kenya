-- Fix fn_provisioning_stats: accept NUMERIC for _hours to avoid PostgREST
-- integer/float type mismatch that causes HTTP 400 on RPC calls.
CREATE OR REPLACE FUNCTION public.fn_provisioning_stats(
  _tenant_id UUID,
  _hours     NUMERIC DEFAULT 24
)
RETURNS TABLE(
  total        BIGINT,
  completed    BIGINT,
  failed       BIGINT,
  pending      BIGINT,
  running      BIGINT,
  rolled_back  BIGINT,
  success_rate NUMERIC
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH w AS (
    SELECT status FROM public.provisioning_workflows
    WHERE tenant_id = _tenant_id
      AND created_at > now() - make_interval(hours => _hours::INTEGER)
  )
  SELECT
    COUNT(*)                                                        AS total,
    COUNT(*) FILTER (WHERE status = 'completed')                    AS completed,
    COUNT(*) FILTER (WHERE status = 'failed')                       AS failed,
    COUNT(*) FILTER (WHERE status = 'pending')                      AS pending,
    COUNT(*) FILTER (WHERE status = 'running')                      AS running,
    COUNT(*) FILTER (WHERE status = 'rolled_back')                  AS rolled_back,
    CASE WHEN COUNT(*) > 0
      THEN ROUND(COUNT(*) FILTER (WHERE status = 'completed')::NUMERIC / COUNT(*) * 100, 1)
      ELSE 100
    END                                                             AS success_rate
  FROM w;
$$;

GRANT EXECUTE ON FUNCTION public.fn_provisioning_stats(UUID, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_provisioning_stats(UUID, NUMERIC) TO service_role;
