/**
 * SmartLinkNet — Phase 3: Subscription Expiry Workflow
 * Steps: check_grace_period → suspend_service → update_router →
 *        notify_customer → create_audit_log
 */
import { supabase } from "@/integrations/supabase/client";
import type { StepDefinition } from "../types";

const now = () => new Date().toISOString();
const GRACE_PERIOD_HOURS = 24;

export function buildSubscriptionExpirySteps(): StepDefinition[] {
  return [

    // ── Step 1: Verify Grace Period ──────────────────────────────────────────
    {
      name: "check_grace_period",
      type: "check_grace_period",
      canCompensate: false,
      input: (p) => ({
        subscription_id: p["subscription_id"],
        tenant_id:       p["tenant_id"],
      }),
      async execute(input) {
        const { data: sub } = await (supabase as any)
          .from("subscriptions")
          .select("id, customer_id, status, expires_at, package_id, router_id")
          .eq("id", input["subscription_id"])
          .maybeSingle();
        if (!sub) throw new Error("Subscription not found");
        if (sub.status === "suspended" || sub.status === "cancelled") {
          return { skip_suspension: true, status: sub.status };
        }

        const expiredAt = new Date(sub.expires_at);
        const graceCutoff = new Date(expiredAt.getTime() + GRACE_PERIOD_HOURS * 3_600_000);
        const inGrace = Date.now() < graceCutoff.getTime();

        return {
          subscription_id: sub.id,
          customer_id:     sub.customer_id,
          package_id:      sub.package_id,
          router_id:       sub.router_id,
          expires_at:      sub.expires_at,
          in_grace_period: inGrace,
          skip_suspension: inGrace,
        };
      },
    },

    // ── Step 2: Suspend Service ──────────────────────────────────────────────
    {
      name: "suspend_service",
      type: "update_customer_status",
      canCompensate: true,
      input: (_p, ctx) => ({
        subscription_id: ctx.results["check_grace_period"]?.["subscription_id"],
        skip:            ctx.results["check_grace_period"]?.["skip_suspension"] ?? false,
        tenant_id:       _p["tenant_id"],
      }),
      async execute(input) {
        if (input["skip"]) return { skipped: true, reason: "in_grace_period" };

        const { data: prev } = await (supabase as any)
          .from("subscriptions").select("status").eq("id", input["subscription_id"]).maybeSingle();

        await (supabase as any).from("subscriptions").update({
          status: "suspended", updated_at: now(),
        }).eq("id", input["subscription_id"]);

        return {
          suspended:     true,
          previous_status: prev?.status ?? "active",
        };
      },
      async compensate(_input, output) {
        // Restore previous status on rollback
        if (!output["skipped"] && _input["subscription_id"]) {
          await (supabase as any).from("subscriptions").update({
            status: output["previous_status"] ?? "active", updated_at: now(),
          }).eq("id", _input["subscription_id"]);
        }
      },
    },

    // ── Step 3: Update Router ────────────────────────────────────────────────
    {
      name: "update_router",
      type: "suspend_router_user",
      canCompensate: true,
      input: (_p, ctx) => ({
        subscription_id: ctx.results["check_grace_period"]?.["subscription_id"],
        router_id:       ctx.results["check_grace_period"]?.["router_id"],
        skip:            ctx.results["check_grace_period"]?.["skip_suspension"] ?? false,
        tenant_id:       _p["tenant_id"],
      }),
      async execute(input) {
        if (input["skip"]) return { skipped: true };
        if (!input["router_id"]) return { skipped: true, reason: "no_router" };

        const { data: sub } = await (supabase as any)
          .from("subscriptions").select("username").eq("id", input["subscription_id"]).maybeSingle();
        if (!sub?.username) return { skipped: true, reason: "no_username" };

        const { error } = await supabase.functions.invoke("router-command", {
          body: {
            routerId: input["router_id"],
            command:  "suspend_user",
            params:   { username: sub.username, subscriptionId: input["subscription_id"] },
          },
        });
        if (error) throw new Error(`Router suspend failed: ${error.message}`);

        await (supabase as any).from("radius_users").update({
          is_active: false, updated_at: now(),
        }).eq("tenant_id", input["tenant_id"]).eq("subscription_id", input["subscription_id"]);

        await (supabase as any).from("provisioning_events").insert({
          tenant_id:       input["tenant_id"],
          subscription_id: input["subscription_id"],
          router_id:       input["router_id"],
          event:           "suspended",
          username:        sub.username,
        }).catch(() => {});

        return { suspended: true, username: sub.username };
      },
      async compensate(_input, output) {
        if (!output["skipped"] && _input["router_id"] && output["username"]) {
          await supabase.functions.invoke("router-command", {
            body: {
              routerId: _input["router_id"],
              command:  "activate_user",
              params:   { username: output["username"] },
            },
          }).catch(() => {});
          await (supabase as any).from("radius_users").update({
            is_active: true, updated_at: now(),
          }).eq("subscription_id", _input["subscription_id"]);
        }
      },
    },

    // ── Step 4: Notify Customer ──────────────────────────────────────────────
    {
      name: "notify_customer",
      type: "send_sms",
      canCompensate: false,
      input: (_p, ctx) => ({
        tenant_id:    _p["tenant_id"],
        customer_id:  ctx.results["check_grace_period"]?.["customer_id"],
        expires_at:   ctx.results["check_grace_period"]?.["expires_at"],
        skip:         ctx.results["check_grace_period"]?.["skip_suspension"] ?? false,
      }),
      async execute(input) {
        if (input["skip"]) return { skipped: true };

        const { data: customer } = await (supabase as any)
          .from("customers").select("phone, full_name").eq("id", input["customer_id"]).maybeSingle();
        if (!customer?.phone) return { sms_sent: false, reason: "no_phone" };

        const expiry = input["expires_at"]
          ? new Date(input["expires_at"] as string).toLocaleDateString()
          : "";
        const message = `Hi ${customer.full_name ?? "Customer"}, your internet service was suspended on ${expiry} due to expiry. Renew to restore access. – SmartLinkNet`;

        await (supabase as any).from("job_queue").insert({
          tenant_id:  input["tenant_id"],
          type:       "send_sms",
          payload:    { phone: customer.phone, message, customer_id: input["customer_id"] },
          priority:   3,
          queue_name: "notifications",
          run_at:     now(),
          status:     "pending",
        });
        return { sms_queued: true };
      },
    },

    // ── Step 5: Create Audit Log ─────────────────────────────────────────────
    {
      name: "create_audit_log",
      type: "create_audit_log",
      canCompensate: false,
      input: (p, ctx) => ({
        tenant_id:       p["tenant_id"],
        subscription_id: ctx.results["check_grace_period"]?.["subscription_id"],
        customer_id:     ctx.results["check_grace_period"]?.["customer_id"],
        skip:            ctx.results["check_grace_period"]?.["skip_suspension"] ?? false,
      }),
      async execute(input, ctx) {
        await (supabase as any).from("audit_trail").insert({
          tenant_id:   input["tenant_id"],
          workflow_id: ctx.workflowId,
          entity_type: "subscription",
          entity_id:   input["subscription_id"] as string ?? null,
          action:      input["skip"] ? "expiry_grace_period_active" : "subscription_suspended_expiry",
          after_state: { customer_id: input["customer_id"] },
          actor:       "provisioning_engine",
          actor_type:  "system",
          occurred_at: now(),
        }).catch(() => {});
        return { audit_created: true };
      },
    },
  ];
}
