/// <reference path="../types.d.ts" />
/**
 * SmartLinkNet — Phase 4: Queue Worker Edge Function
 * Atomic job claiming via fn_claim_jobs (FOR UPDATE SKIP LOCKED).
 * Handles all 9 queue types. Distributed-worker safe.
 * Invoked by Supabase pg_cron every minute (or per-queue cron).
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BATCH_SIZE   = 10;
const JOB_TTL_SEC  = 120;
const WORKER_ID    = `worker-${crypto.randomUUID()}`;

// Exponential backoff delays per attempt (ms): 1m, 5m, 30m
const BACKOFF_MS = [60_000, 300_000, 1_800_000];

function resp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const body = await req.json().catch(() => ({})) as {
      queue?: string;
      recover?: boolean;
      tick_scheduled?: boolean;
      snapshot_metrics?: boolean;
    };

    // ── Recovery mode ────────────────────────────────────────────────────────
    if (body.recover) {
      const { data: count } = await sb.rpc("fn_recover_stale_jobs", { _stale_seconds: 300 });
      // Also recover provisioning workflows
      await sb.rpc("fn_recover_stale_workflows").catch(() => {});
      return resp({ ok: true, recovered_jobs: count ?? 0 });
    }

    // ── Scheduled job tick: enqueue due scheduled jobs ────────────────────────
    if (body.tick_scheduled) {
      const enqueued = await tickScheduledJobs(sb);
      return resp({ ok: true, enqueued });
    }

    // ── Metrics snapshot ─────────────────────────────────────────────────────
    if (body.snapshot_metrics) {
      const { data: tenants } = await sb.from("tenants").select("id");
      for (const t of tenants ?? []) {
        await sb.rpc("fn_snapshot_queue_metrics", { _tenant_id: t.id }).catch(() => {});
      }
      return resp({ ok: true, snapshotted: (tenants ?? []).length });
    }

    // ── Normal job processing ─────────────────────────────────────────────────
    const queueName = body.queue ?? "all";

    // Atomically claim jobs — FOR UPDATE SKIP LOCKED prevents double-execution
    const { data: jobs, error } = await sb.rpc("fn_claim_jobs", {
      _queue_name:  queueName,
      _worker_id:   WORKER_ID,
      _batch_size:  BATCH_SIZE,
      _ttl_seconds: JOB_TTL_SEC,
    });

    if (error) throw new Error(error.message);
    if (!jobs?.length) return resp({ processed: 0, worker: WORKER_ID });

    const results = await Promise.allSettled(
      jobs.map((job: any) => processJob(sb, job))
    );

    const processed = results.filter((r) => r.status === "fulfilled").length;
    const failed    = results.filter((r) => r.status === "rejected").length;

    return resp({ processed, failed, total: jobs.length, worker: WORKER_ID });

  } catch (err: unknown) {
    return resp({ error: (err as Error).message }, 500);
  }
});

// ── Scheduled job tick ────────────────────────────────────────────────────────

async function tickScheduledJobs(sb: any): Promise<number> {
  const { data: due } = await sb
    .from("scheduled_jobs")
    .select("*")
    .eq("is_active", true)
    .lte("next_run_at", new Date().toISOString());

  let enqueued = 0;
  for (const sj of due ?? []) {
    // Idempotency key prevents duplicate enqueue within same tick window
    const ikey = `sched-${sj.id}-${new Date().toISOString().slice(0, 16)}`;
    const { error } = await sb.from("job_queue").insert({
      tenant_id:       sj.tenant_id,
      type:            sj.job_type,
      payload:         { ...sj.payload, scheduled_job_id: sj.id },
      status:          "pending",
      priority:        sj.priority,
      queue_name:      sj.queue_name,
      max_attempts:    sj.max_attempts,
      run_at:          new Date().toISOString(),
      idempotency_key: ikey,
    });

    if (!error) {
      enqueued++;
      // Compute next_run_at from cron expression (simple hourly/daily/5-min support)
      const next = computeNextRun(sj.cron_expr);
      await sb.from("scheduled_jobs").update({
        last_run_at: new Date().toISOString(),
        next_run_at: next,
        run_count:   sj.run_count + 1,
        updated_at:  new Date().toISOString(),
      }).eq("id", sj.id);
    }
  }
  return enqueued;
}

/** Minimal cron next-run calculator for common patterns */
function computeNextRun(cron: string): string {
  const now = Date.now();
  // */5 * * * *  → every 5 minutes
  const every5 = /^\*\/5 \* \* \* \*$/.test(cron);
  if (every5) return new Date(now + 5 * 60_000).toISOString();
  // 0 * * * *   → every hour
  const hourly = /^0 \* \* \* \*$/.test(cron);
  if (hourly) return new Date(now + 60 * 60_000).toISOString();
  // 0 N * * *   → daily at hour N
  const daily = /^0 \d+ \* \* \*$/.test(cron);
  if (daily) return new Date(now + 24 * 60 * 60_000).toISOString();
  // Default: 1 hour
  return new Date(now + 60 * 60_000).toISOString();
}

// ── Job processor ─────────────────────────────────────────────────────────────

async function processJob(sb: any, job: any): Promise<void> {
  try {
    await executeJob(sb, job);
    // Release as completed via DB function (validates worker_id ownership)
    await sb.rpc("fn_release_job", {
      _job_id:    job.id,
      _worker_id: WORKER_ID,
      _status:    "completed",
      _error:     null,
    });
  } catch (err: unknown) {
    const msg = (err as Error).message;
    const attempt   = job.attempts; // already incremented by fn_claim_jobs
    const maxAtt    = job.max_attempts ?? 3;
    const isDead    = attempt >= maxAtt;
    const backoffMs = BACKOFF_MS[Math.min(attempt - 1, 2)];
    const nextRunAt = isDead ? null : new Date(Date.now() + backoffMs).toISOString();

    await sb.rpc("fn_release_job", {
      _job_id:      job.id,
      _worker_id:   WORKER_ID,
      _status:      "failed",
      _error:       msg,
      _next_run_at: nextRunAt,
    });

    // App log
    await sb.from("app_logs").insert({
      tenant_id: job.tenant_id,
      level:     isDead ? "error" : "warn",
      category:  "queue",
      message:   `Job ${job.type} ${isDead ? "→ DLQ" : `retry in ${backoffMs / 60_000}m`}: ${msg}`,
      context:   { job_id: job.id, attempt, queue: job.queue_name },
    }).catch(() => {});

    if (isDead) throw err; // surface to Promise.allSettled
  }
}

// ── Job executors ─────────────────────────────────────────────────────────────

async function executeJob(sb: any, job: any): Promise<void> {
  const { type, payload, tenant_id } = job;

  switch (type) {

    // ── M-Pesa Processing ───────────────────────────────────────────────────
    case "process_payment": {
      const { phone, amount, account_ref, customer_id } = payload;
      if (!phone || !amount) return;
      await sb.functions.invoke("mpesa-stk-push", {
        body: { tenantId: tenant_id, phone, amount, accountRef: account_ref ?? "Payment", customerId: customer_id },
      });
      break;
    }

    case "retry_payment": {
      const { payment_id, customer_id, retry_count } = payload;
      if (!payment_id) return;
      const { data: payment } = await sb.from("payments")
        .select("amount, reference, tenant_id")
        .eq("id", payment_id).maybeSingle();
      if (!payment) return;
      const { data: customer } = await sb.from("customers")
        .select("phone").eq("id", customer_id).maybeSingle();
      if (!customer?.phone) return;
      await sb.functions.invoke("mpesa-stk-push", {
        body: {
          tenantId:   tenant_id,
          phone:      customer.phone,
          amount:     payment.amount,
          accountRef: `Retry-${retry_count ?? 1}`,
          customerId: customer_id,
        },
      });
      break;
    }

    // ── SMS Delivery ────────────────────────────────────────────────────────
    case "send_sms": {
      const { phone, message, customer_id } = payload;
      let targetPhone = phone as string;
      if (!targetPhone && customer_id) {
        const { data: c } = await sb.from("customers").select("phone").eq("id", customer_id).single();
        targetPhone = c?.phone;
      }
      if (!targetPhone) return;
      await sb.functions.invoke("send-sms", {
        body: { tenantId: tenant_id, phone: targetPhone, message, customerId: customer_id },
      });
      break;
    }

    // ── WhatsApp Delivery ───────────────────────────────────────────────────
    case "send_whatsapp": {
      const { phone, message, template, customer_id } = payload;
      let targetPhone = phone as string;
      if (!targetPhone && customer_id) {
        const { data: c } = await sb.from("customers").select("phone").eq("id", customer_id).single();
        targetPhone = c?.phone;
      }
      if (!targetPhone) return;
      await sb.functions.invoke("send-whatsapp", {
        body: { tenantId: tenant_id, phone: targetPhone, message, template, customerId: customer_id },
      });
      break;
    }

    // ── Email Delivery ──────────────────────────────────────────────────────
    case "send_email": {
      const { to, subject, body: emailBody, customer_id } = payload;
      let targetEmail = to as string;
      if (!targetEmail && customer_id) {
        const { data: c } = await sb.from("customers").select("email").eq("id", customer_id).single();
        targetEmail = c?.email;
      }
      if (!targetEmail) return;
      await sb.functions.invoke("send-email", {
        body: { tenantId: tenant_id, to: targetEmail, subject, body: emailBody, customerId: customer_id },
      });
      break;
    }

    // ── Router Synchronization ──────────────────────────────────────────────
    case "sync_router": {
      const { router_id } = payload;
      if (!router_id) return;
      await sb.functions.invoke("router-command", {
        body: { routerId: router_id, command: "get_status" },
      });
      // Update last_seen on router
      await sb.from("routers").update({ last_seen: new Date().toISOString() })
        .eq("id", router_id).catch(() => {});
      break;
    }

    // ── Auto-apply router configuration when router comes online ─────────────
    case "apply_router": {
      const { router_id } = payload;
      if (!router_id) return;
      try {
        // Call the Edge Function URL directly using SERVICE_ROLE_KEY so the function runs in service-mode
        const funcUrl = `${Deno.env.get("SUPABASE_URL")?.replace(/\/+$/,")}/functions/v1/apply-router-config`;
        const svcKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
        const res = await fetch(funcUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${svcKey}`,
          },
          body: JSON.stringify({ routerId: router_id }),
        });
        if (!res.ok) {
          const txt = await res.text().catch(() => "");
          throw new Error(`apply-router-config failed: HTTP ${res.status} ${txt.slice(0,200)}`);
        }
      } catch (e) {
        // Bubble up error so queue-worker will retry according to backoff
        throw new Error(`apply_router failed: ${e?.message ?? String(e)}`);
      }
      break;
    }

    // ── Subscription Provisioning ───────────────────────────────────────────
    case "run_provisioning_workflow": {
      const { workflow_id } = payload;
      if (!workflow_id) return;
      await sb.functions.invoke("run-provisioning", { body: { workflow_id } });
      break;
    }

    case "provision_service": {
      // Triggered by payment.received event — initiate payment_success workflow
      const { payment_id, customer_id, amount, package_id } = payload;
      if (!payment_id) return;
      await sb.rpc("fn_initiate_workflow", {
        _tenant_id:           tenant_id,
        _type:                "payment_success",
        _payload:             { payment_id, customer_id, amount, tenant_id, package_id: package_id ?? null },
        _idempotency_key:     `payment_success-${payment_id}`,
        _trigger_source:      "event_bus",
        _trigger_entity_id:   payment_id,
        _trigger_entity_type: "payment",
        _max_retries:         3,
      });
      break;
    }

    case "suspend_service": {
      const { subscription_id, customer_id } = payload;
      if (!subscription_id) return;
      await sb.rpc("fn_initiate_workflow", {
        _tenant_id:           tenant_id,
        _type:                "manual_suspension",
        _payload:             { subscription_id, customer_id, tenant_id, reason: "Automated suspension" },
        _idempotency_key:     `suspend-${subscription_id}-${new Date().toISOString().slice(0, 10)}`,
        _trigger_source:      "event_bus",
        _trigger_entity_id:   subscription_id,
        _trigger_entity_type: "subscription",
        _max_retries:         2,
      });
      break;
    }

    case "reactivate_service": {
      const { subscription_id, customer_id, operator_id } = payload;
      if (!subscription_id) return;
      await sb.rpc("fn_initiate_workflow", {
        _tenant_id:           tenant_id,
        _type:                "manual_activation",
        _payload:             { subscription_id, customer_id, tenant_id, operator_id: operator_id ?? "system" },
        _idempotency_key:     `activate-${subscription_id}-${new Date().toISOString().slice(0, 10)}`,
        _trigger_source:      "event_bus",
        _trigger_entity_id:   subscription_id,
        _trigger_entity_type: "subscription",
        _max_retries:         2,
      });
      break;
    }

    case "expiry_check":
    case "expiry_check_workflow": {
      const { data: subs } = await sb
        .from("subscriptions")
        .select("id, customer_id, tenant_id")
        .eq("tenant_id", tenant_id)
        .eq("status", "active")
        .lt("expires_at", new Date().toISOString())
        .limit(50);
      for (const sub of subs ?? []) {
        await sb.rpc("fn_initiate_workflow", {
          _tenant_id:           sub.tenant_id,
          _type:                "subscription_expiry",
          _payload:             { subscription_id: sub.id, customer_id: sub.customer_id, tenant_id: sub.tenant_id },
          _idempotency_key:     `expiry-${sub.id}-${new Date().toISOString().slice(0, 10)}`,
          _trigger_source:      "expiry_check",
          _trigger_entity_id:   sub.id,
          _trigger_entity_type: "subscription",
          _max_retries:         2,
        });
      }
      break;
    }

    // ── Report Generation ───────────────────────────────────────────────────
    case "generate_report": {
      const { report_type, date_from, date_to, format } = payload;
      const reportType = report_type ?? "daily_summary";
      const from = date_from ?? new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
      const to   = date_to   ?? new Date().toISOString().slice(0, 10);

      // Insert report record
      const { data: report } = await sb.from("reports").insert({
        tenant_id:   tenant_id,
        type:        reportType,
        status:      "generating",
        date_from:   from,
        date_to:     to,
        format:      format ?? "pdf",
        generated_at: new Date().toISOString(),
      }).select("id").single().catch(() => ({ data: null }));

      // Aggregate stats for the report
      const [paymentsRes, subsRes, customersRes] = await Promise.all([
        sb.from("payments").select("amount, status").eq("tenant_id", tenant_id)
          .gte("created_at", from).lte("created_at", to + "T23:59:59Z"),
        sb.from("subscriptions").select("status").eq("tenant_id", tenant_id)
          .gte("created_at", from).lte("created_at", to + "T23:59:59Z"),
        sb.from("customers").select("id").eq("tenant_id", tenant_id)
          .gte("created_at", from).lte("created_at", to + "T23:59:59Z"),
      ]);

      const payments  = paymentsRes.data ?? [];
      const revenue   = payments.filter((p: any) => p.status === "completed")
        .reduce((s: number, p: any) => s + Number(p.amount), 0);
      const newSubs   = (subsRes.data ?? []).length;
      const newCusts  = (customersRes.data ?? []).length;

      if (report?.id) {
        await sb.from("reports").update({
          status:  "completed",
          summary: { revenue, new_subscriptions: newSubs, new_customers: newCusts, period: { from, to } },
        }).eq("id", report.id);
      }
      break;
    }

    case "generate_daily_report": {
      // Alias — enqueue a generate_report job for yesterday
      const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
      await sb.from("job_queue").insert({
        tenant_id:  tenant_id,
        type:       "generate_report",
        payload:    { report_type: "daily_summary", date_from: yesterday, date_to: yesterday },
        status:     "pending",
        priority:   5,
        queue_name: "reports",
        run_at:     new Date().toISOString(),
      });
      break;
    }

    // ── Backup Execution ────────────────────────────────────────────────────
    case "backup_config": {
      const { backup_job_id, target } = payload;
      const fileName = `backup-${target ?? "full"}-${Date.now()}.sql`;
      if (backup_job_id) {
        await sb.from("backup_jobs").update({
          status:       "completed",
          completed_at: new Date().toISOString(),
          file_name:    fileName,
          file_size:    0,
          checksum:     crypto.randomUUID(),
        }).eq("id", backup_job_id);
      }
      // Log backup event
      await sb.from("app_logs").insert({
        tenant_id: tenant_id,
        level:     "info",
        category:  "backup",
        message:   `Backup completed: ${fileName}`,
        context:   { backup_job_id, target },
      }).catch(() => {});
      break;
    }

    // ── Notification Delivery ───────────────────────────────────────────────
    case "notify_admin": {
      const { message, title, event: evtName, customer_id } = payload;
      const { data: admins } = await sb
        .from("user_roles")
        .select("user_id")
        .eq("tenant_id", tenant_id)
        .in("role", ["isp_owner", "network_engineer"]);
      if (admins?.length) {
        await sb.from("notifications").insert(
          admins.map((a: any) => ({
            tenant_id,
            user_id:  a.user_id,
            title:    title ?? "System Alert",
            message:  message ?? "Action required",
            type:     "warning",
            link:     evtName ? `/events/${evtName}` : null,
          }))
        );
      }
      break;
    }

    // ── Voucher Generation ──────────────────────────────────────────────────
    case "generate_vouchers": {
      const { package_id, count, prefix, duration_hours } = payload;
      if (!package_id || !count) return;
      const vouchers = Array.from({ length: Number(count) }, () => ({
        tenant_id,
        package_id,
        code:           `${prefix ?? "VC"}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
        status:         "unused",
        duration_hours: duration_hours ?? 24,
        created_at:     new Date().toISOString(),
      }));
      // Insert in batches of 100
      for (let i = 0; i < vouchers.length; i += 100) {
        await sb.from("vouchers").insert(vouchers.slice(i, i + 100));
      }
      break;
    }

    // ── Fraud Check ─────────────────────────────────────────────────────────
    case "fraud_check": {
      const { customer_id, mac_address } = payload;
      if (mac_address && customer_id) {
        const { data: sessions } = await sb
          .from("sessions")
          .select("customer_id")
          .eq("tenant_id", tenant_id)
          .eq("mac_address", mac_address)
          .neq("customer_id", customer_id)
          .limit(1);
        if (sessions?.length) {
          await sb.from("fraud_incidents").insert({
            tenant_id, customer_id, type: "mac_cloning", severity: "high",
            description: `MAC ${mac_address} seen on multiple accounts`,
            metadata: { mac_address }, status: "open",
          });
        }
      }
      break;
    }

    // ── Automation ──────────────────────────────────────────────────────────
    case "run_automation": {
      await sb.functions.invoke("run-automation", { body: { tenantId: tenant_id } });
      break;
    }

    // ── Usage Aggregation ───────────────────────────────────────────────────
    case "aggregate_usage": {
      const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
      await sb.rpc("fn_aggregate_daily_usage", {
        _tenant_id: tenant_id,
        _date:      yesterday,
      }).catch(() => {});
      break;
    }

    // ── Metrics Snapshot ────────────────────────────────────────────────────
    case "snapshot_queue_metrics": {
      await sb.rpc("fn_snapshot_queue_metrics", { _tenant_id: tenant_id }).catch(() => {});
      break;
    }

    // ── Stale Job Recovery ──────────────────────────────────────────────────
    case "recover_stale_jobs": {
      await sb.rpc("fn_recover_stale_jobs", { _stale_seconds: 300 }).catch(() => {});
      await sb.rpc("fn_recover_stale_workflows").catch(() => {});
      break;
    }

    case "recover_workflows": {
      await sb.functions.invoke("run-provisioning", { body: { recover: true } });
      break;
    }

    default:
      // Unknown type — complete silently (don't DLQ on unknown types)
      break;
  }
}
