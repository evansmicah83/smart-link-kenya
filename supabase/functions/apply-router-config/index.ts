import { serve } from "https://deno.land/std@0.201.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
const APP_URL = Deno.env.get("APP_URL") || "https://smart-link-kenya.vercel.app";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Resolve hosting IP dynamically via DoH — works regardless of where system is deployed
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

    // Verify user and tenant
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

    // ── 1. Resolve system IP dynamically ──────────────────────────────────
    const supabaseHost = new URL(SUPABASE_URL).host;
    const systemIp = await resolveIp(supabaseHost);

    // ── 2. Ensure RADIUS server exists with real IP ────────────────────────
    let { data: radiusServer } = await db.from("radius_servers")
      .select("id, host, auth_port, acct_port, shared_secret")
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .order("priority", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!radiusServer) {
      // Create fresh RADIUS server for this tenant
      const secret = Array.from(crypto.getRandomValues(new Uint8Array(24)))
        .map((b: number) => b.toString(16).padStart(2, "0")).join("");
      const { data: created } = await db.from("radius_servers").insert({
        tenant_id: tenantId,
        name: "SmartLinkNet Cloud RADIUS",
        host: systemIp || "pending",
        auth_port: 1812,
        acct_port: 1813,
        shared_secret: secret,
        is_active: true,
        is_primary: true,
        is_healthy: true,
        priority: 1,
        auth_url: "https://" + supabaseHost + "/functions/v1/radius-auth",
        acct_url: "https://" + supabaseHost + "/functions/v1/radius-accounting",
      }).select("id, host, auth_port, acct_port, shared_secret").single();
      radiusServer = created;
    } else if ((radiusServer.host === "pending" || !radiusServer.host) && systemIp) {
      // Update pending host with resolved IP
      await db.from("radius_servers").update({
        host: systemIp,
        auth_url: "https://" + supabaseHost + "/functions/v1/radius-auth",
        acct_url: "https://" + supabaseHost + "/functions/v1/radius-accounting",
      }).eq("id", radiusServer.id);
      radiusServer = { ...radiusServer, host: systemIp };
    }

    const radiusHost = radiusServer?.host && radiusServer.host !== "pending" ? radiusServer.host : systemIp;
    const radiusSecret = radiusServer?.shared_secret || "";
    const radiusAuthPort = radiusServer?.auth_port || 1812;
    const radiusAcctPort = radiusServer?.acct_port || 1813;

    await log("radius_db", "RADIUS configured — host: " + (radiusHost || "pending"), !!radiusHost);

    // ── 3. Upsert NAS device ───────────────────────────────────────────────
    const nasName = router.name;
    const { data: existingNas } = await db.from("nas_devices").select("id").eq("router_id", routerId).maybeSingle();
    const nasPayload = {
      tenant_id: tenantId,
      router_id: routerId,
      name: nasName,
      vendor: "mikrotik",
      nas_identifier: nasName,
      nas_ip: router.public_ip || null,
      shared_secret: radiusSecret,
      auth_port: radiusAuthPort,
      acct_port: radiusAcctPort,
      coa_port: 3799,
      is_active: true,
      dynamic_profile_enabled: true,
      updated_at: new Date().toISOString(),
    };
    if (existingNas?.id) {
      await db.from("nas_devices").update(nasPayload).eq("id", existingNas.id);
    } else {
      await db.from("nas_devices").insert(nasPayload);
    }
    await log("nas", "NAS registered: \"" + nasName + "\"", true);

    // ── 4. Queue re-provision command so router re-fetches full script ─────
    // The provision script is the single source of truth for router config.
    // Queuing a re_provision command tells the router to re-run it with the
    // latest config (including now-resolved RADIUS IP).
    const provisionUrl = "https://" + supabaseHost + "/functions/v1/provision?token=" + router.provision_token;
    await db.from("router_commands").insert({
      router_id: routerId,
      tenant_id: tenantId,
      command: "re_provision",
      payload: { provision_url: provisionUrl },
      status: "pending",
      expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    });

    // ── 5. Mark router online and provisioned ─────────────────────────────
    await db.from("routers").update({
      status: "online",
      api_connected: true,
      provisioned_at: new Date().toISOString(),
    }).eq("id", routerId);

    const services: string[] = router.services || [];
    await log("complete", "Router fully configured — services: " + (services.join(", ") || "none") + " | RADIUS: " + (radiusHost || "pending"), true);

    return resp({ ok: true, radiusHost, nasName });

  } catch (err: any) {
    console.error("apply-router-config error:", err?.message);
    return resp({ error: "Internal error", detail: err?.message }, 500);
  }
});
