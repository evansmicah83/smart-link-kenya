/**
 * SmartLinkNet — radius-accounting Edge Function (Phase 2)
 * Centralized Accounting with redundancy, multi-NAS, failover support.
 * Supports FreeRADIUS rlm_rest, MikroTik, and generic NAS vendors.
 */

/// <reference path="../types.d.ts" />
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createSupabaseClient, now, resolveNasDevice, verifyNasSecret } from "../lib/radius-common.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-nas-secret",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const sb = createSupabaseClient();

  try {
    const authSecret = req.headers.get("x-nas-secret") ?? null;
    const body = await req.json();
    const {
      nas_identifier, nas_ip, username, session_id,
      framed_ip, calling_station, called_station,
      acct_status_type,
      acct_input_octets   = 0,
      acct_output_octets  = 0,
      acct_session_time   = 0,
      acct_input_packets  = 0,
      acct_output_packets = 0,
      acct_terminate_cause,
      service_type, nas_port_type,
      raw_attrs = {},
      tenant_id,
      received_by_server = null,
    } = body;

    if (!username || !acct_status_type) {
      return resp({ error: "username and acct_status_type required" }, 400);
    }

    const nasDevice = await resolveNasDevice(sb, nas_identifier ?? null, nas_ip ?? null);
    if (!nasDevice) {
      return resp({ error: "Unknown NAS" }, 200);
    }
    if (!verifyNasSecret(nasDevice, authSecret)) {
      return resp({ error: "NAS authentication failed" }, 403);
    }

    if (tenant_id && tenant_id !== nasDevice.tenant_id) {
      return resp({ error: "Tenant mismatch" }, 403);
    }

    let resolvedTenantId: string | null = tenant_id ?? nasDevice.tenant_id;
    const nasDeviceId: string | null = nasDevice.id;

    if (!resolvedTenantId) {
      return resp({ error: "Tenant resolution failed" }, 200);
    }

    // 2. Store accounting record (primary write)
    const { data: acctRow } = await sb.from("radius_accounting").insert({
      tenant_id: resolvedTenantId,
      nas_id: nasDeviceId,
      session_id, nas_identifier, username,
      framed_ip, calling_station, called_station,
      acct_status_type,
      acct_input_octets, acct_output_octets, acct_session_time,
      acct_input_packets, acct_output_packets,
      acct_terminate_cause, service_type, nas_port_type,
      raw_attrs, received_at: now(),
      received_by_server, is_replicated: false,
    }).select("id").single();

    // 3. Resolve subscription by username
    const { data: sub } = await sb
      .from("subscriptions")
      .select("id, customer_id, tenant_id")
      .eq("username", username)
      .eq("status", "active")
      .maybeSingle();

    // 4. Session state machine
    if (acct_status_type === "Start") {
      await sb.from("sessions").upsert({
        tenant_id:       resolvedTenantId ?? sub?.tenant_id,
        customer_id:     sub?.customer_id ?? null,
        subscription_id: sub?.id ?? null,
        username, nas_session_id: session_id,
        ip_address: framed_ip, mac_address: calling_station,
        bytes_in: acct_input_octets, bytes_out: acct_output_octets,
        started_at: now(),
      }, { onConflict: "username,tenant_id", ignoreDuplicates: false });

      // Fraud: MAC cloning
      if (calling_station && sub?.customer_id && resolvedTenantId) {
        const { data: clash } = await sb.from("sessions")
          .select("customer_id").eq("tenant_id", resolvedTenantId)
          .eq("mac_address", calling_station).neq("customer_id", sub.customer_id)
          .is("ended_at", null).limit(1);
        if (clash?.length) {
          await sb.from("fraud_incidents").insert({
            tenant_id: resolvedTenantId, customer_id: sub.customer_id,
            type: "mac_cloning", severity: "high",
            description: `MAC ${calling_station} used by multiple accounts`,
            evidence: { mac: calling_station, username }, status: "open",
          }).catch(() => {});
        }
      }

      // Fraud: concurrent sessions
      if (sub?.customer_id && resolvedTenantId) {
        const { data: concurr } = await sb.from("sessions")
          .select("id").eq("tenant_id", resolvedTenantId)
          .eq("customer_id", sub.customer_id).is("ended_at", null);
        if ((concurr?.length ?? 0) > 3) {
          await sb.from("fraud_incidents").insert({
            tenant_id: resolvedTenantId, customer_id: sub.customer_id,
            type: "concurrent_login", severity: "medium",
            description: `Customer has ${concurr?.length} concurrent sessions`,
            evidence: { username, count: concurr?.length }, status: "open",
          }).catch(() => {});
        }
      }

      // Record auth event
      await sb.from("auth_events").insert({
        tenant_id: resolvedTenantId, username,
        customer_id: sub?.customer_id ?? null,
        subscription_id: sub?.id ?? null,
        nas_id: nasDeviceId,
        event_type: "acct_start", received_at: now(),
      }).catch(() => {});

    } else if (acct_status_type === "Interim-Update") {
      await sb.from("sessions")
        .update({ bytes_in: acct_input_octets, bytes_out: acct_output_octets, updated_at: now() })
        .eq("username", username).is("ended_at", null);

      await sb.from("auth_events").insert({
        tenant_id: resolvedTenantId, username,
        customer_id: sub?.customer_id ?? null, nas_id: nasDeviceId,
        event_type: "acct_update", received_at: now(),
      }).catch(() => {});

    } else if (acct_status_type === "Stop") {
      await sb.from("sessions").update({
        bytes_in: acct_input_octets, bytes_out: acct_output_octets,
        duration_seconds: acct_session_time, ended_at: now(),
        terminated_by: acct_terminate_cause ?? "User-Request",
      }).eq("username", username).is("ended_at", null);

      // Update subscription usage
      if (sub?.id) {
        const totalMb = Math.ceil((acct_input_octets + acct_output_octets) / (1024 * 1024));
        await sb.from("subscriptions")
          .update({ last_connected: now() })
          .eq("id", sub.id).catch(() => {});
      }

      await sb.from("auth_events").insert({
        tenant_id: resolvedTenantId, username,
        customer_id: sub?.customer_id ?? null, nas_id: nasDeviceId,
        event_type: "acct_stop", received_at: now(),
      }).catch(() => {});

    } else if (acct_status_type === "Accounting-Off") {
      // NAS reboot — close all sessions from this NAS
      if (resolvedTenantId) {
        await sb.from("sessions")
          .update({ ended_at: now(), terminated_by: "NAS-Reboot" })
          .eq("tenant_id", resolvedTenantId)
          .is("ended_at", null).catch(() => {});
      }
    }

    // 5. Update NAS last_seen
    if (nasDeviceId) {
      await sb.from("nas_devices").update({ last_seen: now() }).eq("id", nasDeviceId).catch(() => {});
    }

    // 6. Enqueue replication job
    if (resolvedTenantId && acctRow?.id) {
      await sb.from("job_queue").insert({
        tenant_id: resolvedTenantId,
        type: "sync_router",
        payload: { action: "replicate_accounting", acct_id: acctRow.id },
        priority: 5, queue_name: "router_sync", run_at: now(),
      }).catch(() => {});
    }

    return resp({ ok: true });

  } catch (err: unknown) {
    return resp({ error: (err as Error).message }, 500);
  }
});

function resp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
