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

// Retry an async operation up to maxAttempts times with delay between attempts
async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  delayMs = 2000,
): Promise<T> {
  let lastErr: any;
  for (let i = 0; i < maxAttempts; i++) {
    try { return await fn(); } catch (e) {
      lastErr = e;
      if (i < maxAttempts - 1) await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw lastErr;
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

    const log = async (stage: string, message: string, success = true) => {
      await db.from("provision_logs").insert({ router_id: routerId, tenant_id: tenantId, stage, message, success });
    };

    // ── Step 1: Validate router is reachable (has polled within 5 min) ────
    await log("start", "Starting enterprise provisioning — validating router connectivity...");

    const lastPoll = router.last_poll_at ? new Date(router.last_poll_at).getTime() : 0;
    const pollAgeMs = Date.now() - lastPoll;
    if (pollAgeMs > 5 * 60 * 1000) {
      await log("validate_fail", "Router has not polled in the last 5 minutes — ensure provisioning script ran successfully", false);
      return resp({ ok: false, error: "router_unreachable", detail: "Router last poll was " + Math.round(pollAgeMs / 60000) + " min ago" });
    }
    await log("validate", "✓ Router connectivity confirmed — last poll " + Math.round(pollAgeMs / 1000) + "s ago");

    // ── Step 2: Resolve cloud IP ──────────────────────────────────────────
    const supabaseHost = new URL(SUPABASE_URL).host;
    const systemIp = await resolveIp(supabaseHost);

    // ── Step 3: Ensure RADIUS server (with retry) ─────────────────────────
    let radiusServer = await withRetry(async () => {
      let { data } = await db.from("radius_servers")
        .select("id, host, auth_port, acct_port, shared_secret")
        .eq("tenant_id", tenantId).eq("is_active", true)
        .order("priority", { ascending: true }).limit(1).maybeSingle();

      if (!data) {
        const secret = Array.from(crypto.getRandomValues(new Uint8Array(24)))
          .map((b: number) => b.toString(16).padStart(2, "0")).join("");
        const { data: created } = await db.from("radius_servers").insert({
          tenant_id: tenantId, name: "SmartLinkNet Cloud RADIUS",
          host: systemIp || "pending", auth_port: 1812, acct_port: 1813,
          shared_secret: secret, is_active: true, is_primary: true, is_healthy: true, priority: 1,
          auth_url: "https://" + supabaseHost + "/functions/v1/radius-auth",
          acct_url: "https://" + supabaseHost + "/functions/v1/radius-accounting",
        }).select("id, host, auth_port, acct_port, shared_secret").single();
        data = created;
      } else if ((data.host === "pending" || !data.host) && systemIp) {
        await db.from("radius_servers").update({
          host: systemIp,
          auth_url: "https://" + supabaseHost + "/functions/v1/radius-auth",
          acct_url: "https://" + supabaseHost + "/functions/v1/radius-accounting",
        }).eq("id", data.id);
        data = { ...data, host: systemIp };
      }
      return data;
    });

    const radiusHost = radiusServer?.host !== "pending" ? radiusServer?.host : systemIp;
    await log("radius_db", "✓ RADIUS ready — " + (radiusHost || "pending") + ":" + (radiusServer?.auth_port || 1812));

    // ── Step 4: Upsert NAS device (with retry) ────────────────────────────
    await withRetry(async () => {
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
    });
    await log("nas_db", "✓ NAS registered: \"" + router.name + "\" — RADIUS accounting enabled");

    // ── Step 5: Queue re_provision command ────────────────────────────────
    await db.from("router_commands").delete()
      .eq("router_id", routerId).eq("command", "re_provision").eq("status", "pending");

    const provisionUrl = "https://" + supabaseHost + "/functions/v1/provision?token=" + router.provision_token;

    await db.from("router_commands").insert({
      router_id: routerId, tenant_id: tenantId,
      command: "re_provision",
      payload: { provision_url: provisionUrl },
      status: "pending",
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    });

    // Immediately trigger router-poll so router gets the command without waiting for scheduler
    const pollUrl = "https://" + supabaseHost + "/functions/v1/router-poll?router_id=" + routerId + "&token=" + router.api_password;
    try { await fetch(pollUrl, { method: "GET" }); } catch { /* router picks up on next 1-min tick */ }

    await log("triggered", "✓ Re-provision command queued — router is downloading and applying config for: " + (router.services?.join(", ") || "none"));

    // ── Step 6: Wait for provisioning to complete (up to 120s) ───────────
    // We wait for stage=complete OR stage=validate_fail (critical failure → rollback)
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

      const completedLog = recentLogs?.find((l) => l.stage === "complete");
      const failLog = recentLogs?.find((l) => l.stage === "validate_fail" || l.stage === "rollback");

      if (completedLog) { finalStage = "complete"; break; }
      if (failLog) { finalStage = failLog.stage; break; }
    }

    // ── Step 7: Handle outcome ────────────────────────────────────────────
    if (finalStage === "complete") {
      // Verify all services are confirmed running (check for verify_ok log)
      const { data: verifyLog } = await db
        .from("provision_logs")
        .select("stage, message")
        .eq("router_id", routerId)
        .eq("stage", "verify_ok")
        .gte("created_at", new Date(Date.now() - 180_000).toISOString())
        .maybeSingle();

      if (!verifyLog) {
        // verify_ok not received — check for verify_fail
        const { data: verifyFail } = await db
          .from("provision_logs")
          .select("message")
          .eq("router_id", routerId)
          .eq("stage", "verify_fail")
          .gte("created_at", new Date(Date.now() - 180_000).toISOString())
          .maybeSingle();

        if (verifyFail) {
          await log("verify_warning", "⚠ Provisioning complete but service verification reported issues: " + verifyFail.message, false);
          return resp({ ok: true, complete: true, warning: "verify_issues", detail: verifyFail.message });
        }
      }

      return resp({ ok: true, complete: true, verified: !!verifyLog });
    }

    if (finalStage === "validate_fail") {
      // Refresh token so rollback script can be fetched even if original token expired
      const freshToken = crypto.randomUUID() + Array.from(crypto.getRandomValues(new Uint8Array(8)))
        .map((b: number) => b.toString(16).padStart(2, "0")).join("");
      await db.from("routers").update({
        provision_token: freshToken,
        provision_token_expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      }).eq("id", routerId);

      // Critical failure — trigger rollback command
      await db.from("router_commands").insert({
        router_id: routerId, tenant_id: tenantId,
        command: "re_provision",
        payload: {
          provision_url: "https://" + supabaseHost + "/functions/v1/provision?token=" + freshToken + "&rollback=1",
        },
        status: "pending",
        expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      });
      await log("rollback_queued", "↩ Critical failure detected — rollback queued (router will restore sln-pre-provision backup)", false);
      return resp({ ok: false, error: "validate_fail", detail: "Router reported no internet on uplink — rollback initiated" });
    }

    // Timeout
    await log("timeout", "⚠ Router did not complete provisioning within 120s — check router connectivity and retry", false);
    return resp({ ok: false, error: "timeout" });

  } catch (err: any) {
    console.error("apply-router-config error:", err?.message);
    return resp({ error: "Internal error", detail: err?.message }, 500);
  }
});
