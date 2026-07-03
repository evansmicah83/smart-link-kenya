import { i as __toESM } from "../_runtime.mjs";
import { a as supabase, i as init_client } from "./client-D3kKP_Nv.mjs";
import { u as require_react } from "../_libs/@floating-ui/react-dom+[...].mjs";
import { s as require_jsx_runtime } from "../_libs/@radix-ui/react-arrow+[...].mjs";
import { n as useQuery } from "../_libs/tanstack__react-query.mjs";
import { a as useTenantId } from "./auth-z02iFWqz.mjs";
import { t as Button } from "./button-DRsC1qZi.mjs";
import { N as Receipt, Tt as ChartColumn, V as Package, ct as Download, f as TrendingUp, i as Wifi, p as TrendingDown, s as Users } from "../_libs/lucide-react.mjs";
import { a as SelectValue, i as SelectTrigger, n as SelectContent, r as SelectItem, t as Select } from "./select-DUy71i1r.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/reports-CP5w17g7.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
init_client();
function ReportsPage() {
	const { data: tenantId } = useTenantId();
	const [period, setPeriod] = (0, import_react.useState)("30");
	const since = (/* @__PURE__ */ new Date(Date.now() - Number(period) * 864e5)).toISOString();
	const revenue = useQuery({
		queryKey: [
			"report-revenue",
			tenantId,
			period
		],
		queryFn: async () => {
			const { data, error } = await supabase.from("payments").select("amount, method, created_at").eq("tenant_id", tenantId).eq("status", "completed").gte("created_at", since);
			if (error) throw error;
			return data ?? [];
		},
		enabled: !!tenantId
	});
	const expenses = useQuery({
		queryKey: [
			"report-expenses",
			tenantId,
			period
		],
		queryFn: async () => {
			const { data, error } = await supabase.from("expenses").select("amount, category, date").eq("tenant_id", tenantId).gte("created_at", since);
			if (error) throw error;
			return data ?? [];
		},
		enabled: !!tenantId
	});
	const customers = useQuery({
		queryKey: [
			"report-customers",
			tenantId,
			period
		],
		queryFn: async () => {
			const { data } = await supabase.from("customers").select("status, category, created_at").eq("tenant_id", tenantId);
			return data ?? [];
		},
		enabled: !!tenantId
	});
	const subscriptions = useQuery({
		queryKey: [
			"report-subs",
			tenantId,
			period
		],
		queryFn: async () => {
			const { data } = await supabase.from("subscriptions").select("status, type, expires_at, created_at").eq("tenant_id", tenantId);
			return data ?? [];
		},
		enabled: !!tenantId
	});
	const tickets = useQuery({
		queryKey: [
			"report-tickets",
			tenantId,
			period
		],
		queryFn: async () => {
			const { data } = await supabase.from("tickets").select("status, priority, type, created_at, resolved_at").eq("tenant_id", tenantId).gte("created_at", since);
			return data ?? [];
		},
		enabled: !!tenantId
	});
	const installations = useQuery({
		queryKey: [
			"report-inst",
			tenantId,
			period
		],
		queryFn: async () => {
			const { data } = await supabase.from("installations").select("status, type, cost, created_at").eq("tenant_id", tenantId).gte("created_at", since);
			return data ?? [];
		},
		enabled: !!tenantId
	});
	const totalRevenue = revenue.data?.reduce((s, p) => s + Number(p.amount), 0) ?? 0;
	const totalExpenses = expenses.data?.reduce((s, e) => s + Number(e.amount), 0) ?? 0;
	const netProfit = totalRevenue - totalExpenses;
	const margin = totalRevenue > 0 ? (netProfit / totalRevenue * 100).toFixed(1) : "0";
	const revenueByMethod = (revenue.data ?? []).reduce((acc, p) => {
		acc[p.method] = (acc[p.method] ?? 0) + Number(p.amount);
		return acc;
	}, {});
	const expenseByCategory = (expenses.data ?? []).reduce((acc, e) => {
		acc[e.category] = (acc[e.category] ?? 0) + Number(e.amount);
		return acc;
	}, {});
	const customerByStatus = (customers.data ?? []).reduce((acc, c) => {
		acc[c.status] = (acc[c.status] ?? 0) + 1;
		return acc;
	}, {});
	const customerByCategory = (customers.data ?? []).reduce((acc, c) => {
		acc[c.category] = (acc[c.category] ?? 0) + 1;
		return acc;
	}, {});
	const newCustomers = (customers.data ?? []).filter((c) => c.created_at >= since).length;
	const activeSubs = (subscriptions.data ?? []).filter((s) => s.status === "active").length;
	const expiringSoon = (subscriptions.data ?? []).filter((s) => s.status === "active" && s.expires_at && new Date(s.expires_at) <= new Date(Date.now() + 7 * 864e5)).length;
	const installCost = (installations.data ?? []).reduce((s, i) => s + Number(i.cost ?? 0), 0);
	const resolvedTickets = (tickets.data ?? []).filter((t) => t.status === "resolved" || t.status === "closed").length;
	function downloadReport() {
		const lines = [
			`SmartLinkNet Report — Last ${period} days`,
			`Generated: ${(/* @__PURE__ */ new Date()).toLocaleString()}`,
			"",
			"=== FINANCIAL SUMMARY ===",
			`Total Revenue: KES ${totalRevenue.toLocaleString()}`,
			`Total Expenses: KES ${totalExpenses.toLocaleString()}`,
			`Net Profit: KES ${netProfit.toLocaleString()}`,
			`Profit Margin: ${margin}%`,
			"",
			"=== CUSTOMERS ===",
			`New Customers: ${newCustomers}`,
			`Total Customers: ${customers.data?.length ?? 0}`,
			`Active: ${customerByStatus["active"] ?? 0}`,
			`Suspended: ${customerByStatus["suspended"] ?? 0}`,
			"",
			"=== SUBSCRIPTIONS ===",
			`Active: ${activeSubs}`,
			`Expiring in 7 days: ${expiringSoon}`,
			"",
			"=== SUPPORT ===",
			`Tickets: ${tickets.data?.length ?? 0}`,
			`Resolved: ${resolvedTickets}`,
			"",
			"=== REVENUE BY METHOD ===",
			...Object.entries(revenueByMethod).map(([m, v]) => `${m}: KES ${v.toLocaleString()}`),
			"",
			"=== EXPENSES BY CATEGORY ===",
			...Object.entries(expenseByCategory).map(([c, v]) => `${c}: KES ${v.toLocaleString()}`)
		].join("\n");
		const a = document.createElement("a");
		a.href = "data:text/plain," + encodeURIComponent(lines);
		a.download = `smartlinknet-report-${(/* @__PURE__ */ new Date()).toISOString().split("T")[0]}.txt`;
		a.click();
	}
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "space-y-6",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex flex-col sm:flex-row sm:items-center justify-between gap-3",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
					className: "text-2xl font-semibold",
					children: "Reports & Analytics"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "text-sm text-muted-foreground",
					children: "Financial and operational insights"
				})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex flex-wrap gap-2",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Select, {
						value: period,
						onValueChange: setPeriod,
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectTrigger, {
							className: "w-40",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectValue, {})
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(SelectContent, { children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
								value: "7",
								children: "Last 7 days"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
								value: "30",
								children: "Last 30 days"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
								value: "90",
								children: "Last 90 days"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
								value: "365",
								children: "Last 12 months"
							})
						] })]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
						variant: "outline",
						onClick: downloadReport,
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Download, { className: "h-4 w-4 mr-2" }), "Download Report"]
					})]
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "grid grid-cols-2 lg:grid-cols-4 gap-4",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(KPI, {
						icon: TrendingUp,
						label: "Revenue",
						value: `KES ${totalRevenue.toLocaleString()}`,
						color: "text-green-500"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(KPI, {
						icon: TrendingDown,
						label: "Expenses",
						value: `KES ${totalExpenses.toLocaleString()}`,
						color: "text-red-500"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(KPI, {
						icon: Receipt,
						label: "Net Profit",
						value: `KES ${netProfit.toLocaleString()}`,
						color: netProfit >= 0 ? "text-green-500" : "text-red-500",
						sub: `${margin}% margin`
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(KPI, {
						icon: Users,
						label: "New Customers",
						value: newCustomers,
						sub: `${customers.data?.length ?? 0} total`
					})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "grid grid-cols-2 lg:grid-cols-4 gap-4",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(KPI, {
						icon: Wifi,
						label: "Active Subs",
						value: activeSubs
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(KPI, {
						icon: Package,
						label: "Expiring (7d)",
						value: expiringSoon,
						color: expiringSoon > 0 ? "text-yellow-500" : ""
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(KPI, {
						icon: ChartColumn,
						label: "Tickets",
						value: tickets.data?.length ?? 0,
						sub: `${resolvedTickets} resolved`
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(KPI, {
						icon: Receipt,
						label: "Install Revenue",
						value: `KES ${installCost.toLocaleString()}`
					})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "grid lg:grid-cols-2 gap-6",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ChartCard, {
						title: "Revenue by Payment Method",
						data: revenueByMethod,
						total: totalRevenue,
						color: "bg-primary"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ChartCard, {
						title: "Expenses by Category",
						data: expenseByCategory,
						total: totalExpenses,
						color: "bg-destructive/70"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ChartCard, {
						title: "Customers by Status",
						data: customerByStatus,
						total: customers.data?.length ?? 0,
						color: "bg-blue-500"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ChartCard, {
						title: "Customers by Category",
						data: customerByCategory,
						total: customers.data?.length ?? 0,
						color: "bg-purple-500"
					})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "rounded-xl border border-border/60 bg-card p-6",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
					className: "font-semibold mb-4",
					children: "Subscription Breakdown"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "grid grid-cols-2 lg:grid-cols-4 gap-4",
					children: [
						{
							label: "Active",
							value: activeSubs,
							color: "text-green-500"
						},
						{
							label: "Expired",
							value: (subscriptions.data ?? []).filter((s) => s.status === "expired").length,
							color: "text-red-500"
						},
						{
							label: "Suspended",
							value: (subscriptions.data ?? []).filter((s) => s.status === "suspended").length,
							color: "text-yellow-500"
						},
						{
							label: "Hotspot",
							value: (subscriptions.data ?? []).filter((s) => s.type === "hotspot").length
						},
						{
							label: "PPPoE",
							value: (subscriptions.data ?? []).filter((s) => s.type === "pppoe").length
						},
						{
							label: "Fiber",
							value: (subscriptions.data ?? []).filter((s) => s.type === "fiber").length
						}
					].map((s) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "rounded-lg bg-muted/40 p-3",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "text-xs text-muted-foreground",
							children: s.label
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: `text-xl font-bold mt-1 ${s.color ?? ""}`,
							children: s.value
						})]
					}, s.label))
				})]
			})
		]
	});
}
function KPI({ icon: Icon, label, value, color, sub }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "rounded-xl border border-border/60 bg-card p-4",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex items-center justify-between mb-2",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "text-xs text-muted-foreground uppercase",
					children: label
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Icon, { className: `h-4 w-4 ${color ?? "text-muted-foreground"}` })]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: `text-xl font-bold ${color ?? ""}`,
				children: value
			}),
			sub && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "text-xs text-muted-foreground mt-0.5",
				children: sub
			})
		]
	});
}
function ChartCard({ title, data, total, color }) {
	const sorted = Object.entries(data).sort((a, b) => b[1] - a[1]);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "rounded-xl border border-border/60 bg-card p-6",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
			className: "font-semibold mb-4",
			children: title
		}), sorted.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "text-sm text-muted-foreground text-center py-6",
			children: "No data for this period"
		}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "space-y-3",
			children: sorted.map(([key, val]) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex justify-between text-sm mb-1",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "capitalize",
					children: key.replace(/_/g, " ")
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "font-medium",
					children: typeof val === "number" && val > 999 ? `KES ${val.toLocaleString()}` : val
				})]
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "h-2 rounded-full bg-muted overflow-hidden",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: `h-full rounded-full ${color}`,
					style: { width: `${total > 0 ? val / total * 100 : 0}%` }
				})
			})] }, key))
		})]
	});
}
//#endregion
export { ReportsPage as component };
