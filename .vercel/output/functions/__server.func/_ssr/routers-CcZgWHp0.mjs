import { i as __toESM } from "../_runtime.mjs";
import { a as supabase, i as init_client } from "./client-D3kKP_Nv.mjs";
import { u as require_react } from "../_libs/@floating-ui/react-dom+[...].mjs";
import { s as require_jsx_runtime } from "../_libs/@radix-ui/react-arrow+[...].mjs";
import { i as useQueryClient, n as useQuery, t as useMutation } from "../_libs/tanstack__react-query.mjs";
import { a as useTenantId, i as useAuth } from "./auth-z02iFWqz.mjs";
import { t as Button } from "./button-DRsC1qZi.mjs";
import { t as Input } from "./input-DicJzR9-.mjs";
import { t as Label } from "./label-B4PTMSG2.mjs";
import { H as Network, I as Plus, M as RefreshCw, Pt as Activity, a as WifiOff, b as SquarePen, d as TriangleAlert, et as HardDrive, ft as Cpu, i as Wifi, m as Trash2, mt as Clock, t as Zap, vt as CircleCheckBig } from "../_libs/lucide-react.mjs";
import { a as DialogTitle, i as DialogHeader, n as DialogContent, r as DialogFooter, t as Dialog } from "./dialog-BpdftUtE.mjs";
import { a as SelectValue, i as SelectTrigger, n as SelectContent, r as SelectItem, t as Select } from "./select-DUy71i1r.mjs";
import { i as TabsTrigger, n as TabsContent, r as TabsList, t as Tabs } from "./tabs-WTjz7Ps0.mjs";
import { n as toast } from "../_libs/sonner.mjs";
import { a as objectType, n as coerce, o as stringType, t as booleanType } from "../_libs/zod.mjs";
import { n as useForm, t as u } from "../_libs/@hookform/resolvers+[...].mjs";
import { t as adapterFactory } from "./factory-BT7u31uI.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/routers-CcZgWHp0.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
var ADAPTER_TYPE_LABELS = {
	mikrotik_rest: "MikroTik REST API",
	mikrotik_api: "MikroTik API Protocol",
	freeradius: "FreeRADIUS",
	radius_proxy: "RADIUS Proxy",
	ubiquiti: "Ubiquiti",
	cisco: "Cisco",
	generic_snmp: "Generic SNMP",
	openwrt: "OpenWrt"
};
var NETWORK_FEATURE_LABELS = {
	hotspot: "Hotspot",
	pppoe: "PPPoE",
	dhcp: "DHCP",
	ipv4: "IPv4",
	ipv6: "IPv6",
	cgnat: "CGNAT",
	multi_wan: "Multi-WAN",
	vlan: "VLAN",
	qos: "QoS",
	firewall: "Firewall",
	nat: "NAT",
	radius_auth: "RADIUS Auth",
	user_manager: "User Manager"
};
/**
* SmartLinkNet — Network Adapters UI
* Phase 1: Adapter Management Panel
*
* Allows operators to configure, test, and monitor router adapters.
* All identifiers are UUID-based — no hardcoded IPs in component state.
*/
init_client();
var HEALTH_COLORS = {
	healthy: "bg-green-500/15 text-green-600 border-green-500/30",
	degraded: "bg-yellow-500/15 text-yellow-600 border-yellow-500/30",
	unhealthy: "bg-red-500/15 text-red-600 border-red-500/30",
	unknown: "bg-muted text-muted-foreground border-border"
};
var ALL_FEATURES = [
	"hotspot",
	"pppoe",
	"dhcp",
	"ipv4",
	"ipv6",
	"cgnat",
	"multi_wan",
	"vlan",
	"qos",
	"radius_auth",
	"user_manager"
];
function NetworkAdaptersPanel() {
	const qc = useQueryClient();
	const tenantId = useTenantId().data ?? null;
	const [addOpen, setAddOpen] = (0, import_react.useState)(false);
	const [testingId, setTestingId] = (0, import_react.useState)(null);
	const [featureErrors, setFeatureErrors] = (0, import_react.useState)([]);
	const isMountedRef = (0, import_react.useRef)(true);
	(0, import_react.useEffect)(() => {
		return () => {
			isMountedRef.current = false;
		};
	}, []);
	function getTableErrorMessage(error, table) {
		return error?.status === 404 ? `The ${table} table is not available in this Supabase project.` : error?.message ?? `Unable to load ${table}.`;
	}
	function handleTableError(error, table) {
		if (!isMountedRef.current) return;
		const message = getTableErrorMessage(error, table);
		setFeatureErrors((prev) => prev.includes(message) ? prev : [...prev, message]);
	}
	const routers = useQuery({
		queryKey: ["routers-adapters", tenantId],
		queryFn: async () => {
			const { data, error } = await supabase.from("routers").select("id,name,vendor,status,primary_adapter_type,cpu_load,memory_used,uptime,last_seen,is_active").eq("tenant_id", tenantId).order("name");
			if (error) throw error;
			return data ?? [];
		},
		enabled: !!tenantId,
		refetchInterval: 3e4
	});
	const hasNetworkFeatureSchema = useQuery({
		queryKey: ["network-feature-schema", tenantId],
		queryFn: async () => {
			const { error } = await supabase.from("network_adapters").select("id").limit(1);
			if (error) throw error;
			return true;
		},
		enabled: !!tenantId,
		retry: false,
		onError: (error) => handleTableError(error, "network_adapters")
	}).data === true && featureErrors.length === 0;
	const adapters = useQuery({
		queryKey: ["network-adapters", tenantId],
		queryFn: async () => {
			const { data, error } = await supabase.from("network_adapters").select("*, routers(name,status,vendor)").eq("tenant_id", tenantId).order("created_at", { ascending: false });
			if (error) throw error;
			return data ?? [];
		},
		enabled: hasNetworkFeatureSchema,
		retry: false,
		onError: (error) => handleTableError(error, "network_adapters")
	});
	const wanLinksProbe = useQuery({
		queryKey: [
			"network-feature-schema",
			tenantId,
			"wan_links"
		],
		queryFn: async () => {
			const { error } = await supabase.from("wan_links").select("id").limit(1);
			if (error) throw error;
			return true;
		},
		enabled: !!tenantId && featureErrors.length === 0,
		retry: false,
		onError: (error) => handleTableError(error, "wan_links")
	});
	const ipPoolsProbe = useQuery({
		queryKey: [
			"network-feature-schema",
			tenantId,
			"ip_pools"
		],
		queryFn: async () => {
			const { error } = await supabase.from("ip_pools").select("id").limit(1);
			if (error) throw error;
			return true;
		},
		enabled: !!tenantId && featureErrors.length === 0,
		retry: false,
		onError: (error) => handleTableError(error, "ip_pools")
	});
	const hasWanLinksSchema = wanLinksProbe.data === true && featureErrors.length === 0;
	const hasIpPoolsSchema = ipPoolsProbe.data === true && featureErrors.length === 0;
	const wanLinks = useQuery({
		queryKey: ["wan-links", tenantId],
		queryFn: async () => {
			const { data, error } = await supabase.from("wan_links").select("*, routers(name)").eq("tenant_id", tenantId).order("priority");
			if (error) throw error;
			return data ?? [];
		},
		enabled: !!tenantId && hasWanLinksSchema,
		retry: false,
		onError: (error) => handleTableError(error, "wan_links")
	});
	const ipPools = useQuery({
		queryKey: ["ip-pools", tenantId],
		queryFn: async () => {
			const { data, error } = await supabase.from("ip_pools").select("*").eq("tenant_id", tenantId).order("name");
			if (error) throw error;
			return data ?? [];
		},
		enabled: !!tenantId && hasIpPoolsSchema,
		retry: false,
		onError: (error) => handleTableError(error, "ip_pools")
	});
	async function testAdapter(routerId) {
		setTestingId(routerId);
		try {
			const health = await (await adapterFactory.getRouterAdapter(routerId)).healthCheck();
			if (health.isHealthy) toast.success(`Adapter healthy — ${health.latencyMs}ms`);
			else toast.error(`Adapter unhealthy: ${health.lastError}`);
			qc.invalidateQueries({ queryKey: ["network-adapters"] });
		} catch (e) {
			toast.error("Test failed: " + e.message);
		} finally {
			if (isMountedRef.current) setTestingId(null);
		}
	}
	const online = routers.data?.filter((r) => r.status === "online").length ?? 0;
	const offline = routers.data?.filter((r) => r.status === "offline").length ?? 0;
	const healthy = adapters.data?.filter((a) => a.health_status === "healthy").length ?? 0;
	const unhealthy = adapters.data?.filter((a) => a.health_status === "unhealthy").length ?? 0;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "space-y-6",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex items-center justify-between",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
					className: "text-xl font-semibold",
					children: "Network Adapters"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "text-sm text-muted-foreground",
					children: "Vendor-agnostic adapter registry — Phase 1"
				})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex gap-2",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
						variant: "outline",
						onClick: () => qc.invalidateQueries({ queryKey: ["network-adapters", "routers-adapters"] }),
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(RefreshCw, { className: "h-4 w-4 mr-2" }), "Refresh"]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
						onClick: () => setAddOpen(true),
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Plus, { className: "h-4 w-4 mr-2" }), "Add Adapter"]
					})]
				})]
			}),
			featureErrors.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "rounded-xl border border-amber-300/70 bg-amber-100 p-4 text-sm text-amber-900",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "font-medium",
						children: "Network feature unavailable"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
						className: "mt-2 list-disc pl-5 space-y-1 text-left text-sm text-amber-900",
						children: featureErrors.map((message) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: message }, message))
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-2 text-xs text-amber-700",
						children: "Run the latest database migrations or enable the Phase 1 network schema to restore adapter and link queries."
					})
				]
			}) : null,
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "grid grid-cols-2 lg:grid-cols-4 gap-4",
				children: [
					{
						icon: Wifi,
						label: "Online Routers",
						value: online,
						color: "text-green-500"
					},
					{
						icon: WifiOff,
						label: "Offline Routers",
						value: offline,
						color: "text-red-500"
					},
					{
						icon: CircleCheckBig,
						label: "Healthy Adapters",
						value: healthy,
						color: "text-green-500"
					},
					{
						icon: TriangleAlert,
						label: "Unhealthy",
						value: unhealthy,
						color: "text-red-500"
					}
				].map((s) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "rounded-xl border border-border/60 bg-card p-4",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex items-center justify-between mb-2",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "text-xs text-muted-foreground uppercase",
							children: s.label
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(s.icon, { className: `h-4 w-4 ${s.color}` })]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: `text-2xl font-bold ${s.color}`,
						children: s.value
					})]
				}, s.label))
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "grid gap-4 md:grid-cols-2 lg:grid-cols-3",
				children: routers.isLoading ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "col-span-3 text-center py-12 text-muted-foreground",
					children: "Loading..."
				}) : routers.data?.map((r) => {
					const adapter = adapters.data?.find((a) => a.router_id === r.id && a.is_primary);
					const adapterType = r.primary_adapter_type ?? "mikrotik_rest";
					return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: `rounded-xl border bg-card p-5 space-y-3 ${r.status === "online" ? "border-green-500/30" : r.status === "offline" ? "border-red-500/30" : "border-border/60"}`,
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "flex items-start justify-between",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
									className: "font-semibold",
									children: r.name
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
									className: "text-xs text-muted-foreground capitalize",
									children: r.vendor
								})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "flex items-center gap-1.5",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: `h-2 w-2 rounded-full ${r.status === "online" ? "bg-green-500 animate-pulse" : r.status === "degraded" ? "bg-yellow-500" : "bg-red-500"}` }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "text-xs font-medium capitalize",
										children: r.status
									})]
								})]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "flex flex-wrap gap-1",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "rounded-full bg-primary/15 text-primary px-2 py-0.5 text-[10px] font-medium",
									children: ADAPTER_TYPE_LABELS[adapterType]
								}), adapter?.supported_features?.slice(0, 3).map((f) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "rounded-full bg-muted text-muted-foreground px-2 py-0.5 text-[10px]",
									children: NETWORK_FEATURE_LABELS[f] ?? f
								}, f))]
							}),
							r.status === "online" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "grid grid-cols-3 gap-2 text-xs text-muted-foreground",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "flex items-center gap-1",
										children: [
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Cpu, { className: "h-3 w-3" }),
											r.cpu_load ?? 0,
											"%"
										]
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "flex items-center gap-1",
										children: [
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)(HardDrive, { className: "h-3 w-3" }),
											r.memory_used ?? 0,
											"%"
										]
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "flex items-center gap-1",
										children: [
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Clock, { className: "h-3 w-3" }),
											r.uptime?.split("d")[0] ?? "—",
											"d"
										]
									})
								]
							}),
							adapter && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: `rounded-md border px-2 py-1 text-xs flex items-center justify-between ${HEALTH_COLORS[adapter.health_status] ?? HEALTH_COLORS.unknown}`,
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: ["Adapter: ", adapter.health_status] }), adapter.last_checked && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "opacity-70",
									children: new Date(adapter.last_checked).toLocaleTimeString()
								})]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "pt-2 border-t border-border/60 flex gap-2",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
									onClick: () => testAdapter(r.id),
									disabled: testingId === r.id,
									className: "text-xs flex items-center gap-1 text-muted-foreground hover:text-primary",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Activity, { className: `h-3 w-3 ${testingId === r.id ? "animate-spin" : ""}` }), testingId === r.id ? "Testing..." : "Test"]
								})
							})
						]
					}, r.id);
				})
			}),
			(wanLinks.data?.length ?? 0) > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "rounded-xl border border-border/60 bg-card p-5",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("h3", {
					className: "font-semibold mb-3 flex items-center gap-2",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Network, { className: "h-4 w-4 text-primary" }), " WAN Links"]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "overflow-x-auto",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("table", {
						className: "w-full text-sm",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("thead", {
							className: "bg-muted/40 text-xs uppercase text-muted-foreground",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", { children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
									className: "px-3 py-2 text-left",
									children: "Router"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
									className: "px-3 py-2 text-left",
									children: "Link"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
									className: "px-3 py-2 text-left",
									children: "Interface"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
									className: "px-3 py-2 text-left",
									children: "Priority"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
									className: "px-3 py-2 text-left",
									children: "Latency"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
									className: "px-3 py-2 text-left",
									children: "Loss"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
									className: "px-3 py-2 text-left",
									children: "Status"
								})
							] })
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tbody", { children: wanLinks.data?.map((w) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", {
							className: "border-t border-border/60",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
									className: "px-3 py-2 text-xs",
									children: w.routers?.name ?? "—"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
									className: "px-3 py-2 font-medium",
									children: w.name
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
									className: "px-3 py-2 font-mono text-xs",
									children: w.interface_name
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
									className: "px-3 py-2 text-xs",
									children: w.priority
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
									className: "px-3 py-2 text-xs",
									children: w.latency_ms != null ? `${w.latency_ms}ms` : "—"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
									className: "px-3 py-2 text-xs",
									children: w.packet_loss != null ? `${w.packet_loss}%` : "—"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
									className: "px-3 py-2",
									children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: `rounded-full px-2 py-0.5 text-xs ${w.is_active ? "bg-green-500/15 text-green-600" : "bg-red-500/15 text-red-600"}`,
										children: w.is_active ? "Active" : "Inactive"
									})
								})
							]
						}, w.id)) })]
					})
				})]
			}),
			(ipPools.data?.length ?? 0) > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "rounded-xl border border-border/60 bg-card p-5",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("h3", {
					className: "font-semibold mb-3 flex items-center gap-2",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Zap, { className: "h-4 w-4 text-primary" }), " IP Pools"]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "overflow-x-auto",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("table", {
						className: "w-full text-sm",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("thead", {
							className: "bg-muted/40 text-xs uppercase text-muted-foreground",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", { children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
									className: "px-3 py-2 text-left",
									children: "Name"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
									className: "px-3 py-2 text-left",
									children: "Protocol"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
									className: "px-3 py-2 text-left",
									children: "CIDR"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
									className: "px-3 py-2 text-left",
									children: "Type"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
									className: "px-3 py-2 text-left",
									children: "Utilization"
								})
							] })
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tbody", { children: ipPools.data?.map((p) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", {
							className: "border-t border-border/60",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
									className: "px-3 py-2 font-medium",
									children: p.name
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
									className: "px-3 py-2 uppercase text-xs",
									children: p.protocol
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
									className: "px-3 py-2 font-mono text-xs",
									children: p.cidr
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
									className: "px-3 py-2",
									children: p.is_cgnat && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "rounded-full bg-orange-500/15 text-orange-600 px-2 py-0.5 text-xs",
										children: "CGNAT"
									})
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
									className: "px-3 py-2",
									children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "flex items-center gap-2",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
											className: "h-1.5 w-20 rounded-full bg-muted overflow-hidden",
											children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
												className: `h-full rounded-full ${Number(p.utilization) > 80 ? "bg-red-500" : Number(p.utilization) > 60 ? "bg-yellow-500" : "bg-green-500"}`,
												style: { width: `${Math.min(100, Number(p.utilization))}%` }
											})
										}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
											className: "text-xs",
											children: [p.utilization, "%"]
										})]
									})
								})
							]
						}, p.id)) })]
					})
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(AddAdapterDialog, {
				open: addOpen,
				onOpenChange: setAddOpen,
				tenantId: tenantId ?? "",
				onSuccess: () => {
					qc.invalidateQueries({ queryKey: ["network-adapters"] });
					setAddOpen(false);
				}
			})
		]
	});
}
function AddAdapterDialog({ open, onOpenChange, tenantId, onSuccess }) {
	const [routerId, setRouterId] = (0, import_react.useState)("");
	const [adapterType, setAdapterType] = (0, import_react.useState)("mikrotik_rest");
	const [features, setFeatures] = (0, import_react.useState)(ALL_FEATURES);
	const [saving, setSaving] = (0, import_react.useState)(false);
	const isMountedRef = (0, import_react.useRef)(true);
	(0, import_react.useEffect)(() => {
		if (!open) return;
		setRouterId("");
		setAdapterType("mikrotik_rest");
		setFeatures(ALL_FEATURES);
	}, [open]);
	(0, import_react.useEffect)(() => {
		return () => {
			isMountedRef.current = false;
		};
	}, []);
	const routers = useQuery({
		queryKey: ["routers-list-adapters", tenantId],
		queryFn: async () => {
			const { data } = await supabase.from("routers").select("id,name").eq("tenant_id", tenantId).order("name");
			return data ?? [];
		},
		enabled: !!tenantId && open
	});
	function toggleFeature(f) {
		setFeatures((prev) => prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f]);
	}
	async function handleSave() {
		if (!routerId) {
			toast.error("Select a router");
			return;
		}
		setSaving(true);
		let saved = false;
		try {
			const { error } = await supabase.from("network_adapters").upsert({
				tenant_id: tenantId,
				router_id: routerId,
				adapter_type: adapterType,
				supported_features: features,
				is_primary: true,
				health_status: "unknown",
				config: {}
			}, { onConflict: ["router_id", "adapter_type"] });
			if (error) throw error;
			const { error: routerError } = await supabase.from("routers").update({ primary_adapter_type: adapterType }).eq("id", routerId);
			if (routerError) throw routerError;
			try {
				const health = await (await adapterFactory.getRouterAdapter(routerId)).healthCheck();
				const healthStatus = health.isHealthy ? "healthy" : "unhealthy";
				await supabase.from("network_adapters").update({
					health_status: healthStatus,
					last_checked: health.checkedAt ?? (/* @__PURE__ */ new Date()).toISOString(),
					error_count: health.errorCount ?? 0,
					last_error: health.lastError
				}).eq("router_id", routerId).eq("adapter_type", adapterType);
			} catch (healthError) {
				console.warn("Adapter health check failed", healthError);
			}
			toast.success("Adapter configured");
			saved = true;
		} catch (e) {
			toast.error(e.message);
		} finally {
			if (isMountedRef.current) setSaving(false);
			if (saved) {
				qc.invalidateQueries({ queryKey: ["network-adapters", tenantId] });
				qc.invalidateQueries({ queryKey: ["routers-adapters", tenantId] });
				onSuccess();
			}
		}
	}
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Dialog, {
		open,
		onOpenChange,
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DialogContent, {
			className: "max-w-lg",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(DialogHeader, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DialogTitle, { children: "Configure Network Adapter" }) }),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "space-y-4",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "Router" }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Select, {
							onValueChange: setRouterId,
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectTrigger, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectValue, { placeholder: "Select router" }) }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectContent, { children: routers.data?.map((r) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
								value: r.id,
								children: r.name
							}, r.id)) })]
						})] }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "Adapter Type" }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Select, {
							value: adapterType,
							onValueChange: (v) => setAdapterType(v),
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectTrigger, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectValue, {}) }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectContent, { children: Object.entries(ADAPTER_TYPE_LABELS).map(([k, v]) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
								value: k,
								children: v
							}, k)) })]
						})] }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, {
							className: "mb-2 block",
							children: "Supported Features"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "flex flex-wrap gap-2",
							children: ALL_FEATURES.map((f) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
								type: "button",
								onClick: () => toggleFeature(f),
								className: `rounded-full px-2.5 py-1 text-xs border transition ${features.includes(f) ? "bg-primary/15 border-primary/30 text-primary" : "bg-muted border-border text-muted-foreground hover:border-primary/30"}`,
								children: NETWORK_FEATURE_LABELS[f]
							}, f))
						})] })
					]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DialogFooter, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
					variant: "outline",
					onClick: () => onOpenChange(false),
					children: "Cancel"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
					onClick: handleSave,
					disabled: saving,
					children: saving ? "Saving..." : "Save Adapter"
				})] })
			]
		})
	});
}
init_client();
var schema = objectType({
	name: stringType().min(1),
	model: stringType().optional(),
	connection_string: stringType().optional(),
	ip_address: stringType().optional(),
	api_port: coerce.number().min(1).default(80),
	api_username: stringType().optional(),
	api_password: stringType().optional(),
	location: stringType().optional(),
	vendor: stringType().min(1).default("mikrotik"),
	primary_adapter_type: stringType().optional(),
	use_ssl: booleanType().default(false)
});
function RoutersPage() {
	const { user } = useAuth();
	const qc = useQueryClient();
	const [open, setOpen] = (0, import_react.useState)(false);
	const [editing, setEditing] = (0, import_react.useState)(null);
	const [deleteId, setDeleteId] = (0, import_react.useState)(null);
	const [syncing, setSyncing] = (0, import_react.useState)(null);
	const [tab, setTab] = (0, import_react.useState)("routers");
	const tenantQuery = useQuery({
		queryKey: ["tenant-id", user?.id],
		queryFn: async () => {
			const { data } = await supabase.from("profiles").select("tenant_id").eq("id", user.id).single();
			return data?.tenant_id ?? null;
		},
		enabled: !!user,
		staleTime: 0
	});
	const tenantId = tenantQuery.data ?? null;
	const routers = useQuery({
		queryKey: ["routers", tenantId],
		queryFn: async () => {
			const { data, error } = await supabase.from("routers").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false });
			if (error) throw error;
			return data ?? [];
		},
		enabled: !!tenantId,
		refetchInterval: 3e4
	});
	const { register, handleSubmit, reset, setValue } = useForm({ resolver: u(schema) });
	async function syncRouter(routerId) {
		setSyncing(routerId);
		try {
			const result = await (await adapterFactory.getRouterAdapter(routerId)).getStatus();
			if (result.success) toast.success(`Synced — CPU ${result.data?.cpuLoad}% · RAM ${result.data?.memoryUsed}%`);
			else toast.error("Sync failed: " + result.error);
			qc.invalidateQueries({ queryKey: ["routers"] });
		} catch (e) {
			toast.error(e.message);
		} finally {
			setSyncing(null);
		}
	}
	const save = useMutation({
		mutationFn: async (data) => {
			if (!tenantId) throw new Error("No tenant found. Please complete workspace setup first.");
			if (editing) {
				const { error } = await supabase.from("routers").update(data).eq("id", editing.id);
				if (error) throw error;
			} else {
				const { error } = await supabase.from("routers").insert({
					...data,
					tenant_id: tenantId
				});
				if (error) throw error;
			}
		},
		onSuccess: () => {
			toast.success(editing ? "Router updated" : "Router added");
			qc.invalidateQueries({ queryKey: ["routers"] });
			setOpen(false);
			reset();
			setEditing(null);
		},
		onError: (e) => toast.error(e.message)
	});
	const remove = useMutation({
		mutationFn: async (id) => {
			const { error } = await supabase.from("routers").delete().eq("id", id);
			if (error) throw error;
		},
		onSuccess: () => {
			toast.success("Router removed");
			qc.invalidateQueries({ queryKey: ["routers"] });
		},
		onError: (e) => toast.error(e.message)
	});
	function openEdit(r) {
		setEditing(r);
		Object.keys(schema.shape).forEach((k) => setValue(k, r[k] ?? ""));
		setOpen(true);
	}
	const online = routers.data?.filter((r) => r.status === "online").length ?? 0;
	const offline = routers.data?.filter((r) => r.status === "offline").length ?? 0;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "space-y-6",
		children: [
			!tenantQuery.isLoading && !tenantId && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-600",
				children: "Your workspace is not set up yet. Please complete onboarding before adding routers."
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex flex-col sm:flex-row sm:items-center justify-between gap-3",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
					className: "text-2xl font-semibold",
					children: "Routers"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "text-sm text-muted-foreground",
					children: "Network-agnostic device management — Phase 1"
				})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex flex-wrap gap-2",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
						variant: "outline",
						onClick: () => qc.invalidateQueries({ queryKey: ["routers"] }),
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(RefreshCw, { className: "h-4 w-4 mr-2" }), "Refresh"]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
						onClick: () => {
							setEditing(null);
							reset();
							setOpen(true);
						},
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Plus, { className: "h-4 w-4 mr-2" }), "Add Router"]
					})]
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "grid grid-cols-3 gap-4",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "rounded-xl border border-border/60 bg-card p-4",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "text-xs text-muted-foreground uppercase",
							children: "Total"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "text-2xl font-bold mt-1",
							children: routers.data?.length ?? 0
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "rounded-xl border border-border/60 bg-card p-4",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "text-xs text-muted-foreground uppercase",
							children: "Online"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "text-2xl font-bold mt-1 text-green-500",
							children: online
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "rounded-xl border border-border/60 bg-card p-4",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "text-xs text-muted-foreground uppercase",
							children: "Offline"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "text-2xl font-bold mt-1 text-red-500",
							children: offline
						})]
					})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Tabs, {
				value: tab,
				onValueChange: setTab,
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(TabsList, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TabsTrigger, {
						value: "routers",
						children: "Routers"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(TabsTrigger, {
						value: "adapters",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Network, { className: "h-3.5 w-3.5 mr-1" }), "Network Adapters"]
					})] }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TabsContent, {
						value: "routers",
						className: "space-y-4 mt-4",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "grid gap-4 md:grid-cols-2 lg:grid-cols-3",
							children: routers.isLoading ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "col-span-3 text-center py-12 text-muted-foreground",
								children: "Loading..."
							}) : routers.data?.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "col-span-3 text-center py-12 text-muted-foreground",
								children: "No routers added yet"
							}) : routers.data?.map((r) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "rounded-xl border border-border/60 bg-card p-5 space-y-4",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "flex items-start justify-between",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
											className: "font-semibold",
											children: r.name
										}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
											className: "text-xs text-muted-foreground flex items-center gap-1 flex-wrap",
											children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
												className: "capitalize",
												children: r.vendor ?? "mikrotik"
											}), r.primary_adapter_type && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
												className: "rounded-full bg-primary/15 text-primary px-1.5 py-0.5 text-[10px]",
												children: ADAPTER_TYPE_LABELS[r.primary_adapter_type] ?? r.primary_adapter_type
											})]
										})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
											className: `flex items-center gap-1 text-xs rounded-full px-2 py-0.5 ${r.status === "online" ? "bg-green-500/15 text-green-600" : "bg-red-500/15 text-red-600"}`,
											children: [r.status === "online" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Wifi, { className: "h-3 w-3" }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(WifiOff, { className: "h-3 w-3" }), r.status]
										})]
									}),
									r.status === "online" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "grid grid-cols-2 gap-2 text-xs",
										children: [
											/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
												className: "flex items-center gap-1 text-muted-foreground",
												children: [
													/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Cpu, { className: "h-3 w-3" }),
													"CPU: ",
													r.cpu_load ?? 0,
													"%"
												]
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
												className: "flex items-center gap-1 text-muted-foreground",
												children: [
													/* @__PURE__ */ (0, import_jsx_runtime.jsx)(HardDrive, { className: "h-3 w-3" }),
													"RAM: ",
													r.memory_used ?? 0,
													"%"
												]
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
												className: "flex items-center gap-1 text-muted-foreground",
												children: [
													/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Activity, { className: "h-3 w-3" }),
													"Uptime: ",
													r.uptime ?? "N/A"
												]
											})
										]
									}),
									r.location && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
										className: "text-xs text-muted-foreground",
										children: r.location
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "flex gap-2 pt-2 border-t border-border/60",
										children: [
											/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
												onClick: () => syncRouter(r.id),
												disabled: syncing === r.id,
												className: "text-xs flex items-center gap-1 text-muted-foreground hover:text-primary",
												children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(RefreshCw, { className: `h-3 w-3 ${syncing === r.id ? "animate-spin" : ""}` }), syncing === r.id ? "Syncing..." : "Sync"]
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
												onClick: () => openEdit(r),
												className: "text-xs flex items-center gap-1 text-muted-foreground hover:text-foreground",
												children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SquarePen, { className: "h-3 w-3" }), "Edit"]
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
												onClick: () => setDeleteId(r.id),
												className: "text-xs flex items-center gap-1 text-muted-foreground hover:text-destructive",
												children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Trash2, { className: "h-3 w-3" }), "Remove"]
											})
										]
									})
								]
							}, r.id))
						})
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TabsContent, {
						value: "adapters",
						className: "mt-4",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(NetworkAdaptersPanel, {})
					})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Dialog, {
				open: !!deleteId,
				onOpenChange: (o) => {
					if (!o) setDeleteId(null);
				},
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DialogContent, {
					className: "max-w-sm",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(DialogHeader, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DialogTitle, { children: "Remove Router" }) }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "text-sm text-muted-foreground",
							children: "Are you sure you want to remove this router?"
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
								children: "Remove"
							})]
						})
					]
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Dialog, {
				open,
				onOpenChange: setOpen,
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DialogContent, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(DialogHeader, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DialogTitle, { children: editing ? "Edit Router" : "Add Router" }) }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("form", {
					onSubmit: handleSubmit((d) => save.mutate(d)),
					className: "space-y-4",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "grid grid-cols-2 gap-4",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "Name *" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, { ...register("name") })] }),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "Model" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, { ...register("model") })] }),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "col-span-2",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Label, { children: ["Connection Address ", /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "text-xs text-muted-foreground",
									children: "(hostname or proxy URL)"
								})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
									...register("connection_string"),
									placeholder: "e.g. router1.myisp.co.ke"
								})]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "API Port" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
								type: "number",
								...register("api_port")
							})] }),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "Adapter Type" }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Select, {
								defaultValue: editing?.primary_adapter_type ?? "mikrotik_rest",
								onValueChange: (v) => setValue("primary_adapter_type", v),
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectTrigger, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectValue, {}) }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectContent, { children: Object.entries(ADAPTER_TYPE_LABELS).map(([k, v]) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
									value: k,
									children: v
								}, k)) })]
							})] }),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "API Username" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, { ...register("api_username") })] }),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "API Password" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
								type: "password",
								...register("api_password")
							})] }),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "col-span-2",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "Location" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, { ...register("location") })]
							})
						]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DialogFooter, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
						type: "button",
						variant: "outline",
						onClick: () => setOpen(false),
						children: "Cancel"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
						type: "submit",
						disabled: save.isPending || !tenantId,
						children: save.isPending ? "Saving..." : "Save"
					})] })]
				})] })
			})
		]
	});
}
//#endregion
export { RoutersPage as component };
