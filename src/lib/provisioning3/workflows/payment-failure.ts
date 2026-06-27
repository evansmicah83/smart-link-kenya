/**
 * SmartLinkNet — Phase 3: Payment Failure Workflow
 * Steps: record_failure → retry_payment → notify_customer → create_audit_log
 */
import { supabase } from "@/integrations/supabase/client";
import type { StepDefinition } from "../types";

const now = () => new Date().toISOString();
const MAX_PAYMENT_RETRIES = 3;

export function buildPaymentFailureSteps(): StepDefinition[] {
  return [

    // ── Step 1: Record Failure ───────────────────────────────────────────────
    {
      name: "record_failure",
      type: "record_failure",
      canCompensate: false,
      input: (p) => ({
        payment_id:  p["payment_id"],
        customer_id: p["customer_id"],
        amount:      p["amount"],
        tenant_id:   p["tenant_id"],
        reason:      p["failure_reason"] ?? "Payment declined",
      }),
      async execute(input) {
        // Mark payment as failed
        await (supabase as any).from("payments").update({
          status:    "failed",
          metadata:  { failure_reason: input["reason"], failed_at: now() },
        }).eq("id", input["payment_id"]).catch(() => {});

        // Get retry count from existing failed attempts
        const { count } = await (supabase as any)
          .from("payments")
          .select("id", { count: "exact", head: true })
          .eq("customer_id", input["customer_id"])
          .eq("status", "failed");

        const retryCount = count ?? 0;
        const shouldRetry = retryCount < MAX_PAYMENT_RETRIES;

        return {
          payment_id:   input["payment_id"],
          customer_id:  input["customer_id"],
          retry_count:  retryCount,
          should_retry: shouldRetry,
          reason:       input["reason"],
        };
      },
    },

    // ── Step 2: Retry Processing ─────────────────────────────────────────────
    {
      name: "retry_payment",
      type: "retry_payment",
      canCompensate: false,
      input: (_p, ctx) => ({
        payment_id:   ctx.results["record_failure"]?.["payment_id"],
        customer_id:  ctx.results["record_failure"]?.["customer_id"],
        should_retry: ctx.results["record_failure"]?.["should_retry"] ?? false,
        retry_count:  ctx.results["record_failure"]?.["retry_count"] ?? 0,
        tenant_id:    _p["tenant_id"],
      }),
      async execute(input) {
        if (!input["should_retry"]) {
          return { retry_scheduled: false, reason: "max_retries_exceeded" };
        }

        // Exponential backoff: 10min, 1h, 24h
        const backoffMs = [600_000, 3_600_000, 86_400_000][
          Math.min(input["retry_count"] as number, 2)
        ];
        const retryAt = new Date(Date.now() + backoffMs).toISOString();

        // Schedule a new payment retry job
        await (supabase as any).from("job_queue").insert({
          tenant_id:  input["tenant_id"],
          type:       "retry_payment",
          payload:    {
            payment_id:  input["payment_id"],
            customer_id: input["customer_id"],
            retry_count: (input["retry_count"] as number) + 1,
          },
          priority:   2,
          queue_name: "payments",
          run_at:     retryAt,
          status:     "pending",
        });

        return {
          retry_scheduled: true,
          retry_at:        retryAt,
          retry_number:    (input["retry_count"] as number) + 1,
        };
      },
    },

    // ── Step 3: Notify Customer ──────────────────────────────────────────────
    {
      name: "notify_customer",
      type: "send_sms",
      canCompensate: false,
      input: (p, ctx) => ({
        tenant_id:       p["tenant_id"],
        customer_id:     ctx.results["record_failure"]?.["customer_id"] ?? p["customer_id"],
        should_retry:    ctx.results["record_failure"]?.["should_retry"] ?? false,
        retry_at:        ctx.results["retry_payment"]?.["retry_at"],
        reason:          ctx.results["record_failure"]?.["reason"] ?? "Payment declined",
        retry_number:    ctx.results["retry_payment"]?.["retry_number"] ?? 0,
      }),
      async execute(input) {
        const { data: customer } = await (supabase as any)
          .from("customers").select("phone, full_name").eq("id", input["customer_id"]).maybeSingle();
        if (!customer?.phone) return { sms_sent: false, reason: "no_phone" };

        let message: string;
        if (input["should_retry"] && input["retry_at"]) {
          const retryDate = new Date(input["retry_at"] as string).toLocaleString();
          message = `Hi ${customer.full_name ?? "Customer"}, your payment failed (${input["reason"]}). We will retry on ${retryDate}. Please ensure sufficient balance. – SmartLinkNet`;
        } else {
          message = `Hi ${customer.full_name ?? "Customer"}, your payment could not be processed after multiple attempts. Please contact support or make a manual payment. – SmartLinkNet`;
        }

        await (supabase as any).from("job_queue").insert({
          tenant_id:  input["tenant_id"],
          type:       "send_sms",
          payload:    { phone: customer.phone, message, customer_id: input["customer_id"] },
          priority:   2,
          queue_name: "notifications",
          run_at:     now(),
          status:     "pending",
        });

        // Also notify admin if retries exhausted
        if (!input["should_retry"]) {
          await (supabase as any).from("job_queue").insert({
            tenant_id:  input["tenant_id"],
            type:       "notify_admin",
            payload:    {
              title:       "Payment Failure – Retries Exhausted",
              message:     `Customer ${input["customer_id"]} payment has failed ${MAX_PAYMENT_RETRIES} times.`,
              event:       "payment.failure.exhausted",
              customer_id: input["customer_id"],
            },
            priority:   1,
            queue_name: "notifications",
            run_at:     now(),
            status:     "pending",
          });
        }

        return { sms_queued: true, admin_notified: !input["should_retry"] };
      },
    },

    // ── Step 4: Create Audit Log ─────────────────────────────────────────────
    {
      name: "create_audit_log",
      type: "create_audit_log",
      canCompensate: false,
      input: (p, ctx) => ({
        tenant_id:   p["tenant_id"],
        payment_id:  p["payment_id"],
        customer_id: ctx.results["record_failure"]?.["customer_id"] ?? p["customer_id"],
        reason:      ctx.results["record_failure"]?.["reason"],
        should_retry:ctx.results["record_failure"]?.["should_retry"],
        retry_at:    ctx.results["retry_payment"]?.["retry_at"],
      }),
      async execute(input, ctx) {
        await (supabase as any).from("audit_trail").insert({
          tenant_id:   input["tenant_id"],
          workflow_id: ctx.workflowId,
          entity_type: "payment",
          entity_id:   input["payment_id"] as string ?? null,
          action:      input["should_retry"] ? "payment_failure_retry_scheduled" : "payment_failure_exhausted",
          after_state: {
            reason:      input["reason"],
            retry_at:    input["retry_at"] ?? null,
            customer_id: input["customer_id"],
          },
          actor:       "provisioning_engine",
          actor_type:  "system",
          occurred_at: now(),
        }).catch(() => {});
        return { audit_created: true };
      },
    },
  ];
}
