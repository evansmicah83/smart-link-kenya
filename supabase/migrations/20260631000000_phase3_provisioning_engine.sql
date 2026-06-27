-- ============================================================
-- SmartLinkNet Phase 3: Provisioning Engine
-- ============================================================

-- 1. PROVISIONING WORKFLOWS
CREATE TABLE IF NOT EXISTS public.provisioning_workflows (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  type                TEXT NOT NULL CHECK (type IN (
    'payment_success','payment_failure','subscription_expiry',
    'subscription_renewal','manual_activation','manual_suspension'
  )),
  status              TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending','running','completed','failed','rolled_back','compensating'
  )),
  payload             JSONB NOT NULL DEFAULT '{}',
  current_step        INTEGER NOT NULL DEFAULT 0,
  total_steps         INTEGER NOT NULL DEFAULT 0,
  completed_steps     INTEGER NOT NULL DEFAULT 0,
  idempotency_key     TEXT,
  error               TEXT,
  rollback_error      TEXT,
  retry_count         INTEGER NOT NULL DEFAULT 0,
  max_retries         INTEGER NOT NULL DEFAULT 3,
  trigger_source      TEXT NOT NULL DEFAULT 'system',
  trigger_entity_id   UUID,
  trigger_entity_type TEXT,
  locked_until        TIMESTAMPTZ,
  locked_by           TEXT,
  started_at          TIMESTAMPTZ,
  completed_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_pw_tenant_status ON public.provisioning_workflows(tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pw_pending       ON public.provisioning_workflows(status, created_at) WHERE status IN ('pending','running');
ALTER TABLE public.provisioning_workflows
  ADD COLUMN IF NOT EXISTS current_step INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_steps INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS completed_steps INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_retries INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS error TEXT,
  ADD COLUMN IF NOT EXISTS rollback_error TEXT,
  ADD COLUMN IF NOT EXISTS trigger_source TEXT NOT NULL DEFAULT 'system',
  ADD COLUMN IF NOT EXISTS trigger_entity_id UUID,
  ADD COLUMN IF NOT EXISTS trigger_entity_type TEXT,
  ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS locked_by TEXT,
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS idx_pw_trigger       ON public.provisioning_workflows(trigger_entity_id) WHERE trigger_entity_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pw_recovery      ON public.provisioning_workflows(status, locked_until) WHERE status = 'running';
GRANT SELECT,INSERT,UPDATE ON public.provisioning_workflows TO authenticated;
GRANT ALL ON public.provisioning_workflows TO service_role;
ALTER TABLE public.provisioning_workflows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pw_tenant" ON public.provisioning_workflows
  TO authenticated
  USING  (tenant_id = public.my_tenant_id())
  WITH CHECK (tenant_id = public.my_tenant_id());
DO $$ BEGIN
  DROP TRIGGER IF EXISTS trg_pw_updated_at ON public.provisioning_workflows;
  CREATE TRIGGER trg_pw_updated_at BEFORE UPDATE ON public.provisioning_workflows
    FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();
END $$;

-- 2. PROVISIONING STEPS
CREATE TABLE IF NOT EXISTS public.provisioning_steps (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id     UUID NOT NULL REFERENCES public.provisioning_workflows(id) ON DELETE CASCADE,
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  step_order      INTEGER NOT NULL,
  step_name       TEXT NOT NULL,
  step_type       TEXT NOT NULL CHECK (step_type IN (
    'verify_payment','create_subscription','generate_invoice',
    'update_radius','activate_router_user','suspend_router_user',
    'send_sms','send_email','create_audit_log','update_customer_status',
    'check_grace_period','debit_wallet','credit_wallet',
    'notify_admin','record_failure','retry_payment','custom'
  )),
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending','running','completed','failed','skipped','compensating','compensated'
  )),
  input_data      JSONB NOT NULL DEFAULT '{}',
  output_data     JSONB NOT NULL DEFAULT '{}',
  error           TEXT,
  attempt         INTEGER NOT NULL DEFAULT 0,
  can_compensate  BOOLEAN NOT NULL DEFAULT false,
  compensated     BOOLEAN NOT NULL DEFAULT false,
  compensation_data JSONB NOT NULL DEFAULT '{}',
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workflow_id, step_order)
);
CREATE INDEX IF NOT EXISTS idx_ps_workflow ON public.provisioning_steps(workflow_id, step_order);
CREATE INDEX IF NOT EXISTS idx_ps_tenant   ON public.provisioning_steps(tenant_id, created_at DESC);
GRANT SELECT,INSERT,UPDATE ON public.provisioning_steps TO authenticated;
GRANT ALL ON public.provisioning_steps TO service_role;
ALTER TABLE public.provisioning_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ps_tenant" ON public.provisioning_steps
  TO authenticated
  USING  (tenant_id = public.my_tenant_id())
  WITH CHECK (tenant_id = public.my_tenant_id());

-- 3. WORKFLOW EVENTS (append-only event store)
CREATE TABLE IF NOT EXISTS public.workflow_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES public.provisioning_workflows(id) ON DELETE CASCADE,
  tenant_id   UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  sequence_no BIGINT GENERATED ALWAYS AS IDENTITY,
  event_type  TEXT NOT NULL CHECK (event_type IN (
    'workflow_created','workflow_started','workflow_completed',
    'workflow_failed','workflow_rolled_back','workflow_retried',
    'step_started','step_completed','step_failed','step_skipped',
    'step_compensating','step_compensated',
    'lock_acquired','lock_released','lock_expired',
    'recovery_triggered','idempotency_hit'
  )),
  step_name   TEXT,
  step_order  INTEGER,
  payload     JSONB NOT NULL DEFAULT '{}',
  actor       TEXT NOT NULL DEFAULT 'system',
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_we_workflow ON public.workflow_events(workflow_id, sequence_no);
CREATE INDEX IF NOT EXISTS idx_we_tenant   ON public.workflow_events(tenant_id, occurred_at DESC);
GRANT SELECT,INSERT ON public.workflow_events TO authenticated;
GRANT ALL ON public.workflow_events TO service_role;
ALTER TABLE public.workflow_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "we_tenant" ON public.workflow_events
  FOR SELECT TO authenticated USING (tenant_id = public.my_tenant_id());

-- 4. AUDIT TRAIL
CREATE TABLE IF NOT EXISTS public.audit_trail (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  workflow_id  UUID REFERENCES public.provisioning_workflows(id) ON DELETE SET NULL,
  entity_type  TEXT NOT NULL CHECK (entity_type IN (
    'subscription','payment','invoice','customer','router',
    'radius_user','session','workflow','system'
  )),
  entity_id    UUID,
  action       TEXT NOT NULL,
  before_state JSONB,
  after_state  JSONB,
  diff         JSONB,
  actor        TEXT NOT NULL DEFAULT 'system',
  actor_type   TEXT NOT NULL DEFAULT 'system' CHECK (actor_type IN ('user','system','automation','api')),
  ip_address   TEXT,
  metadata     JSONB NOT NULL DEFAULT '{}',
  occurred_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_at_tenant   ON public.audit_trail(tenant_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_at_entity   ON public.audit_trail(entity_type, entity_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_at_workflow ON public.audit_trail(workflow_id) WHERE workflow_id IS NOT NULL;
GRANT SELECT,INSERT ON public.audit_trail TO authenticated;
GRANT ALL ON public.audit_trail TO service_role;
ALTER TABLE public.audit_trail ENABLE ROW LEVEL SECURITY;
CREATE POLICY "at_tenant" ON public.audit_trail
  FOR SELECT TO authenticated USING (tenant_id = public.my_tenant_id());

-- 5. VIEWS
CREATE OR REPLACE VIEW public.vw_provisioning_status AS
  SELECT
    w.id, w.tenant_id, w.type, w.status,
    w.current_step, w.total_steps, w.completed_steps,
    w.retry_count, w.max_retries, w.error, w.rollback_error,
    w.trigger_source, w.trigger_entity_id, w.trigger_entity_type,
    w.idempotency_key, w.started_at, w.completed_at, w.created_at,
    CASE WHEN w.total_steps > 0
      THEN ROUND((w.completed_steps::NUMERIC / w.total_steps) * 100)
      ELSE 0
    END AS progress_pct,
    EXTRACT(EPOCH FROM (COALESCE(w.completed_at, now()) - w.started_at))::INTEGER AS duration_seconds
  FROM public.provisioning_workflows w;
GRANT SELECT ON public.vw_provisioning_status TO authenticated;

CREATE OR REPLACE VIEW public.vw_workflow_timeline AS
  SELECT
    s.id, s.workflow_id, s.tenant_id, s.step_order, s.step_name, s.step_type,
    s.status, s.attempt, s.error, s.can_compensate, s.compensated,
    s.input_data, s.output_data, s.started_at, s.completed_at,
    EXTRACT(EPOCH FROM (COALESCE(s.completed_at, now()) - s.started_at))::INTEGER AS step_duration_sec
  FROM public.provisioning_steps s;
GRANT SELECT ON public.vw_workflow_timeline TO authenticated;

CREATE OR REPLACE VIEW public.vw_audit_trail AS
  SELECT
    a.id, a.tenant_id, a.workflow_id, a.entity_type, a.entity_id,
    a.action, a.before_state, a.after_state, a.diff,
    a.actor, a.actor_type, a.metadata, a.occurred_at,
    w.type AS workflow_type, w.status AS workflow_status
  FROM public.audit_trail a
  LEFT JOIN public.provisioning_workflows w ON w.id = a.workflow_id;
GRANT SELECT ON public.vw_audit_trail TO authenticated;

-- 6. FUNCTIONS

-- Idempotent workflow initiation
CREATE OR REPLACE FUNCTION public.fn_initiate_workflow(
  _tenant_id           UUID,
  _type                TEXT,
  _payload             JSONB,
  _idempotency_key     TEXT,
  _trigger_source      TEXT DEFAULT 'system',
  _trigger_entity_id   UUID DEFAULT NULL,
  _trigger_entity_type TEXT DEFAULT NULL,
  _max_retries         INTEGER DEFAULT 3
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _wf_id UUID;
BEGIN
  SELECT id INTO _wf_id FROM public.provisioning_workflows
  WHERE tenant_id = _tenant_id AND idempotency_key = _idempotency_key;
  IF _wf_id IS NOT NULL THEN
    INSERT INTO public.workflow_events(workflow_id, tenant_id, event_type, payload)
    VALUES (_wf_id, _tenant_id, 'idempotency_hit', jsonb_build_object('key', _idempotency_key));
    RETURN _wf_id;
  END IF;
  INSERT INTO public.provisioning_workflows(
    tenant_id, type, status, payload, idempotency_key,
    trigger_source, trigger_entity_id, trigger_entity_type, max_retries
  ) VALUES (
    _tenant_id, _type, 'pending', _payload, _idempotency_key,
    _trigger_source, _trigger_entity_id, _trigger_entity_type, _max_retries
  ) RETURNING id INTO _wf_id;
  INSERT INTO public.workflow_events(workflow_id, tenant_id, event_type, payload)
  VALUES (_wf_id, _tenant_id, 'workflow_created',
    jsonb_build_object('type', _type, 'idempotency_key', _idempotency_key));
  INSERT INTO public.job_queue(tenant_id, type, payload, priority, queue_name, run_at, status)
  VALUES (_tenant_id, 'run_provisioning_workflow',
    jsonb_build_object('workflow_id', _wf_id), 1, 'provisioning', now(), 'pending');
  RETURN _wf_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.fn_initiate_workflow(UUID,TEXT,JSONB,TEXT,TEXT,UUID,TEXT,INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_initiate_workflow(UUID,TEXT,JSONB,TEXT,TEXT,UUID,TEXT,INTEGER) TO service_role;

-- Acquire optimistic lock
CREATE OR REPLACE FUNCTION public.fn_acquire_workflow_lock(
  _workflow_id UUID, _worker_id TEXT, _ttl_seconds INTEGER DEFAULT 300
) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _rows INTEGER;
BEGIN
  UPDATE public.provisioning_workflows SET
    locked_until = now() + (_ttl_seconds || ' seconds')::INTERVAL,
    locked_by    = _worker_id, status = 'running',
    started_at   = COALESCE(started_at, now()), updated_at = now()
  WHERE id = _workflow_id AND status IN ('pending','failed')
    AND (locked_until IS NULL OR locked_until < now())
    AND retry_count < max_retries;
  GET DIAGNOSTICS _rows = ROW_COUNT;
  RETURN _rows > 0;
END;
$$;
GRANT EXECUTE ON FUNCTION public.fn_acquire_workflow_lock(UUID,TEXT,INTEGER) TO service_role;

-- Release lock
CREATE OR REPLACE FUNCTION public.fn_release_workflow_lock(
  _workflow_id UUID, _status TEXT, _error TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.provisioning_workflows SET
    status       = _status, error = _error,
    locked_until = NULL, locked_by = NULL,
    completed_at = CASE WHEN _status IN ('completed','failed','rolled_back') THEN now() ELSE completed_at END,
    updated_at   = now()
  WHERE id = _workflow_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.fn_release_workflow_lock(UUID,TEXT,TEXT) TO service_role;

-- Recover stale workflows
CREATE OR REPLACE FUNCTION public.fn_recover_stale_workflows()
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _count INTEGER;
BEGIN
  UPDATE public.provisioning_workflows SET
    status = 'pending', locked_until = NULL, locked_by = NULL,
    error = NULL, updated_at = now()
  WHERE status = 'running' AND locked_until < now();
  GET DIAGNOSTICS _count = ROW_COUNT;
  IF _count > 0 THEN
    INSERT INTO public.job_queue(tenant_id, type, payload, priority, queue_name, run_at, status)
    SELECT tenant_id, 'run_provisioning_workflow',
      jsonb_build_object('workflow_id', id), 1, 'provisioning', now(), 'pending'
    FROM public.provisioning_workflows
    WHERE status = 'pending' AND updated_at > now() - interval '10 seconds';
  END IF;
  RETURN _count;
END;
$$;
GRANT EXECUTE ON FUNCTION public.fn_recover_stale_workflows() TO service_role;

-- Provisioning stats
CREATE OR REPLACE FUNCTION public.fn_provisioning_stats(_tenant_id UUID, _hours INTEGER DEFAULT 24)
RETURNS TABLE(total BIGINT, completed BIGINT, failed BIGINT, pending BIGINT, running BIGINT, rolled_back BIGINT, success_rate NUMERIC)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH w AS (
    SELECT status FROM public.provisioning_workflows
    WHERE tenant_id = _tenant_id AND created_at > now() - make_interval(hours => _hours)
  )
  SELECT
    COUNT(*) AS total,
    COUNT(*) FILTER (WHERE status = 'completed')  AS completed,
    COUNT(*) FILTER (WHERE status = 'failed')     AS failed,
    COUNT(*) FILTER (WHERE status = 'pending')    AS pending,
    COUNT(*) FILTER (WHERE status = 'running')    AS running,
    COUNT(*) FILTER (WHERE status = 'rolled_back') AS rolled_back,
    CASE WHEN COUNT(*) > 0
      THEN ROUND(COUNT(*) FILTER (WHERE status = 'completed')::NUMERIC / COUNT(*) * 100, 1)
      ELSE 100 END AS success_rate
  FROM w;
$$;
GRANT EXECUTE ON FUNCTION public.fn_provisioning_stats(UUID,INTEGER) TO authenticated;
