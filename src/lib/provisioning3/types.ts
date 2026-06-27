/**
 * SmartLinkNet — Phase 3: Provisioning Engine Types
 */

export type WorkflowType =
  | "payment_success"
  | "payment_failure"
  | "subscription_expiry"
  | "subscription_renewal"
  | "manual_activation"
  | "manual_suspension";

export type WorkflowStatus =
  | "pending" | "running" | "completed"
  | "failed" | "rolled_back" | "compensating";

export type StepStatus =
  | "pending" | "running" | "completed"
  | "failed" | "skipped" | "compensating" | "compensated";

export type StepType =
  | "verify_payment" | "create_subscription" | "generate_invoice"
  | "update_radius" | "activate_router_user" | "suspend_router_user"
  | "send_sms" | "send_email" | "create_audit_log" | "update_customer_status"
  | "check_grace_period" | "debit_wallet" | "credit_wallet"
  | "notify_admin" | "record_failure" | "retry_payment" | "custom";

export type WorkflowEventType =
  | "workflow_created" | "workflow_started" | "workflow_completed"
  | "workflow_failed" | "workflow_rolled_back" | "workflow_retried"
  | "step_started" | "step_completed" | "step_failed" | "step_skipped"
  | "step_compensating" | "step_compensated"
  | "lock_acquired" | "lock_released" | "lock_expired"
  | "recovery_triggered" | "idempotency_hit";

export type AuditEntityType =
  | "subscription" | "payment" | "invoice" | "customer"
  | "router" | "radius_user" | "session" | "workflow" | "system";

export interface ProvisioningWorkflow {
  id: string;
  tenantId: string;
  type: WorkflowType;
  status: WorkflowStatus;
  payload: Record<string, unknown>;
  currentStep: number;
  totalSteps: number;
  completedSteps: number;
  idempotencyKey: string | null;
  error: string | null;
  rollbackError: string | null;
  retryCount: number;
  maxRetries: number;
  triggerSource: string;
  triggerEntityId: string | null;
  triggerEntityType: string | null;
  progressPct: number;
  durationSeconds: number | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

export interface ProvisioningStep {
  id: string;
  workflowId: string;
  tenantId: string;
  stepOrder: number;
  stepName: string;
  stepType: StepType;
  status: StepStatus;
  inputData: Record<string, unknown>;
  outputData: Record<string, unknown>;
  error: string | null;
  attempt: number;
  canCompensate: boolean;
  compensated: boolean;
  compensationData: Record<string, unknown>;
  stepDurationSec: number | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

export interface WorkflowEvent {
  id: string;
  workflowId: string;
  tenantId: string;
  sequenceNo: number;
  eventType: WorkflowEventType;
  stepName: string | null;
  stepOrder: number | null;
  payload: Record<string, unknown>;
  actor: string;
  occurredAt: string;
}

export interface AuditEntry {
  id: string;
  tenantId: string;
  workflowId: string | null;
  entityType: AuditEntityType;
  entityId: string | null;
  action: string;
  beforeState: Record<string, unknown> | null;
  afterState: Record<string, unknown> | null;
  diff: Record<string, unknown> | null;
  actor: string;
  actorType: string;
  metadata: Record<string, unknown>;
  workflowType: WorkflowType | null;
  workflowStatus: WorkflowStatus | null;
  occurredAt: string;
}

export interface ProvisioningStats {
  total: number;
  completed: number;
  failed: number;
  pending: number;
  running: number;
  rolledBack: number;
  successRate: number;
}

// ── Step definition used by workflow builders ─────────────────────────────────

export interface StepDefinition {
  name: string;
  type: StepType;
  canCompensate: boolean;
  input: (payload: Record<string, unknown>, ctx: StepContext) => Record<string, unknown>;
  execute: (input: Record<string, unknown>, ctx: StepContext) => Promise<Record<string, unknown>>;
  compensate?: (input: Record<string, unknown>, output: Record<string, unknown>, ctx: StepContext) => Promise<void>;
}

export interface StepContext {
  workflowId: string;
  tenantId: string;
  payload: Record<string, unknown>;
  /** outputs from previously completed steps, keyed by step name */
  results: Record<string, Record<string, unknown>>;
}

// ── Label maps ────────────────────────────────────────────────────────────────

export const WORKFLOW_TYPE_LABELS: Record<WorkflowType, string> = {
  payment_success:      "Payment Success",
  payment_failure:      "Payment Failure",
  subscription_expiry:  "Subscription Expiry",
  subscription_renewal: "Subscription Renewal",
  manual_activation:    "Manual Activation",
  manual_suspension:    "Manual Suspension",
};

export const WORKFLOW_STATUS_COLORS: Record<WorkflowStatus, string> = {
  pending:      "bg-yellow-500/15 text-yellow-600",
  running:      "bg-blue-500/15 text-blue-600",
  completed:    "bg-green-500/15 text-green-600",
  failed:       "bg-red-500/15 text-red-600",
  rolled_back:  "bg-orange-500/15 text-orange-600",
  compensating: "bg-purple-500/15 text-purple-600",
};

export const STEP_STATUS_COLORS: Record<StepStatus, string> = {
  pending:      "bg-muted text-muted-foreground",
  running:      "bg-blue-500/15 text-blue-600",
  completed:    "bg-green-500/15 text-green-600",
  failed:       "bg-red-500/15 text-red-600",
  skipped:      "bg-muted text-muted-foreground",
  compensating: "bg-orange-500/15 text-orange-600",
  compensated:  "bg-purple-500/15 text-purple-600",
};

export const STEP_TYPE_ICONS: Record<StepType, string> = {
  verify_payment:        "💳",
  create_subscription:   "📋",
  generate_invoice:      "🧾",
  update_radius:         "📡",
  activate_router_user:  "✅",
  suspend_router_user:   "⏸",
  send_sms:              "💬",
  send_email:            "📧",
  create_audit_log:      "📝",
  update_customer_status:"👤",
  check_grace_period:    "⏰",
  debit_wallet:          "💸",
  credit_wallet:         "💰",
  notify_admin:          "🔔",
  record_failure:        "🚫",
  retry_payment:         "🔄",
  custom:                "⚙️",
};
