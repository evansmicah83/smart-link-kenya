import { serve } from "https://deno.land/std@0.201.0/http/server.ts";
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const APP_URL = Deno.env.get("APP_URL") || "https://smart-link-kenya.vercel.app";

// Resolve a hostname to its first IPv4 address using Deno's DNS
async function resolveHostToIp(hostname: string): Promise<string | null> {
  try {
    const records = await Deno.resolveDns(hostname, "A");
    return records?.[0] ?? null;
  } catch {
    return null;
  }
}

serve(async (req: Request) => {
  if (req.method !== "GET") return new Response("Method Not Allowed", { status: 405 });

  const url = new URL(req.url);
  const token = url.searchParams.get("token") || "";
  if (!token) return new Response(':log warning "SmartLinkNet: no token"', { status: 400, headers: { "content-type": "text/plain" } });

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { global: { fetch } });

  const { data: router, error } = await supabase
    .from("routers")
    .select("id, name, tenant_id, bridge_port, bridge_ports, uplink_interface, services, mode, subnet, provision_token_expires_at, api_username, api_password")
    .eq("provision_token", token)
    .maybeSingle();

  if (error || !router) {
    return new Response(':log warning "SmartLinkNet: token not found"', { status: 410, headers: { "content-type": "text/plain" } });
  }

  const expires = router.provision_token_expires_at ? new Date(router.provision_token_expires_at) : null;
  if (expires && expires < new Date()) {
    await supabase.from("routers").update({
      provision_token_expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    }).eq("id", router.id);
  }

  await supabase.from("routers").update({ status: "provisioning" }).eq("id", router.id);

  const { data: tenant } = await supabase
    .from("tenants").select("slug, name").eq("id", router.tenant_id).maybeSingle();

  // --- RADIUS: auto-seed system RADIUS server for tenant if missing ---
  const supabaseHost = new URL(SUPABASE_URL).host;
  const radiusAuthUrl = "https://" + supabaseHost + "/functions/v1/radius-auth";
  const radiusAcctUrl = "https://" + supabaseHost + "/functions/v1/radius-accounting";

  // Resolve Supabase host to IP (RouterOS radius add address= requires IP)
  const supabaseIp = await resolveHostToIp(supabaseHost);

  let { data: radiusServer } = await supabase
    .from("radius_servers")
    .select("id, host, auth_port, acct_port, shared_secret")
    .eq("tenant_id", router.tenant_id)
    .eq("is_active", true)
    .order("priority", { ascending: true })
    .limit(1)
    .maybeSingle();

  // Auto-seed system RADIUS server if none exists for this tenant
  if (!radiusServer && supabaseIp) {
    const sharedSecret = Array.from(
      crypto.getRandomValues(new Uint8Array(16))
    ).map((b: number) => b.toString(16).padStart(2, "0")).join("");

    const { data: seeded } = await supabase.from("radius_servers").insert({
      tenant_id: router.tenant_id,
      name: "SmartLinkNet Cloud RADIUS",
      host: supabaseIp,
      auth_port: 443,
      acct_port: 443,
      shared_secret: sharedSecret,
      is_active: true,
      is_primary: true,
      is_healthy: true,
      priority: 1,
      auth_url: radiusAuthUrl,
      acct_url: radiusAcctUrl,
    }).select("id, host, auth_port, acct_port, shared_secret").single();

    radiusServer = seeded;
  }

  const ispSlug = tenant?.slug ?? router.tenant_id;
  const safeName = (router.name || "MikroTik").replace(/"/g, '\\"');
  const companySlug = ispSlug.replace(/[^a-z0-9]/g, "-").toLowerCase();
  const bridgeName = companySlug + "-bridge";

  const subnet = router.subnet || "172.31.0.0/16";
  const [networkAddr, prefixLen] = subnet.split("/");
  const parts = networkAddr.split(".").map(Number);
  parts[3] = 1;
  const gatewayIp = parts.join(".");
  const bridgeAddress = gatewayIp + "/" + prefixLen;
  const poolStart = parts[0] + "." + parts[1] + "." + parts[2] + ".10";
  const poolEnd = parts[0] + "." + parts[1] + "." + parts[2] + ".254";

  const bridgePorts: string[] = router.bridge_ports?.length
    ? router.bridge_ports
    : [router.bridge_port || "ether2"];

  const uplinkInterface: string = router.uplink_interface || "ether1";

  const services: string[] = router.services || [];
  const hasHotspot = services.includes("hotspot");
  const hasPppoe = services.includes("pppoe");

  // Validate RADIUS host is an IP (RouterOS requirement)
  const radiusIp = radiusServer?.host && /^\d+\.\d+\.\d+\.\d+$/.test(radiusServer.host)
    ? radiusServer.host
    : supabaseIp;
  const radiusSecret = radiusServer?.shared_secret || "SmartLinkNet";
  const radiusAuthPort = radiusServer?.auth_port || 1812;
  const radiusAcctPort = radiusServer?.acct_port || 1813;
  const radiusService = hasHotspot && hasPppoe ? "hotspot,ppp" : hasHotspot ? "hotspot" : "ppp";
  const hasRadius = !!radiusIp;

  const apiUsername = (router.api_username && router.api_username !== "admin") ? router.api_username : "sln-api";
  const apiPassword = router.api_password || Array.from(
    crypto.getRandomValues(new Uint8Array(16))
  ).map((b: number) => b.toString(16).padStart(2, "0")).join("");

  await supabase.from("routers").update({ api_username: apiUsername, api_password: apiPassword }).eq("id", router.id);

  const callbackUrl = "https://" + supabaseHost + "/functions/v1/provision-callback?router_id=" + router.id + "&stage=complete";
  const pollUrl = "https://" + supabaseHost + "/functions/v1/router-poll?router_id=" + router.id + "&token=" + apiPassword;
  const heartbeatUrl = APP_URL + "/api/heartbeat?router=" + router.id;

  const safe = (cmd: string) => ":do { " + cmd + " } on-error={}";

  const pollOnEvent = ":do { /tool fetch mode=https url='" + pollUrl + "' http-method=post http-data='{}' dst-path=sln-poll.json keep-result=yes } on-error={}";
  const heartbeatOnEvent = ":do { /tool fetch mode=https url='" + heartbeatUrl + "' keep-result=no } on-error={}";

const lines: string[] = [
    "# SmartLinkNet -- Auto-provisioning script",
    "# Router: " + safeName + " | Tenant: " + (tenant?.name ?? ispSlug),
    "# Generated: " + new Date().toISOString(),
    "# Services: " + (services.join(", ") || "none") + " | Uplink: " + uplinkInterface,
    "",
    "# 1. Identity",
    '/system identity set name="' + safeName + '"',
    "",
    "# 2. Bridge",
    safe("/interface bridge add name=" + bridgeName + ' protocol-mode=rstp comment="SmartLinkNet"'),
  ];

  for (const port of bridgePorts) {
    lines.push(safe("/interface bridge port remove [find interface=" + port + "]"));
    lines.push(safe("/interface bridge port add bridge=" + bridgeName + " interface=" + port + ' comment="SmartLinkNet"'));
  }

  lines.push(
    "",
    "# 3. Gateway IP on bridge",
    safe("/ip address remove [find interface=" + bridgeName + "]"),
    safe("/ip address add address=" + bridgeAddress + " interface=" + bridgeName + ' comment="SmartLinkNet gateway"'),
    "",
    "# 4. IP Pool",
    safe("/ip pool remove [find name=" + companySlug + "-pool]"),
    "/ip pool add name=" + companySlug + "-pool ranges=" + poolStart + "-" + poolEnd,
    "",
    "# 5. DHCP Server",
    safe("/ip dhcp-server remove [find name=" + companySlug + "-dhcp]"),
    "/ip dhcp-server add name=" + companySlug + "-dhcp interface=" + bridgeName + " address-pool=" + companySlug + "-pool lease-time=1h disabled=no",
    safe("/ip dhcp-server network remove [find gateway=" + gatewayIp + "]"),
    "/ip dhcp-server network add address=" + subnet + " gateway=" + gatewayIp + " dns-server=8.8.8.8,8.8.4.4",
    "",
    "# 6. NAT masquerade on uplink",
    safe('/ip firewall nat remove [find comment="SmartLinkNet NAT"]'),
    "/ip firewall nat add chain=srcnat out-interface=" + uplinkInterface + ' action=masquerade comment="SmartLinkNet NAT"',
    "",
    "# 7. DNS",
    "/ip dns set allow-remote-requests=yes servers=8.8.8.8,8.8.4.4",
    "",
    "# 8. RADIUS -- SmartLinkNet Cloud AAA",
    safe('/radius remove [find comment="SmartLinkNet"]'),
  );

  if (hasRadius) {
    lines.push(
      "/radius add service=" + radiusService + " address=" + radiusIp + " secret=" + radiusSecret + " authentication-port=" + radiusAuthPort + " accounting-port=" + radiusAcctPort + ' timeout=3000ms comment="SmartLinkNet"',
      "/radius incoming set accept=yes port=3799",
      "/ppp aaa set use-radius=yes",
    );
  } else {
    lines.push("# RADIUS IP could not be resolved at provisioning time -- will be configured by cloud command");
  }

  if (hasHotspot) {
    lines.push(
      "",
      "# 9. Hotspot",
      safe("/ip hotspot disable [find name=" + companySlug + "-hotspot]"),
      safe("/ip hotspot remove [find name=" + companySlug + "-hotspot]"),
      safe("/ip hotspot profile remove [find name=" + companySlug + "-hs-profile]"),
      "/ip hotspot profile add name=" + companySlug + "-hs-profile login-by=http-pap html-directory=hotspot http-cookie-lifetime=1d" + (hasRadius ? " use-radius=yes" : ""),
      "/ip hotspot add name=" + companySlug + "-hotspot interface=" + bridgeName + " address-pool=" + companySlug + "-pool profile=" + companySlug + "-hs-profile disabled=no",
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
    );
  }

  if (hasPppoe) {
    lines.push(
      "",
      "# 10. PPPoE Server",
      safe("/interface pppoe-server server disable [find name=" + companySlug + "-pppoe]"),
      safe("/interface pppoe-server server remove [find name=" + companySlug + "-pppoe]"),
      safe("/ppp profile remove [find name=" + companySlug + "-pppoe]"),
      '/ppp profile add name=' + companySlug + '-pppoe comment="SmartLinkNet"',
      "/interface pppoe-server server add name=" + companySlug + "-pppoe interface=" + bridgeName + " default-profile=" + companySlug + "-pppoe disabled=no",
    );
  }

  lines.push(
    "",
    "# 11. API user and port",
    "/ip service set api port=8728 disabled=no",
    "/ip service set api-ssl disabled=yes",
    safe('/user remove [find name="' + apiUsername + '"]'),
    '/user add name="' + apiUsername + '" password="' + apiPassword + '" group=full comment="SmartLinkNet"',
    "",
    "# 12. Poll scheduler -- NAT-safe pull model",
    safe("/system scheduler remove [find name=sln-poll]"),
    '/system scheduler add name=sln-poll interval=1m start-time=startup on-event="' + pollOnEvent + '" comment="SmartLinkNet"',
    "",
    "# 13. Heartbeat scheduler",
    safe("/system scheduler remove [find name=sln-heartbeat]"),
    '/system scheduler add name=sln-heartbeat interval=5m start-time=startup on-event="' + heartbeatOnEvent + '" comment="SmartLinkNet"',
    "",
    "# 14. Report provisioning complete",
    safe('/tool fetch mode=https url="' + callbackUrl + '" keep-result=no'),
    ':log info "SmartLinkNet: provisioning complete for ' + safeName + '"',
  );

  const script = lines.join("\n");
  return new Response(script, { status: 200, headers: { "content-type": "text/plain" } });
});
