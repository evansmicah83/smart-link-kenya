/**
 * SmartLinkNet — Phase 2: VLAN Assignment Audit Trail
 * Records dynamic VLAN assignments per session for auditing and release.
 */

import { supabase } from "@/integrations/supabase/client";
import type { VlanAssignment, TenantRef } from "../types";

function now(): string { return new Date().toISOString(); }

function mapRow(r: Record<string, unknown>): VlanAssignment {
  return {
    id:             r["id"] as string,
    tenantId:       r["tenant_id"] as string,
    sessionId:      r["session_id"] as string | null ?? null,
    subscriptionId: r["subscription_id"] as string | null ?? null,
    nasId:          r["nas_id"] as string | null ?? null,
    vlanId:         r["vlan_id"] as number,
    vlanName:       r["vlan_name"] as string | null ?? null,
    assignedAt:     r["assigned_at"] as string,
    releasedAt:     r["released_at"] as string | null ?? null,
  };
}

export class VlanAssignmentService {
  async list(tenantId: TenantRef): Promise<VlanAssignment[]> {
    const { data, error } = await (supabase as any)
      .from("vlan_assignments")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("assigned_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map(mapRow);
  }

  async get(assignmentId: string): Promise<VlanAssignment | null> {
    const { data } = await (supabase as any)
      .from("vlan_assignments")
      .select("*")
      .eq("id", assignmentId)
      .maybeSingle();
    return data ? mapRow(data) : null;
  }

  async create(assignment: Partial<VlanAssignment> & { tenantId: TenantRef; vlanId: number }): Promise<VlanAssignment> {
    const payload = {
      tenant_id:       assignment.tenantId,
      session_id:      assignment.sessionId ?? null,
      subscription_id: assignment.subscriptionId ?? null,
      nas_id:          assignment.nasId ?? null,
      vlan_id:         assignment.vlanId,
      vlan_name:       assignment.vlanName ?? null,
      assigned_at:     now(),
      released_at:     assignment.releasedAt ?? null,
    };
    const { data, error } = await (supabase as any)
      .from("vlan_assignments")
      .insert(payload)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return mapRow(data);
  }

  async release(assignmentId: string): Promise<void> {
    await (supabase as any)
      .from("vlan_assignments")
      .update({ released_at: now() })
      .eq("id", assignmentId);
  }
}

export const vlanAssignmentService = new VlanAssignmentService();
