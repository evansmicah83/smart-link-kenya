/**
 * SmartLinkNet — Phase 2: RADIUS Server Pool Service
 * Failover, multi-server, health monitoring, round-robin, priority selection
 */

import { supabase } from "@/integrations/supabase/client";
import type {
  RadiusServer, RadiusServerRef, TenantRef,
  RadiusHealthSnapshot, RadiusHealthStatus, FailoverStrategy,
} from "../types";

function now(): string { return new Date().toISOString(); }

// ─── DB row → RadiusServer ────────────────────────────────────────────────────

function mapRow(r: Record<string, unknown>): RadiusServer {
  return {
    id:                   r["id"] as string,
    tenantId:             r["tenant_id"] as string,
    name:                 r["name"] as string,
    host:                 r["host"] as string,
    authPort:             r["auth_port"] as number ?? 1812,
    acctPort:             r["acct_port"] as number ?? 1813,
    coaPort:              r["coa_port"] as number ?? 3799,
    sharedSecret:         r["shared_secret"] as string,
    protocol:             (r["protocol"] as any) ?? "mschapv2",
    role:                 (r["role"] as any) ?? "primary",
    isPrimary:            r["is_primary"] as boolean ?? true,
    isActive:             r["is_active"] as boolean ?? true,
    timeoutMs:            r["timeout_ms"] as number ?? 3000,
    retryCount:           r["retry_count"] as number ?? 3,
    priority:             r["priority"] as number ?? 1,
    failoverStrategy:     (r["failover_strategy"] as any) ?? "priority",
    isHealthy:            r["is_healthy"] as boolean | null ?? null,
    lastChecked:          r["last_checked"] as string | null ?? null,
    consecutiveFailures:  r["consecutive_failures"] as number ?? 0,
    lastFailureReason:    r["last_failure_reason"] as string | null ?? null,
    latencyMs:            r["latency_ms"] as number | null ?? null,
    createdAt:            r["created_at"] as string,
    updatedAt:            r["updated_at"] as string,
  };
}

// ─── Round-robin state (in-memory per tenant) ─────────────────────────────────

const rrIndex = new Map<string, number>();

function nextRoundRobin(tenantId: TenantRef, servers: RadiusServer[]): RadiusServer {
  const idx = (rrIndex.get(tenantId) ?? 0) % servers.length;
  rrIndex.set(tenantId, idx + 1);
  return servers[idx];
}

// ─── RadiusServerPoolService ──────────────────────────────────────────────────

export class RadiusServerPoolService {

  // ── CRUD ───────────────────────────────────────────────────────────────────

  async list(tenantId: TenantRef): Promise<RadiusServer[]> {
    const { data, error } = await (supabase as any)
      .from("radius_servers")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("priority");
    if (error) throw new Error(error.message);
    return (data ?? []).map(mapRow);
  }

  async get(serverId: RadiusServerRef): Promise<RadiusServer | null> {
    const { data } = await (supabase as any)
      .from("radius_servers")
      .select("*")
      .eq("id", serverId)
      .maybeSingle();
    return data ? mapRow(data) : null;
  }

  async save(tenantId: TenantRef, server: Partial<RadiusServer> & Record<string, unknown> & { name: string; host: string }): Promise<RadiusServer> {
    // Accept both camelCase (typed) and snake_case (from HTML form)
    const r = server as Record<string, unknown>;
    const payload = {
      tenant_id:           tenantId,
      name:                r["name"] as string,
      host:                r["host"] as string,
      auth_port:           (r["authPort"] ?? r["auth_port"] ?? 1812) as number,
      acct_port:           (r["acctPort"] ?? r["acct_port"] ?? 1813) as number,
      coa_port:            (r["coaPort"] ?? r["coa_port"] ?? 3799) as number,
      shared_secret:       (r["sharedSecret"] ?? r["shared_secret"] ?? "") as string,
      protocol:            (r["protocol"] ?? "mschapv2") as string,
      role:                (r["role"] ?? "primary") as string,
      is_primary:          (r["isPrimary"] ?? r["is_primary"] ?? true) as boolean,
      is_active:           (r["isActive"] ?? r["is_active"] ?? true) as boolean,
      timeout_ms:          (r["timeoutMs"] ?? r["timeout_ms"] ?? 3000) as number,
      retry_count:         (r["retryCount"] ?? r["retry_count"] ?? 3) as number,
      priority:            (r["priority"] ?? 1) as number,
      failover_strategy:   (r["failoverStrategy"] ?? r["failover_strategy"] ?? "priority") as string,
      consecutive_failures: 0,
      updated_at:          now(),
    };

    if (server.id) {
      const { data, error } = await (supabase as any)
        .from("radius_servers").update(payload).eq("id", server.id).select().single();
      if (error) throw new Error(error.message);
      return mapRow(data);
    }
    const { data, error } = await (supabase as any)
      .from("radius_servers").insert(payload).select().single();
    if (error) throw new Error(error.message);
    return mapRow(data);
  }

  async delete(serverId: RadiusServerRef): Promise<void> {
    const { error } = await (supabase as any).from("radius_servers").delete().eq("id", serverId);
    if (error) throw new Error(error.message);
  }

  // ── Server Selection (Failover / Load Balancing) ──────────────────────────

  /**
   * Select the best RADIUS server for a tenant using its failover strategy.
   * Returns null if no healthy server is available.
   */
  async selectServer(tenantId: TenantRef): Promise<RadiusServer | null> {
    const servers = await this.list(tenantId);
    const healthy = servers.filter((s) => s.isActive && s.isHealthy !== false);
    if (!healthy.length) {
      // Fallback: try any active server even if health unknown
      const anyActive = servers.filter((s) => s.isActive);
      return anyActive[0] ?? null;
    }

    const strategy: FailoverStrategy = healthy[0]?.failoverStrategy ?? "priority";

    switch (strategy) {
      case "priority":
        return healthy.sort((a, b) => a.priority - b.priority)[0];

      case "round_robin":
        return nextRoundRobin(tenantId, healthy);

      case "least_latency":
        return healthy
          .filter((s) => s.latencyMs !== null)
          .sort((a, b) => (a.latencyMs ?? 9999) - (b.latencyMs ?? 9999))[0]
          ?? healthy[0];

      case "random":
        return healthy[Math.floor(Math.random() * healthy.length)];

      default:
        return healthy[0];
    }
  }

  /**
   * Select an ordered list of servers for failover retry.
   */
  async getFailoverChain(tenantId: TenantRef): Promise<RadiusServer[]> {
    const servers = await this.list(tenantId);
    return servers
      .filter((s) => s.isActive)
      .sort((a, b) => a.priority - b.priority);
  }

  // ── Health Monitoring ─────────────────────────────────────────────────────

  async recordHealthCheck(
    serverId: RadiusServerRef,
    isHealthy: boolean,
    latencyMs: number,
    failureReason?: string
  ): Promise<void> {
    const current = await this.get(serverId);
    if (!current) return;

    const consecutiveFailures = isHealthy ? 0 : current.consecutiveFailures + 1;
    const status: RadiusHealthStatus = isHealthy ? "healthy"
      : consecutiveFailures >= 5 ? "unhealthy"
      : "degraded";

    await (supabase as any).from("radius_servers").update({
      is_healthy:           isHealthy,
      last_checked:         now(),
      latency_ms:           latencyMs,
      consecutive_failures: consecutiveFailures,
      last_failure_reason:  failureReason ?? null,
      updated_at:           now(),
    }).eq("id", serverId);

    // Persist health check snapshot
    await (supabase as any).from("radius_health_checks").insert({
      tenant_id:   current.tenantId,
      server_id:   serverId,
      is_healthy:  isHealthy,
      latency_ms:  latencyMs,
      status,
      error:       failureReason ?? null,
      checked_at:  now(),
    }).catch(() => {});

    // Alert if server went unhealthy
    if (!isHealthy && consecutiveFailures === 3) {
      await (supabase as any).from("job_queue").insert({
        tenant_id:  current.tenantId,
        type:       "notify_admin",
        payload:    { event: "radius.server_unhealthy", server_id: serverId, server_name: current.name, reason: failureReason },
        priority:   1,
        queue_name: "notifications",
      }).catch(() => {});
    }
  }

  async getHealthSnapshots(tenantId: TenantRef): Promise<RadiusHealthSnapshot[]> {
    const servers = await this.list(tenantId);
    const since1h = new Date(Date.now() - 3600000).toISOString();

    const snapshots: RadiusHealthSnapshot[] = await Promise.all(
      servers.map(async (s) => {
        const { data: events } = await (supabase as any)
          .from("auth_events")
          .select("event_type")
          .eq("tenant_id", tenantId)
          .gte("received_at", since1h);

        const ev = (events ?? []) as { event_type: string }[];
        const authReqs = ev.filter((e) => ["auth_success", "auth_failure", "auth_reject"].includes(e.event_type)).length;
        const failures = ev.filter((e) => ["auth_failure", "auth_reject"].includes(e.event_type)).length;

        const { count: acctCount } = await (supabase as any)
          .from("radius_accounting")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", tenantId)
          .gte("received_at", since1h);

        const status: RadiusHealthStatus =
          s.isHealthy === null ? "unknown"
          : s.isHealthy && s.consecutiveFailures === 0 ? "healthy"
          : s.isHealthy && s.consecutiveFailures > 0  ? "degraded"
          : "unhealthy";

        return {
          serverId:             s.id,
          serverName:           s.name,
          host:                 s.host,
          role:                 s.role,
          status,
          latencyMs:            s.latencyMs,
          consecutiveFailures:  s.consecutiveFailures,
          lastChecked:          s.lastChecked,
          lastFailureReason:    s.lastFailureReason,
          authRequestsPerMin:   Math.round(authReqs / 60),
          acctRequestsPerMin:   Math.round((acctCount ?? 0) / 60),
          failureRatePercent:   authReqs > 0 ? Math.round((failures / authReqs) * 100) : 0,
        };
      })
    );
    return snapshots;
  }
}

export const radiusServerPool = new RadiusServerPoolService();
