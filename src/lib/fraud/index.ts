/**
 * SmartLinkNet — Fraud Detection & Prevention Engine
 * Detects MAC cloning, concurrent abuse, session hijack, voucher abuse, geo anomalies
 */
import { supabase } from "@/integrations/supabase/client";

export type FraudType =
  | "mac_cloning"
  | "account_sharing"
  | "concurrent_login"
  | "session_hijack"
  | "credential_stuffing"
  | "payment_fraud"
  | "voucher_abuse"
  | "geo_anomaly"
  | "device_fingerprint"
  | "suspicious_auth"
  | "brute_force";

export type FraudSeverity = "low" | "medium" | "high" | "critical";
export type FraudStatus = "open" | "investigating" | "resolved" | "dismissed";

export interface FraudIncident {
  id?: string;
  tenant_id: string;
  customer_id?: string | null;
  session_id?: string | null;
  type: FraudType;
  severity: FraudSeverity;
  status: FraudStatus;
  description: string;
  evidence?: Record<string, unknown>;
  ip_address?: string | null;
  mac_address?: string | null;
  device_fingerprint?: string | null;
  action_taken?: string | null;
  created_at?: string;
  updated_at?: string;
}

export async function getFraudIncidents(tenantId: string, status?: FraudStatus): Promise<FraudIncident[]> {
  let q = (supabase as any)
    .from("fraud_incidents")
    .select("*, customers(full_name, phone)")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (status) q = q.eq("status", status);
  const { data } = await q;
  return (data ?? []) as FraudIncident[];
}

export async function createFraudIncident(incident: Omit<FraudIncident, "id" | "created_at" | "updated_at">): Promise<FraudIncident> {
  const { data, error } = await (supabase as any)
    .from("fraud_incidents")
    .insert(incident)
    .select()
    .single();
  if (error) throw error;
  return data as FraudIncident;
}

export async function updateFraudIncident(id: string, updates: Partial<FraudIncident>): Promise<void> {
  const { error } = await (supabase as any)
    .from("fraud_incidents")
    .update(updates)
    .eq("id", id);
  if (error) throw error;
}

export async function resolveFraudIncident(id: string): Promise<void> {
  return updateFraudIncident(id, { status: "resolved" });
}

export async function getFraudStats(tenantId: string) {
  const { data } = await (supabase as any)
    .from("fraud_incidents")
    .select("type, severity, status")
    .eq("tenant_id", tenantId);
  const incidents = (data ?? []) as { type: string; severity: string; status: string }[];
  return {
    total: incidents.length,
    open: incidents.filter((i) => i.status === "open").length,
    critical: incidents.filter((i) => i.severity === "critical").length,
    high: incidents.filter((i) => i.severity === "high").length,
    byType: incidents.reduce<Record<string, number>>((acc, i) => {
      acc[i.type] = (acc[i.type] ?? 0) + 1;
      return acc;
    }, {}),
  };
}

export async function checkConcurrentSessions(
  customerId: string,
  tenantId: string,
  maxAllowed = 3
): Promise<{ exceeded: boolean; sessionCount: number }> {
  const { data } = await (supabase as any)
    .rpc("fn_check_concurrent_sessions", {
      _customer_id: customerId,
      _tenant_id: tenantId,
      _max_concurrent: maxAllowed,
    });
  const sessions = (data ?? []) as unknown[];
  const exceeded = sessions.length > maxAllowed;
  return { exceeded, sessionCount: sessions.length };
}

export async function detectMacCloning(
  tenantId: string,
  macAddress: string
): Promise<{ suspicious: boolean; conflictingCustomers: string[] }> {
  const { data } = await (supabase as any)
    .from("sessions")
    .select("customer_id, customers(full_name)")
    .eq("tenant_id", tenantId)
    .eq("mac_address", macAddress)
    .is("ended_at", null);
  const sessions = (data ?? []) as { customer_id: string }[];
  const uniqueCustomers = [...new Set(sessions.map((s) => s.customer_id).filter(Boolean))];
  return {
    suspicious: uniqueCustomers.length > 1,
    conflictingCustomers: uniqueCustomers,
  };
}

export async function detectVoucherAbuse(
  tenantId: string,
  ipAddress: string,
  windowMinutes = 10,
  maxVouchers = 5
): Promise<{ suspicious: boolean; count: number }> {
  const since = new Date(Date.now() - windowMinutes * 60000).toISOString();
  const { count } = await (supabase as any)
    .from("vouchers")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("status", "active")
    .gte("activated_at", since)
    .eq("activated_ip", ipAddress);
  return {
    suspicious: (count ?? 0) >= maxVouchers,
    count: count ?? 0,
  };
}

export async function logAuthFailures(
  tenantId: string,
  username: string,
  windowMins = 5,
  threshold = 10
): Promise<{ bruteForce: boolean; failureCount: number }> {
  const since = new Date(Date.now() - windowMins * 60000).toISOString();
  const { count } = await (supabase as any)
    .from("auth_events")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("username", username)
    .eq("event_type", "auth_failure")
    .gte("received_at", since);
  return {
    bruteForce: (count ?? 0) >= threshold,
    failureCount: count ?? 0,
  };
}

export const FRAUD_TYPE_LABELS: Record<FraudType, string> = {
  mac_cloning:         "MAC Address Cloning",
  account_sharing:     "Account Sharing",
  concurrent_login:    "Concurrent Login Abuse",
  session_hijack:      "Session Hijacking",
  credential_stuffing: "Credential Stuffing",
  payment_fraud:       "Payment Fraud",
  voucher_abuse:       "Voucher Abuse",
  geo_anomaly:         "Geographic Anomaly",
  device_fingerprint:  "Device Fingerprint Mismatch",
  suspicious_auth:     "Suspicious Authentication",
  brute_force:         "Brute Force Attack",
};

export const FRAUD_SEVERITY_COLORS: Record<FraudSeverity, string> = {
  low:      "bg-blue-500/15 text-blue-600",
  medium:   "bg-yellow-500/15 text-yellow-600",
  high:     "bg-orange-500/15 text-orange-600",
  critical: "bg-red-500/15 text-red-600",
};
