/**
 * SmartLinkNet — Bandwidth Abstraction Service
 * Phase 1: Network Foundation
 *
 * Unified bandwidth policy management across all NAS types.
 */

import { supabase } from "@/integrations/supabase/client";
import { adapterFactory } from "../adapters/factory";
import type { RouterRef, CustomerRef, PackageRef, TenantRef, BandwidthPolicy } from "../types";

export class BandwidthService {
  /**
   * Apply the bandwidth policy from a package to all active sessions
   * for a customer. Resolves everything from UUIDs.
   */
  async applyPackagePolicy(
    tenantRef: TenantRef,
    customerRef: CustomerRef,
    packageRef: PackageRef
  ): Promise<void> {
    const { data: pkg } = await supabase
      .from("packages")
      .select("speed_down_kbps, speed_up_kbps, burst_down_kbps, burst_up_kbps, burst_threshold_kbps, burst_time_sec")
      .eq("id", packageRef)
      .maybeSingle();

    if (!pkg?.speed_down_kbps) return;

    const policy: BandwidthPolicy = {
      policyRef: packageRef,
      downloadKbps: pkg.speed_down_kbps,
      uploadKbps: pkg.speed_up_kbps ?? pkg.speed_down_kbps,
      burstDownKbps: pkg.burst_down_kbps ?? null,
      burstUpKbps: pkg.burst_up_kbps ?? null,
      burstThresholdKbps: pkg.burst_threshold_kbps ?? null,
      burstTimeSec: pkg.burst_time_sec ?? null,
      priority: 8,
    };

    const { data: sessions } = await supabase
      .from("sessions")
      .select("router_id, username")
      .eq("tenant_id", tenantRef)
      .eq("customer_id", customerRef)
      .is("ended_at", null);

    for (const s of sessions ?? []) {
      try {
        const adapter = await adapterFactory.getBandwidthAdapter(s.router_id);
        await adapter.applyPolicy(s.router_id, s.username ?? "", policy);
      } catch {
        // non-blocking
      }
    }
  }

  /**
   * Render a bandwidth policy to the vendor-specific string for a router.
   * Used by UI to preview what will be applied.
   */
  async renderPolicy(routerRef: RouterRef, policy: BandwidthPolicy): Promise<string> {
    const adapter = await adapterFactory.getBandwidthAdapter(routerRef);
    return adapter.renderRateLimit(policy);
  }

  /**
   * Apply a temporary speed burst to a subscriber.
   * Automatically reverts after durationSec via job queue.
   */
  async applyBurst(
    tenantRef: TenantRef,
    customerRef: CustomerRef,
    durationSec: number,
    multiplier = 2
  ): Promise<void> {
    const { data: sessions } = await supabase
      .from("sessions")
      .select("router_id, username")
      .eq("tenant_id", tenantRef)
      .eq("customer_id", customerRef)
      .is("ended_at", null);

    for (const s of sessions ?? []) {
      try {
        const adapter = await adapterFactory.getBandwidthAdapter(s.router_id);
        await adapter.applyBurst(s.router_id, s.username ?? "", durationSec, multiplier);
      } catch {
        // non-blocking
      }
    }
  }

  /**
   * Remove all bandwidth limits from a subscriber.
   */
  async removePolicy(
    tenantRef: TenantRef,
    customerRef: CustomerRef
  ): Promise<void> {
    const { data: sessions } = await supabase
      .from("sessions")
      .select("router_id, username")
      .eq("tenant_id", tenantRef)
      .eq("customer_id", customerRef)
      .is("ended_at", null);

    for (const s of sessions ?? []) {
      try {
        const adapter = await adapterFactory.getBandwidthAdapter(s.router_id);
        await adapter.removePolicy(s.router_id, s.username ?? "");
      } catch {
        // non-blocking
      }
    }
  }

  /**
   * Build a BandwidthPolicy from raw Kbps values.
   * Used by UI forms before persisting to packages table.
   */
  buildPolicy(
    packageRef: PackageRef | null,
    downloadKbps: number,
    uploadKbps: number,
    options: Partial<Omit<BandwidthPolicy, "policyRef" | "downloadKbps" | "uploadKbps">> = {}
  ): BandwidthPolicy {
    return {
      policyRef: packageRef,
      downloadKbps,
      uploadKbps,
      burstDownKbps: options.burstDownKbps ?? null,
      burstUpKbps: options.burstUpKbps ?? null,
      burstThresholdKbps: options.burstThresholdKbps ?? null,
      burstTimeSec: options.burstTimeSec ?? null,
      priority: options.priority ?? 8,
    };
  }
}

export const bandwidthService = new BandwidthService();
