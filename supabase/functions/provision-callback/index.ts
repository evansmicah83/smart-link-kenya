import { serve } from "https://deno.land/std@0.201.0/http/server.ts";
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

// Stages that produce a visible log line. Anything not listed here is silently
// recorded in the DB but does NOT insert a provision_logs row visible in the UI.
const STAGE_MESSAGES: Record<string, string> = {
  // Centipid-visible stages (shown in terminal log)
  queued:          "[queued] Starting device configuration...",
  connect:         "[connect] Connecting to device API...",
  harden:          "[harden] Applying security hardening, firewall and RADIUS...",
  bridge:          "[bridge] Bridge interface and ports configured",
  pool:            "[pool] IP address pool configured",
  addresses:       "[addresses] DHCP server and gateway address configured",
  "pppoe-aaa":     "[pppoe-aaa] PPPoE server and AAA profile configured",
  "hotspot-files": "[hotspot-files] Hotspot profile, server and walled garden configured",
  complete:        "[done] Router active — configuration complete.",
  // Error / recovery stages
  validate_fail:   "[validate] No internet on uplink — aborting",
  verify_ok:       "[verify] All services verified and running",
  verify_fail:     "[verify] Service verification found issues",
  rollback:        "[rollback] Rollback executed — pre-provision backup restored",
  // Silent stages — recorded in DB, not shown in UI terminal
  // discover, validate, backup, identity, dns, firewall, nat, radius,
  // queues, api_user, scheduler, nas_db, radius_db, triggered, timeout
};

serve(async (req: Request) => {
  try {
    const url = new URL(req.url);
    const routerId = url.searchParams.get("router_id") || "";
    const stage = url.searchParams.get("stage") || "unknown";
    const errors = url.searchParams.get("errors") || "";

    if (!routerId) return new Response("missing router_id", { status: 400 });

    const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { global: { fetch } });

    const publicIp =
      req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
      req.headers.get("x-real-ip") ||
      null;

    const now = new Date().toISOString();

    // ── Stage-specific router table updates ───────────────────────────────
    if (stage === "complete") {
      // Mark router as Active — fully provisioned
      await db.from("routers").update({
        status: "active",
        api_connected: true,
        last_seen: now,
        last_poll_at: now,
        provisioned_at: now,
        ready_at: now,
        ...(publicIp ? { public_ip: publicIp, connection_string: publicIp } : {}),
      }).eq("id", routerId);
    }

    if (stage === "backup") {
      await db.from("routers").update({ backup_at: now }).eq("id", routerId);
    }

    if (stage === "validate_fail") {
      await db.from("routers").update({
        status: "failed",
        validation_errors: { reason: "no_internet", at: now },
      }).eq("id", routerId);
    }

    if (stage === "verify_fail" && errors) {
      await db.from("routers").update({
        validation_errors: { verify_errors: errors.split(",").filter(Boolean), at: now },
      }).eq("id", routerId);
    }

    if (stage === "rollback") {
      await db.from("routers").update({
        status: "rollback",
        rollback_at: now,
      }).eq("id", routerId);
    }

    if (stage === "discover") {
      // Discovery data arrives via router-poll?discover=1 — callback updates heartbeat
      // so Step 3 poll detects the router as live immediately after discovery fires
      await db.from("routers").update({
        last_seen: now,
        last_poll_at: now,
        api_connected: true,
        ...(publicIp ? { public_ip: publicIp } : {}),
      }).eq("id", routerId);
    }

    const { data: router } = await db
      .from("routers")
      .select("tenant_id")
      .eq("id", routerId)
      .maybeSingle();

    // Only insert a provision_log row for stages that have a visible message
    const message = STAGE_MESSAGES[stage];
    if (message !== undefined) {
      const finalMessage = (stage === "verify_fail" && errors)
        ? "[verify] Issues: " + errors.replace(/,/g, ", ")
        : message;
      await db.from("provision_logs").insert({
        router_id: routerId,
        tenant_id: router?.tenant_id ?? null,
        stage,
        message: finalMessage,
        success: stage !== "validate_fail" && stage !== "verify_fail" && stage !== "rollback",
      });
    }

    return new Response("ok", { status: 200, headers: { "content-type": "text/plain" } });
  } catch (err) {
    console.error(err);
    return new Response("error", { status: 500 });
  }
});
