/**
 * SmartLinkNet — High Availability Engine
 * Circuit breakers, health monitoring, service recovery, retry mechanisms
 */
import { supabase } from "@/integrations/supabase/client";

export type HealthStatus = "healthy" | "degraded" | "unhealthy" | "unknown";
export type CircuitState  = "closed" | "open" | "half-open";

export interface HealthCheck {
  id?: string;
  tenant_id?: string | null;
  service_name: string;
  service_type: string;
  status: HealthStatus;
  latency_ms?: number | null;
  error?: string | null;
  metadata?: Record<string, unknown>;
  checked_at: string;
}

export interface CircuitBreaker {
  id?: string;
  tenant_id?: string | null;
  service_name: string;
  state: CircuitState;
  failure_count: number;
  success_count: number;
  last_failure?: string | null;
  open_until?: string | null;
  updated_at?: string;
}

export async function getHealthChecks(tenantId: string, limit = 100): Promise<HealthCheck[]> {
  const { data } = await (supabase as any)
    .from("health_checks")
    .select("*")
    .or(`tenant_id.eq.${tenantId},tenant_id.is.null`)
    .order("checked_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as HealthCheck[];
}

export async function getLatestHealthByService(tenantId: string): Promise<Record<string, HealthCheck>> {
  const checks = await getHealthChecks(tenantId, 500);
  return checks.reduce<Record<string, HealthCheck>>((acc, c) => {
    if (!acc[c.service_name] || acc[c.service_name].checked_at < c.checked_at) {
      acc[c.service_name] = c;
    }
    return acc;
  }, {});
}

export async function getCircuitBreakers(tenantId: string): Promise<CircuitBreaker[]> {
  const { data } = await (supabase as any)
    .from("circuit_breakers")
    .select("*")
    .or(`tenant_id.eq.${tenantId},tenant_id.is.null`)
    .order("updated_at", { ascending: false });
  return (data ?? []) as CircuitBreaker[];
}

export async function getServiceHealthSummary(tenantId: string) {
  const [checks, circuits] = await Promise.all([
    getLatestHealthByService(tenantId),
    getCircuitBreakers(tenantId),
  ]);
  const services = Object.values(checks);
  return {
    total: services.length,
    healthy: services.filter((s) => s.status === "healthy").length,
    degraded: services.filter((s) => s.status === "degraded").length,
    unhealthy: services.filter((s) => s.status === "unhealthy").length,
    openCircuits: circuits.filter((c) => c.state === "open").length,
    services: checks,
    circuits,
  };
}

export async function getNocIncidents(tenantId: string, status?: string) {
  let q = (supabase as any)
    .from("noc_incidents")
    .select("*, profiles!assigned_to(full_name)")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (status) q = q.eq("status", status);
  const { data } = await q;
  return (data ?? []) as NocIncident[];
}

export async function createNocIncident(incident: Omit<NocIncident, "id" | "created_at" | "updated_at">): Promise<NocIncident> {
  const { data, error } = await (supabase as any)
    .from("noc_incidents")
    .insert(incident)
    .select()
    .single();
  if (error) throw error;
  return data as NocIncident;
}

export async function updateNocIncident(id: string, updates: Partial<NocIncident>): Promise<void> {
  const { error } = await (supabase as any)
    .from("noc_incidents")
    .update(updates)
    .eq("id", id);
  if (error) throw error;
}

export interface NocIncident {
  id?: string;
  tenant_id: string;
  title: string;
  description?: string | null;
  severity: "p1" | "p2" | "p3" | "p4";
  status: "open" | "investigating" | "resolved" | "closed";
  affected_service?: string | null;
  affected_routers?: string[] | null;
  root_cause?: string | null;
  resolution?: string | null;
  sla_target_mins: number;
  acknowledged_at?: string | null;
  resolved_at?: string | null;
  closed_at?:    string | null;
  created_by?:   string | null;
  assigned_to?:  string | null;
  created_at?:   string;
  updated_at?:   string;
}

export const SEVERITY_LABELS: Record<string, string> = {
  p1: "P1 — Critical",
  p2: "P2 — High",
  p3: "P3 — Medium",
  p4: "P4 — Low",
};

export const SEVERITY_COLORS: Record<string, string> = {
  p1: "bg-red-600/20 text-red-700",
  p2: "bg-orange-500/15 text-orange-600",
  p3: "bg-yellow-500/15 text-yellow-600",
  p4: "bg-blue-500/15 text-blue-600",
};

export const HEALTH_COLORS: Record<HealthStatus, string> = {
  healthy:   "text-green-500",
  degraded:  "text-yellow-500",
  unhealthy: "text-red-500",
  unknown:   "text-muted-foreground",
};

export async function getAlertRules(tenantId: string) {
  const { data } = await (supabase as any)
    .from("alert_rules")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });
  return (data ?? []) as {
    id: string; name: string; metric: string; operator: string;
    threshold: number; severity: string; is_active: boolean; last_fired: string | null;
  }[];
}

export async function getAlertHistory(tenantId: string, limit = 50) {
  const { data } = await (supabase as any)
    .from("alert_history")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as {
    id: string; metric: string; message: string;
    severity: string; resolved_at: string | null; created_at: string;
  }[];
}
