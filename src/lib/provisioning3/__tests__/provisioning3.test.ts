import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockQuery } from "./mocks/supabase-client";

import { eventStore } from "../services/event-store";
import { auditTrail } from "../services/audit-trail";

beforeEach(() => {
  vi.clearAllMocks();
  mockQuery.select.mockReturnThis();
  mockQuery.eq.mockReturnThis();
  mockQuery.order.mockReturnThis();
  mockQuery.limit.mockReturnThis();
  mockQuery.gte.mockReturnThis();
  mockQuery.insert.mockReturnThis();
  mockQuery.catch.mockReturnThis();
  mockQuery.maybeSingle.mockReset();
  mockQuery.single.mockReset();
});

// ── EventStoreService ─────────────────────────────────────────────────────────

describe("EventStoreService", () => {
  it("appends an event without throwing", async () => {
    await eventStore.append("wf-1", "tenant-1", "workflow_started", { worker: "w1" });
    expect(mockQuery.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        workflow_id: "wf-1",
        tenant_id:   "tenant-1",
        event_type:  "workflow_started",
        payload:     { worker: "w1" },
        actor:       "system",
      })
    );
  });

  it("appends event with step metadata", async () => {
    await eventStore.append("wf-2", "tenant-1", "step_started", { step: "verify_payment" }, { stepName: "verify_payment", stepOrder: 1 });
    expect(mockQuery.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        step_name:  "verify_payment",
        step_order: 1,
      })
    );
  });

  it("retrieves events for a workflow ordered by sequence", async () => {
    mockQuery.order.mockResolvedValueOnce({ data: [], error: null });
    await eventStore.getForWorkflow("wf-1");
    expect(mockQuery.eq).toHaveBeenCalledWith("workflow_id", "wf-1");
    expect(mockQuery.order).toHaveBeenCalledWith("sequence_no");
  });

  it("retrieves tenant events with filters", async () => {
    mockQuery.limit.mockResolvedValueOnce({ data: [], error: null });
    await eventStore.getForTenant("tenant-1", { eventType: "workflow_completed", limit: 50 });
    expect(mockQuery.eq).toHaveBeenCalledWith("tenant_id", "tenant-1");
    expect(mockQuery.limit).toHaveBeenCalledWith(50);
  });

  it("replays workflow state from events", async () => {
    const rows = [
      { id: "e1", workflow_id: "wf-1", tenant_id: "t1", sequence_no: 1, event_type: "workflow_started",   step_name: null, step_order: null, payload: {}, actor: "system", occurred_at: "2026-06-28T00:00:00Z" },
      { id: "e2", workflow_id: "wf-1", tenant_id: "t1", sequence_no: 2, event_type: "step_started",      step_name: "verify_payment", step_order: 1, payload: {}, actor: "system", occurred_at: "2026-06-28T00:00:01Z" },
      { id: "e3", workflow_id: "wf-1", tenant_id: "t1", sequence_no: 3, event_type: "step_completed",    step_name: "verify_payment", step_order: 1, payload: {}, actor: "system", occurred_at: "2026-06-28T00:00:02Z" },
      { id: "e4", workflow_id: "wf-1", tenant_id: "t1", sequence_no: 4, event_type: "workflow_completed", step_name: null, step_order: null, payload: {}, actor: "system", occurred_at: "2026-06-28T00:00:03Z" },
    ];
    mockQuery.order.mockResolvedValueOnce({ data: rows, error: null });
    const state = await eventStore.replayWorkflowState("wf-1");
    expect(state.status).toBe("completed");
    expect(state.completedSteps).toContain("verify_payment");
    expect(state.failedStep).toBeNull();
  });

  it("replay detects failed step", async () => {
    const rows = [
      { id: "e1", workflow_id: "wf-1", tenant_id: "t1", sequence_no: 1, event_type: "workflow_started", step_name: null, step_order: null, payload: {}, actor: "system", occurred_at: "2026-06-28T00:00:00Z" },
      { id: "e2", workflow_id: "wf-1", tenant_id: "t1", sequence_no: 2, event_type: "step_failed",      step_name: "create_subscription", step_order: 2, payload: {}, actor: "system", occurred_at: "2026-06-28T00:00:01Z" },
      { id: "e3", workflow_id: "wf-1", tenant_id: "t1", sequence_no: 3, event_type: "workflow_failed",  step_name: null, step_order: null, payload: {}, actor: "system", occurred_at: "2026-06-28T00:00:02Z" },
    ];
    mockQuery.order.mockResolvedValueOnce({ data: rows, error: null });
    const state = await eventStore.replayWorkflowState("wf-1");
    expect(state.status).toBe("failed");
    expect(state.failedStep).toBe("create_subscription");
  });
});

// ── AuditTrailService ─────────────────────────────────────────────────────────

describe("AuditTrailService", () => {
  it("records an audit entry without throwing", async () => {
    await auditTrail.record({
      tenantId:   "tenant-1",
      workflowId: "wf-1",
      entityType: "payment",
      entityId:   "pay-1",
      action:     "payment_success_provisioned",
      after:      { amount: 500 },
      actor:      "provisioning_engine",
      actorType:  "system",
    });
    expect(mockQuery.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id:   "tenant-1",
        workflow_id: "wf-1",
        entity_type: "payment",
        entity_id:   "pay-1",
        action:      "payment_success_provisioned",
        actor:       "provisioning_engine",
        actor_type:  "system",
      })
    );
  });

  it("records entry with null workflowId", async () => {
    await auditTrail.record({
      tenantId:   "tenant-1",
      entityType: "system",
      action:     "manual_check",
    });
    expect(mockQuery.insert).toHaveBeenCalledWith(
      expect.objectContaining({ workflow_id: null, entity_id: null })
    );
  });

  it("fetches recent audit entries for tenant", async () => {
    mockQuery.limit.mockResolvedValueOnce({ data: [], error: null });
    await auditTrail.getRecent("tenant-1", { limit: 50 });
    expect(mockQuery.eq).toHaveBeenCalledWith("tenant_id", "tenant-1");
    expect(mockQuery.limit).toHaveBeenCalledWith(50);
  });

  it("fetches audit entries for a specific entity", async () => {
    mockQuery.order.mockResolvedValueOnce({ data: [], error: null });
    await auditTrail.getForEntity("tenant-1", "subscription", "sub-1");
    expect(mockQuery.eq).toHaveBeenCalledWith("entity_type", "subscription");
    expect(mockQuery.eq).toHaveBeenCalledWith("entity_id", "sub-1");
  });

  it("fetches audit entries for a workflow", async () => {
    mockQuery.order.mockResolvedValueOnce({ data: [], error: null });
    await auditTrail.getForWorkflow("wf-1");
    expect(mockQuery.eq).toHaveBeenCalledWith("workflow_id", "wf-1");
  });
});

// ── WorkflowEngine — queries & initiation ─────────────────────────────────────

import { workflowEngine } from "../services/workflow-engine";

describe("WorkflowEngine.list", () => {
  it("lists workflows for a tenant ordered by created_at", async () => {
    mockQuery.limit.mockResolvedValueOnce({ data: [], error: null });
    await workflowEngine.list("tenant-1");
    expect(mockQuery.eq).toHaveBeenCalledWith("tenant_id", "tenant-1");
    expect(mockQuery.order).toHaveBeenCalledWith("created_at", { ascending: false });
  });

  it("filters by status when provided", async () => {
    mockQuery.limit.mockResolvedValueOnce({ data: [], error: null });
    await workflowEngine.list("tenant-1", { status: "failed" });
    expect(mockQuery.eq).toHaveBeenCalledWith("status", "failed");
  });

  it("maps DB row to camelCase ProvisioningWorkflow", async () => {
    const row = {
      id: "wf-1", tenant_id: "t1", type: "payment_success", status: "completed",
      payload: {}, current_step: 3, total_steps: 3, completed_steps: 3,
      idempotency_key: "key-1", error: null, rollback_error: null,
      retry_count: 0, max_retries: 3, trigger_source: "mpesa_callback",
      trigger_entity_id: "pay-1", trigger_entity_type: "payment",
      progress_pct: 100, duration_seconds: 12,
      started_at: "2026-06-28T00:00:00Z", completed_at: "2026-06-28T00:00:12Z",
      created_at: "2026-06-28T00:00:00Z",
    };
    mockQuery.limit.mockResolvedValueOnce({ data: [row], error: null });
    const results = await workflowEngine.list("t1");
    expect(results[0].idempotencyKey).toBe("key-1");
    expect(results[0].triggerSource).toBe("mpesa_callback");
    expect(results[0].progressPct).toBe(100);
    expect(results[0].durationSeconds).toBe(12);
  });
});

describe("WorkflowEngine.initiate", () => {
  it("calls fn_initiate_workflow rpc with correct params", async () => {
    (mockQuery as any).__proto__ = {};
    const { supabase: sb } = await import("./mocks/supabase-client");
    (sb.rpc as any).mockResolvedValueOnce({ data: "wf-new", error: null });
    const id = await workflowEngine.initiate({
      tenantId:        "tenant-1",
      type:            "payment_success",
      payload:         { payment_id: "pay-1", amount: 500 },
      idempotencyKey:  "payment_success-pay-1",
      triggerSource:   "mpesa_callback",
      triggerEntityId: "pay-1",
      triggerEntityType: "payment",
    });
    expect(sb.rpc).toHaveBeenCalledWith("fn_initiate_workflow", expect.objectContaining({
      _tenant_id:       "tenant-1",
      _type:            "payment_success",
      _idempotency_key: "payment_success-pay-1",
      _trigger_source:  "mpesa_callback",
    }));
    expect(id).toBe("wf-new");
  });

  it("throws when rpc returns an error", async () => {
    const { supabase: sb } = await import("./mocks/supabase-client");
    (sb.rpc as any).mockResolvedValueOnce({ data: null, error: { message: "DB error" } });
    await expect(workflowEngine.initiate({
      tenantId: "t1", type: "payment_failure",
      payload: {}, idempotencyKey: "k1",
    })).rejects.toThrow("DB error");
  });
});

describe("WorkflowEngine.triggerManual", () => {
  it("initiates manual_activation with correct idempotency key", async () => {
    const { supabase: sb } = await import("./mocks/supabase-client");
    (sb.rpc as any).mockResolvedValueOnce({ data: "wf-manual-1", error: null });
    const id = await workflowEngine.triggerManual({
      tenantId:       "tenant-1",
      type:           "manual_activation",
      subscriptionId: "sub-1",
      customerId:     "cust-1",
      operatorId:     "user-1",
    });
    expect(sb.rpc).toHaveBeenCalledWith("fn_initiate_workflow", expect.objectContaining({
      _type:                "manual_activation",
      _trigger_entity_id:   "sub-1",
      _trigger_entity_type: "subscription",
      _trigger_source:      "operator",
    }));
    expect(id).toBe("wf-manual-1");
  });

  it("initiates manual_suspension with reason in payload", async () => {
    const { supabase: sb } = await import("./mocks/supabase-client");
    (sb.rpc as any).mockResolvedValueOnce({ data: "wf-manual-2", error: null });
    await workflowEngine.triggerManual({
      tenantId:       "tenant-1",
      type:           "manual_suspension",
      subscriptionId: "sub-2",
      customerId:     "cust-2",
      operatorId:     "user-1",
      reason:         "Non-payment",
    });
    expect(sb.rpc).toHaveBeenCalledWith("fn_initiate_workflow", expect.objectContaining({
      _payload: expect.objectContaining({ reason: "Non-payment" }),
    }));
  });
});

// ── WorkflowEngine — queries & initiation ────────────────────────────────────

import { workflowEngine } from "../services/workflow-engine";

describe("WorkflowEngine.list", () => {
  it("lists workflows for a tenant", async () => {
    mockQuery.limit.mockResolvedValueOnce({ data: [], error: null });
    await workflowEngine.list("tenant-1");
    expect(mockQuery.eq).toHaveBeenCalledWith("tenant_id", "tenant-1");
    expect(mockQuery.order).toHaveBeenCalledWith("created_at", { ascending: false });
  });

  it("filters by status when provided", async () => {
    mockQuery.limit.mockResolvedValueOnce({ data: [], error: null });
    await workflowEngine.list("tenant-1", { status: "failed" });
    expect(mockQuery.eq).toHaveBeenCalledWith("status", "failed");
  });

  it("maps DB row to camelCase ProvisioningWorkflow", async () => {
    const row = {
      id: "wf-1", tenant_id: "t1", type: "payment_success", status: "completed",
      payload: {}, current_step: 3, total_steps: 3, completed_steps: 3,
      idempotency_key: "key-1", error: null, rollback_error: null,
      retry_count: 0, max_retries: 3, trigger_source: "mpesa_callback",
      trigger_entity_id: "pay-1", trigger_entity_type: "payment",
      progress_pct: 100, duration_seconds: 12,
      started_at: "2026-06-28T00:00:00Z", completed_at: "2026-06-28T00:00:12Z",
      created_at: "2026-06-28T00:00:00Z",
    };
    mockQuery.limit.mockResolvedValueOnce({ data: [row], error: null });
    const results = await workflowEngine.list("t1");
    expect(results[0].idempotencyKey).toBe("key-1");
    expect(results[0].triggerSource).toBe("mpesa_callback");
    expect(results[0].progressPct).toBe(100);
    expect(results[0].durationSeconds).toBe(12);
  });
});

describe("WorkflowEngine.initiate", () => {
  it("calls fn_initiate_workflow rpc with correct params", async () => {
    const { supabase: sb } = await import("./mocks/supabase-client");
    (sb.rpc as any).mockResolvedValueOnce({ data: "wf-new", error: null });
    const id = await workflowEngine.initiate({
      tenantId:          "tenant-1",
      type:              "payment_success",
      payload:           { payment_id: "pay-1", amount: 500 },
      idempotencyKey:    "payment_success-pay-1",
      triggerSource:     "mpesa_callback",
      triggerEntityId:   "pay-1",
      triggerEntityType: "payment",
    });
    expect(sb.rpc).toHaveBeenCalledWith("fn_initiate_workflow", expect.objectContaining({
      _tenant_id:       "tenant-1",
      _type:            "payment_success",
      _idempotency_key: "payment_success-pay-1",
      _trigger_source:  "mpesa_callback",
    }));
    expect(id).toBe("wf-new");
  });

  it("throws when rpc returns error", async () => {
    const { supabase: sb } = await import("./mocks/supabase-client");
    (sb.rpc as any).mockResolvedValueOnce({ data: null, error: { message: "DB error" } });
    await expect(workflowEngine.initiate({
      tenantId: "t1", type: "payment_failure",
      payload: {}, idempotencyKey: "k1",
    })).rejects.toThrow("DB error");
  });
});

describe("WorkflowEngine.triggerManual", () => {
  it("initiates manual_activation with correct params", async () => {
    const { supabase: sb } = await import("./mocks/supabase-client");
    (sb.rpc as any).mockResolvedValueOnce({ data: "wf-manual-1", error: null });
    const id = await workflowEngine.triggerManual({
      tenantId:       "tenant-1",
      type:           "manual_activation",
      subscriptionId: "sub-1",
      customerId:     "cust-1",
      operatorId:     "user-1",
    });
    expect(sb.rpc).toHaveBeenCalledWith("fn_initiate_workflow", expect.objectContaining({
      _type:                "manual_activation",
      _trigger_entity_id:   "sub-1",
      _trigger_entity_type: "subscription",
      _trigger_source:      "operator",
    }));
    expect(id).toBe("wf-manual-1");
  });

  it("includes reason in payload for manual_suspension", async () => {
    const { supabase: sb } = await import("./mocks/supabase-client");
    (sb.rpc as any).mockResolvedValueOnce({ data: "wf-manual-2", error: null });
    await workflowEngine.triggerManual({
      tenantId:       "tenant-1",
      type:           "manual_suspension",
      subscriptionId: "sub-2",
      customerId:     "cust-2",
      operatorId:     "user-1",
      reason:         "Non-payment",
    });
    expect(sb.rpc).toHaveBeenCalledWith("fn_initiate_workflow", expect.objectContaining({
      _payload: expect.objectContaining({ reason: "Non-payment" }),
    }));
  });
});

describe("WorkflowEngine.retry", () => {
  it("resets a failed workflow to pending and enqueues job", async () => {
    const wfRow = {
      id: "wf-1", tenant_id: "t1", type: "payment_success", status: "failed",
      payload: {}, current_step: 2, total_steps: 3, completed_steps: 1,
      idempotency_key: null, error: "Step failed", rollback_error: null,
      retry_count: 1, max_retries: 3, trigger_source: "system",
      trigger_entity_id: null, trigger_entity_type: null,
      progress_pct: 33, duration_seconds: null,
      started_at: "2026-06-28T00:00:00Z", completed_at: null,
      created_at: "2026-06-28T00:00:00Z",
    };
    mockQuery.maybeSingle.mockResolvedValueOnce({ data: wfRow, error: null });
    mockQuery.eq.mockResolvedValueOnce({ error: null }); // update
    mockQuery.insert.mockResolvedValueOnce({ error: null }); // job_queue
    mockQuery.catch.mockResolvedValueOnce({}); // event append

    await workflowEngine.retry("wf-1");

    expect(mockQuery.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: "pending", error: null, retry_count: 2 })
    );
    expect(mockQuery.insert).toHaveBeenCalledWith(
      expect.objectContaining({ type: "run_provisioning_workflow" })
    );
  });

  it("throws when workflow is not in failed state", async () => {
    const wfRow = {
      id: "wf-1", tenant_id: "t1", type: "payment_success", status: "completed",
      payload: {}, current_step: 3, total_steps: 3, completed_steps: 3,
      idempotency_key: null, error: null, rollback_error: null,
      retry_count: 0, max_retries: 3, trigger_source: "system",
      trigger_entity_id: null, trigger_entity_type: null,
      progress_pct: 100, duration_seconds: 10,
      started_at: "2026-06-28T00:00:00Z", completed_at: "2026-06-28T00:00:10Z",
      created_at: "2026-06-28T00:00:00Z",
    };
    mockQuery.maybeSingle.mockResolvedValueOnce({ data: wfRow, error: null });
    await expect(workflowEngine.retry("wf-1")).rejects.toThrow("Only failed workflows can be retried");
  });

  it("throws when max retries exceeded", async () => {
    const wfRow = {
      id: "wf-1", tenant_id: "t1", type: "payment_success", status: "failed",
      payload: {}, current_step: 1, total_steps: 3, completed_steps: 0,
      idempotency_key: null, error: "fail", rollback_error: null,
      retry_count: 3, max_retries: 3, trigger_source: "system",
      trigger_entity_id: null, trigger_entity_type: null,
      progress_pct: 0, duration_seconds: null,
      started_at: null, completed_at: null, created_at: "2026-06-28T00:00:00Z",
    };
    mockQuery.maybeSingle.mockResolvedValueOnce({ data: wfRow, error: null });
    await expect(workflowEngine.retry("wf-1")).rejects.toThrow("Max retries exceeded");
  });
});

describe("WorkflowEngine.getStats", () => {
  it("returns mapped stats from rpc", async () => {
    const { supabase: sb } = await import("./mocks/supabase-client");
    (sb.rpc as any).mockResolvedValueOnce({
      data: { total: 10, completed: 8, failed: 1, pending: 0, running: 1, rolled_back: 0, success_rate: 80 },
      error: null,
    });
    const stats = await workflowEngine.getStats("tenant-1");
    expect(stats.total).toBe(10);
    expect(stats.completed).toBe(8);
    expect(stats.successRate).toBe(80);
  });

  it("returns safe defaults when rpc returns null", async () => {
    const { supabase: sb } = await import("./mocks/supabase-client");
    (sb.rpc as any).mockResolvedValueOnce({ data: null, error: null });
    const stats = await workflowEngine.getStats("tenant-1");
    expect(stats.total).toBe(0);
    expect(stats.successRate).toBe(100);
  });
});

// ── RecoveryService ───────────────────────────────────────────────────────────

import { recoveryService } from "../services/recovery";

describe("RecoveryService", () => {
  it("calls fn_recover_stale_workflows and returns count", async () => {
    const { supabase: sb } = await import("./mocks/supabase-client");
    (sb.rpc as any).mockResolvedValueOnce({ data: 2, error: null });
    mockQuery.select.mockReturnThis();
    mockQuery.eq.mockReturnThis();
    // second eq for pending + error filter
    mockQuery.eq.mockResolvedValueOnce({ data: [], error: null });
    const count = await recoveryService.recoverStaleWorkflows();
    expect(sb.rpc).toHaveBeenCalledWith("fn_recover_stale_workflows");
    expect(count).toBe(2);
  });

  it("returns 0 when no stale workflows", async () => {
    const { supabase: sb } = await import("./mocks/supabase-client");
    (sb.rpc as any).mockResolvedValueOnce({ data: 0, error: null });
    const count = await recoveryService.recoverStaleWorkflows();
    expect(count).toBe(0);
  });

  it("getStuckWorkflows returns workflows with expired locks", async () => {
    const rows = [
      { id: "wf-stuck-1", type: "payment_success", locked_until: "2026-06-28T00:00:00Z", locked_by: "worker-old" },
    ];
    mockQuery.lt.mockResolvedValueOnce({ data: rows, error: null });
    const stuck = await recoveryService.getStuckWorkflows("tenant-1");
    expect(stuck[0].id).toBe("wf-stuck-1");
    expect(stuck[0].lockedBy).toBe("worker-old");
  });

  it("forceReset throws when workflow not found", async () => {
    mockQuery.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    await expect(recoveryService.forceReset("wf-missing", "tenant-1")).rejects.toThrow("Workflow not found");
  });

  it("forceReset throws on tenant mismatch", async () => {
    mockQuery.maybeSingle.mockResolvedValueOnce({
      data: { status: "failed", locked_until: null, retry_count: 0, max_retries: 3, tenant_id: "other-tenant" },
      error: null,
    });
    await expect(recoveryService.forceReset("wf-1", "tenant-1")).rejects.toThrow("Tenant mismatch");
  });

  it("forceReset throws when max retries already reached", async () => {
    mockQuery.maybeSingle.mockResolvedValueOnce({
      data: { status: "failed", locked_until: null, retry_count: 3, max_retries: 3, tenant_id: "tenant-1" },
      error: null,
    });
    await expect(recoveryService.forceReset("wf-1", "tenant-1")).rejects.toThrow("Max retries already reached");
  });
});
