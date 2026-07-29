import { serve } from "https://deno.land/std@0.201.0/http/server.ts";
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const STAGE_MESSAGES: Record<string, string> = {
  discover:      "✓ Interface discovery complete — existing config synchronized",
  validate:      "✓ Pre-flight validation passed — internet connectivity confirmed",
  validate_fail: "✕ Validation failed — no internet on uplink, aborting",
  backup:        "✓ Router backup saved (sln-pre-provision)",
  identity:      "✓ Router identity set",
  bridge:        "✓ Bridge interface + ports configured",
  network:       "✓ Gateway IP, DHCP server, DHCP pool — active",
  dns:           "✓ DNS configured (8.8.8.8, 8.8.4.4)",
  firewall:      "✓ Firewall rules applied — input/forward chains secured",
  nat:           "✓ NAT masquerade — internet routing live",
  radius:        "✓ RADIUS client configured — cloud AAA + accounting connected",
  hotspot:       "✓ Hotspot server + captive portal — live",
  walled_garden: "✓ Walled garden — portal, M-Pesa, Supabase allowed pre-auth",
  pppoe:         "✓ PPPoE server — live, subscribers can dial in",
  queues:        "✓ Bandwidth queues configured with burst support",
  api_user:      "✓ API user (sln-api) created on router",
  scheduler:     "✓ Poll (1 min) + telemetry (5 min) schedulers running",
  verify_ok:     "✓ Service verification passed — all configured services confirmed running",
  verify_fail:   "⚠ Service verification found issues — check errors",
  rollback:      "↩ Rollback executed — restored sln-pre-provision backup",
  complete:      "✓ Router fully provisioned and marked Ready",
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
      // Mark router as Ready — fully provisioned
      await db.from("routers").update({
        status: "ready",
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

    // Build human-readable message
    let message = STAGE_MESSAGES[stage] || "✓ Stage: " + stage;
    if (stage === "complete" && publicIp) {
      message = "✓ Router fully provisioned and marked Ready — public IP: " + publicIp;
    }
    if (stage === "verify_fail" && errors) {
      message = "⚠ Verification issues: " + errors.replace(/,/g, ", ");
    }

    await db.from("provision_logs").insert({
      router_id: routerId,
      tenant_id: router?.tenant_id ?? null,
      stage,
      message,
      success: stage !== "validate_fail" && stage !== "verify_fail" && stage !== "rollback",
    });

    return new Response("ok", { status: 200, headers: { "content-type": "text/plain" } });
  } catch (err) {
    console.error(err);
    return new Response("error", { status: 500 });
  }
});
