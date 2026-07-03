import { i as __toESM } from "../_runtime.mjs";
import { a as supabase, i as init_client } from "./client-D3kKP_Nv.mjs";
import { u as require_react } from "../_libs/@floating-ui/react-dom+[...].mjs";
import { s as require_jsx_runtime } from "../_libs/@radix-ui/react-arrow+[...].mjs";
import { i as useQueryClient, n as useQuery, t as useMutation } from "../_libs/tanstack__react-query.mjs";
import { a as useTenantId, i as useAuth } from "./auth-z02iFWqz.mjs";
import { t as Button } from "./button-DRsC1qZi.mjs";
import { t as Input } from "./input-DicJzR9-.mjs";
import { t as Label } from "./label-B4PTMSG2.mjs";
import { F as Printer, I as Plus, M as RefreshCw, O as Search, P as QrCode, ct as Download } from "../_libs/lucide-react.mjs";
import { a as DialogTitle, i as DialogHeader, n as DialogContent, r as DialogFooter, t as Dialog } from "./dialog-BpdftUtE.mjs";
import { a as SelectValue, i as SelectTrigger, n as SelectContent, r as SelectItem, t as Select } from "./select-DUy71i1r.mjs";
import { i as TabsTrigger, n as TabsContent, r as TabsList, t as Tabs } from "./tabs-WTjz7Ps0.mjs";
import { n as toast } from "../_libs/sonner.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/vouchers-B8WQOfd0.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
init_client();
function generateCode(prefix = "", length = 8) {
	const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
	const random = Array.from({ length }, () => chars[Math.floor(Math.random() * 32)]).join("");
	return prefix ? `${prefix}-${random}` : random;
}
function VouchersPage() {
	const { user } = useAuth();
	const qc = useQueryClient();
	const [genOpen, setGenOpen] = (0, import_react.useState)(false);
	const [search, setSearch] = (0, import_react.useState)("");
	const [statusFilter, setStatusFilter] = (0, import_react.useState)("all");
	const [tab, setTab] = (0, import_react.useState)("vouchers");
	const [genForm, setGenForm] = (0, import_react.useState)({
		qty: 10,
		prefix: "",
		package_id: "",
		router_id: "",
		batch_name: ""
	});
	const { data: tenantId } = useTenantId();
	const vouchers = useQuery({
		queryKey: [
			"vouchers",
			tenantId,
			search,
			statusFilter
		],
		queryFn: async () => {
			let q = supabase.from("vouchers").select("*, packages(name, duration_days, speed_down_kbps, price), voucher_batches(name)").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(500);
			if (search) q = q.ilike("code", `%${search}%`);
			if (statusFilter !== "all") q = q.eq("status", statusFilter);
			const { data, error } = await q;
			if (error) throw error;
			return data ?? [];
		},
		enabled: !!tenantId
	});
	const batches = useQuery({
		queryKey: ["voucher-batches", tenantId],
		queryFn: async () => {
			const { data, error } = await supabase.from("voucher_batches").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false });
			if (error) throw error;
			return data ?? [];
		},
		enabled: !!tenantId
	});
	const packages = useQuery({
		queryKey: ["packages-hotspot", tenantId],
		queryFn: async () => {
			const { data } = await supabase.from("packages").select("id,name").eq("tenant_id", tenantId).eq("type", "hotspot").eq("is_active", true);
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
	const generate = useMutation({
		mutationFn: async () => {
			const batchName = genForm.batch_name || `Batch-${Date.now()}`;
			const { data: batch, error: bErr } = await supabase.from("voucher_batches").insert({
				tenant_id: tenantId,
				name: batchName,
				prefix: genForm.prefix || null,
				quantity: genForm.qty,
				generated: genForm.qty,
				package_id: genForm.package_id || null,
				router_id: genForm.router_id || null,
				created_by: user?.id
			}).select().single();
			if (bErr) throw bErr;
			const codes = Array.from({ length: genForm.qty }, () => ({
				tenant_id: tenantId,
				batch_id: batch.id,
				code: generateCode(genForm.prefix),
				package_id: genForm.package_id || null,
				router_id: genForm.router_id || null,
				status: "unused"
			}));
			const { error } = await supabase.from("vouchers").insert(codes);
			if (error) throw error;
			return batch;
		},
		onSuccess: () => {
			toast.success(`${genForm.qty} vouchers generated`);
			qc.invalidateQueries({ queryKey: ["vouchers"] });
			qc.invalidateQueries({ queryKey: ["voucher-batches"] });
			setGenOpen(false);
		},
		onError: (e) => toast.error(e.message)
	});
	function exportCSV() {
		const csv = ["Code,Package,Status,Expires,Created", ...(vouchers.data ?? []).map((v) => [
			v.code,
			v.packages?.name ?? "",
			v.status,
			v.expires_at ?? "",
			new Date(v.created_at).toLocaleDateString()
		].join(","))].join("\n");
		const a = document.createElement("a");
		a.href = "data:text/csv," + encodeURIComponent(csv);
		a.download = "vouchers.csv";
		a.click();
	}
	function printVouchers() {
		const rows = (vouchers.data ?? []).filter((v) => v.status === "unused").slice(0, 50);
		const win = window.open("", "_blank");
		if (!win) return;
		win.document.write(`<html><head><title>Vouchers</title><style>
      body{font-family:monospace;} .grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;padding:16px;}
      .card{border:1px dashed #ccc;padding:8px;text-align:center;border-radius:4px;}
      .code{font-size:16px;font-weight:bold;letter-spacing:2px;margin:4px 0;}
      .meta{font-size:10px;color:#666;}
    </style></head><body><div class="grid">${rows.map((v) => `<div class="card"><div class="meta">SmartLinkNet WiFi</div><div class="code">${v.code}</div><div class="meta">${v.packages?.name ?? "Voucher"}</div></div>`).join("")}</div></body></html>`);
		win.print();
	}
	const stats = {
		total: vouchers.data?.length ?? 0,
		unused: vouchers.data?.filter((v) => v.status === "unused").length ?? 0,
		active: vouchers.data?.filter((v) => v.status === "active").length ?? 0,
		used: vouchers.data?.filter((v) => v.status === "used").length ?? 0
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "space-y-6",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex flex-col sm:flex-row sm:items-center justify-between gap-3",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
					className: "text-2xl font-semibold",
					children: "Vouchers"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "text-sm text-muted-foreground",
					children: "Generate and manage hotspot vouchers"
				})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex flex-wrap gap-2",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
							variant: "outline",
							onClick: printVouchers,
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Printer, { className: "h-4 w-4 mr-2" }), "Print"]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
							variant: "outline",
							onClick: exportCSV,
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Download, { className: "h-4 w-4 mr-2" }), "Export CSV"]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
							onClick: () => setGenOpen(true),
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Plus, { className: "h-4 w-4 mr-2" }), "Generate"]
						})
					]
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "grid grid-cols-2 lg:grid-cols-4 gap-4",
				children: [
					{
						label: "Total",
						value: stats.total
					},
					{
						label: "Unused",
						value: stats.unused,
						color: "text-green-500"
					},
					{
						label: "Active",
						value: stats.active,
						color: "text-blue-500"
					},
					{
						label: "Used",
						value: stats.used,
						color: "text-muted-foreground"
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
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Tabs, {
				value: tab,
				onValueChange: setTab,
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(TabsList, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TabsTrigger, {
						value: "vouchers",
						children: "Vouchers"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(TabsTrigger, {
						value: "batches",
						children: [
							"Batches (",
							batches.data?.length ?? 0,
							")"
						]
					})] }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(TabsContent, {
						value: "vouchers",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex gap-3 mb-4",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "relative flex-1 max-w-sm",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Search, { className: "absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
										className: "pl-9",
										placeholder: "Search code...",
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
											value: "unused",
											children: "Unused"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
											value: "active",
											children: "Active"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
											value: "used",
											children: "Used"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
											value: "expired",
											children: "Expired"
										})
									] })]
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
									variant: "outline",
									onClick: () => qc.invalidateQueries({ queryKey: ["vouchers"] }),
									children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(RefreshCw, { className: "h-4 w-4" })
								})
							]
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "rounded-xl border border-border/60 bg-card overflow-x-auto",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("table", {
								className: "w-full text-sm min-w-[550px]",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("thead", {
									className: "bg-muted/40 text-xs uppercase text-muted-foreground",
									children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", { children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
											className: "px-4 py-3 text-left",
											children: "Code"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
											className: "px-4 py-3 text-left",
											children: "Package"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
											className: "px-4 py-3 text-left",
											children: "Batch"
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
											children: "Created"
										})
									] })
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tbody", { children: vouchers.isLoading ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tr", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
									colSpan: 6,
									className: "px-4 py-12 text-center text-muted-foreground",
									children: "Loading..."
								}) }) : vouchers.data?.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tr", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("td", {
									colSpan: 6,
									className: "px-4 py-12 text-center text-muted-foreground",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(QrCode, { className: "h-8 w-8 mx-auto mb-2 opacity-30" }), "No vouchers yet. Generate some to get started."]
								}) }) : vouchers.data?.map((v) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", {
									className: "border-t border-border/60 hover:bg-accent/30",
									children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
											className: "px-4 py-3 font-mono font-bold tracking-widest text-sm",
											children: v.code
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
											className: "px-4 py-3 text-xs",
											children: v.packages?.name ?? "—"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
											className: "px-4 py-3 text-xs text-muted-foreground",
											children: v.voucher_batches?.name ?? "—"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
											className: "px-4 py-3",
											children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
												className: `rounded-full px-2 py-0.5 text-xs capitalize ${v.status === "unused" ? "bg-green-500/15 text-green-600" : v.status === "active" ? "bg-blue-500/15 text-blue-600" : v.status === "used" ? "bg-muted text-muted-foreground" : "bg-red-500/15 text-red-600"}`,
												children: v.status
											})
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
											className: "px-4 py-3 text-xs text-muted-foreground",
											children: v.expires_at ? new Date(v.expires_at).toLocaleDateString() : "—"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
											className: "px-4 py-3 text-xs text-muted-foreground",
											children: new Date(v.created_at).toLocaleDateString()
										})
									]
								}, v.id)) })]
							})
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TabsContent, {
						value: "batches",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "rounded-xl border border-border/60 bg-card overflow-x-auto",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("table", {
								className: "w-full text-sm min-w-[450px]",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("thead", {
									className: "bg-muted/40 text-xs uppercase text-muted-foreground",
									children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", { children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
											className: "px-4 py-3 text-left",
											children: "Batch Name"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
											className: "px-4 py-3 text-left",
											children: "Prefix"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
											className: "px-4 py-3 text-left",
											children: "Quantity"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
											className: "px-4 py-3 text-left",
											children: "Used"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
											className: "px-4 py-3 text-left",
											children: "Created"
										})
									] })
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tbody", { children: batches.isLoading ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tr", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
									colSpan: 5,
									className: "px-4 py-12 text-center text-muted-foreground",
									children: "Loading..."
								}) }) : batches.data?.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tr", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
									colSpan: 5,
									className: "px-4 py-12 text-center text-muted-foreground",
									children: "No batches yet"
								}) }) : batches.data?.map((b) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", {
									className: "border-t border-border/60 hover:bg-accent/30",
									children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
											className: "px-4 py-3 font-medium",
											children: b.name
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
											className: "px-4 py-3 text-xs font-mono",
											children: b.prefix ?? "—"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
											className: "px-4 py-3",
											children: b.quantity
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
											className: "px-4 py-3 text-muted-foreground",
											children: b.used
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
											className: "px-4 py-3 text-xs text-muted-foreground",
											children: new Date(b.created_at).toLocaleDateString()
										})
									]
								}, b.id)) })]
							})
						})
					})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Dialog, {
				open: genOpen,
				onOpenChange: setGenOpen,
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DialogContent, { children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(DialogHeader, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DialogTitle, { children: "Generate Vouchers" }) }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "space-y-4",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "Batch Name" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
								value: genForm.batch_name,
								onChange: (e) => setGenForm((f) => ({
									...f,
									batch_name: e.target.value
								})),
								placeholder: "e.g. Weekend Promo"
							})] }),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "grid grid-cols-2 gap-4",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "Quantity (max 500)" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
									type: "number",
									value: genForm.qty,
									min: 1,
									max: 500,
									onChange: (e) => setGenForm((f) => ({
										...f,
										qty: Number(e.target.value)
									}))
								})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "Code Prefix (optional)" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
									value: genForm.prefix,
									onChange: (e) => setGenForm((f) => ({
										...f,
										prefix: e.target.value.toUpperCase()
									})),
									placeholder: "e.g. VIP",
									maxLength: 6
								})] })]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "Package (optional)" }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Select, {
								onValueChange: (v) => setGenForm((f) => ({
									...f,
									package_id: v
								})),
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectTrigger, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectValue, { placeholder: "Select package" }) }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectContent, { children: packages.data?.map((p) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
									value: p.id,
									children: p.name
								}, p.id)) })]
							})] }),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "Router (optional)" }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Select, {
								onValueChange: (v) => setGenForm((f) => ({
									...f,
									router_id: v
								})),
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectTrigger, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectValue, { placeholder: "Select router" }) }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectContent, { children: routers.data?.map((r) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
									value: r.id,
									children: r.name
								}, r.id)) })]
							})] }),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "rounded-md bg-muted/40 p-3 text-xs text-muted-foreground",
								children: ["Preview: ", /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "font-mono font-bold",
									children: genForm.prefix ? `${genForm.prefix}-XXXXXXXX` : "XXXXXXXX"
								})]
							})
						]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DialogFooter, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
						variant: "outline",
						onClick: () => setGenOpen(false),
						children: "Cancel"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
						onClick: () => generate.mutate(),
						disabled: generate.isPending,
						children: generate.isPending ? "Generating..." : `Generate ${genForm.qty} Vouchers`
					})] })
				] })
			})
		]
	});
}
//#endregion
export { VouchersPage as component };
