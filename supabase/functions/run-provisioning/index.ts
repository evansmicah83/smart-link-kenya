/// <reference path="../types.d.ts" />
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const now = () => new Date().toISOString();
const STEP_MAX_ATTEMPTS = 3;
const WORKER_ID = `worker-${crypto.randomUUID()}`;

function resp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

async function appendEvent(
  sb: any,
  workflowId: string,
  tenantId: string,
  eventType: string,
  payload: Record<string, unknown> = {},
  stepName?: string,
  stepOrder?: number,
) {
  await sb.from("workflow_events").insert({
    workflow_id: workflowId,
    tenant_id: tenantId,
    event_type: eventType,
    step_name: stepName ?? null,
    step_order: stepOrder ?? null,
    payload,
    actor: "provisioning_engine",
    occurred_at: now(),
  }).catch(() => {});
}

async function writeAudit(
  sb: any,
  tenantId: string,
  workflowId: string,
  entityType: string,
  entityId: string | null,
  action: string,
  after: Record<string, unknown>,
) {
  await sb.from("audit_trail").insert({
    tenant_id: tenantId,
    workflow_id: workflowId,
    entity_type: entityType,
    entity_id: entityId,
    action,
    after_state: after,
    actor: "provisioning_engine",
    actor_type: "system",
    occurred_at: now(),
  }).catch(() => {});
}

// ── Step executors ────────────────────────────────────────────────────────────

async function stepVerifyPayment(sb: any, input: Record<string, unknown>) {
  const { data: payment, error } = await sb
    .from("payments")
    .select("id, status, amount, customer_id, tenant_id, package_id")
    .eq("id", input["payment_id"])
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!payment) throw new Error("Payment not found");
  if (payment.status !== "completed" && payment.status !== "success")
    throw new Error(`Payment status is "${payment.status}"`);
  return {
    payment_id: payment.id,
    customer_id: payment.customer_id,
    package_id: payment.package_id ?? input["package_id"],
    amount: payment.amount,
  };
}

async function stepCreateSubscription(sb: any, input: Record<string, unknown>) {
  const { data: pkg } = await sb
    .from("packages").select("duration_days, name").eq("id", input["package_id"]).maybeSingle();
  const days = pkg?.duration_days ?? 30;
  const expiresAt = new Date(Date.now() + days * 86_400_000).toISOString();

  const { data: existing } = await sb
    .from("subscriptions")
    .select("id, expires_at, status")
    .eq("customer_id", input["customer_id"])
    .eq("package_id", input["package_id"])
    .eq("tenant_id", input["tenant_id"])
    .maybeSingle();

  let subscriptionId: string;
  if (existing) {
    const newExpiry = existing.status === "active" && existing.expires_at
      ? new Date(Math.max(Date.parse(existing.expires_at), Date.now()) + days * 86_400_000).toISOString()
      : expiresAt;
    await sb.from("subscriptions").update({ status: "active", expires_at: newExpiry, updated_at: now() }).eq("id", existing.id);
    subscriptionId = existing.id;
  } else {
    const { data: newSub, error } = await sb
      .from("subscriptions")
      .insert({ tenant_id: input["tenant_id"], customer_id: input["customer_id"], package_id: input["package_id"], status: "active", expires_at: expiresAt })
      .select("id").single();
    if (error) throw new Error(error.message);
    subscriptionId = newSub.id;
  }
  return { subscription_id: subscriptionId, expires_at: expiresAt, package_name: pkg?.name };
}

async function stepGenerateInvoice(sb: any, input: Record<string, unknown>) {
  const invoiceNo = `INV-${Date.now()}`;
  const { data: inv, error } = await sb.from("invoices").insert({
    tenant_id: input["tenant_id"],
    customer_id: input["customer_id"],
    subscription_id: input["subscription_id"] ?? null,
    invoice_no: invoiceNo,
    status: "paid",
    subtotal: input["amount"],
    total: input["amount"],
    currency: "KES",
  }).select("id").single();
  if (error) throw new Error(error.message);
  return { invoice_id: inv.id, invoice_no: invoiceNo };
}

async function stepUpdateRadius(sb: any, input: Record<string, unknown>) {
  const { data: sub } = await sb.from("subscriptions").select("username, router_id").eq("id", input["subscription_id"]).maybeSingle();
  if (!sub?.username) return { skipped: true, reason: "no_username" };
  const { data: profile } = await sb.from("radius_profiles").select("name, rate_limit, vlan_id, ip_pool, session_timeout, idle_timeout").eq("tenant_id", input["tenant_id"]).eq("package_id", input["package_id"]).maybeSingle();
  await sb.from("radius_users").upsert({
    tenant_id: input["tenant_id"], subscription_id: input["subscription_id"],
    router_id: sub.router_id ?? null, username: sub.username, password: sub.username,
    profile: profile?.name ?? null, rate_limit: profile?.rate_limit ?? null,
    vlan_id: profile?.vlan_id ?? null, pool_name: profile?.ip_pool ?? null,
    session_timeout: profile?.session_timeout ?? null, idle_timeout: profile?.idle_timeout ?? null,
    is_active: true, updated_at: now(),
  }, { onConflict: "tenant_id,username", ignoreDuplicates: false });
  return { radius_updated: true, username: sub.username };
}

async function stepActivateRouterUser(sb: any, input: Record<string, unknown>) {
  const { data: sub } = await sb.from("subscriptions").select("router_id, username").eq("id", input["subscription_id"]).maybeSingle();
  if (!sub?.router_id) return { skipped: true, reason: "no_router" };
  const { error } = await sb.functions.invoke("router-command", {
    body: { routerId: sub.router_id, command: "activate_user", params: { username: sub.username, subscriptionId: input["subscription_id"] } },
  });
  if (error) throw new Error(`Router activation failed: ${error.message}`);
  await sb.from("provisioning_events").insert({ tenant_id: input["tenant_id"], subscription_id: input["subscription_id"], router_id: sub.router_id, event: "provisioned", username: sub.username, adapter_type: "mikrotik_rest" }).catch(() => {});
  return { activated: true, router_id: sub.router_id, username: sub.username };
}

async function stepSendNotification(sb: any, input: Record<string, unknown>) {
  const { data: customer } = await sb.from("customers").select("phone, full_name").eq("id", input["customer_id"]).maybeSingle();
  if (!customer?.phone) return { sms_queued: false, reason: "no_phone" };
  await sb.from("job_queue").insert({
    tenant_id: input["tenant_id"], type: "send_sms",
    payload: { phone: customer.phone, message: input["message"], customer_id: input["customer_id"] },
    priority: 3, queue_name: "notifications", run_at: now(), status: "pending",
  });
  return { sms_queued: true };
}

async function stepCheckGracePeriod(sb: any, input: Record<string, unknown>) {
  const GRACE_HOURS = 24;
  const { data: sub } = await sb.from("subscriptions").select("id, customer_id, status, expires_at, package_id, router_id").eq("id", input["subscription_id"]).maybeSingle();
  if (!sub) throw new Error("Subscription not found");
  if (sub.status === "suspended" || sub.status === "cancelled") return { skip_suspension: true, status: sub.status };
  const graceCutoff = new Date(Date.parse(sub.expires_at) + GRACE_HOURS * 3_600_000);
  const inGrace = Date.now() < graceCutoff.getTime();
  return { subscription_id: sub.id, customer_id: sub.customer_id, package_id: sub.package_id, router_id: sub.router_id, expires_at: sub.expires_at, in_grace_period: inGrace, skip_suspension: inGrace };
}

async function stepSuspendService(sb: any, input: Record<string, unknown>) {
  if (input["skip"]) return { skipped: true, reason: "in_grace_period" };
  const { data: prev } = await sb.from("subscriptions").select("status").eq("id", input["subscription_id"]).maybeSingle();
  await sb.from("subscriptions").update({ status: "suspended", updated_at: now() }).eq("id", input["subscription_id"]);
  return { suspended: true, previous_status: prev?.status ?? "active" };
}

async function stepSuspendRouterUser(sb: any, input: Record<string, unknown>) {
  if (input["skip"]) return { skipped: true };
  if (!input["router_id"]) return { skipped: true, reason: "no_router" };
  const { data: sub } = await sb.from("subscriptions").select("username").eq("id", input["subscription_id"]).maybeSingle();
  if (!sub?.username) return { skipped: true, reason: "no_username" };
  const { error } = await sb.functions.invoke("router-command", {
    body: { routerId: input["router_id"], command: "suspend_user", params: { username: sub.username } },
  });
  if (error) throw new Error(`Router suspend failed: ${error.message}`);
  await sb.from("radius_users").update({ is_active: false, updated_at: now() }).eq("tenant_id", input["tenant_id"]).eq("subscription_id", input["subscription_id"]);
  await sb.from("provisioning_events").insert({ tenant_id: input["tenant_id"], subscription_id: input["subscription_id"], router_id: input["router_id"], event: "suspended", username: sub.username }).catch(() => {});
  return { suspended: true, username: sub.username };
}

async function stepRecordFailure(sb: any, input: Record<string, unknown>) {
  await sb.from("payments").update({ status: "failed", metadata: { failure_reason: input["reason"], failed_at: now() } }).eq("id", input["payment_id"]).catch(() => {});
  const { count } = await sb.from("payments").select("id", { count: "exact", head: true }).eq("customer_id", input["customer_id"]).eq("status", "failed");
  const retryCount = count ?? 0;
  return { payment_id: input["payment_id"], customer_id: input["customer_id"], retry_count: retryCount, should_retry: retryCount < 3, reason: input["reason"] };
}

async function stepRetryPayment(sb: any, input: Record<string, unknown>) {
  if (!input["should_retry"]) return { retry_scheduled: false, reason: "max_retries_exceeded" };
  const backoffMs = [600_000, 3_600_000, 86_400_000][Math.min(input["retry_count"] as number, 2)];
  const retryAt = new Date(Date.now() + backoffMs).toISOString();
  await sb.from("job_queue").insert({
    tenant_id: input["tenant_id"], type: "retry_payment",
    payload: { payment_id: input["payment_id"], customer_id: input["customer_id"], retry_count: (input["retry_count"] as number) + 1 },
    priority: 2, queue_name: "payments", run_at: retryAt, status: "pending",
  });
  return { retry_scheduled: true, retry_at: retryAt, retry_number: (input["retry_count"] as number) + 1 };
}

// ── Workflow step definitions map ─────────────────────────────────────────────

type StepDef = {
  name: string;
  type: string;
  canCompensate: boolean;
  buildInput: (payload: Record<string, unknown>, results: Record<string, Record<string, unknown>>) => Record<string, unknown>;
  execute: (sb: any, input: Record<string, unknown>) => Promise<Record<string, unknown>>;
  compensate?: (sb: any, input: Record<string, unknown>, output: Record<string, unknown>) => Promise<void>;
};

function getSteps(workflowType: string, payload: Record<string, unknown>): StepDef[] {
  if (workflowType === "payment_success") {
    return [
      {
        name: "verify_payment", type: "verify_payment", canCompensate: false,
        buildInput: (p) => ({ payment_id: p["payment_id"], amount: p["amount"] }),
        execute: (sb, i) => stepVerifyPayment(sb, i),
      },
      {
        name: "create_subscription", type: "create_subscription", canCompensate: true,
        buildInput: (p, r) => ({ customer_id: r["verify_payment"]?.["customer_id"] ?? p["customer_id"], package_id: r["verify_payment"]?.["package_id"] ?? p["package_id"], tenant_id: p["tenant_id"], payment_id: p["payment_id"] }),
        execute: (sb, i) => stepCreateSubscription(sb, i),
        compensate: async (sb, _i, o) => { if (o["subscription_id"]) await sb.from("subscriptions").update({ status: "cancelled", updated_at: now() }).eq("id", o["subscription_id"]); },
      },
      {
        name: "generate_invoice", type: "generate_invoice", canCompensate: true,
        buildInput: (p, r) => ({ tenant_id: p["tenant_id"], customer_id: r["verify_payment"]?.["customer_id"] ?? p["customer_id"], subscription_id: r["create_subscription"]?.["subscription_id"], amount: r["verify_payment"]?.["amount"] ?? p["amount"], package_name: r["create_subscription"]?.["package_name"] ?? "" }),
        execute: (sb, i) => stepGenerateInvoice(sb, i),
        compensate: async (sb, _i, o) => { if (o["invoice_id"]) await sb.from("invoices").update({ status: "cancelled", updated_at: now() }).eq("id", o["invoice_id"]); },
      },
      {
        name: "update_radius", type: "update_radius", canCompensate: false,
        buildInput: (p, r) => ({ tenant_id: p["tenant_id"], customer_id: r["verify_payment"]?.["customer_id"] ?? p["customer_id"], subscription_id: r["create_subscription"]?.["subscription_id"], package_id: r["verify_payment"]?.["package_id"] ?? p["package_id"] }),
        execute: (sb, i) => stepUpdateRadius(sb, i),
      },
      {
        name: "activate_router_user", type: "activate_router_user", canCompensate: true,
        buildInput: (p, r) => ({ subscription_id: r["create_subscription"]?.["subscription_id"], tenant_id: p["tenant_id"] }),
        execute: (sb, i) => stepActivateRouterUser(sb, i),
        compensate: async (sb, _i, o) => { if (o["router_id"] && o["username"]) await sb.functions.invoke("router-command", { body: { routerId: o["router_id"], command: "suspend_user", params: { username: o["username"] } } }).catch(() => {}); },
      },
      {
        name: "send_notifications", type: "send_sms", canCompensate: false,
        buildInput: (p, r) => ({ tenant_id: p["tenant_id"], customer_id: r["verify_payment"]?.["customer_id"] ?? p["customer_id"], message: `Your ${r["create_subscription"]?.["package_name"] ?? ""} package is active until ${new Date(r["create_subscription"]?.["expires_at"] as string ?? "").toLocaleDateString()}. – SmartLinkNet` }),
        execute: (sb, i) => stepSendNotification(sb, i),
      },
      {
        name: "create_audit_log", type: "create_audit_log", canCompensate: false,
        buildInput: (p, r) => ({ tenant_id: p["tenant_id"], customer_id: r["verify_payment"]?.["customer_id"] ?? p["customer_id"], subscription_id: r["create_subscription"]?.["subscription_id"], payment_id: p["payment_id"], amount: r["verify_payment"]?.["amount"] ?? p["amount"] }),
        execute: async (sb, i) => { await sb.from("audit_trail").insert({ tenant_id: i["tenant_id"], entity_type: "payment", entity_id: i["payment_id"] ?? null, action: "payment_success_provisioned", after_state: { subscription_id: i["subscription_id"], amount: i["amount"] }, actor: "provisioning_engine", actor_type: "system", occurred_at: now() }).catch(() => {}); return { audit_created: true }; },
      },
    ];
  }

  if (workflowType === "subscription_expiry") {
    return [
      {
        name: "check_grace_period", type: "check_grace_period", canCompensate: false,
        buildInput: (p) => ({ subscription_id: p["subscription_id"], tenant_id: p["tenant_id"] }),
        execute: (sb, i) => stepCheckGracePeriod(sb, i),
      },
      {
        name: "suspend_service", type: "update_customer_status", canCompensate: true,
        buildInput: (p, r) => ({ subscription_id: r["check_grace_period"]?.["subscription_id"], skip: r["check_grace_period"]?.["skip_suspension"] ?? false, tenant_id: p["tenant_id"] }),
        execute: (sb, i) => stepSuspendService(sb, i),
        compensate: async (sb, i, o) => { if (!o["skipped"] && i["subscription_id"]) await sb.from("subscriptions").update({ status: o["previous_status"] ?? "active", updated_at: now() }).eq("id", i["subscription_id"]); },
      },
      {
        name: "update_router", type: "suspend_router_user", canCompensate: true,
        buildInput: (p, r) => ({ subscription_id: r["check_grace_period"]?.["subscription_id"], router_id: r["check_grace_period"]?.["router_id"], skip: r["check_grace_period"]?.["skip_suspension"] ?? false, tenant_id: p["tenant_id"] }),
        execute: (sb, i) => stepSuspendRouterUser(sb, i),
        compensate: async (sb, i, o) => { if (!o["skipped"] && i["router_id"] && o["username"]) await sb.functions.invoke("router-command", { body: { routerId: i["router_id"], command: "activate_user", params: { username: o["username"] } } }).catch(() => {}); },
      },
      {
        name: "notify_customer", type: "send_sms", canCompensate: false,
        buildInput: (p, r) => ({ tenant_id: p["tenant_id"], customer_id: r["check_grace_period"]?.["customer_id"], skip: r["check_grace_period"]?.["skip_suspension"] ?? false, message: `Your service was suspended due to expiry on ${new Date(r["check_grace_period"]?.["expires_at"] as string ?? "").toLocaleDateString()}. Renew to restore. – SmartLinkNet` }),
        execute: async (sb, i) => { if (i["skip"]) return { skipped: true }; return stepSendNotification(sb, i); },
      },
      {
        name: "create_audit_log", type: "create_audit_log", canCompensate: false,
        buildInput: (p, r) => ({ tenant_id: p["tenant_id"], subscription_id: r["check_grace_period"]?.["subscription_id"], customer_id: r["check_grace_period"]?.["customer_id"], skip: r["check_grace_period"]?.["skip_suspension"] ?? false }),
        execute: async (sb, i) => { await sb.from("audit_trail").insert({ tenant_id: i["tenant_id"], entity_type: "subscription", entity_id: i["subscription_id"] ?? null, action: i["skip"] ? "expiry_grace_period_active" : "subscription_suspended_expiry", after_state: { customer_id: i["customer_id"] }, actor: "provisioning_engine", actor_type: "system", occurred_at: now() }).catch(() => {}); return { audit_created: true }; },
      },
    ];
  }

  if (workflowType === "payment_failure") {
    return [
      {
        name: "record_failure", type: "record_failure", canCompensate: false,
        buildInput: (p) => ({ payment_id: p["payment_id"], customer_id: p["customer_id"], amount: p["amount"], tenant_id: p["tenant_id"], reason: p["failure_reason"] ?? "Payment declined" }),
        execute: (sb, i) => stepRecordFailure(sb, i),
      },
      {
        name: "retry_payment", type: "retry_payment", canCompensate: false,
        buildInput: (p, r) => ({ payment_id: r["record_failure"]?.["payment_id"], customer_id: r["record_failure"]?.["customer_id"], should_retry: r["record_failure"]?.["should_retry"] ?? false, retry_count: r["record_failure"]?.["retry_count"] ?? 0, tenant_id: p["tenant_id"] }),
        execute: (sb, i) => stepRetryPayment(sb, i),
      },
      {
        name: "notify_customer", type: "send_sms", canCompensate: false,
        buildInput: (p, r) => ({ tenant_id: p["tenant_id"], customer_id: r["record_failure"]?.["customer_id"] ?? p["customer_id"], should_retry: r["record_failure"]?.["should_retry"] ?? false, retry_at: r["retry_payment"]?.["retry_at"], reason: r["record_failure"]?.["reason"] ?? "Payment declined", message: r["record_failure"]?.["should_retry"] ? `Your payment failed. We will retry on ${new Date(r["retry_payment"]?.["retry_at"] as string ?? "").toLocaleString()}. – SmartLinkNet` : `Your payment failed after multiple attempts. Please contact support. – SmartLinkNet` }),
        execute: (sb, i) => stepSendNotification(sb, i),
      },
      {
        name: "create_audit_log", type: "create_audit_log", canCompensate: false,
        buildInput: (p, r) => ({ tenant_id: p["tenant_id"], payment_id: p["payment_id"], customer_id: r["record_failure"]?.["customer_id"] ?? p["customer_id"], reason: r["record_failure"]?.["reason"], should_retry: r["record_failure"]?.["should_retry"], retry_at: r["retry_payment"]?.["retry_at"] }),
        execute: async (sb, i) => { await sb.from("audit_trail").insert({ tenant_id: i["tenant_id"], entity_type: "payment", entity_id: i["payment_id"] ?? null, action: i["should_retry"] ? "payment_failure_retry_scheduled" : "payment_failure_exhausted", after_state: { reason: i["reason"], retry_at: i["retry_at"] ?? null, customer_id: i["customer_id"] }, actor: "provisioning_engine", actor_type: "system", occurred_at: now() }).catch(() => {}); return { audit_created: true }; },
      },
    ];
  }

  if (workflowType === "manual_activation") {
    return [
      {
        name: "activate_subscription", type: "update_customer_status", canCompensate: true,
        buildInput: (p) => ({ subscription_id: p["subscription_id"], tenant_id: p["tenant_id"], operator_id: p["operator_id"] ?? "system" }),
        execute: async (sb, input) => {
          const { data: prev } = await sb.from("subscriptions").select("status, expires_at").eq("id", input["subscription_id"]).maybeSingle();
          if (!prev) throw new Error("Subscription not found");
          const expiresAt = prev.expires_at && new Date(prev.expires_at) > new Date() ? prev.expires_at : new Date(Date.now() + 30 * 86_400_000).toISOString();
          await sb.from("subscriptions").update({ status: "active", expires_at: expiresAt, updated_at: now() }).eq("id", input["subscription_id"]);
          return { previous_status: prev.status, expires_at: expiresAt };
        },
        compensate: async (sb, i, o) => { await sb.from("subscriptions").update({ status: o["previous_status"] ?? "suspended", updated_at: now() }).eq("id", i["subscription_id"]); },
      },
      {
        name: "activate_router_user", type: "activate_router_user", canCompensate: true,
        buildInput: (p) => ({ subscription_id: p["subscription_id"], tenant_id: p["tenant_id"] }),
        execute: (sb, i) => stepActivateRouterUser(sb, i),
        compensate: async (sb, _i, o) => { if (o["router_id"] && o["username"]) await sb.functions.invoke("router-command", { body: { routerId: o["router_id"], command: "suspend_user", params: { username: o["username"] } } }).catch(() => {}); },
      },
      {
        name: "notify_customer", type: "send_sms", canCompensate: false,
        buildInput: (p) => ({ tenant_id: p["tenant_id"], customer_id: p["customer_id"], message: "Your internet service has been activated. – SmartLinkNet" }),
        execute: (sb, i) => stepSendNotification(sb, i),
      },
      {
        name: "create_audit_log", type: "create_audit_log", canCompensate: false,
        buildInput: (p, r) => ({ tenant_id: p["tenant_id"], subscription_id: p["subscription_id"], customer_id: p["customer_id"], operator_id: p["operator_id"] ?? "system", previous_status: r["activate_subscription"]?.["previous_status"] }),
        execute: async (sb, i) => { await sb.from("audit_trail").insert({ tenant_id: i["tenant_id"], entity_type: "subscription", entity_id: i["subscription_id"] ?? null, action: "manual_activation", before_state: { status: i["previous_status"] }, after_state: { status: "active" }, actor: i["operator_id"] as string, actor_type: "user", occurred_at: now() }).catch(() => {}); return { audit_created: true }; },
      },
    ];
  }

  if (workflowType === "manual_suspension") {
    return [
      {
        name: "suspend_subscription", type: "update_customer_status", canCompensate: true,
        buildInput: (p) => ({ subscription_id: p["subscription_id"], tenant_id: p["tenant_id"], reason: p["reason"] ?? "Manual suspension", operator_id: p["operator_id"] ?? "system" }),
        execute: async (sb, input) => {
          const { data: prev } = await sb.from("subscriptions").select("status").eq("id", input["subscription_id"]).maybeSingle();
          if (!prev) throw new Error("Subscription not found");
          await sb.from("subscriptions").update({ status: "suspended", updated_at: now() }).eq("id", input["subscription_id"]);
          return { previous_status: prev.status };
        },
        compensate: async (sb, i, o) => { await sb.from("subscriptions").update({ status: o["previous_status"] ?? "active", updated_at: now() }).eq("id", i["subscription_id"]); },
      },
      {
        name: "suspend_router_user", type: "suspend_router_user", canCompensate: true,
        buildInput: (p) => ({ subscription_id: p["subscription_id"], tenant_id: p["tenant_id"] }),
        execute: (sb, i) => stepSuspendRouterUser(sb, i),
        compensate: async (sb, i, o) => { if (o["router_id"] && o["username"]) await sb.functions.invoke("router-command", { body: { routerId: i["router_id"], command: "activate_user", params: { username: o["username"] } } }).catch(() => {}); },
      },
      {
        name: "notify_customer", type: "send_sms", canCompensate: false,
        buildInput: (p) => ({ tenant_id: p["tenant_id"], customer_id: p["customer_id"], message: `Your service has been suspended. Reason: ${p["reason"] ?? "Manual suspension"}. Contact support. – SmartLinkNet` }),
        execute: (sb, i) => stepSendNotification(sb, i),
      },
      {
        name: "create_audit_log", type: "create_audit_log", canCompensate: false,
        buildInput: (p, r) => ({ tenant_id: p["tenant_id"], subscription_id: p["subscription_id"], customer_id: p["customer_id"], operator_id: p["operator_id"] ?? "system", reason: p["reason"] ?? "Manual suspension", previous_status: r["suspend_subscription"]?.["previous_status"] }),
        execute: async (sb, i) => { await sb.from("audit_trail").insert({ tenant_id: i["tenant_id"], entity_type: "subscription", entity_id: i["subscription_id"] ?? null, action: "manual_suspension", before_state: { status: i["previous_status"] }, after_state: { status: "suspended", reason: i["reason"] }, actor: i["operator_id"] as string, actor_type: "user", occurred_at: now() }).catch(() => {}); return { audit_created: true }; },
      },
    ];
  }

  return [];
}

// ── Main serve handler ────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const body = await req.json() as { workflow_id?: string; recover?: boolean };

    // ── Recovery mode: reset stale locked workflows ──────────────────────────
    if (body.recover) {
      const { data: count } = await sb.rpc("fn_recover_stale_workflows");
      return resp({ ok: true, recovered: count ?? 0 });
    }

    const { workflow_id } = body;
    if (!workflow_id) return resp({ error: "workflow_id required" }, 400);

    // ── Load workflow ────────────────────────────────────────────────────────
    const { data: wf, error: wfErr } = await sb
      .from("provisioning_workflows")
      .select("*")
      .eq("id", workflow_id)
      .maybeSingle();
    if (wfErr) return resp({ error: wfErr.message }, 500);
    if (!wf)   return resp({ error: "Workflow not found" }, 404);
    if (wf.status === "completed") return resp({ ok: true, skipped: true, reason: "already_completed" });

    // ── Acquire optimistic lock ──────────────────────────────────────────────
    const { data: locked } = await sb.rpc("fn_acquire_workflow_lock", {
      _workflow_id: workflow_id,
      _worker_id:   WORKER_ID,
      _ttl_seconds: 300,
    });
    if (!locked) return resp({ ok: true, skipped: true, reason: "locked_by_other_worker" });

    await appendEvent(sb, workflow_id, wf.tenant_id, "workflow_started", { worker: WORKER_ID });

    const steps = getSteps(wf.type, wf.payload);
    if (steps.length === 0) {
      await sb.rpc("fn_release_workflow_lock", { _workflow_id: workflow_id, _status: "failed", _error: `Unknown workflow type: ${wf.type}` });
      return resp({ error: `Unknown workflow type: ${wf.type}` }, 400);
    }

    // ── Seed steps table on first run ────────────────────────────────────────
    const { count: existingCount } = await sb
      .from("provisioning_steps")
      .select("id", { count: "exact", head: true })
      .eq("workflow_id", workflow_id);

    if (!existingCount) {
      await sb.from("provisioning_steps").insert(
        steps.map((s, i) => ({
          workflow_id, tenant_id: wf.tenant_id,
          step_order: i + 1, step_name: s.name, step_type: s.type,
          status: "pending", can_compensate: s.canCompensate,
          input_data: {}, output_data: {},
        }))
      );
      await sb.from("provisioning_workflows").update({ total_steps: steps.length, updated_at: now() }).eq("id", workflow_id);
    }

    // ── Load persisted steps (for resume) ────────────────────────────────────
    const { data: persisted } = await sb
      .from("provisioning_steps")
      .select("*")
      .eq("workflow_id", workflow_id)
      .order("step_order");

    const results: Record<string, Record<string, unknown>> = {};
    for (const ps of persisted ?? []) {
      if (ps.status === "completed") results[ps.step_name] = ps.output_data ?? {};
    }

    // ── Execute steps ────────────────────────────────────────────────────────
    for (let i = 0; i < steps.length; i++) {
      const def  = steps[i];
      const ps   = (persisted ?? []).find((s: any) => s.step_order === i + 1);
      if (ps?.status === "completed") continue; // idempotent resume

      const input = def.buildInput(wf.payload, results);

      // Mark step running
      if (ps?.id) {
        await sb.from("provisioning_steps").update({ status: "running", input_data: input, started_at: now() }).eq("id", ps.id);
      }
      await sb.from("provisioning_workflows").update({ current_step: i + 1, updated_at: now() }).eq("id", workflow_id);
      await appendEvent(sb, workflow_id, wf.tenant_id, "step_started", { step: def.name }, def.name, i + 1);

      let output: Record<string, unknown> = {};
      let lastError: string | null = null;

      // Per-step retry with backoff
      for (let attempt = 1; attempt <= STEP_MAX_ATTEMPTS; attempt++) {
        try {
          output = await def.execute(sb, input);
          lastError = null;
          break;
        } catch (err: unknown) {
          lastError = (err as Error).message;
          if (attempt < STEP_MAX_ATTEMPTS) {
            await new Promise((r) => setTimeout(r, 300 * attempt));
          }
        }
      }

      if (lastError !== null) {
        // Mark step failed
        if (ps?.id) await sb.from("provisioning_steps").update({ status: "failed", error: lastError, completed_at: now() }).eq("id", ps.id);
        await appendEvent(sb, workflow_id, wf.tenant_id, "step_failed", { step: def.name, error: lastError }, def.name, i + 1);

        // ── Saga compensation: rollback completed steps in reverse ───────────
        await sb.from("provisioning_workflows").update({ status: "compensating", updated_at: now() }).eq("id", workflow_id);
        await appendEvent(sb, workflow_id, wf.tenant_id, "workflow_rolled_back", { failed_step: def.name });

        for (let j = i - 1; j >= 0; j--) {
          const cDef = steps[j];
          if (!cDef.canCompensate || !cDef.compensate) continue;
          const cPs = (persisted ?? []).find((s: any) => s.step_order === j + 1);
          if (!cPs || cPs.status !== "completed") continue;

          await appendEvent(sb, workflow_id, wf.tenant_id, "step_compensating", { step: cDef.name }, cDef.name, j + 1);
          try {
            await cDef.compensate(sb, cPs.input_data ?? {}, cPs.output_data ?? {});
            await sb.from("provisioning_steps").update({ status: "compensated", compensated: true, updated_at: now() }).eq("id", cPs.id);
            await appendEvent(sb, workflow_id, wf.tenant_id, "step_compensated", { step: cDef.name }, cDef.name, j + 1);
          } catch (cErr: unknown) {
            await sb.from("provisioning_workflows").update({ rollback_error: `Compensation of "${cDef.name}" failed: ${(cErr as Error).message}`, updated_at: now() }).eq("id", workflow_id);
          }
        }

        await sb.rpc("fn_release_workflow_lock", { _workflow_id: workflow_id, _status: "failed", _error: `Step "${def.name}" failed: ${lastError}` });
        await appendEvent(sb, workflow_id, wf.tenant_id, "workflow_failed", { error: lastError });
        await writeAudit(sb, wf.tenant_id, workflow_id, "workflow", workflow_id, "workflow_failed", { step: def.name, error: lastError });
        return resp({ ok: false, failed_step: def.name, error: lastError });
      }

      // Step succeeded
      results[def.name] = output;
      if (ps?.id) await sb.from("provisioning_steps").update({ status: "completed", output_data: output, completed_at: now() }).eq("id", ps.id);
      await sb.from("provisioning_workflows").update({ completed_steps: i + 1, updated_at: now() }).eq("id", workflow_id);
      await appendEvent(sb, workflow_id, wf.tenant_id, "step_completed", { step: def.name }, def.name, i + 1);
    }

    // ── All steps complete ───────────────────────────────────────────────────
    await sb.rpc("fn_release_workflow_lock", { _workflow_id: workflow_id, _status: "completed", _error: null });
    await appendEvent(sb, workflow_id, wf.tenant_id, "workflow_completed", { steps: steps.length });
    await writeAudit(sb, wf.tenant_id, workflow_id, "workflow", workflow_id, "workflow_completed", { type: wf.type, steps: steps.length });

    return resp({ ok: true, workflow_id, steps_executed: steps.length });

  } catch (err: unknown) {
    return resp({ error: (err as Error).message }, 500);
  }
});
