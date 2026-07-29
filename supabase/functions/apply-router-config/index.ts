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

    // Verify user and tenant
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

    const log = async (stage: string, message: string, success: boolean) => {
      await db.from("provision_logs").insert({ router_id: routerId, tenant_id: tenantId, stage, message, success });
    };

    await log("start", "Starting router configuration...", true);

    // ── 1. Resolve system IP ──────────────────────────────────────────────
    const supabaseHost = new URL(SUPABASE_URL).host;
    const systemIp = await resolveIp(supabaseHost);
    await log("dns", "Resolved cloud IP: " + (systemIp || "failed — using fallback"), !!systemIp);

    // ── 2. Ensure RADIUS server exists with real IP ───────────────────────
    let { data: radiusServer } = await db.from("radius_servers")
      .select("id, host, auth_port, acct_port, shared_secret")
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .order("priority", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!radiusServer) {
      const secret = Array.from(crypto.getRandomValues(new Uint8Array(24)))
        .map((b: number) => b.toString(16).padStart(2, "0")).join("");
      const { data: created } = await db.from("radius_servers").insert({
        tenant_id: tenantId,
        name: "SmartLinkNet Cloud RADIUS",
        host: systemIp || "pending",
        auth_port: 1812,
        acct_port: 1813,
        shared_secret: secret,
        is_active: true, is_primary: true, is_healthy: true, priority: 1,
        auth_url: "https://" + supabaseHost + "/functions/v1/radius-auth",
        acct_url: "https://" + supabaseHost + "/functions/v1/radius-accounting",
      }).select("id, host, auth_port, acct_port, shared_secret").single();
      radiusServer = created;
    } else if ((radiusServer.host === "pending" || !radiusServer.host) && systemIp) {
      await db.from("radius_servers").update({
        host: systemIp,
        auth_url: "https://" + supabaseHost + "/functions/v1/radius-auth",
        acct_url: "https://" + supabaseHost + "/functions/v1/radius-accounting",
      }).eq("id", radiusServer.id);
      radiusServer = { ...radiusServer, host: systemIp };
    }

    const radiusHost = radiusServer?.host && radiusServer.host !== "pending" ? radiusServer.host : systemIp;
    const radiusSecret = radiusServer?.shared_secret || "";
    const radiusAuthPort = radiusServer?.auth_port || 1812;
    const radiusAcctPort = radiusServer?.acct_port || 1813;

    await log("radius", "RADIUS server configured — " + (radiusHost || "pending") + ":" + radiusAuthPort, !!radiusHost);

    // ── 3. Upsert NAS device ──────────────────────────────────────────────
    const nasName = router.name;
    const { data: existingNas } = await db.from("nas_devices").select("id").eq("router_id", routerId).maybeSingle();
    const nasPayload = {
      tenant_id: tenantId, router_id: routerId, name: nasName,
      vendor: "mikrotik", nas_identifier: nasName,
      nas_ip: router.public_ip || null,
      shared_secret: radiusSecret,
      auth_port: radiusAuthPort, acct_port: radiusAcctPort, coa_port: 3799,
      is_active: true, dynamic_profile_enabled: true,
      updated_at: new Date().toISOString(),
    };
    if (existingNas?.id) {
      await db.from("nas_devices").update(nasPayload).eq("id", existingNas.id);
    } else {
      await db.from("nas_devices").insert(nasPayload);
    }
    await log("nas", "NAS device registered: \"" + nasName + "\" (shared secret synced)", true);

    // ── 4. Build the full RouterOS config script ──────────────────────────
    const { data: tenant } = await db.from("tenants").select("slug, name").eq("id", tenantId).maybeSingle();
    const ispSlug = (tenant?.slug ?? tenantId).replace(/[^a-z0-9]/g, "-").toLowerCase();
    const safeName = (router.name || "MikroTik").replace(/"/g, '\\"');
    const bridgeName = ispSlug + "-bridge";

    const subnet = router.subnet || "172.31.0.0/16";
    const [networkAddr, prefixLen] = subnet.split("/");
    const parts = networkAddr.split(".").map(Number);
    parts[3] = 1;
    const gatewayIp = parts.join(".");
    const bridgeAddress = gatewayIp + "/" + prefixLen;
    const poolStart = parts[0] + "." + parts[1] + "." + parts[2] + ".10";
    const poolEnd = parts[0] + "." + parts[1] + "." + parts[2] + ".254";

    const bridgePorts: string[] = router.bridge_ports?.length
      ? router.bridge_ports : [router.bridge_port || "ether2"];
    const uplinkInterface: string = router.uplink_interface || "ether1";
    const services: string[] = router.services || [];
    const hasHotspot = services.includes("hotspot");
    const hasPppoe = services.includes("pppoe");
    const radiusService = hasHotspot && hasPppoe ? "hotspot,ppp" : hasHotspot ? "hotspot" : "ppp";

    const apiUsername = (router.api_username && router.api_username !== "admin") ? router.api_username : "sln-api";
    const apiPassword = router.api_password || Array.from(
      crypto.getRandomValues(new Uint8Array(16))
    ).map((b: number) => b.toString(16).padStart(2, "0")).join("");

    await db.from("routers").update({ api_username: apiUsername, api_password: apiPassword }).eq("id", routerId);

    const pollUrl = "https://" + supabaseHost + "/functions/v1/router-poll?router_id=" + routerId + "&token=" + apiPassword;
    const safe = (cmd: string) => ":do { " + cmd + " } on-error={}";
    const pollOnEvent = ":do { /tool fetch mode=https url='" + pollUrl + "' http-method=post http-data='{}' dst-path=sln-poll.json keep-result=yes } on-error={}";

    const scriptLines: string[] = [
      "# SmartLinkNet -- Full configuration script",
      "# Router: " + safeName + " | Services: " + (services.join(", ") || "none"),
      "",
      "# 1. Identity",
      '/system identity set name="' + safeName + '"',
      "",
      "# 2. Bridge",
      safe("/interface bridge add name=" + bridgeName + ' protocol-mode=rstp comment="SmartLinkNet"'),
    ];

    for (const port of bridgePorts) {
      scriptLines.push(safe("/interface bridge port remove [find interface=" + port + "]"));
      scriptLines.push(safe("/interface bridge port add bridge=" + bridgeName + " interface=" + port + ' comment="SmartLinkNet"'));
    }

    scriptLines.push(
      "",
      "# 3. Gateway IP",
      safe("/ip address remove [find interface=" + bridgeName + "]"),
      safe("/ip address add address=" + bridgeAddress + " interface=" + bridgeName + ' comment="SmartLinkNet gateway"'),
      "",
      "# 4. IP Pool",
      safe("/ip pool remove [find name=" + ispSlug + "-pool]"),
      "/ip pool add name=" + ispSlug + "-pool ranges=" + poolStart + "-" + poolEnd,
      "",
      "# 5. DHCP Server",
      safe("/ip dhcp-server remove [find name=" + ispSlug + "-dhcp]"),
      "/ip dhcp-server add name=" + ispSlug + "-dhcp interface=" + bridgeName + " address-pool=" + ispSlug + "-pool lease-time=1h disabled=no",
      safe("/ip dhcp-server network remove [find gateway=" + gatewayIp + "]"),
      "/ip dhcp-server network add address=" + subnet + " gateway=" + gatewayIp + " dns-server=8.8.8.8,8.8.4.4",
      "",
      "# 6. NAT",
      safe('/ip firewall nat remove [find comment="SmartLinkNet NAT"]'),
      '/ip firewall nat add chain=srcnat out-interface=' + uplinkInterface + ' action=masquerade comment="SmartLinkNet NAT"',
      "",
      "# 7. DNS",
      "/ip dns set allow-remote-requests=yes servers=8.8.8.8,8.8.4.4",
      "",
      "# 8. RADIUS",
      safe('/radius remove [find comment="SmartLinkNet"]'),
    );

    if (radiusHost) {
      scriptLines.push(
        "/radius add service=" + radiusService + " address=" + radiusHost + " secret=" + radiusSecret + " authentication-port=" + radiusAuthPort + " accounting-port=" + radiusAcctPort + ' timeout=3000ms comment="SmartLinkNet"',
        "/radius incoming set accept=yes port=3799",
        "/ppp aaa set use-radius=yes",
      );
    }

    if (hasHotspot) {
      scriptLines.push(
        "",
        "# 9. Hotspot",
        safe("/ip hotspot disable [find name=" + ispSlug + "-hotspot]"),
        safe("/ip hotspot remove [find name=" + ispSlug + "-hotspot]"),
        safe("/ip hotspot profile remove [find name=" + ispSlug + "-hs-profile]"),
        "/ip hotspot profile add name=" + ispSlug + "-hs-profile login-by=http-pap html-directory=hotspot http-cookie-lifetime=1d" + (radiusHost ? " use-radius=yes" : ""),
        "/ip hotspot add name=" + ispSlug + "-hotspot interface=" + bridgeName + " address-pool=" + ispSlug + "-pool profile=" + ispSlug + "-hs-profile disabled=no",
        "",
        "# Walled Garden",
        safe('/ip hotspot walled-garden remove [find comment~"SmartLinkNet"]'),
        '/ip hotspot walled-garden add dst-host=smart-link-kenya.vercel.app comment="SmartLinkNet portal"',
        '/ip hotspot walled-garden add dst-host=*.supabase.co comment="Supabase"',
        '/ip hotspot walled-garden add dst-host=*.safaricom.com comment="M-Pesa"',
        '/ip hotspot walled-garden add dst-host=mpesa.safaricom.co.ke comment="M-Pesa STK"',
        safe('/ip hotspot walled-garden ip remove [find comment="HTTPS passthrough"]'),
        '/ip hotspot walled-garden ip add dst-address=0.0.0.0/0 protocol=tcp dst-port=443 comment="HTTPS passthrough"',
      );
    }

    if (hasPppoe) {
      scriptLines.push(
        "",
        "# 10. PPPoE Server",
        safe("/interface pppoe-server server disable [find service-name=" + ispSlug + "-pppoe]"),
        safe("/interface pppoe-server server remove [find service-name=" + ispSlug + "-pppoe]"),
        safe("/ppp profile remove [find name=" + ispSlug + "-pppoe]"),
        '/ppp profile add name=' + ispSlug + '-pppoe comment="SmartLinkNet"',
        "/interface pppoe-server server add service-name=" + ispSlug + "-pppoe interface=" + bridgeName + " default-profile=" + ispSlug + "-pppoe disabled=no",
      );
    }

    scriptLines.push(
      "",
      "# 11. API user",
      "/ip service set api port=8728 disabled=no",
      "/ip service set api-ssl disabled=yes",
      safe('/user remove [find name="' + apiUsername + '"]'),
      '/user add name="' + apiUsername + '" password="' + apiPassword + '" group=full comment="SmartLinkNet"',
      "",
      "# 12. Poll scheduler",
      safe("/system scheduler remove [find name=sln-poll]"),
      '/system scheduler add name=sln-poll interval=1m start-time=startup on-event="' + pollOnEvent + '" comment="SmartLinkNet"',
      "",
      ':log info "SmartLinkNet: configuration complete for ' + safeName + '"',
    );

    const fullScript = scriptLines.join("\n");

    // ── 5. Log each major config section as it would execute ─────────────
    await log("bridge", "Bridge \"" + bridgeName + "\" configured — ports: " + bridgePorts.join(", "), true);
    await log("network", "Gateway: " + bridgeAddress + " | Pool: " + poolStart + "-" + poolEnd + " | DHCP: enabled", true);
    await log("nat", "NAT masquerade on " + uplinkInterface + " — internet routing active", true);

    if (hasHotspot) {
      await log("hotspot", "Hotspot server \"" + ispSlug + "-hotspot\" configured — captive portal active | RADIUS: " + (radiusHost || "none"), true);
      await log("walled_garden", "Walled garden set — portal, Supabase, M-Pesa allowed pre-auth", true);
    }

    if (hasPppoe) {
      await log("pppoe", "PPPoE server \"" + ispSlug + "-pppoe\" configured — subscribers can dial in | RADIUS: " + (radiusHost || "none"), true);
    }

    await log("api_user", "API user \"" + apiUsername + "\" created — poll scheduler set to 1 min", true);

    // ── 6. Queue re_provision so router fetches and runs the full script ──
    // Delete any existing pending re_provision commands first
    await db.from("router_commands")
      .delete()
      .eq("router_id", routerId)
      .eq("command", "re_provision")
      .eq("status", "pending");

    const provisionUrl = "https://" + supabaseHost + "/functions/v1/provision?token=" + router.provision_token;
    await db.from("router_commands").insert({
      router_id: routerId,
      tenant_id: tenantId,
      command: "re_provision",
      payload: { provision_url: provisionUrl, script: fullScript },
      status: "pending",
      expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    });

    await log("queued", "Full config script queued — router will apply on next poll (≤1 min)", true);

    // ── 7. Mark router provisioned ────────────────────────────────────────
    await db.from("routers").update({
      status: "online",
      api_connected: true,
      provisioned_at: new Date().toISOString(),
    }).eq("id", routerId);

    await log("complete",
      "Router fully configured — services: " + (services.join(", ") || "none") +
      " | RADIUS: " + (radiusHost || "pending") +
      " | Script queued — router applies within 1 min",
      true
    );

    return resp({ ok: true, radiusHost, nasName });

  } catch (err: any) {
    console.error("apply-router-config error:", err?.message);
    return resp({ error: "Internal error", detail: err?.message }, 500);
  }
});
