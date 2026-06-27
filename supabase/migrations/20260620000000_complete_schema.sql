-- SmartLinkNet Complete Schema Migration

-- PACKAGES
CREATE TABLE public.packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL DEFAULT 'hotspot',
  billing_type TEXT NOT NULL DEFAULT 'prepaid',
  duration_days INTEGER NOT NULL DEFAULT 30,
  data_limit_mb BIGINT,
  speed_down_kbps INTEGER NOT NULL DEFAULT 1024,
  speed_up_kbps INTEGER NOT NULL DEFAULT 512,
  price NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'KES',
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_promotional BOOLEAN NOT NULL DEFAULT false,
  promo_ends_at TIMESTAMPTZ,
  burst_speed_kbps INTEGER,
  fair_use_mb BIGINT,
  shared_users INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.packages TO authenticated;
GRANT ALL ON public.packages TO service_role;
ALTER TABLE public.packages ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_packages_updated BEFORE UPDATE ON public.packages FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- CUSTOMERS
CREATE TABLE public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  full_name TEXT NOT NULL,
  email TEXT,
  phone TEXT NOT NULL,
  alt_phone TEXT,
  national_id TEXT,
  passport_no TEXT,
  kra_pin TEXT,
  gender TEXT,
  date_of_birth DATE,
  address TEXT,
  city TEXT,
  county TEXT,
  gps_lat DOUBLE PRECISION,
  gps_lng DOUBLE PRECISION,
  status TEXT NOT NULL DEFAULT 'active',
  category TEXT NOT NULL DEFAULT 'residential',
  customer_no TEXT,
  notes TEXT,
  credit_limit NUMERIC(12,2) DEFAULT 0,
  balance NUMERIC(12,2) DEFAULT 0,
  referred_by UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.customers TO authenticated;
GRANT ALL ON public.customers TO service_role;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_customers_tenant ON public.customers(tenant_id);
CREATE INDEX idx_customers_phone ON public.customers(phone);
CREATE TRIGGER trg_customers_updated BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- CUSTOMER DOCUMENTS
CREATE TABLE public.customer_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_name TEXT,
  uploaded_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.customer_documents TO authenticated;
GRANT ALL ON public.customer_documents TO service_role;
ALTER TABLE public.customer_documents ENABLE ROW LEVEL SECURITY;

-- CUSTOMER NOTES
CREATE TABLE public.customer_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  note TEXT NOT NULL,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.customer_notes TO authenticated;
GRANT ALL ON public.customer_notes TO service_role;
ALTER TABLE public.customer_notes ENABLE ROW LEVEL SECURITY;

-- ROUTERS
CREATE TABLE public.routers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  model TEXT,
  vendor TEXT NOT NULL DEFAULT 'mikrotik',
  firmware_version TEXT,
  serial_number TEXT,
  mac_address TEXT,
  ip_address TEXT,
  api_port INTEGER DEFAULT 8728,
  api_ssl_port INTEGER DEFAULT 8729,
  api_username TEXT,
  api_password TEXT,
  use_ssl BOOLEAN DEFAULT false,
  location TEXT,
  gps_lat DOUBLE PRECISION,
  gps_lng DOUBLE PRECISION,
  status TEXT NOT NULL DEFAULT 'offline',
  last_seen TIMESTAMPTZ,
  uptime TEXT,
  cpu_load INTEGER,
  memory_used INTEGER,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.routers TO authenticated;
GRANT ALL ON public.routers TO service_role;
ALTER TABLE public.routers ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_routers_tenant ON public.routers(tenant_id);
CREATE TRIGGER trg_routers_updated BEFORE UPDATE ON public.routers FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ROUTER BACKUPS
CREATE TABLE public.router_backups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  router_id UUID NOT NULL REFERENCES public.routers(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  file_url TEXT,
  file_name TEXT,
  size_bytes BIGINT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.router_backups TO authenticated;
GRANT ALL ON public.router_backups TO service_role;
ALTER TABLE public.router_backups ENABLE ROW LEVEL SECURITY;

-- SUBSCRIPTIONS
CREATE TABLE public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  package_id UUID NOT NULL REFERENCES public.packages(id),
  router_id UUID REFERENCES public.routers(id) ON DELETE SET NULL,
  branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  type TEXT NOT NULL DEFAULT 'hotspot',
  status TEXT NOT NULL DEFAULT 'active',
  username TEXT,
  password TEXT,
  mac_address TEXT,
  ip_address TEXT,
  starts_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  auto_renew BOOLEAN DEFAULT false,
  data_used_mb BIGINT DEFAULT 0,
  last_connected TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_subscriptions_tenant ON public.subscriptions(tenant_id);
CREATE INDEX idx_subscriptions_customer ON public.subscriptions(customer_id);
CREATE TRIGGER trg_subscriptions_updated BEFORE UPDATE ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- WALLETS
CREATE TABLE public.wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  balance NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'KES',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(customer_id)
);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.wallets TO authenticated;
GRANT ALL ON public.wallets TO service_role;
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_wallets_updated BEFORE UPDATE ON public.wallets FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- WALLET TRANSACTIONS
CREATE TABLE public.wallet_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  wallet_id UUID NOT NULL REFERENCES public.wallets(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  balance_after NUMERIC(12,2) NOT NULL,
  reference TEXT,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT,INSERT ON public.wallet_transactions TO authenticated;
GRANT ALL ON public.wallet_transactions TO service_role;
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;

-- INVOICES
CREATE TABLE public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  invoice_no TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'unpaid',
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  amount_paid NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'KES',
  due_date DATE,
  paid_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.invoices TO authenticated;
GRANT ALL ON public.invoices TO service_role;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_invoices_tenant ON public.invoices(tenant_id);
CREATE INDEX idx_invoices_customer ON public.invoices(customer_id);
CREATE TRIGGER trg_invoices_updated BEFORE UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- INVOICE ITEMS
CREATE TABLE public.invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price NUMERIC(12,2) NOT NULL,
  total NUMERIC(12,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.invoice_items TO authenticated;
GRANT ALL ON public.invoice_items TO service_role;
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;

-- PAYMENTS
CREATE TABLE public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
  amount NUMERIC(12,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'KES',
  method TEXT NOT NULL DEFAULT 'mpesa',
  status TEXT NOT NULL DEFAULT 'pending',
  reference TEXT,
  mpesa_receipt TEXT,
  phone TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_payments_tenant ON public.payments(tenant_id);
CREATE INDEX idx_payments_reference ON public.payments(reference);
CREATE TRIGGER trg_payments_updated BEFORE UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- MPESA CALLBACKS
CREATE TABLE public.mpesa_callbacks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE SET NULL,
  checkout_request_id TEXT,
  merchant_request_id TEXT,
  result_code INTEGER,
  result_desc TEXT,
  amount NUMERIC(12,2),
  mpesa_receipt TEXT,
  phone TEXT,
  transaction_date TEXT,
  raw_payload JSONB,
  processed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT INSERT ON public.mpesa_callbacks TO anon;
GRANT SELECT,INSERT,UPDATE ON public.mpesa_callbacks TO authenticated;
GRANT ALL ON public.mpesa_callbacks TO service_role;
ALTER TABLE public.mpesa_callbacks ENABLE ROW LEVEL SECURITY;

-- VOUCHER BATCHES
CREATE TABLE public.voucher_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  router_id UUID REFERENCES public.routers(id) ON DELETE SET NULL,
  package_id UUID REFERENCES public.packages(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  prefix TEXT,
  quantity INTEGER NOT NULL DEFAULT 10,
  generated INTEGER NOT NULL DEFAULT 0,
  used INTEGER NOT NULL DEFAULT 0,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.voucher_batches TO authenticated;
GRANT ALL ON public.voucher_batches TO service_role;
ALTER TABLE public.voucher_batches ENABLE ROW LEVEL SECURITY;

-- VOUCHERS
CREATE TABLE public.vouchers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  batch_id UUID REFERENCES public.voucher_batches(id) ON DELETE SET NULL,
  router_id UUID REFERENCES public.routers(id) ON DELETE SET NULL,
  package_id UUID REFERENCES public.packages(id) ON DELETE SET NULL,
  code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'unused',
  used_by UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, code)
);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.vouchers TO authenticated;
GRANT ALL ON public.vouchers TO service_role;
ALTER TABLE public.vouchers ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_vouchers_code ON public.vouchers(tenant_id, code);

-- SESSIONS
CREATE TABLE public.sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  router_id UUID REFERENCES public.routers(id) ON DELETE SET NULL,
  subscription_id UUID REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  username TEXT,
  ip_address TEXT,
  mac_address TEXT,
  bytes_in BIGINT DEFAULT 0,
  bytes_out BIGINT DEFAULT 0,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  terminated_by TEXT
);
GRANT SELECT,INSERT,UPDATE ON public.sessions TO authenticated;
GRANT ALL ON public.sessions TO service_role;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_sessions_tenant ON public.sessions(tenant_id);

-- EXPENSES
CREATE TABLE public.expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'KES',
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  receipt_url TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.expenses TO authenticated;
GRANT ALL ON public.expenses TO service_role;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_expenses_updated BEFORE UPDATE ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- INVENTORY
CREATE TABLE public.inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  sku TEXT,
  serial_number TEXT,
  quantity INTEGER NOT NULL DEFAULT 0,
  unit_cost NUMERIC(12,2) DEFAULT 0,
  reorder_level INTEGER DEFAULT 5,
  location TEXT,
  status TEXT NOT NULL DEFAULT 'available',
  assigned_to UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.inventory TO authenticated;
GRANT ALL ON public.inventory TO service_role;
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_inventory_updated BEFORE UPDATE ON public.inventory FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- TICKETS
CREATE TABLE public.tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ticket_no TEXT NOT NULL,
  subject TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL DEFAULT 'support',
  priority TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'open',
  sla_hours INTEGER DEFAULT 24,
  sla_breached BOOLEAN DEFAULT false,
  resolved_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  rating INTEGER CHECK (rating BETWEEN 1 AND 5),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.tickets TO authenticated;
GRANT ALL ON public.tickets TO service_role;
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_tickets_tenant ON public.tickets(tenant_id);
CREATE TRIGGER trg_tickets_updated BEFORE UPDATE ON public.tickets FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- TICKET MESSAGES
CREATE TABLE public.ticket_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES auth.users(id),
  message TEXT NOT NULL,
  is_internal BOOLEAN DEFAULT false,
  attachments JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT,INSERT ON public.ticket_messages TO authenticated;
GRANT ALL ON public.ticket_messages TO service_role;
ALTER TABLE public.ticket_messages ENABLE ROW LEVEL SECURITY;

-- INSTALLATIONS
CREATE TABLE public.installations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  type TEXT NOT NULL DEFAULT 'fiber',
  status TEXT NOT NULL DEFAULT 'pending',
  scheduled_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  address TEXT,
  gps_lat DOUBLE PRECISION,
  gps_lng DOUBLE PRECISION,
  notes TEXT,
  cost NUMERIC(12,2) DEFAULT 0,
  photos JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.installations TO authenticated;
GRANT ALL ON public.installations TO service_role;
ALTER TABLE public.installations ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_installations_updated BEFORE UPDATE ON public.installations FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- NOTIFICATIONS
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'info',
  read BOOLEAN DEFAULT false,
  link TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT,INSERT,UPDATE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_notifications_user ON public.notifications(user_id, read);

-- SMS LOGS
CREATE TABLE public.sms_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  phone TEXT NOT NULL,
  message TEXT NOT NULL,
  provider TEXT DEFAULT 'africastalking',
  status TEXT DEFAULT 'sent',
  cost NUMERIC(8,4),
  reference TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT,INSERT ON public.sms_logs TO authenticated;
GRANT ALL ON public.sms_logs TO service_role;
ALTER TABLE public.sms_logs ENABLE ROW LEVEL SECURITY;

-- SETTINGS
CREATE TABLE public.settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, key)
);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.settings TO authenticated;
GRANT ALL ON public.settings TO service_role;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_settings_updated BEFORE UPDATE ON public.settings FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- RLS POLICIES
CREATE POLICY "packages_auth" ON public.packages TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "customers_auth" ON public.customers TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "customer_documents_auth" ON public.customer_documents TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "customer_notes_auth" ON public.customer_notes TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "routers_auth" ON public.routers TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "router_backups_auth" ON public.router_backups TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "subscriptions_auth" ON public.subscriptions TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "wallets_auth" ON public.wallets TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "wallet_transactions_auth" ON public.wallet_transactions TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "invoices_auth" ON public.invoices TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "invoice_items_auth" ON public.invoice_items TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "payments_auth" ON public.payments TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "mpesa_callbacks_anon_insert" ON public.mpesa_callbacks FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "mpesa_callbacks_auth" ON public.mpesa_callbacks TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "voucher_batches_auth" ON public.voucher_batches TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "vouchers_auth" ON public.vouchers TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "sessions_auth" ON public.sessions TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "expenses_auth" ON public.expenses TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "inventory_auth" ON public.inventory TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "tickets_auth" ON public.tickets TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "ticket_messages_auth" ON public.ticket_messages TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "installations_auth" ON public.installations TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "notifications_auth" ON public.notifications TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "sms_logs_auth" ON public.sms_logs TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "settings_auth" ON public.settings TO authenticated USING (true) WITH CHECK (true);
