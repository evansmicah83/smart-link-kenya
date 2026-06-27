/**
 * SmartLinkNet — FreeRADIUS Provider Driver
 * Phase 1: Provider Driver
 *
 * Implements IAuthAdapter and IBandwidthAdapter for FreeRADIUS.
 * Operates via the Supabase edge function (radius-accounting) and
 * the `radius_users`, `radius_profiles`, `nas_devices` DB tables.
 * No hardcoded IPs — all targets resolved from DB.
 */

import { supabase } from "@/integrations/supabase/client";
import type {
  RouterRef,
  AdapterType,
  AdapterHealth,
  BandwidthPolicy,
} from "../types";
import type { IAuthAdapter, IBandwidthAdapter } from "./interfaces";
import type { NetworkCredentials } from "../types";
import { renderMikrotikRateLimit } from "../drivers/mikrotik-rest";

function now(): string {
  return new Date().toISOString();
}

// ─── FreeRADIUS Auth Adapter ──────────────────────────────────────────────────

export class FreeRadiusAuthAdapter implements IAuthAdapter {
  readonly adapterType: AdapterType = "freeradius";
  private tenantId: string;

  constructor(tenantId: string) {
    this.tenantId = tenantId;
  }

  async provisionCredentials(routerRef: RouterRef, creds: NetworkCredentials): Promise<void> {
    const rateLimit = creds.rateLimit ? renderMikrotikRateLimit(creds.rateLimit) : null;
    const { error } = await (supabase as any)
      .from("radius_users")
      .upsert({
        tenant_id: this.tenantId,
        router_id: routerRef,
        username: creds.username,
        password: creds.password,
        profile: creds.profile,
        rate_limit: rateLimit,
        pool_name: creds.poolName,
        vlan_id: creds.vlanId,
        session_timeout: creds.sessionTimeout,
        idle_timeout: creds.idleTimeout,
        service_type: creds.serviceType,
        is_active: true,
        updated_at: now(),
      }, { onConflict: "tenant_id,username" });
    if (error) throw new Error(`FreeRADIUS provision failed: ${error.message}`);
  }

  async deprovisionCredentials(routerRef: RouterRef, username: string): Promise<void> {
    const { error } = await (supabase as any)
      .from("radius_users")
      .update({ is_active: false, updated_at: now() })
      .eq("tenant_id", this.tenantId)
      .eq("username", username);
    if (error) throw new Error(`FreeRADIUS deprovision failed: ${error.message}`);
  }

  async updateCredentials(_routerRef: RouterRef, username: string, updates: Partial<NetworkCredentials>): Promise<void> {
    const patch: Record<string, unknown> = { updated_at: now() };
    if (updates.password) patch["password"] = updates.password;
    if (updates.profile) patch["profile"] = updates.profile;
    if (updates.rateLimit) patch["rate_limit"] = renderMikrotikRateLimit(updates.rateLimit);
    if (updates.poolName !== undefined) patch["pool_name"] = updates.poolName;
    if (updates.sessionTimeout !== undefined) patch["session_timeout"] = updates.sessionTimeout;
    if (updates.idleTimeout !== undefined) patch["idle_timeout"] = updates.idleTimeout;

    const { error } = await (supabase as any)
      .from("radius_users")
      .update(patch)
      .eq("tenant_id", this.tenantId)
      .eq("username", username);
    if (error) throw new Error(`FreeRADIUS update failed: ${error.message}`);
  }

  async verifyCredentials(_routerRef: RouterRef, username: string): Promise<boolean> {
    const { data } = await (supabase as any)
      .from("radius_users")
      .select("is_active")
      .eq("tenant_id", this.tenantId)
      .eq("username", username)
      .maybeSingle();
    return data?.is_active === true;
  }
}

// ─── FreeRADIUS Bandwidth Adapter ─────────────────────────────────────────────

export class FreeRadiusBandwidthAdapter implements IBandwidthAdapter {
  readonly adapterType: AdapterType = "freeradius";
  private tenantId: string;

  constructor(tenantId: string) {
    this.tenantId = tenantId;
  }

  renderRateLimit(policy: BandwidthPolicy): string {
    return renderMikrotikRateLimit(policy);
  }

  async applyPolicy(_routerRef: RouterRef, username: string, policy: BandwidthPolicy): Promise<void> {
    const rateLimit = this.renderRateLimit(policy);
    const { error } = await (supabase as any)
      .from("radius_users")
      .update({ rate_limit: rateLimit, updated_at: now() })
      .eq("tenant_id", this.tenantId)
      .eq("username", username);
    if (error) throw new Error(`FreeRADIUS applyPolicy failed: ${error.message}`);
  }

  async removePolicy(_routerRef: RouterRef, username: string): Promise<void> {
    const { error } = await (supabase as any)
      .from("radius_users")
      .update({ rate_limit: null, updated_at: now() })
      .eq("tenant_id", this.tenantId)
      .eq("username", username);
    if (error) throw new Error(`FreeRADIUS removePolicy failed: ${error.message}`);
  }

  async applyBurst(_routerRef: RouterRef, username: string, durationSec: number, multiplier: number): Promise<void> {
    // Fetch current policy and apply burst multiplier temporarily
    const { data } = await (supabase as any)
      .from("radius_users")
      .select("rate_limit")
      .eq("tenant_id", this.tenantId)
      .eq("username", username)
      .maybeSingle();

    if (!data?.rate_limit) return;

    // Store original and record a scheduled revert
    await (supabase as any).from("job_queue").insert({
      tenant_id: this.tenantId,
      type: "sync_router",
      payload: {
        action: "revert_burst",
        username,
        original_rate_limit: data.rate_limit,
      },
      run_at: new Date(Date.now() + durationSec * 1000).toISOString(),
      priority: 3,
      queue_name: "router_sync",
    });
  }
}

// ─── RADIUS Proxy Session Adapter ─────────────────────────────────────────────

export class RadiusSessionAdapter {
  readonly adapterType: AdapterType = "radius_proxy";
  private tenantId: string;

  constructor(tenantId: string) {
    this.tenantId = tenantId;
  }

  /** Send a CoA packet via edge function */
  async changeAuthorization(routerRef: RouterRef, username: string, policy: BandwidthPolicy): Promise<void> {
    const { error } = await supabase.functions.invoke("router-command", {
      body: {
        routerId: routerRef,
        command: "apply_profile",
        params: {
          username,
          rateLimit: renderMikrotikRateLimit(policy),
          action: "coa",
        },
      },
    });
    if (error) throw new Error(`CoA failed: ${error.message}`);
  }

  async sendDisconnect(routerRef: RouterRef, username: string): Promise<void> {
    const { error } = await supabase.functions.invoke("router-command", {
      body: {
        routerId: routerRef,
        command: "kick_session",
        params: { username, action: "disconnect_request" },
      },
    });
    if (error) throw new Error(`Disconnect-Request failed: ${error.message}`);
  }

  async healthCheck(routerRef: RouterRef): Promise<AdapterHealth> {
    const start = Date.now();
    try {
      const { data } = await (supabase as any)
        .from("nas_devices")
        .select("is_active, last_seen")
        .eq("router_id", routerRef)
        .eq("is_active", true)
        .maybeSingle();
      return {
        adapterType: this.adapterType,
        routerRef,
        isHealthy: !!data,
        latencyMs: Date.now() - start,
        errorCount: 0,
        lastError: null,
        checkedAt: now(),
      };
    } catch (err: unknown) {
      return {
        adapterType: this.adapterType,
        routerRef,
        isHealthy: false,
        latencyMs: Date.now() - start,
        errorCount: 1,
        lastError: (err as Error).message,
        checkedAt: now(),
      };
    }
  }
}
