import { a as supabase, i as init_client } from "./client-D3kKP_Nv.mjs";
import { s as require_jsx_runtime } from "../_libs/@radix-ui/react-arrow+[...].mjs";
import { n as useQuery } from "../_libs/tanstack__react-query.mjs";
import { i as useAuth, n as fetchProfile, t as fetchMyRoles } from "./auth-z02iFWqz.mjs";
import { At as Bell, Mt as ArrowRight, N as Receipt, Pt as Activity, S as Signal, V as Package, c as UserX, d as TriangleAlert, h as Ticket, i as Wifi, lt as DollarSign, mt as Clock, s as Users, t as Zap, u as UserCheck, vt as CircleCheckBig, wt as ChartNoAxesColumn } from "../_libs/lucide-react.mjs";
import { g as Link } from "../_libs/@tanstack/react-router+[...].mjs";
import { t as OnboardTenant } from "./OnboardTenant-D5S-QYO4.mjs";
import { r as useBranding } from "./branding-Bl6WKHXJ.mjs";
import { a as Tooltip, i as ResponsiveContainer, n as XAxis, r as Area, t as AreaChart } from "../_libs/recharts+[...].mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/dashboard-CPmUQW8a.js
var import_jsx_runtime = require_jsx_runtime();
init_client();
function Dashboard() {
	const { user } = useAuth();
	useBranding();
	const profile = useQuery({
		queryKey: ["profile", user?.id],
		queryFn: () => user ? fetchProfile(user.id) : Promise.resolve(null),
		enabled: !!user
	});
	const roles = useQuery({
		queryKey: ["roles", user?.id],
		queryFn: () => user ? fetchMyRoles(user.id) : Promise.resolve([]),
		enabled: !!user
	});
	const tenantId = profile.data?.tenant_id;
	const isSuper = (roles.data ?? []).includes("super_admin");
	const stats = useQuery({
		queryKey: ["dashboard-stats", tenantId],
		queryFn: async () => {
			const [customers, routers, activeSessions, mtdPayments, openTickets, expiringToday, newThisMonth, suspended] = await Promise.all([
				supabase.from("customers").select("*", {
					count: "exact",
					head: true
				}).eq("tenant_id", tenantId),
				supabase.from("routers").select("id,status").eq("tenant_id", tenantId),
				supabase.from("sessions").select("*", {
					count: "exact",
					head: true
				}).eq("tenant_id", tenantId).is("ended_at", null),
				supabase.from("payments").select("amount").eq("tenant_id", tenantId).eq("status", "completed").gte("created_at", new Date((/* @__PURE__ */ new Date()).getFullYear(), (/* @__PURE__ */ new Date()).getMonth(), 1).toISOString()),
				supabase.from("tickets").select("*", {
					count: "exact",
					head: true
				}).eq("tenant_id", tenantId).in("status", ["open", "in_progress"]),
				supabase.from("subscriptions").select("*", {
					count: "exact",
					head: true
				}).eq("tenant_id", tenantId).eq("status", "active").lte("expires_at", new Date(Date.now() + 864e5 * 3).toISOString()).gte("expires_at", (/* @__PURE__ */ new Date()).toISOString()),
				supabase.from("customers").select("*", {
					count: "exact",
					head: true
				}).eq("tenant_id", tenantId).gte("created_at", new Date((/* @__PURE__ */ new Date()).getFullYear(), (/* @__PURE__ */ new Date()).getMonth(), 1).toISOString()),
				supabase.from("customers").select("*", {
					count: "exact",
					head: true
				}).eq("tenant_id", tenantId).eq("status", "suspended")
			]);
			const routerData = routers.data ?? [];
			return {
				customers: customers.count ?? 0,
				routersOnline: routerData.filter((r) => r.status === "online").length,
				routersTotal: routerData.length,
				activeSessions: activeSessions.count ?? 0,
				mtdRevenue: (mtdPayments.data ?? []).reduce((s, p) => s + Number(p.amount), 0),
				openTickets: openTickets.count ?? 0,
				expiringToday: expiringToday.count ?? 0,
				newThisMonth: newThisMonth.count ?? 0,
				suspended: suspended.count ?? 0
			};
		},
		enabled: !!tenantId,
		refetchInterval: 3e4
	});
	const revenueChart = useQuery({
		queryKey: ["revenue-chart", tenantId],
		queryFn: async () => {
			const days = Array.from({ length: 7 }, (_, i) => {
				const d = /* @__PURE__ */ new Date();
				d.setDate(d.getDate() - (6 - i));
				return d;
			});
			const from = days[0].toISOString();
			const { data } = await supabase.from("payments").select("amount, created_at").eq("tenant_id", tenantId).eq("status", "completed").gte("created_at", from);
			return days.map((d) => {
				return {
					day: d.toLocaleDateString("en-KE", { weekday: "short" }),
					amount: (data ?? []).filter((p) => new Date(p.created_at).toDateString() === d.toDateString()).reduce((acc, p) => acc + Number(p.amount), 0)
				};
			});
		},
		enabled: !!tenantId
	});
	const superStats = useQuery({
		queryKey: ["super-stats"],
		queryFn: async () => {
			const [tenants, activeTenants] = await Promise.all([supabase.from("tenants").select("*", {
				count: "exact",
				head: true
			}), supabase.from("tenants").select("*", {
				count: "exact",
				head: true
			}).eq("status", "active")]);
			return {
				total: tenants.count ?? 0,
				active: activeTenants.count ?? 0
			};
		},
		enabled: isSuper
	});
	const recentPayments = useQuery({
		queryKey: ["recent-payments", tenantId],
		queryFn: async () => {
			const { data } = await supabase.from("payments").select("id, amount, method, status, created_at, customers(full_name)").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(6);
			return data ?? [];
		},
		enabled: !!tenantId
	});
	const recentTickets = useQuery({
		queryKey: ["recent-tickets", tenantId],
		queryFn: async () => {
			const { data } = await supabase.from("tickets").select("id, ticket_no, subject, priority, status, created_at").eq("tenant_id", tenantId).in("status", ["open", "in_progress"]).order("created_at", { ascending: false }).limit(5);
			return data ?? [];
		},
		enabled: !!tenantId
	});
	if (!user || profile.isLoading || roles.isLoading) return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flex flex-col items-center justify-center min-h-[60vh] gap-3",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
			className: "text-sm text-muted-foreground",
			children: "Loading workspace…"
		})]
	});
	if (!profile.data?.tenant_id && !isSuper) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(OnboardTenant, { userId: user.id });
	const s = stats.data;
	const greeting = profile.data?.full_name ? `, ${profile.data.full_name.split(" ")[0]}` : "";
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "space-y-6 max-w-[1400px]",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex items-start justify-between gap-4",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("h1", {
					className: "text-2xl font-bold tracking-tight",
					children: [
						"Good ",
						timeOfDay(),
						greeting,
						" 👋"
					]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-1 text-sm text-muted-foreground",
					children: isSuper ? "Platform-wide overview — SmartLinkNet SaaS" : "Here's what's happening with your ISP today."
				})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "hidden sm:flex gap-2",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Link, {
						to: "/customers",
						className: "inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:opacity-90",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Users, { className: "h-3.5 w-3.5" }), " Add Customer"]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Link, {
						to: "/billing",
						className: "inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium hover:bg-accent",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Receipt, { className: "h-3.5 w-3.5" }), " New Payment"]
					})]
				})]
			}),
			isSuper && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "grid gap-4 sm:grid-cols-2 lg:grid-cols-3",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(KpiCard, {
						icon: Activity,
						label: "Total Tenants",
						value: superStats.data?.total ?? 0,
						accent: true
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(KpiCard, {
						icon: CircleCheckBig,
						label: "Active Tenants",
						value: superStats.data?.active ?? 0,
						color: "text-green-500",
						trend: "+2 this month"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Link, {
						to: "/admin",
						className: "group rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 to-primary/5 p-5 hover:border-primary/50 transition flex items-center justify-between",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "text-xs uppercase tracking-wide text-muted-foreground",
							children: "Admin"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "mt-1 font-semibold",
							children: "Manage Tenants"
						})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ArrowRight, { className: "h-5 w-5 text-primary group-hover:translate-x-1 transition-transform" })]
					})
				]
			}),
			!isSuper && tenantId && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "grid gap-4 grid-cols-2 lg:grid-cols-4",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(KpiCard, {
							icon: Users,
							label: "Total Customers",
							value: s?.customers ?? 0,
							trend: s?.newThisMonth ? `+${s.newThisMonth} this month` : void 0,
							loading: stats.isLoading
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(KpiCard, {
							icon: Signal,
							label: "Online Now",
							value: s ? `${s.routersOnline}/${s.routersTotal}` : "—",
							color: s && s.routersOnline < s.routersTotal ? "text-yellow-500" : "text-green-500",
							trend: s && s.routersOnline === s.routersTotal ? "All routers healthy" : `${s ? s.routersTotal - s.routersOnline : 0} offline`,
							loading: stats.isLoading
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(KpiCard, {
							icon: Wifi,
							label: "Active Sessions",
							value: s?.activeSessions ?? 0,
							color: "text-blue-500",
							trend: "Live hotspot users",
							loading: stats.isLoading
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(KpiCard, {
							icon: DollarSign,
							label: "Revenue MTD",
							value: s ? `KES ${s.mtdRevenue.toLocaleString()}` : "—",
							color: "text-green-500",
							trend: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ResponsiveContainer, {
								width: "100%",
								height: 32,
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(AreaChart, {
									data: revenueChart.data ?? [],
									margin: {
										top: 0,
										right: 0,
										bottom: 0,
										left: 0
									},
									children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Area, {
											type: "monotone",
											dataKey: "amount",
											stroke: "currentColor",
											fill: "currentColor",
											className: "text-green-500/20 stroke-green-500",
											strokeWidth: 1.5
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Tooltip, {
											formatter: (v) => [`KES ${Number(v).toLocaleString()}`, ""],
											contentStyle: {
												background: "var(--card)",
												border: "1px solid var(--border)",
												borderRadius: 8,
												fontSize: 11
											}
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(XAxis, {
											dataKey: "day",
											hide: true
										})
									]
								})
							}),
							loading: stats.isLoading
						})
					]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "grid gap-4 grid-cols-2 lg:grid-cols-4",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(MiniCard, {
							icon: Clock,
							label: "Expiring Soon",
							value: s?.expiringToday ?? 0,
							color: "text-yellow-500",
							href: "/billing"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(MiniCard, {
							icon: UserX,
							label: "Suspended",
							value: s?.suspended ?? 0,
							color: "text-red-500",
							href: "/customers"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(MiniCard, {
							icon: Ticket,
							label: "Open Tickets",
							value: s?.openTickets ?? 0,
							color: "text-blue-500",
							href: "/support"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(MiniCard, {
							icon: UserCheck,
							label: "New This Month",
							value: s?.newThisMonth ?? 0,
							color: "text-primary",
							href: "/customers"
						})
					]
				}),
				((s?.expiringToday ?? 0) > 0 || (s?.openTickets ?? 0) > 0) && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "grid gap-3 sm:grid-cols-2",
					children: [(s?.expiringToday ?? 0) > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AlertBanner, {
						icon: TriangleAlert,
						color: "yellow",
						title: `${s.expiringToday} subscription${s.expiringToday > 1 ? "s" : ""} expiring in 3 days`,
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
							to: "/billing",
							className: "text-xs font-medium hover:underline",
							children: "View billing →"
						})
					}), (s?.openTickets ?? 0) > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AlertBanner, {
						icon: Bell,
						color: "blue",
						title: `${s.openTickets} open support ticket${s.openTickets > 1 ? "s" : ""}`,
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
							to: "/support",
							className: "text-xs font-medium hover:underline",
							children: "View tickets →"
						})
					})]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "grid gap-6 lg:grid-cols-3",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "lg:col-span-2 space-y-4",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "rounded-2xl border border-border/60 bg-card p-5",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "flex items-center justify-between mb-4",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
									className: "font-semibold",
									children: "Revenue — Last 7 Days"
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: "text-xs text-muted-foreground",
									children: "Daily M-Pesa collections"
								})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ChartNoAxesColumn, { className: "h-4 w-4 text-muted-foreground" })]
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ResponsiveContainer, {
								width: "100%",
								height: 140,
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(AreaChart, {
									data: revenueChart.data ?? [],
									margin: {
										top: 4,
										right: 4,
										bottom: 0,
										left: 4
									},
									children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("defs", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("linearGradient", {
											id: "rev-grad",
											x1: "0",
											y1: "0",
											x2: "0",
											y2: "1",
											children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("stop", {
												offset: "5%",
												stopColor: "var(--color-primary)",
												stopOpacity: .25
											}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("stop", {
												offset: "95%",
												stopColor: "var(--color-primary)",
												stopOpacity: 0
											})]
										}) }),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(XAxis, {
											dataKey: "day",
											tick: {
												fontSize: 11,
												fill: "var(--color-muted-foreground)"
											},
											axisLine: false,
											tickLine: false
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Tooltip, {
											formatter: (v) => [`KES ${Number(v).toLocaleString()}`, "Revenue"],
											contentStyle: {
												background: "var(--color-card)",
												border: "1px solid var(--color-border)",
												borderRadius: 8,
												fontSize: 11
											}
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Area, {
											type: "monotone",
											dataKey: "amount",
											stroke: "var(--color-primary)",
											strokeWidth: 2,
											fill: "url(#rev-grad)"
										})
									]
								})
							})]
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "rounded-2xl border border-border/60 bg-card p-5",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "flex items-center justify-between mb-4",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
									className: "font-semibold",
									children: "Recent Payments"
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Link, {
									to: "/billing",
									className: "text-xs text-primary hover:underline flex items-center gap-1",
									children: ["View all ", /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ArrowRight, { className: "h-3 w-3" })]
								})]
							}), recentPayments.isLoading ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "space-y-2",
								children: Array.from({ length: 4 }).map((_, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "h-10 rounded-md bg-muted animate-pulse" }, i))
							}) : recentPayments.data?.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(EmptyState, {
								icon: Receipt,
								title: "No payments yet",
								desc: "Payments appear here as customers pay."
							}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "space-y-1.5",
								children: recentPayments.data?.map((p) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "flex items-center justify-between rounded-xl bg-muted/40 px-3 py-2.5 text-sm hover:bg-muted/70 transition",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "flex items-center gap-3",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
											className: "grid h-7 w-7 place-items-center rounded-full bg-green-500/15 text-green-600 text-xs font-bold",
											children: (p.customers?.full_name ?? "?")[0]
										}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
											className: "font-medium text-sm leading-tight",
											children: p.customers?.full_name ?? "—"
										}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
											className: "text-xs text-muted-foreground capitalize",
											children: [
												p.method,
												" · ",
												new Date(p.created_at).toLocaleDateString()
											]
										})] })]
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "text-right",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
											className: "font-semibold text-green-500",
											children: ["KES ", Number(p.amount).toLocaleString()]
										}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PayStatusBadge, { status: p.status })]
									})]
								}, p.id))
							})]
						})]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "space-y-4",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "rounded-2xl border border-border/60 bg-card p-5",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
									className: "font-semibold mb-3",
									children: "Quick Actions"
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
									className: "space-y-1.5",
									children: [
										{
											to: "/customers",
											icon: Users,
											label: "Add Customer",
											desc: "Register new subscriber"
										},
										{
											to: "/billing",
											icon: Receipt,
											label: "Record Payment",
											desc: "Manual payment entry"
										},
										{
											to: "/hotspot",
											icon: Wifi,
											label: "Generate Vouchers",
											desc: "Hotspot voucher codes"
										},
										{
											to: "/support",
											icon: Activity,
											label: "New Ticket",
											desc: "Support request"
										},
										{
											to: "/packages",
											icon: Package,
											label: "Manage Plans",
											desc: "Internet packages"
										},
										{
											to: "/portal-manager",
											icon: Zap,
											label: "Captive Portal",
											desc: "Portal configuration"
										}
									].map((a) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Link, {
										to: a.to,
										className: "flex items-center gap-3 rounded-xl border border-border/50 px-3 py-2.5 text-sm hover:bg-accent/50 hover:border-primary/40 transition group",
										children: [
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
												className: "grid h-7 w-7 place-items-center rounded-lg bg-primary/10 text-primary shrink-0",
												children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(a.icon, { className: "h-3.5 w-3.5" })
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
												className: "min-w-0",
												children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
													className: "font-medium leading-tight",
													children: a.label
												}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
													className: "text-[11px] text-muted-foreground",
													children: a.desc
												})]
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ArrowRight, { className: "h-3.5 w-3.5 ml-auto text-muted-foreground opacity-0 group-hover:opacity-100 transition" })
										]
									}, a.to))
								})]
							}),
							recentTickets.data && recentTickets.data.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "rounded-2xl border border-border/60 bg-card p-5",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "flex items-center justify-between mb-3",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
										className: "font-semibold text-sm",
										children: "Open Tickets"
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
										to: "/support",
										className: "text-xs text-primary hover:underline",
										children: "View all"
									})]
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
									className: "space-y-2",
									children: recentTickets.data.map((t) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "rounded-xl bg-muted/40 p-2.5 text-xs",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
											className: "flex items-center justify-between",
											children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
												className: "font-mono text-muted-foreground",
												children: t.ticket_no
											}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PriorityBadge, { priority: t.priority })]
										}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
											className: "font-medium mt-0.5 truncate",
											children: t.subject
										})]
									}, t.id))
								})]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
								to: "/portal-manager",
								className: "block rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 to-transparent p-5 hover:border-primary/50 transition group",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "flex items-center justify-between",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
											className: "text-xs text-muted-foreground uppercase tracking-wide",
											children: "Captive Portal"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
											className: "font-semibold mt-0.5",
											children: "Manage Portal"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
											className: "text-xs text-muted-foreground mt-1",
											children: "Branding · Packages · Payments"
										})
									] }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Zap, { className: "h-6 w-6 text-primary" })]
								})
							})
						]
					})]
				})
			] })
		]
	});
}
function timeOfDay() {
	const h = (/* @__PURE__ */ new Date()).getHours();
	if (h < 12) return "morning";
	if (h < 17) return "afternoon";
	return "evening";
}
function KpiCard({ icon: Icon, label, value, accent, color, loading, trend }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "rounded-2xl border border-border/60 bg-card p-5 flex flex-col gap-3",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex items-center justify-between",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "text-xs uppercase tracking-wide text-muted-foreground",
					children: label
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: `grid h-8 w-8 place-items-center rounded-lg ${accent ? "bg-primary/15 text-primary" : "bg-muted/60 text-muted-foreground"}`,
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Icon, { className: "h-4 w-4" })
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: `text-2xl font-bold ${color ?? ""}`,
				children: loading ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "h-7 w-20 inline-block rounded-lg bg-muted animate-pulse" }) : value
			}),
			trend && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "text-xs text-muted-foreground",
				children: trend
			})
		]
	});
}
function MiniCard({ icon: Icon, label, value, color, href }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Link, {
		to: href,
		className: "rounded-2xl border border-border/60 bg-card p-4 flex items-center gap-3 hover:border-primary/40 transition group",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: `grid h-9 w-9 place-items-center rounded-xl bg-current/10 shrink-0 ${color}`,
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Icon, { className: "h-4 w-4" })
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: `text-xl font-bold ${color}`,
			children: value
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "text-xs text-muted-foreground",
			children: label
		})] })]
	});
}
function AlertBanner({ icon: Icon, color, title, children }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: `flex items-center gap-3 rounded-xl border p-4 ${color === "yellow" ? "border-yellow-500/30 bg-yellow-500/10 text-yellow-600" : "border-blue-500/30 bg-blue-500/10 text-blue-600"}`,
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Icon, { className: "h-4 w-4 shrink-0" }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "font-medium text-sm",
			children: title
		}), children] })]
	});
}
function EmptyState({ icon: Icon, title, desc }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flex flex-col items-center justify-center py-8 text-center",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "grid h-10 w-10 place-items-center rounded-full bg-primary/10 text-primary",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Icon, { className: "h-4 w-4" })
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-3 font-medium text-sm",
				children: title
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-1 max-w-xs text-xs text-muted-foreground",
				children: desc
			})
		]
	});
}
function PayStatusBadge({ status }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
		className: `rounded-full px-1.5 py-0.5 text-[10px] capitalize ${{
			completed: "bg-green-500/15 text-green-600",
			pending: "bg-yellow-500/15 text-yellow-600",
			failed: "bg-red-500/15 text-red-600"
		}[status] ?? "bg-muted"}`,
		children: status
	});
}
function PriorityBadge({ priority }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
		className: `rounded-full px-1.5 py-0.5 text-[10px] capitalize ${{
			low: "bg-blue-500/15 text-blue-600",
			medium: "bg-yellow-500/15 text-yellow-600",
			high: "bg-orange-500/15 text-orange-600",
			critical: "bg-red-500/15 text-red-600"
		}[priority] ?? "bg-muted"}`,
		children: priority
	});
}
//#endregion
export { Dashboard as component };
