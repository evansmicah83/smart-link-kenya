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

type LogEntry = { stage: string; message: string; success: boolean };

// Push a real RouterOS command to the router via REST API and return success.
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
      signal: AbortSignal.timeout(4000), // 4s per call — keeps total well under edge fn limit
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
    if (!token) return new Response(JSON.stringify({ error: "Missing Authorization token" }), { status: 401, headers: { ...CORS, "content-type": "application/json" } });

    const userResp = await fetch(SUPABASE_URL.replace(/\/+$/, "") + "/auth/v1/user", { headers: { Authorization: "Bearer " + token, apikey: ANON_KEY } });
    if (!userResp.ok) return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401, headers: { ...CORS, "content-type": "application/json" } });
    const userJson = await userResp.json();
    const userId = userJson?.id;
    if (!userId) return new Response(JSON.stringify({ error: "Unable to resolve user" }), { status: 401, headers: { ...CORS, "content-type": "application/json" } });

    const body = await req.json();
    const { routerId } = body ?? {};
    if (!routerId) return new Response(JSON.stringify({ error: "Missing routerId" }), { status: 400, headers: { ...CORS, "content-type": "application/json" } });

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { global: { fetch } });

    const { data: profile } = await supabase.from("profiles").select("tenant_id").eq("id", userId).maybeSingle();
    if (!profile?.tenant_id) return new Response(JSON.stringify({ error: "Unable to resolve tenant" }), { status: 401, headers: { ...CORS, "content-type": "application/json" } });

    const { data: router, error: selErr } = await supabase.from("routers").select("*").eq("id", routerId).eq("tenant_id", profile.tenant_id).maybeSingle();
    if (selErr || !router) return new Response(JSON.stringify({ error: "Router not found" }), { status: 404, headers: { ...CORS, "content-type": "application/json" } });

    // Return 200 immediately so the client doesn't hang — work continues async
    const responsePromise = new Response(JSON.stringify({ ok: true, async: true }), { status: 200, headers: { ...CORS, "content-type": "application/json" } });

    const tenantId = profile.tenant_id;
    const supabaseClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { global: { fetch } });

    // Insert each log immediately so realtime fires even if function times out later
    const log = async (stage: string, message: string, success: boolean) => {
      await supabaseClient.from("provision_logs").insert({ router_id: routerId, stage, message, success }).catch(() => {});
    };

    // ── 1. Resolve RADIUS ────────────────────────────────────────────────────
    const { data: realRadius } = await supabase.from("radius_servers")
      .select("id, host, auth_port, acct_port, shared_secret")
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .neq("host", "pending")
      .order("priority", { ascending: true })
      .limit(1)
      .maybeSingle();

    // Fix any pending radius_server records with the real host
    if (realRadius?.host) {
      await supabase.from("radius_servers").update({ host: realRadius.host, is_healthy: true })
        .eq("tenant_id", tenantId).eq("host", "pending");
    }

    // ── 2. Fix NAS identifier in DB ──────────────────────────────────────────
    await supabase.from("nas_devices").update({
      nas_identifier: router.provisioning_identity || router.name,
      name: router.provisioning_identity || router.name,
      is_active: true,
      updated_at: new Date().toISOString(),
    }).eq("router_id", routerId);
    await log("nas", `NAS identifier set to "${router.provisioning_identity || router.name}"`, true);

    // ── 3. Push live config to router via REST API ───────────────────────────
    const host = router.connection_string || router.ip_address;
    const apiPort = router.api_port ?? 8728;
    const apiUser = router.api_username;
    const apiPass = router.api_password;
    let routerApiOk = false;

    if (host && apiUser && apiPass) {
      const restBase = `http://${host}:${apiPort}/rest`;
      const basicAuth = "Basic " + btoa(`${apiUser}:${apiPass}`);

      // 3a. Verify connectivity
      const ping = await routerExec(restBase, basicAuth, "/system/identity", "GET");
      if (ping.ok) {
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

        const { data: tenant } = await supabase.from("tenants").select("slug, name").eq("id", tenantId).maybeSingle();
        const ispSlug = (tenant as any)?.slug ?? tenantId;
        const companySlug = ispSlug.replace(/[^a-z0-9]/g, "-").toLowerCase();

        // 3b. Update system identity
        const identityRes = await routerExec(restBase, basicAuth, "/system/identity", "POST", { name: router.provisioning_identity || router.name });
        await log("identity", identityRes.ok ? `Identity set to "${router.provisioning_identity || router.name}"` : `Identity update failed: ${identityRes.error}`, identityRes.ok);

        // 3c. Push RADIUS config if we have a real host
        if (radiusHost) {
          // Remove stale SmartLinkNet RADIUS entries then add fresh
          const listRes = await routerExec(restBase, basicAuth, "/radius?comment=SmartLinkNet", "GET");
          if (listRes.ok && Array.isArray(listRes.data)) {
            for (const entry of listRes.data as any[]) {
              await routerExec(restBase, basicAuth, `/radius/${entry[".id"]}`, "POST", { ".id": entry[".id"] });
            }
          }
          const radiusRes = await routerExec(restBase, basicAuth, "/radius/add", "POST", {
            service: radiusService,
            address: radiusHost,
            secret: radiusSecret,
            "authentication-port": String(radiusAuthPort),
            "accounting-port": String(radiusAcctPort),
            timeout: "3000ms",
            comment: "SmartLinkNet",
          });
          await log("radius", radiusRes.ok ? `RADIUS configured → ${radiusHost}:${radiusAuthPort}` : `RADIUS push failed: ${radiusRes.error}`, radiusRes.ok);

          // 3d. Enable RADIUS incoming (CoA)
          await routerExec(restBase, basicAuth, "/radius/incoming/set", "POST", { accept: "yes", port: "3799" });
        } else {
          await log("radius", "No real RADIUS host available — skipped (will apply on next heartbeat)", false);
        }

        // 3e. Update hotspot profile login-page URL if hotspot is enabled
        if (hasHotspot) {
          const portalUrl = `${APP_URL}/portal?isp=${ispSlug}&mac=\$(mac)&ip=\$(ip)&url=\$(link-orig)&dst=\$(dst-ip)`;
          const hsProfiles = await routerExec(restBase, basicAuth, `/ip/hotspot/profile?name=${companySlug}-hs-profile`, "GET");
          if (hsProfiles.ok && Array.isArray(hsProfiles.data) && hsProfiles.data.length) {
            const profileId = (hsProfiles.data as any[])[0][".id"];
            const hsRes = await routerExec(restBase, basicAuth, `/ip/hotspot/profile/${profileId}`, "PATCH", {
              "login-page": portalUrl,
              ...(radiusHost ? { "use-radius": "yes", accounting: "yes" } : {}),
            });
            await log("hotspot_profile", hsRes.ok ? "Hotspot profile login-page updated" : `Hotspot profile update failed: ${hsRes.error}`, hsRes.ok);
          } else {
            await log("hotspot_profile", "Hotspot profile not found on router — was script run?", false);
          }
        }

        // 3f. Update PPPoE profile to use RADIUS if available
        if (hasPppoe && radiusHost) {
          const pppProfiles = await routerExec(restBase, basicAuth, `/ppp/profile?name=${companySlug}-pppoe`, "GET");
          if (pppProfiles.ok && Array.isArray(pppProfiles.data) && pppProfiles.data.length) {
            const profileId = (pppProfiles.data as any[])[0][".id"];
            const pppRes = await routerExec(restBase, basicAuth, `/ppp/profile/${profileId}`, "PATCH", { "use-radius": "yes" });
            await log("pppoe_profile", pppRes.ok ? "PPPoE profile updated to use RADIUS" : `PPPoE profile update failed: ${pppRes.error}`, pppRes.ok);
          } else {
            await log("pppoe_profile", "PPPoE profile not found on router — was script run?", false);
          }
        }

        // 3g. Ensure heartbeat scheduler points to correct router ID
        const schedulers = await routerExec(restBase, basicAuth, "/system/scheduler?name=sln-heartbeat", "GET");
        if (schedulers.ok && Array.isArray(schedulers.data) && schedulers.data.length) {
          const schedId = (schedulers.data as any[])[0][".id"];
          const heartbeatUrl = `${APP_URL}/api/heartbeat?router=${routerId}`;
          const schedRes = await routerExec(restBase, basicAuth, `/system/scheduler/${schedId}`, "PATCH", {
            "on-event": `:do { /tool fetch mode=https url="${heartbeatUrl}" keep-result=no } on-error={}`,
          });
          await log("heartbeat", schedRes.ok ? "Heartbeat scheduler updated" : `Heartbeat update failed: ${schedRes.error}`, schedRes.ok);
        } else {
          await log("heartbeat", "Heartbeat scheduler not found — run provisioning script first", false);
        }

      } else {
        await log("api_check", `Router API unreachable at ${host}:${apiPort} — ${ping.error}`, false);
      }
    } else {
      await log("api_check", "Router has no IP/credentials stored — skipping live push", false);
    }

    // ── 4. Mark router active in DB ──────────────────────────────────────────
    await supabase.from("routers").update({
      status: routerApiOk ? "active" : "online",
      api_connected: routerApiOk,
      provisioned_at: new Date().toISOString(),
    }).eq("id", routerId);

    // ── 5. Final summary log — triggers applyDone on the UI via realtime ─────
    const summary = `services: ${(router.services || []).join(", ") || "none"} | RADIUS: ${realRadius?.host || "pending"} | API: ${routerApiOk ? "connected" : "unreachable"}`;
    await log("complete", `Apply complete — ${summary}`, true);

    return responsePromise;
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: "Internal error" }), { status: 500, headers: { ...CORS, "content-type": "application/json" } });
  }
});
