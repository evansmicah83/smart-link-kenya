/**
 * SmartLinkNet — Phase 2: Accounting Replication Targets
 * Enables async replication of accounting records to downstream collectors.
 */

import { supabase } from "@/integrations/supabase/client";
import type { AccountingReplicaTarget, TenantRef } from "../types";

function now(): string { return new Date().toISOString(); }

function mapRow(r: Record<string, unknown>): AccountingReplicaTarget {
  return {
    id:               r["id"] as string,
    tenantId:         r["tenant_id"] as string,
    serverId:         r["server_id"] as string,
    endpoint:         r["endpoint"] as string,
    isActive:         r["is_active"] as boolean ?? true,
    lastReplicatedAt: r["last_replicated_at"] as string | null ?? null,
    pendingCount:     r["pending_count"] as number ?? 0,
    createdAt:        r["created_at"] as string,
    updatedAt:        r["updated_at"] as string,
  };
}

export class AccountingReplicationService {
  async list(tenantId: TenantRef): Promise<AccountingReplicaTarget[]> {
    const { data, error } = await (supabase as any)
      .from("accounting_replica_targets")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map(mapRow);
  }

  async get(targetId: string): Promise<AccountingReplicaTarget | null> {
    const { data } = await (supabase as any)
      .from("accounting_replica_targets")
      .select("*")
      .eq("id", targetId)
      .maybeSingle();
    return data ? mapRow(data) : null;
  }

  async save(tenantId: TenantRef, target: Partial<AccountingReplicaTarget> & { serverId: string; endpoint: string }): Promise<AccountingReplicaTarget> {
    const payload = {
      tenant_id:         tenantId,
      server_id:         target.serverId,
      endpoint:          target.endpoint,
      is_active:         target.isActive ?? true,
      last_replicated_at: target.lastReplicatedAt ?? null,
      pending_count:     target.pendingCount ?? 0,
      updated_at:        now(),
    };

    if (target.id) {
      const { data, error } = await (supabase as any)
        .from("accounting_replica_targets")
        .update(payload)
        .eq("id", target.id)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return mapRow(data);
    }

    const { data, error } = await (supabase as any)
      .from("accounting_replica_targets")
      .insert(payload)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return mapRow(data);
  }

  async delete(targetId: string): Promise<void> {
    const { error } = await (supabase as any)
      .from("accounting_replica_targets")
      .delete()
      .eq("id", targetId);
    if (error) throw new Error(error.message);
  }

  async markReplicated(targetId: string): Promise<void> {
    await (supabase as any)
      .from("accounting_replica_targets")
      .update({ last_replicated_at: now(), pending_count: 0, updated_at: now() })
      .eq("id", targetId);
  }
}

export const accountingReplicationService = new AccountingReplicationService();
