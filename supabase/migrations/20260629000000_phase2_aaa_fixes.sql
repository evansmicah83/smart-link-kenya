-- Phase 2 AAA: schema fixes
-- Add missing updated_at to accounting_replica_targets
ALTER TABLE public.accounting_replica_targets
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

DO $$ BEGIN
  DROP TRIGGER IF EXISTS trg_acct_replica_targets_updated_at ON public.accounting_replica_targets;
  CREATE TRIGGER trg_acct_replica_targets_updated_at
    BEFORE UPDATE ON public.accounting_replica_targets
    FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();
END $$;

-- Ensure radius_servers has is_primary (may be missing on some environments)
ALTER TABLE public.radius_servers
  ADD COLUMN IF NOT EXISTS is_primary BOOLEAN NOT NULL DEFAULT true;
