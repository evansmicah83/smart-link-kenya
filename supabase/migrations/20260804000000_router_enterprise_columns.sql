-- Enterprise provisioning: router ready status, discovered config, interface traffic
ALTER TABLE public.routers
  ADD COLUMN IF NOT EXISTS discovered_config  jsonb,
  ADD COLUMN IF NOT EXISTS interface_traffic  jsonb,
  ADD COLUMN IF NOT EXISTS validation_errors  jsonb,
  ADD COLUMN IF NOT EXISTS rollback_at        timestamptz,
  ADD COLUMN IF NOT EXISTS ready_at           timestamptz;

-- Extend status check to include 'ready' and 'rollback'
ALTER TABLE public.routers DROP CONSTRAINT IF EXISTS routers_status_check;
ALTER TABLE public.routers
  ADD CONSTRAINT routers_status_check
  CHECK (status IN ('pending','provisioning','online','offline','active','failed','ready','rollback'));
