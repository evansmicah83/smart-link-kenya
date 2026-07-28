import { serve } from "https://deno.land/std@0.201.0/http/server.ts";
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
const APP_URL = Deno.env.get("APP_URL") || "https://smart-link-kenya.vercel.app";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

async function routerExec(
  restBase: string,
  auth: string,
  path: string,
  method: "GET" | "POST" | "PATCH" | "PUT",
  body?: Record<string, unknown>,
): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  try {
    const res = await fetch(`${restBase}${path}`, {
      method,
      headers: { Authorization: auth, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(2500),
    });
    const text = await res.text();
    let data: unknown;
    try { data = text ? JSON.parse(text) : undefined; } catch { data = text; }
    return res.ok ? { ok: true, data } : { ok: false, error: `HTTP ${res.status}: ${text.slice(0, 200)}` };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? String(e) };
  }
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405, headers: CORS });

  try {
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) return new Response(JSON.stringify({ error: "Missing token" }), { status: 401, headers: { ...CORS, "content-type": "application/json" } });

    const userResp = await fetch(SUPABASE_URL.replace(/\/+$/, "") + "/auth/v1/user", {
      headers: { Authorization: "Bearer " + token, apikey: ANON_KEY },
    });
    if (!userResp.ok) return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401, headers: { ...CORS, "content-type": "application/json" } });
    const userId = (await userResp.json())?.id;
    if (!userId) return new Response(JSON.stringify({ error: "Unable to resolve user" }), { status: 401, headers: { ...CORS, "content-type": "application/json" } });

    const reqBody = await req.json();
    const { routerId } = reqBody ?? {};
    if (!routerId) return new Response(JSON.stringify({ error: "Missing routerId" }), { status: 400, headers: { ...CORS, "content-type": "application/json" } });

    const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { global: { fetch } });

    const log = async (stage: string, message: string, success: boolean) => {
      await db.from("provision_logs").insert({ router_id: routerId, stage, message, success }).catch(() => {});
    };

    // ── Resolve tenant ────────────────────────────────────────────────────────
    const { data: profile } = await db.from("profiles").select("tenant_id").eq("id", userId).maybeSingle();
    if (!profile?.tenant_id) {
      await log("error", "Unable to resolve tenant", false);
      return new Response(JSON.stringify({ error: "Tenant not found" }), { status: 401, headers: { ...CORS, "content-type": "application/json" } });
    }
    const tenantId = profile.tenant_id;

    const { data: router } = await db.from("routers").select("*").eq("id", routerId).eq("tenant_id", tenantId).maybeSingle();
    if (!router) {
      await log("error", "Router not found", false);
      return new Response(JSON.stringify({ error: "Router not found" }), { status: 404, headers: { ...CORS, "content-type": "application/json" } });
    }

    // ── 1. Resolve RADIUS ─────────────────────────────────────────────────────
    const { data: realRadius } = await db.from("radius_servers")
      .select("id, host, auth_port, acct_port, shared_secret")
      .eq("tenant_id", tenantId).eq("is_active", true).neq("host", "pending")
      .order("priority", { ascending: true }).limit(1).maybeSingle();

    if (realRadius?.host) {
      await db.from("radius_servers").update({ host: realRadius.host, is_healthy: true })
        .eq("tenant_id", tenantId).eq("host", "pending");
    }

    // ── 2. Fix NAS in DB ──────────────────────────────────────────────────────
    await db.from("nas_devices").update({
      nas_identifier: router.provisioning_identity || router.name,
      name: router.provisioning_identity || router.name,
      is_active: true,
      updated_at: new Date().toISOString(),
    }).eq("router_id", routerId);
    await log("nas", `NAS identifier set to "${router.provisioning_identity || router.name}"`, true);

    // ── 3. Push live config to router via REST API ────────────────────────────
    // public_ip = captured from provision-callback (router's outbound public IP)
    const host = (router as any).public_ip || router.connection_string || router.ip_address;
    const apiPort = router.api_port ?? 8728;
    const apiUser = router.api_username;
    const apiPass = router.api_password;
    let routerApiOk = false;

    if (!host || !apiUser || !apiPass) {
      await log("api_check", `No IP/credentials — host=${host || "none"} user=${apiUser || "none"} — re-run provisioning script to register router`, false);
    } else {
      const restBase = `http://${host}:${apiPort}/rest`;
      const basicAuth = "Basic " + btoa(`${apiUser}:${apiPass}`);

      await log("api_check", `Connecting to ${host}:${apiPort} as "${apiUser}"...`, true);

      const ping = await routerExec(restBase, basicAuth, "/system/identity", "GET");
      if (!ping.ok) {
        await log("api_check", `Router API unreachable at ${host}:${apiPort} — ${ping.error}`, false);
      } else {
        routerApiOk = true;
        await log("api_check", `Router API reachable at ${host}:${apiPort}`, true);

        const services: string[] = router.services || [];
        const hasHotspot = services.includes("hotspot");
        const hasPppoe = services.includes("pppoe");
        const radiusHost = realRadius?.host ?? null;
        const radiusSecret = realRadius?.shared_secret ?? "SmartLinkNet-Public-Fallback";
        const radiusAuthPort = realRadius?.auth_port ?? 1812;
        const radiusAcctPort = realRadius?.acct_port ?? 1813;
        const radiusService = hasHotspot && hasPppoe ? "hotspot,ppp" : hasHotspot ? "hotspot" : "ppp";

        const { data: tenant } = await db.from("tenants").select("slug").eq("id", tenantId).maybeSingle();
        const ispSlug = (tenant as any)?.slug ?? tenantId;
        const companySlug = ispSlug.replace(/[^a-z0-9]/g, "-").toLowerCase();

        // Identity
        const idRes = await routerExec(restBase, basicAuth, "/system/identity", "POST", { name: router.provisioning_identity || router.name });
        await log("identity", idRes.ok ? `Identity set to "${router.provisioning_identity || router.name}"` : `Identity failed: ${idRes.error}`, idRes.ok);

        // RADIUS
        if (radiusHost) {
          const listRes = await routerExec(restBase, basicAuth, "/radius?comment=SmartLinkNet", "GET");
          if (listRes.ok && Array.isArray(listRes.data)) {
            for (const entry of listRes.data as any[]) {
              await routerExec(restBase, basicAuth, `/radius/${entry[".id"]}`, "POST", { ".id": entry[".id"] });
            }
          }
          const radRes = await routerExec(restBase, basicAuth, "/radius/add", "POST", {
            service: radiusService, address: radiusHost, secret: radiusSecret,
            "authentication-port": String(radiusAuthPort), "accounting-port": String(radiusAcctPort),
            timeout: "3000ms", comment: "SmartLinkNet",
          });
          await log("radius", radRes.ok ? `RADIUS configured → ${radiusHost}:${radiusAuthPort}` : `RADIUS failed: ${radRes.error}`, radRes.ok);
          await routerExec(restBase, basicAuth, "/radius/incoming/set", "POST", { accept: "yes", port: "3799" });
        } else {
          await log("radius", "No RADIUS host in DB yet — skipped", false);
        }

        // Hotspot profile
        if (hasHotspot) {
          const portalUrl = `${APP_URL}/portal?isp=${ispSlug}&mac=$(mac)&ip=$(ip)&url=$(link-orig)&dst=$(dst-ip)`;
          const hsProfiles = await routerExec(restBase, basicAuth, `/ip/hotspot/profile?name=${companySlug}-hs-profile`, "GET");
          if (hsProfiles.ok && Array.isArray(hsProfiles.data) && hsProfiles.data.length) {
            const pid = (hsProfiles.data as any[])[0][".id"];
            const hsRes = await routerExec(restBase, basicAuth, `/ip/hotspot/profile/${pid}`, "PATCH", {
              "login-page": portalUrl,
              ...(radiusHost ? { "use-radius": "yes", accounting: "yes" } : {}),
            });
            await log("hotspot_profile", hsRes.ok ? "Hotspot profile login-page updated" : `Hotspot profile failed: ${hsRes.error}`, hsRes.ok);
          } else {
            await log("hotspot_profile", "Hotspot profile not found on router", false);
          }
        }

        // PPPoE profile
        if (hasPppoe && radiusHost) {
          const pppProfiles = await routerExec(restBase, basicAuth, `/ppp/profile?name=${companySlug}-pppoe`, "GET");
          if (pppProfiles.ok && Array.isArray(pppProfiles.data) && pppProfiles.data.length) {
            const pid = (pppProfiles.data as any[])[0][".id"];
            const pppRes = await routerExec(restBase, basicAuth, `/ppp/profile/${pid}`, "PATCH", { "use-radius": "yes" });
            await log("pppoe_profile", pppRes.ok ? "PPPoE profile updated to use RADIUS" : `PPPoE profile failed: ${pppRes.error}`, pppRes.ok);
          } else {
            await log("pppoe_profile", "PPPoE profile not found on router", false);
          }
        }

        // Heartbeat scheduler
        const schedulers = await routerExec(restBase, basicAuth, "/system/scheduler?name=sln-heartbeat", "GET");
        if (schedulers.ok && Array.isArray(schedulers.data) && schedulers.data.length) {
          const schedId = (schedulers.data as any[])[0][".id"];
          const heartbeatUrl = `${APP_URL}/api/heartbeat?router=${routerId}`;
          const schedRes = await routerExec(restBase, basicAuth, `/system/scheduler/${schedId}`, "PATCH", {
            "on-event": `:do { /tool fetch mode=https url="${heartbeatUrl}" keep-result=no } on-error={}`,
          });
          await log("heartbeat", schedRes.ok ? "Heartbeat scheduler updated" : `Heartbeat failed: ${schedRes.error}`, schedRes.ok);
        } else {
          await log("heartbeat", "Heartbeat scheduler not found on router", false);
        }
      }
    }

    // ── 4. Mark router status ─────────────────────────────────────────────────
    await db.from("routers").update({
      status: routerApiOk ? "active" : "online",
      api_connected: routerApiOk,
      provisioned_at: new Date().toISOString(),
    }).eq("id", routerId);

    // ── 5. Complete log — triggers applyDone on UI via realtime ───────────────
    const summary = `services: ${(router.services || []).join(", ") || "none"} | RADIUS: ${realRadius?.host || "pending"} | API: ${routerApiOk ? "connected" : "unreachable"}`;
    await log("complete", `Apply complete — ${summary}`, routerApiOk);

    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { ...CORS, "content-type": "application/json" } });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: "Internal error" }), { status: 500, headers: { ...CORS, "content-type": "application/json" } });
  }
});
