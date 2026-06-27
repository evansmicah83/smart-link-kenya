/**
 * SmartLinkNet — Phase 3: Recovery Service
 * Detects stale locked workflows, re-enqueues them, and surfaces stuck jobs.
 */
import { supabase } from "@/integrations/supabase/client";
import { eventStore } from "./event-store";

export class RecoveryService {

  /**
   * Finds workflows stuck in "running" with an expired lock and resets them to "pending".
   * Should be called by a scheduler every 5 minutes.
   */
  async recoverStaleWorkflows(): Promise<number> {
    const { data } = await (supabase as any)
      .rpc("fn_recover_stale_workflows");
    const recovered = (data as number) ?? 0;

    if (recovered > 0) {
      // Emit recovery event for each recovered workflow
      const { data: pending } = await (supabase as any)
        .from("provisioning_workflows")
        .select("id, tenant_id")
        .eq("status", "pending")
        .eq("error", "Recovered from stale lock");

      for (const wf of pending ?? []) {
        await eventStore.append(wf.id, wf.tenant_id, "recovery_triggered",
          { recovered_at: new Date().toISOString() });
        // Clear the recovery marker error so it doesn't display as an error
        await (supabase as any).from("provisioning_workflows").update({
          error: null,
        }).eq("id", wf.id);
      }
    }
    return recovered;
  }

  /**
   * Returns all workflows that have been stuck in "running" beyond the expected TTL.
   */
  async getStuckWorkflows(tenantId: string): Promise<{ id: string; type: string; lockedUntil: string; lockedBy: string }[]> {
    const { data } = await (supabase as any)
      .from("provisioning_workflows")
      .select("id, type, locked_until, locked_by")
      .eq("tenant_id", tenantId)
      .eq("status", "running")
      .lt("locked_until", new Date().toISOString());
    return (data ?? []).map((r: any) => ({
      id:          r.id,
      type:        r.type,
      lockedUntil: r.locked_until,
      lockedBy:    r.locked_by ?? "unknown",
    }));
  }

  /**
   * Force-resets a specific workflow back to pending for manual recovery.
   * Only allowed when the lock has expired or the workflow is in a terminal state.
   */
  async forceReset(workflowId: string, tenantId: string): Promise<void> {
    const { data: wf } = await (supabase as any)
      .from("provisioning_workflows")
      .select("status, locked_until, retry_count, max_retries, tenant_id")
      .eq("id", workflowId)
      .maybeSingle();

    if (!wf) throw new Error("Workflow not found");
    if (wf.tenant_id !== tenantId) throw new Error("Tenant mismatch");
    if (wf.retry_count >= wf.max_retries) throw new Error("Max retries already reached");

    const lockExpired = !wf.locked_until || new Date(wf.locked_until) < new Date();
    if (wf.status === "running" && !lockExpired) {
      throw new Error("Workflow is actively running — cannot force reset");
    }

    await (supabase as any).from("provisioning_workflows").update({
      status:       "pending",
      locked_until: null,
      locked_by:    null,
      error:        null,
      retry_count:  wf.retry_count + 1,
      updated_at:   new Date().toISOString(),
    }).eq("id", workflowId);

    await (supabase as any).from("job_queue").insert({
      tenant_id:  tenantId,
      type:       "run_provisioning_workflow",
      payload:    { workflow_id: workflowId },
      priority:   1,
      queue_name: "provisioning",
      run_at:     new Date().toISOString(),
      status:     "pending",
    });

    await eventStore.append(workflowId, tenantId, "recovery_triggered",
      { method: "force_reset", at: new Date().toISOString() });
  }
}

export const recoveryService = new RecoveryService();
