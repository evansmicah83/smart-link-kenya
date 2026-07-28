import { serve } from "https://deno.land/std@0.201.0/http/server.ts";
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const APP_URL = Deno.env.get("APP_URL") || "https://smart-link-kenya.vercel.app";

serve(async (req: Request) => {
  if (req.method !== "GET") return new Response("Method Not Allowed", { status: 405 });

  const url = new URL(req.url);
  const token = url.searchParams.get("token") || "";
  if (!token) return new Response(':log warning "SmartlinkNet: no token"', { status: 400, headers: { "content-type": "text/plain" } });

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { global: { fetch } });

  const { data: router, error } = await supabase
    .from("routers")
    .select("id, name, tenant_id, bridge_port, bridge_ports, services, mode, subnet, provision_token_expires_at")
    .eq("provision_token", token)
    .maybeSingle();

  if (error || !router) {
    return new Response(':log warning "SmartlinkNet: token not found"', { status: 410, headers: { "content-type": "text/plain" } });
  }

  // Auto-extend if expired
  const expires = router.provision_token_expires_at ? new Date(router.provision_token_expires_at) : null;
  if (expires && expires < new Date()) {
    await supabase.from("routers").update({
      provision_token_expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    }).eq("id", router.id);
  }

  await supabase.from("routers").update({ status: "provisioning" }).eq("id", router.id);

  // Get tenant slug for portal URL
  const { data: tenant } = await supabase
    .from("tenants")
    .select("slug, name")
    .eq("id", router.tenant_id)
    .maybeSingle();

  // Get real RADIUS server for this tenant
  const { data: radiusServer } = await supabase
    .from("radius_servers")
    .select("host, auth_port, acct_port, shared_secret")
    .eq("tenant_id", router.tenant_id)
    .eq("is_active", true)
    .order("priority", { ascending: true })
    .limit(1)
    .maybeSingle();

  const ispSlug = tenant?.slug ?? router.tenant_id;
  const safeName = (router.name || "MikroTik").replace(/"/g, '\\"');
  const companySlug = ispSlug.replace(/[^a-z0-9]/g, "-").toLowerCase();
  const bridgeName = `${companySlug}-bridge`;

  const subnet = router.subnet || "172.31.0.0/16";
  const [networkAddr, prefixLen] = subnet.split("/");
  const parts = networkAddr.split(".").map(Number);
  parts[3] = 1;
  const gatewayIp = parts.join(".");
  const bridgeAddress = `${gatewayIp}/${prefixLen}`;
  const poolStart = `${parts[0]}.${parts[1]}.${parts[2]}.10`;
  const poolEnd = `${parts[0]}.${parts[1]}.${parts[2]}.254`;

  const bridgePorts: string[] = router.bridge_ports?.length
    ? router.bridge_ports
    : [router.bridge_port || "ether2"];

  const services: string[] = router.services || [];
  const hasHotspot = services.includes("hotspot");
  const hasPppoe = services.includes("pppoe");

  const radiusHost = (radiusServer?.host && radiusServer.host !== "pending") ? radiusServer.host : null;
  const radiusSecret = radiusServer?.shared_secret || "SmartLinkNet-Public-Fallback";
  const radiusAuthPort = radiusServer?.auth_port || 1812;
  const radiusAcctPort = radiusServer?.acct_port || 1813;

  const portalLoginPage = `${APP_URL}/portal?isp=${ispSlug}&mac=\$(mac)&ip=\$(ip)&url=\$(link-orig)&dst=\$(dst-ip)`;
  const callbackUrl = `https://${new URL(SUPABASE_URL).host}/functions/v1/provision-callback?router_id=${router.id}&stage=complete`;

  const lines: string[] = [
    `# SmartLinkNet — Auto-provisioning script`,
    `# Router: ${safeName} | Tenant: ${tenant?.name ?? ispSlug}`,
    `# Generated: ${new Date().toISOString()}`,
    ``,
    `# 1. Identity`,
    `/system identity set name="${safeName}"`,
    ``,
    `# 2. Bridge`,
    `/interface bridge add name=${bridgeName} protocol-mode=rstp comment="SmartLinkNet"`,
  ];

  // Bridge ports
  for (const port of bridgePorts) {
    lines.push(`/interface bridge port add bridge=${bridgeName} interface=${port}`);
  }

  lines.push(
    ``,
    `# 3. Gateway IP on bridge`,
    `/ip address add address=${bridgeAddress} interface=${bridgeName} comment="SmartLinkNet gateway"`,
    ``,
    `# 4. IP Pool`,
    `/ip pool add name=${companySlug}-pool ranges=${poolStart}-${poolEnd}`,
    ``,
    `# 5. DHCP Server`,
    `/ip dhcp-server add name=${companySlug}-dhcp interface=${bridgeName} address-pool=${companySlug}-pool lease-time=1h disabled=no`,
    `/ip dhcp-server network add address=${subnet} gateway=${gatewayIp} dns-server=8.8.8.8,8.8.4.4`,
    ``,
    `# 6. NAT`,
    `/ip firewall nat add chain=srcnat out-interface-list=WAN action=masquerade comment="SmartLinkNet NAT"`,
    ``,
    `# 7. DNS`,
    `/ip dns set allow-remote-requests=yes servers=8.8.8.8,8.8.4.4`,
  );

  // RADIUS — only add if we have a real host
  if (radiusHost) {
    lines.push(
      ``,
      `# 8. RADIUS`,
      `/radius remove [find comment="SmartLinkNet"]`,
      `/radius add service=${hasHotspot && hasPppoe ? "hotspot,ppp" : hasHotspot ? "hotspot" : "ppp"} address=${radiusHost} secret=${radiusSecret} authentication-port=${radiusAuthPort} accounting-port=${radiusAcctPort} timeout=3000ms comment="SmartLinkNet"`,
    );
  }

  // Hotspot
  if (hasHotspot) {
    lines.push(
      ``,
      `# 9. Hotspot`,
      `/ip hotspot profile add name=${companySlug}-hs-profile login-by=http-pap html-directory=hotspot http-cookie-lifetime=1d ${radiusHost ? "use-radius=yes accounting=yes" : ""} login-page="${portalLoginPage}"`,
      `/ip hotspot add name=${companySlug}-hotspot interface=${bridgeName} address-pool=${companySlug}-pool profile=${companySlug}-hs-profile disabled=no`,
      ``,
      `# Walled Garden — allow portal before login`,
      `/ip hotspot walled-garden add dst-host=smart-link-kenya.vercel.app comment="SmartLinkNet portal"`,
      `/ip hotspot walled-garden add dst-host=*.supabase.co comment="Supabase"`,
      `/ip hotspot walled-garden add dst-host=*.safaricom.com comment="M-Pesa"`,
      `/ip hotspot walled-garden add dst-host=mpesa.safaricom.co.ke comment="M-Pesa STK"`,
      `/ip hotspot walled-garden ip add dst-address=0.0.0.0/0 protocol=tcp dst-port=443 comment="HTTPS"`,
    );
  }

  // PPPoE
  if (hasPppoe) {
    lines.push(
      ``,
      `# 10. PPPoE Server`,
      `/ppp profile add name=${companySlug}-pppoe ${radiusHost ? "use-radius=yes" : ""} comment="SmartLinkNet"`,
      `/interface pppoe-server server add name=${companySlug}-pppoe interface=${bridgeName} default-profile=${companySlug}-pppoe disabled=no`,
    );
  }

  // Heartbeat scheduler
  lines.push(
    ``,
    `# 11. Heartbeat`,
    `/system scheduler add name=sln-heartbeat interval=5m on-event=":do { /tool fetch mode=https url=\\"${APP_URL}/api/heartbeat?router=${router.id}\\" keep-result=no } on-error={}" comment="SmartLinkNet"`,
    ``,
    `# 12. Report back`,
    `/tool fetch mode=https url="${callbackUrl}" keep-result=no`,
    `:log info "SmartLinkNet: provisioning complete for ${safeName}"`,
  );

  const script = lines.join("\n");
  return new Response(script, { status: 200, headers: { "content-type": "text/plain" } });
});
