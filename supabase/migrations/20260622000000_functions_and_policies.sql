-- ============================================================
-- SmartLinkNet: Safe idempotent re-apply migration
-- Run this in Supabase SQL Editor if tables are missing
-- ============================================================

-- Wallet credit function (safe if already exists)
CREATE OR REPLACE FUNCTION public.fn_wallet_credit(
  _customer_id UUID,
  _tenant_id UUID,
  _amount NUMERIC,
  _description TEXT DEFAULT 'Credit',
  _reference TEXT DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _wallet_id UUID;
  _new_balance NUMERIC;
BEGIN
  INSERT INTO public.wallets (tenant_id, customer_id, balance)
  VALUES (_tenant_id, _customer_id, 0)
  ON CONFLICT (customer_id) DO NOTHING;

  SELECT id, balance + _amount INTO _wallet_id, _new_balance
  FROM public.wallets WHERE customer_id = _customer_id FOR UPDATE;

  UPDATE public.wallets SET balance = _new_balance, updated_at = now() WHERE id = _wallet_id;

  INSERT INTO public.wallet_transactions (
    tenant_id, wallet_id, customer_id, type, amount, balance_after, description, reference
  ) VALUES (
    _tenant_id, _wallet_id, _customer_id, 'credit', _amount, _new_balance, _description, _reference
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_wallet_credit(UUID, UUID, NUMERIC, TEXT, TEXT) TO authenticated;

-- Wallet debit function
CREATE OR REPLACE FUNCTION public.fn_wallet_debit(
  _customer_id UUID,
  _tenant_id UUID,
  _amount NUMERIC,
  _description TEXT DEFAULT 'Debit',
  _reference TEXT DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _wallet_id UUID;
  _current_balance NUMERIC;
  _new_balance NUMERIC;
BEGIN
  SELECT id, balance INTO _wallet_id, _current_balance
  FROM public.wallets WHERE customer_id = _customer_id FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Wallet not found for customer'; END IF;
  IF _current_balance < _amount THEN RAISE EXCEPTION 'Insufficient wallet balance'; END IF;

  _new_balance := _current_balance - _amount;
  UPDATE public.wallets SET balance = _new_balance, updated_at = now() WHERE id = _wallet_id;

  INSERT INTO public.wallet_transactions (
    tenant_id, wallet_id, customer_id, type, amount, balance_after, description, reference
  ) VALUES (
    _tenant_id, _wallet_id, _customer_id, 'debit', _amount, _new_balance, _description, _reference
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_wallet_debit(UUID, UUID, NUMERIC, TEXT, TEXT) TO authenticated;

-- has_role with correct signature expected by types
CREATE OR REPLACE FUNCTION public.has_role(
  _role public.app_role,
  _user_id UUID
) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

-- Notification helper
CREATE OR REPLACE FUNCTION public.fn_notify(
  _tenant_id UUID,
  _user_id UUID,
  _title TEXT,
  _message TEXT,
  _type TEXT DEFAULT 'info'
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.notifications (tenant_id, user_id, title, message, type)
  VALUES (_tenant_id, _user_id, _title, _message, _type);
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_notify(UUID, UUID, TEXT, TEXT, TEXT) TO service_role;

-- Auto-expiry subscription job (call via pg_cron or scheduled edge function)
CREATE OR REPLACE FUNCTION public.fn_expire_subscriptions()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.subscriptions
  SET status = 'expired'
  WHERE status = 'active'
    AND expires_at IS NOT NULL
    AND expires_at < now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_expire_subscriptions() TO service_role;

-- Ensure notifications table has correct policy
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'notifications' AND policyname = 'notifications_self'
  ) THEN
    CREATE POLICY "notifications_self" ON public.notifications
      FOR ALL USING (user_id = auth.uid() OR user_id IS NULL)
      WITH CHECK (true);
  END IF;
END $$;
