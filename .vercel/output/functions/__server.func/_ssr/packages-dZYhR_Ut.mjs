import { i as __toESM } from "../_runtime.mjs";
import { a as supabase, i as init_client } from "./client-D3kKP_Nv.mjs";
import { u as require_react } from "../_libs/@floating-ui/react-dom+[...].mjs";
import { s as require_jsx_runtime } from "../_libs/@radix-ui/react-arrow+[...].mjs";
import { i as useQueryClient, n as useQuery, t as useMutation } from "../_libs/tanstack__react-query.mjs";
import { a as useTenantId, i as useAuth } from "./auth-z02iFWqz.mjs";
import { t as Button } from "./button-DRsC1qZi.mjs";
import { t as Input } from "./input-DicJzR9-.mjs";
import { t as Label } from "./label-B4PTMSG2.mjs";
import { I as Plus, b as SquarePen, m as Trash2, mt as Clock, t as Zap, ut as Database } from "../_libs/lucide-react.mjs";
import { a as DialogTitle, i as DialogHeader, n as DialogContent, r as DialogFooter, t as Dialog } from "./dialog-BpdftUtE.mjs";
import { a as SelectValue, i as SelectTrigger, n as SelectContent, r as SelectItem, t as Select } from "./select-DUy71i1r.mjs";
import { n as toast } from "../_libs/sonner.mjs";
import { a as objectType, n as coerce, o as stringType, t as booleanType } from "../_libs/zod.mjs";
import { n as useForm, t as u } from "../_libs/@hookform/resolvers+[...].mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/packages-dZYhR_Ut.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
init_client();
var schema = objectType({
	name: stringType().min(1),
	description: stringType().optional(),
	type: stringType().min(1).default("hotspot"),
	billing_type: stringType().min(1).default("prepaid"),
	duration_days: coerce.number().min(1).default(30),
	price: coerce.number().min(0),
	speed_down_kbps: coerce.number().min(1).default(1024),
	speed_up_kbps: coerce.number().min(1).default(512),
	data_limit_mb: coerce.number().optional().nullable(),
	is_active: booleanType().default(true)
});
function PackagesPage() {
	const { user } = useAuth();
	const qc = useQueryClient();
	const [open, setOpen] = (0, import_react.useState)(false);
	const [editing, setEditing] = (0, import_react.useState)(null);
	const [deleteId, setDeleteId] = (0, import_react.useState)(null);
	const { data: tenantId } = useTenantId();
	const packages = useQuery({
		queryKey: ["packages", tenantId],
		queryFn: async () => {
			const { data, error } = await supabase.from("packages").select("*").eq("tenant_id", tenantId).order("price");
			if (error) throw error;
			return data ?? [];
		},
		enabled: !!tenantId
	});
	const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm({ resolver: u(schema) });
	const save = useMutation({
		mutationFn: async (data) => {
			if (editing) {
				const { error } = await supabase.from("packages").update(data).eq("id", editing.id);
				if (error) throw error;
			} else {
				const { error } = await supabase.from("packages").insert({
					...data,
					tenant_id: tenantId
				});
				if (error) throw error;
			}
		},
		onSuccess: () => {
			toast.success(editing ? "Package updated" : "Package created");
			qc.invalidateQueries({ queryKey: ["packages"] });
			setOpen(false);
			reset();
			setEditing(null);
		},
		onError: (e) => toast.error(e.message)
	});
	const remove = useMutation({
		mutationFn: async (id) => {
			const { error } = await supabase.from("packages").delete().eq("id", id);
			if (error) throw error;
		},
		onSuccess: () => {
			toast.success("Package deleted");
			qc.invalidateQueries({ queryKey: ["packages"] });
		},
		onError: (e) => toast.error(e.message)
	});
	function openEdit(p) {
		setEditing(p);
		Object.keys(schema.shape).forEach((k) => setValue(k, p[k] ?? ""));
		setOpen(true);
	}
	const typeColors = {
		hotspot: "bg-blue-500/15 text-blue-600",
		pppoe: "bg-purple-500/15 text-purple-600",
		fiber: "bg-green-500/15 text-green-600",
		data: "bg-orange-500/15 text-orange-600"
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "space-y-6",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex flex-col sm:flex-row sm:items-center justify-between gap-3",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
					className: "text-2xl font-semibold",
					children: "Packages"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "text-sm text-muted-foreground",
					children: "Internet packages and service plans"
				})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
					onClick: () => {
						setEditing(null);
						reset();
						setOpen(true);
					},
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Plus, { className: "h-4 w-4 mr-2" }), "New Package"]
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "grid gap-4 md:grid-cols-2 lg:grid-cols-3",
				children: packages.isLoading ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "col-span-3 text-center py-12 text-muted-foreground",
					children: "Loading..."
				}) : packages.data?.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "col-span-3 text-center py-12 text-muted-foreground",
					children: "No packages yet. Create your first package."
				}) : packages.data?.map((p) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: `rounded-xl border bg-card p-5 space-y-3 ${p.is_active ? "border-border/60" : "border-border/30 opacity-60"}`,
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex items-start justify-between",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "font-semibold",
								children: p.name
							}), p.description && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "text-xs text-muted-foreground mt-0.5",
								children: p.description
							})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: `text-xs rounded-full px-2 py-0.5 capitalize ${typeColors[p.type] ?? "bg-muted"}`,
								children: p.type
							})]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "text-2xl font-bold",
							children: [
								"KES ",
								Number(p.price).toLocaleString(),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
									className: "text-sm font-normal text-muted-foreground",
									children: [
										"/",
										p.duration_days,
										"d"
									]
								})
							]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "grid grid-cols-2 gap-2 text-xs text-muted-foreground",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "flex items-center gap-1",
									children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Zap, { className: "h-3 w-3" }),
										"↓",
										p.speed_down_kbps >= 1024 ? `${p.speed_down_kbps / 1024}Mbps` : `${p.speed_down_kbps}Kbps`
									]
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "flex items-center gap-1",
									children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Zap, { className: "h-3 w-3" }),
										"↑",
										p.speed_up_kbps >= 1024 ? `${p.speed_up_kbps / 1024}Mbps` : `${p.speed_up_kbps}Kbps`
									]
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "flex items-center gap-1",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Database, { className: "h-3 w-3" }), p.data_limit_mb ? `${p.data_limit_mb >= 1024 ? `${(p.data_limit_mb / 1024).toFixed(0)}GB` : `${p.data_limit_mb}MB`}` : "Unlimited"]
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "flex items-center gap-1",
									children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Clock, { className: "h-3 w-3" }),
										p.duration_days,
										" days"
									]
								})
							]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex gap-2 pt-2 border-t border-border/60",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
								onClick: () => openEdit(p),
								className: "text-xs flex items-center gap-1 text-muted-foreground hover:text-foreground",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SquarePen, { className: "h-3 w-3" }), "Edit"]
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
								onClick: () => setDeleteId(p.id),
								className: "text-xs flex items-center gap-1 text-muted-foreground hover:text-destructive",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Trash2, { className: "h-3 w-3" }), "Delete"]
							})]
						})
					]
				}, p.id))
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Dialog, {
				open: !!deleteId,
				onOpenChange: (o) => {
					if (!o) setDeleteId(null);
				},
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DialogContent, {
					className: "max-w-sm",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(DialogHeader, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DialogTitle, { children: "Delete Package" }) }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "text-sm text-muted-foreground",
							children: "Are you sure you want to delete this package? Active subscriptions using this package will not be affected."
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DialogFooter, {
							className: "gap-2",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
								variant: "outline",
								onClick: () => setDeleteId(null),
								children: "Cancel"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
								variant: "destructive",
								onClick: () => {
									remove.mutate(deleteId);
									setDeleteId(null);
								},
								disabled: remove.isPending,
								children: "Delete"
							})]
						})
					]
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Dialog, {
				open,
				onOpenChange: setOpen,
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DialogContent, {
					className: "max-w-xl",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(DialogHeader, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DialogTitle, { children: editing ? "Edit Package" : "New Package" }) }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("form", {
						onSubmit: handleSubmit((d) => save.mutate(d)),
						className: "space-y-4",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "grid grid-cols-2 gap-4",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "col-span-2",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "Package Name *" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, { ...register("name") })]
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "col-span-2",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "Description" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, { ...register("description") })]
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "Type" }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Select, {
									defaultValue: "hotspot",
									onValueChange: (v) => setValue("type", v),
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectTrigger, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectValue, {}) }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(SelectContent, { children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
											value: "hotspot",
											children: "Hotspot"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
											value: "pppoe",
											children: "PPPoE"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
											value: "fiber",
											children: "Fiber"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
											value: "data",
											children: "Data Bundle"
										})
									] })]
								})] }),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "Billing" }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Select, {
									defaultValue: "prepaid",
									onValueChange: (v) => setValue("billing_type", v),
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectTrigger, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectValue, {}) }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(SelectContent, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
										value: "prepaid",
										children: "Prepaid"
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
										value: "postpaid",
										children: "Postpaid"
									})] })]
								})] }),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "Price (KES) *" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
									type: "number",
									...register("price")
								})] }),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "Duration (days) *" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
									type: "number",
									...register("duration_days")
								})] }),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "Download (Kbps)" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
									type: "number",
									...register("speed_down_kbps")
								})] }),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "Upload (Kbps)" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
									type: "number",
									...register("speed_up_kbps")
								})] }),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "col-span-2",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "Data Limit (MB, blank=unlimited)" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
										type: "number",
										...register("data_limit_mb")
									})]
								})
							]
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DialogFooter, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
							type: "button",
							variant: "outline",
							onClick: () => setOpen(false),
							children: "Cancel"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
							type: "submit",
							disabled: save.isPending,
							children: save.isPending ? "Saving..." : "Save"
						})] })]
					})]
				})
			})
		]
	});
}
//#endregion
export { PackagesPage as component };
