import { i as __toESM } from "../_runtime.mjs";
import { a as supabase, i as init_client } from "./client-D3kKP_Nv.mjs";
import { u as require_react } from "../_libs/@floating-ui/react-dom+[...].mjs";
import { s as require_jsx_runtime } from "../_libs/@radix-ui/react-arrow+[...].mjs";
import { i as useQueryClient, n as useQuery, t as useMutation } from "../_libs/tanstack__react-query.mjs";
import { a as useTenantId, i as useAuth } from "./auth-z02iFWqz.mjs";
import { t as Button } from "./button-DRsC1qZi.mjs";
import { t as Input } from "./input-DicJzR9-.mjs";
import { t as Label } from "./label-B4PTMSG2.mjs";
import { I as Plus, O as Search, W as MessageSquare, d as TriangleAlert, jt as ArrowUp, mt as Clock, vt as CircleCheckBig } from "../_libs/lucide-react.mjs";
import { a as DialogTitle, i as DialogHeader, n as DialogContent, r as DialogFooter, t as Dialog } from "./dialog-BpdftUtE.mjs";
import { a as SelectValue, i as SelectTrigger, n as SelectContent, r as SelectItem, t as Select } from "./select-DUy71i1r.mjs";
import { n as toast } from "../_libs/sonner.mjs";
import { a as objectType, n as coerce, o as stringType } from "../_libs/zod.mjs";
import { n as useForm, t as u } from "../_libs/@hookform/resolvers+[...].mjs";
import { t as Textarea } from "./textarea-DBn9CRiI.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/support-CkIPpWWj.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
init_client();
var schema = objectType({
	subject: stringType().min(3),
	description: stringType().optional(),
	type: stringType().min(1).default("support"),
	priority: stringType().min(1).default("medium"),
	customer_id: stringType().optional(),
	sla_hours: coerce.number().min(1).default(24)
});
var PRIORITY_COLORS = {
	low: "bg-blue-500/15 text-blue-600",
	medium: "bg-yellow-500/15 text-yellow-600",
	high: "bg-orange-500/15 text-orange-600",
	critical: "bg-red-500/15 text-red-600"
};
var STATUS_COLORS = {
	open: "bg-blue-500/15 text-blue-600",
	in_progress: "bg-yellow-500/15 text-yellow-600",
	resolved: "bg-green-500/15 text-green-600",
	closed: "bg-muted text-muted-foreground"
};
function SupportPage() {
	const { user } = useAuth();
	const qc = useQueryClient();
	const tenantId = useTenantId().data;
	const [open, setOpen] = (0, import_react.useState)(false);
	const [detailId, setDetailId] = (0, import_react.useState)(null);
	const [statusFilter, setStatusFilter] = (0, import_react.useState)("all");
	const [priorityFilter, setPriorityFilter] = (0, import_react.useState)("all");
	const [search, setSearch] = (0, import_react.useState)("");
	const [replyMsg, setReplyMsg] = (0, import_react.useState)("");
	const [isInternal, setIsInternal] = (0, import_react.useState)(false);
	const tickets = useQuery({
		queryKey: [
			"tickets",
			tenantId,
			statusFilter,
			priorityFilter,
			search
		],
		queryFn: async () => {
			let q = supabase.from("tickets").select("*, customers(full_name, phone), profiles!assigned_to(full_name)").eq("tenant_id", tenantId).order("created_at", { ascending: false });
			if (statusFilter !== "all") q = q.eq("status", statusFilter);
			if (priorityFilter !== "all") q = q.eq("priority", priorityFilter);
			if (search) q = q.ilike("subject", `%${search}%`);
			const { data, error } = await q;
			if (error) throw error;
			return data ?? [];
		},
		enabled: !!tenantId
	});
	const threadQuery = useQuery({
		queryKey: ["ticket-thread", detailId],
		queryFn: async () => {
			const [ticket, messages] = await Promise.all([supabase.from("tickets").select("*, customers(full_name, phone), profiles!assigned_to(full_name)").eq("id", detailId).single(), supabase.from("ticket_messages").select("*, profiles(full_name)").eq("ticket_id", detailId).order("created_at")]);
			return {
				ticket: ticket.data,
				messages: messages.data ?? []
			};
		},
		enabled: !!detailId
	});
	const customers = useQuery({
		queryKey: ["customers-list", tenantId],
		queryFn: async () => {
			const { data } = await supabase.from("customers").select("id,full_name,phone").eq("tenant_id", tenantId).order("full_name");
			return data ?? [];
		},
		enabled: !!tenantId
	});
	const agents = useQuery({
		queryKey: ["agents", tenantId],
		queryFn: async () => {
			const { data } = await supabase.from("profiles").select("id,full_name").eq("tenant_id", tenantId).eq("is_active", true);
			return data ?? [];
		},
		enabled: !!tenantId
	});
	const { register, handleSubmit, reset, setValue } = useForm({ resolver: u(schema) });
	const save = useMutation({
		mutationFn: async (data) => {
			const { error } = await supabase.from("tickets").insert({
				...data,
				tenant_id: tenantId,
				status: "open"
			});
			if (error) throw error;
		},
		onSuccess: () => {
			toast.success("Ticket created");
			qc.invalidateQueries({ queryKey: ["tickets"] });
			setOpen(false);
			reset();
		},
		onError: (e) => toast.error(e.message)
	});
	const updateStatus = useMutation({
		mutationFn: async ({ id, status }) => {
			const updates = { status };
			if (status === "resolved") updates.resolved_at = (/* @__PURE__ */ new Date()).toISOString();
			if (status === "closed") updates.closed_at = (/* @__PURE__ */ new Date()).toISOString();
			const { error } = await supabase.from("tickets").update(updates).eq("id", id);
			if (error) throw error;
		},
		onSuccess: () => {
			toast.success("Ticket updated");
			qc.invalidateQueries({ queryKey: ["tickets"] });
			qc.invalidateQueries({ queryKey: ["ticket-thread", detailId] });
		},
		onError: (e) => toast.error(e.message)
	});
	const escalate = useMutation({
		mutationFn: async (id) => {
			const t = tickets.data?.find((t) => t.id === id);
			const priorities = [
				"low",
				"medium",
				"high",
				"critical"
			];
			const next = priorities[Math.min(priorities.indexOf(t?.priority ?? "medium") + 1, 3)];
			const { error } = await supabase.from("tickets").update({ priority: next }).eq("id", id);
			if (error) throw error;
		},
		onSuccess: () => {
			toast.success("Priority escalated");
			qc.invalidateQueries({ queryKey: ["tickets"] });
		},
		onError: (e) => toast.error(e.message)
	});
	const assign = useMutation({
		mutationFn: async ({ id, userId }) => {
			const { error } = await supabase.from("tickets").update({
				assigned_to: userId,
				status: "in_progress"
			}).eq("id", id);
			if (error) throw error;
		},
		onSuccess: () => {
			toast.success("Assigned");
			qc.invalidateQueries({ queryKey: ["tickets"] });
			qc.invalidateQueries({ queryKey: ["ticket-thread", detailId] });
		},
		onError: (e) => toast.error(e.message)
	});
	const addReply = useMutation({
		mutationFn: async () => {
			const { error } = await supabase.from("ticket_messages").insert({
				ticket_id: detailId,
				sender_id: user?.id,
				message: replyMsg,
				is_internal: isInternal
			});
			if (error) throw error;
			if (!isInternal) await updateStatus.mutateAsync({
				id: detailId,
				status: "in_progress"
			});
		},
		onSuccess: () => {
			toast.success("Reply sent");
			setReplyMsg("");
			qc.invalidateQueries({ queryKey: ["ticket-thread", detailId] });
		},
		onError: (e) => toast.error(e.message)
	});
	const stats = {
		open: tickets.data?.filter((t) => t.status === "open").length ?? 0,
		in_progress: tickets.data?.filter((t) => t.status === "in_progress").length ?? 0,
		resolved: tickets.data?.filter((t) => t.status === "resolved").length ?? 0,
		critical: tickets.data?.filter((t) => t.priority === "critical").length ?? 0
	};
	function getSlaStatus(t) {
		if (t.status === "resolved" || t.status === "closed") return "resolved";
		const created = new Date(t.created_at).getTime();
		const slaMs = (t.sla_hours ?? 24) * 36e5;
		const diff = Date.now() - created;
		if (diff > slaMs) return "breached";
		if (diff > slaMs * .8) return "warning";
		return "ok";
	}
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "space-y-6",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex flex-col sm:flex-row sm:items-center justify-between gap-3",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
					className: "text-2xl font-semibold",
					children: "Support Desk"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "text-sm text-muted-foreground",
					children: "Customer support tickets and issue tracking"
				})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
					onClick: () => {
						reset();
						setOpen(true);
					},
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Plus, { className: "h-4 w-4 mr-2" }), "New Ticket"]
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "grid grid-cols-2 lg:grid-cols-4 gap-4",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(StatCard, {
						icon: MessageSquare,
						label: "Open",
						value: stats.open,
						color: "text-blue-500"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(StatCard, {
						icon: Clock,
						label: "In Progress",
						value: stats.in_progress,
						color: "text-yellow-500"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(StatCard, {
						icon: CircleCheckBig,
						label: "Resolved",
						value: stats.resolved,
						color: "text-green-500"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(StatCard, {
						icon: TriangleAlert,
						label: "Critical",
						value: stats.critical,
						color: "text-red-500"
					})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex flex-wrap gap-3",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "relative flex-1 min-w-[200px]",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Search, { className: "absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
							className: "pl-9",
							placeholder: "Search subject...",
							value: search,
							onChange: (e) => setSearch(e.target.value)
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Select, {
						value: statusFilter,
						onValueChange: setStatusFilter,
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectTrigger, {
							className: "w-36",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectValue, {})
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(SelectContent, { children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
								value: "all",
								children: "All Status"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
								value: "open",
								children: "Open"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
								value: "in_progress",
								children: "In Progress"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
								value: "resolved",
								children: "Resolved"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
								value: "closed",
								children: "Closed"
							})
						] })]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Select, {
						value: priorityFilter,
						onValueChange: setPriorityFilter,
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectTrigger, {
							className: "w-36",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectValue, {})
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(SelectContent, { children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
								value: "all",
								children: "All Priority"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
								value: "low",
								children: "Low"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
								value: "medium",
								children: "Medium"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
								value: "high",
								children: "High"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
								value: "critical",
								children: "Critical"
							})
						] })]
					})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "space-y-2",
				children: tickets.isLoading ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "text-center py-12 text-muted-foreground",
					children: "Loading..."
				}) : tickets.data?.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "text-center py-12 text-muted-foreground",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(MessageSquare, { className: "h-8 w-8 mx-auto mb-2 opacity-30" }), "No tickets found"]
				}) : tickets.data?.map((t) => {
					const sla = getSlaStatus(t);
					return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: `rounded-xl border bg-card p-4 cursor-pointer hover:bg-accent/30 transition ${sla === "breached" ? "border-red-500/40" : "border-border/60"}`,
						onClick: () => setDetailId(t.id),
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex items-start justify-between gap-4",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "flex-1 min-w-0",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "flex items-center gap-2 flex-wrap mb-1",
										children: [
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
												className: "font-mono text-xs text-muted-foreground",
												children: t.ticket_no
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
												className: `rounded-full px-2 py-0.5 text-xs ${PRIORITY_COLORS[t.priority] ?? "bg-muted"}`,
												children: t.priority
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
												className: `rounded-full px-2 py-0.5 text-xs ${STATUS_COLORS[t.status] ?? "bg-muted"}`,
												children: t.status.replace("_", " ")
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
												className: "text-xs text-muted-foreground capitalize",
												children: t.type
											}),
											sla === "breached" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
												className: "rounded-full px-2 py-0.5 text-xs bg-red-500/15 text-red-600",
												children: "SLA Breached"
											}),
											sla === "warning" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
												className: "rounded-full px-2 py-0.5 text-xs bg-yellow-500/15 text-yellow-600",
												children: "SLA Warning"
											})
										]
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
										className: "font-medium",
										children: t.subject
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "flex items-center gap-3 mt-1 text-xs text-muted-foreground",
										children: [
											t.customers && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
												t.customers.full_name,
												" · ",
												t.customers.phone
											] }),
											t.profiles && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: ["Assigned: ", t.profiles.full_name] }),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: new Date(t.created_at).toLocaleString() })
										]
									})
								]
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "flex gap-2 shrink-0",
								onClick: (e) => e.stopPropagation(),
								children: [
									t.priority !== "critical" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
										onClick: () => escalate.mutate(t.id),
										className: "text-xs rounded px-2 py-1 bg-orange-500/15 text-orange-600 hover:bg-orange-500/30 flex items-center gap-1",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ArrowUp, { className: "h-3 w-3" }), "Escalate"]
									}),
									t.status === "open" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
										size: "sm",
										variant: "outline",
										onClick: () => updateStatus.mutate({
											id: t.id,
											status: "in_progress"
										}),
										children: "Start"
									}),
									t.status === "in_progress" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
										size: "sm",
										variant: "outline",
										onClick: () => updateStatus.mutate({
											id: t.id,
											status: "resolved"
										}),
										children: "Resolve"
									}),
									t.status === "resolved" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
										size: "sm",
										variant: "outline",
										onClick: () => updateStatus.mutate({
											id: t.id,
											status: "closed"
										}),
										children: "Close"
									})
								]
							})]
						})
					}, t.id);
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Dialog, {
				open: !!detailId,
				onOpenChange: (o) => !o && setDetailId(null),
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DialogContent, {
					className: "max-w-2xl max-h-[85vh] overflow-y-auto",
					children: threadQuery.isLoading ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "py-12 text-center text-muted-foreground",
						children: "Loading..."
					}) : threadQuery.data ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(DialogHeader, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DialogTitle, {
						className: "flex items-center gap-2 flex-wrap",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "font-mono text-sm text-muted-foreground",
							children: threadQuery.data.ticket?.ticket_no
						}), threadQuery.data.ticket?.subject]
					}) }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "space-y-4",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "flex gap-2 flex-wrap",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: `rounded-full px-2 py-0.5 text-xs ${PRIORITY_COLORS[threadQuery.data.ticket?.priority] ?? "bg-muted"}`,
										children: threadQuery.data.ticket?.priority
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: `rounded-full px-2 py-0.5 text-xs ${STATUS_COLORS[threadQuery.data.ticket?.status] ?? "bg-muted"}`,
										children: threadQuery.data.ticket?.status?.replace("_", " ")
									}),
									threadQuery.data.ticket?.customers && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
										className: "text-xs text-muted-foreground",
										children: ["Customer: ", threadQuery.data.ticket.customers.full_name]
									})
								]
							}),
							threadQuery.data.ticket?.description && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "rounded-md bg-muted/30 p-3 text-sm",
								children: threadQuery.data.ticket.description
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "flex gap-2 items-center",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "text-xs text-muted-foreground",
									children: "Assign to:"
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Select, {
									onValueChange: (v) => assign.mutate({
										id: detailId,
										userId: v
									}),
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectTrigger, {
										className: "h-8 text-xs w-48",
										children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectValue, { placeholder: "Select agent" })
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectContent, { children: agents.data?.map((a) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
										value: a.id,
										children: a.full_name
									}, a.id)) })]
								})]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "space-y-3 max-h-64 overflow-y-auto",
								children: [threadQuery.data.messages.map((m) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: `rounded-md p-3 text-sm ${m.is_internal ? "bg-yellow-500/10 border border-yellow-500/30" : "bg-muted/30"}`,
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "flex justify-between text-xs text-muted-foreground mb-1",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
											m.profiles?.full_name ?? "Agent",
											" ",
											m.is_internal ? "· 🔒 Internal" : ""
										] }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: new Date(m.created_at).toLocaleString() })]
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { children: m.message })]
								}, m.id)), threadQuery.data.messages.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
									className: "text-xs text-muted-foreground text-center py-4",
									children: "No messages yet"
								})]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "space-y-2",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Textarea, {
									placeholder: "Type reply...",
									value: replyMsg,
									onChange: (e) => setReplyMsg(e.target.value),
									rows: 3
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "flex items-center justify-between",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
										className: "flex items-center gap-2 text-xs cursor-pointer",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
											type: "checkbox",
											checked: isInternal,
											onChange: (e) => setIsInternal(e.target.checked),
											className: "rounded"
										}), "Internal note (not visible to customer)"]
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
										size: "sm",
										onClick: () => addReply.mutate(),
										disabled: !replyMsg || addReply.isPending,
										children: addReply.isPending ? "Sending..." : isInternal ? "Add Note" : "Send Reply"
									})]
								})]
							})
						]
					})] }) : null
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Dialog, {
				open,
				onOpenChange: setOpen,
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DialogContent, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(DialogHeader, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DialogTitle, { children: "New Support Ticket" }) }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("form", {
					onSubmit: handleSubmit((d) => save.mutate(d)),
					className: "space-y-4",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "Customer" }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Select, {
							onValueChange: (v) => setValue("customer_id", v),
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectTrigger, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectValue, { placeholder: "Select customer (optional)" }) }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectContent, { children: customers.data?.map((c) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(SelectItem, {
								value: c.id,
								children: [
									c.full_name,
									" — ",
									c.phone
								]
							}, c.id)) })]
						})] }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "Subject *" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, { ...register("subject") })] }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "Description" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Textarea, {
							...register("description"),
							rows: 3
						})] }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "grid grid-cols-2 gap-4",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "Type" }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Select, {
									defaultValue: "support",
									onValueChange: (v) => setValue("type", v),
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectTrigger, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectValue, {}) }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(SelectContent, { children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
											value: "support",
											children: "Support"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
											value: "billing",
											children: "Billing"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
											value: "installation",
											children: "Installation"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
											value: "complaint",
											children: "Complaint"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
											value: "network",
											children: "Network Issue"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
											value: "other",
											children: "Other"
										})
									] })]
								})] }),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "Priority" }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Select, {
									defaultValue: "medium",
									onValueChange: (v) => setValue("priority", v),
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectTrigger, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectValue, {}) }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(SelectContent, { children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
											value: "low",
											children: "Low"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
											value: "medium",
											children: "Medium"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
											value: "high",
											children: "High"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
											value: "critical",
											children: "Critical"
										})
									] })]
								})] }),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "SLA (hours)" }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Select, {
									defaultValue: "24",
									onValueChange: (v) => setValue("sla_hours", Number(v)),
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectTrigger, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectValue, {}) }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(SelectContent, { children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
											value: "4",
											children: "4 hours"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
											value: "8",
											children: "8 hours"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
											value: "24",
											children: "24 hours"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
											value: "48",
											children: "48 hours"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
											value: "72",
											children: "72 hours"
										})
									] })]
								})] })
							]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DialogFooter, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
							type: "button",
							variant: "outline",
							onClick: () => setOpen(false),
							children: "Cancel"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
							type: "submit",
							disabled: save.isPending,
							children: save.isPending ? "Creating..." : "Create Ticket"
						})] })
					]
				})] })
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
export { SupportPage as component };
