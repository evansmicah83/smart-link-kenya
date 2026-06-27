/**
 * SmartLinkNet — Provider Drivers
 * Phase 1: PPPoE, DHCP, Hotspot, IPv6, CGNAT, Multi-WAN
 *
 * Each driver implements IProviderAdapter for a specific service type.
 * All infrastructure references are UUID-based.
 */

import { supabase } from "@/integrations/supabase/client";
import type { IProviderAdapter } from "../adapters/interfaces";
import type {
  RouterRef,
  AdapterType,
  NetworkCredentials,
  BandwidthPolicy,
  IpPool,
  CgnatMapping,
  WanLink,
  ProtocolType,
} from "../types";
import { renderMikrotikRateLimit } from "../drivers/mikrotik-rest";

function now(): string {
  return new Date().toISOString();
}

async function routerCommand(routerRef: RouterRef, command: string, params: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("router-command", {
    body: { routerId: routerRef, command, params },
  });
  if (error) throw new Error(`Router command failed: ${error.message}`);
  return data;
}

// ─── PPPoE Provider ───────────────────────────────────────────────────────────

export class PPPoEProvider implements IProviderAdapter {
  readonly adapterType: AdapterType = "mikrotik_rest";
  readonly supportedFeatures: NetworkCredentials["serviceType"][] = ["pppoe"];

  async provision(routerRef: RouterRef, creds: NetworkCredentials): Promise<void> {
    await routerCommand(routerRef, "add_pppoe_user", {
      username: creds.username,
      password: creds.password,
      profile: creds.profile ?? "default",
      rateLimit: creds.rateLimit ? renderMikrotikRateLimit(creds.rateLimit) : undefined,
    });
  }

  async suspend(routerRef: RouterRef, username: string): Promise<void> {
    await routerCommand(routerRef, "remove_pppoe_user", { username });
  }

  async reactivate(routerRef: RouterRef, username: string): Promise<void> {
    // Reactivation re-provisions via subscription data resolved from DB
    const { data } = await (supabase as any)
      .from("subscriptions")
      .select("username, password, packages(name)")
      .eq("username", username)
      .maybeSingle();
    if (!data) throw new Error(`Cannot reactivate — subscription not found for ${username}`);
    await routerCommand(routerRef, "add_pppoe_user", {
      username: data.username,
      password: data.password,
      profile: data.packages?.name ?? "default",
    });
  }

  async terminate(routerRef: RouterRef, username: string): Promise<void> {
    await routerCommand(routerRef, "remove_pppoe_user", { username });
  }
}

// ─── Hotspot Provider ─────────────────────────────────────────────────────────

export class HotspotProvider implements IProviderAdapter {
  readonly adapterType: AdapterType = "mikrotik_rest";
  readonly supportedFeatures: NetworkCredentials["serviceType"][] = ["hotspot"];

  async provision(routerRef: RouterRef, creds: NetworkCredentials): Promise<void> {
    await routerCommand(routerRef, "add_hotspot_user", {
      username: creds.username,
      password: creds.password,
      profile: creds.profile ?? "default",
      rateLimit: creds.rateLimit ? renderMikrotikRateLimit(creds.rateLimit) : undefined,
    });
  }

  async suspend(routerRef: RouterRef, username: string): Promise<void> {
    await routerCommand(routerRef, "remove_hotspot_user", { username });
  }

  async reactivate(routerRef: RouterRef, username: string): Promise<void> {
    const { data } = await (supabase as any)
      .from("subscriptions")
      .select("username, password, packages(name)")
      .eq("username", username)
      .maybeSingle();
    if (!data) throw new Error(`Cannot reactivate — subscription not found for ${username}`);
    await routerCommand(routerRef, "add_hotspot_user", {
      username: data.username,
      password: data.password,
      profile: data.packages?.name ?? "default",
    });
  }

  async terminate(routerRef: RouterRef, username: string): Promise<void> {
    await routerCommand(routerRef, "remove_hotspot_user", { username });
  }
}

// ─── DHCP Provider ────────────────────────────────────────────────────────────

export class DhcpProvider implements IProviderAdapter {
  readonly adapterType: AdapterType = "mikrotik_rest";
  readonly supportedFeatures: NetworkCredentials["serviceType"][] = ["dhcp", "static"];

  async provision(routerRef: RouterRef, creds: NetworkCredentials): Promise<void> {
    // DHCP static lease — MAC resolved from subscription, no hardcoded IP
    await routerCommand(routerRef, "add_user", {
      username: creds.username,
      serviceType: "dhcp",
      poolName: creds.poolName,
    });
  }

  async suspend(_routerRef: RouterRef, _username: string): Promise<void> {
    // DHCP suspension is handled by blocking the MAC at firewall level
    // Delegated to automation rule engine
  }

  async reactivate(_routerRef: RouterRef, _username: string): Promise<void> {
    // Unblock MAC at firewall — delegated to automation
  }

  async terminate(routerRef: RouterRef, username: string): Promise<void> {
    await routerCommand(routerRef, "remove_user", { username, serviceType: "dhcp" });
  }
}

// ─── IPv4 Provider ────────────────────────────────────────────────────────────

export class IPv4Provider {
  /**
   * Resolve an IP pool by UUID from the DB — never by hardcoded CIDR.
   * Returns pool metadata; actual assignment happens on NAS.
   */
  async getPool(poolRef: string): Promise<IpPool | null> {
    const { data } = await (supabase as any)
      .from("ip_pools")
      .select("*")
      .eq("id", poolRef)
      .maybeSingle();
    if (!data) return null;
    return {
      poolRef: data.id,
      name: data.name,
      protocol: "ipv4",
      cidr: data.cidr,
      gateway: data.gateway,
      dns: data.dns ?? [],
      isCgnat: data.is_cgnat ?? false,
      routerRef: data.router_id,
      utilization: data.utilization ?? 0,
    };
  }

  async listPools(tenantRef: string): Promise<IpPool[]> {
    const { data } = await (supabase as any)
      .from("ip_pools")
      .select("*")
      .eq("tenant_id", tenantRef)
      .eq("protocol", "ipv4")
      .order("name");
    return (data ?? []).map((d: any) => ({
      poolRef: d.id,
      name: d.name,
      protocol: "ipv4" as ProtocolType,
      cidr: d.cidr,
      gateway: d.gateway,
      dns: d.dns ?? [],
      isCgnat: d.is_cgnat ?? false,
      routerRef: d.router_id,
      utilization: d.utilization ?? 0,
    }));
  }
}

// ─── IPv6 Provider ────────────────────────────────────────────────────────────

export class IPv6Provider {
  async listPools(tenantRef: string): Promise<IpPool[]> {
    const { data } = await (supabase as any)
      .from("ip_pools")
      .select("*")
      .eq("tenant_id", tenantRef)
      .eq("protocol", "ipv6")
      .order("name");
    return (data ?? []).map((d: any) => ({
      poolRef: d.id,
      name: d.name,
      protocol: "ipv6" as ProtocolType,
      cidr: d.cidr,
      gateway: d.gateway,
      dns: d.dns ?? [],
      isCgnat: false,
      routerRef: d.router_id,
      utilization: d.utilization ?? 0,
    }));
  }

  async assignDelegatedPrefix(sessionRef: string, poolRef: string, prefixLen = 64): Promise<void> {
    await (supabase as any).from("ip_assignments").insert({
      session_id: sessionRef,
      pool_id: poolRef,
      protocol: "ipv6",
      prefix_length: prefixLen,
      leased_at: now(),
    });
  }
}

// ─── CGNAT Provider ───────────────────────────────────────────────────────────

export class CgnatProvider {
  async getMappings(tenantRef: string, sessionRef: string): Promise<CgnatMapping[]> {
    const { data } = await (supabase as any)
      .from("cgnat_mappings")
      .select("*")
      .eq("tenant_id", tenantRef)
      .eq("session_id", sessionRef);
    return (data ?? []).map((d: any) => ({
      mappingRef: d.id,
      sessionRef: d.session_id,
      privateAddress: d.private_address,
      publicAddress: d.public_address,
      portRangeStart: d.port_range_start,
      portRangeEnd: d.port_range_end,
      protocol: d.protocol,
      createdAt: d.created_at,
    }));
  }

  async recordMapping(tenantRef: string, mapping: Omit<CgnatMapping, "mappingRef" | "createdAt">): Promise<void> {
    await (supabase as any).from("cgnat_mappings").insert({
      tenant_id: tenantRef,
      session_id: mapping.sessionRef,
      private_address: mapping.privateAddress,
      public_address: mapping.publicAddress,
      port_range_start: mapping.portRangeStart,
      port_range_end: mapping.portRangeEnd,
      protocol: mapping.protocol,
    });
  }

  /** Look up logging data by subscriber UUID — not by IP address */
  async getLogsForSubscriber(tenantRef: string, customerRef: string, limit = 50): Promise<CgnatMapping[]> {
    const { data } = await (supabase as any)
      .from("cgnat_mappings")
      .select("*, sessions!inner(customer_id)")
      .eq("tenant_id", tenantRef)
      .eq("sessions.customer_id", customerRef)
      .order("created_at", { ascending: false })
      .limit(limit);
    return (data ?? []).map((d: any) => ({
      mappingRef: d.id,
      sessionRef: d.session_id,
      privateAddress: d.private_address,
      publicAddress: d.public_address,
      portRangeStart: d.port_range_start,
      portRangeEnd: d.port_range_end,
      protocol: d.protocol,
      createdAt: d.created_at,
    }));
  }
}

// ─── Multi-WAN Provider ───────────────────────────────────────────────────────

export class MultiWanProvider {
  async getLinks(routerRef: RouterRef): Promise<WanLink[]> {
    const { data } = await (supabase as any)
      .from("wan_links")
      .select("*")
      .eq("router_id", routerRef)
      .order("priority");
    return (data ?? []).map((d: any) => ({
      linkRef: d.id,
      routerRef: d.router_id,
      name: d.name,
      interfaceName: d.interface_name,
      isActive: d.is_active,
      priority: d.priority,
      weightPercent: d.weight_percent,
      latencyMs: d.latency_ms,
      packetLoss: d.packet_loss,
      bandwidthMbps: d.bandwidth_mbps,
      provider: d.provider,
    }));
  }

  async updateLinkHealth(linkRef: string, latencyMs: number, packetLoss: number, isActive: boolean): Promise<void> {
    await (supabase as any)
      .from("wan_links")
      .update({ latency_ms: latencyMs, packet_loss: packetLoss, is_active: isActive, updated_at: now() })
      .eq("id", linkRef);
  }

  async failover(routerRef: RouterRef, failedLinkRef: string): Promise<void> {
    // Mark failed link inactive, promote next-priority link
    await (supabase as any)
      .from("wan_links")
      .update({ is_active: false, updated_at: now() })
      .eq("id", failedLinkRef);

    // Emit failover event for automation engine
    await (supabase as any).from("job_queue").insert({
      type: "notify_admin",
      payload: { event: "wan.failover", router_id: routerRef, failed_link_id: failedLinkRef },
      priority: 1,
      queue_name: "router_sync",
    });
  }
}
