-- ============================================================
-- SmartLinkNet: Remaining Gaps Migration
-- WhatsApp logs, email branding fields, branch reports,
-- agent commissions, auto-notifications triggers
-- ============================================================

-- ─── Email branding fields on tenant_branding ─────────────────────────────────
ALTER TABLE IF EXISTS tenant_branding
  ADD COLUMN IF NOT EXISTS email_from_name text,
  ADD COLUMN IF NOT EXISTS email_from_address text,
  ADD COLUMN IF NOT EXISTS whatsapp_template_payment text,
  ADD COLUMN IF NOT EXISTS whatsapp_template_expiry text,
  ADD COLUMN IF NOT EXISTS whatsapp_template_welcome text;

-- ─── WhatsApp send logs ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS whatsapp_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  phone text NOT NULL,
  message text NOT NULL,
  template text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed')),
  provider text DEFAULT 'whatsapp_business',
  error text,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_whatsapp_logs_tenant ON whatsapp_logs(tenant_id, created_at DESC);

-- ─── Agent commissions ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agent_commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
  agent_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  payment_id uuid REFERENCES payments(id) ON DELETE SET NULL,
  amount numeric NOT NULL DEFAULT 0,
  rate_percent numeric NOT NULL DEFAULT 5,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','cancelled')),
  notes text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE agent_commissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "commissions_tenant" ON agent_commissions
  FOR ALL USING (tenant_id IN (SELECT tenant_id FROM profiles WHERE id = auth.uid()));
CREATE INDEX IF NOT EXISTS idx_commissions_tenant ON agent_commissions(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_commissions_agent ON agent_commissions(agent_id);

-- ─── Campaign analytics ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  type text NOT NULL DEFAULT 'sms' CHECK (type IN ('sms','whatsapp','email')),
  target_audience text NOT NULL DEFAULT 'all',
  message text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','scheduled')),
  sent_count integer NOT NULL DEFAULT 0,
  delivered_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  scheduled_at timestamptz,
  sent_at timestamptz,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "campaigns_tenant" ON campaigns
  FOR ALL USING (tenant_id IN (SELECT tenant_id FROM profiles WHERE id = auth.uid()));
CREATE INDEX IF NOT EXISTS idx_campaigns_tenant ON campaigns(tenant_id, created_at DESC);

-- ─── Ticket notifications: add notified_at to tickets ────────────────────────
ALTER TABLE IF EXISTS tickets
  ADD COLUMN IF NOT EXISTS customer_notified_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_status_change timestamptz;

-- ─── Installation SMS: add notified_at to installations ──────────────────────
ALTER TABLE IF EXISTS installations
  ADD COLUMN IF NOT EXISTS customer_notified_at timestamptz;

-- ─── Branch filter on reports: ensure branch_id on subscriptions ─────────────
ALTER TABLE IF EXISTS subscriptions
  ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES branches(id) ON DELETE SET NULL;

-- ─── Auto-renew flag on subscriptions ────────────────────────────────────────
ALTER TABLE IF EXISTS subscriptions
  ADD COLUMN IF NOT EXISTS auto_renew boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_renew_payment_method text DEFAULT 'mpesa',
  ADD COLUMN IF NOT EXISTS auto_renew_phone text;

-- ─── Indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_whatsapp_logs_tenant ON whatsapp_logs(tenant_id) ON CONFLICT DO NOTHING;
CREATE INDEX IF NOT EXISTS idx_subscriptions_branch ON subscriptions(branch_id) WHERE branch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_subscriptions_auto_renew ON subscriptions(tenant_id, auto_renew, expires_at) WHERE auto_renew = true;
