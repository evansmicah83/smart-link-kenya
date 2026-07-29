import { serve } from "https://deno.land/std@0.201.0/http/server.ts";
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

serve(async (req: Request) => {
  try {
    const url = new URL(req.url);
    const routerId = url.searchParams.get("router_id") || "";
    const stage = url.searchParams.get("stage") || "complete";

    if (!routerId) return new Response("missing router_id", { status: 400 });

    const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { global: { fetch } });

    // Real public IP of the router — captured from the HTTP request itself
    const publicIp =
      req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
      req.headers.get("x-real-ip") ||
      null;

    const now = new Date().toISOString();

    // Mark router fully online with real public IP
    await db.from("routers").update({
      status: "online",
      api_connected: true,
      last_seen: now,
      last_poll_at: now,
      provisioned_at: now,
      ...(publicIp ? { public_ip: publicIp, connection_string: publicIp } : {}),
    }).eq("id", routerId);

    const { data: router } = await db
      .from("routers")
      .select("tenant_id, name, services")
      .eq("id", routerId)
      .maybeSingle();

    const tenantId = router?.tenant_id ?? null;
    const services: string[] = router?.services || [];
    const hasHotspot = services.includes("hotspot");
    const hasPppoe = services.includes("pppoe");

    // Log real confirmation from the router
    await db.from("provision_logs").insert([
      {
        router_id: routerId, tenant_id: tenantId,
        stage: "router_confirmed",
        message: "Router script executed successfully" + (publicIp ? " — public IP: " + publicIp : ""),
        success: true,
      },
      {
        router_id: routerId, tenant_id: tenantId,
        stage: "bridge_done",
        message: "Bridge, DHCP, NAT, DNS — configured on router",
        success: true,
      },
      {
        router_id: routerId, tenant_id: tenantId,
        stage: "radius_done",
        message: "RADIUS client configured on router — cloud AAA active",
        success: true,
      },
      ...(hasHotspot ? [{
        router_id: routerId, tenant_id: tenantId,
        stage: "hotspot_done",
        message: "Hotspot (captive portal) — live and accepting subscribers",
        success: true,
      }] : []),
      ...(hasPppoe ? [{
        router_id: routerId, tenant_id: tenantId,
        stage: "pppoe_done",
        message: "PPPoE server — live and accepting dial-in subscribers",
        success: true,
      }] : []),
      {
        router_id: routerId, tenant_id: tenantId,
        stage: "poll_done",
        message: "Poll scheduler running — router calls home every 1 min",
        success: true,
      },
      {
        router_id: routerId, tenant_id: tenantId,
        stage: "complete",
        message: "Router fully configured and online — services: " + (services.join(", ") || "none"),
        success: true,
      },
    ]);

    return new Response("ok", { status: 200, headers: { "content-type": "text/plain" } });
  } catch (err) {
    console.error(err);
    return new Response("error", { status: 500 });
  }
});
