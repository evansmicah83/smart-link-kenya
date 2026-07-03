-- ============================================================
-- SmartLinkNet Phase 4: Event Bus & Queue System
-- ============================================================

-- 1. Add distributed-worker locking columns to job_queue
ALTER TABLE public.job_queue
  ADD COLUMN IF NOT EXISTS worker_id    TEXT,
  ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at   TIMESTAMPTZ NOT NULL DEFAULT now();

-- Backfill updated_at
UPDATE public.job_queue SET updated_at = created_at WHERE updated_at IS NULL;

-- 2. Scheduled jobs table (cron-style recurring jobs)
CREATE TABLE IF NOT EXISTS public.scheduled_jobs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  job_type      TEXT NOT NULL,
  queue_name    TEXT NOT NULL DEFAULT 'default',
  payload       JSONB NOT NULL DEFAULT '{}',
  cron_expr     TEXT NOT NULL,               -- e.g. '0 * * * *'
  priority      INTEGER NOT NULL DEFAULT 5,
  max_attempts  INTEGER NOT NULL DEFAULT 3,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  last_run_at   TIMESTAMPTZ,
  next_run_at   TIMESTAMPTZ,
  run_count     BIGINT NOT NULL DEFAULT 0,
  last_error    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);
CREATE INDEX IF NOT EXISTS idx_sj_active ON public.scheduled_jobs(is_active, next_run_at)
  WHERE is_active = true;
GRANT SELECT,INSERT,UPDATE ON public.scheduled_jobs TO authenticated;
GRANT ALL ON public.scheduled_jobs TO service_role;
ALTER TABLE public.scheduled_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sj_tenant" ON public.scheduled_jobs
  TO authenticated
  USING  (tenant_id = public.my_tenant_id())
  WITH CHECK (tenant_id = public.my_tenant_id());

-- 3. Dead-letter queue archive (separate table for DLQ inspection)
CREATE TABLE IF NOT EXISTS public.dead_letter_jobs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_job_id UUID,
  tenant_id       UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  job_type        TEXT NOT NULL,
  queue_name      TEXT NOT NULL DEFAULT 'default',
  payload         JSONB NOT NULL DEFAULT '{}',
  attempts        INTEGER NOT NULL DEFAULT 0,
  last_error      TEXT,
  archived_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  requeued        BOOLEAN NOT NULL DEFAULT false,
  requeued_at     TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_dlj_tenant ON public.dead_letter_jobs(tenant_id, archived_at DESC);
CREATE INDEX IF NOT EXISTS idx_dlj_requeued ON public.dead_letter_jobs(tenant_id, requeued)
  WHERE requeued = false;
GRANT SELECT,INSERT,UPDATE ON public.dead_letter_jobs TO authenticated;
GRANT ALL ON public.dead_letter_jobs TO service_role;
ALTER TABLE public.dead_letter_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dlj_tenant" ON public.dead_letter_jobs
  TO authenticated
  USING  (tenant_id = public.my_tenant_id())
  WITH CHECK (tenant_id = public.my_tenant_id());

-- 4. Queue metrics snapshots (for dashboard charts)
CREATE TABLE IF NOT EXISTS public.queue_metrics (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  queue_name  TEXT NOT NULL,
  snapshot_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  pending     INTEGER NOT NULL DEFAULT 0,
  running     INTEGER NOT NULL DEFAULT 0,
  completed   INTEGER NOT NULL DEFAULT 0,
  failed      INTEGER NOT NULL DEFAULT 0,
  dead        INTEGER NOT NULL DEFAULT 0,
  throughput  NUMERIC NOT NULL DEFAULT 0  -- jobs completed in last interval
);
CREATE INDEX IF NOT EXISTS idx_qm_tenant_queue ON public.queue_metrics(tenant_id, queue_name, snapshot_at DESC);
GRANT SELECT,INSERT ON public.queue_metrics TO service_role;
GRANT SELECT ON public.queue_metrics TO authenticated;
ALTER TABLE public.queue_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "qm_tenant" ON public.queue_metrics
  FOR SELECT TO authenticated USING (tenant_id = public.my_tenant_id());

-- 5. Additional indexes for priority queue ordering and worker locking
CREATE INDEX IF NOT EXISTS idx_jq_claim ON public.job_queue(queue_name, priority, run_at)
  WHERE status = 'pending' AND dead_letter = false;
CREATE INDEX IF NOT EXISTS idx_jq_worker ON public.job_queue(worker_id, locked_until)
  WHERE status = 'running';
CREATE INDEX IF NOT EXISTS idx_jq_updated ON public.job_queue(tenant_id, updated_at DESC);

-- 6. Atomic job claim function (prevents double-execution across distributed workers)
CREATE OR REPLACE FUNCTION public.fn_claim_jobs(
  _queue_name  TEXT,
  _worker_id   TEXT,
  _batch_size  INTEGER DEFAULT 10,
  _ttl_seconds INTEGER DEFAULT 120
) RETURNS SETOF public.job_queue
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  UPDATE public.job_queue SET
    status       = 'running',
    worker_id    = _worker_id,
    locked_until = now() + (_ttl_seconds || ' seconds')::INTERVAL,
    started_at   = COALESCE(started_at, now()),
    attempts     = attempts + 1,
    updated_at   = now()
  WHERE id IN (
    SELECT id FROM public.job_queue
    WHERE status = 'pending'
      AND dead_letter = false
      AND run_at <= now()
      AND (_queue_name = 'all' OR queue_name = _queue_name)
    ORDER BY priority ASC, run_at ASC
    LIMIT _batch_size
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
END;
$$;
GRANT EXECUTE ON FUNCTION public.fn_claim_jobs(TEXT,TEXT,INTEGER,INTEGER) TO service_role;

-- 7. Release job (complete or fail)
CREATE OR REPLACE FUNCTION public.fn_release_job(
  _job_id      UUID,
  _worker_id   TEXT,
  _status      TEXT,   -- 'completed' | 'failed'
  _error       TEXT DEFAULT NULL,
  _next_run_at TIMESTAMPTZ DEFAULT NULL  -- for retry scheduling
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _job public.job_queue;
BEGIN
  SELECT * INTO _job FROM public.job_queue WHERE id = _job_id AND worker_id = _worker_id;
  IF NOT FOUND THEN RETURN; END IF;

  IF _status = 'completed' THEN
    UPDATE public.job_queue SET
      status       = 'completed',
      completed_at = now(),
      worker_id    = NULL,
      locked_until = NULL,
      last_error   = NULL,
      updated_at   = now()
    WHERE id = _job_id;

  ELSIF _status = 'failed' THEN
    DECLARE
      _is_dead BOOLEAN := _job.attempts >= _job.max_attempts;
    BEGIN
      UPDATE public.job_queue SET
        status       = CASE WHEN _is_dead THEN 'failed' ELSE 'pending' END,
        dead_letter  = _is_dead,
        last_error   = _error,
        run_at       = COALESCE(_next_run_at, now() + '60 seconds'::INTERVAL),
        worker_id    = NULL,
        locked_until = NULL,
        updated_at   = now()
      WHERE id = _job_id;

      -- Archive to DLQ table when dead
      IF _is_dead THEN
        INSERT INTO public.dead_letter_jobs(
          original_job_id, tenant_id, job_type, queue_name, payload, attempts, last_error
        ) VALUES (
          _job.id, _job.tenant_id, _job.type, _job.queue_name, _job.payload, _job.attempts, _error
        ) ON CONFLICT DO NOTHING;
      END IF;
    END;
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.fn_release_job(UUID,TEXT,TEXT,TEXT,TIMESTAMPTZ) TO service_role;

-- 8. Recover stale running jobs (worker crashed)
CREATE OR REPLACE FUNCTION public.fn_recover_stale_jobs(
  _stale_seconds INTEGER DEFAULT 300
) RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _count INTEGER;
BEGIN
  UPDATE public.job_queue SET
    status       = 'pending',
    worker_id    = NULL,
    locked_until = NULL,
    run_at       = now(),
    updated_at   = now()
  WHERE status = 'running'
    AND locked_until < now() - (_stale_seconds || ' seconds')::INTERVAL;
  GET DIAGNOSTICS _count = ROW_COUNT;
  RETURN _count;
END;
$$;
GRANT EXECUTE ON FUNCTION public.fn_recover_stale_jobs(INTEGER) TO service_role;

-- 9. Queue stats function (per-queue breakdown for dashboard)
CREATE OR REPLACE FUNCTION public.fn_queue_stats(
  _tenant_id UUID,
  _hours     INTEGER DEFAULT 24
) RETURNS TABLE(
  queue_name TEXT,
  pending    BIGINT,
  running    BIGINT,
  completed  BIGINT,
  failed     BIGINT,
  dead       BIGINT,
  total      BIGINT,
  avg_duration_sec NUMERIC
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    queue_name,
    COUNT(*) FILTER (WHERE status = 'pending'   AND NOT dead_letter) AS pending,
    COUNT(*) FILTER (WHERE status = 'running'   AND NOT dead_letter) AS running,
    COUNT(*) FILTER (WHERE status = 'completed' AND NOT dead_letter) AS completed,
    COUNT(*) FILTER (WHERE status = 'failed'    AND NOT dead_letter) AS failed,
    COUNT(*) FILTER (WHERE dead_letter = true)                       AS dead,
    COUNT(*) FILTER (WHERE NOT dead_letter)                          AS total,
    ROUND(AVG(
      EXTRACT(EPOCH FROM (completed_at - started_at))
    ) FILTER (WHERE status = 'completed' AND started_at IS NOT NULL AND completed_at IS NOT NULL), 2)
      AS avg_duration_sec
  FROM public.job_queue
  WHERE tenant_id = _tenant_id
    AND created_at > now() - make_interval(hours => _hours)
  GROUP BY queue_name
  ORDER BY queue_name;
$$;
GRANT EXECUTE ON FUNCTION public.fn_queue_stats(UUID,INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_queue_stats(UUID,INTEGER) TO service_role;

-- 10. Snapshot queue metrics (called by scheduler)
CREATE OR REPLACE FUNCTION public.fn_snapshot_queue_metrics(
  _tenant_id UUID
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.queue_metrics(tenant_id, queue_name, pending, running, completed, failed, dead, throughput)
  SELECT
    _tenant_id,
    queue_name,
    COUNT(*) FILTER (WHERE status = 'pending'   AND NOT dead_letter),
    COUNT(*) FILTER (WHERE status = 'running'   AND NOT dead_letter),
    COUNT(*) FILTER (WHERE status = 'completed' AND NOT dead_letter AND completed_at > now() - interval '5 minutes'),
    COUNT(*) FILTER (WHERE status = 'failed'    AND NOT dead_letter),
    COUNT(*) FILTER (WHERE dead_letter = true),
    COUNT(*) FILTER (WHERE status = 'completed' AND completed_at > now() - interval '5 minutes')
  FROM public.job_queue
  WHERE tenant_id = _tenant_id
  GROUP BY queue_name;
END;
$$;
GRANT EXECUTE ON FUNCTION public.fn_snapshot_queue_metrics(UUID) TO service_role;

-- 11. Requeue a dead-letter job
CREATE OR REPLACE FUNCTION public.fn_requeue_dead_letter(
  _dlj_id UUID
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _dlj  public.dead_letter_jobs;
  _new_id UUID;
BEGIN
  SELECT * INTO _dlj FROM public.dead_letter_jobs WHERE id = _dlj_id AND requeued = false;
  IF NOT FOUND THEN RAISE EXCEPTION 'Dead letter job not found or already requeued'; END IF;

  INSERT INTO public.job_queue(tenant_id, type, payload, status, priority, queue_name, run_at, max_attempts, attempts)
  VALUES (_dlj.tenant_id, _dlj.job_type, _dlj.payload, 'pending', 5, _dlj.queue_name, now(), 3, 0)
  RETURNING id INTO _new_id;

  UPDATE public.dead_letter_jobs SET requeued = true, requeued_at = now() WHERE id = _dlj_id;
  RETURN _new_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.fn_requeue_dead_letter(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_requeue_dead_letter(UUID) TO service_role;

-- 12. Seed default scheduled jobs for all existing tenants
INSERT INTO public.scheduled_jobs(tenant_id, name, job_type, queue_name, payload, cron_expr, priority)
SELECT
  t.id,
  sj.name,
  sj.job_type,
  sj.queue_name,
  sj.payload,
  sj.cron_expr,
  sj.priority
FROM public.tenants t
CROSS JOIN (VALUES
  ('expiry_check',        'expiry_check_workflow', 'provisioning', '{}',  '0 * * * *',   2),
  ('recover_workflows',   'recover_workflows',     'provisioning', '{}',  '*/5 * * * *', 1),
  ('recover_jobs',        'recover_stale_jobs',    'default',      '{}',  '*/5 * * * *', 1),
  ('aggregate_usage',     'aggregate_usage',       'reports',      '{}',  '0 2 * * *',   5),
  ('snapshot_metrics',    'snapshot_queue_metrics','default',      '{}',  '*/5 * * * *', 5),
  ('generate_report',     'generate_daily_report', 'reports',      '{}',  '0 6 * * *',   5),
  ('backup_config',       'backup_config',         'backup',       '{}',  '0 3 * * *',   5)
) AS sj(name, job_type, queue_name, payload, cron_expr, priority)
ON CONFLICT (tenant_id, name) DO NOTHING;

-- 13. Updated_at trigger for scheduled_jobs
DO $$ BEGIN
  DROP TRIGGER IF EXISTS trg_sj_updated_at ON public.scheduled_jobs;
  CREATE TRIGGER trg_sj_updated_at BEFORE UPDATE ON public.scheduled_jobs
    FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();
END $$;

-- 14. Queue stats view (live)
CREATE OR REPLACE VIEW public.vw_queue_stats AS
  SELECT
    tenant_id,
    queue_name,
    COUNT(*) FILTER (WHERE status = 'pending'   AND NOT dead_letter) AS pending,
    COUNT(*) FILTER (WHERE status = 'running'   AND NOT dead_letter) AS running,
    COUNT(*) FILTER (WHERE status = 'completed' AND NOT dead_letter) AS completed,
    COUNT(*) FILTER (WHERE status = 'failed'    AND NOT dead_letter) AS failed,
    COUNT(*) FILTER (WHERE dead_letter = true)                       AS dead,
    COUNT(*) FILTER (WHERE NOT dead_letter)                          AS total
  FROM public.job_queue
  GROUP BY tenant_id, queue_name;
GRANT SELECT ON public.vw_queue_stats TO authenticated;
