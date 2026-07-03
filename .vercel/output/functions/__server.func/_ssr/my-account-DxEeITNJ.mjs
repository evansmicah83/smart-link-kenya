import { i as __toESM } from "../_runtime.mjs";
import { a as supabase, i as init_client } from "./client-D3kKP_Nv.mjs";
import { u as require_react } from "../_libs/@floating-ui/react-dom+[...].mjs";
import { s as require_jsx_runtime } from "../_libs/@radix-ui/react-arrow+[...].mjs";
import { M as RefreshCw, Nt as ArrowLeft, Pt as Activity, R as Phone, V as Package, X as LoaderCircle, ct as Download, f as TrendingUp, h as Ticket, i as Wifi, mt as Clock, t as Zap, ut as Database, vt as CircleCheckBig, xt as ChevronRight, yt as CircleAlert } from "../_libs/lucide-react.mjs";
import { v as useSearch } from "../_libs/@tanstack/react-router+[...].mjs";
import { a as Tooltip, i as ResponsiveContainer, n as XAxis, r as Area, t as AreaChart } from "../_libs/recharts+[...].mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/my-account-DxEeITNJ.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
/**
* Customer Self-Service Portal — /my-account?token=<token>&isp=<slug>
* Subscribers can view their plan, usage, payments, tickets and take actions.
*/
init_client();
function fmtBytes(b) {
	if (!b) return "0 B";
	if (b < 1024) return `${b} B`;
	if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
	if (b < 1073741824) return `${(b / 1048576).toFixed(1)} MB`;
	return `${(b / 1073741824).toFixed(2)} GB`;
}
function daysLeft(expiresAt) {
	const diff = new Date(expiresAt).getTime() - Date.now();
	return Math.max(0, Math.ceil(diff / 864e5));
}
function speedLabel(kbps) {
	return kbps >= 1024 ? `${(kbps / 1024).toFixed(0)} Mbps` : `${kbps} Kbps`;
}
function CustomerPortal() {
	const { token, isp } = useSearch({ from: "/my-account/" });
	const [tab, setTab] = (0, import_react.useState)("overview");
	const [brand, setBrand] = (0, import_react.useState)({});
	const [customer, setCustomer] = (0, import_react.useState)(null);
	const [tenantId, setTenantId] = (0, import_react.useState)(null);
	const [subscription, setSubscription] = (0, import_react.useState)(null);
	const [payments, setPayments] = (0, import_react.useState)([]);
	const [tickets, setTickets] = (0, import_react.useState)([]);
	const [sessions, setSessions] = (0, import_react.useState)([]);
	const [loading, setLoading] = (0, import_react.useState)(true);
	const [error, setError] = (0, import_react.useState)("");
	const [actionLoading, setActionLoading] = (0, import_react.useState)("");
	const [ticketSubject, setTicketSubject] = (0, import_react.useState)("");
	const [ticketDesc, setTicketDesc] = (0, import_react.useState)("");
	const [ticketSending, setTicketSending] = (0, import_react.useState)(false);
	const [ticketSent, setTicketSent] = (0, import_react.useState)(false);
	const [usageChart, setUsageChart] = (0, import_react.useState)([]);
	(0, import_react.useEffect)(() => {
		if (!token || !isp) {
			setError("Invalid or missing access token.");
			setLoading(false);
			return;
		}
		(async () => {
			try {
				const { data: tenant } = await supabase.from("tenants").select("id,name").eq("slug", isp).maybeSingle();
				if (!tenant) throw new Error("ISP not found.");
				setTenantId(tenant.id);
				const { data: sess } = await supabase.from("customer_sessions").select("customer_id, expires_at").eq("token", token).eq("tenant_id", tenant.id).maybeSingle();
				if (!sess || new Date(sess.expires_at) < /* @__PURE__ */ new Date()) throw new Error("Session expired. Please log in again.");
				const { data: b } = await supabase.from("tenant_branding").select("*").eq("tenant_id", tenant.id).maybeSingle();
				setBrand({
					...b ?? {},
					company_name: b?.company_name ?? tenant.name
				});
				if (b?.primary_color) document.documentElement.style.setProperty("--primary", b.primary_color);
				const { data: cust } = await supabase.from("customers").select("*").eq("id", sess.customer_id).single();
				setCustomer(cust);
				const [subRes, payRes, tickRes, sesRes] = await Promise.all([
					supabase.from("subscriptions").select("*, packages(name,price,speed_down_kbps,speed_up_kbps,data_limit_mb,duration_days)").eq("customer_id", cust.id).eq("status", "active").order("created_at", { ascending: false }).limit(1).maybeSingle(),
					supabase.from("payments").select("id,amount,method,status,created_at,mpesa_receipt").eq("customer_id", cust.id).order("created_at", { ascending: false }).limit(10),
					supabase.from("tickets").select("id,ticket_no,subject,priority,status,created_at").eq("customer_id", cust.id).order("created_at", { ascending: false }).limit(10),
					supabase.from("sessions").select("id,ip_address,mac_address,started_at,bytes_in,bytes_out").eq("customer_id", cust.id).is("ended_at", null).order("started_at", { ascending: false }).limit(5)
				]);
				setSubscription(subRes.data ?? null);
				setPayments(payRes.data ?? []);
				setTickets(tickRes.data ?? []);
				setSessions(sesRes.data ?? []);
				const days = Array.from({ length: 7 }, (_, i) => {
					const d = /* @__PURE__ */ new Date();
					d.setDate(d.getDate() - (6 - i));
					return d;
				});
				const { data: allSessions } = await supabase.from("sessions").select("started_at,bytes_in,bytes_out").eq("customer_id", cust.id).gte("started_at", days[0].toISOString());
				setUsageChart(days.map((d) => ({
					day: d.toLocaleDateString("en-KE", { weekday: "short" }),
					mb: (allSessions ?? []).filter((s) => new Date(s.started_at).toDateString() === d.toDateString()).reduce((acc, s) => acc + (s.bytes_in ?? 0) + (s.bytes_out ?? 0), 0) / 1048576
				})));
			} catch (e) {
				setError(e.message);
			} finally {
				setLoading(false);
			}
		})();
	}, [token, isp]);
	async function restartSession() {
		if (!sessions[0] || !tenantId) return;
		setActionLoading("restart");
		try {
			await supabase.from("sessions").update({ ended_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", sessions[0].id);
			setSessions((s) => s.filter((_, i) => i !== 0));
		} finally {
			setActionLoading("");
		}
	}
	async function submitTicket() {
		if (!ticketSubject || !customer || !tenantId) return;
		setTicketSending(true);
		try {
			await supabase.from("tickets").insert({
				tenant_id: tenantId,
				customer_id: customer.id,
				subject: ticketSubject,
				description: ticketDesc,
				type: "support",
				priority: "medium",
				status: "open"
			});
			setTicketSent(true);
			setTicketSubject("");
			setTicketDesc("");
			const { data } = await supabase.from("tickets").select("id,ticket_no,subject,priority,status,created_at").eq("customer_id", customer.id).order("created_at", { ascending: false }).limit(10);
			setTickets(data ?? []);
		} finally {
			setTicketSending(false);
		}
	}
	const primary = brand.primary_color ?? "#0ea5e9";
	const heroCta = subscription ? "Renew or upgrade instantly" : "Purchase a package to get online";
	if (loading) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(LoaderCircle, { className: "h-8 w-8 animate-spin text-white/60" })
	});
	if (error) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center px-4",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "text-center max-w-sm",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(CircleAlert, { className: "h-12 w-12 text-red-400 mx-auto mb-4" }),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
					className: "text-white font-bold text-lg mb-2",
					children: "Access Error"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "text-slate-400 text-sm mb-4",
					children: error
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("a", {
					href: `/portal?isp=${isp ?? ""}`,
					className: "inline-flex items-center gap-2 text-sm text-primary hover:underline",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ArrowLeft, { className: "h-4 w-4" }), " Back to Portal"]
				})
			]
		})
	});
	const days = subscription ? daysLeft(subscription.expires_at) : 0;
	const pkg = subscription?.packages;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", {
			className: "sticky top-0 z-20 border-b border-white/10 bg-black/40 backdrop-blur-xl px-4 py-3 flex items-center justify-between",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex items-center gap-3",
				children: [brand.logo_url ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
					src: brand.logo_url,
					alt: "logo",
					className: "h-8 w-auto object-contain"
				}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "grid h-8 w-8 place-items-center rounded-lg bg-primary text-primary-foreground",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Wifi, { className: "h-4 w-4" })
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "font-semibold text-sm",
					children: brand.company_name ?? "My Account"
				}), customer && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "text-xs text-slate-400",
					children: customer.full_name
				})] })]
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				className: `rounded-full px-2 py-0.5 text-xs font-medium ${customer?.status === "active" ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}`,
				children: customer?.status ?? ""
			})]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "max-w-lg mx-auto px-4 py-6 space-y-4 pb-24",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "rounded-2xl p-5 space-y-3",
					style: {
						background: `linear-gradient(135deg, ${primary}33, ${primary}11)`,
						border: `1px solid ${primary}44`
					},
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex items-center justify-between",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "text-xs text-slate-400 uppercase tracking-wide",
							children: "Active Plan"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Package, { className: "h-4 w-4 text-slate-400" })]
					}), subscription && pkg ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "text-xl font-bold",
							children: pkg.name
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "text-sm text-slate-400",
							children: heroCta
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "grid grid-cols-3 gap-3",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "rounded-xl bg-white/5 p-3 text-center",
									children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Clock, { className: "h-4 w-4 mx-auto mb-1 text-yellow-400" }),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
											className: `text-lg font-bold ${days <= 3 ? "text-red-400" : "text-white"}`,
											children: days
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
											className: "text-[10px] text-slate-400",
											children: "Days Left"
										})
									]
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "rounded-xl bg-white/5 p-3 text-center",
									children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Zap, { className: "h-4 w-4 mx-auto mb-1 text-blue-400" }),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
											className: "text-lg font-bold",
											children: speedLabel(pkg.speed_down_kbps)
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
											className: "text-[10px] text-slate-400",
											children: "Download"
										})
									]
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "rounded-xl bg-white/5 p-3 text-center",
									children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Database, { className: "h-4 w-4 mx-auto mb-1 text-green-400" }),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
											className: "text-lg font-bold",
											children: pkg.data_limit_mb ? fmtBytes(pkg.data_limit_mb * 1024 * 1024) : "∞"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
											className: "text-[10px] text-slate-400",
											children: "Data Cap"
										})
									]
								})
							]
						}),
						days <= 3 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "rounded-xl bg-red-500/15 border border-red-500/30 px-3 py-2 text-xs text-red-400 flex items-center gap-2",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(CircleAlert, { className: "h-3.5 w-3.5 shrink-0" }),
								"Your plan expires in ",
								days,
								" day",
								days !== 1 ? "s" : "",
								". Renew now to stay connected."
							]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "text-xs text-slate-400",
							children: ["Expires: ", new Date(subscription.expires_at).toLocaleDateString("en-KE", { dateStyle: "full" })]
						})
					] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "text-slate-400 text-sm py-2",
						children: "No active subscription. Purchase a plan to connect."
					})]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "grid grid-cols-3 gap-2",
					children: [
						{
							icon: RefreshCw,
							label: "Renew",
							href: `/portal?isp=${isp}&token=${token}`
						},
						{
							icon: TrendingUp,
							label: "Upgrade",
							href: `/portal?isp=${isp}&token=${token}`
						},
						{
							icon: Phone,
							label: "Support",
							action: () => setTab("support")
						}
					].map((a) => a.href ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("a", {
						href: a.href,
						className: "flex flex-col items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 py-3 text-xs font-medium hover:bg-white/10 transition",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(a.icon, { className: "h-5 w-5 text-primary" }), a.label]
					}, a.label) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
						onClick: a.action,
						className: "flex flex-col items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 py-3 text-xs font-medium hover:bg-white/10 transition",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(a.icon, { className: "h-5 w-5 text-primary" }), a.label]
					}, a.label))
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "flex gap-1 rounded-xl bg-white/5 p-1",
					children: [
						"overview",
						"payments",
						"tickets",
						"support"
					].map((t) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						onClick: () => setTab(t),
						className: `flex-1 rounded-lg py-1.5 text-xs font-medium capitalize transition ${tab === t ? "bg-primary text-primary-foreground" : "text-slate-400 hover:text-white"}`,
						children: t
					}, t))
				}),
				tab === "overview" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "space-y-4",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "rounded-2xl border border-white/10 bg-white/5 p-4",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "text-sm font-semibold mb-3",
								children: "Data Usage — Last 7 Days"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ResponsiveContainer, {
								width: "100%",
								height: 100,
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(AreaChart, {
									data: usageChart,
									margin: {
										top: 0,
										right: 0,
										bottom: 0,
										left: 0
									},
									children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("defs", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("linearGradient", {
											id: "ug",
											x1: "0",
											y1: "0",
											x2: "0",
											y2: "1",
											children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("stop", {
												offset: "5%",
												stopColor: primary,
												stopOpacity: .4
											}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("stop", {
												offset: "95%",
												stopColor: primary,
												stopOpacity: 0
											})]
										}) }),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(XAxis, {
											dataKey: "day",
											tick: {
												fontSize: 10,
												fill: "#94a3b8"
											},
											axisLine: false,
											tickLine: false
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Tooltip, {
											formatter: (v) => [`${Number(v).toFixed(1)} MB`, "Usage"],
											contentStyle: {
												background: "#1e293b",
												border: "1px solid #334155",
												borderRadius: 8,
												fontSize: 11
											}
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Area, {
											type: "monotone",
											dataKey: "mb",
											stroke: primary,
											strokeWidth: 2,
											fill: "url(#ug)"
										})
									]
								})
							})]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "rounded-2xl border border-white/10 bg-white/5 p-4",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "flex items-center justify-between mb-3",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
										className: "text-sm font-semibold",
										children: "Active Sessions"
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Activity, { className: "h-4 w-4 text-slate-400" })]
								}),
								sessions.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
									className: "text-xs text-slate-400 py-2",
									children: "No active sessions."
								}) : sessions.map((s) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "flex items-center justify-between rounded-lg bg-white/5 px-3 py-2 text-xs mb-1",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
										className: "font-mono text-slate-300",
										children: s.ip_address ?? "—"
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "text-slate-500",
										children: [
											s.mac_address ?? "",
											" · ",
											new Date(s.started_at).toLocaleTimeString()
										]
									})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "text-right",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
											className: "text-green-400",
											children: ["↓ ", fmtBytes(s.bytes_in ?? 0)]
										}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
											className: "text-blue-400",
											children: ["↑ ", fmtBytes(s.bytes_out ?? 0)]
										})]
									})]
								}, s.id)),
								sessions.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
									onClick: restartSession,
									disabled: actionLoading === "restart",
									className: "mt-2 w-full rounded-lg border border-white/10 py-2 text-xs text-slate-400 hover:text-white hover:border-white/30 transition flex items-center justify-center gap-2",
									children: [actionLoading === "restart" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(LoaderCircle, { className: "h-3.5 w-3.5 animate-spin" }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(RefreshCw, { className: "h-3.5 w-3.5" }), "Restart Session"]
								})
							]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "rounded-2xl border border-white/10 bg-white/5 p-4 space-y-2",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "text-sm font-semibold mb-2",
								children: "Account Details"
							}), [
								["Customer No", customer?.customer_no ?? customer?.id.slice(0, 8)],
								["Phone", customer?.phone],
								["Email", customer?.email ?? "—"],
								["Status", customer?.status]
							].map(([k, v]) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "flex justify-between text-xs",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "text-slate-400",
									children: k
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "font-medium capitalize",
									children: v
								})]
							}, k))]
						})
					]
				}),
				tab === "payments" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "space-y-2",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "text-sm font-semibold px-1",
						children: "Payment History"
					}), payments.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "rounded-2xl border border-white/10 bg-white/5 p-8 text-center text-slate-400 text-sm",
						children: "No payments yet."
					}) : payments.map((p) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "rounded-xl border border-white/10 bg-white/5 px-4 py-3 flex items-center justify-between",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "text-sm font-semibold text-green-400",
								children: ["KES ", Number(p.amount).toLocaleString()]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "text-xs text-slate-400 capitalize",
								children: [
									p.method,
									" · ",
									new Date(p.created_at).toLocaleDateString()
								]
							}),
							p.mpesa_receipt && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "text-xs font-mono text-slate-500",
								children: p.mpesa_receipt
							})
						] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex items-center gap-2",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: `rounded-full px-2 py-0.5 text-[10px] capitalize ${p.status === "completed" ? "bg-green-500/20 text-green-400" : "bg-yellow-500/20 text-yellow-400"}`,
								children: p.status
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
								title: "Download receipt",
								className: "text-slate-500 hover:text-white",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Download, { className: "h-4 w-4" })
							})]
						})]
					}, p.id))]
				}),
				tab === "tickets" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "space-y-2",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "text-sm font-semibold px-1",
						children: "My Support Tickets"
					}), tickets.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "rounded-2xl border border-white/10 bg-white/5 p-8 text-center text-slate-400 text-sm",
						children: "No tickets. Use the Support tab to open one."
					}) : tickets.map((t) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "rounded-xl border border-white/10 bg-white/5 px-4 py-3",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "flex items-center justify-between mb-1",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "font-mono text-xs text-slate-400",
									children: t.ticket_no
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: `rounded-full px-2 py-0.5 text-[10px] capitalize ${t.status === "open" ? "bg-blue-500/20 text-blue-400" : t.status === "resolved" ? "bg-green-500/20 text-green-400" : "bg-yellow-500/20 text-yellow-400"}`,
									children: t.status
								})]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "text-sm font-medium",
								children: t.subject
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "text-xs text-slate-400 mt-0.5",
								children: new Date(t.created_at).toLocaleDateString()
							})
						]
					}, t.id))]
				}),
				tab === "support" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "space-y-4",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "rounded-2xl border border-white/10 bg-white/5 p-5 space-y-4",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
									className: "text-sm font-semibold",
									children: "Open a Support Ticket"
								}),
								ticketSent && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "rounded-xl bg-green-500/15 border border-green-500/30 px-3 py-2 text-sm text-green-400 flex items-center gap-2",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(CircleCheckBig, { className: "h-4 w-4" }), " Ticket submitted! We'll get back to you soon."]
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
									className: "w-full rounded-xl border border-white/10 bg-white/10 px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-primary",
									placeholder: "Subject",
									value: ticketSubject,
									onChange: (e) => setTicketSubject(e.target.value)
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("textarea", {
									className: "w-full rounded-xl border border-white/10 bg-white/10 px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-primary resize-none",
									placeholder: "Describe your issue...",
									rows: 4,
									value: ticketDesc,
									onChange: (e) => setTicketDesc(e.target.value)
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
									onClick: submitTicket,
									disabled: !ticketSubject || ticketSending,
									className: "w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50 flex items-center justify-center gap-2",
									children: [ticketSending ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(LoaderCircle, { className: "h-4 w-4 animate-spin" }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Ticket, { className: "h-4 w-4" }), "Submit Ticket"]
								})
							]
						}),
						brand.support_phone && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("a", {
							href: `tel:${brand.support_phone}`,
							className: "flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-5 py-4 hover:bg-white/10 transition",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "text-sm font-semibold",
								children: "Call Support"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "text-xs text-slate-400",
								children: brand.support_phone
							})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ChevronRight, { className: "h-5 w-5 text-slate-400" })]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("a", {
							href: `https://wa.me/${(brand.support_phone ?? "").replace(/\D/g, "")}`,
							target: "_blank",
							rel: "noreferrer",
							className: "flex items-center justify-between rounded-2xl border border-green-500/30 bg-green-500/10 px-5 py-4 hover:bg-green-500/20 transition",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "text-sm font-semibold text-green-400",
								children: "WhatsApp Support"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "text-xs text-slate-400",
								children: "Chat with us on WhatsApp"
							})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ChevronRight, { className: "h-5 w-5 text-green-400" })]
						})
					]
				})
			]
		})]
	});
}
//#endregion
export { CustomerPortal as component };
