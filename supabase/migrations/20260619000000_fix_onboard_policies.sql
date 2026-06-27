-- Allow any authenticated user with no tenant yet to create a tenant
CREATE POLICY "tenants new user insert" ON public.tenants FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL AND
    NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND tenant_id IS NOT NULL)
  );

-- SECURITY DEFINER function so the client can assign isp_owner role without needing direct user_roles write access
CREATE OR REPLACE FUNCTION public.assign_isp_owner(_user_id UUID, _tenant_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.user_roles (user_id, tenant_id, role)
  VALUES (_user_id, _tenant_id, 'isp_owner')
  ON CONFLICT (user_id, role, tenant_id) DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION public.assign_isp_owner(UUID, UUID) TO authenticated;
