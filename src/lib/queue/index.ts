/**
 * SmartLinkNet — Phase 4: Event Bus & Queue System
 * DB-backed priority queues with distributed locking, DLQ, scheduled jobs,
 * delayed jobs, idempotency, metrics, and event bus routing.
 */
import { supabase } from "@/integrations/supabase/client";

// ── Types ─────────────────────────────────────────────────────────────────────

export type JobType =
  | "process_payment"
  | "retry_payment"
  | "send_sms"
  | "send_whatsapp"
  | "send_email"
  | "sync_router"
  | "run_provisioning_workflow"
  | "provision_service"
  | "suspend_service"
  | "reactivate_service"
  | "expiry_check"
  | "expiry_check_workflow"
  | "generate_report"
  | "generate_daily_report"
  | "generate_vouchers"
  | "backup_config"
  | "notify_admin"
  | "fraud_check"
  | "run_automation"
  | "aggregate_usage"
  | "snapshot_queue_metrics"
  | "recover_stale_jobs"
  | "recover_workflows";

export type QueueName =
  | "default"
  | "mpesa"
  | "notifications"
  | "provisioning"
  | "billing"
  | "router_sync"
  | "reports"
  | "backup"
  | "fraud";

export type JobStatus = "pending" | "running" | "completed" | "failed";

export interface Job {
  id: string;
  tenantId: string;
  type: JobType;
  payload: Record<string, unknown>;
  status: JobStatus;
  priority: number;
  queueName: QueueName;
  attempts: number;
  maxAttempts: number;
  runAt: string;
  startedAt: string | null;
  completedAt: string | null;
  lastError: string | null;
  deadLetter: boolean;
  workerId: string | null;
  lockedUntil: string | null;
  idempotencyKey: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ScheduledJob {
  id: string;
  tenantId: string;
  name: string;
  jobType: string;
  queueName: string;
  payload: Record<string, unknown>;
  cronExpr: string;
  priority: number;
  isActive: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  runCount: number;
  lastError: string | null;
  createdAt: string;
}

export interface DeadLetterJob {
  id: string;
  originalJobId: string | null;
  tenantId: string;
  jobType: string;
  queueName: string;
  payload: Record<string, unknown>;
  attempts: number;
  lastError: string | null;
  archivedAt: string;
  requeued: boolean;
  requeuedAt: string | null;
}

export interface QueueStats {
  queueName: string;
  pending: number;
  running: number;
  completed: number;
  failed: number;
  dead: number;
  total: number;
  avgDurationSec: number | null;
}

export interface EnqueueParams {
  tenantId: string;
  type: JobType;
  payload: Record<string, unknown>;
  runAt?: Date;
  priority?: number;        // 1 (highest) – 10 (lowest)
  queueName?: QueueName;
  idempotencyKey?: string;
  maxAttempts?: number;
}

// ── Row mapper ────────────────────────────────────────────────────────────────

function mapJob(r: Record<string, unknown>): Job {
  return {
    id:             r["id"] as string,
    tenantId:       r["tenant_id"] as string,
    type:           r["type"] as JobType,
    payload:        (r["payload"] as Record<string, unknown>) ?? {},
    status:         r["status"] as JobStatus,
    priority:       r["priority"] as number ?? 5,
    queueName:      (r["queue_name"] as QueueName) ?? "default",
    attempts:       r["attempts"] as number ?? 0,
    maxAttempts:    r["max_attempts"] as number ?? 3,
    runAt:          r["run_at"] as string,
    startedAt:      r["started_at"] as string | null ?? null,
    completedAt:    r["completed_at"] as string | null ?? null,
    lastError:      r["last_error"] as string | null ?? null,
    deadLetter:     r["dead_letter"] as boolean ?? false,
    workerId:       r["worker_id"] as string | null ?? null,
    lockedUntil:    r["locked_until"] as string | null ?? null,
    idempotencyKey: r["idempotency_key"] as string | null ?? null,
    createdAt:      r["created_at"] as string,
    updatedAt:      r["updated_at"] as string ?? r["created_at"] as string,
  };
}

function mapScheduledJob(r: Record<string, unknown>): ScheduledJob {
  return {
    id:          r["id"] as string,
    tenantId:    r["tenant_id"] as string,
    name:        r["name"] as string,
    jobType:     r["job_type"] as string,
    queueName:   r["queue_name"] as string,
    payload:     (r["payload"] as Record<string, unknown>) ?? {},
    cronExpr:    r["cron_expr"] as string,
    priority:    r["priority"] as number ?? 5,
    isActive:    r["is_active"] as boolean ?? true,
    lastRunAt:   r["last_run_at"] as string | null ?? null,
    nextRunAt:   r["next_run_at"] as string | null ?? null,
    runCount:    r["run_count"] as number ?? 0,
    lastError:   r["last_error"] as string | null ?? null,
    createdAt:   r["created_at"] as string,
  };
}

function mapDeadLetterJob(r: Record<string, unknown>): DeadLetterJob {
  return {
    id:             r["id"] as string,
    originalJobId:  r["original_job_id"] as string | null ?? null,
    tenantId:       r["tenant_id"] as string,
    jobType:        r["job_type"] as string,
    queueName:      r["queue_name"] as string,
    payload:        (r["payload"] as Record<string, unknown>) ?? {},
    attempts:       r["attempts"] as number ?? 0,
    lastError:      r["last_error"] as string | null ?? null,
    archivedAt:     r["archived_at"] as string,
    requeued:       r["requeued"] as boolean ?? false,
    requeuedAt:     r["requeued_at"] as string | null ?? null,
  };
}

// ── QueueService ──────────────────────────────────────────────────────────────

export class QueueService {

  // ── Enqueue ───────────────────────────────────────────────────────────────

  async enqueue(params: EnqueueParams): Promise<string | null> {
    const { data, error } = await (supabase as any)
      .from("job_queue")
      .insert({
        tenant_id:       params.tenantId,
        type:            params.type,
        payload:         params.payload,
        status:          "pending",
        priority:        params.priority ?? 5,
        run_at:          (params.runAt ?? new Date()).toISOString(),
        attempts:        0,
        max_attempts:    params.maxAttempts ?? 3,
        queue_name:      params.queueName ?? "default",
        idempotency_key: params.idempotencyKey ?? null,
      })
      .select("id")
      .single();
    if (error) {
      if (error.code === "23505") return null; // idempotency hit — not an error
      console.error("enqueue error:", error.message);
      return null;
    }
    return data?.id ?? null;
  }

  /** Schedule a job at a specific future time */
  async schedule(params: Omit<EnqueueParams, "runAt"> & { runAt: Date }): Promise<string | null> {
    return this.enqueue(params);
  }

  /** Delay a job by given milliseconds */
  async delay(params: EnqueueParams, delayMs: number): Promise<string | null> {
    return this.enqueue({ ...params, runAt: new Date(Date.now() + delayMs) });
  }

  // ── Job queries ───────────────────────────────────────────────────────────

  async list(tenantId: string, opts: {
    status?: JobStatus;
    queueName?: QueueName;
    type?: JobType;
    deadLetter?: boolean;
    limit?: number;
  } = {}): Promise<Job[]> {
    let q = (supabase as any)
      .from("job_queue")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(opts.limit ?? 100);
    if (opts.status)     q = q.eq("status", opts.status);
    if (opts.queueName)  q = q.eq("queue_name", opts.queueName);
    if (opts.type)       q = q.eq("type", opts.type);
    if (opts.deadLetter !== undefined) q = q.eq("dead_letter", opts.deadLetter);
    const { data } = await q;
    return (data ?? []).map(mapJob);
  }

  async get(jobId: string): Promise<Job | null> {
    const { data } = await (supabase as any)
      .from("job_queue").select("*").eq("id", jobId).maybeSingle();
    return data ? mapJob(data) : null;
  }

  // ── Stats ─────────────────────────────────────────────────────────────────

  async getStats(tenantId: string, hours = 24): Promise<QueueStats[]> {
    const { data, error } = await (supabase as any)
      .rpc("fn_queue_stats", { _tenant_id: tenantId, _hours: hours });
    if (error) throw new Error(error.message);
    return (Array.isArray(data) ? data : []).map((r: Record<string, unknown>) => ({
      queueName:      r["queue_name"] as string,
      pending:        Number(r["pending"] ?? 0),
      running:        Number(r["running"] ?? 0),
      completed:      Number(r["completed"] ?? 0),
      failed:         Number(r["failed"] ?? 0),
      dead:           Number(r["dead"] ?? 0),
      total:          Number(r["total"] ?? 0),
      avgDurationSec: r["avg_duration_sec"] != null ? Number(r["avg_duration_sec"]) : null,
    }));
  }

  async getMetricsHistory(tenantId: string, queueName?: string, limit = 60): Promise<{
    snapshotAt: string; queueName: string;
    pending: number; running: number; completed: number; failed: number; dead: number; throughput: number;
  }[]> {
    let q = (supabase as any)
      .from("queue_metrics")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("snapshot_at", { ascending: false })
      .limit(limit);
    if (queueName) q = q.eq("queue_name", queueName);
    const { data } = await q;
    return (data ?? []).map((r: Record<string, unknown>) => ({
      snapshotAt: r["snapshot_at"] as string,
      queueName:  r["queue_name"] as string,
      pending:    Number(r["pending"] ?? 0),
      running:    Number(r["running"] ?? 0),
      completed:  Number(r["completed"] ?? 0),
      failed:     Number(r["failed"] ?? 0),
      dead:       Number(r["dead"] ?? 0),
      throughput: Number(r["throughput"] ?? 0),
    }));
  }

  // ── Job actions ───────────────────────────────────────────────────────────

  async retry(jobId: string): Promise<void> {
    const { error } = await (supabase as any)
      .from("job_queue")
      .update({
        status:      "pending",
        attempts:    0,
        last_error:  null,
        dead_letter: false,
        worker_id:   null,
        locked_until:null,
        run_at:      new Date().toISOString(),
        updated_at:  new Date().toISOString(),
      })
      .eq("id", jobId);
    if (error) throw new Error(error.message);
  }

  async cancel(jobId: string): Promise<void> {
    const { error } = await (supabase as any)
      .from("job_queue")
      .update({ status: "failed", last_error: "Cancelled by user", updated_at: new Date().toISOString() })
      .eq("id", jobId)
      .eq("status", "pending");
    if (error) throw new Error(error.message);
  }

  // ── Dead Letter Queue ─────────────────────────────────────────────────────

  async getDeadLetterJobs(tenantId: string, opts: { requeued?: boolean; limit?: number } = {}): Promise<DeadLetterJob[]> {
    let q = (supabase as any)
      .from("dead_letter_jobs")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("archived_at", { ascending: false })
      .limit(opts.limit ?? 100);
    if (opts.requeued !== undefined) q = q.eq("requeued", opts.requeued);
    const { data } = await q;
    return (data ?? []).map(mapDeadLetterJob);
  }

  async requeueDeadLetter(dlqId: string): Promise<string> {
    const { data, error } = await (supabase as any)
      .rpc("fn_requeue_dead_letter", { _dlj_id: dlqId });
    if (error) throw new Error(error.message);
    return data as string;
  }

  async purgeDeadLetterJobs(tenantId: string): Promise<void> {
    await (supabase as any)
      .from("dead_letter_jobs")
      .delete()
      .eq("tenant_id", tenantId)
      .eq("requeued", false);
    // Also clear dead_letter flag on job_queue
    await (supabase as any)
      .from("job_queue")
      .delete()
      .eq("tenant_id", tenantId)
      .eq("dead_letter", true);
  }

  // ── Scheduled Jobs ────────────────────────────────────────────────────────

  async listScheduledJobs(tenantId: string): Promise<ScheduledJob[]> {
    const { data } = await (supabase as any)
      .from("scheduled_jobs")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("name");
    return (data ?? []).map(mapScheduledJob);
  }

  async toggleScheduledJob(id: string, isActive: boolean): Promise<void> {
    await (supabase as any)
      .from("scheduled_jobs")
      .update({ is_active: isActive, updated_at: new Date().toISOString() })
      .eq("id", id);
  }

  async updateScheduledJobCron(id: string, cronExpr: string): Promise<void> {
    await (supabase as any)
      .from("scheduled_jobs")
      .update({ cron_expr: cronExpr, updated_at: new Date().toISOString() })
      .eq("id", id);
  }

  // ── Recovery ──────────────────────────────────────────────────────────────

  async recoverStaleJobs(): Promise<number> {
    const { data, error } = await (supabase as any)
      .rpc("fn_recover_stale_jobs", { _stale_seconds: 300 });
    if (error) throw new Error(error.message);
    return (data as number) ?? 0;
  }
}

export const queueService = new QueueService();

// ── Convenience shims (backward-compat with existing callers) ─────────────────

export async function enqueue(params: EnqueueParams): Promise<string | null> {
  return queueService.enqueue(params);
}

export async function scheduleJob(params: Omit<EnqueueParams, "runAt"> & { runAt: Date }): Promise<string | null> {
  return queueService.schedule(params);
}

export async function delayJob(params: EnqueueParams, delayMs: number): Promise<string | null> {
  return queueService.delay(params, delayMs);
}

export async function getQueueStats(tenantId: string) {
  const stats = await queueService.getStats(tenantId);
  // Aggregate across all queues for backward compat
  const agg = stats.reduce((acc, s) => ({
    pending:   acc.pending   + s.pending,
    running:   acc.running   + s.running,
    completed: acc.completed + s.completed,
    failed:    acc.failed    + s.failed,
    dead:      acc.dead      + s.dead,
    total:     acc.total     + s.total,
  }), { pending: 0, running: 0, completed: 0, failed: 0, dead: 0, total: 0 });
  return {
    ...agg,
    byQueue: Object.fromEntries(stats.map((s) => [s.queueName, s.total])),
  };
}

export async function getRecentJobs(tenantId: string, limit = 100, queueName?: QueueName) {
  return queueService.list(tenantId, { queueName, limit });
}

export async function getDeadLetterJobs(tenantId: string) {
  return queueService.getDeadLetterJobs(tenantId, { requeued: false });
}

export async function retryJob(jobId: string): Promise<void> {
  return queueService.retry(jobId);
}

export async function cancelJob(jobId: string): Promise<void> {
  return queueService.cancel(jobId);
}

export async function purgeDeadLetterQueue(tenantId: string): Promise<void> {
  return queueService.purgeDeadLetterJobs(tenantId);
}

// ── Event Bus ─────────────────────────────────────────────────────────────────

type EventRoute = { type: JobType; queue: QueueName; priority: number };

const EVENT_ROUTING: Record<string, EventRoute> = {
  "payment.received":              { type: "provision_service",      queue: "provisioning",  priority: 1 },
  "payment.failed":                { type: "send_sms",               queue: "notifications", priority: 2 },
  "payment.retry":                 { type: "retry_payment",          queue: "mpesa",         priority: 2 },
  "subscription.expired":          { type: "expiry_check_workflow",  queue: "provisioning",  priority: 2 },
  "subscription.suspended":        { type: "send_sms",               queue: "notifications", priority: 2 },
  "subscription.activated":        { type: "send_sms",               queue: "notifications", priority: 3 },
  "router.offline":                { type: "notify_admin",           queue: "router_sync",   priority: 1 },
  "router.sync":                   { type: "sync_router",            queue: "router_sync",   priority: 3 },
  "fraud.detected":                { type: "fraud_check",            queue: "fraud",         priority: 1 },
  "automation.trigger":            { type: "run_automation",         queue: "default",       priority: 3 },
  "backup.scheduled":              { type: "backup_config",          queue: "backup",        priority: 5 },
  "report.requested":              { type: "generate_report",        queue: "reports",       priority: 4 },
  "notification.sms":              { type: "send_sms",               queue: "notifications", priority: 3 },
  "notification.whatsapp":         { type: "send_whatsapp",          queue: "notifications", priority: 3 },
  "notification.email":            { type: "send_email",             queue: "notifications", priority: 3 },
  "voucher.generate":              { type: "generate_vouchers",      queue: "default",       priority: 4 },
};

export async function emit(
  tenantId: string,
  event: string,
  payload: Record<string, unknown>
): Promise<void> {
  const route = EVENT_ROUTING[event];
  if (!route) return;
  await queueService.enqueue({
    tenantId,
    type:            route.type,
    payload:         { event, ...payload },
    priority:        route.priority,
    queueName:       route.queue,
    idempotencyKey:  payload["idempotency_key"] as string | undefined,
  });
}

export const QUEUE_NAMES: QueueName[] = [
  "default", "mpesa", "notifications", "provisioning",
  "billing", "router_sync", "reports", "backup", "fraud",
];

export const QUEUE_LABELS: Record<QueueName, string> = {
  default:      "Default",
  mpesa:        "M-Pesa",
  notifications:"Notifications",
  provisioning: "Provisioning",
  billing:      "Billing",
  router_sync:  "Router Sync",
  reports:      "Reports",
  backup:       "Backup",
  fraud:        "Fraud",
};
