/**
 * SmartLinkNet — radius-auth Edge Function
 * Phase 2: Centralized RADIUS Authentication + Authorization
 * Handles Access-Request from FreeRADIUS rlm_rest or MikroTik
 * Returns Access-Accept with dynamic attributes or Access-Reject
 */

/// <reference path="../types.d.ts" />
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createSupabaseClient, now, resolveNasDevice, verifyNasSecret } from "../lib/radius-common.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-nas-secret",
};

function buildRateLimit(profile: Record<string, unknown> | null): string | null {
  if (!profile) return null;
  if (profile["rate_limit"]) return profile["rate_limit"] as string;
  const dl = profile["speed_down_kbps"] as number | null;
  const ul = profile["speed_up_kbps"] as number | null;
  if (!dl) return null;
  const fmt = (k: number) => k >= 1024 ? `${Math.round(k / 1024)}M` : `${k}k`;
  return `${fmt(dl)}/${fmt(ul ?? dl)}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const sb = createSupabaseClient();

  try {
    const body = await req.json() as {
      username: string;
      password?: string;
      nas_identifier?: string;
      nas_ip?: string;
      nas_port?: string;
      calling_station_id?: string;
      called_station_id?: string;
      service_type?: string;
      tenant_id?: string;
      request_type?: "auth" | "authorize";
    };

    const authSecret = req.headers.get("x-nas-secret") ?? null;
    const { username, password, nas_identifier, nas_ip, nas_port,
            calling_station_id, tenant_id, request_type = "auth" } = body;

    if (!username) {
      return json({ accepted: false, reply_message: "Username required" }, 400);
    }

    const nasDevice = await resolveNasDevice(sb, nas_identifier ?? null, nas_ip ?? null);
    if (!nasDevice) {
      return json({ accepted: false, reply_message: "Unknown NAS" }, 200);
    }
    if (!verifyNasSecret(nasDevice, authSecret)) {
      return json({ accepted: false, reply_message: "NAS authentication failed" }, 403);
    }

    const resolvedTenantId = tenant_id ? tenant_id : nasDevice.tenant_id;
    const nasDeviceId = nasDevice.id;

    if (tenant_id && tenant_id !== nasDevice.tenant_id) {
      return json({ accepted: false, reply_message: "Tenant mismatch" }, 403);
    }

    if (!resolvedTenantId) {
      return json({ accepted: false, reply_message: "Tenant resolution failed" }, 200);
    }

    // 2. Resolve subscription by username
    const { data: sub } = await sb
      .from("subscriptions")
      .select("id, customer_id, tenant_id, status, password, package_id, router_id, expires_at")
      .eq("username", username)
      .eq("tenant_id", resolvedTenantId)
      .maybeSingle();

    const recordEvent = async (eventType: string, replyMsg: string | null) => {
      await sb.from("auth_events").insert({
        tenant_id: resolvedTenantId, username,
        customer_id: sub?.customer_id ?? null,
        subscription_id: sub?.id ?? null,
        nas_id: nasDeviceId, event_type: eventType,
        mac_address: calling_station_id ?? null,
        nas_port: nas_port ?? null,
        reply_message: replyMsg,
        received_at: now(),
      }).catch(() => {});
    };

    // 3. Validate
    if (!sub) {
      await recordEvent("auth_reject", "User not found");
      return json({ accepted: false, reply_message: "User not found" }, 200);
    }
    if (sub.status !== "active") {
      await recordEvent("auth_reject", `Service ${sub.status}`);
      return json({ accepted: false, reply_message: `Service ${sub.status}` }, 200);
    }
    if (sub.expires_at && new Date(sub.expires_at) < new Date()) {
      await recordEvent("auth_reject", "Subscription expired");
      return json({ accepted: false, reply_message: "Subscription expired" }, 200);
    }
    if (request_type === "auth" && password && sub.password && sub.password !== password) {
      await recordEvent("auth_failure", "Bad password");
      return json({ accepted: false, reply_message: "Invalid credentials" }, 200);
    }

    // 4. Resolve RADIUS profile → dynamic attributes
    const { data: profile } = await sb
      .from("radius_profiles")
      .select("*")
      .eq("tenant_id", resolvedTenantId)
      .eq("package_id", sub.package_id)
      .maybeSingle();

    const rateLimit = buildRateLimit(profile);

    // 5. Build reply
    await recordEvent("auth_success", null);
    if (nasDeviceId) {
      await sb.from("nas_devices").update({ last_seen: now() }).eq("id", nasDeviceId).catch(() => {});
    }

    return json({
      accepted: true,
      customer_id: sub.customer_id,
      subscription_id: sub.id,
      reply_attributes: {
        // Standard RADIUS attributes
        "Reply-Message":                 "Welcome",
        "Session-Timeout":               profile?.session_timeout ?? null,
        "Idle-Timeout":                  profile?.idle_timeout ?? null,
        "Framed-IP-Address":             null, // assigned by DHCP/PPPoE on NAS
        // MikroTik VSAs (Vendor-Id 14988)
        "Mikrotik-Rate-Limit":           rateLimit,
        "Mikrotik-Address-Pool":         profile?.ip_pool ?? null,
        // Dynamic VLAN (802.1Q)
        "Tunnel-Type":                   profile?.vlan_id ? "VLAN" : null,
        "Tunnel-Medium-Type":            profile?.vlan_id ? "IEEE-802" : null,
        "Tunnel-Private-Group-ID":       profile?.vlan_id?.toString() ?? null,
        // Simultaneous-Use
        "Simultaneous-Use":              profile?.simultaneous_use ?? null,
      },
    }, 200);

  } catch (err: unknown) {
    return json({ accepted: false, reply_message: (err as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
