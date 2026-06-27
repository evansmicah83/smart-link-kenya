/**
 * SmartLinkNet — Observability Platform
 * Centralized logging, metrics, alerting, and audit trail
 */
import { supabase } from "@/integrations/supabase/client";

export type LogLevel = "debug" | "info" | "warn" | "error" | "critical";
export type LogCategory =
  | "auth" | "billing" | "provisioning" | "router" | "sms"
  | "payment" | "security" | "automation" | "api" | "system";

export interface AppLog {
  id?: string;
  tenant_id?: string | null;
  level: LogLevel;
  category: LogCategory;
  message: string;
  context?: Record<string, unknown>;
  user_id?: string | null;
  request_id?: string | null;
  created_at?: string;
}

export interface AlertRule {
  id?: string;
  tenant_id: string;
  name: string;
  metric: string;
  operator: "gt" | "lt" | "gte" | "lte" | "eq" | "ne";
  threshold: number;
  severity: "info" | "warning" | "critical";
  notify_channels: string[];
  notify_users?: string[];
  cooldown_mins: number;
  is_active: boolean;
  last_fired?: string | null;
  created_at?: string;
}

export interface AlertHistory {
  id?: string;
  tenant_id: string;
  rule_id?: string | null;
  metric: string;
  value?: number | null;
  message: string;
  severity: string;
  resolved_at?: string | null;
  created_at?: string;
}

export async function getLogs(tenantId: string, opts: {
  level?: LogLevel;
  category?: LogCategory;
  limit?: number;
  since?: string;
} = {}): Promise<AppLog[]> {
  let q = (supabase as any)
    .from("app_logs")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(opts.limit ?? 200);
  if (opts.level) q = q.eq("level", opts.level);
  if (opts.category) q = q.eq("category", opts.category);
  if (opts.since) q = q.gte("created_at", opts.since);
  const { data } = await q;
  return (data ?? []) as AppLog[];
}

export async function writeLog(log: Omit<AppLog, "id" | "created_at">): Promise<void> {
  await (supabase as any).from("app_logs").insert(log);
}

export async function getAlertRules(tenantId: string): Promise<AlertRule[]> {
  const { data } = await (supabase as any)
    .from("alert_rules")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });
  return (data ?? []) as AlertRule[];
}

export async function saveAlertRule(rule: AlertRule): Promise<void> {
  if (rule.id) {
    const { error } = await (supabase as any).from("alert_rules").update(rule).eq("id", rule.id);
    if (error) throw error;
  } else {
    const { error } = await (supabase as any).from("alert_rules").insert(rule);
    if (error) throw error;
  }
}

export async function deleteAlertRule(id: string): Promise<void> {
  const { error } = await (supabase as any).from("alert_rules").delete().eq("id", id);
  if (error) throw error;
}

export async function getAlertHistory(tenantId: string, limit = 50): Promise<AlertHistory[]> {
  const { data } = await (supabase as any)
    .from("alert_history")
    .select("*, alert_rules(name)")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as AlertHistory[];
}

export async function getMetrics(tenantId: string, name: string, since: string) {
  const { data } = await (supabase as any)
    .from("metrics")
    .select("value, labels, recorded_at")
    .eq("tenant_id", tenantId)
    .eq("name", name)
    .gte("recorded_at", since)
    .order("recorded_at", { ascending: true });
  return (data ?? []) as { value: number; labels: Record<string, unknown>; recorded_at: string }[];
}

export async function recordMetric(tenantId: string, name: string, value: number, labels: Record<string, unknown> = {}): Promise<void> {
  await (supabase as any).from("metrics").insert({ tenant_id: tenantId, name, value, labels });
}

export async function getLogStats(tenantId: string, since: string) {
  const { data } = await (supabase as any)
    .from("app_logs")
    .select("level, category")
    .eq("tenant_id", tenantId)
    .gte("created_at", since);
  const logs = (data ?? []) as { level: string; category: string }[];
  return {
    total: logs.length,
    errors: logs.filter((l) => l.level === "error" || l.level === "critical").length,
    warnings: logs.filter((l) => l.level === "warn").length,
    byCategory: logs.reduce<Record<string, number>>((acc, l) => {
      acc[l.category] = (acc[l.category] ?? 0) + 1;
      return acc;
    }, {}),
    byLevel: logs.reduce<Record<string, number>>((acc, l) => {
      acc[l.level] = (acc[l.level] ?? 0) + 1;
      return acc;
    }, {}),
  };
}

export const LOG_LEVEL_COLORS: Record<LogLevel, string> = {
  debug:    "bg-muted text-muted-foreground",
  info:     "bg-blue-500/15 text-blue-600",
  warn:     "bg-yellow-500/15 text-yellow-600",
  error:    "bg-red-500/15 text-red-600",
  critical: "bg-red-600/20 text-red-700",
};

export const LOG_CATEGORY_LABELS: Record<LogCategory, string> = {
  auth:         "Authentication",
  billing:      "Billing",
  provisioning: "Provisioning",
  router:       "Router",
  sms:          "SMS",
  payment:      "Payment",
  security:     "Security",
  automation:   "Automation",
  api:          "API",
  system:       "System",
};
