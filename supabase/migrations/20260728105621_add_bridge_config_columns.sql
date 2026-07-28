-- Migration: add bridge config columns to routers
-- Note: do NOT drop or modify the existing singular bridge_port column (kept for backward compatibility).

ALTER TABLE IF EXISTS routers
  ADD COLUMN IF NOT EXISTS bridge_ports text[] DEFAULT '{}'::text[];

ALTER TABLE IF EXISTS routers
  ADD COLUMN IF NOT EXISTS uplink_interface text;

ALTER TABLE IF EXISTS routers
  ADD COLUMN IF NOT EXISTS mode text;

-- Add CHECK constraint for mode in an idempotent way.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_routers_mode'
  ) THEN
    ALTER TABLE routers
      ADD CONSTRAINT chk_routers_mode CHECK (mode IN ('pppoe','hotspot','both'));
  END IF;
END
$$;
