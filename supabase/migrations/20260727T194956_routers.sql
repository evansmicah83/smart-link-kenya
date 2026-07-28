-- Migration: create routers and provision_logs tables, enable RLS and policies
-- Generated: 2026-07-27T19:49:56+03:00

BEGIN;

-- Ensure pgcrypto for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- routers table: create if not exists, otherwise ensure missing columns/indexes are added safely
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'routers' AND n.nspname = 'public'
  ) THEN
    CREATE TABLE public.routers (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      isp_id uuid REFERENCES auth.users(id) NOT NULL,
      name text NOT NULL,
      serial_number text,
      status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','provisioning','active','failed')),
      mode text CHECK (mode IN ('pppoe','hotspot','both')),
      bridge_name text NOT NULL DEFAULT 'smartlinknet-bridge',
      uplink_interface text,
      bridge_ports text[] DEFAULT '{}',
      subnet text NOT NULL DEFAULT '172.31.0.0/16',
      provision_token text,
      provision_token_expires_at timestamptz,
      provisioned_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    -- create unique index on provision_token if created
    IF NOT EXISTS (
      SELECT 1 FROM pg_index i JOIN pg_class c ON i.indrelid = c.oid WHERE c.relname = 'routers' AND i.indisunique = true
    ) THEN
      CREATE UNIQUE INDEX routers_provision_token_idx ON public.routers (provision_token);
    END IF;
  ELSE
    -- Table exists: add columns if missing (use ALTER TABLE ... ADD COLUMN IF NOT EXISTS)
    ALTER TABLE public.routers ADD COLUMN IF NOT EXISTS provision_token text;
    ALTER TABLE public.routers ADD COLUMN IF NOT EXISTS provision_token_expires_at timestamptz;
    ALTER TABLE public.routers ADD COLUMN IF NOT EXISTS provisioned_at timestamptz;
    -- Create unique index only if column exists and index absent
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'routers' AND column_name = 'provision_token'
    ) THEN
      IF NOT EXISTS (
        SELECT 1 FROM pg_class c JOIN pg_index i ON i.indrelid = c.oid JOIN pg_attribute a ON a.attrelid = c.oid
        WHERE c.relname = 'routers' AND exists (
          SELECT 1 FROM pg_attribute pa WHERE pa.attrelid = c.oid AND pa.attname = 'provision_token'
        ) AND i.indisunique = true
      ) THEN
        CREATE UNIQUE INDEX IF NOT EXISTS routers_provision_token_idx ON public.routers (provision_token);
      END IF;
    END IF;
  END IF;
END
$$;

-- provision_logs table
CREATE TABLE IF NOT EXISTS public.provision_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  router_id uuid NOT NULL REFERENCES public.routers(id) ON DELETE CASCADE,
  stage text NOT NULL,
  message text NOT NULL,
  success boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.routers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provision_logs ENABLE ROW LEVEL SECURITY;

-- Ensure isp_id column exists (add if missing) to avoid policy creation errors on older schemas
ALTER TABLE public.routers ADD COLUMN IF NOT EXISTS isp_id uuid;

-- Policies for routers-- Authenticated users may select their own routers
CREATE POLICY "Select own routers" ON public.routers
  FOR SELECT TO authenticated
  USING (isp_id = auth.uid());

-- Authenticated users may insert routers only for themselves
CREATE POLICY "Insert own routers" ON public.routers
  FOR INSERT TO authenticated
  WITH CHECK (isp_id = auth.uid());

-- Authenticated users may update only their own routers
CREATE POLICY "Update own routers" ON public.routers
  FOR UPDATE TO authenticated
  USING (isp_id = auth.uid())
  WITH CHECK (isp_id = auth.uid());

-- Service role (server-side) should have full access
CREATE POLICY "Service role full access" ON public.routers
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- Revoke direct client-side SELECT access to sensitive provision columns
-- The frontend should only receive the provision token once via an Edge Function
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'routers' AND column_name = 'provision_token'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'routers' AND column_name = 'provision_token_expires_at'
  ) THEN
    EXECUTE 'REVOKE SELECT (provision_token, provision_token_expires_at) ON public.routers FROM authenticated';
  END IF;
END
$$;

-- Policies for provision_logs
-- Authenticated users may select logs only for routers they own
CREATE POLICY "Select provision_logs for router owner" ON public.provision_logs
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.routers r
      WHERE r.id = public.provision_logs.router_id
        AND r.isp_id = auth.uid()
    )
  );

-- Authenticated users may insert logs only for routers they own (useful if client needs to create logs)
CREATE POLICY "Insert provision_logs for router owner" ON public.provision_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.routers r
      WHERE r.id = router_id
        AND r.isp_id = auth.uid()
    )
  );

-- Service role full access to provision_logs
CREATE POLICY "Service role full access provision_logs" ON public.provision_logs
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- Trigger function to keep updated_at current
CREATE OR REPLACE FUNCTION public.update_timestamp()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Trigger for routers updated_at
DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'routers_set_updated_at'
  ) THEN
    CREATE TRIGGER routers_set_updated_at
    BEFORE UPDATE ON public.routers
    FOR EACH ROW EXECUTE FUNCTION public.update_timestamp();
  END IF;
END
$do$;

COMMIT;
