-- Fix: create assign_isp_owner if it doesn't exist, and backfill broken profiles

-- 1. assign_isp_owner: inserts isp_owner role for a user+tenant
CREATE OR REPLACE FUNCTION public.assign_isp_owner(
  _user_id   UUID,
  _tenant_id UUID
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.user_roles (user_id, tenant_id, role)
  VALUES (_user_id, _tenant_id, 'isp_owner')
  ON CONFLICT (user_id, role, tenant_id) DO NOTHING;

  -- Also ensure profile is linked
  UPDATE public.profiles
  SET tenant_id = _tenant_id, updated_at = now()
  WHERE id = _user_id AND (tenant_id IS NULL OR tenant_id != _tenant_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.assign_isp_owner(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assign_isp_owner(UUID, UUID) TO service_role;

-- 2. Backfill: fix any profiles where tenant_id is NULL but user_roles has a tenant
UPDATE public.profiles p
SET tenant_id = ur.tenant_id, updated_at = now()
FROM public.user_roles ur
WHERE p.id = ur.user_id
  AND p.tenant_id IS NULL
  AND ur.tenant_id IS NOT NULL;
