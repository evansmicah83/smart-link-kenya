import { serve } from "https://deno.land/std@0.201.0/http/server.ts";
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

serve(async (req: Request) => {
  if (req.method !== "GET") return new Response("Method Not Allowed", { status: 405 });

  const url = new URL(req.url);
  const token = url.searchParams.get("token") || "";
  if (!token) return new Response(':log warning "SmartlinkNet: no token"', { status: 400, headers: { "content-type": "text/plain" } });

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { global: { fetch } });

  const { data: router, error } = await supabase
    .from("routers")
    .select("id, name, bridge_port, bridge_ports, services, mode, subnet, provision_token_expires_at")
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

  const safeName = (router.name || "MikroTik").replace(/"/g, '\\"');
  const bridgeName = `bridge-${safeName.toLowerCase().replace(/[^a-z0-9]/g, "-")}`;
  const subnet = router.subnet || "172.31.0.0/16";
  const subnetParts = subnet.split("/");
  const subnetAddr = subnetParts[0];
  const subnetMask = subnetParts[1] || "16";
  // Gateway = first usable IP e.g. 172.31.0.1
  const gatewayIp = subnetAddr.replace(/(\d+)$/, (m) => String(parseInt(m) + 1));
  const bridgeAddress = `${gatewayIp}/${subnetMask}`;

  // Which ports to add to bridge
  const bridgePorts: string[] = router.bridge_ports?.length
    ? router.bridge_ports
    : [router.bridge_port || "ether2"];

  const services: string[] = router.services || [];
  const hasHotspot = services.includes("hotspot");
  const hasPppoe = services.includes("pppoe");

  const callbackUrl = `https://${new URL(SUPABASE_URL).host}/functions/v1/provision-callback?router_id=${router.id}&stage=complete`;

  const lines: string[] = [];

  // 1. Identity
  lines.push(`/system identity set name="${safeName}"`);

  // 2. Bridge
  lines.push(`/interface bridge add name=${bridgeName} protocol-mode=rstp`);

  // 3. Add ports to bridge
  for (const port of bridgePorts) {
    lines.push(`/interface bridge port add bridge=${bridgeName} interface=${port}`);
  }

  // 4. Assign gateway IP to bridge
  lines.push(`/ip address add address=${bridgeAddress} interface=${bridgeName}`);

  // 5. DHCP pool for hotspot/local clients
  const poolName = `${bridgeName}-pool`;
  const poolStart = subnetAddr.replace(/(\d+\.\d+)\.(\d+)\.(\d+)/, (_, a, b, c) => `${a}.${b}.10`);
  const poolEnd = subnetAddr.replace(/(\d+\.\d+)\.(\d+)\.(\d+)/, (_, a, b, c) => `${a}.${b}.254`);
  lines.push(`/ip pool add name=${poolName} ranges=${poolStart}-${poolEnd}`);

  // 6. DHCP server on bridge
  lines.push(`/ip dhcp-server add name=dhcp-${bridgeName} interface=${bridgeName} address-pool=${poolName} disabled=no`);
  lines.push(`/ip dhcp-server network add address=${subnet} gateway=${gatewayIp} dns-server=8.8.8.8,8.8.4.4`);

  // 7. NAT masquerade
  lines.push(`/ip firewall nat add chain=srcnat out-interface=ether1 action=masquerade`);

  // 8. RADIUS server (SmartLinkNet public fallback)
  const radiusSecret = "SmartLinkNet-Public-Fallback";
  lines.push(`/radius remove [find]`);
  lines.push(`/radius add service=hotspot,pppoe address=${new URL(SUPABASE_URL).hostname} secret=${radiusSecret} authentication-port=1812 accounting-port=1813 timeout=3000ms`);

  // 9. PPPoE server
  if (hasPppoe) {
    lines.push(`/ppp profile add name=sln-pppoe use-radius=yes`);
    lines.push(`/interface pppoe-server server add service-name=pppoe interface=${bridgeName} default-profile=sln-pppoe disabled=no`);
  }

  // 10. Hotspot
  if (hasHotspot) {
    lines.push(`/ip hotspot profile add name=sln-hotspot hotspot-address=${gatewayIp} use-radius=yes`);
    lines.push(`/ip hotspot add name=hotspot1 interface=${bridgeName} address-pool=${poolName} profile=sln-hotspot disabled=no`);
  }

  // 11. Callback to mark router online
  lines.push(`/tool fetch mode=https url="${callbackUrl}" keep-result=no`);
  lines.push(`:log info "SmartlinkNet: provisioning complete"`);

  const script = lines.join("\n");

  return new Response(script, { status: 200, headers: { "content-type": "text/plain" } });
});
