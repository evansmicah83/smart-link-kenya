/**
 * SmartLinkNet — Authentication Abstraction Service
 * Phase 1: Network Foundation
 *
 * Unified subscriber provisioning across all NAS types.
 * Callers use UUID references only.
 */

import { supabase } from "@/integrations/supabase/client";
import { adapterFactory } from "../adapters/factory";
import { recordProvisioningEvent } from "./telemetry";
import type {
  RouterRef,
  CustomerRef,
  PackageRef,
  TenantRef,
  NetworkCredentials,
  BandwidthPolicy,
  ServiceType,
} from "../types";

// ─── Package → BandwidthPolicy resolver ──────────────────────────────────────

async function resolveBandwidthPolicy(packageRef: PackageRef): Promise<BandwidthPolicy | null> {
  const { data } = await supabase
    .from("packages")
    .select("id, speed_down_kbps, speed_up_kbps, burst_down_kbps, burst_up_kbps, burst_threshold_kbps, burst_time_sec, priority")
    .eq("id", packageRef)
    .maybeSingle();
  if (!data || (!data.speed_down_kbps && !data.speed_up_kbps)) return null;
  return {
    policyRef: packageRef,
    downloadKbps: data.speed_down_kbps ?? 0,
    uploadKbps: data.speed_up_kbps ?? 0,
    burstDownKbps: data.burst_down_kbps ?? null,
    burstUpKbps: data.burst_up_kbps ?? null,
    burstThresholdKbps: data.burst_threshold_kbps ?? null,
    burstTimeSec: data.burst_time_sec ?? null,
    priority: data.priority ?? 8,
  };
}

// ─── Auth Service ─────────────────────────────────────────────────────────────

export class AuthService {
  /**
   * Provision a subscriber on all routers assigned to a subscription.
   * Resolves bandwidth policy from package UUID.
   */
  async provisionSubscriber(
    tenantRef: TenantRef,
    subscriptionRef: string,
    routerRef: RouterRef,
    credentials: Pick<NetworkCredentials, "username" | "password" | "serviceType"> & {
      packageRef: PackageRef;
      profile?: string | null;
      poolName?: string | null;
      vlanId?: number | null;
      sessionTimeout?: number | null;
      idleTimeout?: number | null;
    }
  ): Promise<void> {
    const bandwidthPolicy = await resolveBandwidthPolicy(credentials.packageRef);
    const creds: NetworkCredentials = {
      username: credentials.username,
      password: credentials.password,
      profile: credentials.profile ?? null,
      serviceType: credentials.serviceType,
      rateLimit: bandwidthPolicy,
      poolName: credentials.poolName ?? null,
      vlanId: credentials.vlanId ?? null,
      sessionTimeout: credentials.sessionTimeout ?? null,
      idleTimeout: credentials.idleTimeout ?? null,
    };

    const adapter = await adapterFactory.getAuthAdapter(routerRef);
    await adapter.provisionCredentials(routerRef, creds);

    await recordProvisioningEvent({
      tenantRef,
      subscriptionRef,
      routerRef,
      event: "provisioned",
      username: credentials.username,
      serviceType: credentials.serviceType,
    });
  }

  /**
   * Suspend a subscriber — removes credentials from NAS.
   * Called by provisioning workflow.
   */
  async suspendSubscriber(
    tenantRef: TenantRef,
    subscriptionRef: string,
    routerRef: RouterRef,
    username: string,
    serviceType: ServiceType
  ): Promise<void> {
    const adapter = await adapterFactory.getAuthAdapter(routerRef);
    await adapter.deprovisionCredentials(routerRef, username);

    await recordProvisioningEvent({
      tenantRef,
      subscriptionRef,
      routerRef,
      event: "suspended",
      username,
      serviceType,
    });
  }

  /**
   * Reactivate a suspended subscriber.
   */
  async reactivateSubscriber(
    tenantRef: TenantRef,
    subscriptionRef: string,
    routerRef: RouterRef,
    username: string,
    packageRef: PackageRef,
    serviceType: ServiceType,
    options: {
      password?: string;
      profile?: string | null;
      poolName?: string | null;
    } = {}
  ): Promise<void> {
    const bandwidthPolicy = await resolveBandwidthPolicy(packageRef);
    const creds: NetworkCredentials = {
      username,
      password: options.password ?? username,
      profile: options.profile ?? null,
      serviceType,
      rateLimit: bandwidthPolicy,
      poolName: options.poolName ?? null,
      vlanId: null,
      sessionTimeout: null,
      idleTimeout: null,
    };

    const adapter = await adapterFactory.getAuthAdapter(routerRef);
    await adapter.provisionCredentials(routerRef, creds);

    await recordProvisioningEvent({
      tenantRef,
      subscriptionRef,
      routerRef,
      event: "reactivated",
      username,
      serviceType,
    });
  }

  /**
   * Update bandwidth policy for a subscriber mid-session.
   * Package change — applies new rate limit without disconnecting.
   */
  async updateBandwidth(
    routerRef: RouterRef,
    username: string,
    packageRef: PackageRef
  ): Promise<void> {
    const policy = await resolveBandwidthPolicy(packageRef);
    if (!policy) return;
    const adapter = await adapterFactory.getBandwidthAdapter(routerRef);
    await adapter.applyPolicy(routerRef, username, policy);
  }

  /**
   * Verify a subscriber's credentials are active on the NAS.
   */
  async verifySubscriber(routerRef: RouterRef, username: string): Promise<boolean> {
    const adapter = await adapterFactory.getAuthAdapter(routerRef);
    return adapter.verifyCredentials(routerRef, username);
  }

  /**
   * Provision a subscription record directly from the database payload.
   * Used by UI flows that create/update subscriptions without manually constructing credentials.
   */
  async provisionSubscriptionFromRecord(
    tenantRef: TenantRef,
    subscription: {
      id: string;
      router_id?: string | null;
      username: string;
      password?: string | null;
      package_id?: string | null;
      type?: string | null;
      profile?: string | null;
      pool_name?: string | null;
    }
  ): Promise<void> {
    if (!subscription.router_id) return;

    const bandwidthPolicy = subscription.package_id ? await resolveBandwidthPolicy(subscription.package_id) : null;
    const creds: NetworkCredentials = {
      username: subscription.username,
      password: subscription.password ?? subscription.username,
      profile: subscription.profile ?? null,
      serviceType: (subscription.type as ServiceType) ?? "pppoe",
      rateLimit: bandwidthPolicy,
      poolName: subscription.pool_name ?? null,
      vlanId: null,
      sessionTimeout: null,
      idleTimeout: null,
    };

    const adapter = await adapterFactory.getAuthAdapter(subscription.router_id);
    await adapter.provisionCredentials(subscription.router_id, creds);

    await recordProvisioningEvent({
      tenantRef,
      subscriptionRef: subscription.id,
      routerRef: subscription.router_id,
      event: "provisioned",
      username: subscription.username,
      serviceType: (subscription.type as ServiceType) ?? "pppoe",
    });
  }

  /**
   * Suspend a subscription record directly from the database payload.
   */
  async suspendSubscriptionFromRecord(
    tenantRef: TenantRef,
    subscription: {
      id: string;
      router_id?: string | null;
      username: string;
      type?: string | null;
    }
  ): Promise<void> {
    if (!subscription.router_id) return;

    const adapter = await adapterFactory.getAuthAdapter(subscription.router_id);
    await adapter.deprovisionCredentials(subscription.router_id, subscription.username);

    await recordProvisioningEvent({
      tenantRef,
      subscriptionRef: subscription.id,
      routerRef: subscription.router_id,
      event: "suspended",
      username: subscription.username,
      serviceType: (subscription.type as ServiceType) ?? "pppoe",
    });
  }
}

export const authService = new AuthService();
