-- ============================================================
-- SmartLinkNet Enterprise Upgrade Migration
-- AAA++, HA++, Fraud Detection, Provisioning Engine,
-- Customer Portal, Advanced NOC, Observability, Automation++
-- ============================================================

-- ============================================================
-- FRAUD DETECTION TABLES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.fraud_incidents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  customer_id     UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  session_id      UUID REFERENCES public.sessions(id) ON DELETE SET NULL,
  type            TEXT NOT NULL CHECK (type IN (
    'mac_cloning','account_sharing','concurrent_login','session_hijack',
    'credential_stuffing','payment_fraud','voucher_abuse','geo_anomaly',
    'device_fingerprint','suspicious_auth','brute_force'
  )),
  severity        TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low','medium','high','critical')),
  status          TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','investigating','resolved','dismissed')),
  description     TEXT NOT NULL,
  evidence        JSONB DEFAULT '{}',
  ip_address      TEXT,
  mac_address     TEXT,
  device_fingerprint TEXT,
  action_taken    TEXT,
  resolved_at     TIMESTAMPTZ,
  resolved_by     UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fraud_tenant ON public.fraud_incidents(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_fraud_customer ON public.fraud_incidents(customer_id);
CREATE INDEX IF NOT EXISTS idx_fraud_type ON public.fraud_incidents(type, severity);
GRANT SELECT,INSERT,UPDATE ON public.fraud_incidents TO authenticated;
GRANT ALL ON public.fraud_incidents TO service_role;
ALTER TABLE public.fraud_incidents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fraud_incidents_tenant" ON public.fraud_incidents
  TO authenticated USING (tenant_id = public.my_tenant_id()) WITH CHECK (tenant_id = public.my_tenant_id());

-- Device fingerprint tracking for fraud
CREATE TABLE IF NOT EXISTS public.device_fingerprints (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  customer_id     UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  fingerprint     TEXT NOT NULL,
  mac_address     TEXT,
  user_agent      TEXT,
  ip_address      TEXT,
  last_seen       TIMESTAMPTZ NOT NULL DEFAULT now(),
  seen_count      INTEGER NOT NULL DEFAULT 1,
  is_trusted      BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fingerprints_tenant ON public.device_fingerprints(tenant_id, fingerprint);
CREATE INDEX IF NOT EXISTS idx_fingerprints_mac ON public.device_fingerprints(mac_address) WHERE mac_address IS NOT NULL;
GRANT SELECT,INSERT,UPDATE ON public.device_fingerprints TO authenticated;
GRANT ALL ON public.device_fingerprints TO service_role;
ALTER TABLE public.device_fingerprints ENABLE ROW LEVEL SECURITY;
CREATE POLICY "device_fingerprints_tenant" ON public.device_fingerprints
  TO authenticated USING (tenant_id = public.my_tenant_id()) WITH CHECK (tenant_id = public.my_tenant_id());

-- ============================================================
-- ADVANCED NOC — UPTIME TRACKING
-- ============================================================
CREATE TABLE IF NOT EXISTS public.router_uptime_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  router_id   UUID NOT NULL REFERENCES public.routers(id) ON DELETE CASCADE,
  tenant_id   UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  status      TEXT NOT NULL CHECK (status IN ('online','offline','degraded')),
  cpu_load    INTEGER,
  memory_used INTEGER,
  latency_ms  INTEGER,
  packet_loss NUMERIC(5,2),
  checked_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_router_uptime_router ON public.router_uptime_logs(router_id, checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_router_uptime_tenant ON public.router_uptime_logs(tenant_id, checked_at DESC);
GRANT INSERT,SELECT ON public.router_uptime_logs TO authenticated;
GRANT ALL ON public.router_uptime_logs TO service_role;
ALTER TABLE public.router_uptime_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "router_uptime_tenant" ON public.router_uptime_logs
  FOR SELECT TO authenticated USING (tenant_id = public.my_tenant_id());

-- NOC alert rules
CREATE TABLE IF NOT EXISTS public.alert_rules (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  metric          TEXT NOT NULL CHECK (metric IN (
    'router_offline','router_cpu','router_memory','router_latency',
    'packet_loss','active_sessions_drop','payment_failure_rate',
    'radius_unavailable','sms_failure_rate','failed_auths'
  )),
  operator        TEXT NOT NULL CHECK (operator IN ('gt','lt','gte','lte','eq','ne')),
  threshold       NUMERIC NOT NULL,
  severity        TEXT NOT NULL DEFAULT 'warning' CHECK (severity IN ('info','warning','critical')),
  notify_channels TEXT[] NOT NULL DEFAULT '{email}',
  notify_users    UUID[],
  cooldown_mins   INTEGER NOT NULL DEFAULT 15,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  last_fired      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.alert_rules TO authenticated;
GRANT ALL ON public.alert_rules TO service_role;
ALTER TABLE public.alert_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "alert_rules_tenant" ON public.alert_rules
  TO authenticated USING (tenant_id = public.my_tenant_id()) WITH CHECK (tenant_id = public.my_tenant_id());

-- Alert history
CREATE TABLE IF NOT EXISTS public.alert_history (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  rule_id     UUID REFERENCES public.alert_rules(id) ON DELETE SET NULL,
  metric      TEXT NOT NULL,
  value       NUMERIC,
  message     TEXT NOT NULL,
  severity    TEXT NOT NULL,
  resolved_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_alert_history_tenant ON public.alert_history(tenant_id, created_at DESC);
GRANT SELECT,INSERT,UPDATE ON public.alert_history TO authenticated;
GRANT ALL ON public.alert_history TO service_role;
ALTER TABLE public.alert_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "alert_history_tenant" ON public.alert_history
  FOR SELECT TO authenticated USING (tenant_id = public.my_tenant_id());

-- ============================================================
-- ADVANCED PROVISIONING ENGINE
-- ============================================================
ALTER TABLE public.provisioning_workflows
  ADD COLUMN IF NOT EXISTS trigger_source TEXT DEFAULT 'system',
  ADD COLUMN IF NOT EXISTS trigger_entity_id UUID,
  ADD COLUMN IF NOT EXISTS trigger_entity_type TEXT,
  ADD COLUMN IF NOT EXISTS last_step_error TEXT,
  ADD COLUMN IF NOT EXISTS notified BOOLEAN NOT NULL DEFAULT false;

-- Provisioning step definitions
CREATE TABLE IF NOT EXISTS public.provisioning_steps (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id     UUID NOT NULL REFERENCES public.provisioning_workflows(id) ON DELETE CASCADE,
  step_order      INTEGER NOT NULL,
  step_name       TEXT NOT NULL,
  step_type       TEXT NOT NULL CHECK (step_type IN (
    'verify_payment','create_subscription','generate_invoice',
    'update_radius','activate_router_user','suspend_router_user',
    'send_sms','send_email','create_audit_log','update_customer_status',
    'check_grace_period','debit_wallet','credit_wallet','notify_admin','custom'
  )),
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','completed','failed','skipped')),
  input_data      JSONB DEFAULT '{}',
  output_data     JSONB DEFAULT '{}',
  error           TEXT,
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_prov_steps_workflow ON public.provisioning_steps(workflow_id, step_order);
GRANT SELECT,INSERT,UPDATE ON public.provisioning_steps TO authenticated;
GRANT ALL ON public.provisioning_steps TO service_role;
ALTER TABLE public.provisioning_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "prov_steps_tenant" ON public.provisioning_steps
  TO authenticated USING (
    EXISTS (SELECT 1 FROM public.provisioning_workflows w WHERE w.id = workflow_id AND w.tenant_id = public.my_tenant_id())
  );

-- ============================================================
-- CUSTOMER SELF-SERVICE PORTAL
-- ============================================================
CREATE TABLE IF NOT EXISTS public.customer_portal_sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  customer_id     UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  token           TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  ip_address      TEXT,
  user_agent      TEXT,
  expires_at      TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '24 hours'),
  last_activity   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_portal_sessions_customer ON public.customer_portal_sessions(customer_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_portal_sessions_token ON public.customer_portal_sessions(token);
GRANT SELECT,INSERT,UPDATE ON public.customer_portal_sessions TO authenticated;
GRANT ALL ON public.customer_portal_sessions TO service_role;
ALTER TABLE public.customer_portal_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "portal_sessions_tenant" ON public.customer_portal_sessions
  TO authenticated USING (tenant_id = public.my_tenant_id()) WITH CHECK (tenant_id = public.my_tenant_id());

-- Service announcements
CREATE TABLE IF NOT EXISTS public.announcements (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  type        TEXT NOT NULL DEFAULT 'info' CHECK (type IN ('info','warning','maintenance','outage','resolved')),
  is_active   BOOLEAN NOT NULL DEFAULT true,
  show_portal BOOLEAN NOT NULL DEFAULT true,
  starts_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  ends_at     TIMESTAMPTZ,
  created_by  UUID REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_announcements_tenant ON public.announcements(tenant_id, is_active, starts_at DESC);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.announcements TO authenticated;
GRANT ALL ON public.announcements TO service_role;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "announcements_tenant" ON public.announcements
  TO authenticated USING (tenant_id = public.my_tenant_id()) WITH CHECK (tenant_id = public.my_tenant_id());

-- ============================================================
-- ADVANCED AUTOMATION ENGINE ENHANCEMENTS
-- ============================================================
ALTER TABLE public.automation_rules
  ADD COLUMN IF NOT EXISTS schedule_cron TEXT,
  ADD COLUMN IF NOT EXISTS schedule_tz TEXT DEFAULT 'Africa/Nairobi',
  ADD COLUMN IF NOT EXISTS last_error TEXT,
  ADD COLUMN IF NOT EXISTS next_run TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS priority INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS max_retries INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0;

-- ============================================================
-- ENHANCED AAA — AUTHENTICATION EVENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.auth_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  nas_id      UUID REFERENCES public.nas_devices(id) ON DELETE SET NULL,
  username    TEXT NOT NULL,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  event_type  TEXT NOT NULL CHECK (event_type IN (
    'auth_success','auth_failure','auth_reject','acct_start',
    'acct_stop','acct_update','coa_request','disconnect_request'
  )),
  protocol    TEXT,
  ip_address  TEXT,
  mac_address TEXT,
  nas_port    TEXT,
  reply_message TEXT,
  attributes  JSONB DEFAULT '{}',
  received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_auth_events_tenant ON public.auth_events(tenant_id, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_auth_events_username ON public.auth_events(username, tenant_id);
CREATE INDEX IF NOT EXISTS idx_auth_events_type ON public.auth_events(event_type, received_at DESC);
GRANT INSERT,SELECT ON public.auth_events TO authenticated;
GRANT ALL ON public.auth_events TO service_role;
ALTER TABLE public.auth_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_events_tenant" ON public.auth_events
  FOR SELECT TO authenticated USING (tenant_id = public.my_tenant_id());

-- ============================================================
-- WHITE-LABEL ENHANCEMENTS
-- ============================================================
ALTER TABLE public.tenant_branding
  ADD COLUMN IF NOT EXISTS login_background_url TEXT,
  ADD COLUMN IF NOT EXISTS portal_hero_text TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp_number TEXT,
  ADD COLUMN IF NOT EXISTS footer_links JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS custom_css TEXT,
  ADD COLUMN IF NOT EXISTS meta_description TEXT;

-- SMS templates per tenant
CREATE TABLE IF NOT EXISTS public.sms_templates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  event_type  TEXT NOT NULL CHECK (event_type IN (
    'payment_success','payment_failed','subscription_activated',
    'subscription_expiring','subscription_expired','account_suspended',
    'account_activated','ticket_created','ticket_resolved',
    'welcome','otp','custom'
  )),
  template    TEXT NOT NULL,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, event_type)
);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.sms_templates TO authenticated;
GRANT ALL ON public.sms_templates TO service_role;
ALTER TABLE public.sms_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sms_templates_tenant" ON public.sms_templates
  TO authenticated USING (tenant_id = public.my_tenant_id()) WITH CHECK (tenant_id = public.my_tenant_id());

-- ============================================================
-- NETWORK ABSTRACTION LAYER — ENHANCED
-- ============================================================
CREATE TABLE IF NOT EXISTS public.network_adapters (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  router_id       UUID NOT NULL REFERENCES public.routers(id) ON DELETE CASCADE,
  adapter_type    TEXT NOT NULL CHECK (adapter_type IN (
    'mikrotik_rest','mikrotik_api','freeradius','radius_proxy',
    'ubiquiti','cisco','generic_snmp','openwrt'
  )),
  config          JSONB NOT NULL DEFAULT '{}',
  is_primary      BOOLEAN NOT NULL DEFAULT true,
  health_status   TEXT NOT NULL DEFAULT 'unknown' CHECK (health_status IN ('healthy','degraded','unhealthy','unknown')),
  last_checked    TIMESTAMPTZ,
  error_count     INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(router_id, adapter_type)
);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.network_adapters TO authenticated;
GRANT ALL ON public.network_adapters TO service_role;
ALTER TABLE public.network_adapters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "network_adapters_tenant" ON public.network_adapters
  TO authenticated USING (tenant_id = public.my_tenant_id()) WITH CHECK (tenant_id = public.my_tenant_id());

-- ============================================================
-- ADVANCED BILLING — SUBSCRIPTION RENEWALS TRACKING
-- ============================================================
CREATE TABLE IF NOT EXISTS public.renewal_attempts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  subscription_id UUID NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  customer_id     UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  attempt_number  INTEGER NOT NULL DEFAULT 1,
  method          TEXT NOT NULL,
  amount          NUMERIC NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','success','failed','cancelled')),
  payment_id      UUID REFERENCES public.payments(id),
  error           TEXT,
  attempted_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_renewal_attempts_sub ON public.renewal_attempts(subscription_id, attempted_at DESC);
GRANT SELECT,INSERT,UPDATE ON public.renewal_attempts TO authenticated;
GRANT ALL ON public.renewal_attempts TO service_role;
ALTER TABLE public.renewal_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "renewal_attempts_tenant" ON public.renewal_attempts
  TO authenticated USING (tenant_id = public.my_tenant_id()) WITH CHECK (tenant_id = public.my_tenant_id());

-- ============================================================
-- UPDATED_AT TRIGGERS
-- ============================================================
DO $$ DECLARE tbl TEXT; BEGIN
  FOR tbl IN SELECT unnest(ARRAY[
    'fraud_incidents','network_adapters'
  ]) LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_updated_at ON public.%s', tbl, tbl);
    EXECUTE format(
      'CREATE TRIGGER trg_%s_updated_at BEFORE UPDATE ON public.%s
       FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at()', tbl, tbl);
  END LOOP;
END $$;

-- ============================================================
-- FRAUD DETECTION FUNCTION — Detect concurrent logins
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_check_concurrent_sessions(
  _customer_id UUID,
  _tenant_id   UUID,
  _max_concurrent INTEGER DEFAULT 3
) RETURNS TABLE(session_id UUID, ip_address TEXT, mac_address TEXT, started_at TIMESTAMPTZ)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT id, ip_address, mac_address, started_at
  FROM public.sessions
  WHERE customer_id = _customer_id
    AND tenant_id   = _tenant_id
    AND ended_at IS NULL
  ORDER BY started_at DESC;
$$;
GRANT EXECUTE ON FUNCTION public.fn_check_concurrent_sessions(UUID, UUID, INTEGER) TO authenticated;

-- ============================================================
-- PROVISIONING HELPER — Create full payment workflow
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_initiate_payment_workflow(
  _tenant_id    UUID,
  _payment_id   UUID,
  _customer_id  UUID,
  _package_id   UUID
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_workflow_id UUID;
  v_idempotency TEXT := 'payment_' || _payment_id::TEXT;
BEGIN
  -- Insert workflow
  INSERT INTO public.provisioning_workflows (
    tenant_id, type, status, payload, idempotency_key, trigger_source, trigger_entity_id, trigger_entity_type
  ) VALUES (
    _tenant_id, 'payment_success', 'pending',
    jsonb_build_object('payment_id', _payment_id, 'customer_id', _customer_id, 'package_id', _package_id),
    v_idempotency, 'payment', _payment_id, 'payment'
  )
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id INTO v_workflow_id;

  IF v_workflow_id IS NULL THEN
    SELECT id INTO v_workflow_id FROM public.provisioning_workflows WHERE idempotency_key = v_idempotency;
    RETURN v_workflow_id;
  END IF;

  -- Insert steps
  INSERT INTO public.provisioning_steps (workflow_id, step_order, step_name, step_type)
  VALUES
    (v_workflow_id, 1, 'Verify Transaction',    'verify_payment'),
    (v_workflow_id, 2, 'Create Subscription',   'create_subscription'),
    (v_workflow_id, 3, 'Generate Invoice',       'generate_invoice'),
    (v_workflow_id, 4, 'Update RADIUS/Router',  'update_radius'),
    (v_workflow_id, 5, 'Activate Service',       'activate_router_user'),
    (v_workflow_id, 6, 'Send SMS Confirmation',  'send_sms'),
    (v_workflow_id, 7, 'Create Audit Log',       'create_audit_log');

  -- Queue the job
  INSERT INTO public.job_queue (tenant_id, type, payload, priority, queue_name)
  VALUES (_tenant_id, 'run_provisioning_workflow',
    jsonb_build_object('workflow_id', v_workflow_id),
    1, 'provisioning');

  RETURN v_workflow_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.fn_initiate_payment_workflow(UUID, UUID, UUID, UUID) TO authenticated;

-- ============================================================
-- VIEW — Fraud Summary per Tenant
-- ============================================================
CREATE OR REPLACE VIEW public.vw_fraud_summary AS
  SELECT
    tenant_id,
    type,
    severity,
    status,
    COUNT(*) AS count,
    MAX(created_at) AS latest
  FROM public.fraud_incidents
  GROUP BY tenant_id, type, severity, status;

-- ============================================================
-- VIEW — Provisioning Workflow Status
-- ============================================================
CREATE OR REPLACE VIEW public.vw_provisioning_status AS
  SELECT
    w.id, w.tenant_id, w.type, w.status,
    w.trigger_entity_type, w.trigger_entity_id,
    w.current_step, w.retry_count, w.error,
    w.created_at, w.completed_at,
    COALESCE((SELECT COUNT(*) FROM public.provisioning_steps s WHERE s.workflow_id = w.id), 0) AS total_steps,
    COALESCE((SELECT COUNT(*) FROM public.provisioning_steps s WHERE s.workflow_id = w.id AND s.status = 'completed'), 0) AS completed_steps
  FROM public.provisioning_workflows w;

-- ============================================================
-- Seed default SMS templates
-- ============================================================
INSERT INTO public.sms_templates (tenant_id, name, event_type, template)
SELECT t.id, ev.name, ev.event_type, ev.template
FROM public.tenants t
CROSS JOIN (VALUES
  ('Payment Success',      'payment_success',         'Dear {customer_name}, payment of KES {amount} received. Your service is active until {expiry_date}. Thank you.'),
  ('Payment Failed',       'payment_failed',          'Dear {customer_name}, your payment of KES {amount} could not be processed. Please try again or contact support.'),
  ('Subscription Expiring','subscription_expiring',   'Dear {customer_name}, your internet subscription expires on {expiry_date}. Renew now to avoid interruption.'),
  ('Subscription Expired', 'subscription_expired',    'Dear {customer_name}, your subscription has expired. Please renew to restore internet access.'),
  ('Account Suspended',    'account_suspended',       'Dear {customer_name}, your account has been suspended. Contact support for assistance.'),
  ('Account Activated',    'account_activated',       'Dear {customer_name}, your internet service has been activated. Enjoy your connection!'),
  ('Welcome',              'welcome',                 'Welcome to {isp_name}, {customer_name}! Your account is ready. Contact {support_phone} for help.'),
  ('Ticket Created',       'ticket_created',          'Dear {customer_name}, your support ticket #{ticket_no} has been received. We will respond within {sla_hours} hours.')
) AS ev(name, event_type, template)
ON CONFLICT (tenant_id, event_type) DO NOTHING;

-- ============================================================
-- PERFORMANCE INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_auth_events_mac ON public.auth_events(mac_address) WHERE mac_address IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fraud_severity ON public.fraud_incidents(tenant_id, severity, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_router_uptime_status ON public.router_uptime_logs(router_id, status, checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_provisioning_status ON public.provisioning_workflows(tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_renewal_status ON public.renewal_attempts(tenant_id, status);
