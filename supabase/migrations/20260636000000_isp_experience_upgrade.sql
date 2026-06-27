-- ============================================================
-- SmartLinkNet: ISP Experience Upgrade Migration
-- Captive Portal, Branding, Marketing, Outages, Leads, Coupons
-- ============================================================

-- ─── Enhanced tenant_branding table ──────────────────────────────────────────
ALTER TABLE IF EXISTS tenant_branding
  ADD COLUMN IF NOT EXISTS success_color text,
  ADD COLUMN IF NOT EXISTS warning_color text,
  ADD COLUMN IF NOT EXISTS error_color text,
  ADD COLUMN IF NOT EXISTS portal_bg_color text,
  ADD COLUMN IF NOT EXISTS portal_text_color text,
  ADD COLUMN IF NOT EXISTS company_name text,
  ADD COLUMN IF NOT EXISTS whatsapp_number text,
  ADD COLUMN IF NOT EXISTS terms_url text,
  ADD COLUMN IF NOT EXISTS fup_url text;

-- ─── Outages / Service status ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS outages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
  title text NOT NULL,
  description text,
  type text NOT NULL DEFAULT 'outage' CHECK (type IN ('outage','maintenance','degraded','restored')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','resolved')),
  branch_id uuid REFERENCES branches(id) ON DELETE SET NULL,
  area text,
  eta timestamptz,
  started_at timestamptz DEFAULT now(),
  resolved_at timestamptz,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE outages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "outages_tenant" ON outages
  FOR ALL USING (tenant_id IN (
    SELECT tenant_id FROM profiles WHERE id = auth.uid()
  ));

-- ─── Leads (CRM / Sales pipeline) ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
  full_name text NOT NULL,
  phone text,
  email text,
  source text DEFAULT 'walk-in',
  area text,
  notes text,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','contacted','site_survey','installation','converted','lost')),
  assigned_to uuid REFERENCES auth.users(id),
  converted_customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "leads_tenant" ON leads
  FOR ALL USING (tenant_id IN (
    SELECT tenant_id FROM profiles WHERE id = auth.uid()
  ));

-- ─── Coupons / Discount codes ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
  code text NOT NULL,
  discount_type text NOT NULL DEFAULT 'percent' CHECK (discount_type IN ('percent','fixed')),
  discount_value numeric NOT NULL DEFAULT 0,
  max_uses integer NOT NULL DEFAULT 100,
  uses integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  applies_to text DEFAULT 'all', -- 'all','package_id'
  package_id uuid REFERENCES packages(id) ON DELETE SET NULL,
  expires_at timestamptz,
  created_at timestamptz DEFAULT now(),
  UNIQUE (tenant_id, code)
);

ALTER TABLE coupons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "coupons_tenant" ON coupons
  FOR ALL USING (tenant_id IN (
    SELECT tenant_id FROM profiles WHERE id = auth.uid()
  ));

-- ─── Notifications table (if not exists) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  title text NOT NULL,
  message text,
  type text NOT NULL DEFAULT 'info' CHECK (type IN ('info','success','warning','error')),
  read boolean NOT NULL DEFAULT false,
  link text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notifications_own" ON notifications
  FOR ALL USING (user_id = auth.uid());

-- ─── Add is_popular flag to packages ─────────────────────────────────────────
ALTER TABLE IF EXISTS packages
  ADD COLUMN IF NOT EXISTS is_popular boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS speed_limit text,
  ADD COLUMN IF NOT EXISTS data_limit text,
  ADD COLUMN IF NOT EXISTS description text;

-- ─── Add checkout_request_id to payments ─────────────────────────────────────
ALTER TABLE IF EXISTS payments
  ADD COLUMN IF NOT EXISTS checkout_request_id text;

CREATE INDEX IF NOT EXISTS idx_payments_checkout ON payments(checkout_request_id) WHERE checkout_request_id IS NOT NULL;

-- ─── Indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_outages_tenant_status ON outages(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_leads_tenant ON leads(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_coupons_tenant ON coupons(tenant_id, is_active);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read);
