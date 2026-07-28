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

// Attempt MikroTik REST API verification and credential sync.
// Returns true if API is reachable with current credentials.
async function verifyAndSyncRouterApi(router: {
  id: string;
  ip_address: string | null;
  connection_string: string | null;
  api_port: number | null;
  api_username: string | null;
  api_password: string | null;
  api_username_pending: string | null;
  api_password_pending: string | null;
}): Promise<boolean> {
  const host = router.connection_string || router.ip_address;
  if (!host || !router.api_username || !router.api_password) return false;

  const port = router.api_port ?? 8728;
  const makeAuth = (u: string, p: string) => "Basic " + Buffer.from(`${u}:${p}`).toString("base64");
  const restBase = `http://${host}:${port}/rest`;

  const tryGet = async (auth: string) => {
    const res = await fetch(`${restBase}/system/identity`, {
      headers: { Authorization: auth, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  };

  // If ISP queued new credentials, push them to the router first using current creds
  if (router.api_username_pending || router.api_password_pending) {
    const currentAuth = makeAuth(router.api_username, router.api_password);
    const currentOk = await tryGet(currentAuth).catch(() => false);
    if (currentOk) {
      const newUser = router.api_username_pending || router.api_username;
      const newPass = router.api_password_pending || router.api_password;
      try {
        // Find the existing sln-api user on the router and update it
        const listRes = await fetch(`${restBase}/user?name=${encodeURIComponent(router.api_username)}`, {
          headers: { Authorization: currentAuth },
          signal: AbortSignal.timeout(5000),
        });
        const users = listRes.ok ? await listRes.json().catch(() => []) : [];
        if (Array.isArray(users) && users.length) {
          await fetch(`${restBase}/user/${users[0][".id"]}`, {
            method: "PATCH",
            headers: { Authorization: currentAuth, "Content-Type": "application/json" },
            body: JSON.stringify({ name: newUser, password: newPass }),
            signal: AbortSignal.timeout(5000),
          });
        } else {
          // User not found — create fresh
          await fetch(`${restBase}/user`, {
            method: "POST",
            headers: { Authorization: currentAuth, "Content-Type": "application/json" },
            body: JSON.stringify({ name: newUser, password: newPass, group: "full", comment: "SmartLinkNet" }),
            signal: AbortSignal.timeout(5000),
          });
        }
        // Promote pending to active in DB
        await supabaseAdmin.from("routers").update({
          api_username: newUser,
          api_password: newPass,
          api_username_pending: null,
          api_password_pending: null,
        } as any).eq("id", router.id);
        // Verify with new creds
        return await tryGet(makeAuth(newUser, newPass)).catch(() => false);
      } catch {
        // Push failed — still verify with current creds
        return currentOk;
      }
    }
    return false;
  }

  return tryGet(makeAuth(router.api_username, router.api_password)).catch(() => false);
}

async function markRouterOnline(slug: string, request: Request) {
  const radiusServerIp: string =
    (typeof process !== "undefined" && (process.env?.SERVER_IP || process.env?.VITE_SERVER_IP)) || "";

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
        .ilike("name", `%${routerName}%`)
        .limit(1);

      if (error || !data?.[0]?.id) return;
      routerId = data[0].id;
      tenantId = data[0].tenant_id;
    }

    // Fetch full router row including API credentials and pending changes
    const { data: routerRow } = await supabaseAdmin
      .from("routers")
      .select("id, ip_address, connection_string, api_port, api_username, api_password, api_username_pending, api_password_pending")
      .eq("id", routerId)
      .maybeSingle();

    // Verify API connectivity and sync any pending credential changes
    const apiConnected = routerRow
      ? await verifyAndSyncRouterApi({ ...routerRow, ip_address: forwardedFor ?? routerRow.ip_address })
      : false;

    await supabaseAdmin
      .from("routers")
      .update({
        status: "online",
        last_seen: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ip_address: forwardedFor ?? null,
        api_connected: apiConnected,
      } as any)
      .eq("id", routerId);

    // Mark any routers for this tenant that haven't been seen in >10min as offline
    if (tenantId) {
      const staleThreshold = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      await supabaseAdmin
        .from("routers")
        .update({ status: "offline", api_connected: false, updated_at: new Date().toISOString() } as any)
        .eq("tenant_id", tenantId)
        .eq("status", "online")
        .neq("id", routerId)
        .lt("last_seen", staleThreshold);
    }

    // Auto-upsert NAS device so AAA page reflects real router data
    if (tenantId && routerId) {
      const nasPayload = {
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
      };
      // Try update first (router_id already exists), then insert
      const { data: existing } = await supabaseAdmin
        .from("nas_devices").select("id").eq("router_id", routerId).maybeSingle();
      let nasDeviceId: string | null = null;
      if (existing?.id) {
        await supabaseAdmin.from("nas_devices").update(nasPayload).eq("id", existing.id);
        nasDeviceId = existing.id;
      } else {
        const { data: inserted } = await supabaseAdmin.from("nas_devices").insert(nasPayload).select("id").single();
        nasDeviceId = inserted?.id ?? null;
      }

      // Auto-upsert radius_servers so the AAA Servers tab is populated
      const { data: existingServer } = await supabaseAdmin
        .from("radius_servers")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("name", routerName)
        .maybeSingle();
      const serverPayload = {
        tenant_id:    tenantId,
        name:         routerName,
        host:         radiusServerIp || forwardedFor || "127.0.0.1",
        auth_port:    1812,
        acct_port:    1813,
        shared_secret: "SmartLinkNet-Public-Fallback",
        protocol:     "mschapv2",
        is_primary:   true,
        is_active:    true,
        is_healthy:   true,
        last_checked: new Date().toISOString(),
        timeout_ms:   3000,
        retry_count:  3,
        priority:     1,
        updated_at:   new Date().toISOString(),
      };
      if (existingServer?.id) {
        await supabaseAdmin.from("radius_servers").update(serverPayload).eq("id", existingServer.id);
      } else {
        await supabaseAdmin.from("radius_servers").insert(serverPayload);
      }

      // Auto-upsert radius_clients so the AAA Clients tab is populated
      if (forwardedFor) {
        const { data: existingClient } = await supabaseAdmin
          .from("radius_clients")
          .select("id")
          .eq("tenant_id", tenantId)
          .eq("client_ip", forwardedFor)
          .maybeSingle();
        const clientPayload = {
          tenant_id: tenantId,
          name: routerName,
          client_ip: forwardedFor,
          shared_secret: "SmartLinkNet-Public-Fallback",
          vendor: "mikrotik",
          is_active: true,
          last_seen: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        if (existingClient?.id) {
          await supabaseAdmin.from("radius_clients").update(clientPayload).eq("id", existingClient.id);
        } else {
          await supabaseAdmin.from("radius_clients").insert(clientPayload);
        }
      }

      // Write an auth_success event so AAA stats reflect the router check-in
      if (nasDeviceId) {
        await supabaseAdmin.from("auth_events").insert({
          tenant_id: tenantId,
          nas_id: nasDeviceId,
          username: routerName,
          event_type: "auth_success",
          reply_message: "NAS online — provisioning check-in",
          received_at: new Date().toISOString(),
        }).catch(() => {});
      }
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
  const notifyUrl = origin + "/provision/notify/" + safeSlug + "?router=" + encodeURIComponent(record?.provisioning_identity ?? identity);
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
  // RADIUS server IP — must be set as SERVER_IP env var (server-side, not VITE_)
  // This is the public IP of the server running FreeRADIUS / this app
  const radiusIp: string =
    (typeof process !== "undefined" && (process.env?.SERVER_IP || process.env?.VITE_SERVER_IP)) || "";

  if (!radiusIp) {
    console.warn("[provision] SERVER_IP env var not set — RADIUS will not be configured in router script");
  }

  const ifLen = (cmd: string, body: string) => ":if ([:len [" + cmd + "]] = 0) do={" + body + "}";

  let s = "";
  s += "# Generated by SmartLinkNet Router Provisioning System\r\n";
  s += "# Router identity: " + identity + "\r\n";
  s += "# Enabled services: " + serviceSummary + "\r\n";
  s += "# Tenant slug: " + template.tenantSlug + "\r\n";
  s += "# Date: " + new Date().toISOString() + "\r\n";
  s += "\r\n";
  s += "# --- System Configuration ---\r\n";
  s += "/system identity set name=\"" + identity + "\"\r\n";
  s += "\r\n";
  s += "# --- Bridge & Network Infrastructure ---\r\n";
  s += ":local bridgeName \"" + template.bridgeName + "\"\r\n";
  s += ifLen("/interface bridge find name=$bridgeName", "/interface bridge add name=$bridgeName comment=\"" + template.tenantSlug + " auto-provisioned\"") + "\r\n";
  s += ifLen("/interface bridge port find interface=" + template.bridgePort, "/interface bridge port add bridge=$bridgeName interface=" + template.bridgePort) + "\r\n";
  s += ifLen("/ip address find interface=$bridgeName", "/ip address add address=" + networkAddress + "/" + prefixLength + " interface=$bridgeName comment=\"" + template.tenantSlug + " default subnet\"") + "\r\n";
  s += ifLen("/ip pool find name=$bridgeName", "/ip pool add name=$bridgeName ranges=" + poolRange) + "\r\n";
  s += ifLen("/ip dhcp-server find name=$bridgeName", "/ip dhcp-server add name=$bridgeName interface=$bridgeName address-pool=$bridgeName lease-time=12h") + "\r\n";
  s += ifLen("/ip dhcp-server network find where address=\"" + template.subnet + "\"", "/ip dhcp-server network add address=" + template.subnet + " gateway=" + gateway + " dns-server=8.8.8.8,1.1.1.1") + "\r\n";
  s += "\r\n";

  if (hasPPPoE) {
    s += "# --- PPPoE Server Configuration ---\r\n";
    s += "# PPPoE server for broadband subscriber connections\r\n";
    s += ifLen("/interface pppoe-server server find interface=$bridgeName", "/interface pppoe-server server add interface=$bridgeName service-name=\"" + template.tenantSlug + "\" authentication=mschap2,mschap1,chap,pap disabled=no") + "\r\n";
    s += "# PPPoE users are managed via RADIUS or User Manager\r\n";
    s += "\r\n";
  }

  if (hasHotspot) {
    s += "# --- Hotspot (Captive Portal) Configuration ---\r\n";
    s += "# Hotspot profile\r\n";
    s += "# Hotspot profile with RADIUS auth\r\n";
    s += ifLen("/ip hotspot profile find name=\"" + template.tenantSlug + "-profile\"", "/ip hotspot profile add name=\"" + template.tenantSlug + "-profile\" use-radius=yes login-by=http-chap,http-pap,https,mac-cookie hotspot-address=" + gateway + " dns-name=\"" + template.tenantSlug + ".hotspot\"") + "\r\n";
    s += "\r\n";
    s += "# Enable Hotspot on bridge interface\r\n";
    s += ifLen("/ip hotspot find interface=$bridgeName", "/ip hotspot add name=\"" + template.tenantSlug + "-hotspot\" interface=$bridgeName address-pool=$bridgeName profile=\"" + template.tenantSlug + "-profile\" disabled=no") + "\r\n";
    s += "\r\n";
    s += "# Hotspot users created via /ip hotspot user or User Manager API\r\n";
    s += "\r\n";
  }

  s += "# --- RADIUS Authentication & Accounting ---\r\n";
  if (radiusIp) {
    const radiusServices = [hasPPPoE && "ppp", hasHotspot && "hotspot"].filter(Boolean).join(",") || "ppp,hotspot";
    s += "# Remove stale entry then add fresh (idempotent)\r\n";
    s += "/radius remove [find address=\"" + radiusIp + "\"]\r\n";
    s += "/radius add service=" + radiusServices + " address=\"" + radiusIp + "\" secret=\"SmartLinkNet-Public-Fallback\" authentication-port=1812 accounting-port=1813 timeout=3s\r\n";
    s += "/radius incoming set accept=yes port=3799\r\n";
  } else {
    s += "# RADIUS not configured — set VITE_SERVER_IP env var and reprovision\r\n";
  }
  s += "\r\n";
  s += "# --- Security & Service Configuration ---\r\n";
  s += "# Disable unnecessary services, keep API enabled for management\r\n";
  s += "/ip service enable api\r\n";
  s += "/ip service set api port=8728\r\n";
  s += "/ip service disable ftp\r\n";
  s += "/ip service enable www\r\n";
  s += "/ip service enable ssh\r\n";
  s += "\r\n";
  s += "# --- NAT Masquerade (internet sharing) ---\r\n";
  s += ifLen("/ip firewall nat find chain=srcnat action=masquerade out-interface=ether1",
    "/ip firewall nat add chain=srcnat action=masquerade out-interface=ether1 comment=\"" + template.tenantSlug + " auto\""
  ) + "\r\n";
  s += "\r\n";
  s += "# --- Auto-update scheduler (daily re-provision) ---\r\n";
  const scriptUrl = origin + "/provision/" + safeSlug;
  const scriptFile = template.tenantSlug + ".rsc";
  // RouterOS scheduler on-event: use a script name, not inline command with quotes
  // We store the fetch+import as a named script, then scheduler calls it
  const syncScriptName = template.tenantSlug + "-sync-script";
  s += ifLen("/system script find name=\"" + syncScriptName + "\"",
    "/system script add name=\"" + syncScriptName + "\" source=\"/tool fetch mode=https url=" + scriptUrl + " dst-path=" + scriptFile + ";:delay 3s;/import " + scriptFile + "\" comment=\"SmartLinkNet auto-sync\""
  ) + "\r\n";
  s += ifLen("/system scheduler find name=\"" + template.tenantSlug + "-sync\"",
    "/system scheduler add name=\"" + template.tenantSlug + "-sync\" interval=1d start-time=00:00:00 on-event=\"" + syncScriptName + "\" comment=\"SmartLinkNet daily sync\""
  ) + "\r\n";
  s += "\r\n";
  s += "# --- Registration & Health Check ---\r\n";
  s += ":local notifyUrl \"" + notifyUrl + "\"\r\n";
  s += "/tool fetch mode=https url=$notifyUrl keep-result=no\r\n";
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
        // Look up the router and redirect to the token-based edge function
        // so there is only one provisioning code path
        const record = await getRouterProvisionRecord(normalizeProvisionSlug(slug));
        if (record?.id) {
          // Re-issue a fresh provision token and redirect
          const newToken = crypto.randomUUID();
          const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
          await supabaseAdmin.from("routers").update({
            provision_token: newToken,
            provision_token_expires_at: expiresAt,
          } as any).eq("id", record.id);
          const edgeFnUrl = `https://tghaarhofriakwgvqmpm.supabase.co/functions/v1/provision?token=${encodeURIComponent(newToken)}`;
          return new Response(null, { status: 302, headers: { Location: edgeFnUrl } });
        }
        // Fallback: build legacy script if router not found by slug
        const body = await buildProvisionScript(slug, url.origin);
        return new Response(body, {
          status: 200,
          headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
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
