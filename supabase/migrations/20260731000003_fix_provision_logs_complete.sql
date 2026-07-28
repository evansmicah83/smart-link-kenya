-- Step 1: Add tenant_id column
ALTER TABLE public.provision_logs ADD COLUMN IF NOT EXISTS tenant_id uuid;

-- Step 2: Backfill from routers
UPDATE public.provision_logs pl
SET tenant_id = r.tenant_id
FROM public.routers r
WHERE r.id = pl.router_id AND pl.tenant_id IS NULL;

-- Step 3: Drop old broken RLS policies
DROP POLICY IF EXISTS "Select provision_logs for router owner" ON public.provision_logs;
DROP POLICY IF EXISTS "Insert provision_logs for router owner" ON public.provision_logs;
DROP POLICY IF EXISTS "Service role full access provision_logs" ON public.provision_logs;
DROP POLICY IF EXISTS "provision_logs_select" ON public.provision_logs;
DROP POLICY IF EXISTS "provision_logs_insert" ON public.provision_logs;
DROP POLICY IF EXISTS "provision_logs_service" ON public.provision_logs;

-- Step 4: New correct RLS policies
CREATE POLICY "provision_logs_select" ON public.provision_logs
  FOR SELECT TO authenticated
  USING (tenant_id = public.my_tenant_id());

CREATE POLICY "provision_logs_insert" ON public.provision_logs
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.my_tenant_id());

CREATE POLICY "provision_logs_service" ON public.provision_logs
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Step 5: Ensure realtime is enabled
ALTER TABLE public.provision_logs REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'provision_logs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.provision_logs;
  END IF;
END $$;

-- Verify: should show provision_logs in the list
SELECT pubname, tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'provision_logs';
