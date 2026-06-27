/**
 * SmartLinkNet — Phase 2: Centralized Accounting Service
 * Handles Acct-Start/Stop/Interim with redundancy and replication
 */

import { supabase } from "@/integrations/supabase/client";
import type {
  AccountingRecord, AccountingStatusType,
  TenantRef, NasDeviceRef, RadiusServerRef,
} from "../types";
import { nasManagement } from "./nas";

function now(): string { return new Date().toISOString(); }

export class AccountingService {

  /**
   * Process an accounting record from any NAS vendor.
   * Resolves tenant by NAS identifier/IP — never by hardcoded values.
   */
  async process(body: Record<string, unknown>): Promise<void> {
    const {
      nas_identifier, nas_ip, username, session_id,
      framed_ip, calling_station, called_station,
      acct_status_type, acct_input_octets = 0, acct_output_octets = 0,
      acct_session_time = 0, acct_input_packets = 0, acct_output_packets = 0,
      acct_terminate_cause, service_type, nas_port_type,
      raw_attrs = {}, tenant_id, received_by_server = null,
    } = body;

    if (!username || !acct_status_type) throw new Error("username and acct_status_type required");

    // Resolve tenant + NAS by identifier (UUID-based, not IP-based)
    let resolvedTenantId = tenant_id as string | null;
    let nasDeviceId: string | null = null;

    if (!resolvedTenantId) {
      const resolved = await nasManagement.resolveFromPacket({
        nasIdentifier: nas_identifier as string ?? null,
        nasIp:         nas_ip as string ?? null,
      });
      if (resolved) {
        resolvedTenantId = resolved.tenantId;
        nasDeviceId = resolved.nas.id;
      }
    }

    // Store accounting record (redundant write)
    const { data: acctRow, error: acctErr } = await (supabase as any)
      .from("radius_accounting")
      .insert({
        tenant_id:            resolvedTenantId,
        nas_id:               nasDeviceId,
        session_id,
        nas_identifier,
        username,
        framed_ip,
        calling_station,
        called_station,
        acct_status_type,
        acct_input_octets,
        acct_output_octets,
        acct_session_time,
        acct_input_packets,
        acct_output_packets,
        acct_terminate_cause,
        service_type,
        nas_port_type,
        raw_attrs,
        received_at:          now(),
        received_by_server:   received_by_server,
        is_replicated:        false,
      })
      .select("id")
      .single();

    if (acctErr) throw new Error(`Accounting insert failed: ${acctErr.message}`);

    // Process session state machine
    const statusType = acct_status_type as AccountingStatusType;
    await this._updateSessionState(
      resolvedTenantId, nasDeviceId, username as string, session_id as string,
      statusType,
      {
        framedIp:         framed_ip as string ?? null,
        callingStation:   calling_station as string ?? null,
        bytesIn:          acct_input_octets as number,
        bytesOut:         acct_output_octets as number,
        sessionTime:      acct_session_time as number,
        terminateCause:   acct_terminate_cause as string ?? null,
      }
    );

    // Update NAS last-seen
    if (nasDeviceId) {
      await nasManagement.touchLastSeen(nasDeviceId);
    }

    // Enqueue redundancy replication
    if (resolvedTenantId) {
      await this._enqueueReplication(resolvedTenantId, acctRow.id);
    }
  }

  /**
   * Session state machine:
   * Start → create session
   * Interim-Update → update bytes
   * Stop → close session + update subscription usage
   * Accounting-On/Off → NAS restart handling
   */
  private async _updateSessionState(
    tenantId: string | null,
    nasId: string | null,
    username: string,
    sessionId: string,
    statusType: AccountingStatusType,
    data: {
      framedIp: string | null;
      callingStation: string | null;
      bytesIn: number;
      bytesOut: number;
      sessionTime: number;
      terminateCause: string | null;
    }
  ): Promise<void> {
    const { data: sub } = await (supabase as any)
      .from("subscriptions")
      .select("id, customer_id, tenant_id")
      .eq("username", username)
      .eq("status", "active")
      .maybeSingle();

    if (statusType === "Start") {
      await (supabase as any).from("sessions").upsert({
        tenant_id:       tenantId ?? sub?.tenant_id,
        customer_id:     sub?.customer_id ?? null,
        subscription_id: sub?.id ?? null,
        username,
        nas_session_id:  sessionId,
        ip_address:      data.framedIp,
        mac_address:     data.callingStation,
        bytes_in:        data.bytesIn,
        bytes_out:       data.bytesOut,
        started_at:      now(),
      }, { onConflict: "username,tenant_id", ignoreDuplicates: false });

      // Fraud: concurrent session detection
      if (sub?.customer_id && tenantId) {
        await this._detectConcurrentSessions(tenantId, sub.customer_id, username);
      }
      // Fraud: MAC cloning detection
      if (data.callingStation && sub?.customer_id && tenantId) {
        await this._detectMacCloning(tenantId, sub.customer_id, data.callingStation, username);
      }

    } else if (statusType === "Interim-Update") {
      await (supabase as any)
        .from("sessions")
        .update({ bytes_in: data.bytesIn, bytes_out: data.bytesOut, updated_at: now() })
        .eq("username", username)
        .is("ended_at", null);

    } else if (statusType === "Stop") {
      await (supabase as any)
        .from("sessions")
        .update({
          bytes_in:         data.bytesIn,
          bytes_out:        data.bytesOut,
          duration_seconds: data.sessionTime,
          ended_at:         now(),
          terminated_by:    data.terminateCause ?? "User-Request",
        })
        .eq("username", username)
        .is("ended_at", null);

      // Update subscription data usage — atomic server-side increment via RPC
      if (sub?.id) {
        const totalMb = Math.ceil((data.bytesIn + data.bytesOut) / (1024 * 1024));
        const { error: rpcErr } = await (supabase as any)
          .rpc("fn_increment_data_usage", { _subscription_id: sub.id, _mb: totalMb });
        if (rpcErr) {
          // Fallback: read current value and write incremented value
          const { data: current } = await (supabase as any)
            .from("subscriptions").select("data_used_mb").eq("id", sub.id).single();
          await (supabase as any).from("subscriptions")
            .update({
              data_used_mb:   (current?.data_used_mb ?? 0) + totalMb,
              last_connected: now(),
            })
            .eq("id", sub.id);
        } else {
          await (supabase as any).from("subscriptions")
            .update({ last_connected: now() })
            .eq("id", sub.id);
        }
      }

    } else if (statusType === "Accounting-On" || statusType === "Accounting-Off") {
      // NAS reboot — mark all sessions from this NAS as ended
      if (nasId && statusType === "Accounting-Off") {
        await (supabase as any)
          .from("sessions")
          .update({ ended_at: now(), terminated_by: "NAS-Reboot" })
          .eq("tenant_id", tenantId)
          .is("ended_at", null);
      }
    }
  }

  // ── Fraud Detection ───────────────────────────────────────────────────────

  private async _detectConcurrentSessions(
    tenantId: string, customerId: string, username: string
  ): Promise<void> {
    const { data } = await (supabase as any)
      .from("sessions")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("customer_id", customerId)
      .is("ended_at", null);

    if ((data?.length ?? 0) > 3) {
      await (supabase as any).from("fraud_incidents").insert({
        tenant_id: tenantId, customer_id: customerId,
        type: "concurrent_login", severity: "medium",
        description: `Customer has ${data.length} concurrent sessions`,
        evidence: { username, session_count: data.length },
        status: "open",
      }).catch(() => {});
    }
  }

  private async _detectMacCloning(
    tenantId: string, customerId: string, mac: string, username: string
  ): Promise<void> {
    const { data } = await (supabase as any)
      .from("sessions")
      .select("customer_id")
      .eq("tenant_id", tenantId)
      .eq("mac_address", mac)
      .neq("customer_id", customerId)
      .is("ended_at", null)
      .limit(1);

    if (data?.length) {
      await (supabase as any).from("fraud_incidents").insert({
        tenant_id: tenantId, customer_id: customerId,
        type: "mac_cloning", severity: "high",
        description: `MAC ${mac} used by multiple accounts`,
        evidence: { mac, username },
        status: "open",
      }).catch(() => {});
    }
  }

  // ── Redundancy / Replication ──────────────────────────────────────────────

  private async _enqueueReplication(tenantId: string, acctId: string): Promise<void> {
    await (supabase as any).from("job_queue").insert({
      tenant_id:  tenantId,
      type:       "sync_router",
      payload:    { action: "replicate_accounting", acct_id: acctId },
      priority:   5,
      queue_name: "router_sync",
      run_at:     now(),
    }).catch(() => {});
  }

  // ── Queries ───────────────────────────────────────────────────────────────

  async getRecords(tenantId: TenantRef, opts: {
    username?: string;
    nasId?: string;
    statusType?: AccountingStatusType;
    since?: string;
    limit?: number;
  } = {}): Promise<AccountingRecord[]> {
    let q = (supabase as any)
      .from("radius_accounting")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("received_at", { ascending: false })
      .limit(opts.limit ?? 200);

    if (opts.username) q = q.ilike("username", `%${opts.username}%`);
    if (opts.nasId)    q = q.eq("nas_id", opts.nasId);
    if (opts.statusType) q = q.eq("acct_status_type", opts.statusType);
    if (opts.since)    q = q.gte("received_at", opts.since);

    const { data } = await q;
    return (data ?? []).map((r: Record<string, unknown>) => ({
      id:                 r["id"] as string,
      tenantId:           r["tenant_id"] as string,
      nasId:              r["nas_id"] as string | null,
      sessionId:          r["session_id"] as string | null,
      nasIdentifier:      r["nas_identifier"] as string | null,
      username:           r["username"] as string,
      framedIp:           r["framed_ip"] as string | null,
      callingStation:     r["calling_station"] as string | null,
      calledStation:      r["called_station"] as string | null,
      acctStatusType:     r["acct_status_type"] as AccountingStatusType,
      acctInputOctets:    r["acct_input_octets"] as number,
      acctOutputOctets:   r["acct_output_octets"] as number,
      acctSessionTime:    r["acct_session_time"] as number,
      acctInputPackets:   r["acct_input_packets"] as number,
      acctOutputPackets:  r["acct_output_packets"] as number,
      acctTerminateCause: r["acct_terminate_cause"] as string | null,
      serviceType:        r["service_type"] as string | null,
      nasPortType:        r["nas_port_type"] as string | null,
      rawAttrs:           r["raw_attrs"] as Record<string, unknown>,
      receivedAt:         r["received_at"] as string,
      receivedByServer:   r["received_by_server"] as string | null,
      isReplicated:       r["is_replicated"] as boolean,
    }));
  }

  async getStats(tenantId: TenantRef, since: string) {
    const [events, acctCount, activeSessions] = await Promise.all([
      (supabase as any).from("auth_events").select("event_type").eq("tenant_id", tenantId).gte("received_at", since),
      (supabase as any).from("radius_accounting").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).gte("received_at", since),
      (supabase as any).from("sessions").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).is("ended_at", null),
    ]);
    const ev = (events.data ?? []) as { event_type: string }[];
    const total = ev.length;
    const failures = ev.filter((e) => ["auth_failure", "auth_reject"].includes(e.event_type)).length;
    return {
      authSuccess:          ev.filter((e) => e.event_type === "auth_success").length,
      authFailure:          ev.filter((e) => e.event_type === "auth_failure").length,
      authReject:           ev.filter((e) => e.event_type === "auth_reject").length,
      acctRecords:          acctCount.count ?? 0,
      activeSessions:       activeSessions.count ?? 0,
      failureRatePercent:   total > 0 ? Math.round((failures / total) * 100) : 0,
    };
  }
}

export const accountingService = new AccountingService();
