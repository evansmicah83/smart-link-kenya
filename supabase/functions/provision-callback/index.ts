import { serve } from "https://deno.land/std@0.201.0/http/server.ts";
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const STAGE_MESSAGES: Record<string, string> = {
  identity:     "✓ Router identity set on device",
  bridge:       "✓ Bridge interface + ports configured on router",
  network:      "✓ Gateway IP, DHCP pool, DNS — active on router",
  nat:          "✓ NAT masquerade — internet routing live",
  radius:       "✓ RADIUS client configured — cloud AAA connected",
  hotspot:      "✓ Hotspot (captive portal) — live on router",
  walled_garden:"✓ Walled garden — portal, M-Pesa, Supabase allowed pre-auth",
  pppoe:        "✓ PPPoE server — live, subscribers can dial in",
  api_user:     "✓ API user created on router",
  scheduler:    "✓ Poll scheduler running — router calls home every 1 min",
  complete:     "✓ Router fully configured and online",
};

serve(async (req: Request) => {
  try {
    const url = new URL(req.url);
    const routerId = url.searchParams.get("router_id") || "";
    const stage = url.searchParams.get("stage") || "unknown";

    if (!routerId) return new Response("missing router_id", { status: 400 });

    const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { global: { fetch } });

    const publicIp =
      req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
      req.headers.get("x-real-ip") ||
      null;

    const now = new Date().toISOString();

    // On complete — mark router fully online with real public IP
    if (stage === "complete") {
      await db.from("routers").update({
        status: "online",
        api_connected: true,
        last_seen: now,
        last_poll_at: now,
        provisioned_at: now,
        ...(publicIp ? { public_ip: publicIp, connection_string: publicIp } : {}),
      }).eq("id", routerId);
    }

    const { data: router } = await db
      .from("routers")
      .select("tenant_id, services")
      .eq("id", routerId)
      .maybeSingle();

    const tenantId = router?.tenant_id ?? null;

    const message = stage === "complete" && publicIp
      ? "✓ Router fully configured and online — public IP: " + publicIp
      : (STAGE_MESSAGES[stage] || "✓ Stage: " + stage);

    await db.from("provision_logs").insert({
      router_id: routerId,
      tenant_id: tenantId,
      stage,
      message,
      success: true,
    });

    return new Response("ok", { status: 200, headers: { "content-type": "text/plain" } });
  } catch (err) {
    console.error(err);
    return new Response("error", { status: 500 });
  }
});
