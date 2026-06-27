/**
 * SmartLinkNet — Phase 3: Event Store
 * Append-only event log for workflow state reconstruction and replay.
 */
import { supabase } from "@/integrations/supabase/client";
import type { WorkflowEvent, WorkflowEventType } from "../types";

function mapRow(r: Record<string, unknown>): WorkflowEvent {
  return {
    id:          r["id"] as string,
    workflowId:  r["workflow_id"] as string,
    tenantId:    r["tenant_id"] as string,
    sequenceNo:  r["sequence_no"] as number,
    eventType:   r["event_type"] as WorkflowEventType,
    stepName:    r["step_name"] as string | null ?? null,
    stepOrder:   r["step_order"] as number | null ?? null,
    payload:     (r["payload"] as Record<string, unknown>) ?? {},
    actor:       r["actor"] as string ?? "system",
    occurredAt:  r["occurred_at"] as string,
  };
}

export class EventStoreService {

  async append(
    workflowId: string,
    tenantId: string,
    eventType: WorkflowEventType,
    payload: Record<string, unknown> = {},
    opts: { stepName?: string; stepOrder?: number; actor?: string } = {}
  ): Promise<void> {
    await (supabase as any).from("workflow_events").insert({
      workflow_id: workflowId,
      tenant_id:   tenantId,
      event_type:  eventType,
      step_name:   opts.stepName ?? null,
      step_order:  opts.stepOrder ?? null,
      payload,
      actor:       opts.actor ?? "system",
      occurred_at: new Date().toISOString(),
    }).catch(() => {});
  }

  async getForWorkflow(workflowId: string): Promise<WorkflowEvent[]> {
    const { data } = await (supabase as any)
      .from("workflow_events")
      .select("*")
      .eq("workflow_id", workflowId)
      .order("sequence_no");
    return (data ?? []).map(mapRow);
  }

  async getForTenant(tenantId: string, opts: {
    since?: string;
    eventType?: WorkflowEventType;
    limit?: number;
  } = {}): Promise<WorkflowEvent[]> {
    let q = (supabase as any)
      .from("workflow_events")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("occurred_at", { ascending: false })
      .limit(opts.limit ?? 200);
    if (opts.since)     q = q.gte("occurred_at", opts.since);
    if (opts.eventType) q = q.eq("event_type", opts.eventType);
    const { data } = await q;
    return (data ?? []).map(mapRow);
  }

  /**
   * Replay events for a workflow to reconstruct its current state.
   * Returns the last known status from the event stream.
   */
  async replayWorkflowState(workflowId: string): Promise<{
    status: string;
    currentStep: number;
    completedSteps: string[];
    failedStep: string | null;
  }> {
    const events = await this.getForWorkflow(workflowId);
    let status = "pending";
    let currentStep = 0;
    const completedSteps: string[] = [];
    let failedStep: string | null = null;

    for (const ev of events) {
      switch (ev.eventType) {
        case "workflow_started":    status = "running"; break;
        case "workflow_completed":  status = "completed"; break;
        case "workflow_failed":     status = "failed"; break;
        case "workflow_rolled_back":status = "rolled_back"; break;
        case "step_started":
          if (ev.stepOrder !== null) currentStep = ev.stepOrder;
          break;
        case "step_completed":
          if (ev.stepName) completedSteps.push(ev.stepName);
          break;
        case "step_failed":
          failedStep = ev.stepName;
          break;
      }
    }
    return { status, currentStep, completedSteps, failedStep };
  }
}

export const eventStore = new EventStoreService();
