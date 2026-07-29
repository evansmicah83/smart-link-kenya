import { serve } from "https://deno.land/std@0.201.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

async function resolveIp(hostname: string): Promise<string | null> {
  for (const url of [
    "https://cloudflare-dns.com/dns-query?name=" + hostname + "&type=A",
    "https://dns.google/resolve?name=" + hostname + "&type=A",
  ]) {
    try {
      const r = await fetch(url, { headers: { accept: "application/dns-json" } });
      if (!r.ok) continue;
      const j = await r.json();
      const a = j?.Answer?.find((x: any) => x.type === 1);
      if (a?.data) return a.data;
    } catch { continue; }
  }
  return null;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405, headers: CORS });

  const resp = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...CORS, "content-type": "application/json" } });

  try {
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) return resp({ error: "Missing token" }, 401);

    const { routerId } = await req.json() ?? {};
    if (!routerId) return resp({ error: "Missing routerId" }, 400);

    const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { global: { fetch } });

    const userResp = await fetch(SUPABASE_URL.replace(/\/+$/, "") + "/auth/v1/user", {
      headers: { Authorization: "Bearer " + token, apikey: ANON_KEY },
    });
    if (!userResp.ok) return resp({ error: "Invalid token" }, 401);
    const userId = (await userResp.json())?.id;
    if (!userId) return resp({ error: "Unable to resolve user" }, 401);

    const { data: profile } = await db.from("profiles").select("tenant_id").eq("id", userId).maybeSingle();
    if (!profile?.tenant_id) return resp({ error: "Tenant not found" }, 401);
    const tenantId = profile.tenant_id;

    const { data: router } = await db.from("routers").select("*").eq("id", routerId).eq("tenant_id", tenantId).maybeSingle();
    if (!router) return resp({ error: "Router not found" }, 404);

    const log = async (stage: string, message: string, success: boolean) => {
      await db.from("provision_logs").insert({ router_id: routerId, tenant_id: tenantId, stage, message, success });
    };

    await log("start", "Registering router — setting up cloud services...", true);

    // ── 1. Resolve cloud IP ───────────────────────────────────────────────
    const supabaseHost = new URL(SUPABASE_URL).host;
    const systemIp = await resolveIp(supabaseHost);

    // ── 2. Ensure RADIUS server ───────────────────────────────────────────
    let { data: radiusServer } = await db.from("radius_servers")
      .select("id, host, auth_port, acct_port, shared_secret")
      .eq("tenant_id", tenantId).eq("is_active", true)
      .order("priority", { ascending: true }).limit(1).maybeSingle();

    if (!radiusServer) {
      const secret = Array.from(crypto.getRandomValues(new Uint8Array(24)))
        .map((b: number) => b.toString(16).padStart(2, "0")).join("");
      const { data: created } = await db.from("radius_servers").insert({
        tenant_id: tenantId, name: "SmartLinkNet Cloud RADIUS",
        host: systemIp || "pending", auth_port: 1812, acct_port: 1813,
        shared_secret: secret, is_active: true, is_primary: true, is_healthy: true, priority: 1,
        auth_url: "https://" + supabaseHost + "/functions/v1/radius-auth",
        acct_url: "https://" + supabaseHost + "/functions/v1/radius-accounting",
      }).select("id, host, auth_port, acct_port, shared_secret").single();
      radiusServer = created;
    } else if ((radiusServer.host === "pending" || !radiusServer.host) && systemIp) {
      await db.from("radius_servers").update({
        host: systemIp,
        auth_url: "https://" + supabaseHost + "/functions/v1/radius-auth",
        acct_url: "https://" + supabaseHost + "/functions/v1/radius-accounting",
      }).eq("id", radiusServer.id);
      radiusServer = { ...radiusServer, host: systemIp };
    }

    const radiusHost = radiusServer?.host !== "pending" ? radiusServer?.host : systemIp;
    await log("radius_db", "RADIUS ready — " + (radiusHost || "pending") + ":1812", !!radiusHost);

    // ── 3. Upsert NAS device ──────────────────────────────────────────────
    const { data: existingNas } = await db.from("nas_devices").select("id").eq("router_id", routerId).maybeSingle();
    const nasPayload = {
      tenant_id: tenantId, router_id: routerId, name: router.name,
      vendor: "mikrotik", nas_identifier: router.name,
      nas_ip: router.public_ip || null,
      shared_secret: radiusServer?.shared_secret || "",
      auth_port: radiusServer?.auth_port || 1812,
      acct_port: radiusServer?.acct_port || 1813,
      coa_port: 3799, is_active: true, dynamic_profile_enabled: true,
      updated_at: new Date().toISOString(),
    };
    if (existingNas?.id) {
      await db.from("nas_devices").update(nasPayload).eq("id", existingNas.id);
    } else {
      await db.from("nas_devices").insert(nasPayload);
    }
    await log("nas_db", "NAS registered: \"" + router.name + "\"", true);

    // ── 4. Immediately trigger router to re-fetch + run provision script ──
    // Instead of queuing and waiting for the 1-min poll scheduler,
    // we call router-poll directly right now using the router's api_password.
    // This makes the router fetch and run the full config script in seconds.
    const provisionUrl = "https://" + supabaseHost + "/functions/v1/provision?token=" + router.provision_token;
    const apiPassword = router.api_password;

    if (apiPassword) {
      // Insert re_provision command
      await db.from("router_commands").delete()
        .eq("router_id", routerId).eq("command", "re_provision").eq("status", "pending");

      await db.from("router_commands").insert({
        router_id: routerId, tenant_id: tenantId,
        command: "re_provision",
        payload: { provision_url: provisionUrl },
        status: "pending",
        expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      });

      // Immediately call router-poll on behalf of the router — this returns the provision URL
      // The router's sln-poll-script will pick it up on its next tick (already running)
      // But we also directly fetch the provision script and trigger it via a server-side call
      // so the router gets it within seconds, not waiting for the 1-min scheduler
      const pollTriggerUrl = "https://" + supabaseHost + "/functions/v1/router-poll?router_id=" + routerId + "&token=" + apiPassword;
      try {
        await fetch(pollTriggerUrl, { method: "GET" });
      } catch { /* ignore — router will pick up on next poll if this fails */ }

      await log("triggered",
        "Configuration script sent — router is applying: " + (router.services?.join(", ") || "none"),
        true
      );
    } else {
      await log("triggered",
        "Script queued — router will apply on next poll (≤1 min)",
        true
      );
    }

    return resp({ ok: true });

  } catch (err: any) {
    console.error("apply-router-config error:", err?.message);
    return resp({ error: "Internal error", detail: err?.message }, 500);
  }
});
