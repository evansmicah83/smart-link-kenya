import { serve } from "https://deno.land/std@0.201.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL     = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const ANON_KEY         = Deno.env.get("SUPABASE_ANON_KEY") || "";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

async function withRetry<T>(fn: () => Promise<T>, attempts = 3, delayMs = 2000): Promise<T> {
  let last: any;
  for (let i = 0; i < attempts; i++) {
    try { return await fn(); } catch (e) {
      last = e;
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw last;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST")   return new Response("Method Not Allowed", { status: 405, headers: CORS });

  const resp = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...CORS, "content-type": "application/json" } });

  try {
    // ── Auth ────────────────────────────────────────────────────────────────
    const token = (req.headers.get("authorization") || "").replace("Bearer ", "");
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

    const supabaseHost = new URL(SUPABASE_URL).host;

    const log = async (stage: string, message: string, success = true) => {
      await db.from("provision_logs").insert({ router_id: routerId, tenant_id: tenantId, stage, message, success });
    };

    // ── Step 1: Validate router has polled recently ──────────────────────────
    await log("queued",  "[queued] Starting device configuration...");
    await log("connect", "[connect] Connecting to device API...");
    // For first-time provisioning (status pending/provisioning) allow up to 30 min
    // since the router may have just run the setup script for the first time.
    // For re-provisioning an already-active router, require a poll within 5 min.
    const isFirstProvision = router.status === "pending" || router.status === "provisioning" || !router.last_poll_at;
    const pollWindowMs = isFirstProvision ? 30 * 60 * 1000 : 5 * 60 * 1000;
    const pollAgeMs = Date.now() - (router.last_poll_at ? new Date(router.last_poll_at).getTime() : 0);
    if (!isFirstProvision && pollAgeMs > pollWindowMs) {
      await log("validate_fail", "[validate] Router has not polled in the last 5 minutes — ensure the router is online and the poll scheduler is running", false);
      return resp({ ok: false, error: "router_unreachable", detail: "Router last poll was " + Math.round(pollAgeMs / 60000) + " min ago" });
    }
    await log("harden", "[harden] Applying RADIUS, admin and firewall hardening...");

    // ── Step 2: Read platform FreeRADIUS config ──────────────────────────────
    // SmartLinkNet operator sets this once. All ISP routers use it automatically.
    const { data: platformSetting } = await db
      .from("platform_settings")
      .select("value")
      .eq("key", "freeradius")
      .maybeSingle();

    const fr = platformSetting?.value ?? {};
    const frPrimaryIp   = fr.primary_ip   as string | null;
    const frSecondaryIp = fr.secondary_ip as string | null;
    const frAuthPort    = (fr.auth_port   as number) || 1812;
    const frAcctPort    = (fr.acct_port   as number) || 1813;
    const frCoaPort     = (fr.coa_port    as number) || 3799;
    const frInterim     = (fr.interim_interval as number) || 300;
    const frDeployed    = fr.deployed as boolean;

    // ── Step 3: Ensure per-tenant RADIUS server record ───────────────────────
    // Each tenant gets their own shared_secret for NAS authentication isolation.
    // All tenants share the same FreeRADIUS IP (platform infrastructure).
    const radiusServer = await withRetry(async () => {
      const { data: existing } = await db.from("radius_servers")
        .select("id, shared_secret, freeradius_ip, freeradius_ip2, auth_port, acct_port, coa_port, interim_interval")
        .eq("tenant_id", tenantId)
        .eq("is_active", true)
        .order("priority", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (existing) {
        // Update FreeRADIUS IP if platform config has changed
        if (frPrimaryIp && existing.freeradius_ip !== frPrimaryIp) {
          await db.from("radius_servers").update({
            freeradius_ip:  frPrimaryIp,
            freeradius_ip2: frSecondaryIp,
            host:           frPrimaryIp,
            auth_port:      frAuthPort,
            acct_port:      frAcctPort,
            coa_port:       frCoaPort,
            interim_interval: frInterim,
          }).eq("id", existing.id);
          return { ...existing, freeradius_ip: frPrimaryIp, freeradius_ip2: frSecondaryIp };
        }
        return existing;
      }

      // Create new per-tenant RADIUS record pointing to platform FreeRADIUS
      const secret = Array.from(crypto.getRandomValues(new Uint8Array(24)))
        .map((b: number) => b.toString(16).padStart(2, "0")).join("");
      const { data: created } = await db.from("radius_servers").insert({
        tenant_id:        tenantId,
        name:             "SmartLinkNet RADIUS",
        host:             frPrimaryIp || "pending",
        freeradius_ip:    frPrimaryIp,
        freeradius_ip2:   frSecondaryIp,
        auth_port:        frAuthPort,
        acct_port:        frAcctPort,
        coa_port:         frCoaPort,
        interim_interval: frInterim,
        shared_secret:    secret,
        is_active:        true,
        is_primary:       true,
        is_healthy:       true,
        priority:         1,
      }).select("id, shared_secret, freeradius_ip, freeradius_ip2, auth_port, acct_port, coa_port, interim_interval").single();
      return created;
    });

    const radiusIp = radiusServer?.freeradius_ip || frPrimaryIp;
    await log("radius_db",
      frDeployed && radiusIp
        ? "✓ RADIUS ready — SmartLinkNet FreeRADIUS at " + radiusIp + ":" + frAuthPort
        : "⚠ FreeRADIUS not yet deployed — router will be provisioned, RADIUS will activate when platform FreeRADIUS is online"
    );

    // ── Step 4: Register NAS device ──────────────────────────────────────────
    // Registers this router as a RADIUS client in the nas_devices table.
    // FreeRADIUS reads the nas view from this table to validate clients.
    await withRetry(async () => {
      const { data: existingNas } = await db.from("nas_devices").select("id").eq("router_id", routerId).maybeSingle();
      const nasPayload = {
        tenant_id:               tenantId,
        router_id:               routerId,
        name:                    router.name,
        vendor:                  "mikrotik",
        nas_identifier:          router.name,
        nas_ip:                  router.public_ip || null,
        shared_secret:           radiusServer?.shared_secret || "",
        auth_port:               frAuthPort,
        acct_port:               frAcctPort,
        coa_port:                frCoaPort,
        is_active:               true,
        dynamic_profile_enabled: true,
        updated_at:              new Date().toISOString(),
      };
      if (existingNas?.id) {
        await db.from("nas_devices").update(nasPayload).eq("id", existingNas.id);
      } else {
        await db.from("nas_devices").insert(nasPayload);
      }
    });
    await log("nas_db", "✓ NAS registered: \"" + router.name + "\" — auto-registered with SmartLinkNet RADIUS");

    // ── Step 5: Queue re_provision command ───────────────────────────────────
    await db.from("router_commands").delete()
      .eq("router_id", routerId).eq("command", "re_provision").eq("status", "pending");

    const provisionUrl = "https://" + supabaseHost + "/functions/v1/provision?token=" + router.provision_token;
    await db.from("router_commands").insert({
      router_id:  routerId,
      tenant_id:  tenantId,
      command:    "re_provision",
      payload:    { provision_url: provisionUrl },
      status:     "pending",
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    });

    // Immediately trigger poll so router gets the command without waiting 1 min
    const pollUrl = "https://" + supabaseHost + "/functions/v1/router-poll?router_id=" + routerId + "&token=" + router.api_password;
    try { await fetch(pollUrl, { method: "GET" }); } catch { /* picks up on next tick */ }

    await log("triggered", "✓ Re-provision command queued — router downloading config for: " + (router.services?.join(", ") || "none"));

    // ── Step 6: Wait for provisioning to complete (up to 120s) ──────────────
    const deadline = Date.now() + 120_000;
    let finalStage = "";

    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 2000));
      const { data: recentLogs } = await db
        .from("provision_logs")
        .select("stage, success")
        .eq("router_id", routerId)
        .in("stage", ["complete", "validate_fail", "rollback"])
        .gte("created_at", new Date(Date.now() - 180_000).toISOString())
        .order("created_at", { ascending: false })
        .limit(3);

      if (recentLogs?.find((l) => l.stage === "complete"))                              { finalStage = "complete";      break; }
      if (recentLogs?.find((l) => l.stage === "validate_fail" || l.stage === "rollback")) { finalStage = recentLogs.find((l) => l.stage !== "complete")!.stage; break; }
    }

    // ── Step 7: Handle outcome ───────────────────────────────────────────────
    if (finalStage === "complete") {
      const { data: verifyLog } = await db.from("provision_logs")
        .select("stage, message").eq("router_id", routerId).eq("stage", "verify_ok")
        .gte("created_at", new Date(Date.now() - 180_000).toISOString()).maybeSingle();

      if (!verifyLog) {
        const { data: verifyFail } = await db.from("provision_logs")
          .select("message").eq("router_id", routerId).eq("stage", "verify_fail")
          .gte("created_at", new Date(Date.now() - 180_000).toISOString()).maybeSingle();
        if (verifyFail) {
          await log("verify_warning", "⚠ Provisioning complete but verification found issues: " + verifyFail.message, false);
          return resp({ ok: true, complete: true, warning: "verify_issues", detail: verifyFail.message });
        }
      }
      return resp({ ok: true, complete: true, verified: !!verifyLog });
    }

    if (finalStage === "validate_fail") {
      const freshToken = crypto.randomUUID() + Array.from(crypto.getRandomValues(new Uint8Array(8)))
        .map((b: number) => b.toString(16).padStart(2, "0")).join("");
      await db.from("routers").update({
        provision_token:             freshToken,
        provision_token_expires_at:  new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      }).eq("id", routerId);
      await db.from("router_commands").insert({
        router_id:  routerId, tenant_id: tenantId,
        command:    "re_provision",
        payload:    { provision_url: "https://" + supabaseHost + "/functions/v1/provision?token=" + freshToken + "&rollback=1" },
        status:     "pending",
        expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      });
      await log("rollback_queued", "↩ Critical failure — rollback queued (router will restore sln-pre-provision backup)", false);
      return resp({ ok: false, error: "validate_fail", detail: "Router reported no internet on uplink — rollback initiated" });
    }

    await log("timeout", "⚠ Router did not complete provisioning within 120s — check connectivity and retry", false);
    return resp({ ok: false, error: "timeout" });

  } catch (err: any) {
    console.error("apply-router-config error:", err?.message);
    return resp({ error: "Internal error", detail: err?.message }, 500);
  }
});
