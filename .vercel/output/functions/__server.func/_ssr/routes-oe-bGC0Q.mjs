import { s as require_jsx_runtime } from "../_libs/@radix-ui/react-arrow+[...].mjs";
import { A as Router, K as Map, Mt as ArrowRight, N as Receipt, Pt as Activity, _t as CircleCheck, dt as CreditCard, i as Wifi, s as Users, w as ShieldCheck } from "../_libs/lucide-react.mjs";
import { g as Link } from "../_libs/@tanstack/react-router+[...].mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/routes-oe-bGC0Q.js
var import_jsx_runtime = require_jsx_runtime();
function Landing() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "min-h-screen gradient-hero",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Header, {}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Hero, {}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(FeatureGrid, {}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(PricingTeaser, {}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Footer, {})
		]
	});
}
function Header() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("header", {
		className: "sticky top-0 z-40 border-b border-border/60 bg-background/70 backdrop-blur-xl",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "mx-auto flex h-16 max-w-7xl items-center justify-between px-6",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Link, {
					to: "/",
					className: "flex items-center gap-2",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "grid h-8 w-8 place-items-center rounded-md bg-primary text-primary-foreground",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Wifi, { className: "h-4 w-4" })
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
						className: "text-lg font-semibold tracking-tight",
						children: ["SmartLink", /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "text-primary",
							children: "Net"
						})]
					})]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("nav", {
					className: "hidden items-center gap-8 text-sm text-muted-foreground md:flex",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("a", {
						href: "#features",
						className: "hover:text-foreground",
						children: "Features"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("a", {
						href: "#pricing",
						className: "hover:text-foreground",
						children: "Pricing"
					})]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex items-center gap-2",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
						to: "/auth",
						className: "rounded-md px-3 py-2 text-sm hover:bg-accent",
						children: "Sign in"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
						to: "/auth",
						search: { mode: "signup" },
						className: "rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90",
						children: "Start free trial"
					})]
				})
			]
		})
	});
}
function Hero() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
		className: "mx-auto max-w-7xl px-6 pt-20 pb-24 text-center",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mx-auto inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/40 px-3 py-1 text-xs text-muted-foreground",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "h-1.5 w-1.5 animate-pulse rounded-full bg-success" }), "Built for Kenyan ISPs · M-Pesa native · MikroTik ready"]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("h1", {
				className: "mx-auto mt-6 max-w-4xl text-5xl font-bold leading-tight tracking-tight md:text-6xl",
				children: ["The operating system for ", /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "text-gradient",
					children: "internet providers"
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mx-auto mt-6 max-w-2xl text-lg text-muted-foreground",
				children: "Manage hotspots, PPPoE, fiber, billing, CRM, inventory, support, and field ops — across every router, branch, and customer — from one secure cloud platform."
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mt-10 flex flex-wrap justify-center gap-3",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Link, {
					to: "/auth",
					search: { mode: "signup" },
					className: "inline-flex items-center gap-2 rounded-md bg-primary px-5 py-3 text-sm font-medium text-primary-foreground shadow-glow hover:opacity-90",
					children: ["Start 14-day trial ", /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ArrowRight, { className: "h-4 w-4" })]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("a", {
					href: "#features",
					className: "rounded-md border border-input px-5 py-3 text-sm font-medium hover:bg-accent",
					children: "Explore features"
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "mx-auto mt-16 grid max-w-3xl grid-cols-2 gap-6 text-left text-sm text-muted-foreground md:grid-cols-4",
				children: [
					{
						label: "Routers",
						value: "Unlimited"
					},
					{
						label: "Branches",
						value: "Multi-site"
					},
					{
						label: "Payments",
						value: "M-Pesa STK"
					},
					{
						label: "Uptime SLA",
						value: "99.9%"
					}
				].map((s) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "rounded-lg border border-border/60 bg-card/50 p-4",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "text-xs uppercase tracking-wide text-muted-foreground",
						children: s.label
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "mt-1 text-lg font-semibold text-foreground",
						children: s.value
					})]
				}, s.label))
			})
		]
	});
}
var FEATURES = [
	{
		icon: Router,
		title: "MikroTik & PPPoE",
		desc: "Provision profiles, queues and PPPoE users across every router."
	},
	{
		icon: Wifi,
		title: "Hotspot & Vouchers",
		desc: "Captive portals, voucher batches, QR codes and fair-usage policies."
	},
	{
		icon: CreditCard,
		title: "M-Pesa Billing",
		desc: "STK Push, recurring invoices, wallets and auto-reactivation."
	},
	{
		icon: Users,
		title: "CRM & KYC",
		desc: "Customers, KRA PIN, IDs, contracts, notes and lifecycle tracking."
	},
	{
		icon: Activity,
		title: "NOC Monitoring",
		desc: "Live CPU, traffic, uptime and outage alerts for every device."
	},
	{
		icon: Receipt,
		title: "Accounting",
		desc: "Revenue, expenses, P&L and tax-ready reports by branch."
	},
	{
		icon: Map,
		title: "GIS & Field Ops",
		desc: "Map customers, technicians and fiber routes. Schedule jobs."
	},
	{
		icon: ShieldCheck,
		title: "Multi-tenant SaaS",
		desc: "Branding, branches, roles, audit logs and RLS isolation."
	}
];
function FeatureGrid() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("section", {
		id: "features",
		className: "border-t border-border/60 bg-background/40 py-24",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "mx-auto max-w-7xl px-6",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mx-auto max-w-2xl text-center",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
					className: "text-3xl font-bold tracking-tight md:text-4xl",
					children: "Everything an ISP runs on"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-3 text-muted-foreground",
					children: "One platform replaces your billing tool, CRM, NOC dashboard, voucher printer and field tracker."
				})]
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "mt-16 grid gap-4 md:grid-cols-2 lg:grid-cols-4",
				children: FEATURES.map((f) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "group rounded-xl border border-border/60 bg-card/60 p-6 transition hover:border-primary/50 hover:bg-card",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(f.icon, { className: "h-5 w-5" })
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
							className: "mt-4 font-semibold",
							children: f.title
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-2 text-sm text-muted-foreground",
							children: f.desc
						})
					]
				}, f.title))
			})]
		})
	});
}
var PLANS = [
	{
		name: "Starter",
		price: "KES 4,900",
		desc: "Small WISPs and estates",
		features: [
			"Up to 200 customers",
			"2 routers",
			"Hotspot + PPPoE",
			"M-Pesa STK"
		]
	},
	{
		name: "Growth",
		price: "KES 14,900",
		desc: "Growing ISPs",
		features: [
			"Up to 2,000 customers",
			"Unlimited routers",
			"Multi-branch",
			"Field ops + GIS"
		],
		featured: true
	},
	{
		name: "Enterprise",
		price: "Custom",
		desc: "National operators",
		features: [
			"Unlimited everything",
			"SLA + onboarding",
			"Dedicated tenant",
			"SAML SSO"
		]
	}
];
function PricingTeaser() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("section", {
		id: "pricing",
		className: "py-24",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "mx-auto max-w-7xl px-6",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mx-auto max-w-2xl text-center",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
					className: "text-3xl font-bold tracking-tight md:text-4xl",
					children: "Pricing built for Kenya"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-3 text-muted-foreground",
					children: "Pay in KES. Start with a 14-day trial — no card required."
				})]
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "mt-12 grid gap-6 md:grid-cols-3",
				children: PLANS.map((p) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: `rounded-xl border p-8 ${p.featured ? "border-primary bg-card shadow-glow" : "border-border/60 bg-card/60"}`,
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex items-baseline justify-between",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
								className: "text-lg font-semibold",
								children: p.name
							}), p.featured && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "rounded-full bg-primary/15 px-2 py-0.5 text-xs text-primary",
								children: "Popular"
							})]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-1 text-sm text-muted-foreground",
							children: p.desc
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "mt-6 text-3xl font-bold",
							children: [p.price, /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "text-base font-normal text-muted-foreground",
								children: "/mo"
							})]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
							className: "mt-6 space-y-2 text-sm",
							children: p.features.map((f) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
								className: "flex items-start gap-2",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(CircleCheck, { className: "mt-0.5 h-4 w-4 text-success" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: f })]
							}, f))
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
							to: "/auth",
							search: { mode: "signup" },
							className: "mt-8 inline-flex w-full items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90",
							children: "Start trial"
						})
					]
				}, p.name))
			})]
		})
	});
}
function Footer() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("footer", {
		className: "border-t border-border/60 py-10",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-6 text-sm text-muted-foreground md:flex-row",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { children: [
				"© ",
				(/* @__PURE__ */ new Date()).getFullYear(),
				" SmartLinkNet. Made in Nairobi."
			] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex gap-6",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("a", {
						href: "#features",
						className: "hover:text-foreground",
						children: "Features"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("a", {
						href: "#pricing",
						className: "hover:text-foreground",
						children: "Pricing"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
						to: "/auth",
						className: "hover:text-foreground",
						children: "Sign in"
					})
				]
			})]
		})
	});
}
//#endregion
export { Landing as component };
