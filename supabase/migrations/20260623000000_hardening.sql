-- ============================================================
-- SmartLinkNet: Hardening Migration
-- Fixes: RLS tenant isolation, missing indexes, unique constraint
--        on mpesa_callbacks, connection_string on routers
-- NOTE: audit_logs, profiles.is_active already created in migration 001
-- ============================================================

-- 1. Add missing unique index on mpesa_callbacks.checkout_request_id
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE tablename = 'mpesa_callbacks'
      AND indexname = 'idx_mpesa_callbacks_checkout_request_id'
  ) THEN
    CREATE UNIQUE INDEX idx_mpesa_callbacks_checkout_request_id
      ON public.mpesa_callbacks(checkout_request_id)
      WHERE checkout_request_id IS NOT NULL;
  END IF;
END $$;

-- 4. Replace open RLS policies with tenant-scoped ones
-- Helper: get current user's tenant_id
CREATE OR REPLACE FUNCTION public.my_tenant_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT tenant_id FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$;

-- Drop old open policies and recreate with tenant scoping
DO $$ DECLARE pol RECORD; BEGIN
  FOR pol IN
    SELECT policyname, tablename FROM pg_policies
    WHERE schemaname = 'public'
      AND policyname IN (
        'packages_auth','customers_auth','customer_documents_auth',
        'customer_notes_auth','routers_auth','router_backups_auth',
        'subscriptions_auth','wallets_auth','wallet_transactions_auth',
        'invoices_auth','invoice_items_auth','payments_auth',
        'voucher_batches_auth','vouchers_auth','sessions_auth',
        'expenses_auth','inventory_auth','tickets_auth',
        'ticket_messages_auth','installations_auth','sms_logs_auth',
        'settings_auth','notifications_auth'
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, pol.tablename);
  END LOOP;
END $$;

-- Recreate with tenant isolation
CREATE POLICY "packages_tenant"           ON public.packages           TO authenticated USING (tenant_id = public.my_tenant_id()) WITH CHECK (tenant_id = public.my_tenant_id());
CREATE POLICY "customers_tenant"          ON public.customers           TO authenticated USING (tenant_id = public.my_tenant_id()) WITH CHECK (tenant_id = public.my_tenant_id());
CREATE POLICY "customer_documents_tenant" ON public.customer_documents  TO authenticated USING (tenant_id = public.my_tenant_id()) WITH CHECK (tenant_id = public.my_tenant_id());
CREATE POLICY "customer_notes_tenant"     ON public.customer_notes      TO authenticated USING (tenant_id = public.my_tenant_id()) WITH CHECK (tenant_id = public.my_tenant_id());
CREATE POLICY "routers_tenant"            ON public.routers             TO authenticated USING (tenant_id = public.my_tenant_id()) WITH CHECK (tenant_id = public.my_tenant_id());
CREATE POLICY "router_backups_tenant"     ON public.router_backups      TO authenticated USING (tenant_id = public.my_tenant_id()) WITH CHECK (tenant_id = public.my_tenant_id());
CREATE POLICY "subscriptions_tenant"      ON public.subscriptions       TO authenticated USING (tenant_id = public.my_tenant_id()) WITH CHECK (tenant_id = public.my_tenant_id());
CREATE POLICY "wallets_tenant"            ON public.wallets             TO authenticated USING (tenant_id = public.my_tenant_id()) WITH CHECK (tenant_id = public.my_tenant_id());
CREATE POLICY "wallet_txns_tenant"        ON public.wallet_transactions  TO authenticated USING (tenant_id = public.my_tenant_id());
CREATE POLICY "invoices_tenant"           ON public.invoices            TO authenticated USING (tenant_id = public.my_tenant_id()) WITH CHECK (tenant_id = public.my_tenant_id());
CREATE POLICY "invoice_items_tenant"      ON public.invoice_items       TO authenticated
  USING (invoice_id IN (SELECT id FROM public.invoices WHERE tenant_id = public.my_tenant_id()))
  WITH CHECK (invoice_id IN (SELECT id FROM public.invoices WHERE tenant_id = public.my_tenant_id()));
CREATE POLICY "payments_tenant"           ON public.payments            TO authenticated USING (tenant_id = public.my_tenant_id()) WITH CHECK (tenant_id = public.my_tenant_id());
CREATE POLICY "mpesa_callbacks_anon_insert" ON public.mpesa_callbacks   FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "mpesa_callbacks_tenant"    ON public.mpesa_callbacks     FOR SELECT TO authenticated USING (tenant_id = public.my_tenant_id() OR tenant_id IS NULL);
CREATE POLICY "voucher_batches_tenant"    ON public.voucher_batches     TO authenticated USING (tenant_id = public.my_tenant_id()) WITH CHECK (tenant_id = public.my_tenant_id());
CREATE POLICY "vouchers_tenant"           ON public.vouchers            TO authenticated USING (tenant_id = public.my_tenant_id()) WITH CHECK (tenant_id = public.my_tenant_id());
CREATE POLICY "sessions_tenant"           ON public.sessions            TO authenticated USING (tenant_id = public.my_tenant_id()) WITH CHECK (tenant_id = public.my_tenant_id());
CREATE POLICY "expenses_tenant"           ON public.expenses            TO authenticated USING (tenant_id = public.my_tenant_id()) WITH CHECK (tenant_id = public.my_tenant_id());
CREATE POLICY "inventory_tenant"          ON public.inventory           TO authenticated USING (tenant_id = public.my_tenant_id()) WITH CHECK (tenant_id = public.my_tenant_id());
CREATE POLICY "tickets_tenant"            ON public.tickets             TO authenticated USING (tenant_id = public.my_tenant_id()) WITH CHECK (tenant_id = public.my_tenant_id());
CREATE POLICY "ticket_messages_tenant"    ON public.ticket_messages     TO authenticated
  USING (ticket_id IN (SELECT id FROM public.tickets WHERE tenant_id = public.my_tenant_id()))
  WITH CHECK (ticket_id IN (SELECT id FROM public.tickets WHERE tenant_id = public.my_tenant_id()));
CREATE POLICY "installations_tenant"      ON public.installations       TO authenticated USING (tenant_id = public.my_tenant_id()) WITH CHECK (tenant_id = public.my_tenant_id());
CREATE POLICY "sms_logs_tenant"           ON public.sms_logs            TO authenticated USING (tenant_id = public.my_tenant_id());
CREATE POLICY "settings_tenant"           ON public.settings            TO authenticated USING (tenant_id = public.my_tenant_id()) WITH CHECK (tenant_id = public.my_tenant_id());

-- Notifications: user sees their own only
DROP POLICY IF EXISTS "notifications_auth" ON public.notifications;
DROP POLICY IF EXISTS "notifications_self" ON public.notifications;
CREATE POLICY "notifications_own" ON public.notifications
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR user_id IS NULL)
  WITH CHECK (true);

-- 5. Super admin bypass — service_role already has ALL
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'super_admin');
$$;

-- Allow super admin to read all tenants' data for platform-wide analytics
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'tenants' AND policyname = 'tenants_super_read') THEN
    CREATE POLICY "tenants_super_read" ON public.tenants FOR SELECT TO authenticated USING (public.is_super_admin() OR id = public.my_tenant_id());
    CREATE POLICY "tenants_super_write" ON public.tenants FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
  END IF;
END $$;

-- 6. Add missing performance indexes
CREATE INDEX IF NOT EXISTS idx_payments_customer      ON public.payments(customer_id);
CREATE INDEX IF NOT EXISTS idx_payments_status        ON public.payments(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status   ON public.subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_expires  ON public.subscriptions(expires_at) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_sessions_active        ON public.sessions(tenant_id, ended_at) WHERE ended_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tickets_status         ON public.tickets(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_vouchers_status        ON public.vouchers(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_vouchers_code_lookup   ON public.vouchers(code) WHERE status = 'unused';

-- 7. Fix wallet function to be safe with missing wallet
CREATE OR REPLACE FUNCTION public.fn_wallet_credit(
  _customer_id UUID,
  _tenant_id   UUID,
  _amount      NUMERIC,
  _description TEXT    DEFAULT 'Credit',
  _reference   TEXT    DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _wallet_id   UUID;
  _new_balance NUMERIC;
BEGIN
  -- Upsert wallet
  INSERT INTO public.wallets (tenant_id, customer_id, balance)
  VALUES (_tenant_id, _customer_id, 0)
  ON CONFLICT (customer_id) DO NOTHING;

  -- Lock row and compute new balance
  SELECT id, balance + _amount
  INTO   _wallet_id, _new_balance
  FROM   public.wallets
  WHERE  customer_id = _customer_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Wallet not found for customer %', _customer_id;
  END IF;

  UPDATE public.wallets SET balance = _new_balance, updated_at = now() WHERE id = _wallet_id;

  INSERT INTO public.wallet_transactions
    (tenant_id, wallet_id, customer_id, type, amount, balance_after, description, reference)
  VALUES
    (_tenant_id, _wallet_id, _customer_id, 'credit', _amount, _new_balance, _description, _reference);
END;
$$;
GRANT EXECUTE ON FUNCTION public.fn_wallet_credit(UUID, UUID, NUMERIC, TEXT, TEXT) TO authenticated;

-- 8. SLA breach auto-flag trigger
CREATE OR REPLACE FUNCTION public.tg_check_sla_breach()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status NOT IN ('resolved', 'closed') THEN
    NEW.sla_breached := (
      EXTRACT(EPOCH FROM (now() - NEW.created_at)) / 3600 > NEW.sla_hours
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ticket_sla ON public.tickets;
CREATE TRIGGER trg_ticket_sla
  BEFORE UPDATE ON public.tickets
  FOR EACH ROW EXECUTE FUNCTION public.tg_check_sla_breach();

-- 9. Subscription expiry cron-ready view
CREATE OR REPLACE VIEW public.vw_expiring_subscriptions AS
  SELECT s.*, c.full_name, c.phone, c.email, t.name AS tenant_name
  FROM   public.subscriptions s
  JOIN   public.customers c ON c.id = s.customer_id
  JOIN   public.tenants   t ON t.id = s.tenant_id
  WHERE  s.status = 'active'
    AND  s.expires_at BETWEEN now() AND now() + INTERVAL '7 days';
-- 10. Add connection_string to routers for network-agnostic adapter support
ALTER TABLE public.routers ADD COLUMN IF NOT EXISTS connection_string TEXT;
COMMENT ON COLUMN public.routers.connection_string IS
  'Optional: hostname/FQDN/proxy URL to reach the router API. Takes precedence over ip_address when set.';
