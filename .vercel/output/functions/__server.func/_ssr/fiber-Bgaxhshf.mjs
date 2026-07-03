import { i as __toESM } from "../_runtime.mjs";
import { a as supabase, i as init_client } from "./client-D3kKP_Nv.mjs";
import { u as require_react } from "../_libs/@floating-ui/react-dom+[...].mjs";
import { s as require_jsx_runtime } from "../_libs/@radix-ui/react-arrow+[...].mjs";
import { i as useQueryClient, n as useQuery, t as useMutation } from "../_libs/tanstack__react-query.mjs";
import { a as useTenantId, i as useAuth } from "./auth-z02iFWqz.mjs";
import { t as Button } from "./button-DRsC1qZi.mjs";
import { t as Input } from "./input-DicJzR9-.mjs";
import { t as Label } from "./label-B4PTMSG2.mjs";
import { Et as Calendar, I as Plus, q as MapPin } from "../_libs/lucide-react.mjs";
import { a as DialogTitle, i as DialogHeader, n as DialogContent, r as DialogFooter, t as Dialog } from "./dialog-BpdftUtE.mjs";
import { a as SelectValue, i as SelectTrigger, n as SelectContent, r as SelectItem, t as Select } from "./select-DUy71i1r.mjs";
import { n as toast } from "../_libs/sonner.mjs";
import { a as objectType, n as coerce, o as stringType } from "../_libs/zod.mjs";
import { n as useForm, t as u } from "../_libs/@hookform/resolvers+[...].mjs";
import { t as Textarea } from "./textarea-DBn9CRiI.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/fiber-Bgaxhshf.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
init_client();
var schema = objectType({
	customer_id: stringType().min(1),
	type: stringType().min(1).default("fiber"),
	address: stringType().min(1),
	scheduled_at: stringType().optional(),
	notes: stringType().optional(),
	cost: coerce.number().min(0).default(0)
});
var STATUS_COLORS = {
	pending: "bg-yellow-500/15 text-yellow-600",
	scheduled: "bg-blue-500/15 text-blue-600",
	in_progress: "bg-purple-500/15 text-purple-600",
	completed: "bg-green-500/15 text-green-600",
	cancelled: "bg-muted text-muted-foreground"
};
function FiberPage() {
	const { user } = useAuth();
	const qc = useQueryClient();
	const [open, setOpen] = (0, import_react.useState)(false);
	const [statusFilter, setStatusFilter] = (0, import_react.useState)("all");
	const { data: tenantId } = useTenantId();
	const installations = useQuery({
		queryKey: [
			"installations",
			tenantId,
			statusFilter
		],
		queryFn: async () => {
			let q = supabase.from("installations").select("*, customers(full_name, phone), profiles!assigned_to(full_name)").eq("tenant_id", tenantId).order("created_at", { ascending: false });
			if (statusFilter !== "all") q = q.eq("status", statusFilter);
			const { data, error } = await q;
			if (error) throw error;
			return data ?? [];
		},
		enabled: !!tenantId
	});
	const customers = useQuery({
		queryKey: ["customers-list", tenantId],
		queryFn: async () => {
			const { data } = await supabase.from("customers").select("id,full_name,phone").eq("tenant_id", tenantId).order("full_name");
			return data ?? [];
		},
		enabled: !!tenantId
	});
	const { register, handleSubmit, reset, setValue, formState: { errors } } = useForm({ resolver: u(schema) });
	const save = useMutation({
		mutationFn: async (data) => {
			const { error } = await supabase.from("installations").insert({
				...data,
				tenant_id: tenantId,
				status: "pending"
			});
			if (error) throw error;
		},
		onSuccess: () => {
			toast.success("Installation request created");
			qc.invalidateQueries({ queryKey: ["installations"] });
			setOpen(false);
			reset();
		},
		onError: (e) => toast.error(e.message)
	});
	const updateStatus = useMutation({
		mutationFn: async ({ id, status }) => {
			const updates = { status };
			if (status === "completed") updates.completed_at = (/* @__PURE__ */ new Date()).toISOString();
			const { error } = await supabase.from("installations").update(updates).eq("id", id);
			if (error) throw error;
		},
		onSuccess: () => {
			toast.success("Status updated");
			qc.invalidateQueries({ queryKey: ["installations"] });
		},
		onError: (e) => toast.error(e.message)
	});
	const stats = {
		pending: installations.data?.filter((i) => i.status === "pending").length ?? 0,
		scheduled: installations.data?.filter((i) => i.status === "scheduled").length ?? 0,
		completed: installations.data?.filter((i) => i.status === "completed").length ?? 0
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "space-y-6",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex items-center justify-between",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
					className: "text-2xl font-semibold",
					children: "Fiber & Installations"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "text-sm text-muted-foreground",
					children: "Manage installation requests and deployment"
				})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
					onClick: () => {
						reset();
						setOpen(true);
					},
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Plus, { className: "h-4 w-4 mr-2" }), "New Installation"]
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "grid grid-cols-3 gap-4",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "rounded-xl border border-border/60 bg-card p-4",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "text-xs text-muted-foreground uppercase mb-1",
							children: "Pending"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "text-2xl font-bold text-yellow-500",
							children: stats.pending
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "rounded-xl border border-border/60 bg-card p-4",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "text-xs text-muted-foreground uppercase mb-1",
							children: "Scheduled"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "text-2xl font-bold text-blue-500",
							children: stats.scheduled
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "rounded-xl border border-border/60 bg-card p-4",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "text-xs text-muted-foreground uppercase mb-1",
							children: "Completed"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "text-2xl font-bold text-green-500",
							children: stats.completed
						})]
					})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "flex gap-3",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Select, {
					value: statusFilter,
					onValueChange: setStatusFilter,
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectTrigger, {
						className: "w-44",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectValue, {})
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(SelectContent, { children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
							value: "all",
							children: "All"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
							value: "pending",
							children: "Pending"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
							value: "scheduled",
							children: "Scheduled"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
							value: "in_progress",
							children: "In Progress"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
							value: "completed",
							children: "Completed"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
							value: "cancelled",
							children: "Cancelled"
						})
					] })]
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "space-y-3",
				children: installations.isLoading ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "text-center py-12 text-muted-foreground",
					children: "Loading..."
				}) : installations.data?.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "text-center py-12 text-muted-foreground",
					children: "No installations found"
				}) : installations.data?.map((inst) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "rounded-xl border border-border/60 bg-card p-4",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex items-start justify-between gap-4",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex-1",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "flex items-center gap-2 flex-wrap mb-1",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: `rounded-full px-2 py-0.5 text-xs capitalize ${STATUS_COLORS[inst.status] ?? "bg-muted"}`,
										children: inst.status.replace("_", " ")
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "text-xs text-muted-foreground capitalize",
										children: inst.type
									})]
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
									className: "font-medium",
									children: inst.customers?.full_name ?? "—"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
									className: "text-xs text-muted-foreground",
									children: inst.customers?.phone
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "flex items-center gap-1 text-xs text-muted-foreground mt-1",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(MapPin, { className: "h-3 w-3" }), inst.address]
								}),
								inst.scheduled_at && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "flex items-center gap-1 text-xs text-muted-foreground mt-1",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Calendar, { className: "h-3 w-3" }), new Date(inst.scheduled_at).toLocaleString()]
								}),
								inst.notes && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
									className: "text-xs text-muted-foreground mt-1",
									children: inst.notes
								})
							]
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex gap-2 shrink-0",
							children: [
								inst.status === "pending" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
									size: "sm",
									variant: "outline",
									onClick: () => updateStatus.mutate({
										id: inst.id,
										status: "scheduled"
									}),
									children: "Schedule"
								}),
								inst.status === "scheduled" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
									size: "sm",
									variant: "outline",
									onClick: () => updateStatus.mutate({
										id: inst.id,
										status: "in_progress"
									}),
									children: "Start"
								}),
								inst.status === "in_progress" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
									size: "sm",
									onClick: () => updateStatus.mutate({
										id: inst.id,
										status: "completed"
									}),
									children: "Complete"
								})
							]
						})]
					})
				}, inst.id))
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Dialog, {
				open,
				onOpenChange: setOpen,
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DialogContent, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(DialogHeader, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DialogTitle, { children: "New Installation Request" }) }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("form", {
					onSubmit: handleSubmit((d) => save.mutate(d)),
					className: "space-y-4",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "Customer *" }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Select, {
							onValueChange: (v) => setValue("customer_id", v),
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectTrigger, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectValue, { placeholder: "Select customer" }) }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectContent, { children: customers.data?.map((c) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(SelectItem, {
								value: c.id,
								children: [
									c.full_name,
									" — ",
									c.phone
								]
							}, c.id)) })]
						})] }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "Type" }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Select, {
							defaultValue: "fiber",
							onValueChange: (v) => setValue("type", v),
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectTrigger, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectValue, {}) }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(SelectContent, { children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
									value: "fiber",
									children: "Fiber"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
									value: "wireless",
									children: "Wireless"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
									value: "pppoe",
									children: "PPPoE"
								})
							] })]
						})] }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "Address *" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, { ...register("address") })] }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "Scheduled Date/Time" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
							type: "datetime-local",
							...register("scheduled_at")
						})] }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "Installation Cost (KES)" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
							type: "number",
							...register("cost")
						})] }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "Notes" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Textarea, {
							...register("notes"),
							rows: 2
						})] }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DialogFooter, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
							type: "button",
							variant: "outline",
							onClick: () => setOpen(false),
							children: "Cancel"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
							type: "submit",
							disabled: save.isPending,
							children: save.isPending ? "Creating..." : "Create"
						})] })
					]
				})] })
			})
		]
	});
}
//#endregion
export { FiberPage as component };
