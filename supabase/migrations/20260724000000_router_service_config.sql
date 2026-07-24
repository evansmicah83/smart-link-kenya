-- Router-level provisioning config for multi-ISP deployments
ALTER TABLE public.routers
  ADD COLUMN IF NOT EXISTS services TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS bridge_port TEXT NOT NULL DEFAULT 'ether2'
    CHECK (bridge_port IN ('ether1','ether2')),
  ADD COLUMN IF NOT EXISTS subnet TEXT NOT NULL DEFAULT '172.31.0.0/16',
  ADD COLUMN IF NOT EXISTS provisioning_slug TEXT,
  ADD COLUMN IF NOT EXISTS provisioning_identity TEXT;

CREATE INDEX IF NOT EXISTS idx_routers_services ON public.routers USING GIN (services);
CREATE INDEX IF NOT EXISTS idx_routers_provisioning_slug ON public.routers (provisioning_slug);
