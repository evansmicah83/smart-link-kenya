import { i as __toESM } from "../_runtime.mjs";
import { a as supabase, i as init_client } from "./client-D3kKP_Nv.mjs";
import { u as require_react } from "../_libs/@floating-ui/react-dom+[...].mjs";
import { s as require_jsx_runtime } from "../_libs/@radix-ui/react-arrow+[...].mjs";
import { i as useQueryClient, n as useQuery, t as useMutation } from "../_libs/tanstack__react-query.mjs";
import { a as useTenantId, i as useAuth } from "./auth-z02iFWqz.mjs";
import { t as Button } from "./button-DRsC1qZi.mjs";
import { t as Input } from "./input-DicJzR9-.mjs";
import { t as Label } from "./label-B4PTMSG2.mjs";
import { I as Plus, L as Play, ht as CircleX, m as Trash2, mt as Clock, t as Zap, vt as CircleCheckBig } from "../_libs/lucide-react.mjs";
import { a as DialogTitle, i as DialogHeader, n as DialogContent, r as DialogFooter, t as Dialog } from "./dialog-BpdftUtE.mjs";
import { a as SelectValue, i as SelectTrigger, n as SelectContent, r as SelectItem, t as Select } from "./select-DUy71i1r.mjs";
import { i as TabsTrigger, n as TabsContent, r as TabsList, t as Tabs } from "./tabs-WTjz7Ps0.mjs";
import { n as toast } from "../_libs/sonner.mjs";
import { t as Switch } from "./switch-CCza_WcE.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/automation-DkjTmEim.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
init_client();
async function getRules(tenantId) {
	const { data } = await supabase.from("automation_rules").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false });
	return data ?? [];
}
async function saveRule(rule) {
	if (rule.id) {
		const { error } = await supabase.from("automation_rules").update(rule).eq("id", rule.id);
		if (error) throw error;
	} else {
		const { error } = await supabase.from("automation_rules").insert(rule);
		if (error) throw error;
	}
}
async function deleteRule(id) {
	const { error } = await supabase.from("automation_rules").delete().eq("id", id);
	if (error) throw error;
}
async function toggleRule(id, isActive) {
	const { error } = await supabase.from("automation_rules").update({ is_active: isActive }).eq("id", id);
	if (error) throw error;
}
async function getRuleLogs(tenantId, limit = 50) {
	const { data } = await supabase.from("automation_logs").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(limit);
	return data ?? [];
}
var TRIGGER_LABELS = {
	subscription_expired: "Subscription Expired",
	payment_received: "Payment Received",
	payment_failed: "Payment Failed",
	router_offline: "Router Goes Offline",
	customer_inactive_days: "Customer Inactive (days)",
	low_wallet_balance: "Low Wallet Balance",
	ticket_sla_breached: "Ticket SLA Breached",
	new_customer: "New Customer Registered"
};
var ACTION_LABELS = {
	suspend_service: "Suspend Service",
	activate_service: "Activate Service",
	send_sms: "Send SMS",
	send_email: "Send Email",
	notify_admin: "Notify Administrator",
	create_ticket: "Create Support Ticket",
	generate_invoice: "Generate Invoice"
};
var BLANK_RULE = (tenantId) => ({
	tenant_id: tenantId,
	name: "",
	trigger: "subscription_expired",
	conditions: {},
	action: "suspend_service",
	action_params: {},
	is_active: true
});
function AutomationPage() {
	const { user } = useAuth();
	const qc = useQueryClient();
	const { data: tenantId } = useTenantId();
	const [open, setOpen] = (0, import_react.useState)(false);
	const [editing, setEditing] = (0, import_react.useState)(null);
	const [deleteTarget, setDeleteTarget] = (0, import_react.useState)(null);
	const [form, setForm] = (0, import_react.useState)(BLANK_RULE(""));
	const rules = useQuery({
		queryKey: ["automation-rules", tenantId],
		queryFn: () => getRules(tenantId),
		enabled: !!tenantId
	});
	const logs = useQuery({
		queryKey: ["automation-logs", tenantId],
		queryFn: () => getRuleLogs(tenantId),
		enabled: !!tenantId
	});
	const save = useMutation({
		mutationFn: (rule) => saveRule(rule),
		onSuccess: () => {
			toast.success(editing ? "Rule updated" : "Rule created");
			qc.invalidateQueries({ queryKey: ["automation-rules"] });
			setOpen(false);
		},
		onError: (e) => toast.error(e.message)
	});
	const remove = useMutation({
		mutationFn: (id) => deleteRule(id),
		onSuccess: () => {
			toast.success("Rule deleted");
			qc.invalidateQueries({ queryKey: ["automation-rules"] });
			setDeleteTarget(null);
		},
		onError: (e) => toast.error(e.message)
	});
	const toggle = useMutation({
		mutationFn: ({ id, active }) => toggleRule(id, active),
		onSuccess: () => qc.invalidateQueries({ queryKey: ["automation-rules"] }),
		onError: (e) => toast.error(e.message)
	});
	function openNew() {
		setEditing(null);
		setForm(BLANK_RULE(tenantId ?? ""));
		setOpen(true);
	}
	function openEdit(rule) {
		setEditing(rule);
		setForm({ ...rule });
		setOpen(true);
	}
	const stats = {
		total: rules.data?.length ?? 0,
		active: rules.data?.filter((r) => r.is_active).length ?? 0,
		logsToday: (logs.data ?? []).filter((l) => l.created_at >= (/* @__PURE__ */ new Date(Date.now() - 864e5)).toISOString()).length
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "space-y-6",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex items-center justify-between",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
					className: "text-2xl font-semibold",
					children: "Automation Rules"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "text-sm text-muted-foreground",
					children: "Configure IF/THEN business automation workflows"
				})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
					onClick: openNew,
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Plus, { className: "h-4 w-4 mr-2" }), "New Rule"]
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "grid grid-cols-3 gap-4",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(StatCard, {
						icon: Zap,
						label: "Total Rules",
						value: stats.total
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(StatCard, {
						icon: Play,
						label: "Active",
						value: stats.active,
						color: "text-green-500"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(StatCard, {
						icon: Clock,
						label: "Runs Today",
						value: stats.logsToday,
						color: "text-blue-500"
					})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Tabs, {
				defaultValue: "rules",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(TabsList, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(TabsTrigger, {
						value: "rules",
						children: [
							"Rules (",
							stats.total,
							")"
						]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(TabsTrigger, {
						value: "logs",
						children: [
							"Execution Logs (",
							logs.data?.length ?? 0,
							")"
						]
					})] }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TabsContent, {
						value: "rules",
						children: rules.isLoading ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "text-center py-12 text-muted-foreground",
							children: "Loading..."
						}) : rules.data?.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "rounded-xl border border-border/60 bg-card p-12 text-center",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Zap, { className: "h-10 w-10 mx-auto mb-3 opacity-20" }),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: "font-medium",
									children: "No automation rules yet"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: "text-xs text-muted-foreground mt-1",
									children: "Create rules to automate billing, notifications, and service management."
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
									className: "mt-4",
									onClick: openNew,
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Plus, { className: "h-4 w-4 mr-2" }), "Create First Rule"]
								})
							]
						}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "space-y-3",
							children: rules.data?.map((rule) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: `rounded-xl border bg-card p-4 flex items-center gap-4 ${rule.is_active ? "border-border/60" : "border-border/30 opacity-60"}`,
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: `h-2 w-2 rounded-full shrink-0 ${rule.is_active ? "bg-green-500 animate-pulse" : "bg-muted-foreground"}` }),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "flex-1 min-w-0",
										children: [
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
												className: "font-medium",
												children: rule.name
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
												className: "text-xs text-muted-foreground mt-0.5",
												children: [
													/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
														className: "bg-primary/10 text-primary rounded px-1.5 py-0.5 mr-1",
														children: TRIGGER_LABELS[rule.trigger]
													}),
													"→ ",
													/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
														className: "bg-secondary/60 rounded px-1.5 py-0.5 ml-1",
														children: ACTION_LABELS[rule.action]
													})
												]
											}),
											rule.last_run && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
												className: "text-[10px] text-muted-foreground mt-1",
												children: [
													"Last run: ",
													new Date(rule.last_run).toLocaleString(),
													" · ",
													rule.run_count ?? 0,
													" total runs"
												]
											})
										]
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "flex items-center gap-3 shrink-0",
										children: [
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Switch, {
												checked: rule.is_active,
												onCheckedChange: (v) => toggle.mutate({
													id: rule.id,
													active: v
												})
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
												onClick: () => openEdit(rule),
												className: "text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded border border-border/60 hover:bg-accent",
												children: "Edit"
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
												onClick: () => setDeleteTarget(rule.id),
												className: "text-muted-foreground hover:text-destructive",
												children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Trash2, { className: "h-4 w-4" })
											})
										]
									})
								]
							}, rule.id))
						})
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TabsContent, {
						value: "logs",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "rounded-xl border border-border/60 bg-card overflow-x-auto",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("table", {
								className: "w-full text-sm min-w-[500px]",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("thead", {
									className: "bg-muted/40 text-xs uppercase text-muted-foreground",
									children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", { children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
											className: "px-4 py-3 text-left",
											children: "Rule"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
											className: "px-4 py-3 text-left",
											children: "Result"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
											className: "px-4 py-3 text-left",
											children: "Message"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
											className: "px-4 py-3 text-left",
											children: "When"
										})
									] })
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tbody", { children: logs.isLoading ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tr", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
									colSpan: 4,
									className: "px-4 py-8 text-center text-muted-foreground",
									children: "Loading..."
								}) }) : logs.data?.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tr", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
									colSpan: 4,
									className: "px-4 py-8 text-center text-muted-foreground",
									children: "No executions yet"
								}) }) : logs.data?.map((l) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", {
									className: "border-t border-border/60",
									children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
											className: "px-4 py-3 text-sm font-medium",
											children: l.rule_name ?? l.rule_id
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
											className: "px-4 py-3",
											children: l.success ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
												className: "flex items-center gap-1 text-green-600 text-xs",
												children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(CircleCheckBig, { className: "h-3 w-3" }), "Success"]
											}) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
												className: "flex items-center gap-1 text-red-600 text-xs",
												children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(CircleX, { className: "h-3 w-3" }), "Failed"]
											})
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
											className: "px-4 py-3 text-xs text-muted-foreground",
											children: l.message ?? "—"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
											className: "px-4 py-3 text-xs text-muted-foreground",
											children: new Date(l.created_at).toLocaleString()
										})
									]
								}, l.id)) })]
							})
						})
					})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Dialog, {
				open,
				onOpenChange: setOpen,
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DialogContent, {
					className: "max-w-lg",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(DialogHeader, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DialogTitle, { children: editing ? "Edit Rule" : "New Automation Rule" }) }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "space-y-4",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "Rule Name *" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
									value: form.name,
									onChange: (e) => setForm((f) => ({
										...f,
										name: e.target.value
									})),
									placeholder: "e.g. Suspend on expiry"
								})] }),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "Trigger (IF)" }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Select, {
									value: form.trigger,
									onValueChange: (v) => setForm((f) => ({
										...f,
										trigger: v
									})),
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectTrigger, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectValue, {}) }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectContent, { children: Object.entries(TRIGGER_LABELS).map(([k, v]) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
										value: k,
										children: v
									}, k)) })]
								})] }),
								form.trigger === "customer_inactive_days" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "Inactive Days Threshold" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
									type: "number",
									value: form.conditions.days ?? 30,
									onChange: (e) => setForm((f) => ({
										...f,
										conditions: {
											...f.conditions,
											days: Number(e.target.value)
										}
									}))
								})] }),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "Action (THEN)" }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Select, {
									value: form.action,
									onValueChange: (v) => setForm((f) => ({
										...f,
										action: v
									})),
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectTrigger, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectValue, {}) }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectContent, { children: Object.entries(ACTION_LABELS).map(([k, v]) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
										value: k,
										children: v
									}, k)) })]
								})] }),
								(form.action === "send_sms" || form.action === "send_email") && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "Message Template" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
									value: form.action_params.message ?? "",
									onChange: (e) => setForm((f) => ({
										...f,
										action_params: {
											...f.action_params,
											message: e.target.value
										}
									})),
									placeholder: "Dear {customer_name}, your service has been updated."
								})] }),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "flex items-center gap-3",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Switch, {
										checked: form.is_active,
										onCheckedChange: (v) => setForm((f) => ({
											...f,
											is_active: v
										}))
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "Active" })]
								})
							]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DialogFooter, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
							variant: "outline",
							onClick: () => setOpen(false),
							children: "Cancel"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
							onClick: () => save.mutate(form),
							disabled: !form.name || save.isPending,
							children: save.isPending ? "Saving..." : "Save Rule"
						})] })
					]
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Dialog, {
				open: !!deleteTarget,
				onOpenChange: (o) => {
					if (!o) setDeleteTarget(null);
				},
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DialogContent, {
					className: "max-w-sm",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(DialogHeader, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DialogTitle, { children: "Delete Rule" }) }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "text-sm text-muted-foreground",
							children: "Are you sure you want to delete this automation rule? This cannot be undone."
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DialogFooter, {
							className: "gap-2",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
								variant: "outline",
								onClick: () => setDeleteTarget(null),
								children: "Cancel"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
								variant: "destructive",
								onClick: () => remove.mutate(deleteTarget),
								disabled: remove.isPending,
								children: "Delete"
							})]
						})
					]
				})
			})
		]
	});
}
function StatCard({ icon: Icon, label, value, color }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "rounded-xl border border-border/60 bg-card p-4",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "flex items-center justify-between mb-2",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "text-xs text-muted-foreground uppercase",
				children: label
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Icon, { className: `h-4 w-4 ${color ?? "text-muted-foreground"}` })]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: `text-2xl font-bold ${color ?? ""}`,
			children: value
		})]
	});
}
//#endregion
export { AutomationPage as component };
