import { i as __toESM } from "../_runtime.mjs";
import { a as supabase, i as init_client } from "./client-D3kKP_Nv.mjs";
import { u as require_react } from "../_libs/@floating-ui/react-dom+[...].mjs";
import { s as require_jsx_runtime } from "../_libs/@radix-ui/react-arrow+[...].mjs";
import { i as useQueryClient, n as useQuery, t as useMutation } from "../_libs/tanstack__react-query.mjs";
import { a as useTenantId, i as useAuth } from "./auth-z02iFWqz.mjs";
import { t as Button } from "./button-DRsC1qZi.mjs";
import { t as Input } from "./input-DicJzR9-.mjs";
import { t as Label } from "./label-B4PTMSG2.mjs";
import { F as Printer, I as Plus, M as RefreshCw, P as QrCode, Pt as Activity, c as UserX, ct as Download, i as Wifi } from "../_libs/lucide-react.mjs";
import { a as DialogTitle, i as DialogHeader, n as DialogContent, r as DialogFooter, t as Dialog } from "./dialog-BpdftUtE.mjs";
import { a as SelectValue, i as SelectTrigger, n as SelectContent, r as SelectItem, t as Select } from "./select-DUy71i1r.mjs";
import { i as TabsTrigger, n as TabsContent, r as TabsList, t as Tabs } from "./tabs-WTjz7Ps0.mjs";
import { n as toast } from "../_libs/sonner.mjs";
import { n as kickSession } from "./mikrotik-DPl0UasE.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/hotspot-CnE_b4ef.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
init_client();
function genCode(prefix = "", length = 8) {
	const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
	const r = Array.from({ length }, () => chars[Math.floor(Math.random() * 32)]).join("");
	return prefix ? `${prefix}-${r}` : r;
}
function fmtBytes(b) {
	if (!b) return "0B";
	if (b < 1024) return `${b}B`;
	if (b < 1048576) return `${(b / 1024).toFixed(1)}KB`;
	return `${(b / 1048576).toFixed(1)}MB`;
}
function HotspotPage() {
	const { user } = useAuth();
	const qc = useQueryClient();
	const [tab, setTab] = (0, import_react.useState)("sessions");
	const [vOpen, setVOpen] = (0, import_react.useState)(false);
	const [disconnectTarget, setDisconnectTarget] = (0, import_react.useState)(null);
	const [qty, setQty] = (0, import_react.useState)(10);
	const [pfx, setPfx] = (0, import_react.useState)("");
	const [selPkg, setSelPkg] = (0, import_react.useState)("");
	const [selRouter, setSelRouter] = (0, import_react.useState)("");
	const { data: tid } = useTenantId();
	const sessions = useQuery({
		queryKey: ["sessions", tid],
		queryFn: async () => {
			const { data } = await supabase.from("sessions").select("*, customers(full_name)").eq("tenant_id", tid).is("ended_at", null).order("started_at", { ascending: false });
			return data ?? [];
		},
		enabled: !!tid,
		refetchInterval: 15e3
	});
	const vouchers = useQuery({
		queryKey: ["vouchers", tid],
		queryFn: async () => {
			const { data } = await supabase.from("vouchers").select("*, packages(name, duration_days, price), voucher_batches(name)").eq("tenant_id", tid).order("created_at", { ascending: false }).limit(300);
			return data ?? [];
		},
		enabled: !!tid
	});
	const packages = useQuery({
		queryKey: ["packages-hotspot", tid],
		queryFn: async () => {
			const { data } = await supabase.from("packages").select("id,name,price").eq("tenant_id", tid).eq("type", "hotspot").eq("is_active", true);
			return data ?? [];
		},
		enabled: !!tid
	});
	const routers = useQuery({
		queryKey: ["routers-list", tid],
		queryFn: async () => {
			const { data } = await supabase.from("routers").select("id,name").eq("tenant_id", tid).eq("is_active", true);
			return data ?? [];
		},
		enabled: !!tid
	});
	const generate = useMutation({
		mutationFn: async () => {
			const bname = `Batch-${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}`;
			const { data: batch, error: bErr } = await supabase.from("voucher_batches").insert({
				tenant_id: tid,
				name: bname,
				prefix: pfx || null,
				quantity: qty,
				generated: qty,
				package_id: selPkg || null,
				router_id: selRouter || null,
				created_by: user?.id
			}).select().single();
			if (bErr) throw bErr;
			const codes = Array.from({ length: qty }, () => ({
				tenant_id: tid,
				batch_id: batch.id,
				code: genCode(pfx),
				package_id: selPkg || null,
				router_id: selRouter || null,
				status: "unused"
			}));
			const { error } = await supabase.from("vouchers").insert(codes);
			if (error) throw error;
		},
		onSuccess: () => {
			toast.success(`${qty} vouchers generated`);
			qc.invalidateQueries({ queryKey: ["vouchers"] });
			setVOpen(false);
		},
		onError: (e) => toast.error(e.message)
	});
	const disconnect = useMutation({
		mutationFn: async ({ dbId, routerId, sessionId }) => {
			if (routerId) try {
				await kickSession(routerId, sessionId);
			} catch {}
			await supabase.from("sessions").update({
				ended_at: (/* @__PURE__ */ new Date()).toISOString(),
				terminated_by: "admin"
			}).eq("id", dbId);
		},
		onSuccess: () => {
			toast.success("Session disconnected");
			qc.invalidateQueries({ queryKey: ["sessions"] });
		},
		onError: (e) => toast.error(e.message)
	});
	function exportCSV() {
		const csv = ["Code,Package,Status,Created", ...(vouchers.data ?? []).map((v) => [
			v.code,
			v.packages?.name ?? "",
			v.status,
			new Date(v.created_at).toLocaleDateString()
		].join(","))].join("\n");
		const a = document.createElement("a");
		a.href = "data:text/csv," + encodeURIComponent(csv);
		a.download = "vouchers.csv";
		a.click();
	}
	function printVouchers() {
		const rows = (vouchers.data ?? []).filter((v) => v.status === "unused").slice(0, 100);
		const win = window.open("", "_blank");
		if (!win) return;
		win.document.write(`<html><head><title>Vouchers</title><style>
    body{font-family:monospace;padding:16px;} .grid{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;}
    .card{border:1px dashed #999;padding:8px;text-align:center;border-radius:4px;}
    .code{font-size:15px;font-weight:bold;letter-spacing:2px;margin:4px 0;} .meta{font-size:9px;color:#666;}
    </style></head><body><div class="grid">${rows.map((v) => `<div class="card"><div class="meta">SmartLinkNet WiFi</div><div class="code">${v.code}</div><div class="meta">${v.packages?.name ?? "Voucher"}</div></div>`).join("")}</div></body></html>`);
		win.print();
	}
	const stats = {
		sessions: sessions.data?.length ?? 0,
		unused: (vouchers.data ?? []).filter((v) => v.status === "unused").length,
		active: (vouchers.data ?? []).filter((v) => v.status === "active").length,
		used: (vouchers.data ?? []).filter((v) => v.status === "used").length
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "space-y-6",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex flex-col sm:flex-row sm:items-center justify-between gap-3",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
					className: "text-2xl font-semibold",
					children: "Hotspot"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "text-sm text-muted-foreground",
					children: "Sessions, vouchers and hotspot management"
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
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Download, { className: "h-4 w-4 mr-2" }), "Export"]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
							onClick: () => setVOpen(true),
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Plus, { className: "h-4 w-4 mr-2" }), "Generate Vouchers"]
						})
					]
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "grid grid-cols-2 lg:grid-cols-4 gap-4",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Stat, {
						icon: Activity,
						label: "Active Sessions",
						value: stats.sessions,
						color: "text-green-500"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Stat, {
						icon: QrCode,
						label: "Unused",
						value: stats.unused
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Stat, {
						icon: Wifi,
						label: "Active",
						value: stats.active,
						color: "text-blue-500"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Stat, {
						icon: QrCode,
						label: "Used",
						value: stats.used,
						color: "text-muted-foreground"
					})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Tabs, {
				value: tab,
				onValueChange: setTab,
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex flex-wrap items-center justify-between gap-2",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(TabsList, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TabsTrigger, {
							value: "sessions",
							children: "Live Sessions"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(TabsTrigger, {
							value: "vouchers",
							children: [
								"Vouchers (",
								(vouchers.data ?? []).length,
								")"
							]
						})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
							variant: "outline",
							size: "sm",
							onClick: () => {
								qc.invalidateQueries({ queryKey: ["sessions"] });
								qc.invalidateQueries({ queryKey: ["vouchers"] });
							},
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(RefreshCw, { className: "h-4 w-4" })
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TabsContent, {
						value: "sessions",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "rounded-xl border border-border/60 bg-card overflow-x-auto",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("table", {
								className: "w-full text-sm min-w-[500px]",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("thead", {
									className: "bg-muted/40 text-xs uppercase text-muted-foreground",
									children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", { children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
											className: "px-4 py-3 text-left",
											children: "User"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
											className: "px-4 py-3 text-left",
											children: "IP / MAC"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
											className: "px-4 py-3 text-left",
											children: "Started"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
											className: "px-4 py-3 text-left",
											children: "In"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
											className: "px-4 py-3 text-left",
											children: "Out"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
											className: "px-4 py-3 text-left",
											children: "Action"
										})
									] })
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tbody", { children: sessions.isLoading ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tr", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
									colSpan: 6,
									className: "px-4 py-12 text-center text-muted-foreground",
									children: "Loading..."
								}) }) : sessions.data?.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tr", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
									colSpan: 6,
									className: "px-4 py-12 text-center text-muted-foreground",
									children: "No active sessions"
								}) }) : sessions.data?.map((s) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", {
									className: "border-t border-border/60 hover:bg-accent/30",
									children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
											className: "px-4 py-3 font-medium",
											children: s.customers?.full_name ?? s.username ?? "Guest"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("td", {
											className: "px-4 py-3 text-xs font-mono text-muted-foreground",
											children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { children: s.ip_address ?? "—" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { children: s.mac_address ?? "—" })]
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
											className: "px-4 py-3 text-xs",
											children: new Date(s.started_at).toLocaleTimeString()
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
											className: "px-4 py-3 text-xs",
											children: fmtBytes(s.bytes_in ?? 0)
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
											className: "px-4 py-3 text-xs",
											children: fmtBytes(s.bytes_out ?? 0)
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
											className: "px-4 py-3",
											children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
												onClick: () => setDisconnectTarget({
													dbId: s.id,
													routerId: s.router_id,
													sessionId: s.id
												}),
												className: "text-muted-foreground hover:text-destructive",
												children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(UserX, { className: "h-4 w-4" })
											})
										})
									]
								}, s.id)) })]
							})
						})
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TabsContent, {
						value: "vouchers",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "rounded-xl border border-border/60 bg-card overflow-x-auto",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("table", {
								className: "w-full text-sm min-w-[500px]",
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
											children: "Created"
										})
									] })
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tbody", { children: vouchers.isLoading ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tr", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
									colSpan: 5,
									className: "px-4 py-12 text-center text-muted-foreground",
									children: "Loading..."
								}) }) : vouchers.data?.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tr", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
									colSpan: 5,
									className: "px-4 py-12 text-center text-muted-foreground",
									children: "No vouchers yet. Generate some to get started."
								}) }) : vouchers.data?.map((v) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", {
									className: "border-t border-border/60 hover:bg-accent/30",
									children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
											className: "px-4 py-3 font-mono font-bold tracking-widest",
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
											children: new Date(v.created_at).toLocaleDateString()
										})
									]
								}, v.id)) })]
							})
						})
					})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Dialog, {
				open: !!disconnectTarget,
				onOpenChange: (o) => {
					if (!o) setDisconnectTarget(null);
				},
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DialogContent, {
					className: "max-w-sm",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(DialogHeader, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DialogTitle, { children: "Disconnect Session" }) }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "text-sm text-muted-foreground",
							children: "Are you sure you want to forcefully disconnect this session?"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DialogFooter, {
							className: "gap-2",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
								variant: "outline",
								onClick: () => setDisconnectTarget(null),
								children: "Cancel"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
								variant: "destructive",
								onClick: () => {
									disconnect.mutate(disconnectTarget);
									setDisconnectTarget(null);
								},
								disabled: disconnect.isPending,
								children: "Disconnect"
							})]
						})
					]
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Dialog, {
				open: vOpen,
				onOpenChange: setVOpen,
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DialogContent, { children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(DialogHeader, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DialogTitle, { children: "Generate Vouchers" }) }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "space-y-4",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "grid grid-cols-2 gap-4",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "Quantity (max 500)" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
									type: "number",
									value: qty,
									min: 1,
									max: 500,
									onChange: (e) => setQty(Number(e.target.value))
								})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "Prefix (optional)" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
									value: pfx,
									onChange: (e) => setPfx(e.target.value.toUpperCase()),
									placeholder: "VIP",
									maxLength: 6
								})] })]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "Package" }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Select, {
								onValueChange: setSelPkg,
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectTrigger, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectValue, { placeholder: "Any package" }) }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectContent, { children: packages.data?.map((p) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(SelectItem, {
									value: p.id,
									children: [
										p.name,
										" — KES ",
										Number(p.price).toLocaleString()
									]
								}, p.id)) })]
							})] }),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "Router" }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Select, {
								onValueChange: setSelRouter,
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectTrigger, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectValue, { placeholder: "Any router" }) }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectContent, { children: routers.data?.map((r) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
									value: r.id,
									children: r.name
								}, r.id)) })]
							})] }),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "rounded-md bg-muted/40 p-3 text-xs text-muted-foreground",
								children: ["Code format: ", /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "font-mono font-bold",
									children: pfx ? `${pfx}-XXXXXXXX` : "XXXXXXXX"
								})]
							})
						]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DialogFooter, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
						variant: "outline",
						onClick: () => setVOpen(false),
						children: "Cancel"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
						onClick: () => generate.mutate(),
						disabled: generate.isPending,
						children: generate.isPending ? "Generating..." : `Generate ${qty}`
					})] })
				] })
			})
		]
	});
}
function Stat({ icon: Icon, label, value, color }) {
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
export { HotspotPage as component };
