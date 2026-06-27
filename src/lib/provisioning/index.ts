/**
 * SmartLinkNet — Service Provisioning Engine
 * State-machine based workflow execution for payment, activation, suspension
 */
import { supabase } from "@/integrations/supabase/client";

export type WorkflowType =
  | "payment_success"
  | "payment_failure"
  | "subscription_expiry"
  | "subscription_renewal"
  | "manual_activation"
  | "manual_suspension";

export type WorkflowStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "rolled_back";

export type StepType =
  | "verify_payment"
  | "create_subscription"
  | "generate_invoice"
  | "update_radius"
  | "activate_router_user"
  | "suspend_router_user"
  | "send_sms"
  | "send_email"
  | "create_audit_log"
  | "update_customer_status"
  | "check_grace_period"
  | "debit_wallet"
  | "credit_wallet"
  | "notify_admin"
  | "custom";

export interface ProvisioningWorkflow {
  id?: string;
  tenant_id: string;
  type: WorkflowType;
  status: WorkflowStatus;
  payload: Record<string, unknown>;
  steps?: ProvisioningStep[];
  current_step: number;
  idempotency_key?: string | null;
  error?: string | null;
  retry_count: number;
  max_retries: number;
  trigger_source?: string;
  trigger_entity_id?: string | null;
  trigger_entity_type?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  created_at?: string;
  total_steps?: number;
  completed_steps?: number;
}

export interface ProvisioningStep {
  id?: string;
  workflow_id?: string;
  step_order: number;
  step_name: string;
  step_type: StepType;
  status: "pending" | "running" | "completed" | "failed" | "skipped";
  input_data?: Record<string, unknown>;
  output_data?: Record<string, unknown>;
  error?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
}

export async function getWorkflows(tenantId: string, status?: WorkflowStatus): Promise<ProvisioningWorkflow[]> {
  let q = (supabase as any)
    .from("vw_provisioning_status")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (status) q = q.eq("status", status);
  const { data } = await q;
  return (data ?? []) as ProvisioningWorkflow[];
}

export async function getWorkflowById(workflowId: string): Promise<{ workflow: ProvisioningWorkflow; steps: ProvisioningStep[] } | null> {
  const [wf, steps] = await Promise.all([
    (supabase as any).from("provisioning_workflows").select("*").eq("id", workflowId).single(),
    (supabase as any).from("provisioning_steps").select("*").eq("workflow_id", workflowId).order("step_order"),
  ]);
  if (!wf.data) return null;
  return { workflow: wf.data as ProvisioningWorkflow, steps: (steps.data ?? []) as ProvisioningStep[] };
}

export async function initiatePaymentWorkflow(
  tenantId: string,
  paymentId: string,
  customerId: string,
  packageId: string
): Promise<string> {
  const { data, error } = await (supabase as any).rpc("fn_initiate_payment_workflow", {
    _tenant_id: tenantId,
    _payment_id: paymentId,
    _customer_id: customerId,
    _package_id: packageId,
  });
  if (error) throw error;
  return data as string;
}

export async function retryWorkflow(workflowId: string): Promise<void> {
  const { error } = await (supabase as any)
    .from("provisioning_workflows")
    .update({ status: "pending", retry_count: (supabase as any).raw("retry_count + 1"), error: null })
    .eq("id", workflowId)
    .eq("status", "failed");
  if (error) throw error;
  await (supabase as any).from("job_queue").insert({
    type: "run_provisioning_workflow",
    payload: { workflow_id: workflowId },
    priority: 1,
    queue_name: "provisioning",
  });
}

export async function getWorkflowStats(tenantId: string) {
  const { data } = await (supabase as any)
    .from("provisioning_workflows")
    .select("type, status")
    .eq("tenant_id", tenantId)
    .gte("created_at", new Date(Date.now() - 7 * 86400000).toISOString());
  const items = (data ?? []) as { type: string; status: string }[];
  return {
    total: items.length,
    completed: items.filter((i) => i.status === "completed").length,
    failed: items.filter((i) => i.status === "failed").length,
    pending: items.filter((i) => i.status === "pending" || i.status === "running").length,
    successRate: items.length > 0
      ? Math.round((items.filter((i) => i.status === "completed").length / items.length) * 100)
      : 100,
  };
}

export const WORKFLOW_TYPE_LABELS: Record<WorkflowType, string> = {
  payment_success:      "Payment Success",
  payment_failure:      "Payment Failure",
  subscription_expiry:  "Subscription Expiry",
  subscription_renewal: "Subscription Renewal",
  manual_activation:    "Manual Activation",
  manual_suspension:    "Manual Suspension",
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
  custom:                "⚙️",
};
