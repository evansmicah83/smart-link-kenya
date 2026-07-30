-- Drop orphaned nas_devices whose router no longer exists
DELETE FROM nas_devices
WHERE router_id IS NOT NULL
  AND router_id NOT IN (SELECT id FROM routers);

-- Add ON DELETE CASCADE so future router deletes auto-clean nas_devices
ALTER TABLE nas_devices
  DROP CONSTRAINT IF EXISTS nas_devices_router_id_fkey;

ALTER TABLE nas_devices
  ADD CONSTRAINT nas_devices_router_id_fkey
  FOREIGN KEY (router_id) REFERENCES routers(id) ON DELETE CASCADE;
