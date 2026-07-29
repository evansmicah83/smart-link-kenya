-- Router telemetry columns for live monitoring
ALTER TABLE public.routers
  ADD COLUMN IF NOT EXISTS cpu_load       int,
  ADD COLUMN IF NOT EXISTS free_memory    bigint,
  ADD COLUMN IF NOT EXISTS total_memory   bigint,
  ADD COLUMN IF NOT EXISTS uptime_seconds bigint,
  ADD COLUMN IF NOT EXISTS ros_version    text,
  ADD COLUMN IF NOT EXISTS board_name     text,
  ADD COLUMN IF NOT EXISTS hotspot_users  int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pppoe_users    int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS dhcp_leases    int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS interfaces     jsonb,
  ADD COLUMN IF NOT EXISTS provisioned_at timestamptz,
  ADD COLUMN IF NOT EXISTS backup_at      timestamptz;
