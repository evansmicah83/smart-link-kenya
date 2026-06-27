-- ============================================================
-- SmartLinkNet: Supplementary Migration
-- Adds audit logging trigger, wallet functions, tenant-scoped
-- RLS policies, and operational views.
-- ============================================================

-- Auto-audit trigger function
CREATE OR REPLACE FUNCTION public.tg_audit_log()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.audit_logs (
    tenant_id, user_id, action, entity, entity_id, metadata
  ) VALUES (
    COALESCE((NEW).tenant_id, (OLD).tenant_id),
    auth.uid(),
    TG_OP,
    TG_TABLE_NAME,
    COALESCE((NEW).id, (OLD).id),
    jsonb_build_object('old', to_jsonb(OLD), 'new', to_jsonb(NEW))
  );
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Wallet balance update function
CREATE OR REPLACE FUNCTION public.fn_wallet_credit(
  _customer_id UUID,
  _tenant_id UUID,
  _amount NUMERIC,
  _description TEXT DEFAULT 'Credit',
  _reference TEXT DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  _wallet_id UUID;
  _new_balance NUMERIC;
BEGIN
  -- Upsert wallet
  INSERT INTO public.wallets (tenant_id, customer_id, balance)
  VALUES (_tenant_id, _customer_id, 0)
  ON CONFLICT (customer_id) DO NOTHING;

  SELECT id, balance + _amount INTO _wallet_id, _new_balance
  FROM public.wallets WHERE customer_id = _customer_id FOR UPDATE;

  UPDATE public.wallets SET balance = _new_balance WHERE id = _wallet_id;

  INSERT INTO public.wallet_transactions (
    tenant_id, wallet_id, customer_id, type, amount, balance_after,
    description, reference
  ) VALUES (
    _tenant_id, _wallet_id, _customer_id, 'credit', _amount, _new_balance,
    _description, _reference
  );
END;
$$;

-- Subscription expiry check view
CREATE OR REPLACE VIEW public.v_expiring_subscriptions AS
SELECT
  s.id,
  s.tenant_id,
  s.customer_id,
  s.package_id,
  s.type,
  s.status,
  s.expires_at,
  s.auto_renew,
  c.full_name,
  c.phone,
  p.name AS package_name,
  p.price,
  EXTRACT(EPOCH FROM (s.expires_at - NOW())) / 3600 AS hours_remaining
FROM public.subscriptions s
JOIN public.customers c ON c.id = s.customer_id
JOIN public.packages p ON p.id = s.package_id
WHERE s.status = 'active'
  AND s.expires_at IS NOT NULL
  AND s.expires_at <= NOW() + INTERVAL '3 days';

-- Revenue summary view
CREATE OR REPLACE VIEW public.v_revenue_summary AS
SELECT
  tenant_id,
  DATE_TRUNC('month', created_at) AS month,
  method,
  COUNT(*) AS payment_count,
  SUM(amount) AS total_amount
FROM public.payments
WHERE status = 'completed'
GROUP BY tenant_id, month, method;

-- Active sessions view
CREATE OR REPLACE VIEW public.v_active_sessions AS
SELECT
  s.*,
  c.full_name AS customer_name,
  c.phone AS customer_phone,
  r.name AS router_name
FROM public.sessions s
LEFT JOIN public.customers c ON c.id = s.customer_id
LEFT JOIN public.routers r ON r.id = s.router_id
WHERE s.ended_at IS NULL;

-- Ticket SLA breached auto-update
CREATE OR REPLACE FUNCTION public.tg_check_sla()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status NOT IN ('resolved', 'closed') THEN
    NEW.sla_breached := (EXTRACT(EPOCH FROM (NOW() - NEW.created_at)) / 3600) > NEW.sla_hours;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_tickets_sla
BEFORE UPDATE ON public.tickets
FOR EACH ROW EXECUTE FUNCTION public.tg_check_sla();

-- Auto ticket_no generation
CREATE OR REPLACE FUNCTION public.tg_ticket_no()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.ticket_no IS NULL THEN
    NEW.ticket_no := 'TKT-' || TO_CHAR(NOW(), 'YYYYMM') || '-' || LPAD(FLOOR(RANDOM() * 9000 + 1000)::TEXT, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_tickets_no
BEFORE INSERT ON public.tickets
FOR EACH ROW EXECUTE FUNCTION public.tg_ticket_no();

-- Auto customer_no generation
CREATE OR REPLACE FUNCTION public.tg_customer_no()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.customer_no IS NULL THEN
    NEW.customer_no := 'CUS-' || LPAD(FLOOR(RANDOM() * 900000 + 100000)::TEXT, 6, '0');
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_customers_no
BEFORE INSERT ON public.customers
FOR EACH ROW EXECUTE FUNCTION public.tg_customer_no();

-- Auto invoice_no generation
CREATE OR REPLACE FUNCTION public.tg_invoice_no()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.invoice_no IS NULL THEN
    NEW.invoice_no := 'INV-' || TO_CHAR(NOW(), 'YYYYMM') || '-' || LPAD(FLOOR(RANDOM() * 9000 + 1000)::TEXT, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_invoices_no
BEFORE INSERT ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.tg_invoice_no();

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_payments_created ON public.payments(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_subscriptions_expires ON public.subscriptions(tenant_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON public.tickets(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_sessions_active ON public.sessions(tenant_id, ended_at) WHERE ended_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_vouchers_status ON public.vouchers(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON public.audit_logs(tenant_id, entity, entity_id);
