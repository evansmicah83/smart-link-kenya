-- Router command queue: cloud queues commands, router polls and executes them
-- This is the NAT-safe model: router always initiates outbound HTTPS to cloud

CREATE TABLE IF NOT EXISTS public.router_commands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  router_id uuid NOT NULL REFERENCES public.routers(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL,
  command text NOT NULL,           -- e.g. 'apply_config', 'get_status', 'reboot'
  payload jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','done','failed')),
  result jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '1 hour')
);

CREATE INDEX IF NOT EXISTS router_commands_router_pending
  ON public.router_commands(router_id, status, created_at)
  WHERE status = 'pending';

ALTER TABLE public.router_commands ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON public.router_commands
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "tenant_select" ON public.router_commands
  FOR SELECT TO authenticated
  USING (tenant_id IN (
    SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
  ));

-- Add last_command_at to routers for tracking
ALTER TABLE public.routers ADD COLUMN IF NOT EXISTS last_command_at timestamptz;
ALTER TABLE public.routers ADD COLUMN IF NOT EXISTS last_poll_at timestamptz;

-- Enable realtime on router_commands so UI can watch command completion
ALTER PUBLICATION supabase_realtime ADD TABLE public.router_commands;
