/**
 * SmartLinkNet — Phase 2: RADIUS Profile Management Service
 * Dynamic VLAN, Profile, IP, Bandwidth assignment
 */

import { supabase } from "@/integrations/supabase/client";
import type { RadiusProfile, RadiusProfileRef, TenantRef } from "../types";
import { renderMikrotikRateLimit } from "@/lib/network/drivers/mikrotik-rest";

function now(): string { return new Date().toISOString(); }

function mapRow(r: Record<string, unknown>): RadiusProfile {
  return {
    id:                   r["id"] as string,
    tenantId:             r["tenant_id"] as string,
    packageId:            r["package_id"] as string | null ?? null,
    name:                 r["name"] as string,
    rateLimit:            r["rate_limit"] as string | null ?? null,
    speedDownKbps:        r["speed_down_kbps"] as number | null ?? null,
    speedUpKbps:          r["speed_up_kbps"] as number | null ?? null,
    burstDownKbps:        r["burst_down_kbps"] as number | null ?? null,
    burstUpKbps:          r["burst_up_kbps"] as number | null ?? null,
    burstThresholdKbps:   r["burst_threshold_kbps"] as number | null ?? null,
    burstTimeSec:         r["burst_time_sec"] as number | null ?? null,
    vlanId:               r["vlan_id"] as number | null ?? null,
    vlanName:             r["vlan_name"] as string | null ?? null,
    ipPool:               r["ip_pool"] as string | null ?? null,
    ipPoolRef:            r["ip_pool_ref"] as string | null ?? null,
    sessionTimeout:       r["session_timeout"] as number | null ?? null,
    idleTimeout:          r["idle_timeout"] as number | null ?? null,
    simultaneousUse:      r["simultaneous_use"] as number | null ?? null,
    attributes:           (r["attributes"] as Record<string, unknown>) ?? {},
    createdAt:            r["created_at"] as string,
    updatedAt:            r["updated_at"] as string,
  };
}

export class RadiusProfileService {

  async list(tenantId: TenantRef): Promise<(RadiusProfile & { packageName?: string })[]> {
    const { data, error } = await (supabase as any)
      .from("radius_profiles")
      .select("*, packages(name)")
      .eq("tenant_id", tenantId)
      .order("name");
    if (error) throw new Error(error.message);
    return (data ?? []).map((r: any) => ({ ...mapRow(r), packageName: r.packages?.name ?? null }));
  }

  async get(profileId: RadiusProfileRef): Promise<RadiusProfile | null> {
    const { data } = await (supabase as any)
      .from("radius_profiles").select("*").eq("id", profileId).maybeSingle();
    return data ? mapRow(data) : null;
  }

  async getByPackage(tenantId: TenantRef, packageId: string): Promise<RadiusProfile | null> {
    const { data } = await (supabase as any)
      .from("radius_profiles").select("*")
      .eq("tenant_id", tenantId).eq("package_id", packageId).maybeSingle();
    return data ? mapRow(data) : null;
  }

  async save(tenantId: TenantRef, profile: Partial<RadiusProfile> & { name: string }): Promise<RadiusProfile> {
    // Auto-build rate_limit string from kbps values if not explicitly set
    const rateLimit = profile.rateLimit
      ?? (profile.speedDownKbps
        ? renderMikrotikRateLimit({
            policyRef: null,
            downloadKbps:       profile.speedDownKbps,
            uploadKbps:         profile.speedUpKbps ?? profile.speedDownKbps,
            burstDownKbps:      profile.burstDownKbps ?? null,
            burstUpKbps:        profile.burstUpKbps ?? null,
            burstThresholdKbps: profile.burstThresholdKbps ?? null,
            burstTimeSec:       profile.burstTimeSec ?? null,
            priority:           8,
          })
        : null);

    const payload = {
      tenant_id:            tenantId,
      package_id:           profile.packageId ?? null,
      name:                 profile.name,
      rate_limit:           rateLimit,
      speed_down_kbps:      profile.speedDownKbps ?? null,
      speed_up_kbps:        profile.speedUpKbps ?? null,
      burst_down_kbps:      profile.burstDownKbps ?? null,
      burst_up_kbps:        profile.burstUpKbps ?? null,
      burst_threshold_kbps: profile.burstThresholdKbps ?? null,
      burst_time_sec:       profile.burstTimeSec ?? null,
      vlan_id:              profile.vlanId ?? null,
      vlan_name:            profile.vlanName ?? null,
      ip_pool:              profile.ipPool ?? null,
      ip_pool_ref:          profile.ipPoolRef ?? null,
      session_timeout:      profile.sessionTimeout ?? null,
      idle_timeout:         profile.idleTimeout ?? null,
      simultaneous_use:     profile.simultaneousUse ?? null,
      attributes:           profile.attributes ?? {},
      updated_at:           now(),
    };

    if (profile.id) {
      const { data, error } = await (supabase as any)
        .from("radius_profiles").update(payload).eq("id", profile.id).select().single();
      if (error) throw new Error(error.message);
      return mapRow(data);
    }
    const { data, error } = await (supabase as any)
      .from("radius_profiles").insert(payload).select().single();
    if (error) throw new Error(error.message);
    return mapRow(data);
  }

  async delete(profileId: RadiusProfileRef): Promise<void> {
    const { error } = await (supabase as any).from("radius_profiles").delete().eq("id", profileId);
    if (error) throw new Error(error.message);
  }

  /**
   * Auto-sync profile to radius_users for all active subscribers on this package.
   * Called after profile update.
   */
  async propagateToSubscribers(tenantId: TenantRef, profileId: RadiusProfileRef): Promise<number> {
    const profile = await this.get(profileId);
    if (!profile || !profile.packageId) return 0;

    const { data: subs } = await (supabase as any)
      .from("subscriptions")
      .select("id, username")
      .eq("tenant_id", tenantId)
      .eq("package_id", profile.packageId)
      .eq("status", "active");

    let count = 0;
    for (const sub of subs ?? []) {
      await (supabase as any).from("radius_users")
        .update({
          profile:        profile.name,
          rate_limit:     profile.rateLimit,
          vlan_id:        profile.vlanId,
          pool_name:      profile.ipPool,
          session_timeout:profile.sessionTimeout,
          idle_timeout:   profile.idleTimeout,
          updated_at:     now(),
        })
        .eq("tenant_id", tenantId)
        .eq("username", sub.username)
        .catch(() => {});
      count++;
    }
    return count;
  }
}

export const radiusProfileService = new RadiusProfileService();
