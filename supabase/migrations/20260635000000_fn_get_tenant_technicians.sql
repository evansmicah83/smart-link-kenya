-- RPC to fetch field technicians for a tenant (joins user_roles → profiles via auth.users id)
CREATE OR REPLACE FUNCTION public.fn_get_tenant_technicians(_tenant_id UUID)
RETURNS TABLE (
  id          UUID,
  full_name   TEXT,
  email       TEXT,
  phone       TEXT,
  avatar_url  TEXT,
  is_active   BOOLEAN,
  tenant_id   UUID
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    p.id, p.full_name, p.email, p.phone, p.avatar_url, p.is_active, p.tenant_id
  FROM public.user_roles ur
  JOIN public.profiles p ON p.id = ur.user_id
  WHERE ur.tenant_id  = _tenant_id
    AND ur.role       = 'field_technician';
$$;

GRANT EXECUTE ON FUNCTION public.fn_get_tenant_technicians(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_get_tenant_technicians(UUID) TO service_role;
