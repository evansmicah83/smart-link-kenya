/**
 * SmartLinkNet — Adapter Factory & Registry
 * Phase 1: Vendor Adapter Architecture
 *
 * Resolves the correct adapter for any router by its UUID.
 * Business logic never instantiates adapters directly.
 */

import { supabase } from "@/integrations/supabase/client";
import type { RouterRef, RouterConnectionConfig, AdapterType } from "../types";
import type { IAdapterFactory, IRouterAdapter, ISessionAdapter, IAuthAdapter, IBandwidthAdapter } from "./interfaces";
import { MikrotikRestAdapter } from "../drivers/mikrotik-rest";
import { FreeRadiusAuthAdapter, FreeRadiusBandwidthAdapter, RadiusSessionAdapter } from "./freeradius";
import { MikrotikUserManagerAdapter } from "./user-manager";

// ─── Router DB Row ────────────────────────────────────────────────────────────

interface RouterRow {
  id: string;
  connection_string: string | null;
  ip_address: string | null;
  api_port: number | null;
  api_username: string | null;
  api_password: string | null;
  use_ssl: boolean | null;
  vendor: string | null;
  tenant_id: string;
  primary_adapter_type: AdapterType | null;
}

// ─── In-memory adapter cache (cleared on auth state change) ──────────────────

const routerCache = new Map<string, RouterRow>();
const adapterCache = new Map<string, IRouterAdapter>();

export function clearAdapterCache(): void {
  routerCache.clear();
  adapterCache.clear();
}

// ─── Router Resolver ──────────────────────────────────────────────────────────

async function resolveRouter(routerRef: RouterRef): Promise<RouterRow> {
  const cached = routerCache.get(routerRef);
  if (cached) return cached;

  const { data, error } = await supabase
    .from("routers")
    .select("id,connection_string,ip_address,api_port,api_username,api_password,use_ssl,vendor,tenant_id,primary_adapter_type")
    .eq("id", routerRef)
    .maybeSingle();

  if (error || !data) throw new Error(`Router not found: ${routerRef}`);
  const row = data as RouterRow;
  routerCache.set(routerRef, row);
  return row;
}

function buildConnectionConfig(row: RouterRow): RouterConnectionConfig {
  const host = row.connection_string || row.ip_address;
  if (!host) throw new Error(`Router ${row.id} has no connection address configured`);
  return {
    host,
    port: row.api_port ?? 80,
    username: row.api_username ?? "",
    password: row.api_password ?? "",
    useSsl: row.use_ssl ?? false,
    timeoutMs: 8000,
    retryCount: 2,
  };
}

function resolveAdapterType(row: RouterRow): AdapterType {
  if (row.primary_adapter_type) return row.primary_adapter_type;
  if (row.vendor === "mikrotik") return "mikrotik_rest";
  if (row.vendor === "ubiquiti") return "ubiquiti";
  if (row.vendor === "cisco") return "cisco";
  return "generic_snmp";
}

// ─── Factory Implementation ───────────────────────────────────────────────────

export class AdapterFactory implements IAdapterFactory {
  async getRouterAdapter(routerRef: RouterRef): Promise<IRouterAdapter> {
    const cached = adapterCache.get(`router:${routerRef}`);
    if (cached) return cached;

    const row = await resolveRouter(routerRef);
    const cfg = buildConnectionConfig(row);
    const adapterType = resolveAdapterType(row);

    let adapter: IRouterAdapter;
    switch (adapterType) {
      case "mikrotik_rest":
      case "mikrotik_api":
        adapter = new MikrotikRestAdapter(routerRef, cfg);
        break;
      default:
        // Fallback — mikrotik_rest is the universal default
        adapter = new MikrotikRestAdapter(routerRef, cfg);
    }

    adapterCache.set(`router:${routerRef}`, adapter);
    return adapter;
  }

  async getSessionAdapter(routerRef: RouterRef): Promise<ISessionAdapter> {
    const row = await resolveRouter(routerRef);
    // Session management is performed via the router adapter itself
    // which implements getActiveSessions / kickSession
    const routerAdapter = await this.getRouterAdapter(routerRef);
    return new RouterAdapterSessionBridge(routerAdapter, row.tenant_id);
  }

  async getAuthAdapter(routerRef: RouterRef): Promise<IAuthAdapter> {
    const row = await resolveRouter(routerRef);
    const adapterType = resolveAdapterType(row);

    // If tenant has FreeRADIUS NAS device, use RADIUS auth
    const { data: nas } = await (supabase as any)
      .from("nas_devices")
      .select("id")
      .eq("router_id", routerRef)
      .eq("is_active", true)
      .maybeSingle();

    if (nas || adapterType === "freeradius" || adapterType === "radius_proxy") {
      return new FreeRadiusAuthAdapter(row.tenant_id);
    }
    // Check if tenant has User Manager feature enabled for this router
    const { data: umAdapter } = await (supabase as any)
      .from("network_adapters")
      .select("id")
      .eq("router_id", routerRef)
      .contains("supported_features", ["user_manager"])
      .maybeSingle();
    if (umAdapter) {
      const cfg = buildConnectionConfig(row);
      return new MikrotikUserManagerAdapter(routerRef, cfg);
    }
    // Fallback — direct router auth via adapter
    return new RouterAdapterAuthBridge(await this.getRouterAdapter(routerRef));
  }

  async getBandwidthAdapter(routerRef: RouterRef): Promise<IBandwidthAdapter> {
    const row = await resolveRouter(routerRef);
    const { data: nas } = await (supabase as any)
      .from("nas_devices")
      .select("id")
      .eq("router_id", routerRef)
      .eq("is_active", true)
      .maybeSingle();

    if (nas) return new FreeRadiusBandwidthAdapter(row.tenant_id);
    return new RouterAdapterBandwidthBridge(await this.getRouterAdapter(routerRef));
  }
}

// ─── Bridge: ISessionAdapter over IRouterAdapter ──────────────────────────────

class RouterAdapterSessionBridge implements ISessionAdapter {
  readonly adapterType: AdapterType;
  private router: IRouterAdapter;
  private tenantId: string;

  constructor(router: IRouterAdapter, tenantId: string) {
    this.router = router;
    this.adapterType = router.adapterType;
    this.tenantId = tenantId;
  }

  async listSessions(routerRef: RouterRef) {
    const result = await this.router.getActiveSessions();
    if (!result.success) throw new Error(result.error ?? "Failed to list sessions");
    return result.data ?? [];
  }

  async terminateSession(_routerRef: RouterRef, sessionRef: string): Promise<void> {
    const result = await this.router.kickSession(sessionRef);
    if (!result.success) throw new Error(result.error ?? "Failed to kick session");
  }

  async changeAuthorization(routerRef: RouterRef, username: string, policy: import("../types").BandwidthPolicy): Promise<void> {
    const result = await this.router.applyBandwidthPolicy(username, policy);
    if (!result.success) throw new Error(result.error ?? "CoA failed");
  }

  async sendDisconnect(routerRef: RouterRef, username: string): Promise<void> {
    const ra = new RadiusSessionAdapter(this.tenantId);
    await ra.sendDisconnect(routerRef, username);
  }
}

// ─── Bridge: IAuthAdapter over IRouterAdapter ─────────────────────────────────

class RouterAdapterAuthBridge implements IAuthAdapter {
  readonly adapterType: AdapterType;
  private router: IRouterAdapter;

  constructor(router: IRouterAdapter) {
    this.router = router;
    this.adapterType = router.adapterType;
  }

  async provisionCredentials(_routerRef: RouterRef, creds: import("../types").NetworkCredentials): Promise<void> {
    const result = await this.router.addUser(creds);
    if (!result.success) throw new Error(result.error ?? "Provision failed");
  }

  async deprovisionCredentials(_routerRef: RouterRef, username: string): Promise<void> {
    const result = await this.router.removeUser(username, "hotspot");
    if (!result.success) throw new Error(result.error ?? "Deprovision failed");
  }

  async updateCredentials(_routerRef: RouterRef, username: string, updates: Partial<import("../types").NetworkCredentials>): Promise<void> {
    const result = await this.router.updateUser(username, updates);
    if (!result.success) throw new Error(result.error ?? "Update failed");
  }

  async verifyCredentials(_routerRef: RouterRef, _username: string): Promise<boolean> {
    const result = await this.router.getStatus();
    return result.success;
  }
}

// ─── Bridge: IBandwidthAdapter over IRouterAdapter ────────────────────────────

class RouterAdapterBandwidthBridge implements IBandwidthAdapter {
  readonly adapterType: AdapterType;
  private router: IRouterAdapter;

  constructor(router: IRouterAdapter) {
    this.router = router;
    this.adapterType = router.adapterType;
  }

  renderRateLimit(policy: import("../types").BandwidthPolicy): string {
    const { renderMikrotikRateLimit } = require("../drivers/mikrotik-rest");
    return renderMikrotikRateLimit(policy);
  }

  async applyPolicy(_routerRef: RouterRef, username: string, policy: import("../types").BandwidthPolicy): Promise<void> {
    const result = await this.router.applyBandwidthPolicy(username, policy);
    if (!result.success) throw new Error(result.error ?? "Policy apply failed");
  }

  async removePolicy(_routerRef: RouterRef, username: string): Promise<void> {
    const result = await this.router.updateUser(username, { rateLimit: null });
    if (!result.success) throw new Error(result.error ?? "Policy remove failed");
  }

  async applyBurst(_routerRef: RouterRef, _username: string, _durationSec: number, _multiplier: number): Promise<void> {
    // Not supported on direct router adapters without RADIUS CoA
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

export const adapterFactory = new AdapterFactory();
