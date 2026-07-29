import { serve } from "https://deno.land/std@0.201.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

function parseUptime(raw: string): number {
  const m = raw.match(/(?:(\d+)w)?(?:(\d+)d)?(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?/);
  if (!m) return 0;
  return (parseInt(m[1] || "0") * 7 * 86400) +
    (parseInt(m[2] || "0") * 86400) +
    (parseInt(m[3] || "0") * 3600) +
    (parseInt(m[4] || "0") * 60) +
    parseInt(m[5] || "0");
}

function parseInterfaces(raw: string): Array<{ name: string; type: string; running: boolean }> {
  return raw.split(",").filter(Boolean).map((entry) => {
    const [name, type, running] = entry.split(":");
    return { name: name || "", type: type || "ether", running: running === "true" };
  }).filter((i) => i.name);
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204 });

  const url = new URL(req.url);
  const routerId = url.searchParams.get("router_id") || "";
  const token = url.searchParams.get("token") || "";
  const isTelemetry = url.searchParams.get("telemetry") === "1";
  const isDiscover = url.searchParams.get("discover") === "1";

  if (!routerId || !token) return new Response("missing params", { status: 400 });

  const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { global: { fetch } });

  const { data: router } = await db
    .from("routers")
    .select("id, tenant_id, api_password, services")
    .eq("id", routerId)
    .maybeSingle();

  if (!router || router.api_password !== token) return new Response("unauthorized", { status: 401 });

  const now = new Date().toISOString();
  const publicIp =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    req.headers.get("x-real-ip") ||
    null;

  // ── Discovery: full existing config sync ─────────────────────────────────
  if (isDiscover) {
    const interfaces = parseInterfaces(url.searchParams.get("interfaces") || "");
    const bridges = (url.searchParams.get("bridges") || "").split(",").filter(Boolean);
    const dhcpServers = (url.searchParams.get("dhcp") || "").split(",").filter(Boolean);
    const ipPools = (url.searchParams.get("pools") || "").split(",").filter(Boolean);
    const hotspotServers = (url.searchParams.get("hotspot") || "").split(",").filter(Boolean);
    const pppoeServers = (url.searchParams.get("pppoe") || "").split(",").filter(Boolean);
    const natCount = parseInt(url.searchParams.get("nat") || "0", 10);
    const fwCount = parseInt(url.searchParams.get("fw") || "0", 10);
    const dnsServers = url.searchParams.get("dns") || "";
    const radiusCount = parseInt(url.searchParams.get("radius") || "0", 10);
    const queueCount = parseInt(url.searchParams.get("queues") || "0", 10);
    const routeCount = parseInt(url.searchParams.get("routes") || "0", 10);
    const wanIf = url.searchParams.get("wan") || "";

    // Auto-detect WAN: prefer reported gateway, fallback to ether1, then first non-bridged ether
    const detectedWan = wanIf ||
      interfaces.find((i) => i.name === "ether1")?.name ||
      interfaces.find((i) => i.type === "ether" && !bridges.includes(i.name))?.name ||
      "";

    // Recommend LAN: running ethers that are not the WAN
    const recommendedLan = interfaces
      .filter((i) => i.type === "ether" && i.running && i.name !== detectedWan)
      .map((i) => i.name);

    const discoveredConfig = {
      interfaces,
      bridges,
      dhcp_servers: dhcpServers,
      ip_pools: ipPools,
      hotspot_servers: hotspotServers,
      pppoe_servers: pppoeServers,
      nat_rules: natCount,
      firewall_rules: fwCount,
      dns_servers: dnsServers,
      radius_servers: radiusCount,
      queues: queueCount,
      routes: routeCount,
      detected_wan: detectedWan,
      recommended_lan: recommendedLan,
      discovered_at: now,
    };

    await db.from("routers").update({
      discovered_config: discoveredConfig,
      last_seen: now,
      last_poll_at: now,
      api_connected: true,
      ...(publicIp ? { public_ip: publicIp } : {}),
    }).eq("id", routerId);

    await db.from("provision_logs").insert({
      router_id: routerId,
      tenant_id: router.tenant_id,
      stage: "discover",
      message: `✓ Discovered ${interfaces.length} interfaces — WAN: ${detectedWan || "unknown"} | bridges: ${bridges.join(", ") || "none"} | DHCP: ${dhcpServers.join(", ") || "none"} | pools: ${ipPools.join(", ") || "none"} | hotspot: ${hotspotServers.join(", ") || "none"} | PPPoE: ${pppoeServers.join(", ") || "none"} | NAT: ${natCount} | FW: ${fwCount} | RADIUS: ${radiusCount} | queues: ${queueCount} | routes: ${routeCount}`,
      success: true,
    });

    return new Response("ok", { status: 200, headers: { "content-type": "text/plain" } });
  }

  // ── Telemetry: CPU, RAM, uptime, sessions, traffic, RADIUS connectivity ───
  if (isTelemetry) {
    const cpu = parseInt(url.searchParams.get("cpu") || "0", 10) || null;
    const mem = parseInt(url.searchParams.get("mem") || "0", 10) || null;
    const totalmem = parseInt(url.searchParams.get("totalmem") || "0", 10) || null;
    const uptimeRaw = url.searchParams.get("uptime") || "";
    const version = url.searchParams.get("version") || null;
    const board = url.searchParams.get("board") || null;
    const hsUsers = parseInt(url.searchParams.get("hs") || "0", 10) || 0;
    const pppUsers = parseInt(url.searchParams.get("ppp") || "0", 10) || 0;
    const leases = parseInt(url.searchParams.get("leases") || "0", 10) || 0;
    const rxBytes = parseInt(url.searchParams.get("rx") || "0", 10) || 0;
    const txBytes = parseInt(url.searchParams.get("tx") || "0", 10) || 0;
    // radius=1 means last RADIUS auth succeeded; radius=0 means unreachable
    const radiusParam = url.searchParams.get("radius");
    const radiusOk = radiusParam === "1";

    const uptimeSec = uptimeRaw ? parseUptime(uptimeRaw) : null;
    const interfaceTraffic = { rx_bytes: rxBytes, tx_bytes: txBytes, sampled_at: now };

    await db.from("routers").update({
      status: "online",
      last_seen: now,
      last_poll_at: now,
      api_connected: true,
      ...(cpu !== null ? { cpu_load: cpu } : {}),
      ...(mem !== null ? { free_memory: mem } : {}),
      ...(totalmem !== null ? { total_memory: totalmem } : {}),
      ...(uptimeSec !== null ? { uptime_seconds: uptimeSec } : {}),
      ...(version ? { ros_version: version } : {}),
      ...(board ? { board_name: board } : {}),
      hotspot_users: hsUsers,
      pppoe_users: pppUsers,
      dhcp_leases: leases,
      interface_traffic: interfaceTraffic,
      ...(radiusParam !== null ? { radius_healthy: radiusOk } : {}),
      ...(publicIp ? { public_ip: publicIp } : {}),
    }).eq("id", routerId);

    // Sync RADIUS server health based on router-reported connectivity
    if (radiusParam !== null) {
      await db.from("radius_servers")
        .update({ is_healthy: radiusOk })
        .eq("tenant_id", router.tenant_id)
        .eq("is_active", true);
    }

    return new Response("ok", { status: 200, headers: { "content-type": "text/plain" } });
  }

  // ── Standard poll: heartbeat + command queue ──────────────────────────────
  await db.from("routers").update({
    status: "online",
    last_seen: now,
    last_poll_at: now,
    api_connected: true,
    ...(publicIp ? { public_ip: publicIp } : {}),
  }).eq("id", routerId);

  const { data: commands } = await db
    .from("router_commands")
    .select("id, command, payload")
    .eq("router_id", routerId)
    .eq("status", "pending")
    .gt("expires_at", now)
    .order("created_at", { ascending: true })
    .limit(1);

  if (!commands?.length) {
    return new Response("ok", { status: 200, headers: { "content-type": "text/plain" } });
  }

  const cmd = commands[0];
  await db.from("router_commands").update({ status: "running", started_at: now }).eq("id", cmd.id);

  if (cmd.command === "re_provision") {
    const provisionUrl = (cmd.payload as any)?.provision_url || "";
    await db.from("router_commands").update({ status: "done", completed_at: now }).eq("id", cmd.id);
    await db.from("provision_logs").insert({
      router_id: routerId,
      tenant_id: router.tenant_id,
      stage: "router_applying",
      message: "Router received re-provision command — downloading and applying full script",
      success: true,
    });
    return new Response(provisionUrl, { status: 200, headers: { "content-type": "text/plain" } });
  }

  if (cmd.command === "patch_radius") {
    const primaryIp = (cmd.payload as any)?.primary_ip || "";
    const secondaryIp = (cmd.payload as any)?.secondary_ip || "";
    if (!primaryIp) {
      await db.from("router_commands").update({ status: "done", completed_at: now }).eq("id", cmd.id);
      return new Response("ok", { status: 200, headers: { "content-type": "text/plain" } });
    }
    const patchLines = [
      ":do { /radius set [find comment=\"SmartLinkNet-Primary\"] address=" + primaryIp + " } on-error={};",
      secondaryIp
        ? ":do { /radius set [find comment=\"SmartLinkNet-Secondary\"] address=" + secondaryIp + " } on-error={};" 
        : "",
      ":log info \"SmartLinkNet: RADIUS address patched to " + primaryIp + "\"",
    ].filter(Boolean).join("\n");
    await db.from("router_commands").update({ status: "done", completed_at: now }).eq("id", cmd.id);
    await db.from("provision_logs").insert({
      router_id: routerId,
      tenant_id: router.tenant_id,
      stage: "patch_radius",
      message: `RADIUS address patched to ${primaryIp}${secondaryIp ? " / " + secondaryIp : ""}`,
      success: true,
    });
    return new Response(patchLines, { status: 200, headers: { "content-type": "text/plain" } });
  }

  await db.from("router_commands").update({ status: "done", completed_at: now }).eq("id", cmd.id);
  return new Response("ok", { status: 200, headers: { "content-type": "text/plain" } });
});
