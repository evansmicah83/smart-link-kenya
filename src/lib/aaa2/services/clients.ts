/**
 * SmartLinkNet — Phase 2: RADIUS Client Registry
 * External RADIUS clients, multi-NAS discovery, client-side failover
 */

import { supabase } from "@/integrations/supabase/client";
import type { RadiusClient, RadiusClientRef, TenantRef } from "../types";

function now(): string { return new Date().toISOString(); }

function mapRow(r: Record<string, unknown>): RadiusClient {
  return {
    id:          r["id"] as string,
    tenantId:    r["tenant_id"] as string,
    name:        r["name"] as string,
    description: r["description"] as string | null ?? null,
    clientIp:    r["client_ip"] as string,
    sharedSecret:r["shared_secret"] as string,
    vendor:      (r["vendor"] as any) ?? "generic",
    isActive:    r["is_active"] as boolean ?? true,
    lastSeen:    r["last_seen"] as string | null ?? null,
    createdAt:   r["created_at"] as string,
    updatedAt:   r["updated_at"] as string,
  };
}

export class RadiusClientService {
  async list(tenantId: TenantRef): Promise<RadiusClient[]> {
    const { data, error } = await (supabase as any)
      .from("radius_clients")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map(mapRow);
  }

  async get(clientId: RadiusClientRef): Promise<RadiusClient | null> {
    const { data } = await (supabase as any)
      .from("radius_clients")
      .select("*")
      .eq("id", clientId)
      .maybeSingle();
    return data ? mapRow(data) : null;
  }

  async findByIp(tenantId: TenantRef, clientIp: string): Promise<RadiusClient | null> {
    const { data } = await (supabase as any)
      .from("radius_clients")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("client_ip", clientIp)
      .eq("is_active", true)
      .maybeSingle();
    return data ? mapRow(data) : null;
  }

  async listActive(tenantId: TenantRef): Promise<RadiusClient[]> {
    const { data, error } = await (supabase as any)
      .from("radius_clients")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map(mapRow);
  }

  async save(tenantId: TenantRef, client: Partial<RadiusClient> & { name: string; clientIp: string; sharedSecret: string }): Promise<RadiusClient> {
    const payload = {
      tenant_id:    tenantId,
      name:         client.name,
      description:  client.description ?? null,
      client_ip:    client.clientIp,
      shared_secret: client.sharedSecret,
      vendor:       client.vendor ?? "generic",
      is_active:    client.isActive ?? true,
      updated_at:   now(),
    };

    if (client.id) {
      const { data, error } = await (supabase as any)
        .from("radius_clients")
        .update(payload)
        .eq("id", client.id)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return mapRow(data);
    }

    const { data, error } = await (supabase as any)
      .from("radius_clients")
      .insert(payload)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return mapRow(data);
  }

  async delete(clientId: RadiusClientRef): Promise<void> {
    const { error } = await (supabase as any)
      .from("radius_clients")
      .delete()
      .eq("id", clientId);
    if (error) throw new Error(error.message);
  }

  async touchLastSeen(clientId: RadiusClientRef): Promise<void> {
    await (supabase as any)
      .from("radius_clients")
      .update({ last_seen: now(), updated_at: now() })
      .eq("id", clientId);
  }
}

export const radiusClientService = new RadiusClientService();
