
-- =========================================================
-- SmartLinkNet — Phase 1 Foundation
-- =========================================================

-- ---------- ENUMS ----------
CREATE TYPE public.app_role AS ENUM (
  'super_admin',
  'isp_owner',
  'branch_manager',
  'network_engineer',
  'support_agent',
  'sales_agent',
  'accountant',
  'field_technician',
  'customer'
);

CREATE TYPE public.tenant_status AS ENUM ('active', 'suspended', 'trial', 'cancelled');
CREATE TYPE public.subscription_plan AS ENUM ('trial', 'starter', 'growth', 'enterprise');

-- ---------- updated_at helper ----------
CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

-- ---------- TENANTS ----------
CREATE TABLE public.tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  contact_email TEXT,
  contact_phone TEXT,
  country TEXT NOT NULL DEFAULT 'KE',
  currency TEXT NOT NULL DEFAULT 'KES',
  timezone TEXT NOT NULL DEFAULT 'Africa/Nairobi',
  logo_url TEXT,
  primary_color TEXT DEFAULT '#1e3a8a',
  status public.tenant_status NOT NULL DEFAULT 'trial',
  plan public.subscription_plan NOT NULL DEFAULT 'trial',
  trial_ends_at TIMESTAMPTZ DEFAULT (now() + INTERVAL '14 days'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenants TO authenticated;
GRANT ALL ON public.tenants TO service_role;
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_tenants_updated BEFORE UPDATE ON public.tenants
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ---------- PROFILES ----------
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE SET NULL,
  full_name TEXT,
  email TEXT,
  phone TEXT,
  avatar_url TEXT,
  national_id TEXT,
  kra_pin TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_profiles_tenant ON public.profiles(tenant_id);
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ---------- USER ROLES ----------
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role, tenant_id)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_user_roles_user ON public.user_roles(user_id);
CREATE INDEX idx_user_roles_tenant ON public.user_roles(tenant_id);

-- ---------- SECURITY DEFINER HELPERS ----------
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'super_admin');
$$;

CREATE OR REPLACE FUNCTION public.has_tenant_role(_user_id UUID, _tenant_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND tenant_id = _tenant_id AND role = _role
  );
$$;

CREATE OR REPLACE FUNCTION public.current_tenant_id(_user_id UUID)
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT tenant_id FROM public.profiles WHERE id = _user_id LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_tenant_member(_user_id UUID, _tenant_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = _user_id AND tenant_id = _tenant_id
  ) OR EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND tenant_id = _tenant_id
  );
$$;

CREATE OR REPLACE FUNCTION public.is_tenant_admin(_user_id UUID, _tenant_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND tenant_id = _tenant_id
      AND role IN ('isp_owner','branch_manager')
  );
$$;

-- ---------- BRANCHES ----------
CREATE TABLE public.branches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT,
  address TEXT,
  city TEXT,
  county TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  phone TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.branches TO authenticated;
GRANT ALL ON public.branches TO service_role;
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_branches_tenant ON public.branches(tenant_id);
CREATE TRIGGER trg_branches_updated BEFORE UPDATE ON public.branches
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ---------- TENANT SUBSCRIPTIONS ----------
CREATE TABLE public.tenant_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  plan public.subscription_plan NOT NULL,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'KES',
  period_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  period_end TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_subscriptions TO authenticated;
GRANT ALL ON public.tenant_subscriptions TO service_role;
ALTER TABLE public.tenant_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_tenant_subs_tenant ON public.tenant_subscriptions(tenant_id);

-- ---------- AUDIT LOGS ----------
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity TEXT,
  entity_id TEXT,
  ip_address TEXT,
  user_agent TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_audit_tenant_time ON public.audit_logs(tenant_id, created_at DESC);

-- ---------- RLS POLICIES ----------

-- tenants
CREATE POLICY "tenants super admin all" ON public.tenants FOR ALL
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));
CREATE POLICY "tenants member can view" ON public.tenants FOR SELECT
  USING (public.is_tenant_member(auth.uid(), id));
CREATE POLICY "tenants admin can update" ON public.tenants FOR UPDATE
  USING (public.is_tenant_admin(auth.uid(), id));

-- profiles
CREATE POLICY "profiles self select" ON public.profiles FOR SELECT
  USING (auth.uid() = id OR public.is_super_admin(auth.uid())
         OR (tenant_id IS NOT NULL AND public.is_tenant_admin(auth.uid(), tenant_id)));
CREATE POLICY "profiles self insert" ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles self update" ON public.profiles FOR UPDATE
  USING (auth.uid() = id OR public.is_super_admin(auth.uid()));
CREATE POLICY "profiles super admin delete" ON public.profiles FOR DELETE
  USING (public.is_super_admin(auth.uid()));

-- user_roles
CREATE POLICY "user_roles self view" ON public.user_roles FOR SELECT
  USING (auth.uid() = user_id
         OR public.is_super_admin(auth.uid())
         OR (tenant_id IS NOT NULL AND public.is_tenant_admin(auth.uid(), tenant_id)));
-- writes restricted to service_role (managed by edge / server functions)

-- branches
CREATE POLICY "branches tenant view" ON public.branches FOR SELECT
  USING (public.is_super_admin(auth.uid()) OR public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "branches tenant admin write" ON public.branches FOR ALL
  USING (public.is_super_admin(auth.uid()) OR public.is_tenant_admin(auth.uid(), tenant_id))
  WITH CHECK (public.is_super_admin(auth.uid()) OR public.is_tenant_admin(auth.uid(), tenant_id));

-- tenant_subscriptions
CREATE POLICY "subs super admin all" ON public.tenant_subscriptions FOR ALL
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));
CREATE POLICY "subs tenant view" ON public.tenant_subscriptions FOR SELECT
  USING (public.is_tenant_member(auth.uid(), tenant_id));

-- audit_logs
CREATE POLICY "audit super admin view" ON public.audit_logs FOR SELECT
  USING (public.is_super_admin(auth.uid()));
CREATE POLICY "audit tenant view" ON public.audit_logs FOR SELECT
  USING (tenant_id IS NOT NULL AND public.is_tenant_admin(auth.uid(), tenant_id));
CREATE POLICY "audit user insert own" ON public.audit_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ---------- AUTO-CREATE PROFILE ON SIGNUP ----------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email)
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
