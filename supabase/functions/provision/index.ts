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
  const isRollback = url.searchParams.get("rollback") === "1";
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

  // Rollback: return a script that restores the pre-provision backup
  if (isRollback) {
    const supabaseHost = new URL(SUPABASE_URL).host;
    const baseCallback = "https://" + supabaseHost + "/functions/v1/provision-callback?router_id=" + router.id;
    const rollbackScript = [
      "# SmartLinkNet Rollback Script",
      "# Restores sln-pre-provision backup and reports rollback stage",
      ":do { /system backup load name=sln-pre-provision } on-error={ :log error \"SLN: rollback backup not found\" };",
      ":do { /tool fetch mode=https url=\"" + baseCallback + "&stage=rollback\" keep-result=no } on-error={};",
    ].join("\n");
    return new Response(rollbackScript, { status: 200, headers: { "content-type": "text/plain" } });
  }

  await db.from("routers").update({
    status: "provisioning",
    provision_token_expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  }).eq("id", router.id);

  const { data: tenant } = await db.from("tenants").select("slug, name").eq("id", router.tenant_id).maybeSingle();

  const supabaseHost = new URL(SUPABASE_URL).host;
  const supabaseIp = await resolveHostToIp(supabaseHost);

  // Fetch primary + secondary RADIUS servers (FreeRADIUS VPS IPs)
  const { data: radiusServers } = await db
    .from("radius_servers")
    .select("id, host, freeradius_ip, freeradius_ip2, auth_port, acct_port, shared_secret, coa_port, interim_interval, priority")
    .eq("tenant_id", router.tenant_id)
    .eq("is_active", true)
    .order("priority", { ascending: true })
    .limit(2);

  let radiusServer = radiusServers?.[0] ?? null;
  const radiusServer2 = radiusServers?.[1] ?? null;

  if (!radiusServer) {
    const secret = Array.from(crypto.getRandomValues(new Uint8Array(16)))
      .map((b: number) => b.toString(16).padStart(2, "0")).join("");
    const { data: seeded } = await db.from("radius_servers").insert({
      tenant_id: router.tenant_id,
      name: "SmartLinkNet FreeRADIUS",
      host: supabaseIp || "pending",
      freeradius_ip: null,   // ISP must set this after running setup.sh
      auth_port: 1812, acct_port: 1813, coa_port: 3799,
      shared_secret: secret,
      is_active: true, is_primary: true, is_healthy: true, priority: 1,
      interim_interval: 300,
    }).select("id, host, freeradius_ip, freeradius_ip2, auth_port, acct_port, shared_secret, coa_port, interim_interval").single();
    radiusServer = seeded;
  }

  // â”€â”€ Derived config â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const ispSlug = (tenant?.slug ?? router.tenant_id).replace(/[^a-z0-9]/g, "-").toLowerCase();
  const safeName = (router.name || "MikroTik").replace(/"/g, '\\"');
  const bridgeName = ispSlug + "-bridge";
  const portalDomain = "smart-link-kenya.vercel.app";

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

  // Use freeradius_ip (actual VPS IP) if set, otherwise fall back to host.
  // Use a literal regex â€” not a variable â€” to avoid ReDoS (CWE-185).
  const IPV4_RE = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;
  const radiusIp = radiusServer?.freeradius_ip ||
    (radiusServer?.host && IPV4_RE.test(radiusServer.host) ? radiusServer.host : null);
  const radiusIp2 = radiusServer2?.freeradius_ip ||
    radiusServer?.freeradius_ip2 ||
    (radiusServer2?.host && IPV4_RE.test(radiusServer2.host) ? radiusServer2.host : null);
  const radiusSecret  = radiusServer?.shared_secret || "SmartLinkNet";
  const radiusSecret2 = radiusServer2?.shared_secret || radiusSecret;
  const radiusAuthPort  = radiusServer?.auth_port  || 1812;
  const radiusAcctPort  = radiusServer?.acct_port  || 1813;
  const interimInterval = radiusServer?.interim_interval || 300;
  const radiusService = hasHotspot && hasPppoe ? "hotspot,ppp" : hasHotspot ? "hotspot" : "ppp";

  const apiUsername = (router.api_username && router.api_username !== "admin") ? router.api_username : "sln-api";
  const apiPassword = router.api_password || Array.from(
    crypto.getRandomValues(new Uint8Array(16))
  ).map((b: number) => b.toString(16).padStart(2, "0")).join("");

  await db.from("routers").update({ api_username: apiUsername, api_password: apiPassword }).eq("id", router.id);

  const baseCallback = "https://" + supabaseHost + "/functions/v1/provision-callback?router_id=" + router.id;
  const pollUrl = "https://" + supabaseHost + "/functions/v1/router-poll?router_id=" + router.id + "&token=" + apiPassword;
  const telemetryUrl = "https://" + supabaseHost + "/functions/v1/router-poll?router_id=" + router.id + "&token=" + apiPassword + "&telemetry=1";
  const discoverUrl = "https://" + supabaseHost + "/functions/v1/router-poll?router_id=" + router.id + "&token=" + apiPassword + "&discover=1";

  // cb() â€” fire-and-forget stage callback to cloud
  const cb = (stage: string) =>
    ":do { /tool fetch mode=https url=\"" + baseCallback + "&stage=" + stage + "\" keep-result=no } on-error={}";

  // safe() â€” wrap any command so a failure doesn't abort the script
  const safe = (cmd: string) => ":do { " + cmd + " } on-error={}";

  // retry() â€” attempt a command up to 3 times with 2s delay, using a unique counter per call
  let retryCounter = 0;
  const retry = (cmd: string) => {
    const n = retryCounter++;
    return [
      ":local slnR" + n + " 0;",
      ":local slnOk" + n + " false;",
      ":while ($slnR" + n + " < 3 && !$slnOk" + n + ") do={",
      "  :do { " + cmd + "; :set slnOk" + n + " true } on-error={ :set slnR" + n + " ($slnR" + n + " + 1); :delay 2s };",
      "}",
    ].join(" ");
  };

  // â”€â”€ Telemetry script: CPU, RAM, uptime, sessions, traffic, RADIUS connectivity â”€â”€
  const telemetryScriptBody = [
    ":local cpu [/system resource get cpu-load];",
    ":local freemem [/system resource get free-memory];",
    ":local totalmem [/system resource get total-memory];",
    ":local uptime [/system resource get uptime];",
    ":local version [/system resource get version];",
    ":local board [/system resource get board-name];",
    ":local hsUsers 0;",
    ":local pppUsers 0;",
    ":local dhcpLeases 0;",
    ":local rxBytes 0;",
    ":local txBytes 0;",
    // RADIUS connectivity: check if RADIUS server is marked active/healthy in RouterOS
    ":local radiusOk 0;",
    ":do { :if ([:len [/radius find]] > 0) do={ :set radiusOk 1 } } on-error={};",
    hasHotspot ? ":do { :set hsUsers [:len [/ip hotspot active print count-only]] } on-error={};" : "",
    hasPppoe ? ":do { :set pppUsers [:len [/ppp active print count-only]] } on-error={};" : "",
    ":do { :set dhcpLeases [:len [/ip dhcp-server lease print count-only]] } on-error={};",
    ":do { :set rxBytes [/interface get " + uplinkInterface + " rx-byte] } on-error={};",
    ":do { :set txBytes [/interface get " + uplinkInterface + " tx-byte] } on-error={};",
    ":local qstr (\"cpu=\" . $cpu . \"&mem=\" . $freemem . \"&totalmem=\" . $totalmem . \"&uptime=\" . $uptime . \"&version=\" . $version . \"&board=\" . $board . \"&hs=\" . $hsUsers . \"&ppp=\" . $pppUsers . \"&leases=\" . $dhcpLeases . \"&rx=\" . $rxBytes . \"&tx=\" . $txBytes . \"&radius=\" . $radiusOk);",
    ":do { /tool fetch mode=https url=(\"" + telemetryUrl + "&\" . $qstr) keep-result=no } on-error={};",
  ].filter(Boolean).join(" ");

  // â”€â”€ Discovery script: reports ALL existing config â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const discoveryScriptBody = [
    // Interfaces
    ":local ifList \"\";",
    ":foreach i in=[/interface find] do={",
    "  :local n [/interface get $i name];",
    "  :local t [/interface get $i type];",
    "  :local r [/interface get $i running];",
    "  :set ifList ($ifList . $n . \":\" . $t . \":\" . [:tostr $r] . \",\");",
    "};",
    // Bridges
    ":local brList \"\";",
    ":foreach b in=[/interface bridge find] do={",
    "  :set brList ($brList . [/interface bridge get $b name] . \",\");",
    "};",
    // DHCP servers
    ":local dhcpList \"\";",
    ":foreach d in=[/ip dhcp-server find] do={",
    "  :set dhcpList ($dhcpList . [/ip dhcp-server get $d name] . \",\");",
    "};",
    // IP pools
    ":local poolList \"\";",
    ":foreach p in=[/ip pool find] do={",
    "  :set poolList ($poolList . [/ip pool get $p name] . \",\");",
    "};",
    // Hotspot servers
    ":local hsList \"\";",
    ":do { :foreach h in=[/ip hotspot find] do={ :set hsList ($hsList . [/ip hotspot get $h name] . \",\") } } on-error={};",
    // PPPoE servers
    ":local pppoeList \"\";",
    ":do { :foreach s in=[/interface pppoe-server server find] do={ :set pppoeList ($pppoeList . [/interface pppoe-server server get $s service-name] . \",\") } } on-error={};",
    // NAT rules count
    ":local natCount 0;",
    ":do { :set natCount [:len [/ip firewall nat find]] } on-error={};",
    // Firewall filter rules count
    ":local fwCount 0;",
    ":do { :set fwCount [:len [/ip firewall filter find]] } on-error={};",
    // DNS servers
    ":local dnsServers \"\";",
    ":do { :set dnsServers [/ip dns get servers] } on-error={};",
    // RADIUS servers count
    ":local radiusCount 0;",
    ":do { :set radiusCount [:len [/radius find]] } on-error={};",
    // Queue count
    ":local queueCount 0;",
    ":do { :set queueCount [:len [/queue simple find]] } on-error={};",
    // Default route / WAN gateway
    ":local wanIf \"\";",
    ":do { :set wanIf [/ip route get [find dst-address=0.0.0.0/0] gateway] } on-error={};",
    // Routes count
    ":local routeCount 0;",
    ":do { :set routeCount [:len [/ip route find]] } on-error={};",
    ":local qstr (\"interfaces=\" . $ifList . \"&bridges=\" . $brList . \"&dhcp=\" . $dhcpList . \"&pools=\" . $poolList . \"&hotspot=\" . $hsList . \"&pppoe=\" . $pppoeList . \"&nat=\" . $natCount . \"&fw=\" . $fwCount . \"&dns=\" . $dnsServers . \"&radius=\" . $radiusCount . \"&queues=\" . $queueCount . \"&routes=\" . $routeCount . \"&wan=\" . $wanIf);",
    ":do { /tool fetch mode=https url=(\"" + discoverUrl + "&\" . $qstr) keep-result=no } on-error={};",
  ].join(" ");

  // â”€â”€ Re-provision poll script â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const pollScriptBody = [
    ":do {",
    "/tool fetch mode=https url=\"" + pollUrl + "\" dst-path=sln-poll.txt keep-result=yes;",
    ":local u [/file get sln-poll.txt contents];",
    // If response is a URL â†’ download and import full reprovision script
    ":if ([:find $u \"https\"] = 0) do={",
    "/tool fetch mode=https url=$u dst-path=sln-reprovision.rsc;",
    ":delay 3s;",
    "/import sln-reprovision.rsc",
    // If response is an inline script (patch_radius, etc.) â†’ write and import directly
    "} else={ :if ([:len $u] > 3) do={",
    "/file set sln-poll.txt contents=$u;",
    "/import sln-poll.txt",
    "} }",
    "} on-error={}",
  ].join(" ");

  // â”€â”€ Verification script: checks each configured service is running â”€â”€â”€â”€â”€â”€â”€â”€
  const verifyLines: string[] = [
    ":local slnErrors \"\";",
    // Verify bridge exists
    ":do { /interface bridge get [find name=" + bridgeName + "] name } on-error={ :set slnErrors ($slnErrors . \"bridge-missing,\") };",
    // Verify gateway IP
    ":do { /ip address get [find address~\"" + gatewayIp + "\"] address } on-error={ :set slnErrors ($slnErrors . \"gateway-missing,\") };",
    // Verify DHCP server
    ":do { /ip dhcp-server get [find name=" + ispSlug + "-dhcp] name } on-error={ :set slnErrors ($slnErrors . \"dhcp-missing,\") };",
    // Verify NAT
    ":do { /ip firewall nat get [find comment=\"SmartLinkNet NAT\"] chain } on-error={ :set slnErrors ($slnErrors . \"nat-missing,\") };",
  ];
  verifyLines.push(":do { /radius get [find comment=\"SmartLinkNet-Primary\"] address } on-error={ :set slnErrors ($slnErrors . \"radius-missing,\") };");
  if (hasHotspot) {
    verifyLines.push(":do { /ip hotspot get [find name=" + ispSlug + "-hotspot] name } on-error={ :set slnErrors ($slnErrors . \"hotspot-missing,\") };");
  }
  if (hasPppoe) {
    verifyLines.push(":do { /interface pppoe-server server get [find service-name=" + ispSlug + "-pppoe] service-name } on-error={ :set slnErrors ($slnErrors . \"pppoe-missing,\") };");
  }
  verifyLines.push(
    ":if ($slnErrors = \"\") do={",
    "  " + cb("verify_ok"),
    "} else={",
    "  :do { /tool fetch mode=https url=\"" + baseCallback + "&stage=verify_fail&errors=\" . $slnErrors keep-result=no } on-error={}",
    "}",
  );
  const verifyScriptBody = verifyLines.join(" ");

  // â”€â”€ Main provisioning script â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const lines: string[] = [
    "# SmartLinkNet Enterprise Provisioning Script",
    "# Router: " + safeName + " | Services: " + (services.join(", ") || "none"),
    "# Generated: " + new Date().toISOString(),
    "",
    "# â”€â”€ PHASE 0: Discover existing config â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€",
    cb("queued"),
    cb("connect"),
    safe("/system script remove [find name=sln-discover]"),
    "/system script add name=sln-discover source=" + JSON.stringify(discoveryScriptBody) + ' comment="SmartLinkNet"',
    safe("/system script run sln-discover"),
    cb("discover"),
    "",
    "# â”€â”€ PHASE 1: Validate pre-conditions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€",
    // Validate uplink has connectivity before touching anything
    ":local slnValid true;",
    ":do { /tool fetch mode=https url=\"https://cloudflare-dns.com\" keep-result=no } on-error={ :set slnValid false };",
    ":if (!$slnValid) do={",
    "  " + cb("validate_fail"),
    "  :error \"SLN: no internet on uplink â€” aborting provisioning\"",
    "}",
    cb("validate"),
    "",
    "# â”€â”€ PHASE 2: Backup existing config â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€",
    safe("/system backup save name=sln-pre-provision"),
    cb("backup"),
    "",
    "# â”€â”€ PHASE 3: Identity â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€",
    '/system identity set name="' + safeName + '"',
    cb("identity"),
    "",
    "# â”€â”€ PHASE 4: Bridge (dependency: none) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€",
    safe("/interface bridge remove [find name=" + bridgeName + "]"),
    retry("/interface bridge add name=" + bridgeName + ' protocol-mode=rstp comment="SmartLinkNet"'),
  ];

  for (const port of bridgePorts) {
    lines.push(safe("/interface bridge port remove [find interface=" + port + "]"));
    lines.push(retry("/interface bridge port add bridge=" + bridgeName + " interface=" + port + ' comment="SmartLinkNet"'));
  }
  lines.push(cb("bridge"));

  lines.push(
    "",
    "# â”€â”€ PHASE 5: IP addressing (dependency: bridge) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€",
    safe("/ip address remove [find interface=" + bridgeName + "]"),
    retry("/ip address add address=" + bridgeAddress + " interface=" + bridgeName + ' comment="SmartLinkNet gateway"'),
    "",
    "# â”€â”€ PHASE 6: IP Pool (dependency: none) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€",
    safe("/ip pool remove [find name=" + ispSlug + "-pool]"),
    retry("/ip pool add name=" + ispSlug + "-pool ranges=" + poolStart + "-" + poolEnd),
    cb("pool"),
    "",
    "# â”€â”€ PHASE 7: DHCP Server (dependency: bridge, pool, IP) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€",
    safe("/ip dhcp-server remove [find name=" + ispSlug + "-dhcp]"),
    retry("/ip dhcp-server add name=" + ispSlug + "-dhcp interface=" + bridgeName + " address-pool=" + ispSlug + "-pool lease-time=1h disabled=no"),
    safe("/ip dhcp-server network remove [find gateway=" + gatewayIp + "]"),
    retry("/ip dhcp-server network add address=" + subnet + " gateway=" + gatewayIp + " dns-server=8.8.8.8,8.8.4.4"),
    cb("addresses"),
    "",
    "# â”€â”€ PHASE 8: DNS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€",
    "/ip dns set allow-remote-requests=yes servers=8.8.8.8,8.8.4.4",
    cb("dns"),
    "",
    "# â”€â”€ PHASE 9: Firewall (dependency: bridge, uplink) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€",
    safe('/ip firewall filter remove [find comment~"SmartLinkNet"]'),
    // INPUT chain
    '/ip firewall filter add chain=input connection-state=established,related action=accept comment="SmartLinkNet: accept established"',
    '/ip firewall filter add chain=input connection-state=invalid action=drop comment="SmartLinkNet: drop invalid"',
    '/ip firewall filter add chain=input protocol=icmp action=accept comment="SmartLinkNet: accept ICMP"',
    '/ip firewall filter add chain=input in-interface=' + bridgeName + ' protocol=tcp dst-port=8728 action=accept comment="SmartLinkNet: API from LAN"',
    '/ip firewall filter add chain=input in-interface=' + uplinkInterface + ' action=drop comment="SmartLinkNet: drop WAN input"',
    // FORWARD chain
    '/ip firewall filter add chain=forward connection-state=established,related action=accept comment="SmartLinkNet: forward established"',
    '/ip firewall filter add chain=forward connection-state=invalid action=drop comment="SmartLinkNet: drop invalid forward"',
    '/ip firewall filter add chain=forward in-interface=' + bridgeName + ' out-interface=' + uplinkInterface + ' action=accept comment="SmartLinkNet: LAN to WAN"',
    cb("firewall"),
    "",
    "# â”€â”€ PHASE 10: NAT (dependency: uplink) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€",
    safe('/ip firewall nat remove [find comment="SmartLinkNet NAT"]'),
    retry('/ip firewall nat add chain=srcnat out-interface=' + uplinkInterface + ' action=masquerade comment="SmartLinkNet NAT"'),
    cb("nat"),
    "",
    "# â”€â”€ PHASE 11: RADIUS (dependency: internet) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€",
    safe('/radius remove [find comment~"SmartLinkNet"]'),
  );

  // Always write RADIUS â€” use real IP when available, 0.0.0.0 placeholder when not.
  const effectiveRadiusIp = radiusIp || "0.0.0.0";
  const effectiveRadiusIp2 = radiusIp2 || null;
  lines.push(
    retry("/radius add service=" + radiusService +
      " address=" + effectiveRadiusIp +
      " secret=\"" + radiusSecret + "\"" +
      " authentication-port=" + radiusAuthPort +
      " accounting-port=" + radiusAcctPort +
      " timeout=3000" +
      " accounting-backup=no" +
      ' comment="SmartLinkNet-Primary"'),
  );
  if (effectiveRadiusIp2) {
    lines.push(
      retry("/radius add service=" + radiusService +
        " address=" + effectiveRadiusIp2 +
        " secret=\"" + radiusSecret2 + "\"" +
        " authentication-port=" + radiusAuthPort +
        " accounting-port=" + radiusAcctPort +
        " timeout=3000" +
        " accounting-backup=yes" +
        ' comment="SmartLinkNet-Secondary"'),
    );
  }
  lines.push(
    "/radius incoming set accept=yes port=3799",
    "/ppp aaa set use-radius=yes accounting=yes interim-update=" + interimInterval + "s",
    cb("radius"),
  );

  // -- PPPoE (dependency: bridge, pool, RADIUS)
  if (hasPppoe) {
    lines.push(
      "",
      "# -- PHASE 12: PPPoE",
      safe("/interface pppoe-server server disable [find service-name=" + ispSlug + "-pppoe]"),
      safe("/interface pppoe-server server remove [find service-name=" + ispSlug + "-pppoe]"),
      safe("/ppp profile remove [find name=" + ispSlug + "-pppoe]"),
      retry("/ppp profile add name=" + ispSlug + "-pppoe" +
        " local-address=" + gatewayIp +
        " dns-server=8.8.8.8,8.8.4.4" +
        " use-compression=no" +
        " use-encryption=no" +
        ' comment="SmartLinkNet"'),
      retry("/interface pppoe-server server add service-name=" + ispSlug + "-pppoe interface=" + bridgeName + " default-profile=" + ispSlug + "-pppoe one-session-per-host=yes disabled=no"),
      cb("pppoe-aaa"),
    );
  }

  // -- Hotspot (dependency: bridge, pool, RADIUS)
  if (hasHotspot) {
    lines.push(
      "",
      "# -- PHASE 13: Hotspot",
      safe("/ip hotspot disable [find name=" + ispSlug + "-hotspot]"),
      safe("/ip hotspot remove [find name=" + ispSlug + "-hotspot]"),
      safe("/ip hotspot profile remove [find name=" + ispSlug + "-hs-profile]"),
      retry("/ip hotspot profile add name=" + ispSlug + "-hs-profile" +
        " login-by=http-pap" +
        " html-directory=hotspot" +
        " http-cookie-lifetime=1d" +
        " use-radius=yes" +
        " radius-accounting=yes" +
        ' comment="SmartLinkNet"'),
      safe("/ip hotspot profile set [find name=" + ispSlug + "-hs-profile] login-page=\"https://" + portalDomain + "/portal\""),
      retry("/ip hotspot add name=" + ispSlug + "-hotspot interface=" + bridgeName + " address-pool=" + ispSlug + "-pool profile=" + ispSlug + "-hs-profile disabled=no"),
      "",
      "# Walled Garden (pre-auth access to portal, payment, Supabase)",
      safe('/ip hotspot walled-garden remove [find comment~"SmartLinkNet"]'),
      safe('/ip hotspot walled-garden remove [find comment~"Supabase"]'),
      safe('/ip hotspot walled-garden remove [find comment~"M-Pesa"]'),
      '/ip hotspot walled-garden add dst-host=' + portalDomain + ' comment="SmartLinkNet portal"',
      '/ip hotspot walled-garden add dst-host=*.' + portalDomain + ' comment="SmartLinkNet portal assets"',
      '/ip hotspot walled-garden add dst-host=*.supabase.co comment="Supabase"',
      '/ip hotspot walled-garden add dst-host=*.supabase.com comment="Supabase"',
      '/ip hotspot walled-garden add dst-host=*.safaricom.com comment="M-Pesa"',
      '/ip hotspot walled-garden add dst-host=mpesa.safaricom.co.ke comment="M-Pesa STK"',
      safe('/ip hotspot walled-garden ip remove [find comment~"SmartLinkNet HTTPS"]'),
      '/ip hotspot walled-garden ip add dst-address=0.0.0.0/0 protocol=tcp dst-port=443 comment="SmartLinkNet HTTPS passthrough"',
      cb("hotspot-files"),
    );
  }

  // -- PHASE 14: Bandwidth queues
  lines.push(
    "",
    "# -- PHASE 14: Bandwidth queues",
    safe('/queue simple remove [find comment~"SmartLinkNet"]'),
    retry('/queue simple add name=' + ispSlug + '-default target=' + subnet + ' max-limit=100M/100M burst-limit=150M/150M burst-threshold=80M/80M burst-time=10s/10s comment="SmartLinkNet default"'),
    cb("queues"),
    "",
    "# -- PHASE 15: API user",
    "/ip service set api port=8728 disabled=no",
    "/ip service set api-ssl disabled=yes",
    safe('/user remove [find name="' + apiUsername + '"]'),
    retry('/user add name="' + apiUsername + '" password="' + apiPassword + '" group=full comment="SmartLinkNet"'),
    cb("api_user"),
    "",
    "# -- PHASE 16: Schedulers (poll + telemetry)",
    safe("/system script remove [find name=sln-poll-script]"),
    "/system script add name=sln-poll-script source=" + JSON.stringify(pollScriptBody) + ' comment="SmartLinkNet"',
    safe("/system scheduler remove [find name=sln-poll]"),
    '/system scheduler add name=sln-poll interval=1m start-time=startup on-event=sln-poll-script comment="SmartLinkNet"',
    safe("/system script remove [find name=sln-telemetry-script]"),
    "/system script add name=sln-telemetry-script source=" + JSON.stringify(telemetryScriptBody) + ' comment="SmartLinkNet"',
    safe("/system scheduler remove [find name=sln-telemetry]"),
    '/system scheduler add name=sln-telemetry interval=5m start-time=startup on-event=sln-telemetry-script comment="SmartLinkNet"',
    cb("scheduler"),
    "",
    "# -- PHASE 17: Verify all services",
    safe("/system script remove [find name=sln-verify]"),
    "/system script add name=sln-verify source=" + JSON.stringify(verifyScriptBody) + ' comment="SmartLinkNet"',
    safe("/system script run sln-verify"),
    "",
    "# -- PHASE 18: Mark ready + report complete",
    cb("complete"),
    ':log info "SmartLinkNet: provisioning complete for ' + safeName + '"',
  );

  const script = lines.join("\n");
  return new Response(script, { status: 200, headers: { "content-type": "text/plain" } });
});
