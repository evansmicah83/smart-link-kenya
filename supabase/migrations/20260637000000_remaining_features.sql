-- ============================================================
-- SmartLinkNet: Remaining Features Migration
-- OTP, Customer Portal, Referrals, Package Promos,
-- Email Logs, Branch Scoping, Font/Typography Branding
-- ============================================================

-- ─── OTP codes table (server-side OTP verification) ──────────────────────────
CREATE TABLE IF NOT EXISTS otp_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  phone text NOT NULL,
  code text NOT NULL,
  purpose text NOT NULL DEFAULT 'portal_login' CHECK (purpose IN ('portal_login','password_reset','customer_verify')),
  used boolean NOT NULL DEFAULT false,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '10 minutes'),
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_otp_phone_code ON otp_codes(phone, code, used, expires_at);
-- No RLS needed — accessed only via service role in edge functions

-- ─── Customer portal sessions (for self-service portal auth) ─────────────────
CREATE TABLE IF NOT EXISTS customer_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
  customer_id uuid REFERENCES customers(id) ON DELETE CASCADE NOT NULL,
  token text NOT NULL UNIQUE,
  phone text NOT NULL,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_customer_sessions_token ON customer_sessions(token);
CREATE INDEX IF NOT EXISTS idx_customer_sessions_customer ON customer_sessions(customer_id);

-- ─── Referral codes (one per customer) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS referral_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
  customer_id uuid REFERENCES customers(id) ON DELETE CASCADE NOT NULL,
  code text NOT NULL,
  uses integer NOT NULL DEFAULT 0,
  reward_type text NOT NULL DEFAULT 'days' CHECK (reward_type IN ('days','discount','credit')),
  reward_value numeric NOT NULL DEFAULT 7,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  UNIQUE (tenant_id, code)
);

ALTER TABLE referral_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "referral_codes_tenant" ON referral_codes
  FOR ALL USING (tenant_id IN (SELECT tenant_id FROM profiles WHERE id = auth.uid()));

-- ─── Referral uses ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS referral_uses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_code_id uuid REFERENCES referral_codes(id) ON DELETE CASCADE NOT NULL,
  referred_customer_id uuid REFERENCES customers(id) ON DELETE CASCADE NOT NULL,
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
  reward_applied boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE referral_uses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "referral_uses_tenant" ON referral_uses
  FOR ALL USING (tenant_id IN (SELECT tenant_id FROM profiles WHERE id = auth.uid()));

-- ─── Promotional package flags ────────────────────────────────────────────────
ALTER TABLE IF EXISTS packages
  ADD COLUMN IF NOT EXISTS is_promotional boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS promo_label text,
  ADD COLUMN IF NOT EXISTS promo_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS happy_hour_start time,
  ADD COLUMN IF NOT EXISTS happy_hour_end time,
  ADD COLUMN IF NOT EXISTS available_from time,
  ADD COLUMN IF NOT EXISTS available_to time,
  ADD COLUMN IF NOT EXISTS plan_category text DEFAULT 'standard'
    CHECK (plan_category IN ('standard','family','business','night','hourly','student'));

-- ─── Branding: typography / font ─────────────────────────────────────────────
ALTER TABLE IF EXISTS tenant_branding
  ADD COLUMN IF NOT EXISTS font_family text,
  ADD COLUMN IF NOT EXISTS dark_bg_color text,
  ADD COLUMN IF NOT EXISTS dark_card_color text,
  ADD COLUMN IF NOT EXISTS light_bg_color text,
  ADD COLUMN IF NOT EXISTS light_card_color text,
  ADD COLUMN IF NOT EXISTS customer_portal_tagline text;

-- ─── Email logs ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS email_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  to_email text NOT NULL,
  subject text NOT NULL,
  body text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed')),
  provider text,
  error text,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_email_logs_tenant ON email_logs(tenant_id, created_at DESC);

-- ─── Branch scoping: add branch_id to customers and routers ──────────────────
ALTER TABLE IF EXISTS customers
  ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES branches(id) ON DELETE SET NULL;

ALTER TABLE IF EXISTS routers
  ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES branches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_customers_branch ON customers(branch_id) WHERE branch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_routers_branch ON routers(branch_id) WHERE branch_id IS NOT NULL;

-- ─── Loyalty points table ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS loyalty_points (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
  customer_id uuid REFERENCES customers(id) ON DELETE CASCADE NOT NULL,
  points integer NOT NULL DEFAULT 0,
  reason text,
  expires_at timestamptz,
  created_at timestamptz DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_loyalty_customer ON loyalty_points(tenant_id, customer_id);

ALTER TABLE IF EXISTS loyalty_points ENABLE ROW LEVEL SECURITY;
CREATE POLICY "loyalty_tenant" ON loyalty_points
  FOR ALL USING (tenant_id IN (SELECT tenant_id FROM profiles WHERE id = auth.uid()));

-- ─── Satisfaction surveys ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS satisfaction_surveys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
  customer_id uuid REFERENCES customers(id) ON DELETE CASCADE NOT NULL,
  rating integer CHECK (rating BETWEEN 1 AND 5),
  comment text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE satisfaction_surveys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "surveys_tenant" ON satisfaction_surveys
  FOR ALL USING (tenant_id IN (SELECT tenant_id FROM profiles WHERE id = auth.uid()));

-- ─── Indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_referral_codes_tenant ON referral_codes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_otp_cleanup ON otp_codes(expires_at);
