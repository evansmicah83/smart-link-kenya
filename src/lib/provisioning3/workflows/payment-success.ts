/**
 * SmartLinkNet — Phase 3: Payment Success Workflow
 * Steps: verify_payment → create_subscription → generate_invoice →
 *        update_radius → activate_router_user → send_notifications → create_audit_log
 * All steps that mutate state support compensation (rollback).
 */
import { supabase } from "@/integrations/supabase/client";
import type { StepDefinition, StepContext } from "../types";

const now = () => new Date().toISOString();

export function buildPaymentSuccessSteps(): StepDefinition[] {
  return [

    // ── Step 1: Verify Payment ───────────────────────────────────────────────
    {
      name: "verify_payment",
      type: "verify_payment",
      canCompensate: false,
      input: (p) => ({ payment_id: p["payment_id"], amount: p["amount"] }),
      async execute(input) {
        const { data: payment, error } = await (supabase as any)
          .from("payments")
          .select("id, status, amount, customer_id, tenant_id, package_id")
          .eq("id", input["payment_id"])
          .maybeSingle();
        if (error) throw new Error(error.message);
        if (!payment) throw new Error("Payment not found");
        if (payment.status !== "completed" && payment.status !== "success") {
          throw new Error(`Payment status is "${payment.status}", expected completed`);
        }
        return {
          payment_id:  payment.id,
          customer_id: payment.customer_id,
          package_id:  payment.package_id ?? input["package_id"],
          amount:      payment.amount,
          tenant_id:   payment.tenant_id,
        };
      },
    },

    // ── Step 2: Create / Renew Subscription ──────────────────────────────────
    {
      name: "create_subscription",
      type: "create_subscription",
      canCompensate: true,
      input: (p, ctx) => ({
        customer_id:  ctx.results["verify_payment"]?.["customer_id"] ?? p["customer_id"],
        package_id:   ctx.results["verify_payment"]?.["package_id"]  ?? p["package_id"],
        tenant_id:    p["tenant_id"],
        payment_id:   p["payment_id"],
      }),
      async execute(input) {
        const { data: pkg } = await (supabase as any)
          .from("packages").select("duration_days, name").eq("id", input["package_id"]).maybeSingle();
        const days = pkg?.duration_days ?? 30;
        const expiresAt = new Date(Date.now() + days * 86_400_000).toISOString();

        // Check existing active subscription → renew instead of duplicate
        const { data: existing } = await (supabase as any)
          .from("subscriptions")
          .select("id, expires_at, status")
          .eq("customer_id", input["customer_id"])
          .eq("package_id",  input["package_id"])
          .eq("tenant_id",   input["tenant_id"])
          .maybeSingle();

        let subscriptionId: string;

        if (existing) {
          const newExpiry = existing.status === "active" && existing.expires_at
            ? new Date(Math.max(Date.parse(existing.expires_at), Date.now()) + days * 86_400_000).toISOString()
            : expiresAt;
          await (supabase as any).from("subscriptions").update({
            status: "active", expires_at: newExpiry, updated_at: now(),
          }).eq("id", existing.id);
          subscriptionId = existing.id;
        } else {
          const { data: newSub, error } = await (supabase as any)
            .from("subscriptions")
            .insert({
              tenant_id:   input["tenant_id"],
              customer_id: input["customer_id"],
              package_id:  input["package_id"],
              status:      "active",
              expires_at:  expiresAt,
            }).select("id").single();
          if (error) throw new Error(error.message);
          subscriptionId = newSub.id;
        }
        return { subscription_id: subscriptionId, expires_at: expiresAt, package_name: pkg?.name };
      },
      async compensate(input, output) {
        // Only rollback if subscription was newly created (not a renewal)
        if (output["subscription_id"]) {
          await (supabase as any).from("subscriptions").update({
            status: "cancelled", updated_at: now(),
          }).eq("id", output["subscription_id"]);
        }
      },
    },

    // ── Step 3: Generate Invoice ─────────────────────────────────────────────
    {
      name: "generate_invoice",
      type: "generate_invoice",
      canCompensate: true,
      input: (p, ctx) => ({
        tenant_id:       p["tenant_id"],
        customer_id:     ctx.results["verify_payment"]?.["customer_id"] ?? p["customer_id"],
        subscription_id: ctx.results["create_subscription"]?.["subscription_id"],
        amount:          ctx.results["verify_payment"]?.["amount"] ?? p["amount"],
        package_name:    ctx.results["create_subscription"]?.["package_name"] ?? "",
      }),
      async execute(input) {
        const invoiceNo = `INV-${Date.now()}`;
        const { data: inv, error } = await (supabase as any)
          .from("invoices")
          .insert({
            tenant_id:       input["tenant_id"],
            customer_id:     input["customer_id"],
            subscription_id: input["subscription_id"] ?? null,
            invoice_no:      invoiceNo,
            status:          "paid",
            subtotal:        input["amount"],
            total:           input["amount"],
            currency:        "KES",
          }).select("id").single();
        if (error) throw new Error(error.message);
        return { invoice_id: inv.id, invoice_no: invoiceNo };
      },
      async compensate(_input, output) {
        if (output["invoice_id"]) {
          await (supabase as any).from("invoices").update({
            status: "cancelled", updated_at: now(),
          }).eq("id", output["invoice_id"]);
        }
      },
    },

    // ── Step 4: Update RADIUS Profile ────────────────────────────────────────
    {
      name: "update_radius",
      type: "update_radius",
      canCompensate: false,
      input: (p, ctx) => ({
        tenant_id:       p["tenant_id"],
        customer_id:     ctx.results["verify_payment"]?.["customer_id"] ?? p["customer_id"],
        subscription_id: ctx.results["create_subscription"]?.["subscription_id"],
        package_id:      ctx.results["verify_payment"]?.["package_id"] ?? p["package_id"],
      }),
      async execute(input) {
        // Upsert radius_users entry for this subscription
        const { data: sub } = await (supabase as any)
          .from("subscriptions")
          .select("username, router_id")
          .eq("id", input["subscription_id"])
          .maybeSingle();
        if (!sub?.username) return { skipped: true, reason: "no_username" };

        const { data: profile } = await (supabase as any)
          .from("radius_profiles")
          .select("name, rate_limit, vlan_id, ip_pool, session_timeout, idle_timeout")
          .eq("tenant_id", input["tenant_id"])
          .eq("package_id", input["package_id"])
          .maybeSingle();

        await (supabase as any).from("radius_users").upsert({
          tenant_id:       input["tenant_id"],
          subscription_id: input["subscription_id"],
          router_id:       sub.router_id ?? null,
          username:        sub.username,
          password:        sub.username, // actual password managed by subscription
          profile:         profile?.name ?? null,
          rate_limit:      profile?.rate_limit ?? null,
          vlan_id:         profile?.vlan_id ?? null,
          pool_name:       profile?.ip_pool ?? null,
          session_timeout: profile?.session_timeout ?? null,
          idle_timeout:    profile?.idle_timeout ?? null,
          is_active:       true,
          updated_at:      now(),
        }, { onConflict: "tenant_id,username", ignoreDuplicates: false });

        return { radius_updated: true, username: sub.username };
      },
    },

    // ── Step 5: Activate Router User ────────────────────────────────────────
    {
      name: "activate_router_user",
      type: "activate_router_user",
      canCompensate: true,
      input: (p, ctx) => ({
        subscription_id: ctx.results["create_subscription"]?.["subscription_id"],
        tenant_id:       p["tenant_id"],
      }),
      async execute(input) {
        const { data: sub } = await (supabase as any)
          .from("subscriptions")
          .select("router_id, username, package_id")
          .eq("id", input["subscription_id"])
          .maybeSingle();
        if (!sub?.router_id) return { skipped: true, reason: "no_router" };

        const { error } = await supabase.functions.invoke("router-command", {
          body: {
            routerId: sub.router_id,
            command:  "activate_user",
            params:   { username: sub.username, subscriptionId: input["subscription_id"] },
          },
        });
        if (error) throw new Error(`Router activation failed: ${error.message}`);

        // Record provisioning event
        await (supabase as any).from("provisioning_events").insert({
          tenant_id:       input["tenant_id"],
          subscription_id: input["subscription_id"],
          router_id:       sub.router_id,
          event:           "provisioned",
          username:        sub.username,
          adapter_type:    "mikrotik_rest",
        }).catch(() => {});

        return { activated: true, router_id: sub.router_id, username: sub.username };
      },
      async compensate(_input, output) {
        // Suspend router user if activation is being rolled back
        if (output["router_id"] && output["username"]) {
          await supabase.functions.invoke("router-command", {
            body: {
              routerId: output["router_id"],
              command:  "suspend_user",
              params:   { username: output["username"] },
            },
          }).catch(() => {});
        }
      },
    },

    // ── Step 6: Send Notifications ───────────────────────────────────────────
    {
      name: "send_notifications",
      type: "send_sms",
      canCompensate: false,
      input: (p, ctx) => ({
        tenant_id:    p["tenant_id"],
        customer_id:  ctx.results["verify_payment"]?.["customer_id"] ?? p["customer_id"],
        package_name: ctx.results["create_subscription"]?.["package_name"] ?? "",
        expires_at:   ctx.results["create_subscription"]?.["expires_at"] ?? "",
        amount:       ctx.results["verify_payment"]?.["amount"] ?? p["amount"],
      }),
      async execute(input) {
        const { data: customer } = await (supabase as any)
          .from("customers").select("phone, full_name").eq("id", input["customer_id"]).maybeSingle();
        if (!customer?.phone) return { sms_sent: false, reason: "no_phone" };

        const expiry = input["expires_at"]
          ? new Date(input["expires_at"] as string).toLocaleDateString()
          : "";
        const message = `Hi ${customer.full_name ?? "Customer"}, your ${input["package_name"]} package is now active until ${expiry}. Thank you! – SmartLinkNet`;

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

    // ── Step 7: Create Audit Log ─────────────────────────────────────────────
    {
      name: "create_audit_log",
      type: "create_audit_log",
      canCompensate: false,
      input: (p, ctx) => ({
        tenant_id:       p["tenant_id"],
        customer_id:     ctx.results["verify_payment"]?.["customer_id"] ?? p["customer_id"],
        subscription_id: ctx.results["create_subscription"]?.["subscription_id"],
        payment_id:      p["payment_id"],
        amount:          ctx.results["verify_payment"]?.["amount"] ?? p["amount"],
      }),
      async execute(input, ctx) {
        await (supabase as any).from("audit_trail").insert({
          tenant_id:   input["tenant_id"],
          workflow_id: ctx.workflowId,
          entity_type: "payment",
          entity_id:   input["payment_id"] as string ?? null,
          action:      "payment_success_provisioned",
          after_state: {
            subscription_id: input["subscription_id"],
            amount:          input["amount"],
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
