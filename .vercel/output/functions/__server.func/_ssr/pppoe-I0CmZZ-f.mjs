import { i as __toESM } from "../_runtime.mjs";
import { a as supabase, i as init_client } from "./client-D3kKP_Nv.mjs";
import { u as require_react } from "../_libs/@floating-ui/react-dom+[...].mjs";
import { s as require_jsx_runtime } from "../_libs/@radix-ui/react-arrow+[...].mjs";
import { i as useQueryClient, n as useQuery, t as useMutation } from "../_libs/tanstack__react-query.mjs";
import { a as useTenantId, i as useAuth } from "./auth-z02iFWqz.mjs";
import { t as Button } from "./button-DRsC1qZi.mjs";
import { t as Input } from "./input-DicJzR9-.mjs";
import { t as Label } from "./label-B4PTMSG2.mjs";
import { I as Plus, M as RefreshCw, a as WifiOff, b as SquarePen, i as Wifi, m as Trash2 } from "../_libs/lucide-react.mjs";
import { a as DialogTitle, i as DialogHeader, n as DialogContent, r as DialogFooter, t as Dialog } from "./dialog-BpdftUtE.mjs";
import { a as SelectValue, i as SelectTrigger, n as SelectContent, r as SelectItem, t as Select } from "./select-DUy71i1r.mjs";
import { n as toast } from "../_libs/sonner.mjs";
import { a as objectType, o as stringType, t as booleanType } from "../_libs/zod.mjs";
import { n as useForm, t as u } from "../_libs/@hookform/resolvers+[...].mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/pppoe-I0CmZZ-f.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
init_client();
var schema = objectType({
	customer_id: stringType().min(1),
	package_id: stringType().min(1),
	router_id: stringType().optional(),
	username: stringType().min(1),
	password: stringType().min(1),
	ip_address: stringType().optional(),
	auto_renew: booleanType().default(false)
});
function PPPoEPage() {
	const { user } = useAuth();
	const qc = useQueryClient();
	const [open, setOpen] = (0, import_react.useState)(false);
	const [editing, setEditing] = (0, import_react.useState)(null);
	const [search, setSearch] = (0, import_react.useState)("");
	const [deleteId, setDeleteId] = (0, import_react.useState)(null);
	const { data: tenantId } = useTenantId();
	const subscriptions = useQuery({
		queryKey: [
			"pppoe-subs",
			tenantId,
			search
		],
		queryFn: async () => {
			let q = supabase.from("subscriptions").select("*, customers(full_name, phone), packages(name, speed_down_kbps, speed_up_kbps), routers(name)").eq("tenant_id", tenantId).eq("type", "pppoe").order("created_at", { ascending: false });
			if (search) q = q.ilike("username", `%${search}%`);
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
	const packages = useQuery({
		queryKey: ["packages-pppoe", tenantId],
		queryFn: async () => {
			const { data } = await supabase.from("packages").select("id,name").eq("tenant_id", tenantId).eq("type", "pppoe").eq("is_active", true);
			return data ?? [];
		},
		enabled: !!tenantId
	});
	const routers = useQuery({
		queryKey: ["routers-list", tenantId],
		queryFn: async () => {
			const { data } = await supabase.from("routers").select("id,name").eq("tenant_id", tenantId).eq("is_active", true);
			return data ?? [];
		},
		enabled: !!tenantId
	});
	const { register, handleSubmit, reset, setValue, formState: { errors } } = useForm({ resolver: u(schema) });
	const save = useMutation({
		mutationFn: async (data) => {
			if (editing) {
				const { error } = await supabase.from("subscriptions").update(data).eq("id", editing.id);
				if (error) throw error;
			} else {
				const { error } = await supabase.from("subscriptions").insert({
					...data,
					tenant_id: tenantId,
					type: "pppoe",
					status: "active",
					starts_at: (/* @__PURE__ */ new Date()).toISOString()
				});
				if (error) throw error;
			}
		},
		onSuccess: () => {
			toast.success(editing ? "PPPoE user updated" : "PPPoE user created");
			qc.invalidateQueries({ queryKey: ["pppoe-subs"] });
			setOpen(false);
			reset();
			setEditing(null);
		},
		onError: (e) => toast.error(e.message)
	});
	const toggleStatus = useMutation({
		mutationFn: async ({ id, status }) => {
			const { error } = await supabase.from("subscriptions").update({ status }).eq("id", id);
			if (error) throw error;
		},
		onSuccess: () => {
			toast.success("Status updated");
			qc.invalidateQueries({ queryKey: ["pppoe-subs"] });
		},
		onError: (e) => toast.error(e.message)
	});
	const remove = useMutation({
		mutationFn: async (id) => {
			const { error } = await supabase.from("subscriptions").delete().eq("id", id);
			if (error) throw error;
		},
		onSuccess: () => {
			toast.success("Deleted");
			qc.invalidateQueries({ queryKey: ["pppoe-subs"] });
		},
		onError: (e) => toast.error(e.message)
	});
	function openEdit(s) {
		setEditing(s);
		setValue("customer_id", s.customer_id);
		setValue("package_id", s.package_id);
		setValue("username", s.username ?? "");
		setValue("password", s.password ?? "");
		setValue("ip_address", s.ip_address ?? "");
		setOpen(true);
	}
	const stats = {
		total: subscriptions.data?.length ?? 0,
		active: subscriptions.data?.filter((s) => s.status === "active").length ?? 0,
		suspended: subscriptions.data?.filter((s) => s.status === "suspended").length ?? 0
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "space-y-6",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex items-center justify-between",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
					className: "text-2xl font-semibold",
					children: "PPPoE"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "text-sm text-muted-foreground",
					children: "PPPoE user management and sessions"
				})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
					onClick: () => {
						setEditing(null);
						reset();
						setOpen(true);
					},
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Plus, { className: "h-4 w-4 mr-2" }), "Add PPPoE User"]
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "grid grid-cols-3 gap-4",
				children: [
					{
						label: "Total Users",
						value: stats.total
					},
					{
						label: "Active",
						value: stats.active,
						color: "text-green-500"
					},
					{
						label: "Suspended",
						value: stats.suspended,
						color: "text-yellow-500"
					}
				].map((s) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "rounded-xl border border-border/60 bg-card p-4",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "text-xs text-muted-foreground uppercase",
						children: s.label
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: `text-2xl font-bold mt-1 ${s.color ?? ""}`,
						children: s.value
					})]
				}, s.label))
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex gap-3",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
					className: "max-w-sm",
					placeholder: "Search by username...",
					value: search,
					onChange: (e) => setSearch(e.target.value)
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
					variant: "outline",
					onClick: () => qc.invalidateQueries({ queryKey: ["pppoe-subs"] }),
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(RefreshCw, { className: "h-4 w-4" })
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "rounded-xl border border-border/60 bg-card overflow-x-auto",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("table", {
					className: "w-full text-sm min-w-[600px]",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("thead", {
						className: "bg-muted/40 text-xs uppercase text-muted-foreground",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", { children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
								className: "px-4 py-3 text-left",
								children: "Customer"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
								className: "px-4 py-3 text-left",
								children: "Username"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
								className: "px-4 py-3 text-left",
								children: "Package"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
								className: "px-4 py-3 text-left",
								children: "Router"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
								className: "px-4 py-3 text-left",
								children: "Status"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
								className: "px-4 py-3 text-left",
								children: "Expires"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
								className: "px-4 py-3 text-left",
								children: "Actions"
							})
						] })
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tbody", { children: subscriptions.isLoading ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tr", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
						colSpan: 7,
						className: "px-4 py-12 text-center text-muted-foreground",
						children: "Loading..."
					}) }) : subscriptions.data?.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tr", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
						colSpan: 7,
						className: "px-4 py-12 text-center text-muted-foreground",
						children: "No PPPoE users yet"
					}) }) : subscriptions.data?.map((s) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", {
						className: "border-t border-border/60 hover:bg-accent/30",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("td", {
								className: "px-4 py-3",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
									className: "font-medium",
									children: s.customers?.full_name
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
									className: "text-xs text-muted-foreground",
									children: s.customers?.phone
								})]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
								className: "px-4 py-3 font-mono text-xs",
								children: s.username
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
								className: "px-4 py-3 text-xs",
								children: s.packages?.name
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
								className: "px-4 py-3 text-xs",
								children: s.routers?.name ?? "—"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
								className: "px-4 py-3",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: `rounded-full px-2 py-0.5 text-xs capitalize ${s.status === "active" ? "bg-green-500/15 text-green-600" : "bg-yellow-500/15 text-yellow-600"}`,
									children: s.status
								})
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
								className: "px-4 py-3 text-xs text-muted-foreground",
								children: s.expires_at ? new Date(s.expires_at).toLocaleDateString() : "—"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
								className: "px-4 py-3",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "flex gap-2",
									children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
											onClick: () => toggleStatus.mutate({
												id: s.id,
												status: s.status === "active" ? "suspended" : "active"
											}),
											className: "text-muted-foreground hover:text-foreground",
											children: s.status === "active" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(WifiOff, { className: "h-4 w-4" }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Wifi, { className: "h-4 w-4" })
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
											onClick: () => openEdit(s),
											className: "text-muted-foreground hover:text-foreground",
											children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SquarePen, { className: "h-4 w-4" })
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
											onClick: () => setDeleteId(s.id),
											className: "text-muted-foreground hover:text-destructive",
											children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Trash2, { className: "h-4 w-4" })
										})
									]
								})
							})
						]
					}, s.id)) })]
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Dialog, {
				open: !!deleteId,
				onOpenChange: (o) => {
					if (!o) setDeleteId(null);
				},
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DialogContent, {
					className: "max-w-sm",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(DialogHeader, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DialogTitle, { children: "Delete PPPoE User" }) }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "text-sm text-muted-foreground",
							children: "Are you sure you want to delete this PPPoE user? This will remove their subscription permanently."
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
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DialogContent, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(DialogHeader, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DialogTitle, { children: editing ? "Edit PPPoE User" : "Add PPPoE User" }) }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("form", {
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
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "Package *" }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Select, {
							onValueChange: (v) => setValue("package_id", v),
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectTrigger, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectValue, { placeholder: "Select package" }) }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectContent, { children: packages.data?.map((p) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
								value: p.id,
								children: p.name
							}, p.id)) })]
						})] }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "Router" }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Select, {
							onValueChange: (v) => setValue("router_id", v),
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectTrigger, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectValue, { placeholder: "Select router (optional)" }) }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectContent, { children: routers.data?.map((r) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
								value: r.id,
								children: r.name
							}, r.id)) })]
						})] }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "grid grid-cols-2 gap-4",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "Username *" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, { ...register("username") })] }),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "Password *" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
									type: "password",
									...register("password")
								})] }),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "IP Address" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
									...register("ip_address"),
									placeholder: "Optional"
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
							children: save.isPending ? "Saving..." : "Save"
						})] })
					]
				})] })
			})
		]
	});
}
//#endregion
export { PPPoEPage as component };
