/**
 * SmartLinkNet — Job Queue & Event Processing System
 * DB-backed queues with retry policies, DLQ, scheduled jobs,
 * delayed jobs, prioritized queues, and idempotency.
 */
import { supabase } from "@/integrations/supabase/client";

export type JobType =
  | "provision_service"
  | "suspend_service"
  | "reactivate_service"
  | "send_sms"
  | "send_whatsapp"
  | "send_email"
  | "sync_router"
  | "generate_vouchers"
  | "generate_report"
  | "process_payment"
  | "backup_config"
  | "notify_admin"
  | "fraud_check"
  | "run_automation"
  | "aggregate_usage"
  | "expiry_check";

export type QueueName =
  | "default"
  | "notifications"
  | "provisioning"
  | "billing"
  | "backup"
  | "router_sync"
  | "reports"
  | "fraud";

export interface EnqueueParams {
  tenantId: string;
  type: JobType;
  payload: Record<string, unknown>;
  runAt?: Date;
  priority?: number;           // 1 (highest) – 10 (lowest)
  queue_name?: QueueName;
  idempotencyKey?: string;     // prevents duplicate jobs
  maxAttempts?: number;
}

// ─── Enqueue ──────────────────────────────────────────────────────────────────

export async function enqueue(params: EnqueueParams): Promise<string | null> {
  const { data, error } = await (supabase as any)
    .from("job_queue")
    .insert({
      tenant_id: params.tenantId,
      type: params.type,
      payload: params.payload,
      status: "pending",
      priority: params.priority ?? 5,
      run_at: (params.runAt ?? new Date()).toISOString(),
      attempts: 0,
      max_attempts: params.maxAttempts ?? 3,
      queue_name: params.queue_name ?? "default",
      idempotency_key: params.idempotencyKey ?? null,
    })
    .select("id")
    .single();
  if (error) {
    // idempotency conflict is acceptable — not a real error
    if (error.code === "23505") return null;
    console.error("enqueue error:", error.message);
    return null;
  }
  return data?.id ?? null;
}

/** Schedule a job to run at a future time */
export async function scheduleJob(params: Omit<EnqueueParams, "runAt"> & { runAt: Date }): Promise<string | null> {
  return enqueue(params);
}

/** Delay a job by given milliseconds */
export async function delayJob(params: EnqueueParams, delayMs: number): Promise<string | null> {
  return enqueue({ ...params, runAt: new Date(Date.now() + delayMs) });
}

// ─── Stats & Monitoring ───────────────────────────────────────────────────────

export async function getQueueStats(tenantId: string) {
  const { data } = await (supabase as any)
    .from("job_queue")
    .select("status, type, queue_name, dead_letter")
    .eq("tenant_id", tenantId);
  const rows = (data ?? []) as { status: string; type: string; queue_name: string; dead_letter: boolean }[];
  return {
    pending:   rows.filter((r) => r.status === "pending"   && !r.dead_letter).length,
    running:   rows.filter((r) => r.status === "running"   && !r.dead_letter).length,
    completed: rows.filter((r) => r.status === "completed" && !r.dead_letter).length,
    failed:    rows.filter((r) => r.status === "failed"    && !r.dead_letter).length,
    dead:      rows.filter((r) => r.dead_letter).length,
    total:     rows.filter((r) => !r.dead_letter).length,
    byQueue: Object.fromEntries(
      [...new Set(rows.map((r) => r.queue_name))].map((q) => [
        q, rows.filter((r) => r.queue_name === q && !r.dead_letter).length
      ])
    ),
    byType: Object.fromEntries(
      [...new Set(rows.map((r) => r.type))].map((t) => [
        t, rows.filter((r) => r.type === t && !r.dead_letter).length
      ])
    ),
  };
}

export async function getRecentJobs(tenantId: string, limit = 100, queueName?: QueueName) {
  let q = (supabase as any)
    .from("job_queue")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (queueName) q = q.eq("queue_name", queueName);
  const { data } = await q;
  return (data ?? []) as any[];
}

export async function getDeadLetterJobs(tenantId: string) {
  const { data } = await (supabase as any)
    .from("job_queue")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("dead_letter", true)
    .order("created_at", { ascending: false });
  return (data ?? []) as any[];
}

// ─── Job Actions ──────────────────────────────────────────────────────────────

export async function retryJob(jobId: string): Promise<void> {
  const { error } = await (supabase as any)
    .from("job_queue")
    .update({ status: "pending", attempts: 0, last_error: null, dead_letter: false, run_at: new Date().toISOString() })
    .eq("id", jobId);
  if (error) throw error;
}

export async function cancelJob(jobId: string): Promise<void> {
  const { error } = await (supabase as any)
    .from("job_queue")
    .update({ status: "failed", last_error: "Cancelled by user" })
    .eq("id", jobId)
    .eq("status", "pending");
  if (error) throw error;
}

export async function purgeDeadLetterQueue(tenantId: string): Promise<void> {
  await (supabase as any)
    .from("job_queue")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("dead_letter", true);
}

// ─── Event Bus ────────────────────────────────────────────────────────────────

/** Emit a domain event by enqueueing it with appropriate queue routing */
export async function emit(
  tenantId: string,
  event: string,
  payload: Record<string, unknown>
): Promise<void> {
  const routingMap: Record<string, { type: JobType; queue: QueueName; priority: number }> = {
    "payment.received":            { type: "provision_service",  queue: "provisioning",  priority: 1 },
    "payment.failed":              { type: "send_sms",           queue: "notifications", priority: 2 },
    "subscription.expired":        { type: "expiry_check",       queue: "provisioning",  priority: 2 },
    "subscription.suspended":      { type: "send_sms",           queue: "notifications", priority: 2 },
    "router.offline":              { type: "notify_admin",       queue: "router_sync",   priority: 1 },
    "fraud.detected":              { type: "fraud_check",        queue: "fraud",         priority: 1 },
    "automation.trigger":          { type: "run_automation",     queue: "default",       priority: 3 },
    "backup.scheduled":            { type: "backup_config",      queue: "backup",        priority: 5 },
  };
  const route = routingMap[event];
  if (!route) return;
  await enqueue({
    tenantId,
    type: route.type,
    payload: { event, ...payload },
    priority: route.priority,
    queue_name: route.queue,
    idempotencyKey: payload.idempotency_key as string | undefined,
  });
}
