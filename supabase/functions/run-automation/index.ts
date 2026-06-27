/**
 * SmartLinkNet — Automation Rule Engine Edge Function
 * Evaluates all active IF/THEN rules per tenant and executes configured actions.
 * Triggered by queue-worker or pg_cron.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const body = await req.json().catch(() => ({})) as { tenantId?: string };

    // Fetch all active rules (optionally scoped to a tenant)
    let q = supabase.from("automation_rules").select("*").eq("is_active", true);
    if (body.tenantId) q = (q as any).eq("tenant_id", body.tenantId);
    const { data: rules } = await q;

    let executed = 0;

    for (const rule of (rules ?? []) as any[]) {
      try {
        const fired = await evaluateRule(supabase, rule);
        if (fired) {
          executed++;
          // Update rule stats
          await supabase.from("automation_rules").update({
            last_run: new Date().toISOString(),
            run_count: (rule.run_count ?? 0) + 1,
          }).eq("id", rule.id);

          // Log execution
          await supabase.from("automation_logs").insert({
            tenant_id: rule.tenant_id,
            rule_id: rule.id,
            rule_name: rule.name,
            success: true,
            message: `Rule "${rule.name}" executed action: ${rule.action}`,
            created_at: new Date().toISOString(),
          });
        }
      } catch (err: any) {
        await supabase.from("automation_logs").insert({
          tenant_id: rule.tenant_id,
          rule_id: rule.id,
          rule_name: rule.name,
          success: false,
          message: `Rule "${rule.name}" failed: ${err.message}`,
          created_at: new Date().toISOString(),
        });
      }
    }

    return new Response(JSON.stringify({ ok: true, rulesEvaluated: (rules ?? []).length, executed }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});

async function evaluateRule(supabase: any, rule: any): Promise<boolean> {
  const { trigger, conditions, action, action_params, tenant_id } = rule;

  switch (trigger) {
    case "subscription_expired": {
      const { data: subs } = await supabase
        .from("subscriptions")
        .select("id, customer_id")
        .eq("tenant_id", tenant_id)
        .eq("status", "active")
        .lt("expires_at", new Date().toISOString())
        .limit(20);
      if (!subs?.length) return false;
      for (const sub of subs) await executeAction(supabase, action, action_params, tenant_id, sub);
      return true;
    }

    case "payment_received": {
      // Already handled by mpesa-callback — skip to prevent double-execution
      return false;
    }

    case "router_offline": {
      const { data: routers } = await supabase
        .from("routers")
        .select("id, name")
        .eq("tenant_id", tenant_id)
        .eq("status", "offline")
        .limit(10);
      if (!routers?.length) return false;
      for (const r of routers) await executeAction(supabase, action, { ...action_params, router_name: r.name }, tenant_id, { router_id: r.id });
      return true;
    }

    case "customer_inactive_days": {
      const days = (conditions as any).days ?? 30;
      const cutoff = new Date(Date.now() - days * 86400000).toISOString();
      const { data: customers } = await supabase
        .from("customers")
        .select("id")
        .eq("tenant_id", tenant_id)
        .eq("status", "active")
        .lt("updated_at", cutoff)
        .limit(20);
      if (!customers?.length) return false;
      for (const c of customers) await executeAction(supabase, action, action_params, tenant_id, { customer_id: c.id });
      return true;
    }

    case "ticket_sla_breached": {
      const { data: tickets } = await supabase
        .from("tickets")
        .select("id, subject")
        .eq("tenant_id", tenant_id)
        .eq("sla_breached", true)
        .in("status", ["open", "in_progress"])
        .limit(10);
      if (!tickets?.length) return false;
      for (const t of tickets) await executeAction(supabase, action, { ...action_params, ticket_subject: t.subject }, tenant_id, { ticket_id: t.id });
      return true;
    }

    case "low_wallet_balance": {
      const threshold = (conditions as any).threshold ?? 100;
      const { data: wallets } = await supabase
        .from("wallets")
        .select("id, customer_id, balance")
        .eq("tenant_id", tenant_id)
        .lt("balance", threshold)
        .limit(20);
      if (!wallets?.length) return false;
      for (const w of wallets) await executeAction(supabase, action, action_params, tenant_id, { customer_id: w.customer_id });
      return true;
    }

    default:
      return false;
  }
}

async function executeAction(supabase: any, action: string, params: any, tenantId: string, context: any): Promise<void> {
  switch (action) {
    case "suspend_service": {
      if (context.id || context.subscription_id) {
        await supabase.from("subscriptions").update({ status: "suspended" })
          .eq("id", context.id ?? context.subscription_id);
      }
      break;
    }

    case "send_sms": {
      const customerId = context.customer_id;
      if (!customerId) break;
      const { data: c } = await supabase.from("customers").select("phone, full_name").eq("id", customerId).single();
      if (!c?.phone) break;
      await supabase.functions.invoke("send-sms", {
        body: {
          tenantId,
          phone: c.phone,
          message: (params.message ?? "").replace("{customer_name}", c.full_name ?? "Customer"),
          customerId,
        },
      });
      break;
    }

    case "notify_admin": {
      const { data: admins } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("tenant_id", tenantId)
        .in("role", ["isp_owner", "network_engineer"]);
      for (const admin of admins ?? []) {
        await supabase.from("notifications").insert({
          tenant_id: tenantId,
          user_id: admin.user_id,
          title: params.title ?? "Automation Alert",
          message: params.message ?? "An automation rule was triggered.",
          type: "warning",
        });
      }
      break;
    }

    case "create_ticket": {
      const ticketNo = `TKT-${Date.now()}`;
      await supabase.from("tickets").insert({
        tenant_id: tenantId,
        customer_id: context.customer_id ?? null,
        ticket_no: ticketNo,
        subject: params.subject ?? "Automated Ticket",
        description: params.description ?? "Created by automation rule",
        type: "support",
        priority: params.priority ?? "medium",
        status: "open",
      });
      break;
    }

    case "generate_invoice": {
      if (!context.customer_id) break;
      const invoiceNo = `INV-AUTO-${Date.now()}`;
      await supabase.from("invoices").insert({
        tenant_id: tenantId,
        customer_id: context.customer_id,
        invoice_no: invoiceNo,
        status: "unpaid",
        subtotal: params.amount ?? 0,
        total: params.amount ?? 0,
        currency: params.currency ?? "KES",
      });
      break;
    }
  }
}
