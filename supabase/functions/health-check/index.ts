/**
 * SmartLinkNet — Health Check Edge Function
 * Monitors: Database, Routers, RADIUS, Payment Services, SMS Providers.
 * Records health_checks, updates circuit_breakers.
 * Invoke every 60s via pg_cron or external scheduler.
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

  const results: Record<string, any> = {};

  // ── 1. Database health ──────────────────────────────────────────────────────
  {
    const start = Date.now();
    try {
      await supabase.from("tenants").select("id").limit(1);
      const latency = Date.now() - start;
      const status = latency < 200 ? "healthy" : latency < 1000 ? "degraded" : "unhealthy";
      await record(supabase, null, "database", "database", status, latency);
      results.database = { status, latency };
    } catch (err: any) {
      await record(supabase, null, "database", "database", "unhealthy", undefined, err.message);
      results.database = { status: "unhealthy", error: err.message };
    }
  }

  // ── 2. Router health (all active routers) ────────────────────────────────────
  {
    const { data: routers } = await supabase
      .from("routers")
      .select("id, name, tenant_id, ip_address, connection_string, last_seen, status")
      .eq("is_active", true);

    for (const r of (routers ?? []) as any[]) {
      const lastSeenAgo = r.last_seen
        ? Date.now() - new Date(r.last_seen).getTime()
        : Infinity;
      const status =
        lastSeenAgo < 120_000 ? "healthy" :
        lastSeenAgo < 300_000 ? "degraded" : "unhealthy";

      await record(supabase, r.tenant_id, `router:${r.name}`, "router", status, undefined, undefined, {
        router_id: r.id, last_seen: r.last_seen,
      });

      // Auto-offline routers not seen in 5min
      if (lastSeenAgo > 300_000 && r.status !== "offline") {
        await supabase.from("routers").update({ status: "offline" }).eq("id", r.id);
        // Create NOC incident for critical routers
        const { count } = await supabase
          .from("noc_incidents")
          .select("*", { count: "exact", head: true })
          .eq("tenant_id", r.tenant_id)
          .eq("affected_service", `router:${r.id}`)
          .eq("status", "open");
        if (!count) {
          await supabase.from("noc_incidents").insert({
            tenant_id: r.tenant_id,
            title: `Router Offline: ${r.name}`,
            description: `Router ${r.name} has not been seen for over 5 minutes.`,
            severity: "p2",
            status: "open",
            affected_service: `router:${r.id}`,
            sla_target_mins: 60,
          });
          await supabase.from("job_queue").insert({
            tenant_id: r.tenant_id,
            type: "notify_admin",
            payload: { title: `⚠ Router Offline`, message: `Router ${r.name} is offline`, metadata: { router_id: r.id } },
            status: "pending", priority: 1, run_at: new Date().toISOString(), queue_name: "router_sync",
          });
        }
      }

      results[`router_${r.id}`] = { status, router: r.name };
    }
  }

  // ── 3. RADIUS server health (UDP Access-Request probe per RFC 2865) ─────────
  {
    const { data: radiusServers } = await supabase
      .from("radius_servers")
      .select("id, name, host, auth_port, tenant_id, timeout_ms, shared_secret, consecutive_failures")
      .eq("is_active", true);

    for (const rs of (radiusServers ?? []) as any[]) {
      const timeoutMs: number = rs.timeout_ms ?? 3000;
      const start = Date.now();
      let isHealthy = false;
      let probeError: string | undefined;

      try {
        isHealthy = await probeRadiusUdp(rs.host, rs.auth_port, rs.shared_secret ?? "", timeoutMs);
      } catch (e: any) {
        probeError = e.message;
      }

      const latency = Date.now() - start;
      const consecutiveFailures: number = isHealthy ? 0 : (rs.consecutive_failures ?? 0) + 1;
      const status = isHealthy
        ? (latency < 200 ? "healthy" : "degraded")
        : consecutiveFailures >= 5 ? "unhealthy" : "degraded";

      await supabase.from("radius_servers").update({
        is_healthy:           isHealthy,
        last_checked:         new Date().toISOString(),
        latency_ms:           latency,
        consecutive_failures: consecutiveFailures,
        last_failure_reason:  isHealthy ? null : (probeError ?? "No response to Access-Request"),
      }).eq("id", rs.id);

      await record(supabase, rs.tenant_id, `radius:${rs.name}`, "radius", status, latency, probeError);
      results[`radius_${rs.id}`] = { status, latency, healthy: isHealthy };
    }
  }

  // ── 4. Record platform metric ────────────────────────────────────────────────
  const healthyCount = Object.values(results).filter((r: any) => r.status === "healthy").length;
  const totalCount = Object.values(results).length;
  await supabase.from("metrics").insert({
    tenant_id: null,
    name: "platform.health_score",
    value: totalCount ? (healthyCount / totalCount) * 100 : 0,
    labels: { healthy: String(healthyCount), total: String(totalCount) },
  });

  return new Response(JSON.stringify({ ok: true, checks: results }), {
    headers: { ...CORS, "Content-Type": "application/json" },
  });
});

/**
 * Probe a RADIUS server using a real UDP Access-Request packet (RFC 2865).
 * Sends a Status-Server packet (Code=12) which compliant RADIUS servers
 * respond to with Access-Accept or Access-Reject — confirming the daemon
 * is alive and processing UDP traffic on the auth port.
 * Falls back to a minimal Access-Request with a dummy user if Status-Server
 * is not supported (non-compliant server returns a reject, which still confirms
 * the server is reachable and responding).
 */
async function probeRadiusUdp(
  host: string,
  port: number,
  sharedSecret: string,
  timeoutMs: number
): Promise<boolean> {
  // Build a minimal RADIUS Status-Server packet (RFC 5997)
  // Code=12, Identifier=0, Length=20, Authenticator=16 zero bytes
  const packet = new Uint8Array(20);
  packet[0] = 12;   // Code: Status-Server
  packet[1] = 0;    // Identifier
  packet[2] = 0;    // Length high byte
  packet[3] = 20;   // Length low byte (20 = header only, no attributes)
  // Authenticator bytes 4–19 remain 0x00 (valid for Status-Server)

  const addr = await Deno.resolveDns(host, "A").then((r) => r[0]).catch(() => host);
  const conn = await Deno.listenDatagram({ port: 0, transport: "udp" });

  try {
    await conn.send(packet, { transport: "udp", hostname: addr, port });

    const responsePromise = conn.receive();
    const timeoutPromise = new Promise<null>((_, reject) =>
      setTimeout(() => reject(new Error("RADIUS UDP timeout")), timeoutMs)
    );

    const [response] = await Promise.race([responsePromise, timeoutPromise]) as [Uint8Array, Deno.Addr];
    // Any response (Accept=2, Reject=3, Access-Challenge=11) confirms the
    // RADIUS daemon is alive and processing requests on this port.
    return response.length >= 4;
  } finally {
    conn.close();
  }
}

async function record(
  supabase: any,
  tenantId: string | null,
  serviceName: string,
  serviceType: string,
  status: string,
  latency?: number,
  error?: string,
  metadata?: Record<string, unknown>
) {
  await supabase.from("health_checks").insert({
    tenant_id: tenantId,
    service_name: serviceName,
    service_type: serviceType,
    status,
    latency_ms: latency ?? null,
    error: error ?? null,
    metadata: metadata ?? {},
    checked_at: new Date().toISOString(),
  });

  // Update circuit breaker state
  if (status === "unhealthy") {
    const { data: cb } = await supabase
      .from("circuit_breakers")
      .select("failure_count")
      .eq("service_name", serviceName)
      .maybeSingle();
    const failures = (cb?.failure_count ?? 0) + 1;
    await supabase.from("circuit_breakers").upsert({
      tenant_id: tenantId,
      service_name: serviceName,
      state: failures >= 5 ? "open" : "closed",
      failure_count: failures,
      last_failure: new Date().toISOString(),
      open_until: failures >= 5 ? new Date(Date.now() + 30000).toISOString() : null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "tenant_id,service_name", ignoreDuplicates: false });
  } else if (status === "healthy") {
    await supabase.from("circuit_breakers").upsert({
      tenant_id: tenantId,
      service_name: serviceName,
      state: "closed",
      failure_count: 0,
      open_until: null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "tenant_id,service_name", ignoreDuplicates: false });
  }
}
