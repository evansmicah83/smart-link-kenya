import { i as __toESM } from "../_runtime.mjs";
import { a as supabase, i as init_client } from "./client-D3kKP_Nv.mjs";
import { u as require_react } from "../_libs/@floating-ui/react-dom+[...].mjs";
import { s as require_jsx_runtime } from "../_libs/@radix-ui/react-arrow+[...].mjs";
import { i as useQueryClient, n as useQuery, t as useMutation } from "../_libs/tanstack__react-query.mjs";
import { i as useAuth, t as fetchMyRoles } from "./auth-z02iFWqz.mjs";
import { t as Button } from "./button-DRsC1qZi.mjs";
import { t as Input } from "./input-DicJzR9-.mjs";
import { t as Label } from "./label-B4PTMSG2.mjs";
import { I as Plus, M as RefreshCw, Ot as Building2, f as TrendingUp, gt as CirclePause, lt as DollarSign, m as Trash2, vt as CircleCheckBig, w as ShieldCheck } from "../_libs/lucide-react.mjs";
import { a as DialogTitle, i as DialogHeader, n as DialogContent, r as DialogFooter, t as Dialog } from "./dialog-BpdftUtE.mjs";
import { a as SelectValue, i as SelectTrigger, n as SelectContent, r as SelectItem, t as Select } from "./select-DUy71i1r.mjs";
import { n as toast } from "../_libs/sonner.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/admin-B4Cn0YwN.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
init_client();
var STATUS_MAP = {
	active: "bg-green-500/15 text-green-600",
	trial: "bg-blue-500/15 text-blue-600",
	suspended: "bg-yellow-500/15 text-yellow-600",
	cancelled: "bg-red-500/15 text-red-600"
};
var PLAN_MAP = {
	trial: "bg-muted text-muted-foreground",
	starter: "bg-blue-500/15 text-blue-600",
	growth: "bg-purple-500/15 text-purple-600",
	enterprise: "bg-primary/15 text-primary"
};
function AdminPage() {
	const { user } = useAuth();
	const qc = useQueryClient();
	const [open, setOpen] = (0, import_react.useState)(false);
	const [search, setSearch] = (0, import_react.useState)("");
	const [form, setForm] = (0, import_react.useState)({
		name: "",
		slug: "",
		contact_email: "",
		contact_phone: "",
		country: "KE",
		plan: "trial"
	});
	const roles = useQuery({
		queryKey: ["roles", user?.id],
		queryFn: () => user ? fetchMyRoles(user.id) : Promise.resolve([]),
		enabled: !!user
	});
	const isSuper = (roles.data ?? []).includes("super_admin");
	const tenants = useQuery({
		queryKey: ["tenants", search],
		queryFn: async () => {
			let q = supabase.from("tenants").select("id,name,slug,status,plan,country,created_at,contact_email,contact_phone,trial_ends_at").order("created_at", { ascending: false });
			if (search) q = q.ilike("name", `%${search}%`);
			const { data, error } = await q;
			if (error) throw error;
			return data ?? [];
		},
		enabled: isSuper
	});
	const platformStats = useQuery({
		queryKey: ["platform-stats"],
		queryFn: async () => {
			const [total, active, suspended, trial, revenue] = await Promise.all([
				supabase.from("tenants").select("*", {
					count: "exact",
					head: true
				}),
				supabase.from("tenants").select("*", {
					count: "exact",
					head: true
				}).eq("status", "active"),
				supabase.from("tenants").select("*", {
					count: "exact",
					head: true
				}).eq("status", "suspended"),
				supabase.from("tenants").select("*", {
					count: "exact",
					head: true
				}).eq("status", "trial"),
				supabase.from("payments").select("amount").eq("status", "completed").gte("created_at", new Date((/* @__PURE__ */ new Date()).getFullYear(), (/* @__PURE__ */ new Date()).getMonth(), 1).toISOString())
			]);
			const mtdRevenue = (revenue.data ?? []).reduce((s, p) => s + Number(p.amount), 0);
			return {
				total: total.count ?? 0,
				active: active.count ?? 0,
				suspended: suspended.count ?? 0,
				trial: trial.count ?? 0,
				mtdRevenue
			};
		},
		enabled: isSuper
	});
	const createTenant = useMutation({
		mutationFn: async () => {
			const slug = form.slug || form.name.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-").slice(0, 40) + "-" + Math.random().toString(36).slice(2, 6);
			const { error } = await supabase.from("tenants").insert({
				...form,
				slug
			});
			if (error) throw error;
		},
		onSuccess: () => {
			toast.success("Tenant created");
			qc.invalidateQueries({ queryKey: ["tenants"] });
			setOpen(false);
			setForm({
				name: "",
				slug: "",
				contact_email: "",
				contact_phone: "",
				country: "KE",
				plan: "trial"
			});
		},
		onError: (e) => toast.error(e.message)
	});
	const updateStatus = useMutation({
		mutationFn: async ({ id, status }) => {
			const { error } = await supabase.from("tenants").update({ status }).eq("id", id);
			if (error) throw error;
		},
		onSuccess: () => {
			toast.success("Tenant updated");
			qc.invalidateQueries({ queryKey: ["tenants"] });
		},
		onError: (e) => toast.error(e.message)
	});
	const deleteTenant = useMutation({
		mutationFn: async (id) => {
			const { error } = await supabase.from("tenants").delete().eq("id", id);
			if (error) throw error;
		},
		onSuccess: () => {
			toast.success("Tenant deleted");
			qc.invalidateQueries({ queryKey: ["tenants"] });
		},
		onError: (e) => toast.error(e.message)
	});
	if (roles.isLoading) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "text-muted-foreground",
		children: "Loading…"
	});
	if (!isSuper) return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "rounded-xl border border-border/60 bg-card p-8 text-center",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ShieldCheck, { className: "mx-auto h-8 w-8 text-muted-foreground" }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
				className: "mt-3 text-lg font-semibold",
				children: "Super admin only"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-1 text-sm text-muted-foreground",
				children: "You don't have access to this area."
			})
		]
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "space-y-6",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex items-center justify-between",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("h1", {
					className: "text-2xl font-semibold flex items-center gap-2",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ShieldCheck, { className: "h-5 w-5 text-primary" }), "Super Admin"]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "text-sm text-muted-foreground",
					children: "Manage all tenants on SmartLinkNet"
				})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex gap-2",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
						variant: "outline",
						onClick: () => qc.invalidateQueries({ queryKey: ["tenants"] }),
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(RefreshCw, { className: "h-4 w-4" })
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
						onClick: () => setOpen(true),
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Plus, { className: "h-4 w-4 mr-2" }), "New Tenant"]
					})]
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "grid grid-cols-2 lg:grid-cols-5 gap-4",
				children: [
					{
						label: "Total Tenants",
						value: platformStats.data?.total ?? 0,
						icon: Building2
					},
					{
						label: "Active",
						value: platformStats.data?.active ?? 0,
						icon: CircleCheckBig,
						color: "text-green-500"
					},
					{
						label: "Trial",
						value: platformStats.data?.trial ?? 0,
						icon: TrendingUp,
						color: "text-blue-500"
					},
					{
						label: "Suspended",
						value: platformStats.data?.suspended ?? 0,
						icon: CirclePause,
						color: "text-yellow-500"
					},
					{
						label: "Revenue MTD",
						value: `KES ${(platformStats.data?.mtdRevenue ?? 0).toLocaleString()}`,
						icon: DollarSign,
						color: "text-green-500"
					}
				].map((s) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "rounded-xl border border-border/60 bg-card p-4",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex items-center justify-between mb-2",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "text-xs text-muted-foreground uppercase",
							children: s.label
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(s.icon, { className: `h-4 w-4 ${s.color ?? "text-muted-foreground"}` })]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: `text-2xl font-bold ${s.color ?? ""}`,
						children: s.value
					})]
				}, s.label))
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "flex gap-3",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
					className: "max-w-sm",
					placeholder: "Search tenants...",
					value: search,
					onChange: (e) => setSearch(e.target.value)
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "rounded-xl border border-border/60 bg-card overflow-x-auto",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("table", {
					className: "w-full text-sm min-w-[700px]",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("thead", {
						className: "bg-muted/40 text-xs uppercase text-muted-foreground",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", { children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
								className: "px-4 py-3 text-left",
								children: "Tenant"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
								className: "px-4 py-3 text-left",
								children: "Contact"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
								className: "px-4 py-3 text-left",
								children: "Plan"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
								className: "px-4 py-3 text-left",
								children: "Status"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
								className: "px-4 py-3 text-left",
								children: "Country"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
								className: "px-4 py-3 text-left",
								children: "Joined"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
								className: "px-4 py-3 text-left",
								children: "Actions"
							})
						] })
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tbody", { children: tenants.isLoading ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tr", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
						colSpan: 7,
						className: "px-4 py-12 text-center text-muted-foreground",
						children: "Loading..."
					}) }) : tenants.data?.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tr", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("td", {
						colSpan: 7,
						className: "px-4 py-12 text-center text-muted-foreground",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Building2, { className: "h-6 w-6 mx-auto mb-2 opacity-30" }), "No tenants yet"]
					}) }) : tenants.data?.map((t) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", {
						className: "border-t border-border/60 hover:bg-accent/30",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("td", {
								className: "px-4 py-3",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
									className: "font-medium",
									children: t.name
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
									className: "text-xs text-muted-foreground",
									children: t.slug
								})]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("td", {
								className: "px-4 py-3 text-xs",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { children: t.contact_email ?? "—" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
									className: "text-muted-foreground",
									children: t.contact_phone ?? "—"
								})]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
								className: "px-4 py-3",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: `rounded-full px-2 py-0.5 text-xs capitalize ${PLAN_MAP[t.plan] ?? "bg-muted"}`,
									children: t.plan
								})
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
								className: "px-4 py-3",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: `rounded-full px-2 py-0.5 text-xs capitalize ${STATUS_MAP[t.status] ?? "bg-muted"}`,
									children: t.status
								})
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
								className: "px-4 py-3 text-xs",
								children: t.country
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
								className: "px-4 py-3 text-xs text-muted-foreground",
								children: new Date(t.created_at).toLocaleDateString()
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
								className: "px-4 py-3",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "flex gap-1",
									children: [
										t.status !== "active" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
											onClick: () => updateStatus.mutate({
												id: t.id,
												status: "active"
											}),
											className: "text-xs rounded px-2 py-1 bg-green-500/15 text-green-600 hover:bg-green-500/30",
											children: "Activate"
										}),
										t.status === "active" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
											onClick: () => updateStatus.mutate({
												id: t.id,
												status: "suspended"
											}),
											className: "text-xs rounded px-2 py-1 bg-yellow-500/15 text-yellow-600 hover:bg-yellow-500/30",
											children: "Suspend"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
											onClick: () => {
												if (confirm(`Delete tenant "${t.name}"? This is irreversible.`)) deleteTenant.mutate(t.id);
											},
											className: "text-muted-foreground hover:text-destructive p-1",
											children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Trash2, { className: "h-4 w-4" })
										})
									]
								})
							})
						]
					}, t.id)) })]
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Dialog, {
				open,
				onOpenChange: setOpen,
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DialogContent, {
					className: "max-w-lg",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(DialogHeader, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DialogTitle, { children: "Create New Tenant" }) }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "space-y-4",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "grid grid-cols-2 gap-4",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "col-span-2",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "Company / ISP Name *" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
										value: form.name,
										onChange: (e) => setForm((f) => ({
											...f,
											name: e.target.value
										}))
									})]
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "Slug (auto-generated)" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
									value: form.slug,
									onChange: (e) => setForm((f) => ({
										...f,
										slug: e.target.value
									})),
									placeholder: "auto"
								})] }),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "Plan" }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Select, {
									value: form.plan,
									onValueChange: (v) => setForm((f) => ({
										...f,
										plan: v
									})),
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectTrigger, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectValue, {}) }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(SelectContent, { children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
											value: "trial",
											children: "Trial"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
											value: "starter",
											children: "Starter"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
											value: "growth",
											children: "Growth"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
											value: "enterprise",
											children: "Enterprise"
										})
									] })]
								})] }),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "Contact Email" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
									type: "email",
									value: form.contact_email,
									onChange: (e) => setForm((f) => ({
										...f,
										contact_email: e.target.value
									}))
								})] }),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "Contact Phone" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
									value: form.contact_phone,
									onChange: (e) => setForm((f) => ({
										...f,
										contact_phone: e.target.value
									})),
									placeholder: "+254..."
								})] }),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "Country" }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Select, {
									value: form.country,
									onValueChange: (v) => setForm((f) => ({
										...f,
										country: v
									})),
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectTrigger, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectValue, {}) }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(SelectContent, { children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
											value: "KE",
											children: "Kenya"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
											value: "UG",
											children: "Uganda"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
											value: "TZ",
											children: "Tanzania"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
											value: "RW",
											children: "Rwanda"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
											value: "ET",
											children: "Ethiopia"
										})
									] })]
								})] })
							]
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DialogFooter, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
							variant: "outline",
							onClick: () => setOpen(false),
							children: "Cancel"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
							onClick: () => createTenant.mutate(),
							disabled: !form.name || createTenant.isPending,
							children: createTenant.isPending ? "Creating..." : "Create Tenant"
						})] })]
					})]
				})
			})
		]
	});
}
//#endregion
export { AdminPage as component };
