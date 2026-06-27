/**
 * SmartLinkNet — Phase 3: Audit Trail Service
 * Structured audit log with before/after state diff for all entities.
 */
import { supabase } from "@/integrations/supabase/client";
import type { AuditEntry, AuditEntityType } from "../types";

function mapRow(r: Record<string, unknown>): AuditEntry {
  return {
    id:              r["id"] as string,
    tenantId:        r["tenant_id"] as string,
    workflowId:      r["workflow_id"] as string | null ?? null,
    entityType:      r["entity_type"] as AuditEntityType,
    entityId:        r["entity_id"] as string | null ?? null,
    action:          r["action"] as string,
    beforeState:     r["before_state"] as Record<string, unknown> | null ?? null,
    afterState:      r["after_state"] as Record<string, unknown> | null ?? null,
    diff:            r["diff"] as Record<string, unknown> | null ?? null,
    actor:           r["actor"] as string,
    actorType:       r["actor_type"] as string,
    metadata:        (r["metadata"] as Record<string, unknown>) ?? {},
    workflowType:    r["workflow_type"] as any ?? null,
    workflowStatus:  r["workflow_status"] as any ?? null,
    occurredAt:      r["occurred_at"] as string,
  };
}

export class AuditTrailService {

  async record(opts: {
    tenantId: string;
    workflowId?: string | null;
    entityType: AuditEntityType;
    entityId?: string | null;
    action: string;
    before?: Record<string, unknown> | null;
    after?: Record<string, unknown> | null;
    actor?: string;
    actorType?: "user" | "system" | "automation" | "api";
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await (supabase as any).from("audit_trail").insert({
      tenant_id:    opts.tenantId,
      workflow_id:  opts.workflowId ?? null,
      entity_type:  opts.entityType,
      entity_id:    opts.entityId ?? null,
      action:       opts.action,
      before_state: opts.before ?? null,
      after_state:  opts.after ?? null,
      actor:        opts.actor ?? "system",
      actor_type:   opts.actorType ?? "system",
      metadata:     opts.metadata ?? {},
      occurred_at:  new Date().toISOString(),
    }).catch(() => {});
  }

  async getForEntity(
    tenantId: string,
    entityType: AuditEntityType,
    entityId: string
  ): Promise<AuditEntry[]> {
    const { data } = await (supabase as any)
      .from("vw_audit_trail")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("entity_type", entityType)
      .eq("entity_id", entityId)
      .order("occurred_at", { ascending: false });
    return (data ?? []).map(mapRow);
  }

  async getForWorkflow(workflowId: string): Promise<AuditEntry[]> {
    const { data } = await (supabase as any)
      .from("vw_audit_trail")
      .select("*")
      .eq("workflow_id", workflowId)
      .order("occurred_at");
    return (data ?? []).map(mapRow);
  }

  async getRecent(tenantId: string, opts: {
    entityType?: AuditEntityType;
    action?: string;
    since?: string;
    limit?: number;
  } = {}): Promise<AuditEntry[]> {
    let q = (supabase as any)
      .from("vw_audit_trail")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("occurred_at", { ascending: false })
      .limit(opts.limit ?? 200);
    if (opts.entityType) q = q.eq("entity_type", opts.entityType);
    if (opts.action)     q = q.eq("action", opts.action);
    if (opts.since)      q = q.gte("occurred_at", opts.since);
    const { data } = await q;
    return (data ?? []).map(mapRow);
  }
}

export const auditTrail = new AuditTrailService();
