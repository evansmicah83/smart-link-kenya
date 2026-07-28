-- Add tenant_id to provision_logs so RLS can filter by tenant without joining routers
ALTER TABLE public.provision_logs ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;

-- Backfill tenant_id from routers table
UPDATE public.provision_logs pl
SET tenant_id = r.tenant_id
FROM public.routers r
WHERE r.id = pl.router_id AND pl.tenant_id IS NULL;

-- Drop the old isp_id-based policies that block realtime
DROP POLICY IF EXISTS "Select provision_logs for router owner" ON public.provision_logs;
DROP POLICY IF EXISTS "Insert provision_logs for router owner" ON public.provision_logs;
DROP POLICY IF EXISTS "Service role full access provision_logs" ON public.provision_logs;

-- New policies using tenant_id (fast, no join needed)
CREATE POLICY "provision_logs_select" ON public.provision_logs
  FOR SELECT TO authenticated
  USING (tenant_id = public.my_tenant_id());

CREATE POLICY "provision_logs_insert" ON public.provision_logs
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.my_tenant_id());

CREATE POLICY "provision_logs_service" ON public.provision_logs
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);
