/**
 * SmartLinkNet — Automation Rule Engine
 * Configurable IF/THEN business rules stored in DB and evaluated client-side or via edge functions.
 */
import { supabase } from "@/integrations/supabase/client";

export type RuleTrigger =
  | "subscription_expired"
  | "payment_received"
  | "payment_failed"
  | "router_offline"
  | "customer_inactive_days"
  | "low_wallet_balance"
  | "ticket_sla_breached"
  | "new_customer";

export type RuleAction =
  | "suspend_service"
  | "activate_service"
  | "send_sms"
  | "send_email"
  | "notify_admin"
  | "create_ticket"
  | "generate_invoice";

export interface AutomationRule {
  id?: string;
  tenant_id: string;
  name: string;
  trigger: RuleTrigger;
  conditions: Record<string, unknown>;
  action: RuleAction;
  action_params: Record<string, unknown>;
  is_active: boolean;
  last_run?: string | null;
  run_count?: number;
}

export async function getRules(tenantId: string): Promise<AutomationRule[]> {
  const { data } = await (supabase as any)
    .from("automation_rules")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });
  return (data ?? []) as AutomationRule[];
}

export async function saveRule(rule: AutomationRule): Promise<void> {
  if (rule.id) {
    const { error } = await (supabase as any)
      .from("automation_rules")
      .update(rule)
      .eq("id", rule.id);
    if (error) throw error;
  } else {
    const { error } = await (supabase as any)
      .from("automation_rules")
      .insert(rule);
    if (error) throw error;
  }
}

export async function deleteRule(id: string): Promise<void> {
  const { error } = await (supabase as any)
    .from("automation_rules")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

export async function toggleRule(id: string, isActive: boolean): Promise<void> {
  const { error } = await (supabase as any)
    .from("automation_rules")
    .update({ is_active: isActive })
    .eq("id", id);
  if (error) throw error;
}

export async function getRuleLogs(tenantId: string, limit = 50) {
  const { data } = await (supabase as any)
    .from("automation_logs")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as any[];
}

export const TRIGGER_LABELS: Record<RuleTrigger, string> = {
  subscription_expired: "Subscription Expired",
  payment_received: "Payment Received",
  payment_failed: "Payment Failed",
  router_offline: "Router Goes Offline",
  customer_inactive_days: "Customer Inactive (days)",
  low_wallet_balance: "Low Wallet Balance",
  ticket_sla_breached: "Ticket SLA Breached",
  new_customer: "New Customer Registered",
};

export const ACTION_LABELS: Record<RuleAction, string> = {
  suspend_service: "Suspend Service",
  activate_service: "Activate Service",
  send_sms: "Send SMS",
  send_email: "Send Email",
  notify_admin: "Notify Administrator",
  create_ticket: "Create Support Ticket",
  generate_invoice: "Generate Invoice",
};

export function BLANK_RULE(tenantId: string): AutomationRule {
  return {
    tenant_id: tenantId,
    name: "",
    trigger: "subscription_expired",
    conditions: {},
    action: "suspend_service",
    action_params: {},
    is_active: true,
  };
}
