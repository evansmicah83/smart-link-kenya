-- Add URL columns to radius_servers for cloud RADIUS routing
ALTER TABLE public.radius_servers
  ADD COLUMN IF NOT EXISTS auth_url text,
  ADD COLUMN IF NOT EXISTS acct_url text;

-- Seed system cloud RADIUS server for any tenant that has none
-- (new tenants get seeded automatically by the provision function)
INSERT INTO public.radius_servers (tenant_id, name, host, auth_port, acct_port, shared_secret, is_active, is_primary, is_healthy, priority, auth_url, acct_url)
SELECT
  t.id,
  'SmartLinkNet Cloud RADIUS',
  'pending',  -- IP resolved at provision time by edge function
  443,
  443,
  encode(gen_random_bytes(16), 'hex'),
  true,
  true,
  true,
  1,
  'https://tghaarhofriakwgvqmpm.supabase.co/functions/v1/radius-auth',
  'https://tghaarhofriakwgvqmpm.supabase.co/functions/v1/radius-accounting'
FROM public.tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM public.radius_servers rs
  WHERE rs.tenant_id = t.id AND rs.is_active = true
);
