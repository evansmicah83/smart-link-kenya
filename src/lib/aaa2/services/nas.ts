/**
 * SmartLinkNet — Phase 2: NAS Management Service
 * Multi-NAS environments, vendor-agnostic, UUID-referenced
 */

import { supabase } from "@/integrations/supabase/client";
import type {
  NasDevice, NasDeviceRef, TenantRef,
  NasHealthSnapshot, NasVendor,
} from "../types";

function now(): string { return new Date().toISOString(); }

function mapRow(r: Record<string, unknown>): NasDevice {
  return {
    id:                    r["id"] as string,
    tenantId:              r["tenant_id"] as string,
    routerId:              r["router_id"] as string | null ?? null,
    name:                  r["name"] as string,
    description:           r["description"] as string | null ?? null,
    vendor:                (r["vendor"] as NasVendor) ?? "mikrotik",
    nasIdentifier:         r["nas_identifier"] as string | null ?? null,
    nasIp:                 r["nas_ip"] as string | null ?? null,
    sharedSecret:          r["shared_secret"] as string,
    authPort:              r["auth_port"] as number ?? 1812,
    acctPort:              r["acct_port"] as number ?? 1813,
    coaPort:               r["coa_port"] as number ?? 3799,
    isActive:              r["is_active"] as boolean ?? true,
    lastSeen:              r["last_seen"] as string | null ?? null,
    radiusServerId:        r["radius_server_id"] as string | null ?? null,
    dynamicVlanEnabled:    r["dynamic_vlan_enabled"] as boolean ?? false,
    dynamicProfileEnabled: r["dynamic_profile_enabled"] as boolean ?? true,
    dynamicIpEnabled:      r["dynamic_ip_enabled"] as boolean ?? false,
    createdAt:             r["created_at"] as string,
    updatedAt:             r["updated_at"] as string,
  };
}

export class NasManagementService {

  // ── CRUD ───────────────────────────────────────────────────────────────────

  async list(tenantId: TenantRef): Promise<(NasDevice & { routerName?: string })[]> {
    const { data, error } = await (supabase as any)
      .from("nas_devices")
      .select("*, routers(name, status)")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map((r: any) => ({
      ...mapRow(r),
      routerName: r.routers?.name ?? null,
      routerStatus: r.routers?.status ?? null,
    }));
  }

  async get(nasId: NasDeviceRef): Promise<NasDevice | null> {
    const { data } = await (supabase as any)
      .from("nas_devices").select("*").eq("id", nasId).maybeSingle();
    return data ? mapRow(data) : null;
  }

  async save(tenantId: TenantRef, nas: Partial<NasDevice> & Record<string, unknown> & { name: string; sharedSecret?: string }): Promise<NasDevice> {
    // Accept both camelCase (typed) and snake_case (from HTML form)
    const r = nas as Record<string, unknown>;
    const sharedSecret = (r["sharedSecret"] ?? r["shared_secret"] ?? "") as string;
    const radiusServerId = (r["radiusServerId"] ?? r["radius_server_id"] ?? null) as string | null;
    const payload = {
      tenant_id:               tenantId,
      router_id:               (r["routerId"] ?? r["router_id"] ?? null) as string | null,
      name:                    r["name"] as string,
      description:             (r["description"] ?? null) as string | null,
      vendor:                  (r["vendor"] ?? "mikrotik") as string,
      nas_identifier:          (r["nasIdentifier"] ?? r["nas_identifier"] ?? null) as string | null,
      nas_ip:                  (r["nasIp"] ?? r["nas_ip"] ?? null) as string | null,
      shared_secret:           sharedSecret,
      auth_port:               (r["authPort"] ?? r["auth_port"] ?? 1812) as number,
      acct_port:               (r["acctPort"] ?? r["acct_port"] ?? 1813) as number,
      coa_port:                (r["coaPort"] ?? r["coa_port"] ?? 3799) as number,
      is_active:               (r["isActive"] ?? r["is_active"] ?? true) as boolean,
      radius_server_id:        radiusServerId || null,
      dynamic_vlan_enabled:    (r["dynamicVlanEnabled"] ?? r["dynamic_vlan_enabled"] ?? false) as boolean,
      dynamic_profile_enabled: (r["dynamicProfileEnabled"] ?? r["dynamic_profile_enabled"] ?? true) as boolean,
      dynamic_ip_enabled:      (r["dynamicIpEnabled"] ?? r["dynamic_ip_enabled"] ?? false) as boolean,
      updated_at:              now(),
    };

    if (nas.id) {
      const { data, error } = await (supabase as any)
        .from("nas_devices").update(payload).eq("id", nas.id).select().single();
      if (error) throw new Error(error.message);
      return mapRow(data);
    }
    const { data, error } = await (supabase as any)
      .from("nas_devices").insert(payload).select().single();
    if (error) throw new Error(error.message);
    return mapRow(data);
  }

  async delete(nasId: NasDeviceRef): Promise<void> {
    const { error } = await (supabase as any).from("nas_devices").delete().eq("id", nasId);
    if (error) throw new Error(error.message);
  }

  async setActive(nasId: NasDeviceRef, isActive: boolean): Promise<void> {
    await (supabase as any)
      .from("nas_devices")
      .update({ is_active: isActive, updated_at: now() })
      .eq("id", nasId);
  }

  // ── Resolution (by NAS-Identifier or NAS-IP) ──────────────────────────────

  /**
   * Resolve NAS from RADIUS packet attributes.
   * Uses DB lookup — never hardcoded IP matching.
   */
  async resolveFromPacket(opts: {
    nasIdentifier?: string | null;
    nasIp?: string | null;
  }): Promise<{ nas: NasDevice; tenantId: TenantRef } | null> {
    let data: Record<string, unknown> | null = null;

    if (opts.nasIdentifier) {
      const res = await (supabase as any)
        .from("nas_devices").select("*")
        .eq("nas_identifier", opts.nasIdentifier)
        .eq("is_active", true).maybeSingle();
      data = res.data;
    }

    if (!data && opts.nasIp) {
      const res = await (supabase as any)
        .from("nas_devices").select("*")
        .eq("nas_ip", opts.nasIp)
        .eq("is_active", true).maybeSingle();
      data = res.data;
    }

    if (!data) return null;
    const nas = mapRow(data);
    return { nas, tenantId: nas.tenantId };
  }

  // ── Last Seen ─────────────────────────────────────────────────────────────

  async touchLastSeen(nasId: NasDeviceRef): Promise<void> {
    await (supabase as any)
      .from("nas_devices")
      .update({ last_seen: now(), updated_at: now() })
      .eq("id", nasId);
  }

  // ── Health Snapshots ──────────────────────────────────────────────────────

  async getHealthSnapshots(tenantId: TenantRef): Promise<NasHealthSnapshot[]> {
    const devices = await this.list(tenantId);
    const since1h = new Date(Date.now() - 3600000).toISOString();

    return Promise.all(devices.map(async (nas) => {
      const [sessions, authEvents, acctRows] = await Promise.all([
        (supabase as any).from("sessions")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", tenantId)
          .is("ended_at", null),
        (supabase as any).from("auth_events")
          .select("event_type")
          .eq("tenant_id", tenantId)
          .eq("nas_id", nas.id)
          .gte("received_at", since1h),
        (supabase as any).from("radius_accounting")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", tenantId)
          .eq("nas_id", nas.id)
          .gte("received_at", since1h),
      ]);

      const ev = (authEvents.data ?? []) as { event_type: string }[];
      return {
        nasId:               nas.id,
        nasName:             nas.name,
        vendor:              nas.vendor,
        isActive:            nas.isActive,
        lastSeen:            nas.lastSeen,
        activeSessionCount:  sessions.count ?? 0,
        authSuccessLast1h:   ev.filter((e) => e.event_type === "auth_success").length,
        authFailureLast1h:   ev.filter((e) => ["auth_failure", "auth_reject"].includes(e.event_type)).length,
        acctRecordsLast1h:   acctRows.count ?? 0,
      } satisfies NasHealthSnapshot;
    }));
  }
}

export const nasManagement = new NasManagementService();
