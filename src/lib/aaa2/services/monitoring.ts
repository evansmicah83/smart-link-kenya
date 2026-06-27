/**
 * SmartLinkNet — Phase 2: RADIUS Monitoring Service
 * Real-time health monitoring, failover detection, alerting
 */

import { supabase } from "@/integrations/supabase/client";
import type { TenantRef, AaaStats } from "../types";
import { radiusServerPool } from "./radius-pool";
import { nasManagement } from "./nas";
import { accountingService } from "./accounting";

function now(): string { return new Date().toISOString(); }

export class RadiusMonitoringService {

  async runHealthCycle(tenantId: TenantRef) {
    const servers = await radiusServerPool.list(tenantId);
    for (const server of servers.filter((s) => s.isActive)) {
      const start = Date.now();
      let isHealthy = false;
      let failureReason: string | undefined;
      try {
        const { data, error } = await supabase.functions.invoke("health-check", {
          body: { service: "radius", server_id: server.id, tenant_id: tenantId },
        });
        isHealthy = !error && data?.healthy === true;
        if (!isHealthy) failureReason = error?.message ?? data?.error ?? "Probe failed";
      } catch (e: unknown) { failureReason = (e as Error).message; }
      await radiusServerPool.recordHealthCheck(server.id, isHealthy, Date.now() - start, failureReason);
    }
  }

  async getAaaStats(tenantId: TenantRef): Promise<AaaStats> {
    const since1h = new Date(Date.now() - 3600000).toISOString();
    const [stats, servers, nasDevices] = await Promise.all([
      accountingService.getStats(tenantId, since1h),
      radiusServerPool.list(tenantId),
      nasManagement.list(tenantId),
    ]);

    const { data: latencyRows } = await (supabase as any)
      .from("radius_health_checks")
      .select("latency_ms")
      .eq("tenant_id", tenantId)
      .eq("is_healthy", true)
      .gte("checked_at", since1h)
      .limit(100);

    const latencies = (latencyRows ?? []).map((r: any) => r.latency_ms as number).filter(Boolean);
    const avgLatency = latencies.length > 0
      ? Math.round(latencies.reduce((a: number, b: number) => a + b, 0) / latencies.length)
      : null;

    return {
      ...stats,
      activeNasDevices:     nasDevices.filter((n) => n.isActive).length,
      healthyRadiusServers: servers.filter((s) => s.isHealthy === true).length,
      avgAuthLatencyMs:     avgLatency,
    };
  }

  async getAuthTimeline(tenantId: TenantRef, hours = 24) {
    const since = new Date(Date.now() - hours * 3600000).toISOString();
    const { data } = await (supabase as any)
      .from("auth_events")
      .select("event_type, received_at")
      .eq("tenant_id", tenantId)
      .gte("received_at", since)
      .order("received_at");

    const buckets = new Map<string, { success: number; failure: number; reject: number }>();
    for (const row of data ?? []) {
      const hour = new Date(row.received_at).toISOString().slice(0, 13);
      if (!buckets.has(hour)) buckets.set(hour, { success: 0, failure: 0, reject: 0 });
      const b = buckets.get(hour)!;
      if (row.event_type === "auth_success") b.success++;
      else if (row.event_type === "auth_failure") b.failure++;
      else if (row.event_type === "auth_reject") b.reject++;
    }
    return Array.from(buckets.entries())
      .map(([hour, counts]) => ({ hour, ...counts }))
      .sort((a, b) => a.hour.localeCompare(b.hour));
  }

  async getAccountingByNas(tenantId: TenantRef) {
    const since = new Date(Date.now() - 86400000).toISOString();
    const { data } = await (supabase as any)
      .from("radius_accounting")
      .select("nas_id, acct_status_type, nas_devices(name)")
      .eq("tenant_id", tenantId)
      .gte("received_at", since);

    const map = new Map<string, { nasName: string; startCount: number; stopCount: number; updateCount: number }>();
    for (const row of data ?? []) {
      const name = row.nas_devices?.name ?? row.nas_id ?? "Unknown";
      if (!map.has(name)) map.set(name, { nasName: name, startCount: 0, stopCount: 0, updateCount: 0 });
      const b = map.get(name)!;
      if (row.acct_status_type === "Start") b.startCount++;
      else if (row.acct_status_type === "Stop") b.stopCount++;
      else if (row.acct_status_type === "Interim-Update") b.updateCount++;
    }
    return Array.from(map.values());
  }

  async getAuthEvents(tenantId: TenantRef, opts: {
    eventType?: string; username?: string; since?: string; limit?: number;
  } = {}) {
    let q = (supabase as any)
      .from("auth_events")
      .select("*, nas_devices(name,vendor)")
      .eq("tenant_id", tenantId)
      .order("received_at", { ascending: false })
      .limit(opts.limit ?? 200);
    if (opts.eventType) q = q.eq("event_type", opts.eventType);
    if (opts.username)  q = q.ilike("username", `%${opts.username}%`);
    if (opts.since)     q = q.gte("received_at", opts.since);
    const { data } = await q;
    return data ?? [];
  }

  async triggerFailover(tenantId: TenantRef, failedServerId: string): Promise<string | null> {
    await (supabase as any).from("radius_servers")
      .update({ is_healthy: false, consecutive_failures: 99, updated_at: now() })
      .eq("id", failedServerId);
    const next = await radiusServerPool.selectServer(tenantId);
    await (supabase as any).from("job_queue").insert({
      tenant_id: tenantId, type: "notify_admin",
      payload: { event: "radius.failover_triggered", failed_server_id: failedServerId, promoted_server_id: next?.id },
      priority: 1, queue_name: "notifications",
    }).catch(() => {});
    return next?.id ?? null;
  }
}

export const radiusMonitoring = new RadiusMonitoringService();
