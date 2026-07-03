import { i as __toESM } from "../_runtime.mjs";
import { a as supabase, i as init_client } from "./client-D3kKP_Nv.mjs";
import { u as require_react } from "../_libs/@floating-ui/react-dom+[...].mjs";
import { s as require_jsx_runtime } from "../_libs/@radix-ui/react-arrow+[...].mjs";
import { i as useQueryClient, n as useQuery, t as useMutation } from "../_libs/tanstack__react-query.mjs";
import { a as useTenantId } from "./auth-z02iFWqz.mjs";
import { t as Button } from "./button-DRsC1qZi.mjs";
import { M as RefreshCw, Pt as Activity, a as WifiOff, et as HardDrive, ft as Cpu, i as Wifi, mt as Clock, s as Users, t as Zap } from "../_libs/lucide-react.mjs";
import { a as DialogTitle, i as DialogHeader, n as DialogContent, t as Dialog } from "./dialog-BpdftUtE.mjs";
import { n as toast } from "../_libs/sonner.mjs";
import { n as kickSession, r as syncRouterStatus, t as getActiveSessions } from "./mikrotik-DPl0UasE.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/noc-BxhKDwvI.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
init_client();
function NocPage() {
	const qc = useQueryClient();
	const tenantId = useTenantId().data;
	const [selectedRouter, setSelectedRouter] = (0, import_react.useState)(null);
	const [syncing, setSyncing] = (0, import_react.useState)(null);
	const routers = useQuery({
		queryKey: ["noc-routers", tenantId],
		queryFn: async () => {
			const { data, error } = await supabase.from("routers").select("*").eq("tenant_id", tenantId).order("name");
			if (error) throw error;
			return data ?? [];
		},
		enabled: !!tenantId,
		refetchInterval: 3e4
	});
	const sessions = useQuery({
		queryKey: ["noc-sessions", tenantId],
		queryFn: async () => {
			const { data } = await supabase.from("sessions").select("*, customers(full_name)").eq("tenant_id", tenantId).is("ended_at", null).order("started_at", { ascending: false }).limit(50);
			return data ?? [];
		},
		enabled: !!tenantId,
		refetchInterval: 15e3
	});
	const routerSessions = useQuery({
		queryKey: ["router-live-sessions", selectedRouter?.id],
		queryFn: async () => {
			return (await getActiveSessions(selectedRouter.id))?.data ?? [];
		},
		enabled: !!selectedRouter?.id && selectedRouter?.status === "online",
		refetchInterval: 1e4
	});
	async function syncRouter(routerId) {
		setSyncing(routerId);
		try {
			await syncRouterStatus(routerId);
			qc.invalidateQueries({ queryKey: ["noc-routers"] });
			toast.success("Router synced");
		} catch (e) {
			toast.error("Sync failed: " + e.message);
		} finally {
			setSyncing(null);
		}
	}
	async function syncAll() {
		const active = routers.data?.filter((r) => r.is_active) ?? [];
		for (const r of active) await syncRouter(r.id);
	}
	const kickSessionMut = useMutation({
		mutationFn: async ({ routerId, sessionId }) => kickSession(routerId, sessionId),
		onSuccess: () => {
			toast.success("Session terminated");
			qc.invalidateQueries({ queryKey: ["router-live-sessions"] });
		},
		onError: (e) => toast.error(e.message)
	});
	const online = routers.data?.filter((r) => r.status === "online") ?? [];
	const offline = routers.data?.filter((r) => r.status === "offline") ?? [];
	const degraded = routers.data?.filter((r) => r.status === "degraded") ?? [];
	function fmtBytes(bytes) {
		if (!bytes) return "0B";
		if (bytes < 1024) return `${bytes}B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
		return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
	}
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "space-y-6",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex items-center justify-between",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
					className: "text-2xl font-semibold",
					children: "Network Operations Center"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "text-sm text-muted-foreground",
					children: "Real-time monitoring of all network devices"
				})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex gap-2",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
						variant: "outline",
						onClick: () => qc.invalidateQueries({ queryKey: ["noc-routers"] }),
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(RefreshCw, { className: "h-4 w-4 mr-2" }), "Refresh"]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
						variant: "outline",
						onClick: syncAll,
						disabled: !!syncing,
						children: syncing ? "Syncing..." : "Sync All Routers"
					})]
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "grid grid-cols-3 lg:grid-cols-5 gap-4",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "rounded-xl border border-green-500/30 bg-green-500/10 p-4",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex items-center gap-2 mb-1",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Wifi, { className: "h-4 w-4 text-green-500" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "text-xs text-muted-foreground uppercase",
								children: "Online"
							})]
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "text-3xl font-bold text-green-500",
							children: online.length
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "rounded-xl border border-red-500/30 bg-red-500/10 p-4",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex items-center gap-2 mb-1",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(WifiOff, { className: "h-4 w-4 text-red-500" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "text-xs text-muted-foreground uppercase",
								children: "Offline"
							})]
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "text-3xl font-bold text-red-500",
							children: offline.length
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-4",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex items-center gap-2 mb-1",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Activity, { className: "h-4 w-4 text-yellow-500" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "text-xs text-muted-foreground uppercase",
								children: "Degraded"
							})]
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "text-3xl font-bold text-yellow-500",
							children: degraded.length
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "rounded-xl border border-border/60 bg-card p-4",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex items-center gap-2 mb-1",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Users, { className: "h-4 w-4 text-blue-500" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "text-xs text-muted-foreground uppercase",
								children: "Sessions"
							})]
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "text-3xl font-bold text-blue-500",
							children: sessions.data?.length ?? 0
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "rounded-xl border border-border/60 bg-card p-4",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex items-center gap-2 mb-1",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Zap, { className: "h-4 w-4 text-primary" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "text-xs text-muted-foreground uppercase",
								children: "Total"
							})]
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "text-3xl font-bold",
							children: routers.data?.length ?? 0
						})]
					})
				]
			}),
			offline.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "rounded-xl border border-red-500/30 bg-red-500/10 p-4",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "font-medium text-red-600 mb-2",
					children: [
						"⚠ ",
						offline.length,
						" Router",
						offline.length > 1 ? "s" : "",
						" Offline"
					]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "flex flex-wrap gap-2",
					children: offline.map((r) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
						className: "rounded-full bg-red-500/20 text-red-600 px-3 py-1 text-xs font-medium",
						children: [
							r.name,
							" ",
							r.location ? `(${r.location})` : ""
						]
					}, r.id))
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "grid gap-4 md:grid-cols-2 lg:grid-cols-3",
				children: routers.isLoading ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "col-span-3 text-center py-12 text-muted-foreground",
					children: "Loading..."
				}) : routers.data?.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "col-span-3 text-center py-12 text-muted-foreground",
					children: "No routers configured"
				}) : routers.data?.map((r) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: `rounded-xl border bg-card p-5 cursor-pointer hover:shadow-md transition ${r.status === "online" ? "border-green-500/30" : r.status === "degraded" ? "border-yellow-500/30" : "border-red-500/30"}`,
					onClick: () => setSelectedRouter(r),
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex items-start justify-between mb-3",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "font-semibold",
								children: r.name
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "text-xs text-muted-foreground",
								children: [
									r.model ?? r.vendor,
									" · ",
									r.location ?? "No location"
								]
							})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "flex items-center gap-1.5",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: `h-2 w-2 rounded-full ${r.status === "online" ? "bg-green-500 animate-pulse" : r.status === "degraded" ? "bg-yellow-500" : "bg-red-500"}` }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: `text-xs font-medium ${r.status === "online" ? "text-green-600" : r.status === "degraded" ? "text-yellow-600" : "text-red-600"}`,
									children: r.status
								})]
							})]
						}),
						r.status === "online" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "space-y-2",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ProgressBar, {
									label: "CPU",
									value: r.cpu_load ?? 0,
									color: r.cpu_load > 80 ? "bg-red-500" : r.cpu_load > 60 ? "bg-yellow-500" : "bg-green-500",
									icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Cpu, { className: "h-3 w-3" })
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ProgressBar, {
									label: "Memory",
									value: r.memory_used ?? 0,
									color: "bg-blue-500",
									icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(HardDrive, { className: "h-3 w-3" })
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "flex items-center justify-between text-xs text-muted-foreground pt-1",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
										className: "flex items-center gap-1",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Clock, { className: "h-3 w-3" }), r.uptime ?? "N/A"]
									}), r.last_seen && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: ["Seen: ", new Date(r.last_seen).toLocaleTimeString()] })]
								})
							]
						}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "text-xs text-muted-foreground mt-2",
							children: r.last_seen ? `Last seen: ${new Date(r.last_seen).toLocaleString()}` : "Never connected"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "mt-3 pt-2 border-t border-border/60 flex gap-2",
							onClick: (e) => e.stopPropagation(),
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
								onClick: () => syncRouter(r.id),
								disabled: syncing === r.id,
								className: "text-xs flex items-center gap-1 text-muted-foreground hover:text-foreground",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(RefreshCw, { className: `h-3 w-3 ${syncing === r.id ? "animate-spin" : ""}` }), syncing === r.id ? "Syncing..." : "Sync"]
							})
						})
					]
				}, r.id))
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "rounded-xl border border-border/60 bg-card p-5",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("h2", {
					className: "font-semibold mb-4",
					children: [
						"Active Sessions (",
						sessions.data?.length ?? 0,
						")"
					]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "overflow-x-auto",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("table", {
						className: "w-full text-sm",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("thead", {
							className: "bg-muted/40 text-xs uppercase text-muted-foreground",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", { children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
									className: "px-4 py-2 text-left",
									children: "User"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
									className: "px-4 py-2 text-left",
									children: "IP"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
									className: "px-4 py-2 text-left",
									children: "MAC"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
									className: "px-4 py-2 text-left",
									children: "Started"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
									className: "px-4 py-2 text-left",
									children: "Data In"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
									className: "px-4 py-2 text-left",
									children: "Data Out"
								})
							] })
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tbody", { children: sessions.data?.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tr", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
							colSpan: 6,
							className: "px-4 py-8 text-center text-muted-foreground",
							children: "No active sessions"
						}) }) : sessions.data?.map((s) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", {
							className: "border-t border-border/60",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
									className: "px-4 py-2",
									children: s.customers?.full_name ?? s.username ?? "Guest"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
									className: "px-4 py-2 text-xs font-mono text-muted-foreground",
									children: s.ip_address ?? "—"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
									className: "px-4 py-2 text-xs font-mono text-muted-foreground",
									children: s.mac_address ?? "—"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
									className: "px-4 py-2 text-xs",
									children: new Date(s.started_at).toLocaleTimeString()
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
									className: "px-4 py-2 text-xs",
									children: fmtBytes(s.bytes_in ?? 0)
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
									className: "px-4 py-2 text-xs",
									children: fmtBytes(s.bytes_out ?? 0)
								})
							]
						}, s.id)) })]
					})
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Dialog, {
				open: !!selectedRouter,
				onOpenChange: (o) => !o && setSelectedRouter(null),
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DialogContent, {
					className: "max-w-2xl",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(DialogHeader, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DialogTitle, {
						className: "flex items-center gap-2",
						children: [selectedRouter?.name, /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: `h-2 w-2 rounded-full ${selectedRouter?.status === "online" ? "bg-green-500" : "bg-red-500"}` })]
					}) }), selectedRouter && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "space-y-4",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "grid grid-cols-2 gap-3 text-sm",
							children: [
								["Connection", selectedRouter.connection_string ?? selectedRouter.ip_address],
								["Model", selectedRouter.model ?? selectedRouter.vendor],
								["Uptime", selectedRouter.uptime],
								["Firmware", selectedRouter.firmware_version],
								["CPU Load", selectedRouter.cpu_load != null ? `${selectedRouter.cpu_load}%` : null],
								["Memory Used", selectedRouter.memory_used != null ? `${selectedRouter.memory_used}%` : null],
								["Location", selectedRouter.location],
								["Last Seen", selectedRouter.last_seen ? new Date(selectedRouter.last_seen).toLocaleString() : null]
							].map(([label, val]) => val ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "rounded-md bg-muted/30 p-2",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
									className: "text-xs text-muted-foreground",
									children: label
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
									className: "font-medium mt-0.5 text-sm",
									children: val
								})]
							}, label) : null)
						}), selectedRouter.status === "online" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
							className: "font-medium text-sm mb-2",
							children: "Live Sessions from Router"
						}), routerSessions.isLoading ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "text-xs text-muted-foreground",
							children: "Fetching sessions..."
						}) : routerSessions.data?.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "text-xs text-muted-foreground",
							children: "No active sessions on router"
						}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "overflow-x-auto",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("table", {
								className: "w-full text-xs",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("thead", {
									className: "bg-muted/40",
									children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", { children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
											className: "px-3 py-2 text-left",
											children: "User"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
											className: "px-3 py-2 text-left",
											children: "IP"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
											className: "px-3 py-2 text-left",
											children: "MAC"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
											className: "px-3 py-2 text-left",
											children: "Action"
										})
									] })
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tbody", { children: routerSessions.data?.map((s, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", {
									className: "border-t border-border/60",
									children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
											className: "px-3 py-1.5",
											children: s.user ?? s.name ?? "—"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
											className: "px-3 py-1.5 font-mono",
											children: s.address ?? s["caller-id"] ?? "—"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
											className: "px-3 py-1.5 font-mono",
											children: s["mac-address"] ?? "—"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
											className: "px-3 py-1.5",
											children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
												onClick: () => kickSessionMut.mutate({
													routerId: selectedRouter.id,
													sessionId: s[".id"]
												}),
												className: "text-red-500 hover:text-red-700 text-xs",
												children: "Kick"
											})
										})
									]
								}, i)) })]
							})
						})] })]
					})]
				})
			})
		]
	});
}
function ProgressBar({ label, value, color, icon }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flex justify-between text-xs mb-1",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
			className: "flex items-center gap-1 text-muted-foreground",
			children: [icon, label]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
			className: value > 80 ? "text-red-500 font-medium" : "",
			children: [value, "%"]
		})]
	}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "h-1.5 rounded-full bg-muted overflow-hidden",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: `h-full rounded-full ${color}`,
			style: { width: `${value}%` }
		})
	})] });
}
//#endregion
export { NocPage as component };
