/**
 * SmartLinkNet — Phase 3: Workflow Engine
 * Executes StepDefinition arrays as ordered state machines.
 * Supports: optimistic locking, per-step retry, saga compensation (rollback),
 * idempotent operations, event store emission, audit trail.
 */
import { supabase } from "@/integrations/supabase/client";
import type {
  StepDefinition, StepContext, ProvisioningWorkflow,
  ProvisioningStep, WorkflowStatus,
} from "../types";
import { eventStore } from "./event-store";
import { auditTrail } from "./audit-trail";

const now = () => new Date().toISOString();
const STEP_MAX_ATTEMPTS = 3;

function mapWorkflow(r: Record<string, unknown>): ProvisioningWorkflow {
  return {
    id:               r["id"] as string,
    tenantId:         r["tenant_id"] as string,
    type:             r["type"] as any,
    status:           r["status"] as any,
    payload:          (r["payload"] as Record<string, unknown>) ?? {},
    currentStep:      r["current_step"] as number ?? 0,
    totalSteps:       r["total_steps"] as number ?? 0,
    completedSteps:   r["completed_steps"] as number ?? 0,
    idempotencyKey:   r["idempotency_key"] as string | null ?? null,
    error:            r["error"] as string | null ?? null,
    rollbackError:    r["rollback_error"] as string | null ?? null,
    retryCount:       r["retry_count"] as number ?? 0,
    maxRetries:       r["max_retries"] as number ?? 3,
    triggerSource:    r["trigger_source"] as string ?? "system",
    triggerEntityId:  r["trigger_entity_id"] as string | null ?? null,
    triggerEntityType:r["trigger_entity_type"] as string | null ?? null,
    progressPct:      r["progress_pct"] as number ?? 0,
    durationSeconds:  r["duration_seconds"] as number | null ?? null,
    startedAt:        r["started_at"] as string | null ?? null,
    completedAt:      r["completed_at"] as string | null ?? null,
    createdAt:        r["created_at"] as string,
  };
}

export class WorkflowEngine {

  // ── Public query methods ──────────────────────────────────────────────────

  async list(tenantId: string, opts: {
    status?: WorkflowStatus;
    type?: string;
    limit?: number;
  } = {}): Promise<ProvisioningWorkflow[]> {
    if (!tenantId || typeof tenantId !== "string") return [];
    let q = (supabase as any)
      .from("vw_provisioning_status")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(opts.limit ?? 100);
    if (opts.status) q = q.eq("status", opts.status);
    if (opts.type)   q = q.eq("type", opts.type);
    const { data } = await q;
    return (data ?? []).map(mapWorkflow);
  }

  async get(workflowId: string): Promise<ProvisioningWorkflow | null> {
    const { data } = await (supabase as any)
      .from("vw_provisioning_status").select("*").eq("id", workflowId).maybeSingle();
    return data ? mapWorkflow(data) : null;
  }

  async getSteps(workflowId: string): Promise<ProvisioningStep[]> {
    const { data } = await (supabase as any)
      .from("vw_workflow_timeline")
      .select("*")
      .eq("workflow_id", workflowId)
      .order("step_order");
    return (data ?? []).map((r: Record<string, unknown>) => ({
      id:               r["id"] as string ?? "",
      workflowId:       r["workflow_id"] as string,
      tenantId:         r["tenant_id"] as string ?? "",
      stepOrder:        r["step_order"] as number,
      stepName:         r["step_name"] as string,
      stepType:         r["step_type"] as any,
      status:           r["status"] as any,
      inputData:        (r["input_data"] as any) ?? {},
      outputData:       (r["output_data"] as any) ?? {},
      error:            r["error"] as string | null ?? null,
      attempt:          r["attempt"] as number ?? 0,
      canCompensate:    r["can_compensate"] as boolean ?? false,
      compensated:      r["compensated"] as boolean ?? false,
      compensationData: (r["compensation_data"] as any) ?? {},
      stepDurationSec:  r["step_duration_sec"] as number | null ?? null,
      startedAt:        r["started_at"] as string | null ?? null,
      completedAt:      r["completed_at"] as string | null ?? null,
      createdAt:        r["created_at"] as string ?? "",
    })) as ProvisioningStep[];
  }

  async getStats(tenantId: string, hours = 24) {
    if (!tenantId || typeof tenantId !== "string") return { total: 0, completed: 0, failed: 0, pending: 0, running: 0, rolledBack: 0, successRate: 100 };
    const { data, error } = await (supabase as any)
      .rpc("fn_provisioning_stats", { _tenant_id: tenantId, _hours: Number(hours) });
    if (error) throw new Error(error.message);
    // RPC returns an array of rows; take the first element
    const r = (Array.isArray(data) ? data[0] : data) ?? {};
    return {
      total:       Number(r.total ?? 0),
      completed:   Number(r.completed ?? 0),
      failed:      Number(r.failed ?? 0),
      pending:     Number(r.pending ?? 0),
      running:     Number(r.running ?? 0),
      rolledBack:  Number(r.rolled_back ?? 0),
      successRate: Number(r.success_rate ?? 100),
    };
  }

  // ── Initiation ────────────────────────────────────────────────────────────

  /**
   * Idempotently initiate a workflow. Returns the workflow ID.
   * If a workflow with the same idempotency key already exists, returns its ID.
   */
  async initiate(opts: {
    tenantId: string;
    type: ProvisioningWorkflow["type"];
    payload: Record<string, unknown>;
    idempotencyKey: string;
    triggerSource?: string;
    triggerEntityId?: string | null;
    triggerEntityType?: string | null;
    maxRetries?: number;
  }): Promise<string> {
    const { data, error } = await (supabase as any).rpc("fn_initiate_workflow", {
      _tenant_id:           opts.tenantId,
      _type:                opts.type,
      _payload:             opts.payload,
      _idempotency_key:     opts.idempotencyKey,
      _trigger_source:      opts.triggerSource ?? "system",
      _trigger_entity_id:   opts.triggerEntityId ?? null,
      _trigger_entity_type: opts.triggerEntityType ?? null,
      _max_retries:         opts.maxRetries ?? 3,
    });
    if (error) throw new Error(error.message);
    return data as string;
  }

  // ── Execution (called by edge function / queue worker) ────────────────────

  /**
   * Execute a workflow given its step definitions.
   * Handles: locking, step ordering, per-step retry, saga rollback, event emission.
   */
  async execute(
    workflowId: string,
    steps: StepDefinition[],
    workerId: string
  ): Promise<void> {
    // 1. Acquire optimistic lock
    const { data: locked } = await (supabase as any)
      .rpc("fn_acquire_workflow_lock", {
        _workflow_id: workflowId,
        _worker_id:   workerId,
        _ttl_seconds: 300,
      });
    if (!locked) return; // already running or completed

    await eventStore.append(workflowId, "", "workflow_started", { worker: workerId });

    // 2. Load workflow
    const wf = await this.get(workflowId);
    if (!wf) { await this._release(workflowId, "failed", "Workflow not found"); return; }

    // 3. Seed steps table if first run
    if (wf.totalSteps === 0) {
      await this._seedSteps(wf, steps);
    }

    // 4. Load persisted steps to find resume point
    const persistedSteps = await this.getSteps(workflowId);
    const results: Record<string, Record<string, unknown>> = {};

    // Populate results from already-completed steps (resume after failure)
    for (const ps of persistedSteps) {
      if (ps.status === "completed") results[ps.stepName] = ps.outputData;
    }

    const ctx: StepContext = {
      workflowId, tenantId: wf.tenantId, payload: wf.payload, results,
    };

    // 5. Execute each step in order
    for (let i = 0; i < steps.length; i++) {
      const def = steps[i];
      const persisted = persistedSteps.find((s) => s.stepOrder === i + 1);

      // Skip already-completed steps (idempotent resume)
      if (persisted?.status === "completed") continue;

      const stepId = persisted?.id ?? null;
      const input = def.input(wf.payload, ctx);
      await this._markStep(stepId, workflowId, wf.tenantId, i + 1, def, "running", input);
      await eventStore.append(workflowId, wf.tenantId, "step_started",
        { step: def.name, input }, { stepName: def.name, stepOrder: i + 1 });
      await this._updateWorkflowProgress(workflowId, i + 1);

      let output: Record<string, unknown> = {};
      let lastError: string | null = null;

      // Per-step retry loop
      for (let attempt = 1; attempt <= STEP_MAX_ATTEMPTS; attempt++) {
        try {
          output = await def.execute(input, { ...ctx, results });
          lastError = null;
          break;
        } catch (err: unknown) {
          lastError = (err as Error).message;
          if (attempt < STEP_MAX_ATTEMPTS) {
            await new Promise((r) => setTimeout(r, 500 * attempt)); // backoff
          }
        }
      }

      if (lastError !== null) {
        // Step failed after all retries — record and trigger rollback
        await this._markStep(stepId, workflowId, wf.tenantId, i + 1, def, "failed", input, {}, lastError);
        await eventStore.append(workflowId, wf.tenantId, "step_failed",
          { step: def.name, error: lastError }, { stepName: def.name, stepOrder: i + 1 });

        // Saga: compensate completed steps in reverse order
        await this._compensate(workflowId, wf.tenantId, steps, persistedSteps, results, ctx, i - 1);

        await this._release(workflowId, "failed", `Step "${def.name}" failed: ${lastError}`);
        await eventStore.append(workflowId, wf.tenantId, "workflow_failed", { error: lastError });
        await auditTrail.record({
          tenantId: wf.tenantId, workflowId,
          entityType: "workflow", entityId: workflowId,
          action: "workflow_failed",
          after: { step: def.name, error: lastError },
        });
        return;
      }

      // Step succeeded
      results[def.name] = output;
      await this._markStep(stepId, workflowId, wf.tenantId, i + 1, def, "completed", input, output);
      await this._updateWorkflowCompletedSteps(workflowId, i + 1);
      await eventStore.append(workflowId, wf.tenantId, "step_completed",
        { step: def.name, output }, { stepName: def.name, stepOrder: i + 1 });
    }

    // 6. All steps done — complete
    await this._release(workflowId, "completed");
    await eventStore.append(workflowId, wf.tenantId, "workflow_completed", {});
    await auditTrail.record({
      tenantId: wf.tenantId, workflowId,
      entityType: "workflow", entityId: workflowId,
      action: "workflow_completed",
      after: { type: wf.type, steps: steps.length },
    });
  }

  // ── Manual trigger (activation / suspension) ────────────────────────────

  /**
   * Trigger a manual_activation or manual_suspension workflow for a subscription.
   * Idempotent — same operator+subscription+date will not create a duplicate.
   */
  async triggerManual(opts: {
    tenantId: string;
    type: "manual_activation" | "manual_suspension";
    subscriptionId: string;
    customerId: string;
    operatorId: string;
    reason?: string;
  }): Promise<string> {
    const date = new Date().toISOString().slice(0, 10);
    return this.initiate({
      tenantId:            opts.tenantId,
      type:                opts.type,
      payload: {
        subscription_id: opts.subscriptionId,
        customer_id:     opts.customerId,
        tenant_id:       opts.tenantId,
        operator_id:     opts.operatorId,
        reason:          opts.reason ?? (opts.type === "manual_suspension" ? "Manual suspension" : undefined),
      },
      idempotencyKey:      `${opts.type}-${opts.subscriptionId}-${date}-${opts.operatorId}`,
      triggerSource:       "operator",
      triggerEntityId:     opts.subscriptionId,
      triggerEntityType:   "subscription",
      maxRetries:          2,
    });
  }

  // ── Manual retry ──────────────────────────────────────────────────────────

  async retry(workflowId: string): Promise<void> {
    const wf = await this.get(workflowId);
    if (!wf || wf.status !== "failed") throw new Error("Only failed workflows can be retried");
    if (wf.retryCount >= wf.maxRetries) throw new Error("Max retries exceeded");

    await (supabase as any).from("provisioning_workflows").update({
      status:      "pending",
      error:       null,
      retry_count: wf.retryCount + 1,
      updated_at:  now(),
    }).eq("id", workflowId);

    await (supabase as any).from("job_queue").insert({
      tenant_id:  wf.tenantId,
      type:       "run_provisioning_workflow",
      payload:    { workflow_id: workflowId },
      priority:   1,
      queue_name: "provisioning",
      run_at:     now(),
      status:     "pending",
    });

    await eventStore.append(workflowId, wf.tenantId, "workflow_retried",
      { retry_count: wf.retryCount + 1 });
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private async _seedSteps(
    wf: ProvisioningWorkflow,
    steps: StepDefinition[]
  ): Promise<void> {
    const rows = steps.map((s, i) => ({
      workflow_id:  wf.id,
      tenant_id:    wf.tenantId,
      step_order:   i + 1,
      step_name:    s.name,
      step_type:    s.type,
      status:       "pending",
      can_compensate: s.canCompensate,
      input_data:   {},
      output_data:  {},
    }));
    await (supabase as any).from("provisioning_steps").insert(rows);
    await (supabase as any).from("provisioning_workflows").update({
      total_steps: steps.length, updated_at: now(),
    }).eq("id", wf.id);
  }

  private async _markStep(
    stepId: string | null,
    workflowId: string,
    tenantId: string,
    order: number,
    def: StepDefinition,
    status: string,
    input: Record<string, unknown>,
    output: Record<string, unknown> = {},
    error: string | null = null
  ): Promise<void> {
    const patch: Record<string, unknown> = {
      status,
      input_data:  input,
      output_data: output,
      error,
      updated_at:  now(),
    };
    if (status === "running")    patch["started_at"]   = now();
    if (status === "completed" || status === "failed") patch["completed_at"] = now();

    if (stepId) {
      await (supabase as any).from("provisioning_steps").update(patch).eq("id", stepId);
    } else {
      await (supabase as any).from("provisioning_steps").upsert({
        workflow_id:    workflowId,
        tenant_id:      tenantId,
        step_order:     order,
        step_name:      def.name,
        step_type:      def.type,
        can_compensate: def.canCompensate,
        ...patch,
      }, { onConflict: "workflow_id,step_order", ignoreDuplicates: false });
    }
  }

  private async _compensate(
    workflowId: string,
    tenantId: string,
    defs: StepDefinition[],
    persisted: ProvisioningStep[],
    results: Record<string, Record<string, unknown>>,
    ctx: StepContext,
    fromIndex: number
  ): Promise<void> {
    await (supabase as any).from("provisioning_workflows").update({
      status: "compensating", updated_at: now(),
    }).eq("id", workflowId);
    await eventStore.append(workflowId, tenantId, "workflow_rolled_back", {});

    for (let i = fromIndex; i >= 0; i--) {
      const def = defs[i];
      if (!def.canCompensate || !def.compensate) continue;
      const ps = persisted.find((s) => s.stepOrder === i + 1);
      if (!ps || ps.status !== "completed") continue;

      await eventStore.append(workflowId, tenantId, "step_compensating",
        { step: def.name }, { stepName: def.name, stepOrder: i + 1 });

      try {
        await def.compensate(ps.inputData, ps.outputData, ctx);
        await (supabase as any).from("provisioning_steps").update({
          status: "compensated", compensated: true, updated_at: now(),
        }).eq("id", ps.id);
        await eventStore.append(workflowId, tenantId, "step_compensated",
          { step: def.name }, { stepName: def.name, stepOrder: i + 1 });
      } catch (err: unknown) {
        // Log compensation failure but continue rolling back other steps
        await (supabase as any).from("provisioning_workflows").update({
          rollback_error: `Compensation of "${def.name}" failed: ${(err as Error).message}`,
          updated_at: now(),
        }).eq("id", workflowId);
      }
    }
  }

  private async _release(
    workflowId: string,
    status: string,
    error: string | null = null
  ): Promise<void> {
    await (supabase as any).rpc("fn_release_workflow_lock", {
      _workflow_id: workflowId,
      _status:      status,
      _error:       error,
    });
  }

  private async _updateWorkflowProgress(workflowId: string, step: number): Promise<void> {
    await (supabase as any).from("provisioning_workflows").update({
      current_step: step, updated_at: now(),
    }).eq("id", workflowId);
  }

  private async _updateWorkflowCompletedSteps(workflowId: string, completedStep: number): Promise<void> {
    await (supabase as any).from("provisioning_workflows").update({
      completed_steps: completedStep, updated_at: now(),
    }).eq("id", workflowId);
  }
}

export const workflowEngine = new WorkflowEngine();
