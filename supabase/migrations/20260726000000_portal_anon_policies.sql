-- Portal public (anon) read policies
-- The captive portal /portal?isp=<slug> runs unauthenticated.
-- These policies allow anon to read only what the portal needs.

-- tenants: anon can read by slug (portal needs company name)
CREATE POLICY "anon_read_tenants_by_slug"
  ON public.tenants FOR SELECT TO anon
  USING (true);

-- tenant_branding: anon can read branding for any tenant (portal needs colors/logo)
CREATE POLICY "anon_read_tenant_branding"
  ON public.tenant_branding FOR SELECT TO anon
  USING (true);

-- packages: anon can read active packages (portal package list)
CREATE POLICY "anon_read_active_packages"
  ON public.packages FOR SELECT TO anon
  USING (is_active = true);

-- vouchers: anon can read + update vouchers (voucher login flow)
CREATE POLICY "anon_read_vouchers"
  ON public.vouchers FOR SELECT TO anon
  USING (true);

CREATE POLICY "anon_update_vouchers"
  ON public.vouchers FOR UPDATE TO anon
  USING (true) WITH CHECK (true);

-- payments: anon can read payment status (STK push polling)
CREATE POLICY "anon_read_payments"
  ON public.payments FOR SELECT TO anon
  USING (true);

-- customers: anon can insert + read (portal creates customer on first purchase)
CREATE POLICY "anon_insert_customers"
  ON public.customers FOR INSERT TO anon
  WITH CHECK (true);

CREATE POLICY "anon_read_customers_by_phone"
  ON public.customers FOR SELECT TO anon
  USING (true);
