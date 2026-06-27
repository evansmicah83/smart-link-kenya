/**
 * SmartLinkNet — router-command Edge Function
 * Phase 1 Refactor: Network-agnostic adapter dispatch
 *
 * Routes commands through the appropriate vendor adapter.
 * Connection target resolved from DB — no hardcoded IPs.
 * Supports: mikrotik_rest, mikrotik_api, freeradius, radius_proxy
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type AdapterType =
  | "mikrotik_rest"
  | "mikrotik_api"
  | "freeradius"
  | "radius_proxy"
  | "ubiquiti"
  | "cisco"
  | "generic_snmp"
  | "openwrt";

type NetworkCommand =
  | "get_status"
  | "get_interfaces"
  | "get_active_sessions"
  | "add_hotspot_user"
  | "remove_hotspot_user"
  | "add_pppoe_user"
  | "remove_pppoe_user"
  | "add_user"
  | "remove_user"
  | "kick_session"
  | "get_ip_pools"
  | "get_wan_links"
  | "apply_profile"
  | "get_logs"
  | "ping_test";

interface RouterRow {
  id: string;
  connection_string: string | null;
  ip_address: string | null;
  api_port: number | null;
  api_username: string | null;
  api_password: string | null;
  use_ssl: boolean | null;
  vendor: string | null;
  primary_adapter_type: AdapterType | null;
  tenant_id: string;
}

// ─── MikroTik REST Client ─────────────────────────────────────────────────────

function createMikrotikClient(host: string, port: number, user: string, pass: string, ssl: boolean) {
  const base = `${ssl ? "https" : "http"}://${host}:${port}/rest`;
  const auth = btoa(`${user}:${pass}`);
  const headers = { Authorization: `Basic ${auth}`, "Content-Type": "application/json" };

  async function call(method: string, path: string, body?: unknown) {
    const res = await fetch(`${base}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      throw new Error(`MikroTik REST ${res.status}: ${text}`);
    }
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }

  return {
    get: (p: string) => call("GET", p),
    post: (p: string, b?: unknown) => call("POST", p, b),
    patch: (p: string, b?: unknown) => call("PATCH", p, b),
    delete: (p: string) => call("DELETE", p),
  };
}

// ─── Adapter Resolver ─────────────────────────────────────────────────────────

function resolveAdapter(router: RouterRow): AdapterType {
  if (router.primary_adapter_type) return router.primary_adapter_type;
  if (router.vendor === "mikrotik") return "mikrotik_rest";
  if (router.vendor === "ubiquiti") return "ubiquiti";
  if (router.vendor === "cisco") return "cisco";
  return "mikrotik_rest"; // universal default
}

// ─── Rate-limit builder ───────────────────────────────────────────────────────

function buildRateLimit(params: Record<string, unknown>): string | undefined {
  if (params.rateLimit) return params.rateLimit as string;
  const dl = params.speed_down_kbps as number | undefined;
  const ul = params.speed_up_kbps as number | undefined;
  if (!dl) return undefined;
  const fmt = (k: number) => k >= 1024 ? `${Math.round(k / 1024)}M` : `${k}k`;
  return `${fmt(dl)}/${fmt(ul ?? dl)}`;
}

// ─── MikroTik REST command handler ───────────────────────────────────────────

async function handleMikrotikRest(
  router: RouterRow,
  command: NetworkCommand,
  params: Record<string, unknown>
): Promise<unknown> {
  const host = router.connection_string || router.ip_address;
  if (!host) throw new Error(`Router ${router.id} has no connection address`);

  const mt = createMikrotikClient(
    host,
    router.api_port ?? 80,
    router.api_username ?? "",
    router.api_password ?? "",
    router.use_ssl ?? false
  );

  switch (command) {
    case "get_status": {
      const [res, id] = await Promise.all([
        mt.get("/system/resource"),
        mt.get("/system/identity"),
      ]);
      const total = parseInt(res["total-memory"] ?? "1");
      const free  = parseInt(res["free-memory"]  ?? "0");
      return {
        status: "online",
        cpuLoad: parseInt(res["cpu-load"] ?? "0"),
        memoryUsed: Math.round(((total - free) / total) * 100),
        uptime: res["uptime"] ?? "",
        firmwareVersion: res["version"] ?? null,
        model: res["board-name"] ?? null,
        identity: id?.["name"] ?? null,
      };
    }

    case "get_interfaces":
      return mt.get("/interface");

    case "get_active_sessions": {
      const [hotspot, pppoe] = await Promise.all([
        mt.get("/ip/hotspot/active").catch(() => []),
        mt.get("/ppp/active").catch(() => []),
      ]);
      return { hotspot: hotspot ?? [], pppoe: pppoe ?? [] };
    }

    case "kick_session": {
      const sid = params.sessionId as string;
      if (!sid) throw new Error("sessionId required");
      try {
        await mt.delete(`/ip/hotspot/active/${sid}`);
      } catch {
        await mt.delete(`/ppp/active/${sid}`);
      }
      return { kicked: true };
    }

    case "add_hotspot_user":
    case "add_user": {
      const { username, password, profile } = params as Record<string, string>;
      if (!username || !password) throw new Error("username and password required");
      const rl = buildRateLimit(params);
      return mt.post("/ip/hotspot/user", {
        name: username,
        password,
        ...(profile && { profile }),
        ...(rl && { "rate-limit": rl }),
      });
    }

    case "remove_hotspot_user":
    case "remove_user": {
      const { username } = params as Record<string, string>;
      if (!username) throw new Error("username required");
      const users = await mt.get(`/ip/hotspot/user?name=${encodeURIComponent(username)}`);
      if (Array.isArray(users) && users.length) {
        await mt.delete(`/ip/hotspot/user/${users[0][".id"]}`);
      }
      return { removed: true };
    }

    case "add_pppoe_user": {
      const { username, password, profile, service } = params as Record<string, string>;
      if (!username || !password) throw new Error("username and password required");
      const rl = buildRateLimit(params);
      return mt.post("/ppp/secret", {
        name: username,
        password,
        service: service ?? "pppoe",
        ...(profile && { profile }),
        ...(rl && { "rate-limit": rl }),
      });
    }

    case "remove_pppoe_user": {
      const { username } = params as Record<string, string>;
      if (!username) throw new Error("username required");
      const secrets = await mt.get(`/ppp/secret?name=${encodeURIComponent(username)}`);
      if (Array.isArray(secrets) && secrets.length) {
        await mt.delete(`/ppp/secret/${secrets[0][".id"]}`);
      }
      return { removed: true };
    }

    case "apply_profile": {
      const { username, rateLimit } = params as Record<string, string>;
      if (!username) throw new Error("username required");
      // Try hotspot user first, then PPP secret
      const hotspotUsers = await mt.get(`/ip/hotspot/user?name=${encodeURIComponent(username)}`).catch(() => []);
      if (Array.isArray(hotspotUsers) && hotspotUsers.length) {
        await mt.patch(`/ip/hotspot/user/${hotspotUsers[0][".id"]}`, {
          ...(rateLimit && { "rate-limit": rateLimit }),
        });
        return { applied: true, target: "hotspot" };
      }
      const pppSecrets = await mt.get(`/ppp/secret?name=${encodeURIComponent(username)}`).catch(() => []);
      if (Array.isArray(pppSecrets) && pppSecrets.length) {
        await mt.patch(`/ppp/secret/${pppSecrets[0][".id"]}`, {
          ...(rateLimit && { "rate-limit": rateLimit }),
        });
        return { applied: true, target: "pppoe" };
      }
      return { applied: false, reason: "User not found on NAS" };
    }

    case "get_ip_pools":
      return mt.get("/ip/pool");

    case "get_wan_links":
      return mt.get("/ip/route?dst-address=0.0.0.0/0");

    case "get_logs":
      return mt.get(`/log?count=${params.limit ?? 100}`);

    case "ping_test": {
      const target = params.target as string;
      if (!target) throw new Error("target required");
      return mt.post("/ping", { address: target, count: "3" });
    }

    default:
      throw new Error(`Unknown command: ${command}`);
  }
}

// ─── Main handler ─────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const start = Date.now();
  let routerId: string | undefined;

  try {
    const body = await req.json() as {
      routerId: string;
      command: NetworkCommand;
      params?: Record<string, unknown>;
    };

    routerId = body.routerId;
    const { command, params = {} } = body;
    if (!routerId || !command) throw new Error("routerId and command required");

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: router, error: routerErr } = await sb
      .from("routers")
      .select("id,connection_string,ip_address,api_port,api_username,api_password,use_ssl,vendor,primary_adapter_type,tenant_id")
      .eq("id", routerId)
      .single();

    if (routerErr || !router) throw new Error("Router not found");
    if (!router.api_username) throw new Error("Router API credentials not configured");

    const adapterType = resolveAdapter(router as RouterRow);
    let result: unknown;

    // Dispatch to the correct adapter
    switch (adapterType) {
      case "mikrotik_rest":
      case "mikrotik_api":
        result = await handleMikrotikRest(router as RouterRow, command, params);
        break;
      // Future: case "ubiquiti": result = await handleUbiquiti(...)
      // Future: case "freeradius": result = await handleFreeRadius(...)
      default:
        result = await handleMikrotikRest(router as RouterRow, command, params);
    }

    // Persist router status if get_status succeeded
    if (command === "get_status") {
      const r = result as Record<string, unknown>;
      await sb.from("routers").update({
        status: "online",
        last_seen: new Date().toISOString(),
        cpu_load: r.cpuLoad,
        memory_used: r.memoryUsed,
        uptime: r.uptime,
        firmware_version: r.firmwareVersion,
      }).eq("id", routerId);
    }

    // Log adapter health
    await sb.from("network_adapters").upsert({
      tenant_id: router.tenant_id,
      router_id: routerId,
      adapter_type: adapterType,
      health_status: "healthy",
      last_checked: new Date().toISOString(),
      error_count: 0,
      config: {},
    }, { onConflict: "router_id,adapter_type" }).catch(() => {});

    return new Response(
      JSON.stringify({ success: true, data: result, durationMs: Date.now() - start, adapterType }),
      { headers: { ...CORS, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    const message = (err as Error).message ?? "Unknown error";

    // Mark router offline on connection errors
    const isConnErr = message.includes("MikroTik REST") || message.includes("fetch") || message.includes("timeout");
    if (isConnErr && routerId) {
      const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      await sb.from("routers").update({ status: "offline" }).eq("id", routerId).catch(() => {});
      await sb.from("network_adapters")
        .update({ health_status: "unhealthy", error_count: (sb as any).raw?.("error_count + 1") ?? 1, last_checked: new Date().toISOString() })
        .eq("router_id", routerId)
        .catch(() => {});
    }

    return new Response(
      JSON.stringify({ success: false, error: message, durationMs: Date.now() - start }),
      { status: 400, headers: { ...CORS, "Content-Type": "application/json" } }
    );
  }
});
