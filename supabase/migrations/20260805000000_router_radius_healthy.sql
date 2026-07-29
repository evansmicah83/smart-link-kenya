-- Track RADIUS reachability as reported by the router's telemetry script
ALTER TABLE public.routers
  ADD COLUMN IF NOT EXISTS radius_healthy boolean;
