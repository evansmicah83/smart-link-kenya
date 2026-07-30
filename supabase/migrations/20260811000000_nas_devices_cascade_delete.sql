-- Drop orphaned nas_devices whose router no longer exists
DELETE FROM nas_devices
WHERE router_id IS NOT NULL
  AND router_id NOT IN (SELECT id FROM routers);

-- Drop nas_devices with no router_id (wizard orphans from abandoned provisioning runs)
DELETE FROM nas_devices WHERE router_id IS NULL;

-- Drop orphaned radius_servers whose name doesn't match any live router
-- (keeps platform-level SmartLinkNet Cloud RADIUS rows)
DELETE FROM radius_servers
WHERE name NOT IN (SELECT name FROM routers WHERE tenant_id = radius_servers.tenant_id)
  AND name NOT LIKE 'SmartLinkNet%';

-- Add ON DELETE CASCADE so future router deletes auto-clean nas_devices
ALTER TABLE nas_devices
  DROP CONSTRAINT IF EXISTS nas_devices_router_id_fkey;

ALTER TABLE nas_devices
  ADD CONSTRAINT nas_devices_router_id_fkey
  FOREIGN KEY (router_id) REFERENCES routers(id) ON DELETE CASCADE;
