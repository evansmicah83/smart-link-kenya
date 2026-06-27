-- SmartLinkNet Phase 2 fix: atomic data_used_mb increment for accounting Stop events.
-- Replaces the broken rpc?. optional-chain pattern in accounting.ts.

CREATE OR REPLACE FUNCTION public.fn_increment_data_usage(
  _subscription_id UUID,
  _mb              INTEGER
)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.subscriptions
  SET    data_used_mb = COALESCE(data_used_mb, 0) + _mb
  WHERE  id = _subscription_id;
$$;

GRANT EXECUTE ON FUNCTION public.fn_increment_data_usage(UUID, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_increment_data_usage(UUID, INTEGER) TO authenticated;
