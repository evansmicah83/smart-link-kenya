/**
 * apply-router-config
 *
 * Called by the UI after the ISP selects services in the wizard.
 * Saves config to DB (NAS, RADIUS) and queues an apply_config command
 * in router_commands. The router picks it up on its next 1-minute poll
 * and executes it locally — no inbound connection needed.
 *
 * The provision script already ran all initial config. This function
 * handles re-provisioning / config updates after the router is online.
 */

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

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405, headers: CORS });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...CORS, "content-type": "application/json" } });

  try {
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) return json({ error: "Missing token" }, 401);

    const reqBody = await req.json();
    const { routerId } = reqBody ?? {};
    if (!routerId) return json({ error: "Missing routerId" }, 400);

    const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { global: { fetch } });

    // Resolve user and tenant
    const userResp = await fetch(SUPABASE_URL.replace(/\/+$/, "") + "/auth/v1/user", {
      headers: { Authorization: "Bearer " + token, apikey: ANON_KEY },
    });
    if (!userResp.ok) return json({ error: "Invalid token" }, 401);
    const userId = (await userResp.json())?.id;
    if (!userId) return json({ error: "Unable to resolve user" }, 401);

    const { data: profile } = await db.from("profiles").select("tenant_id").eq("id", userId).maybeSingle();
    if (!profile?.tenant_id) return json({ error: "Tenant not found" }, 401);
    const tenantId = profile.tenant_id;

    // Load router
    const { data: router } = await db.from("routers").select("*").eq("id", routerId).eq("tenant_id", tenantId).maybeSingle();
    if (!router) return json({ error: "Router not found" }, 404);

    const log = async (stage: string, message: string, success: boolean) => {
      await db.from("provision_logs").insert({ router_id: routerId, tenant_id: tenantId, stage, message, success }).then(() => {}).catch(() => {});
    };

    // ── 1. Resolve RADIUS ──────────────────────────────────────────────────
    const { data: realRadius } = await db.from("radius_servers")
      .select("id, host, auth_port, acct_port, shared_secret")
      .eq("tenant_id", tenantId).eq("is_active", true).neq("host", "pending")
      .order("priority", { ascending: true }).limit(1).maybeSingle();

    // ── 2. Upsert NAS device ───────────────────────────────────────────────
    const nasName = router.provisioning_identity || router.name;
    const { data: existingNas } = await db.from("nas_devices" as any).select("id").eq("router_id", routerId).maybeSingle();
    const nasPayload = {
      tenant_id: tenantId, router_id: routerId, name: nasName, vendor: "mikrotik",
      nas_identifier: nasName, shared_secret: realRadius?.shared_secret || "SmartLinkNet-Public-Fallback",
      auth_port: realRadius?.auth_port || 1812, acct_port: realRadius?.acct_port || 1813,
      coa_port: 3799, is_active: true, dynamic_profile_enabled: true,
      updated_at: new Date().toISOString(),
    };
    if ((existingNas as any)?.id) {
      await db.from("nas_devices" as any).update(nasPayload).eq("id", (existingNas as any).id);
    } else {
      await db.from("nas_devices" as any).insert(nasPayload);
    }
    await log("nas", `NAS registered: "${nasName}"`, true);

    // ── 3. Upsert RADIUS server record ─────────────────────────────────────
    const { data: existingRadius } = await db.from("radius_servers" as any).select("id").eq("tenant_id", tenantId).eq("name", nasName).maybeSingle();
    const radiusPayload = {
      tenant_id: tenantId, name: nasName, auth_port: 1812, acct_port: 1813,
      shared_secret: "SmartLinkNet-Public-Fallback", protocol: "mschapv2",
      is_primary: true, is_active: true, is_healthy: true,
      timeout_ms: 3000, retry_count: 3, priority: 1, updated_at: new Date().toISOString(),
    };
    if ((existingRadius as any)?.id) {
      await db.from("radius_servers" as any).update(radiusPayload).eq("id", (existingRadius as any).id);
    } else {
      await db.from("radius_servers" as any).insert({ ...radiusPayload, host: realRadius?.host || "pending" });
    }
    await log("radius_db", `RADIUS record saved — host: ${realRadius?.host || "pending"}`, true);

    // ── 4. Save hotspot portal URL ─────────────────────────────────────────
    const services: string[] = router.services || [];
    const hasHotspot = services.includes("hotspot");
    if (hasHotspot) {
      const { data: tenantRow } = await db.from("tenants").select("slug").eq("id", tenantId).maybeSingle();
      const ispSlug = (tenantRow as any)?.slug ?? tenantId;
      const portalLoginPage = `${APP_URL}/portal?isp=${ispSlug}&mac=$(mac)&ip=$(ip)&url=$(link-orig)&dst=$(dst-ip)`;
      await db.from("settings").upsert(
        { tenant_id: tenantId, key: "hotspot_login_page", value: portalLoginPage },
        { onConflict: "tenant_id,key" }
      ).then(() => {}).catch(() => {});
    }

    // ── 5. Check if router has polled recently (within 3 minutes) ──────────
    const lastPoll = router.last_poll_at ? new Date(router.last_poll_at) : null;
    const pollAgeMs = lastPoll ? Date.now() - lastPoll.getTime() : Infinity;
    const routerIsPolling = pollAgeMs < 3 * 60 * 1000; // polled within 3 min

    if (!routerIsPolling) {
      // Router hasn't polled yet — the provision script hasn't run or hasn't finished
      // The script will configure everything when it runs. Mark DB as saved.
      await log("config_saved", "DB config saved — waiting for router to run provisioning script", true);
      await log("complete", `Config queued — services: ${services.join(", ") || "none"} | RADIUS: ${realRadius?.host || "pending"} | Router will apply on next poll`, true);

      await db.from("routers").update({
        status: "online",
        api_connected: false,
        provisioned_at: new Date().toISOString(),
      }).eq("id", routerId);

      return json({ ok: true, queued: false, message: "DB saved — router not yet polling" });
    }

    // ── 6. Router is polling — queue apply_config command ─────────────────
    // Build the config payload the router will apply via its local RouterOS API
    const { data: tenant } = await db.from("tenants").select("slug").eq("id", tenantId).maybeSingle();
    const ispSlug = (tenant as any)?.slug ?? tenantId;
    const companySlug = ispSlug.replace(/[^a-z0-9]/g, "-").toLowerCase();
    const bridgeName = `${companySlug}-bridge`;
    const subnet = router.subnet || "172.31.0.0/16";
    const [networkAddr, prefixLen] = subnet.split("/");
    const parts = networkAddr.split(".").map(Number);
    parts[3] = 1;
    const gatewayIp = parts.join(".");
    const bridgeAddress = `${gatewayIp}/${prefixLen}`;
    const poolStart = `${parts[0]}.${parts[1]}.${parts[2]}.10`;
    const poolEnd = `${parts[0]}.${parts[1]}.${parts[2]}.254`;
    const bridgePorts: string[] = router.bridge_ports?.length ? router.bridge_ports : [router.bridge_port || "ether2"];
    const uplinkInterface = router.uplink_interface || "ether1";
    const radiusHost = realRadius?.host && realRadius.host !== "pending" ? realRadius.host : new URL(APP_URL).hostname;
    const radiusSecret = realRadius?.shared_secret || "SmartLinkNet-Public-Fallback";
    const radiusAuthPort = realRadius?.auth_port || 1812;
    const radiusAcctPort = realRadius?.acct_port || 1813;
    const hasPppoe = services.includes("pppoe");
    const radiusService = hasHotspot && hasPppoe ? "hotspot,ppp" : hasHotspot ? "hotspot" : "ppp";
    const portalLoginPage = `${APP_URL}/portal?isp=${ispSlug}&mac=$(mac)&ip=$(ip)&url=$(link-orig)&dst=$(dst-ip)`;

    const commandPayload = {
      bridgeName, bridgePorts, uplinkInterface, bridgeAddress, subnet,
      gatewayIp, poolStart, poolEnd, companySlug,
      radiusHost, radiusSecret, radiusAuthPort, radiusAcctPort, radiusService,
      hasHotspot, hasPppoe, portalLoginPage,
      routerName: router.provisioning_identity || router.name,
    };

    // Queue the command — router picks it up within 1 minute
    const { data: cmd } = await db.from("router_commands").insert({
      router_id: routerId,
      tenant_id: tenantId,
      command: "apply_config",
      payload: commandPayload,
      status: "pending",
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(), // 10 min expiry
    }).select("id").single();

    await log("config_queued", `Config queued (cmd: ${(cmd as any)?.id?.slice(0, 8)}) — router will apply within 1 minute`, true);
    await log("complete", `Apply queued — services: ${services.join(", ") || "none"} | RADIUS: ${radiusHost} | Waiting for router poll`, true);

    await db.from("routers").update({
      status: "online",
      api_connected: true,
      provisioned_at: new Date().toISOString(),
    }).eq("id", routerId);

    return json({ ok: true, queued: true, commandId: (cmd as any)?.id });
  } catch (err: any) {
    console.error("apply-router-config error:", err?.message);
    return json({ error: "Internal error", detail: err?.message }, 500);
  }
});
