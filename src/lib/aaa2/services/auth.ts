/**
 * SmartLinkNet — Phase 2: Centralized Authentication Service
 * Handles Auth, Authz for all NAS types.
 * Resolves dynamic VLAN, profile, IP, bandwidth from subscriber UUID.
 */

import { supabase } from "@/integrations/supabase/client";
import type {
  RadiusAuthRequest, RadiusAuthResponse, RadiusReplyAttributes,
  RadiusProfileRef, TenantRef, NasDeviceRef,
  DynamicAssignment, DynamicAssignmentType,
} from "../types";
import { radiusServerPool } from "./radius-pool";
import { nasManagement } from "./nas";
import { renderMikrotikRateLimit } from "@/lib/network/drivers/mikrotik-rest";

function now(): string { return new Date().toISOString(); }

// ─── Profile → Reply Attributes ───────────────────────────────────────────────

function buildReplyAttributes(profile: Record<string, unknown> | null): RadiusReplyAttributes {
  if (!profile) {
    return {
      rateLimit: null, vlanId: null, vlanName: null, ipPool: null,
      sessionTimeout: null, idleTimeout: null, replyMessage: null,
      mikrotikRateLimit: null, mikrotikAddressPool: null, vsa: {},
    };
  }

  const rateLimit = profile["rate_limit"] as string | null
    ?? (profile["speed_down_kbps"]
      ? renderMikrotikRateLimit({
          policyRef: null,
          downloadKbps:        profile["speed_down_kbps"] as number,
          uploadKbps:          (profile["speed_up_kbps"] as number) ?? (profile["speed_down_kbps"] as number),
          burstDownKbps:       profile["burst_down_kbps"] as number | null ?? null,
          burstUpKbps:         profile["burst_up_kbps"] as number | null ?? null,
          burstThresholdKbps:  profile["burst_threshold_kbps"] as number | null ?? null,
          burstTimeSec:        profile["burst_time_sec"] as number | null ?? null,
          priority:            8,
        })
      : null);

  return {
    rateLimit,
    vlanId:             profile["vlan_id"] as number | null ?? null,
    vlanName:           profile["vlan_name"] as string | null ?? null,
    ipPool:             profile["ip_pool"] as string | null ?? null,
    sessionTimeout:     profile["session_timeout"] as number | null ?? null,
    idleTimeout:        profile["idle_timeout"] as number | null ?? null,
    replyMessage:       null,
    mikrotikRateLimit:  rateLimit,
    mikrotikAddressPool:profile["ip_pool"] as string | null ?? null,
    vsa:                (profile["attributes"] as Record<string, unknown>) ?? {},
  };
}

// ─── CentralAuthService ───────────────────────────────────────────────────────

export class CentralAuthService {

  /**
   * Authenticate a subscriber from a RADIUS Access-Request.
   * Resolves profile, VLAN, IP pool, bandwidth dynamically from subscription UUID.
   */
  async authenticate(
    tenantId: TenantRef,
    request: RadiusAuthRequest
  ): Promise<RadiusAuthResponse> {
    const radiusServer = await radiusServerPool.selectServer(tenantId);

    // 1. Resolve subscription by username
    const { data: sub } = await (supabase as any)
      .from("subscriptions")
      .select("id, customer_id, tenant_id, status, username, password, package_id, router_id, expires_at")
      .eq("username", request.username)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    // 2. Validate
    if (!sub) {
      await this._recordEvent(tenantId, request, "auth_reject", null, null, "User not found");
      return this._reject("User not found", radiusServer?.id ?? null);
    }
    if (sub.status !== "active") {
      await this._recordEvent(tenantId, request, "auth_reject", sub.customer_id, sub.id, `Subscription ${sub.status}`);
      return this._reject(`Service ${sub.status}`, radiusServer?.id ?? null);
    }
    if (sub.expires_at && new Date(sub.expires_at) < new Date()) {
      await this._recordEvent(tenantId, request, "auth_reject", sub.customer_id, sub.id, "Subscription expired");
      return this._reject("Subscription expired", radiusServer?.id ?? null);
    }
    if (sub.password && sub.password !== request.password) {
      await this._recordEvent(tenantId, request, "auth_failure", sub.customer_id, sub.id, "Bad password");
      return this._reject("Invalid credentials", radiusServer?.id ?? null);
    }

    // 3. Resolve dynamic profile from radius_profiles linked to package
    const { data: profile } = await (supabase as any)
      .from("radius_profiles")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("package_id", sub.package_id)
      .maybeSingle();

    // 4. Build dynamic reply attributes
    const replyAttributes = buildReplyAttributes(profile);

    // 5. Record auth success event
    await this._recordEvent(tenantId, request, "auth_success", sub.customer_id, sub.id, null);

    return {
      accepted:        true,
      rejectReason:    null,
      replyAttributes,
      profileRef:      profile?.id ?? null,
      customerRef:     sub.customer_id,
      subscriptionRef: sub.id,
      radiusServerRef: radiusServer?.id ?? null,
    };
  }

  /**
   * Authorize — check if a subscriber is allowed to access a NAS resource.
   * Called separately from auth in EAP flows.
   */
  async authorize(tenantId: TenantRef, username: string, nasId: NasDeviceRef): Promise<{
    allowed: boolean;
    reason: string | null;
    replyAttributes: RadiusReplyAttributes;
  }> {
    const { data: sub } = await (supabase as any)
      .from("subscriptions")
      .select("id, customer_id, status, package_id, expires_at")
      .eq("username", username)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (!sub || sub.status !== "active") {
      return { allowed: false, reason: sub ? `Subscription ${sub.status}` : "Not found", replyAttributes: buildReplyAttributes(null) };
    }
    if (sub.expires_at && new Date(sub.expires_at) < new Date()) {
      return { allowed: false, reason: "Expired", replyAttributes: buildReplyAttributes(null) };
    }

    const { data: profile } = await (supabase as any)
      .from("radius_profiles")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("package_id", sub.package_id)
      .maybeSingle();

    return { allowed: true, reason: null, replyAttributes: buildReplyAttributes(profile) };
  }

  // ── Dynamic Assignments ────────────────────────────────────────────────────

  /**
   * Resolve all dynamic assignments for a subscriber by UUID.
   * Returns VLAN, profile, IP pool, bandwidth, timeouts.
   */
  async resolveDynamicAssignments(
    tenantId: TenantRef,
    subscriptionId: string
  ): Promise<DynamicAssignment[]> {
    const { data: sub } = await (supabase as any)
      .from("subscriptions")
      .select("id, customer_id, package_id, router_id")
      .eq("id", subscriptionId)
      .maybeSingle();
    if (!sub) return [];

    const { data: profile } = await (supabase as any)
      .from("radius_profiles")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("package_id", sub.package_id)
      .maybeSingle();
    if (!profile) return [];

    const { data: nas } = await (supabase as any)
      .from("nas_devices")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("router_id", sub.router_id)
      .eq("is_active", true)
      .maybeSingle();

    const assignments: DynamicAssignment[] = [];
    const base = {
      customerRef:     sub.customer_id,
      subscriptionRef: sub.id,
      profileRef:      profile.id as RadiusProfileRef,
      nasRef:          nas?.id ?? "",
      assignedAt:      now(),
      expiresAt:       null,
    };

    const add = (type: DynamicAssignmentType, value: unknown) => {
      if (value !== null && value !== undefined) {
        assignments.push({ ...base, assignmentType: type, assignedValue: value as string | number });
      }
    };

    add("profile",         profile.name);
    add("bandwidth",       profile.rate_limit ?? null);
    add("vlan",            profile.vlan_id ?? null);
    add("ip_pool",         profile.ip_pool ?? null);
    add("session_timeout", profile.session_timeout ?? null);
    add("idle_timeout",    profile.idle_timeout ?? null);

    return assignments;
  }

  /**
   * Send a CoA (Change of Authorization) to update a live session.
   * Used after plan upgrades/downgrades without disconnecting.
   */
  async sendCoA(
    tenantId: TenantRef,
    subscriptionId: string,
    nasId: NasDeviceRef
  ): Promise<void> {
    const { data: sub } = await (supabase as any)
      .from("subscriptions")
      .select("username, package_id, router_id")
      .eq("id", subscriptionId)
      .maybeSingle();
    if (!sub) throw new Error("Subscription not found");

    const { data: profile } = await (supabase as any)
      .from("radius_profiles")
      .select("rate_limit, speed_down_kbps, speed_up_kbps")
      .eq("tenant_id", tenantId)
      .eq("package_id", sub.package_id)
      .maybeSingle();

    const rateLimit = profile?.rate_limit
      ?? (profile?.speed_down_kbps
        ? renderMikrotikRateLimit({
            policyRef: null,
            downloadKbps: profile.speed_down_kbps,
            uploadKbps:   profile.speed_up_kbps ?? profile.speed_down_kbps,
            burstDownKbps: null, burstUpKbps: null,
            burstThresholdKbps: null, burstTimeSec: null, priority: 8,
          })
        : null);

    // Dispatch CoA via router-command edge function
    const { error } = await supabase.functions.invoke("router-command", {
      body: {
        routerId: sub.router_id,
        command:  "apply_profile",
        params:   { username: sub.username, rateLimit, action: "coa" },
      },
    });
    if (error) throw new Error(`CoA failed: ${error.message}`);

    await this._writeAuditLog(tenantId, "coa_request", sub.username, nasId);
  }

  /**
   * Send a Disconnect-Message to terminate a live session via NAS.
   */
  async sendDisconnect(
    tenantId: TenantRef,
    subscriptionId: string,
    nasId: NasDeviceRef
  ): Promise<void> {
    const { data: sub } = await (supabase as any)
      .from("subscriptions")
      .select("username, router_id")
      .eq("id", subscriptionId)
      .maybeSingle();
    if (!sub) throw new Error("Subscription not found");

    const { error } = await supabase.functions.invoke("router-command", {
      body: {
        routerId: sub.router_id,
        command:  "kick_session",
        params:   { username: sub.username, action: "disconnect_request" },
      },
    });
    if (error) throw new Error(`Disconnect failed: ${error.message}`);

    await this._writeAuditLog(tenantId, "disconnect_request", sub.username, nasId);
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private _reject(reason: string, serverRef: string | null): RadiusAuthResponse {
    return {
      accepted: false, rejectReason: reason,
      replyAttributes: buildReplyAttributes(null),
      profileRef: null, customerRef: null, subscriptionRef: null,
      radiusServerRef: serverRef,
    };
  }

  private async _recordEvent(
    tenantId: TenantRef,
    req: RadiusAuthRequest,
    eventType: string,
    customerId: string | null,
    subscriptionId: string | null,
    replyMessage: string | null
  ): Promise<void> {
    await (supabase as any).from("auth_events").insert({
      tenant_id:     tenantId,
      username:      req.username,
      customer_id:   customerId,
      event_type:    eventType,
      protocol:      req.protocol,
      mac_address:   req.callingStationId,
      nas_port:      req.nasPort,
      reply_message: replyMessage,
      attributes:    {},
      received_at:   now(),
    }).catch(() => {});
  }

  private async _writeAuditLog(tenantId: TenantRef, action: string, username: string, nasId: string): Promise<void> {
    await (supabase as any).from("auth_events").insert({
      tenant_id:   tenantId,
      username,
      event_type:  action,
      nas_id:      nasId,
      received_at: now(),
    }).catch(() => {});
  }
}

export const centralAuth = new CentralAuthService();
