/**
 * SmartLinkNet — coa-send Edge Function
 *
 * Sends a Change-of-Authorization (CoA) or Disconnect-Message (DM)
 * to FreeRADIUS (UDP 3799) when SmartLinkNet needs to:
 *   - Disconnect a subscriber (suspension, expiry, non-payment)
 *   - Update bandwidth (package upgrade/downgrade)
 *   - Force re-auth after voucher redemption
 *
 * FreeRADIUS forwards the CoA/DM to the MikroTik NAS via UDP 3799.
 *
 * Called by: billing workflows, subscription expiry jobs, manual admin actions.
 *
 * POST body:
 *   { action: "disconnect" | "coa", username: string, tenant_id: string,
 *     new_rate_limit?: string, session_id?: string }
 */

import { serve } from "https://deno.land/std@0.201.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL      = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const ANON_KEY          = Deno.env.get("SUPABASE_ANON_KEY") || "";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const resp = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "content-type": "application/json" },
  });

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST")   return resp({ error: "Method not allowed" }, 405);

  try {
    // ── Auth ────────────────────────────────────────────────────────────
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) return resp({ error: "Missing token" }, 401);

    const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { global: { fetch } });

    const userResp = await fetch(
      SUPABASE_URL.replace(/\/+$/, "") + "/auth/v1/user",
      { headers: { Authorization: "Bearer " + token, apikey: ANON_KEY } }
    );
    if (!userResp.ok) return resp({ error: "Invalid token" }, 401);
    const userId = (await userResp.json())?.id;
    if (!userId) return resp({ error: "Unable to resolve user" }, 401);

    const { data: profile } = await db.from("profiles").select("tenant_id").eq("id", userId).maybeSingle();
    if (!profile?.tenant_id) return resp({ error: "Tenant not found" }, 401);
    const tenantId = profile.tenant_id;

    // ── Parse request ───────────────────────────────────────────────────
    const body = await req.json();
    const {
      action,           // "disconnect" | "coa"
      username,         // subscriber username
      new_rate_limit,   // e.g. "20M/10M" — for CoA bandwidth change
      session_id,       // optional: specific session to target
    } = body as {
      action: "disconnect" | "coa";
      username: string;
      new_rate_limit?: string;
      session_id?: string;
    };

    if (!action || !username) return resp({ error: "action and username required" }, 400);

    // ── Resolve FreeRADIUS server for this tenant ───────────────────────
    const { data: radiusServer } = await db
      .from("radius_servers")
      .select("freeradius_ip, freeradius_ip2, coa_secret, shared_secret, coa_port")
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .order("priority", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!radiusServer?.freeradius_ip) {
      return resp({ error: "No FreeRADIUS server configured for this tenant" }, 400);
    }

    const coaIp     = radiusServer.freeradius_ip;
    const coaPort   = radiusServer.coa_port || 3799;
    const coaSecret = radiusServer.coa_secret || radiusServer.shared_secret || "SmartLinkNet";

    // ── Resolve active session for this user ────────────────────────────
    const { data: session } = await db
      .from("sessions")
      .select("nas_session_id, ip_address")
      .eq("username", username)
      .eq("tenant_id", tenantId)
      .is("ended_at", null)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const nasSessionId = session_id || session?.nas_session_id || null;

    // ── Build radclient command ─────────────────────────────────────────
    // We use radclient (installed with freeradius-utils) via a secure
    // internal HTTP call to the FreeRADIUS management API, OR we send
    // the CoA packet directly using a UDP socket.
    //
    // Since Deno edge functions cannot open raw UDP sockets, we call
    // the FreeRADIUS REST management endpoint (port 8080) which is
    // configured to accept CoA trigger requests from SmartLinkNet.
    // The FreeRADIUS server then sends the actual UDP CoA packet to MikroTik.

    const frManagementUrl = `http://${coaIp}:8080/coa`;

    const coaPayload: Record<string, string> = {
      "User-Name":    username,
      "NAS-IP-Address": coaIp,
    };

    if (nasSessionId) {
      coaPayload["Acct-Session-Id"] = nasSessionId;
    }

    if (action === "disconnect") {
      coaPayload["Packet-Type"] = "Disconnect-Request";
    } else if (action === "coa") {
      coaPayload["Packet-Type"] = "CoA-Request";
      if (new_rate_limit) {
        coaPayload["Mikrotik-Rate-Limit"] = new_rate_limit;
      }
    }

    // ── Send to FreeRADIUS management endpoint ──────────────────────────
    let frResponse: Response;
    try {
      frResponse = await fetch(frManagementUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-sln-secret": coaSecret,
        },
        body: JSON.stringify(coaPayload),
        signal: AbortSignal.timeout(10_000),
      });
    } catch (fetchErr: any) {
      // FreeRADIUS management endpoint unreachable — log and return error
      await db.from("provision_logs").insert({
        router_id: null,
        tenant_id: tenantId,
        stage: "coa_failed",
        message: `CoA ${action} failed for ${username}: FreeRADIUS unreachable at ${coaIp}:8080 — ${fetchErr?.message}`,
        success: false,
      }).catch(() => {});
      return resp({ ok: false, error: "freeradius_unreachable", detail: fetchErr?.message });
    }

    const frResult = frResponse.ok ? await frResponse.json().catch(() => ({})) : {};

    // ── Log the CoA action ──────────────────────────────────────────────
    await db.from("auth_events").insert({
      tenant_id: tenantId,
      username,
      event_type: action === "disconnect" ? "coa_disconnect" : "coa_update",
      raw_attrs: { action, new_rate_limit, nas_session_id: nasSessionId, fr_result: frResult },
      received_at: new Date().toISOString(),
    }).catch(() => {});

    // If disconnect, mark session as ended in DB
    if (action === "disconnect" && frResponse.ok) {
      await db.from("sessions").update({
        ended_at:      new Date().toISOString(),
        terminated_by: "Admin-CoA-Disconnect",
      })
      .eq("username", username)
      .eq("tenant_id", tenantId)
      .is("ended_at", null)
      .catch(() => {});
    }

    return resp({
      ok:      frResponse.ok,
      action,
      username,
      nas_session_id: nasSessionId,
      fr_status: frResponse.status,
    });

  } catch (err: any) {
    console.error("coa-send error:", err?.message);
    return resp({ error: "Internal error", detail: err?.message }, 500);
  }
});
