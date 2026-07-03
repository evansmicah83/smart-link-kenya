import { i as __toESM } from "../_runtime.mjs";
import { a as supabase, i as init_client } from "./client-D3kKP_Nv.mjs";
import { u as require_react } from "../_libs/@floating-ui/react-dom+[...].mjs";
import { s as require_jsx_runtime } from "../_libs/@radix-ui/react-arrow+[...].mjs";
import { i as useQueryClient, n as useQuery, t as useMutation } from "../_libs/tanstack__react-query.mjs";
import { a as useTenantId } from "./auth-z02iFWqz.mjs";
import { t as Button } from "./button-DRsC1qZi.mjs";
import { t as Input } from "./input-DicJzR9-.mjs";
import { $ as Layers, M as RefreshCw, Pt as Activity, d as TriangleAlert, ht as CircleX, j as RotateCcw, mt as Clock, rt as FileText, t as Zap, vt as CircleCheckBig, w as ShieldCheck, xt as ChevronRight } from "../_libs/lucide-react.mjs";
import { a as DialogTitle, i as DialogHeader, n as DialogContent, t as Dialog } from "./dialog-BpdftUtE.mjs";
import { a as SelectValue, i as SelectTrigger, n as SelectContent, r as SelectItem, t as Select } from "./select-DUy71i1r.mjs";
import { i as TabsTrigger, n as TabsContent, r as TabsList, t as Tabs } from "./tabs-WTjz7Ps0.mjs";
import { n as toast } from "../_libs/sonner.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/provisioning-CbpE3VNA.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
var WORKFLOW_TYPE_LABELS = {
	payment_success: "Payment Success",
	payment_failure: "Payment Failure",
	subscription_expiry: "Subscription Expiry",
	subscription_renewal: "Subscription Renewal",
	manual_activation: "Manual Activation",
	manual_suspension: "Manual Suspension"
};
var WORKFLOW_STATUS_COLORS = {
	pending: "bg-yellow-500/15 text-yellow-600",
	running: "bg-blue-500/15 text-blue-600",
	completed: "bg-green-500/15 text-green-600",
	failed: "bg-red-500/15 text-red-600",
	rolled_back: "bg-orange-500/15 text-orange-600",
	compensating: "bg-purple-500/15 text-purple-600"
};
var STEP_STATUS_COLORS = {
	pending: "bg-muted text-muted-foreground",
	running: "bg-blue-500/15 text-blue-600",
	completed: "bg-green-500/15 text-green-600",
	failed: "bg-red-500/15 text-red-600",
	skipped: "bg-muted text-muted-foreground",
	compensating: "bg-orange-500/15 text-orange-600",
	compensated: "bg-purple-500/15 text-purple-600"
};
var STEP_TYPE_ICONS = {
	verify_payment: "💳",
	create_subscription: "📋",
	generate_invoice: "🧾",
	update_radius: "📡",
	activate_router_user: "✅",
	suspend_router_user: "⏸",
	send_sms: "💬",
	send_email: "📧",
	create_audit_log: "📝",
	update_customer_status: "👤",
	check_grace_period: "⏰",
	debit_wallet: "💸",
	credit_wallet: "💰",
	notify_admin: "🔔",
	record_failure: "🚫",
	retry_payment: "🔄",
	custom: "⚙️"
};
init_client();
function mapRow$1(r) {
	return {
		id: r["id"],
		workflowId: r["workflow_id"],
		tenantId: r["tenant_id"],
		sequenceNo: r["sequence_no"],
		eventType: r["event_type"],
		stepName: r["step_name"] ?? null,
		stepOrder: r["step_order"] ?? null,
		payload: r["payload"] ?? {},
		actor: r["actor"] ?? "system",
		occurredAt: r["occurred_at"]
	};
}
var EventStoreService = class {
	async append(workflowId, tenantId, eventType, payload = {}, opts = {}) {
		await supabase.from("workflow_events").insert({
			workflow_id: workflowId,
			tenant_id: tenantId,
			event_type: eventType,
			step_name: opts.stepName ?? null,
			step_order: opts.stepOrder ?? null,
			payload,
			actor: opts.actor ?? "system",
			occurred_at: (/* @__PURE__ */ new Date()).toISOString()
		}).catch(() => {});
	}
	async getForWorkflow(workflowId) {
		const { data } = await supabase.from("workflow_events").select("*").eq("workflow_id", workflowId).order("sequence_no");
		return (data ?? []).map(mapRow$1);
	}
	async getForTenant(tenantId, opts = {}) {
		let q = supabase.from("workflow_events").select("*").eq("tenant_id", tenantId).order("occurred_at", { ascending: false }).limit(opts.limit ?? 200);
		if (opts.since) q = q.gte("occurred_at", opts.since);
		if (opts.eventType) q = q.eq("event_type", opts.eventType);
		const { data } = await q;
		return (data ?? []).map(mapRow$1);
	}
	/**
	* Replay events for a workflow to reconstruct its current state.
	* Returns the last known status from the event stream.
	*/
	async replayWorkflowState(workflowId) {
		const events = await this.getForWorkflow(workflowId);
		let status = "pending";
		let currentStep = 0;
		const completedSteps = [];
		let failedStep = null;
		for (const ev of events) switch (ev.eventType) {
			case "workflow_started":
				status = "running";
				break;
			case "workflow_completed":
				status = "completed";
				break;
			case "workflow_failed":
				status = "failed";
				break;
			case "workflow_rolled_back":
				status = "rolled_back";
				break;
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
		return {
			status,
			currentStep,
			completedSteps,
			failedStep
		};
	}
};
var eventStore = new EventStoreService();
init_client();
function mapRow(r) {
	return {
		id: r["id"],
		tenantId: r["tenant_id"],
		workflowId: r["workflow_id"] ?? null,
		entityType: r["entity_type"],
		entityId: r["entity_id"] ?? null,
		action: r["action"],
		beforeState: r["before_state"] ?? null,
		afterState: r["after_state"] ?? null,
		diff: r["diff"] ?? null,
		actor: r["actor"],
		actorType: r["actor_type"],
		metadata: r["metadata"] ?? {},
		workflowType: r["workflow_type"] ?? null,
		workflowStatus: r["workflow_status"] ?? null,
		occurredAt: r["occurred_at"]
	};
}
var AuditTrailService = class {
	async record(opts) {
		await supabase.from("audit_trail").insert({
			tenant_id: opts.tenantId,
			workflow_id: opts.workflowId ?? null,
			entity_type: opts.entityType,
			entity_id: opts.entityId ?? null,
			action: opts.action,
			before_state: opts.before ?? null,
			after_state: opts.after ?? null,
			actor: opts.actor ?? "system",
			actor_type: opts.actorType ?? "system",
			metadata: opts.metadata ?? {},
			occurred_at: (/* @__PURE__ */ new Date()).toISOString()
		}).catch(() => {});
	}
	async getForEntity(tenantId, entityType, entityId) {
		const { data } = await supabase.from("vw_audit_trail").select("*").eq("tenant_id", tenantId).eq("entity_type", entityType).eq("entity_id", entityId).order("occurred_at", { ascending: false });
		return (data ?? []).map(mapRow);
	}
	async getForWorkflow(workflowId) {
		const { data } = await supabase.from("vw_audit_trail").select("*").eq("workflow_id", workflowId).order("occurred_at");
		return (data ?? []).map(mapRow);
	}
	async getRecent(tenantId, opts = {}) {
		let q = supabase.from("vw_audit_trail").select("*").eq("tenant_id", tenantId).order("occurred_at", { ascending: false }).limit(opts.limit ?? 200);
		if (opts.entityType) q = q.eq("entity_type", opts.entityType);
		if (opts.action) q = q.eq("action", opts.action);
		if (opts.since) q = q.gte("occurred_at", opts.since);
		const { data } = await q;
		return (data ?? []).map(mapRow);
	}
};
var auditTrail = new AuditTrailService();
init_client();
var now = () => (/* @__PURE__ */ new Date()).toISOString();
var STEP_MAX_ATTEMPTS = 3;
function mapWorkflow(r) {
	return {
		id: r["id"],
		tenantId: r["tenant_id"],
		type: r["type"],
		status: r["status"],
		payload: r["payload"] ?? {},
		currentStep: r["current_step"] ?? 0,
		totalSteps: r["total_steps"] ?? 0,
		completedSteps: r["completed_steps"] ?? 0,
		idempotencyKey: r["idempotency_key"] ?? null,
		error: r["error"] ?? null,
		rollbackError: r["rollback_error"] ?? null,
		retryCount: r["retry_count"] ?? 0,
		maxRetries: r["max_retries"] ?? 3,
		triggerSource: r["trigger_source"] ?? "system",
		triggerEntityId: r["trigger_entity_id"] ?? null,
		triggerEntityType: r["trigger_entity_type"] ?? null,
		progressPct: r["progress_pct"] ?? 0,
		durationSeconds: r["duration_seconds"] ?? null,
		startedAt: r["started_at"] ?? null,
		completedAt: r["completed_at"] ?? null,
		createdAt: r["created_at"]
	};
}
var WorkflowEngine = class {
	async list(tenantId, opts = {}) {
		if (!tenantId || typeof tenantId !== "string") return [];
		let q = supabase.from("vw_provisioning_status").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(opts.limit ?? 100);
		if (opts.status) q = q.eq("status", opts.status);
		if (opts.type) q = q.eq("type", opts.type);
		const { data } = await q;
		return (data ?? []).map(mapWorkflow);
	}
	async get(workflowId) {
		const { data } = await supabase.from("vw_provisioning_status").select("*").eq("id", workflowId).maybeSingle();
		return data ? mapWorkflow(data) : null;
	}
	async getSteps(workflowId) {
		const { data } = await supabase.from("vw_workflow_timeline").select("*").eq("workflow_id", workflowId).order("step_order");
		return (data ?? []).map((r) => ({
			id: r["id"] ?? "",
			workflowId: r["workflow_id"],
			tenantId: r["tenant_id"] ?? "",
			stepOrder: r["step_order"],
			stepName: r["step_name"],
			stepType: r["step_type"],
			status: r["status"],
			inputData: r["input_data"] ?? {},
			outputData: r["output_data"] ?? {},
			error: r["error"] ?? null,
			attempt: r["attempt"] ?? 0,
			canCompensate: r["can_compensate"] ?? false,
			compensated: r["compensated"] ?? false,
			compensationData: r["compensation_data"] ?? {},
			stepDurationSec: r["step_duration_sec"] ?? null,
			startedAt: r["started_at"] ?? null,
			completedAt: r["completed_at"] ?? null,
			createdAt: r["created_at"] ?? ""
		}));
	}
	async getStats(tenantId, hours = 24) {
		if (!tenantId || typeof tenantId !== "string") return {
			total: 0,
			completed: 0,
			failed: 0,
			pending: 0,
			running: 0,
			rolledBack: 0,
			successRate: 100
		};
		const { data, error } = await supabase.rpc("fn_provisioning_stats", {
			_tenant_id: tenantId,
			_hours: Number(hours)
		});
		if (error) throw new Error(error.message);
		const r = (Array.isArray(data) ? data[0] : data) ?? {};
		return {
			total: Number(r.total ?? 0),
			completed: Number(r.completed ?? 0),
			failed: Number(r.failed ?? 0),
			pending: Number(r.pending ?? 0),
			running: Number(r.running ?? 0),
			rolledBack: Number(r.rolled_back ?? 0),
			successRate: Number(r.success_rate ?? 100)
		};
	}
	/**
	* Idempotently initiate a workflow. Returns the workflow ID.
	* If a workflow with the same idempotency key already exists, returns its ID.
	*/
	async initiate(opts) {
		const { data, error } = await supabase.rpc("fn_initiate_workflow", {
			_tenant_id: opts.tenantId,
			_type: opts.type,
			_payload: opts.payload,
			_idempotency_key: opts.idempotencyKey,
			_trigger_source: opts.triggerSource ?? "system",
			_trigger_entity_id: opts.triggerEntityId ?? null,
			_trigger_entity_type: opts.triggerEntityType ?? null,
			_max_retries: opts.maxRetries ?? 3
		});
		if (error) throw new Error(error.message);
		return data;
	}
	/**
	* Execute a workflow given its step definitions.
	* Handles: locking, step ordering, per-step retry, saga rollback, event emission.
	*/
	async execute(workflowId, steps, workerId) {
		const { data: locked } = await supabase.rpc("fn_acquire_workflow_lock", {
			_workflow_id: workflowId,
			_worker_id: workerId,
			_ttl_seconds: 300
		});
		if (!locked) return;
		await eventStore.append(workflowId, "", "workflow_started", { worker: workerId });
		const wf = await this.get(workflowId);
		if (!wf) {
			await this._release(workflowId, "failed", "Workflow not found");
			return;
		}
		if (wf.totalSteps === 0) await this._seedSteps(wf, steps);
		const persistedSteps = await this.getSteps(workflowId);
		const results = {};
		for (const ps of persistedSteps) if (ps.status === "completed") results[ps.stepName] = ps.outputData;
		const ctx = {
			workflowId,
			tenantId: wf.tenantId,
			payload: wf.payload,
			results
		};
		for (let i = 0; i < steps.length; i++) {
			const def = steps[i];
			const persisted = persistedSteps.find((s) => s.stepOrder === i + 1);
			if (persisted?.status === "completed") continue;
			const stepId = persisted?.id ?? null;
			const input = def.input(wf.payload, ctx);
			await this._markStep(stepId, workflowId, wf.tenantId, i + 1, def, "running", input);
			await eventStore.append(workflowId, wf.tenantId, "step_started", {
				step: def.name,
				input
			}, {
				stepName: def.name,
				stepOrder: i + 1
			});
			await this._updateWorkflowProgress(workflowId, i + 1);
			let output = {};
			let lastError = null;
			for (let attempt = 1; attempt <= STEP_MAX_ATTEMPTS; attempt++) try {
				output = await def.execute(input, {
					...ctx,
					results
				});
				lastError = null;
				break;
			} catch (err) {
				lastError = err.message;
				if (attempt < STEP_MAX_ATTEMPTS) await new Promise((r) => setTimeout(r, 500 * attempt));
			}
			if (lastError !== null) {
				await this._markStep(stepId, workflowId, wf.tenantId, i + 1, def, "failed", input, {}, lastError);
				await eventStore.append(workflowId, wf.tenantId, "step_failed", {
					step: def.name,
					error: lastError
				}, {
					stepName: def.name,
					stepOrder: i + 1
				});
				await this._compensate(workflowId, wf.tenantId, steps, persistedSteps, results, ctx, i - 1);
				await this._release(workflowId, "failed", `Step "${def.name}" failed: ${lastError}`);
				await eventStore.append(workflowId, wf.tenantId, "workflow_failed", { error: lastError });
				await auditTrail.record({
					tenantId: wf.tenantId,
					workflowId,
					entityType: "workflow",
					entityId: workflowId,
					action: "workflow_failed",
					after: {
						step: def.name,
						error: lastError
					}
				});
				return;
			}
			results[def.name] = output;
			await this._markStep(stepId, workflowId, wf.tenantId, i + 1, def, "completed", input, output);
			await this._updateWorkflowCompletedSteps(workflowId, i + 1);
			await eventStore.append(workflowId, wf.tenantId, "step_completed", {
				step: def.name,
				output
			}, {
				stepName: def.name,
				stepOrder: i + 1
			});
		}
		await this._release(workflowId, "completed");
		await eventStore.append(workflowId, wf.tenantId, "workflow_completed", {});
		await auditTrail.record({
			tenantId: wf.tenantId,
			workflowId,
			entityType: "workflow",
			entityId: workflowId,
			action: "workflow_completed",
			after: {
				type: wf.type,
				steps: steps.length
			}
		});
	}
	/**
	* Trigger a manual_activation or manual_suspension workflow for a subscription.
	* Idempotent — same operator+subscription+date will not create a duplicate.
	*/
	async triggerManual(opts) {
		const date = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
		return this.initiate({
			tenantId: opts.tenantId,
			type: opts.type,
			payload: {
				subscription_id: opts.subscriptionId,
				customer_id: opts.customerId,
				tenant_id: opts.tenantId,
				operator_id: opts.operatorId,
				reason: opts.reason ?? (opts.type === "manual_suspension" ? "Manual suspension" : void 0)
			},
			idempotencyKey: `${opts.type}-${opts.subscriptionId}-${date}-${opts.operatorId}`,
			triggerSource: "operator",
			triggerEntityId: opts.subscriptionId,
			triggerEntityType: "subscription",
			maxRetries: 2
		});
	}
	async retry(workflowId) {
		const wf = await this.get(workflowId);
		if (!wf || wf.status !== "failed") throw new Error("Only failed workflows can be retried");
		if (wf.retryCount >= wf.maxRetries) throw new Error("Max retries exceeded");
		await supabase.from("provisioning_workflows").update({
			status: "pending",
			error: null,
			retry_count: wf.retryCount + 1,
			updated_at: now()
		}).eq("id", workflowId);
		await supabase.from("job_queue").insert({
			tenant_id: wf.tenantId,
			type: "run_provisioning_workflow",
			payload: { workflow_id: workflowId },
			priority: 1,
			queue_name: "provisioning",
			run_at: now(),
			status: "pending"
		});
		await eventStore.append(workflowId, wf.tenantId, "workflow_retried", { retry_count: wf.retryCount + 1 });
	}
	async _seedSteps(wf, steps) {
		const rows = steps.map((s, i) => ({
			workflow_id: wf.id,
			tenant_id: wf.tenantId,
			step_order: i + 1,
			step_name: s.name,
			step_type: s.type,
			status: "pending",
			can_compensate: s.canCompensate,
			input_data: {},
			output_data: {}
		}));
		await supabase.from("provisioning_steps").insert(rows);
		await supabase.from("provisioning_workflows").update({
			total_steps: steps.length,
			updated_at: now()
		}).eq("id", wf.id);
	}
	async _markStep(stepId, workflowId, tenantId, order, def, status, input, output = {}, error = null) {
		const patch = {
			status,
			input_data: input,
			output_data: output,
			error,
			updated_at: now()
		};
		if (status === "running") patch["started_at"] = now();
		if (status === "completed" || status === "failed") patch["completed_at"] = now();
		if (stepId) await supabase.from("provisioning_steps").update(patch).eq("id", stepId);
		else await supabase.from("provisioning_steps").upsert({
			workflow_id: workflowId,
			tenant_id: tenantId,
			step_order: order,
			step_name: def.name,
			step_type: def.type,
			can_compensate: def.canCompensate,
			...patch
		}, {
			onConflict: "workflow_id,step_order",
			ignoreDuplicates: false
		});
	}
	async _compensate(workflowId, tenantId, defs, persisted, results, ctx, fromIndex) {
		await supabase.from("provisioning_workflows").update({
			status: "compensating",
			updated_at: now()
		}).eq("id", workflowId);
		await eventStore.append(workflowId, tenantId, "workflow_rolled_back", {});
		for (let i = fromIndex; i >= 0; i--) {
			const def = defs[i];
			if (!def.canCompensate || !def.compensate) continue;
			const ps = persisted.find((s) => s.stepOrder === i + 1);
			if (!ps || ps.status !== "completed") continue;
			await eventStore.append(workflowId, tenantId, "step_compensating", { step: def.name }, {
				stepName: def.name,
				stepOrder: i + 1
			});
			try {
				await def.compensate(ps.inputData, ps.outputData, ctx);
				await supabase.from("provisioning_steps").update({
					status: "compensated",
					compensated: true,
					updated_at: now()
				}).eq("id", ps.id);
				await eventStore.append(workflowId, tenantId, "step_compensated", { step: def.name }, {
					stepName: def.name,
					stepOrder: i + 1
				});
			} catch (err) {
				await supabase.from("provisioning_workflows").update({
					rollback_error: `Compensation of "${def.name}" failed: ${err.message}`,
					updated_at: now()
				}).eq("id", workflowId);
			}
		}
	}
	async _release(workflowId, status, error = null) {
		await supabase.rpc("fn_release_workflow_lock", {
			_workflow_id: workflowId,
			_status: status,
			_error: error
		});
	}
	async _updateWorkflowProgress(workflowId, step) {
		await supabase.from("provisioning_workflows").update({
			current_step: step,
			updated_at: now()
		}).eq("id", workflowId);
	}
	async _updateWorkflowCompletedSteps(workflowId, completedStep) {
		await supabase.from("provisioning_workflows").update({
			completed_steps: completedStep,
			updated_at: now()
		}).eq("id", workflowId);
	}
};
var workflowEngine = new WorkflowEngine();
init_client();
var RecoveryService = class {
	/**
	* Finds workflows stuck in "running" with an expired lock and resets them to "pending".
	* Should be called by a scheduler every 5 minutes.
	*/
	async recoverStaleWorkflows() {
		const { data } = await supabase.rpc("fn_recover_stale_workflows");
		const recovered = data ?? 0;
		if (recovered > 0) {
			const { data: pending } = await supabase.from("provisioning_workflows").select("id, tenant_id").eq("status", "pending").eq("error", "Recovered from stale lock");
			for (const wf of pending ?? []) {
				await eventStore.append(wf.id, wf.tenant_id, "recovery_triggered", { recovered_at: (/* @__PURE__ */ new Date()).toISOString() });
				await supabase.from("provisioning_workflows").update({ error: null }).eq("id", wf.id);
			}
		}
		return recovered;
	}
	/**
	* Returns all workflows that have been stuck in "running" beyond the expected TTL.
	*/
	async getStuckWorkflows(tenantId) {
		const { data } = await supabase.from("provisioning_workflows").select("id, type, locked_until, locked_by").eq("tenant_id", tenantId).eq("status", "running").lt("locked_until", (/* @__PURE__ */ new Date()).toISOString());
		return (data ?? []).map((r) => ({
			id: r.id,
			type: r.type,
			lockedUntil: r.locked_until,
			lockedBy: r.locked_by ?? "unknown"
		}));
	}
	/**
	* Force-resets a specific workflow back to pending for manual recovery.
	* Only allowed when the lock has expired or the workflow is in a terminal state.
	*/
	async forceReset(workflowId, tenantId) {
		const { data: wf } = await supabase.from("provisioning_workflows").select("status, locked_until, retry_count, max_retries, tenant_id").eq("id", workflowId).maybeSingle();
		if (!wf) throw new Error("Workflow not found");
		if (wf.tenant_id !== tenantId) throw new Error("Tenant mismatch");
		if (wf.retry_count >= wf.max_retries) throw new Error("Max retries already reached");
		const lockExpired = !wf.locked_until || new Date(wf.locked_until) < /* @__PURE__ */ new Date();
		if (wf.status === "running" && !lockExpired) throw new Error("Workflow is actively running — cannot force reset");
		await supabase.from("provisioning_workflows").update({
			status: "pending",
			locked_until: null,
			locked_by: null,
			error: null,
			retry_count: wf.retry_count + 1,
			updated_at: (/* @__PURE__ */ new Date()).toISOString()
		}).eq("id", workflowId);
		await supabase.from("job_queue").insert({
			tenant_id: tenantId,
			type: "run_provisioning_workflow",
			payload: { workflow_id: workflowId },
			priority: 1,
			queue_name: "provisioning",
			run_at: (/* @__PURE__ */ new Date()).toISOString(),
			status: "pending"
		});
		await eventStore.append(workflowId, tenantId, "recovery_triggered", {
			method: "force_reset",
			at: (/* @__PURE__ */ new Date()).toISOString()
		});
	}
};
var recoveryService = new RecoveryService();
function StatCard({ icon: Icon, label, value, color }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "rounded-xl border border-border/60 bg-card p-4",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "flex items-center justify-between mb-2",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "text-xs text-muted-foreground uppercase tracking-wide",
				children: label
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Icon, { className: `h-4 w-4 ${color ?? "text-muted-foreground"}` })]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: `text-2xl font-bold ${color ?? ""}`,
			children: value
		})]
	});
}
function StatusBadge({ status, map }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
		className: `rounded-full px-2 py-0.5 text-xs font-medium capitalize ${map[status] ?? "bg-muted text-muted-foreground"}`,
		children: status.replace(/_/g, " ")
	});
}
function ProgressBar({ pct }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "w-full bg-muted rounded-full h-1.5",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "bg-primary rounded-full h-1.5 transition-all",
			style: { width: `${Math.min(pct, 100)}%` }
		})
	});
}
function WorkflowDetail({ workflowId, tenantId, onClose }) {
	const steps = useQuery({
		queryKey: ["wf-steps", workflowId],
		queryFn: () => workflowEngine.getSteps(workflowId)
	});
	const events = useQuery({
		queryKey: ["wf-events", workflowId],
		queryFn: () => eventStore.getForWorkflow(workflowId)
	});
	const auditEntries = useQuery({
		queryKey: ["wf-audit", workflowId],
		queryFn: () => auditTrail.getForWorkflow(workflowId)
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Dialog, {
		open: true,
		onOpenChange: onClose,
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DialogContent, {
			className: "max-w-3xl max-h-[85vh] overflow-y-auto",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(DialogHeader, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DialogTitle, { children: "Workflow Detail" }) }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Tabs, {
				defaultValue: "steps",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(TabsList, { children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(TabsTrigger, {
							value: "steps",
							children: [
								"Steps (",
								steps.data?.length ?? 0,
								")"
							]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(TabsTrigger, {
							value: "events",
							children: [
								"Event Store (",
								events.data?.length ?? 0,
								")"
							]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(TabsTrigger, {
							value: "audit",
							children: [
								"Audit Trail (",
								auditEntries.data?.length ?? 0,
								")"
							]
						})
					] }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TabsContent, {
						value: "steps",
						className: "space-y-2 mt-4",
						children: steps.data?.map((s) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "rounded-lg border border-border/60 bg-card p-3",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "flex items-center justify-between",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "flex items-center gap-2",
										children: [
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
												className: "text-base",
												children: STEP_TYPE_ICONS[s.stepType] ?? "⚙️"
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
												className: "text-sm font-medium",
												children: s.stepName.replace(/_/g, " ")
											}),
											s.canCompensate && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
												className: "text-[10px] bg-blue-500/10 text-blue-600 px-1.5 py-0.5 rounded",
												children: "compensable"
											}),
											s.compensated && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
												className: "text-[10px] bg-purple-500/10 text-purple-600 px-1.5 py-0.5 rounded",
												children: "rolled back"
											})
										]
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(StatusBadge, {
										status: s.status,
										map: STEP_STATUS_COLORS
									})]
								}),
								s.error && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
									className: "mt-2 text-xs text-red-500 bg-red-500/10 rounded p-2",
									children: s.error
								}),
								s.stepDurationSec !== null && s.status === "completed" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "mt-1 text-xs text-muted-foreground",
									children: [s.stepDurationSec, "s"]
								})
							]
						}, s.id))
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TabsContent, {
						value: "events",
						className: "mt-4",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "space-y-1",
							children: events.data?.map((ev) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "flex items-start gap-3 py-2 border-b border-border/40 last:border-0",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "text-xs font-mono text-muted-foreground w-6 text-right shrink-0",
									children: ["#", ev.sequenceNo]
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "flex-1 min-w-0",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "flex items-center gap-2",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
											className: "text-xs font-medium",
											children: ev.eventType.replace(/_/g, " ")
										}), ev.stepName && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
											className: "text-xs text-muted-foreground",
											children: ["→ ", ev.stepName]
										})]
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
										className: "text-xs text-muted-foreground",
										children: new Date(ev.occurredAt).toLocaleString()
									})]
								})]
							}, ev.id))
						})
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TabsContent, {
						value: "audit",
						className: "mt-4",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "space-y-2",
							children: auditEntries.data?.map((a) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "rounded-lg border border-border/60 bg-card p-3",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "flex items-center justify-between",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
											className: "text-sm font-medium",
											children: a.action.replace(/_/g, " ")
										}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
											className: "text-xs text-muted-foreground",
											children: new Date(a.occurredAt).toLocaleString()
										})]
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "text-xs text-muted-foreground mt-1",
										children: [
											a.entityType,
											" · ",
											a.actor
										]
									}),
									a.diff && Object.keys(a.diff).length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("pre", {
										className: "mt-2 text-xs bg-muted/50 rounded p-2 overflow-x-auto",
										children: JSON.stringify(a.diff, null, 2)
									})
								]
							}, a.id))
						})
					})
				]
			})]
		})
	});
}
function ProvisioningPage() {
	const qc = useQueryClient();
	const { data: tenantId } = useTenantId();
	const [tab, setTab] = (0, import_react.useState)("workflows");
	const [statusFilter, setStatusFilter] = (0, import_react.useState)("all");
	const [typeFilter, setTypeFilter] = (0, import_react.useState)("all");
	const [auditSearch, setAuditSearch] = (0, import_react.useState)("");
	const [selectedWorkflowId, setSelectedWorkflowId] = (0, import_react.useState)(null);
	const stats = useQuery({
		queryKey: ["prov-stats", tenantId],
		queryFn: () => workflowEngine.getStats(tenantId),
		enabled: !!tenantId,
		refetchInterval: 15e3
	});
	const workflows = useQuery({
		queryKey: [
			"workflows",
			tenantId,
			statusFilter,
			typeFilter
		],
		queryFn: () => workflowEngine.list(tenantId, {
			status: statusFilter !== "all" ? statusFilter : void 0,
			type: typeFilter !== "all" ? typeFilter : void 0,
			limit: 100
		}),
		enabled: !!tenantId,
		refetchInterval: 1e4
	});
	const auditEntries = useQuery({
		queryKey: [
			"audit-trail",
			tenantId,
			auditSearch
		],
		queryFn: () => auditTrail.getRecent(tenantId, {
			action: auditSearch || void 0,
			limit: 100
		}),
		enabled: !!tenantId && tab === "audit"
	});
	const stuckWorkflows = useQuery({
		queryKey: ["stuck-workflows", tenantId],
		queryFn: () => recoveryService.getStuckWorkflows(tenantId),
		enabled: !!tenantId && tab === "recovery",
		refetchInterval: 3e4
	});
	const refresh = () => {
		qc.invalidateQueries({ queryKey: ["workflows", tenantId] });
		qc.invalidateQueries({ queryKey: ["prov-stats", tenantId] });
	};
	const retryWf = useMutation({
		mutationFn: (id) => workflowEngine.retry(id),
		onSuccess: () => {
			toast.success("Workflow queued for retry");
			refresh();
		},
		onError: (e) => toast.error(e.message)
	});
	const recoverAll = useMutation({
		mutationFn: () => recoveryService.recoverStaleWorkflows(),
		onSuccess: (n) => {
			toast.success(`Recovered ${n} stale workflow(s)`);
			refresh();
			qc.invalidateQueries({ queryKey: ["stuck-workflows"] });
		},
		onError: (e) => toast.error(e.message)
	});
	const forceReset = useMutation({
		mutationFn: (id) => recoveryService.forceReset(id, tenantId),
		onSuccess: () => {
			toast.success("Workflow reset and re-queued");
			qc.invalidateQueries({ queryKey: ["stuck-workflows"] });
			refresh();
		},
		onError: (e) => toast.error(e.message)
	});
	const s = stats.data;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "space-y-6",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex flex-col gap-3 md:flex-row md:items-end md:justify-between",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
					className: "text-3xl font-semibold",
					children: "Provisioning Engine"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "text-sm text-muted-foreground",
					children: "Event-driven state machine workflows with saga rollback, event store, and audit trail."
				})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex gap-2 flex-wrap",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
						variant: "outline",
						onClick: refresh,
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(RefreshCw, { className: "h-4 w-4 mr-2" }), "Refresh"]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
						variant: "outline",
						onClick: () => recoverAll.mutate(),
						disabled: recoverAll.isPending,
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ShieldCheck, { className: "h-4 w-4 mr-2" }), "Run Recovery"]
					})]
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "grid grid-cols-2 lg:grid-cols-6 gap-4",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(StatCard, {
						icon: Layers,
						label: "Total (24h)",
						value: s?.total ?? 0
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(StatCard, {
						icon: CircleCheckBig,
						label: "Completed",
						value: s?.completed ?? 0,
						color: "text-green-500"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(StatCard, {
						icon: CircleX,
						label: "Failed",
						value: s?.failed ?? 0,
						color: "text-red-500"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(StatCard, {
						icon: Clock,
						label: "Pending",
						value: s?.pending ?? 0,
						color: "text-yellow-500"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(StatCard, {
						icon: Activity,
						label: "Running",
						value: s?.running ?? 0,
						color: "text-blue-500"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(StatCard, {
						icon: Zap,
						label: "Success Rate",
						value: `${s?.successRate ?? 100}%`,
						color: "text-emerald-500"
					})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Tabs, {
				value: tab,
				onValueChange: setTab,
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(TabsList, { children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(TabsTrigger, {
							value: "workflows",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Layers, { className: "h-4 w-4 mr-1.5" }), "Workflows"]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(TabsTrigger, {
							value: "audit",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(FileText, { className: "h-4 w-4 mr-1.5" }), "Audit Trail"]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(TabsTrigger, {
							value: "recovery",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TriangleAlert, { className: "h-4 w-4 mr-1.5" }),
								"Recovery ",
								(stuckWorkflows.data?.length ?? 0) > 0 && `(${stuckWorkflows.data?.length})`
							]
						})
					] }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(TabsContent, {
						value: "workflows",
						className: "space-y-4",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex flex-wrap gap-3",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Select, {
								value: statusFilter,
								onValueChange: setStatusFilter,
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectTrigger, {
									className: "w-40",
									children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectValue, { placeholder: "All statuses" })
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(SelectContent, { children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
										value: "all",
										children: "All Statuses"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
										value: "pending",
										children: "Pending"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
										value: "running",
										children: "Running"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
										value: "completed",
										children: "Completed"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
										value: "failed",
										children: "Failed"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
										value: "rolled_back",
										children: "Rolled Back"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
										value: "compensating",
										children: "Compensating"
									})
								] })]
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Select, {
								value: typeFilter,
								onValueChange: setTypeFilter,
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectTrigger, {
									className: "w-48",
									children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectValue, { placeholder: "All types" })
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(SelectContent, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
									value: "all",
									children: "All Types"
								}), Object.entries(WORKFLOW_TYPE_LABELS).map(([k, v]) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
									value: k,
									children: v
								}, k))] })]
							})]
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "overflow-x-auto rounded-xl border border-border/60 bg-card",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("table", {
								className: "w-full text-sm min-w-[600px]",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("thead", {
									className: "bg-muted/40 text-xs uppercase text-muted-foreground",
									children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", { children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
											className: "px-4 py-3 text-left",
											children: "Type"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
											className: "px-4 py-3 text-left",
											children: "Status"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
											className: "px-4 py-3 text-left hidden md:table-cell",
											children: "Progress"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
											className: "px-4 py-3 text-left hidden lg:table-cell",
											children: "Retries"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
											className: "px-4 py-3 text-left hidden lg:table-cell",
											children: "Duration"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
											className: "px-4 py-3 text-left",
											children: "Created"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
											className: "px-4 py-3 text-left",
											children: "Actions"
										})
									] })
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tbody", { children: workflows.isLoading ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tr", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
									colSpan: 7,
									className: "px-4 py-12 text-center text-muted-foreground",
									children: "Loading…"
								}) }) : workflows.data?.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tr", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
									colSpan: 7,
									className: "px-4 py-12 text-center text-muted-foreground",
									children: "No workflows found"
								}) }) : workflows.data?.map((wf) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", {
									className: "border-t border-border/60 hover:bg-accent/30",
									children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("td", {
											className: "px-4 py-3",
											children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
												className: "font-medium text-sm",
												children: WORKFLOW_TYPE_LABELS[wf.type] ?? wf.type
											}), wf.error && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
												className: "text-xs text-red-500 truncate max-w-[180px]",
												children: wf.error
											})]
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
											className: "px-4 py-3",
											children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(StatusBadge, {
												status: wf.status,
												map: WORKFLOW_STATUS_COLORS
											})
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("td", {
											className: "px-4 py-3 hidden md:table-cell w-32",
											children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
												className: "text-xs text-muted-foreground mb-1",
												children: [
													wf.completedSteps,
													"/",
													wf.totalSteps,
													" steps"
												]
											}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ProgressBar, { pct: wf.progressPct })]
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("td", {
											className: "px-4 py-3 text-xs text-muted-foreground hidden lg:table-cell",
											children: [
												wf.retryCount,
												"/",
												wf.maxRetries
											]
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
											className: "px-4 py-3 text-xs text-muted-foreground hidden lg:table-cell",
											children: wf.durationSeconds != null ? `${wf.durationSeconds}s` : "—"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
											className: "px-4 py-3 text-xs text-muted-foreground",
											children: new Date(wf.createdAt).toLocaleString()
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
											className: "px-4 py-3",
											children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
												className: "flex items-center gap-2",
												children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
													onClick: () => setSelectedWorkflowId(wf.id),
													className: "text-xs text-primary hover:underline flex items-center gap-1",
													children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ChevronRight, { className: "h-3 w-3" }), "Detail"]
												}), wf.status === "failed" && wf.retryCount < wf.maxRetries && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
													onClick: () => retryWf.mutate(wf.id),
													disabled: retryWf.isPending,
													className: "text-xs text-yellow-600 hover:underline flex items-center gap-1",
													children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(RotateCcw, { className: "h-3 w-3" }), "Retry"]
												})]
											})
										})
									]
								}, wf.id)) })]
							})
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(TabsContent, {
						value: "audit",
						className: "space-y-4",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "flex gap-3",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
								placeholder: "Filter by action…",
								value: auditSearch,
								onChange: (e) => setAuditSearch(e.target.value),
								className: "max-w-xs"
							})
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "overflow-x-auto rounded-xl border border-border/60 bg-card",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("table", {
								className: "w-full text-sm min-w-[500px]",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("thead", {
									className: "bg-muted/40 text-xs uppercase text-muted-foreground",
									children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", { children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
											className: "px-4 py-3 text-left",
											children: "Action"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
											className: "px-4 py-3 text-left",
											children: "Entity"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
											className: "px-4 py-3 text-left hidden md:table-cell",
											children: "Workflow"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
											className: "px-4 py-3 text-left hidden lg:table-cell",
											children: "Actor"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
											className: "px-4 py-3 text-left",
											children: "Time"
										})
									] })
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tbody", { children: auditEntries.isLoading ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tr", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
									colSpan: 5,
									className: "px-4 py-12 text-center text-muted-foreground",
									children: "Loading…"
								}) }) : auditEntries.data?.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tr", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
									colSpan: 5,
									className: "px-4 py-12 text-center text-muted-foreground",
									children: "No audit entries found"
								}) }) : auditEntries.data?.map((a) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", {
									className: "border-t border-border/60 hover:bg-accent/30",
									children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
											className: "px-4 py-3 font-medium text-sm",
											children: a.action.replace(/_/g, " ")
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
											className: "px-4 py-3 text-xs text-muted-foreground",
											children: a.entityType
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
											className: "px-4 py-3 text-xs hidden md:table-cell",
											children: a.workflowType ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: WORKFLOW_TYPE_LABELS[a.workflowType] ?? a.workflowType }) : "—"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
											className: "px-4 py-3 text-xs text-muted-foreground hidden lg:table-cell",
											children: a.actor
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
											className: "px-4 py-3 text-xs text-muted-foreground",
											children: new Date(a.occurredAt).toLocaleString()
										})
									]
								}, a.id)) })]
							})
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(TabsContent, {
						value: "recovery",
						className: "space-y-4",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "rounded-xl border border-border/60 bg-card p-5",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "flex items-center justify-between mb-4",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
									className: "text-lg font-semibold",
									children: "Stale Lock Recovery"
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: "text-sm text-muted-foreground",
									children: "Workflows stuck in \"running\" with an expired lock are automatically reset."
								})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
									onClick: () => recoverAll.mutate(),
									disabled: recoverAll.isPending,
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ShieldCheck, { className: "h-4 w-4 mr-2" }), "Recover All Stale"]
								})]
							}), stuckWorkflows.data?.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "text-center py-8 text-muted-foreground",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(CircleCheckBig, { className: "h-8 w-8 mx-auto mb-2 text-green-500 opacity-60" }), "No stuck workflows detected"]
							}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "space-y-2",
								children: stuckWorkflows.data?.map((wf) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "flex items-center justify-between rounded-lg border border-border/60 bg-muted/30 p-3",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
										className: "text-sm font-medium",
										children: wf.type.replace(/_/g, " ")
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "text-xs text-muted-foreground",
										children: [
											"Locked until: ",
											new Date(wf.lockedUntil).toLocaleString(),
											" · Worker: ",
											wf.lockedBy
										]
									})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
										size: "sm",
										variant: "outline",
										onClick: () => forceReset.mutate(wf.id),
										disabled: forceReset.isPending,
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(RotateCcw, { className: "h-3.5 w-3.5 mr-1.5" }), "Force Reset"]
									})]
								}, wf.id))
							})]
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "rounded-xl border border-border/60 bg-card p-5",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
								className: "text-lg font-semibold mb-2",
								children: "Recovery Guidance"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "space-y-2 text-sm text-muted-foreground",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: "Stale lock" }), " — worker crashed mid-execution. Lock TTL is 5 minutes; auto-recovery runs on every queue-worker cycle."] }),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: "Force Reset" }), " — manually re-queues a stuck workflow. Increments retry count. Idempotent steps will resume from where they left off."] }),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: "Max retries exceeded" }), " — workflow must be re-triggered from source (payment, subscription event) with a new idempotency key."] }),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: "Rollback errors" }), " — compensation failures are logged but do not block workflow failure recording. Review manually."] })
								]
							})]
						})]
					})
				]
			}),
			selectedWorkflowId && tenantId && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(WorkflowDetail, {
				workflowId: selectedWorkflowId,
				tenantId,
				onClose: () => setSelectedWorkflowId(null)
			})
		]
	});
}
//#endregion
export { ProvisioningPage as component };
