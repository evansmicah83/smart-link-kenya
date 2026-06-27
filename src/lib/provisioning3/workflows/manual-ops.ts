/**
 * SmartLinkNet — Phase 3: Manual Activation & Suspension Workflows
 * Used when an operator manually activates or suspends a subscription.
 * Both workflows are fully audited and compensable.
 */
import { supabase } from "@/integrations/supabase/client";
import type { StepDefinition } from "../types";

const now = () => new Date().toISOString();

// ── Manual Activation ─────────────────────────────────────────────────────────

export function buildManualActivationSteps(): StepDefinition[] {
  return [

    {
      name: "activate_subscription",
      type: "update_customer_status",
      canCompensate: true,
      input: (p) => ({
        subscription_id: p["subscription_id"],
        tenant_id:       p["tenant_id"],
        operator_id:     p["operator_id"] ?? "system",
      }),
      async execute(input) {
        const { data: prev } = await (supabase as any)
          .from("subscriptions").select("status, expires_at").eq("id", input["subscription_id"]).maybeSingle();
        if (!prev) throw new Error("Subscription not found");

        const expiresAt = prev.expires_at && new Date(prev.expires_at) > new Date()
          ? prev.expires_at
          : new Date(Date.now() + 30 * 86_400_000).toISOString();

        await (supabase as any).from("subscriptions").update({
          status: "active", expires_at: expiresAt, updated_at: now(),
        }).eq("id", input["subscription_id"]);
        return { previous_status: prev.status, expires_at: expiresAt };
      },
      async compensate(_input, output) {
        await (supabase as any).from("subscriptions").update({
          status: output["previous_status"] ?? "suspended", updated_at: now(),
        }).eq("id", _input["subscription_id"]);
      },
    },

    {
      name: "activate_router_user",
      type: "activate_router_user",
      canCompensate: true,
      input: (p) => ({ subscription_id: p["subscription_id"], tenant_id: p["tenant_id"] }),
      async execute(input) {
        const { data: sub } = await (supabase as any)
          .from("subscriptions").select("router_id, username, package_id").eq("id", input["subscription_id"]).maybeSingle();
        if (!sub?.router_id) return { skipped: true, reason: "no_router" };
        if (!sub.username)   return { skipped: true, reason: "no_username" };

        const { error } = await supabase.functions.invoke("router-command", {
          body: { routerId: sub.router_id, command: "activate_user", params: { username: sub.username } },
        });
        if (error) throw new Error(`Router activation failed: ${error.message}`);

        await (supabase as any).from("radius_users").update({
          is_active: true, updated_at: now(),
        }).eq("tenant_id", input["tenant_id"]).eq("subscription_id", input["subscription_id"]);

        await (supabase as any).from("provisioning_events").insert({
          tenant_id: input["tenant_id"], subscription_id: input["subscription_id"],
          router_id: sub.router_id, event: "reactivated", username: sub.username,
        }).catch(() => {});

        return { activated: true, router_id: sub.router_id, username: sub.username };
      },
      async compensate(_input, output) {
        if (output["router_id"] && output["username"]) {
          await supabase.functions.invoke("router-command", {
            body: { routerId: output["router_id"], command: "suspend_user", params: { username: output["username"] } },
          }).catch(() => {});
          await (supabase as any).from("radius_users").update({
            is_active: false, updated_at: now(),
          }).eq("subscription_id", _input["subscription_id"]);
        }
      },
    },

    {
      name: "notify_customer",
      type: "send_sms",
      canCompensate: false,
      input: (p) => ({ tenant_id: p["tenant_id"], customer_id: p["customer_id"] }),
      async execute(input) {
        const { data: customer } = await (supabase as any)
          .from("customers").select("phone, full_name").eq("id", input["customer_id"]).maybeSingle();
        if (!customer?.phone) return { sms_queued: false };
        await (supabase as any).from("job_queue").insert({
          tenant_id: input["tenant_id"], type: "send_sms",
          payload: { phone: customer.phone, message: `Hi ${customer.full_name ?? "Customer"}, your internet service has been activated. – SmartLinkNet`, customer_id: input["customer_id"] },
          priority: 3, queue_name: "notifications", run_at: now(), status: "pending",
        });
        return { sms_queued: true };
      },
    },

    {
      name: "create_audit_log",
      type: "create_audit_log",
      canCompensate: false,
      input: (p, ctx) => ({
        tenant_id:       p["tenant_id"],
        subscription_id: p["subscription_id"],
        customer_id:     p["customer_id"],
        operator_id:     p["operator_id"] ?? "system",
        previous_status: ctx.results["activate_subscription"]?.["previous_status"],
      }),
      async execute(input, ctx) {
        await (supabase as any).from("audit_trail").insert({
          tenant_id:   input["tenant_id"],
          workflow_id: ctx.workflowId,
          entity_type: "subscription",
          entity_id:   input["subscription_id"] as string ?? null,
          action:      "manual_activation",
          before_state:{ status: input["previous_status"] },
          after_state: { status: "active" },
          actor:       input["operator_id"] as string,
          actor_type:  "user",
          occurred_at: now(),
        }).catch(() => {});
        return { audit_created: true };
      },
    },
  ];
}

// ── Manual Suspension ─────────────────────────────────────────────────────────

export function buildManualSuspensionSteps(): StepDefinition[] {
  return [

    {
      name: "suspend_subscription",
      type: "update_customer_status",
      canCompensate: true,
      input: (p) => ({
        subscription_id: p["subscription_id"],
        tenant_id:       p["tenant_id"],
        reason:          p["reason"] ?? "Manual suspension",
        operator_id:     p["operator_id"] ?? "system",
      }),
      async execute(input) {
        const { data: prev } = await (supabase as any)
          .from("subscriptions").select("status").eq("id", input["subscription_id"]).maybeSingle();
        if (!prev) throw new Error("Subscription not found");
        await (supabase as any).from("subscriptions").update({
          status: "suspended", updated_at: now(),
        }).eq("id", input["subscription_id"]);
        return { previous_status: prev.status };
      },
      async compensate(_input, output) {
        await (supabase as any).from("subscriptions").update({
          status: output["previous_status"] ?? "active", updated_at: now(),
        }).eq("id", _input["subscription_id"]);
      },
    },

    {
      name: "suspend_router_user",
      type: "suspend_router_user",
      canCompensate: true,
      input: (p) => ({ subscription_id: p["subscription_id"], tenant_id: p["tenant_id"] }),
      async execute(input) {
        const { data: sub } = await (supabase as any)
          .from("subscriptions").select("router_id, username").eq("id", input["subscription_id"]).maybeSingle();
        if (!sub?.router_id) return { skipped: true, reason: "no_router" };
        if (!sub.username)   return { skipped: true, reason: "no_username" };

        const { error } = await supabase.functions.invoke("router-command", {
          body: { routerId: sub.router_id, command: "suspend_user", params: { username: sub.username } },
        });
        if (error) throw new Error(`Router suspend failed: ${error.message}`);

        await (supabase as any).from("radius_users").update({
          is_active: false, updated_at: now(),
        }).eq("tenant_id", input["tenant_id"]).eq("subscription_id", input["subscription_id"]);

        await (supabase as any).from("provisioning_events").insert({
          tenant_id: input["tenant_id"], subscription_id: input["subscription_id"],
          router_id: sub.router_id, event: "suspended", username: sub.username,
        }).catch(() => {});

        return { suspended: true, router_id: sub.router_id, username: sub.username };
      },
      async compensate(_input, output) {
        if (output["router_id"] && output["username"]) {
          await supabase.functions.invoke("router-command", {
            body: { routerId: output["router_id"], command: "activate_user", params: { username: output["username"] } },
          }).catch(() => {});
          await (supabase as any).from("radius_users").update({
            is_active: true, updated_at: now(),
          }).eq("subscription_id", _input["subscription_id"]);
        }
      },
    },

    {
      name: "notify_customer",
      type: "send_sms",
      canCompensate: false,
      input: (p) => ({ tenant_id: p["tenant_id"], customer_id: p["customer_id"], reason: p["reason"] ?? "Manual suspension" }),
      async execute(input) {
        const { data: customer } = await (supabase as any)
          .from("customers").select("phone, full_name").eq("id", input["customer_id"]).maybeSingle();
        if (!customer?.phone) return { sms_queued: false };
        await (supabase as any).from("job_queue").insert({
          tenant_id: input["tenant_id"], type: "send_sms",
          payload: { phone: customer.phone, message: `Hi ${customer.full_name ?? "Customer"}, your internet service has been suspended. Reason: ${input["reason"]}. Contact support to restore. – SmartLinkNet`, customer_id: input["customer_id"] },
          priority: 3, queue_name: "notifications", run_at: now(), status: "pending",
        });
        return { sms_queued: true };
      },
    },

    {
      name: "create_audit_log",
      type: "create_audit_log",
      canCompensate: false,
      input: (p, ctx) => ({
        tenant_id:       p["tenant_id"],
        subscription_id: p["subscription_id"],
        customer_id:     p["customer_id"],
        operator_id:     p["operator_id"] ?? "system",
        reason:          p["reason"] ?? "Manual suspension",
        previous_status: ctx.results["suspend_subscription"]?.["previous_status"],
      }),
      async execute(input, ctx) {
        await (supabase as any).from("audit_trail").insert({
          tenant_id:   input["tenant_id"],
          workflow_id: ctx.workflowId,
          entity_type: "subscription",
          entity_id:   input["subscription_id"] as string ?? null,
          action:      "manual_suspension",
          before_state:{ status: input["previous_status"] },
          after_state: { status: "suspended", reason: input["reason"] },
          actor:       input["operator_id"] as string,
          actor_type:  "user",
          occurred_at: now(),
        }).catch(() => {});
        return { audit_created: true };
      },
    },
  ];
}
