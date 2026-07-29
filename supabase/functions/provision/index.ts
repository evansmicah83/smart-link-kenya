import { serve } from "https://deno.land/std@0.201.0/http/server.ts";
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

async function resolveHostToIp(hostname: string): Promise<string | null> {
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
  if (req.method !== "GET") return new Response("Method Not Allowed", { status: 405 });

  const url = new URL(req.url);
  const token = url.searchParams.get("token") || "";
  if (!token) return new Response(":log warning \"SLN: no token\"", { status: 400, headers: { "content-type": "text/plain" } });

  const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { global: { fetch } });

  const { data: router, error } = await db
    .from("routers")
    .select("id, name, tenant_id, bridge_port, bridge_ports, uplink_interface, services, subnet, provision_token_expires_at, api_username, api_password")
    .eq("provision_token", token)
    .maybeSingle();

  if (error || !router) {
    return new Response(":log warning \"SLN: token not found\"", { status: 410, headers: { "content-type": "text/plain" } });
  }

  // Extend token expiry
  await db.from("routers").update({
    status: "provisioning",
    provision_token_expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  }).eq("id", router.id);

  const { data: tenant } = await db.from("tenants").select("slug, name").eq("id", router.tenant_id).maybeSingle();

  const supabaseHost = new URL(SUPABASE_URL).host;
  const supabaseIp = await resolveHostToIp(supabaseHost);

  let { data: radiusServer } = await db
    .from("radius_servers")
    .select("id, host, auth_port, acct_port, shared_secret")
    .eq("tenant_id", router.tenant_id)
    .eq("is_active", true)
    .order("priority", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!radiusServer && supabaseIp) {
    const secret = Array.from(crypto.getRandomValues(new Uint8Array(16)))
      .map((b: number) => b.toString(16).padStart(2, "0")).join("");
    const { data: seeded } = await db.from("radius_servers").insert({
      tenant_id: router.tenant_id,
      name: "SmartLinkNet Cloud RADIUS",
      host: supabaseIp,
      auth_port: 1812, acct_port: 1813,
      shared_secret: secret,
      is_active: true, is_primary: true, is_healthy: true, priority: 1,
      auth_url: "https://" + supabaseHost + "/functions/v1/radius-auth",
      acct_url: "https://" + supabaseHost + "/functions/v1/radius-accounting",
    }).select("id, host, auth_port, acct_port, shared_secret").single();
    radiusServer = seeded;
  }

  const ispSlug = (tenant?.slug ?? router.tenant_id).replace(/[^a-z0-9]/g, "-").toLowerCase();
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

  const bridgePorts: string[] = router.bridge_ports?.length ? router.bridge_ports : [router.bridge_port || "ether2"];
  const uplinkInterface: string = router.uplink_interface || "ether1";
  const services: string[] = router.services || [];
  const hasHotspot = services.includes("hotspot");
  const hasPppoe = services.includes("pppoe");

  const radiusIp = radiusServer?.host && /^\d+\.\d+\.\d+\.\d+$/.test(radiusServer.host)
    ? radiusServer.host : supabaseIp;
  const radiusSecret = radiusServer?.shared_secret || "SmartLinkNet";
  const radiusAuthPort = radiusServer?.auth_port || 1812;
  const radiusAcctPort = radiusServer?.acct_port || 1813;
  const radiusService = hasHotspot && hasPppoe ? "hotspot,ppp" : hasHotspot ? "hotspot" : "ppp";

  const apiUsername = (router.api_username && router.api_username !== "admin") ? router.api_username : "sln-api";
  const apiPassword = router.api_password || Array.from(
    crypto.getRandomValues(new Uint8Array(16))
  ).map((b: number) => b.toString(16).padStart(2, "0")).join("");

  await db.from("routers").update({ api_username: apiUsername, api_password: apiPassword }).eq("id", router.id);

  const baseCallback = "https://" + supabaseHost + "/functions/v1/provision-callback?router_id=" + router.id;
  const pollUrl = "https://" + supabaseHost + "/functions/v1/router-poll?router_id=" + router.id + "&token=" + apiPassword;

  // cb() — inline fetch to provision-callback with a stage, fires after each section
  // RouterOS: /tool fetch with keep-result=no so it doesn't block
  const cb = (stage: string) =>
    ":do { /tool fetch mode=https url=\"" + baseCallback + "&stage=" + stage + "\" keep-result=no } on-error={}";

  const safe = (cmd: string) => ":do { " + cmd + " } on-error={}";

  // Poll script stored as named script — avoids all quoting issues in scheduler on-event
  const pollScriptBody = [
    ":do {",
    "/tool fetch mode=https url=\"" + pollUrl + "\" dst-path=sln-poll.txt keep-result=yes;",
    ":local u [/file get sln-poll.txt contents];",
    ":if ([:find $u \"https\"] = 0) do={",
    "/tool fetch mode=https url=$u dst-path=sln-reprovision.rsc;",
    ":delay 3s;",
    "/import sln-reprovision.rsc",
    "}",
    "} on-error={}",
  ].join(" ");

  const lines: string[] = [
    "# SmartLinkNet provisioning script",
    "# Router: " + safeName + " | Services: " + (services.join(", ") || "none"),
    "# Generated: " + new Date().toISOString(),
    "",
    "# 1. Identity",
    '/system identity set name="' + safeName + '"',
    cb("identity"),
    "",
    "# 2. Bridge",
    safe("/interface bridge add name=" + bridgeName + ' protocol-mode=rstp comment="SmartLinkNet"'),
  ];

  for (const port of bridgePorts) {
    lines.push(safe("/interface bridge port remove [find interface=" + port + "]"));
    lines.push(safe("/interface bridge port add bridge=" + bridgeName + " interface=" + port + ' comment="SmartLinkNet"'));
  }
  lines.push(cb("bridge"));

  lines.push(
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
    cb("network"),
    "",
    "# 6. NAT",
    safe('/ip firewall nat remove [find comment="SmartLinkNet NAT"]'),
    '/ip firewall nat add chain=srcnat out-interface=' + uplinkInterface + ' action=masquerade comment="SmartLinkNet NAT"',
    cb("nat"),
    "",
    "# 7. DNS",
    "/ip dns set allow-remote-requests=yes servers=8.8.8.8,8.8.4.4",
    "",
    "# 8. RADIUS",
    safe('/radius remove [find comment="SmartLinkNet"]'),
  );

  if (radiusIp) {
    lines.push(
      "/radius add service=" + radiusService + " address=" + radiusIp + " secret=" + radiusSecret + " authentication-port=" + radiusAuthPort + " accounting-port=" + radiusAcctPort + ' timeout=3000ms comment="SmartLinkNet"',
      "/radius incoming set accept=yes port=3799",
      "/ppp aaa set use-radius=yes",
      cb("radius"),
    );
  }

  if (hasHotspot) {
    lines.push(
      "",
      "# 9. Hotspot",
      safe("/ip hotspot disable [find name=" + ispSlug + "-hotspot]"),
      safe("/ip hotspot remove [find name=" + ispSlug + "-hotspot]"),
      safe("/ip hotspot profile remove [find name=" + ispSlug + "-hs-profile]"),
      "/ip hotspot profile add name=" + ispSlug + "-hs-profile login-by=http-pap html-directory=hotspot http-cookie-lifetime=1d" + (radiusIp ? " use-radius=yes" : ""),
      "/ip hotspot add name=" + ispSlug + "-hotspot interface=" + bridgeName + " address-pool=" + ispSlug + "-pool profile=" + ispSlug + "-hs-profile disabled=no",
      cb("hotspot"),
      "",
      "# Walled Garden",
      safe('/ip hotspot walled-garden remove [find comment~"SmartLinkNet"]'),
      safe('/ip hotspot walled-garden remove [find comment~"Supabase"]'),
      safe('/ip hotspot walled-garden remove [find comment~"M-Pesa"]'),
      '/ip hotspot walled-garden add dst-host=smart-link-kenya.vercel.app comment="SmartLinkNet portal"',
      '/ip hotspot walled-garden add dst-host=*.supabase.co comment="Supabase"',
      '/ip hotspot walled-garden add dst-host=*.safaricom.com comment="M-Pesa"',
      '/ip hotspot walled-garden add dst-host=mpesa.safaricom.co.ke comment="M-Pesa STK"',
      safe('/ip hotspot walled-garden ip remove [find comment="HTTPS passthrough"]'),
      '/ip hotspot walled-garden ip add dst-address=0.0.0.0/0 protocol=tcp dst-port=443 comment="HTTPS passthrough"',
      cb("walled_garden"),
    );
  }

  if (hasPppoe) {
    lines.push(
      "",
      "# 10. PPPoE Server",
      safe("/interface pppoe-server server disable [find service-name=" + ispSlug + "-pppoe]"),
      safe("/interface pppoe-server server remove [find service-name=" + ispSlug + "-pppoe]"),
      safe("/ppp profile remove [find name=" + ispSlug + "-pppoe]"),
      '/ppp profile add name=' + ispSlug + '-pppoe comment="SmartLinkNet"',
      "/interface pppoe-server server add service-name=" + ispSlug + "-pppoe interface=" + bridgeName + " default-profile=" + ispSlug + "-pppoe disabled=no",
      cb("pppoe"),
    );
  }

  lines.push(
    "",
    "# 11. API user",
    "/ip service set api port=8728 disabled=no",
    "/ip service set api-ssl disabled=yes",
    safe('/user remove [find name="' + apiUsername + '"]'),
    '/user add name="' + apiUsername + '" password="' + apiPassword + '" group=full comment="SmartLinkNet"',
    cb("api_user"),
    "",
    "# 12. Poll script + scheduler",
    safe("/system script remove [find name=sln-poll-script]"),
    "/system script add name=sln-poll-script source=" + JSON.stringify(pollScriptBody) + ' comment="SmartLinkNet"',
    safe("/system scheduler remove [find name=sln-poll]"),
    '/system scheduler add name=sln-poll interval=1m start-time=startup on-event=sln-poll-script comment="SmartLinkNet"',
    cb("scheduler"),
    "",
    "# 13. Done — report complete to cloud",
    cb("complete"),
    ':log info "SmartLinkNet: provisioning complete for ' + safeName + '"',
  );

  const script = lines.join("\n");
  return new Response(script, { status: 200, headers: { "content-type": "text/plain" } });
});
