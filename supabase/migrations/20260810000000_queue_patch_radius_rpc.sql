-- RPC: queue_patch_radius_all
-- Called by freeradius/setup.sh after writing the real VPS IP to platform_settings.
-- Inserts a patch_radius command for every router that is provisioned/online,
-- so existing routers update their RADIUS address without a full reprovision.

CREATE OR REPLACE FUNCTION queue_patch_radius_all(
  primary_ip   text,
  expires_at   timestamptz DEFAULT NOW() + INTERVAL '24 hours',
  secondary_ip text        DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO router_commands (router_id, tenant_id, command, payload, status, expires_at, created_at)
  SELECT
    r.id,
    r.tenant_id,
    'patch_radius',
    jsonb_build_object(
      'primary_ip',   primary_ip,
      'secondary_ip', secondary_ip
    ),
    'pending',
    expires_at,
    NOW()
  FROM routers r
  WHERE r.status IN ('online', 'provisioning', 'provisioned')
  -- Skip routers that already have a pending patch_radius queued
  AND NOT EXISTS (
    SELECT 1 FROM router_commands rc
    WHERE rc.router_id = r.id
      AND rc.command    = 'patch_radius'
      AND rc.status     = 'pending'
      AND rc.expires_at > NOW()
  );
END;
$$;

-- Allow the service role (edge functions + setup.sh REST calls) to invoke it
GRANT EXECUTE ON FUNCTION queue_patch_radius_all(text, timestamptz, text) TO service_role;
