import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { supabaseAdmin as _supabaseAdmin } from "./integrations/supabase/client.server";

// Cast to any to bypass stale generated Database types that are missing tables
// (routers, tenant_branding, etc.) added after the last type generation.
const supabaseAdmin = _supabaseAdmin as any;
import { buildProvisioningTemplate } from "./lib/provisioning/templates";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

function normalizeProvisionSlug(slug: string) {
  return slug.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/(^-|-$)/g, "") || "smartlinknet";
}

function getRouterIdentityFromSlug(slug: string) {
  const safeSlug = normalizeProvisionSlug(slug);
  return safeSlug.split("-").filter(Boolean).pop() || "MikroTik";
}

function parseProvisioningSlug(slug: string) {
  const safeSlug = normalizeProvisionSlug(slug);
  const uuidMatch = safeSlug.match(/^([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})-(.+)$/i);
  if (uuidMatch) {
    return { tenantId: uuidMatch[1], identity: uuidMatch[2] };
  }

  const parts = safeSlug.split("-").filter(Boolean);
  return { tenantId: null, identity: parts.pop() || "MikroTik" };
}

async function getRouterProvisionRecord(slug: string) {
  const safeSlug = normalizeProvisionSlug(slug);
  const { data, error } = await supabaseAdmin
    .from("routers")
    .select("id, name, tenant_id, services, bridge_port, subnet, provisioning_slug, provisioning_identity, ip_address")
    .eq("provisioning_slug", safeSlug)
    .maybeSingle();

  if (!error && data) return data;

  const parsed = parseProvisioningSlug(safeSlug);
  if (parsed.tenantId && parsed.identity) {
    const { data: fallbackData, error: fallbackError } = await supabaseAdmin
      .from("routers")
      .select("id, name, tenant_id, services, bridge_port, subnet, provisioning_slug, provisioning_identity, ip_address")
      .eq("tenant_id", parsed.tenantId)
      .ilike("name", `%${parsed.identity}%`)
      .order("created_at", { ascending: false })
      .limit(1);

    if (!fallbackError && fallbackData?.[0]) return fallbackData[0];
  }

  return null;
}

async function markRouterOnline(slug: string, request: Request) {
  try {
    const routerName = new URL(request.url).searchParams.get("router")?.trim() || getRouterIdentityFromSlug(slug);
    const record = await getRouterProvisionRecord(slug);
    const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    let routerId = (record as { id?: string } | null | undefined)?.id;
    let tenantId = (record as { tenant_id?: string } | null | undefined)?.tenant_id;

    if (!routerId) {
      const { data, error } = await supabaseAdmin
        .from("routers")
        .select("id, tenant_id")
        .ilike("name", routerName)
        .limit(1);

      if (error || !data?.[0]?.id) return;
      routerId = data[0].id;
      tenantId = data[0].tenant_id;
    }

    await supabaseAdmin
      .from("routers")
      .update({
        status: "online",
        last_seen: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ip_address: forwardedFor ?? null,
      } as any)
      .eq("id", routerId);

    // Auto-upsert NAS device so AAA page reflects real router data
    if (tenantId && routerId) {
      await supabaseAdmin
        .from("nas_devices")
        .upsert({
          tenant_id: tenantId,
          router_id: routerId,
          name: routerName,
          vendor: "mikrotik",
          nas_identifier: routerName,
          nas_ip: forwardedFor ?? null,
          shared_secret: "SmartLinkNet-Public-Fallback",
          auth_port: 1812,
          acct_port: 1813,
          coa_port: 3799,
          is_active: true,
          dynamic_profile_enabled: true,
          dynamic_vlan_enabled: false,
          dynamic_ip_enabled: false,
          last_seen: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        } as any, { onConflict: "router_id" })
        .catch(() => {});
    }
  } catch (error) {
    console.error("Failed to mark router online", error);
  }
}

async function buildProvisionScript(slug: string, origin: string) { // origin passed through to script
  const safeSlug = normalizeProvisionSlug(slug);
  const identity = getRouterIdentityFromSlug(slug);
  const record = await getRouterProvisionRecord(safeSlug);
  const services = ((record?.services ?? []) as string[]).filter(Boolean);
  const bridgePort = typeof record?.bridge_port === "string" && record.bridge_port ? record.bridge_port : "ether2";
  const subnet = typeof record?.subnet === "string" && record.subnet ? record.subnet : "172.31.0.0/16";
  const brandingRow = record?.tenant_id
    ? await supabaseAdmin.from("tenant_branding").select("company_name").eq("tenant_id", record.tenant_id).maybeSingle()
    : { data: null };
  const template = buildProvisioningTemplate(
    { company_name: brandingRow.data?.company_name ?? null },
    { services, bridgePort, subnet },
  );
  const notifyUrl = origin + "/provision/notify/" + safeSlug + "?router=" + encodeURIComponent(identity);
  const subnetParts = subnet.split("/");
  const networkAddress = subnetParts[0];
  const prefixLength = subnetParts[1] ?? "16";
  const gateway = networkAddress ? networkAddress.replace(/\.0$/, ".1") : "172.31.0.1";
  const poolStart = networkAddress ? networkAddress.replace(/\.0$/, ".2") : "172.31.0.2";
  const poolEnd = networkAddress ? networkAddress.replace(/\.0$/, ".254") : "172.31.0.254";
  const poolRange = poolStart + "-" + poolEnd;
  const serviceSummary = services.length ? services.join(", ") : "none";
  const hasPPPoE = services.includes("pppoe");
  const hasHotspot = services.includes("hotspot");

  // Use a variable for escaped quote to avoid rolldown SSR parser issues
  const q = '\\"';

  const ifLen = (cmd: string, body: string) => ":if ([:len [" + cmd + "]] = 0) do={" + body + "}";

  let s = "";
  s += "# Generated by SmartLinkNet Router Provisioning System\r\n";
  s += "# Router identity: " + identity + "\r\n";
  s += "# Enabled services: " + serviceSummary + "\r\n";
  s += "# Tenant slug: " + template.tenantSlug + "\r\n";
  s += "# Date: $(now)\r\n";
  s += "\r\n";
  s += "# --- System Configuration ---\r\n";
  s += "/system identity set name=" + q + identity + q + "\r\n";
  s += "\r\n";
  s += "# --- Bridge & Network Infrastructure ---\r\n";
  s += ":local bridgeName " + q + template.bridgeName + q + "\r\n";
  s += ifLen("/interface bridge find name=\\$bridgeName", "/interface bridge add name=\\$bridgeName comment=" + q + template.tenantSlug + " auto-provisioned" + q) + "\r\n";
  s += ifLen("/interface bridge port find interface=" + template.bridgePort, "/interface bridge port add bridge=\\$bridgeName interface=" + template.bridgePort) + "\r\n";
  s += ifLen("/ip address find interface=\\$bridgeName", "/ip address add address=" + networkAddress + "/" + prefixLength + " interface=\\$bridgeName comment=" + q + template.tenantSlug + " default subnet" + q) + "\r\n";
  s += ifLen("/ip pool find name=\\$bridgeName", "/ip pool add name=\\$bridgeName ranges=" + poolRange) + "\r\n";
  s += ifLen("/ip dhcp-server find name=\\$bridgeName", "/ip dhcp-server add name=\\$bridgeName interface=\\$bridgeName address-pool=\\$bridgeName lease-time=12h") + "\r\n";
  s += ifLen("/ip dhcp-server network find where address=" + q + template.subnet + q, "/ip dhcp-server network add address=" + template.subnet + " gateway=" + gateway + " dns-server=8.8.8.8,1.1.1.1") + "\r\n";
  s += "\r\n";

  if (hasPPPoE) {
    s += "# --- PPPoE Server Configuration ---\r\n";
    s += "# PPPoE server for broadband subscriber connections\r\n";
    s += ifLen("/interface pppoe-server server find interface=\\$bridgeName", "/interface pppoe-server server add interface=\\$bridgeName service-name=" + q + template.tenantSlug + q + " authentication=mschap2,mschap1,chap,pap disabled=no") + "\r\n";
    s += "# PPPoE users are managed via RADIUS or User Manager\r\n";
    s += "\r\n";
  }

  if (hasHotspot) {
    s += "# --- Hotspot (Captive Portal) Configuration ---\r\n";
    s += "# RADIUS server for hotspot auth (points back to SmartLinkNet)\r\n";
    s += ":local radiusSecret " + q + "SmartLinkNet-Public-Fallback" + q + "\r\n";
    s += ":local radiusHost " + q + origin.replace(/^https?:\/\//, "").split("/")[0] + q + "\r\n";
    const radiusRemoveCmd = "/radius remove [find service~" + q + "hotspot" + q + "]";
    s += radiusRemoveCmd + "\r\n";
    s += "/radius add service=hotspot address=\\$radiusHost secret=\\$radiusSecret authentication-port=1812 accounting-port=1813 timeout=3000ms\r\n";
    s += "\r\n";
    s += "# Hotspot profile with RADIUS auth\r\n";
    s += ifLen("/ip hotspot profile find name=" + q + template.tenantSlug + "-profile" + q, "/ip hotspot profile add name=" + q + template.tenantSlug + "-profile" + q + " use-radius=yes login-by=http-chap,http-pap,https,mac-cookie hotspot-address=" + gateway + " dns-name=" + q + template.tenantSlug + ".hotspot" + q) + "\r\n";
    s += "\r\n";
    s += "# Enable Hotspot on bridge interface\r\n";
    s += ifLen("/ip hotspot find interface=\\$bridgeName", "/ip hotspot add name=" + q + template.tenantSlug + "-hotspot" + q + " interface=\\$bridgeName address-pool=\\$bridgeName profile=" + q + template.tenantSlug + "-profile" + q + " disabled=no") + "\r\n";
    s += "\r\n";
    s += "# Hotspot users created via /ip hotspot user or User Manager API\r\n";
    s += "\r\n";
  }

  s += "# --- Security & Service Configuration ---\r\n";
  s += "# Disable unnecessary services, keep API enabled for management\r\n";
  s += "/ip service enable api\r\n";
  s += "/ip service set api port=8728\r\n";
  s += "/ip service disable ftp\r\n";
  s += "/ip service enable www\r\n";
  s += "/ip service enable ssh\r\n";
  s += "\r\n";
  s += "# --- Registration & Health Check ---\r\n";
  s += ":local notifyUrl " + q + notifyUrl + q + "\r\n";
  s += "/tool fetch mode=https url=\\$notifyUrl keep-result=no\r\n";
  s += "\r\n";
  s += "# --- End of SmartLinkNet Provisioning ---\r\n";

  return s;
}

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!body.includes('"unhandled":true') || !body.includes('"message":"HTTPError"')) {
    return response;
  }

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const url = new URL(request.url);
      if (url.pathname.startsWith("/provision/notify/")) {
        const slug = url.pathname.replace("/provision/notify/", "").replace(/\/+$/, "");
        await markRouterOnline(slug, request);
        return new Response("ok", {
          status: 200,
          headers: { "content-type": "text/plain; charset=utf-8" },
        });
      }

      if (url.pathname.startsWith("/provision/")) {
        const slug = url.pathname.replace("/provision/", "").replace(/\/+$/, "");
        const body = await buildProvisionScript(slug, url.origin);
        return new Response(body, {
          status: 200,
          headers: {
            "content-type": "text/plain; charset=utf-8",
            "cache-control": "no-store",
          },
        });
      }

      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
