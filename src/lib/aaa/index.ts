/**
 * SmartLinkNet — AAA (Authentication, Authorization, Accounting)
 * FreeRADIUS, MikroTik, RouterOS, external RADIUS, multi-NAS support
 */
import { supabase } from "@/integrations/supabase/client";

export interface NasDevice {
  id?: string;
  tenant_id: string;
  router_id?: string | null;
  name: string;
  description?: string | null;
  vendor: "mikrotik" | "cisco" | "ubiquiti" | "freeradius" | "generic";
  nas_identifier?: string | null;
  nas_ip?: string | null;
  shared_secret: string;
  auth_port: number;
  acct_port: number;
  coa_port: number;
  is_active: boolean;
  last_seen?: string | null;
  created_at?: string;
}

export interface RadiusServer {
  id?: string;
  tenant_id: string;
  name: string;
  host: string;
  auth_port: number;
  acct_port: number;
  shared_secret: string;
  protocol: "pap" | "chap" | "mschapv2" | "eap";
  is_primary: boolean;
  is_active: boolean;
  timeout_ms: number;
  retry_count: number;
  priority: number;
  last_checked?: string | null;
  is_healthy?: boolean | null;
  created_at?: string;
}

export interface RadiusProfile {
  id?: string;
  tenant_id: string;
  package_id?: string | null;
  name: string;
  rate_limit?: string | null;
  speed_down_kbps?: number | null;
  speed_up_kbps?: number | null;
  burst_down_kbps?: number | null;
  burst_up_kbps?: number | null;
  burst_threshold_kbps?: number | null;
  burst_time_sec?: number | null;
  vlan_id?: number | null;
  ip_pool?: string | null;
  session_timeout?: number | null;
  idle_timeout?: number | null;
  attributes?: Record<string, unknown>;
  created_at?: string;
}

export interface AuthEvent {
  id?: string;
  tenant_id?: string | null;
  nas_id?: string | null;
  username: string;
  customer_id?: string | null;
  event_type: "auth_success" | "auth_failure" | "auth_reject" | "acct_start"
            | "acct_stop" | "acct_update" | "coa_request" | "disconnect_request";
  protocol?: string | null;
  ip_address?: string | null;
  mac_address?: string | null;
  nas_port?: string | null;
  reply_message?: string | null;
  attributes?: Record<string, unknown>;
  received_at?: string;
}

// NAS Device CRUD
export async function getNasDevices(tenantId: string): Promise<NasDevice[]> {
  const { data } = await (supabase as any)
    .from("nas_devices")
    .select("*, routers(name, status)")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });
  return (data ?? []) as NasDevice[];
}

export async function saveNasDevice(nas: NasDevice): Promise<void> {
  if (nas.id) {
    const { error } = await (supabase as any).from("nas_devices").update(nas).eq("id", nas.id);
    if (error) throw error;
  } else {
    const { error } = await (supabase as any).from("nas_devices").insert(nas);
    if (error) throw error;
  }
}

export async function deleteNasDevice(id: string): Promise<void> {
  const { error } = await (supabase as any).from("nas_devices").delete().eq("id", id);
  if (error) throw error;
}

// RADIUS Servers
export async function getRadiusServers(tenantId: string): Promise<RadiusServer[]> {
  const { data } = await (supabase as any)
    .from("radius_servers")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("priority");
  return (data ?? []) as RadiusServer[];
}

export async function saveRadiusServer(server: RadiusServer): Promise<void> {
  if (server.id) {
    const { error } = await (supabase as any).from("radius_servers").update(server).eq("id", server.id);
    if (error) throw error;
  } else {
    const { error } = await (supabase as any).from("radius_servers").insert(server);
    if (error) throw error;
  }
}

export async function deleteRadiusServer(id: string): Promise<void> {
  const { error } = await (supabase as any).from("radius_servers").delete().eq("id", id);
  if (error) throw error;
}

// RADIUS Profiles
export async function getRadiusProfiles(tenantId: string): Promise<RadiusProfile[]> {
  const { data } = await (supabase as any)
    .from("radius_profiles")
    .select("*, packages(name)")
    .eq("tenant_id", tenantId)
    .order("name");
  return (data ?? []) as RadiusProfile[];
}

export async function saveRadiusProfile(profile: RadiusProfile): Promise<void> {
  if (profile.id) {
    const { error } = await (supabase as any).from("radius_profiles").update(profile).eq("id", profile.id);
    if (error) throw error;
  } else {
    const { error } = await (supabase as any).from("radius_profiles").insert(profile);
    if (error) throw error;
  }
}

// Auth Events
export async function getAuthEvents(tenantId: string, opts: {
  eventType?: string; username?: string; limit?: number; since?: string;
} = {}): Promise<AuthEvent[]> {
  let q = (supabase as any)
    .from("auth_events")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("received_at", { ascending: false })
    .limit(opts.limit ?? 200);
  if (opts.eventType) q = q.eq("event_type", opts.eventType);
  if (opts.username) q = q.ilike("username", `%${opts.username}%`);
  if (opts.since) q = q.gte("received_at", opts.since);
  const { data } = await q;
  return (data ?? []) as AuthEvent[];
}

export async function getRadiusAccounting(tenantId: string, limit = 100) {
  const { data } = await (supabase as any)
    .from("radius_accounting")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("received_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as Record<string, unknown>[];
}

export async function getAaaStats(tenantId: string, since: string) {
  const [events, accounting] = await Promise.all([
    (supabase as any)
      .from("auth_events")
      .select("event_type")
      .eq("tenant_id", tenantId)
      .gte("received_at", since),
    (supabase as any)
      .from("radius_accounting")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .gte("received_at", since),
  ]);
  const ev = (events.data ?? []) as { event_type: string }[];
  return {
    authSuccess: ev.filter((e) => e.event_type === "auth_success").length,
    authFailure: ev.filter((e) => e.event_type === "auth_failure").length,
    authReject:  ev.filter((e) => e.event_type === "auth_reject").length,
    acctRecords: accounting.count ?? 0,
    failureRate: ev.length > 0
      ? Math.round((ev.filter((e) => e.event_type !== "auth_success").length / ev.length) * 100)
      : 0,
  };
}

export function buildMikrotikRateLimit(downKbps: number, upKbps: number, burstDown?: number, burstUp?: number): string {
  const down = downKbps >= 1024 ? `${downKbps / 1024}M` : `${downKbps}k`;
  const up   = upKbps >= 1024 ? `${upKbps / 1024}M` : `${upKbps}k`;
  if (burstDown && burstUp) {
    const bd = burstDown >= 1024 ? `${burstDown / 1024}M` : `${burstDown}k`;
    const bu = burstUp >= 1024 ? `${burstUp / 1024}M` : `${burstUp}k`;
    return `${down}/${up} ${bd}/${bu}`;
  }
  return `${down}/${up}`;
}

export const NAS_VENDOR_LABELS: Record<string, string> = {
  mikrotik:   "MikroTik",
  cisco:      "Cisco",
  ubiquiti:   "Ubiquiti",
  freeradius: "FreeRADIUS",
  generic:    "Generic",
};

export const RADIUS_PROTOCOL_LABELS: Record<string, string> = {
  pap:       "PAP",
  chap:      "CHAP",
  mschapv2:  "MS-CHAPv2",
  eap:       "EAP",
};
