import { i as __toESM } from "../_runtime.mjs";
import { a as supabase, i as init_client } from "./client-D3kKP_Nv.mjs";
import { u as require_react } from "../_libs/@floating-ui/react-dom+[...].mjs";
import { s as require_jsx_runtime } from "../_libs/@radix-ui/react-arrow+[...].mjs";
import { i as useQueryClient, n as useQuery } from "../_libs/tanstack__react-query.mjs";
import { i as useAuth, n as fetchProfile, r as signOut, t as fetchMyRoles } from "./auth-z02iFWqz.mjs";
import { $ as Layers, A as Router, At as Bell, Dt as Cable, E as Server, G as Megaphone, H as Network, K as Map, N as Receipt, Ot as Building2, P as QrCode, Pt as Activity, Q as LayoutDashboard, St as ChevronDown, T as Settings, Tt as ChartColumn, U as Moon, V as Package, Y as LogOut, d as TriangleAlert, h as Ticket, i as Wifi, kt as Boxes, n as X, o as Wallet, r as Wrench, s as Users, st as Ellipsis, t as Zap, tt as Globe, v as Sun, w as ShieldCheck } from "../_libs/lucide-react.mjs";
import { n as toast } from "../_libs/sonner.mjs";
import { f as Outlet, g as Link, l as useRouterState, y as useRouter } from "../_libs/@tanstack/react-router+[...].mjs";
import { t as OnboardTenant } from "./OnboardTenant-D5S-QYO4.mjs";
import { r as useBranding, t as BrandingProvider } from "./branding-Bl6WKHXJ.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/route-Bb4LvvG2.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
init_client();
var NAV = [
	{
		to: "/dashboard",
		label: "Dashboard",
		icon: LayoutDashboard
	},
	{
		to: "/admin",
		label: "Tenants",
		icon: ShieldCheck,
		roles: ["super_admin"]
	},
	{
		to: "/customers",
		label: "Customers",
		icon: Users
	},
	{
		to: "/packages",
		label: "Plans",
		icon: Package
	},
	{
		to: "/routers",
		label: "Routers",
		icon: Router
	},
	{
		to: "/aaa",
		label: "Net Auth",
		icon: Server
	},
	{
		to: "/hotspot",
		label: "Hotspot",
		icon: Wifi
	},
	{
		to: "/vouchers",
		label: "Vouchers",
		icon: QrCode
	},
	{
		to: "/pppoe",
		label: "PPPoE",
		icon: Network
	},
	{
		to: "/noc",
		label: "Monitoring",
		icon: Activity
	},
	{
		to: "/fiber",
		label: "Fiber Lines",
		icon: Cable
	},
	{
		to: "/billing",
		label: "Billing",
		icon: Receipt
	},
	{
		to: "/wallet",
		label: "Wallet",
		icon: Wallet
	},
	{
		to: "/inventory",
		label: "Inventory",
		icon: Boxes
	},
	{
		to: "/support",
		label: "Support",
		icon: Ticket
	},
	{
		to: "/technicians",
		label: "Field Team",
		icon: Wrench
	},
	{
		to: "/map",
		label: "Coverage",
		icon: Map
	},
	{
		to: "/reports",
		label: "Reports",
		icon: ChartColumn
	},
	{
		to: "/automation",
		label: "Automation",
		icon: Zap
	},
	{
		to: "/provisioning",
		label: "Provisioning",
		icon: Layers
	},
	{
		to: "/marketing",
		label: "Marketing",
		icon: Megaphone
	},
	{
		to: "/portal-manager",
		label: "Captive Portal",
		icon: Globe
	},
	{
		to: "/settings",
		label: "Settings",
		icon: Settings
	}
];
var BOTTOM_TABS = [
	"/dashboard",
	"/customers",
	"/billing",
	"/settings"
];
var MORE_GROUPS = [
	{
		title: "Network",
		items: [
			"/routers",
			"/aaa",
			"/hotspot",
			"/pppoe",
			"/fiber",
			"/vouchers"
		]
	},
	{
		title: "Operations",
		items: [
			"/noc",
			"/monitoring",
			"/automation",
			"/provisioning",
			"/map"
		]
	},
	{
		title: "Business",
		items: [
			"/packages",
			"/wallet",
			"/inventory",
			"/reports",
			"/marketing"
		]
	},
	{
		title: "Team",
		items: [
			"/technicians",
			"/support",
			"/portal-manager",
			"/admin"
		]
	}
];
function AppShell({ children }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(BrandingProvider, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AppShellInner, { children }) });
}
function AppShellInner({ children }) {
	const { user } = useAuth();
	const router = useRouter();
	const pathname = useRouterState({ select: (s) => s.location.pathname });
	const [darkMode, setDarkMode] = (0, import_react.useState)(() => {
		const saved = localStorage.getItem("theme");
		if (saved) return saved === "dark";
		return true;
	});
	(0, import_react.useEffect)(() => {
		document.documentElement.classList.toggle("dark", darkMode);
		localStorage.setItem("theme", darkMode ? "dark" : "light");
	}, [darkMode]);
	function toggleDark() {
		setDarkMode((d) => !d);
	}
	const profileQuery = useQuery({
		queryKey: ["profile", user?.id],
		queryFn: () => user ? fetchProfile(user.id) : Promise.resolve(null),
		enabled: !!user
	});
	const rolesQuery = useQuery({
		queryKey: ["roles", user?.id],
		queryFn: () => user ? fetchMyRoles(user.id) : Promise.resolve([]),
		enabled: !!user
	});
	const tenantQuery = useQuery({
		queryKey: ["tenant", profileQuery.data?.tenant_id],
		queryFn: async () => {
			const tid = profileQuery.data?.tenant_id;
			if (!tid) return null;
			const { data } = await supabase.from("tenants").select("id, name, slug, plan, status").eq("id", tid).maybeSingle();
			return data;
		},
		enabled: !!profileQuery.data?.tenant_id
	});
	const brand = useBranding();
	const outages = useQuery({
		queryKey: ["active-outages", profileQuery.data?.tenant_id],
		queryFn: async () => {
			const tid = profileQuery.data?.tenant_id;
			if (!tid) return [];
			const { data } = await supabase.from("outages").select("id, title, type, eta").eq("tenant_id", tid).eq("status", "active").limit(1);
			return data ?? [];
		},
		enabled: !!profileQuery.data?.tenant_id,
		refetchInterval: 6e4
	});
	const roles = rolesQuery.data ?? [];
	const isSuperAdmin = roles.includes("super_admin");
	const hasTenantRole = roles.some((r) => r !== "super_admin");
	const visibleNav = NAV.filter((n) => !n.roles || n.roles.some((r) => roles.includes(r)));
	const bottomTabs = visibleNav.filter((n) => BOTTOM_TABS.includes(n.to));
	async function handleSignOut() {
		await signOut();
		toast.success("Signed out");
		router.navigate({
			to: "/auth",
			replace: true
		});
	}
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flex min-h-screen bg-background text-foreground",
		"data-brand-applied": true,
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("aside", {
				className: "hidden md:flex fixed inset-y-0 left-0 z-40 w-64 flex-col border-r border-sidebar-border bg-sidebar",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "flex h-16 shrink-0 items-center border-b border-sidebar-border px-5",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
							to: "/dashboard",
							className: "flex items-center gap-2",
							children: brand.logo_url ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
								src: brand.logo_url,
								alt: "Logo",
								className: "h-8 w-auto max-w-[120px] object-contain"
							}) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "grid h-8 w-8 place-items-center rounded-md bg-primary text-primary-foreground",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Wifi, { className: "h-4 w-4" })
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "font-semibold tracking-tight",
								children: brand.company_name ?? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: ["SmartLink", /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "text-primary",
									children: "Net"
								})] })
							})] })
						})
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("nav", {
						className: "sidebar-scroll flex-1 overflow-y-auto space-y-0.5 px-3 py-4",
						children: visibleNav.map((item) => {
							const active = pathname === item.to || item.to !== "/dashboard" && pathname.startsWith(item.to);
							return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Link, {
								to: item.to,
								className: `group flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-all ${active ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium" : "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"}`,
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(item.icon, { className: `h-4 w-4 shrink-0 ${active ? "text-primary" : "text-muted-foreground group-hover:text-foreground"}` }),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "truncate",
										children: item.label
									}),
									active && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "ml-auto h-1.5 w-1.5 rounded-full bg-primary" })
								]
							}, item.to);
						})
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "shrink-0 border-t border-sidebar-border p-3",
						children: [tenantQuery.data ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "mb-2 rounded-md bg-sidebar-accent/50 p-3",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "flex items-center gap-2 text-xs text-muted-foreground",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Building2, { className: "h-3.5 w-3.5" }), " Workspace"]
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
									className: "mt-0.5 truncate text-sm font-medium",
									children: tenantQuery.data.name
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
									className: "mt-1 inline-flex rounded-full bg-primary/15 px-2 py-0.5 text-[10px] uppercase tracking-wider text-primary",
									children: tenantQuery.data.plan
								})
							]
						}) : isSuperAdmin ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "mb-2 rounded-md bg-primary/10 p-3",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "flex items-center gap-2 text-xs text-primary",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ShieldCheck, { className: "h-3.5 w-3.5" }), " Super Admin"]
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "mt-1 text-sm",
								children: "Platform owner"
							})]
						}) : null, /* @__PURE__ */ (0, import_jsx_runtime.jsx)(UserMenu, {
							profile: profileQuery.data ?? null,
							email: user?.email ?? null,
							onSignOut: handleSignOut
						})]
					})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex flex-1 flex-col md:pl-64 min-w-0 w-0",
				children: [
					(outages.data ?? []).length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex items-center gap-3 bg-destructive/90 px-4 py-2 text-xs text-white",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TriangleAlert, { className: "h-3.5 w-3.5 shrink-0" }),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "font-medium",
								children: outages.data[0].title
							}),
							outages.data[0].eta && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
								className: "opacity-80",
								children: ["· ETA: ", new Date(outages.data[0].eta).toLocaleTimeString()]
							})
						]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", {
						className: "sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border/60 bg-background/80 px-4 backdrop-blur-xl md:h-16 md:px-8",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
								to: "/dashboard",
								className: "flex items-center gap-2 md:hidden",
								children: brand.logo_url ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
									src: brand.logo_url,
									alt: "Logo",
									className: "h-7 w-auto max-w-[100px] object-contain"
								}) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
									className: "grid h-7 w-7 place-items-center rounded-md bg-primary text-primary-foreground",
									children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Wifi, { className: "h-3.5 w-3.5" })
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "font-semibold text-sm tracking-tight",
									children: brand.company_name ?? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: ["SmartLink", /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "text-primary",
										children: "Net"
									})] })
								})] })
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "hidden md:block text-sm text-muted-foreground",
								children: titleFromPath(pathname)
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "flex items-center gap-2",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(NotificationsBell, {
									tenantId: profileQuery.data?.tenant_id ?? null,
									userId: user?.id ?? null
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
									onClick: toggleDark,
									className: "relative flex h-8 w-14 items-center rounded-full border border-border bg-muted px-1 transition-colors hover:border-primary",
									"aria-label": "Toggle theme",
									children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
											className: `absolute flex h-6 w-6 items-center justify-center rounded-full bg-background shadow-sm transition-all duration-300 ${darkMode ? "translate-x-6" : "translate-x-0"}`,
											children: darkMode ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Moon, { className: "h-3.5 w-3.5 text-primary" }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Sun, { className: "h-3.5 w-3.5 text-warning" })
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Sun, { className: `h-3 w-3 text-muted-foreground transition-opacity ${darkMode ? "opacity-0" : "opacity-100"}` }),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Moon, { className: `ml-auto h-3 w-3 text-muted-foreground transition-opacity ${darkMode ? "opacity-100" : "opacity-0"}` })
									]
								})]
							})
						]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("main", {
						className: "flex-1 min-w-0 overflow-hidden px-4 py-4 pb-24 md:px-8 md:py-8 md:pb-8",
						children: profileQuery.isLoading || rolesQuery.isLoading || !user ? null : profileQuery.isError || profileQuery.data === void 0 ? children : profileQuery.data !== null && !profileQuery.data.tenant_id && !isSuperAdmin && !hasTenantRole ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(OnboardTenant, { userId: user.id }) : children
					})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("nav", {
				className: "md:hidden fixed bottom-0 inset-x-0 z-50 flex items-stretch border-t border-border bg-background/95 backdrop-blur-lg",
				children: [bottomTabs.map((item) => {
					const active = pathname === item.to || item.to !== "/dashboard" && pathname.startsWith(item.to);
					return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Link, {
						to: item.to,
						className: `flex flex-1 flex-col items-center justify-center gap-1 py-2 text-[10px] font-medium transition-colors ${active ? "text-primary" : "text-muted-foreground"}`,
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(item.icon, { className: `h-5 w-5 ${active ? "text-primary" : ""}` }), item.label]
					}, item.to);
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(MobileMoreSheet, {
					visibleNav,
					pathname,
					roles,
					onSignOut: handleSignOut,
					profile: profileQuery.data ?? null,
					email: user?.email ?? null
				})]
			})
		]
	});
}
function titleFromPath(p) {
	const seg = p.split("/").filter(Boolean)[0] ?? "dashboard";
	return seg.charAt(0).toUpperCase() + seg.slice(1);
}
function NotificationsBell({ tenantId, userId }) {
	const [open, setOpen] = (0, import_react.useState)(false);
	const qc = useQueryClient();
	const notifications = useQuery({
		queryKey: ["notifications", userId],
		queryFn: async () => {
			const { data } = await supabase.from("notifications").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(20);
			return data ?? [];
		},
		enabled: !!userId,
		refetchInterval: 3e4
	});
	const unread = notifications.data?.filter((n) => !n.read).length ?? 0;
	async function markAllRead() {
		if (!userId) return;
		await supabase.from("notifications").update({ read: true }).eq("user_id", userId).eq("read", false);
		qc.invalidateQueries({ queryKey: ["notifications", userId] });
	}
	const typeColors = {
		info: "bg-blue-500",
		success: "bg-green-500",
		warning: "bg-yellow-500",
		error: "bg-red-500"
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "relative",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
			onClick: () => setOpen((o) => !o),
			className: "relative grid h-8 w-8 place-items-center rounded-md hover:bg-accent text-muted-foreground",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Bell, { className: "h-4 w-4" }), unread > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				className: "absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-primary text-[10px] text-primary-foreground grid place-items-center font-bold",
				children: unread > 9 ? "9+" : unread
			})]
		}), open && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "absolute right-0 top-full mt-2 w-80 rounded-xl border border-border bg-popover shadow-xl z-50",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex items-center justify-between px-4 py-3 border-b border-border",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "font-semibold text-sm",
					children: "Notifications"
				}), unread > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					onClick: markAllRead,
					className: "text-xs text-primary hover:underline",
					children: "Mark all read"
				})]
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "max-h-72 overflow-y-auto",
				children: notifications.data?.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "px-4 py-8 text-center text-sm text-muted-foreground",
					children: "No notifications"
				}) : notifications.data?.map((n) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: `flex gap-3 px-4 py-3 border-b border-border/60 ${n.read ? "opacity-60" : ""}`,
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: `h-2 w-2 rounded-full mt-1.5 shrink-0 ${typeColors[n.type] ?? "bg-muted"}` }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "font-medium text-xs",
							children: n.title
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "text-xs text-muted-foreground mt-0.5",
							children: n.message
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "text-[10px] text-muted-foreground mt-1",
							children: new Date(n.created_at).toLocaleString()
						})
					] })]
				}, n.id))
			})]
		})]
	});
}
function UserMenu({ profile, email, onSignOut }) {
	const [open, setOpen] = (0, import_react.useState)(false);
	const name = profile?.full_name ?? email ?? "Account";
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "relative",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
			onClick: () => setOpen((o) => !o),
			className: "flex w-full items-center gap-2 rounded-md p-2 text-left hover:bg-sidebar-accent",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "grid h-8 w-8 place-items-center rounded-full bg-secondary text-secondary-foreground text-xs font-semibold",
					children: (name || "?").split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase()
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "min-w-0 flex-1",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "truncate text-sm font-medium",
						children: name
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "truncate text-xs text-muted-foreground",
						children: email
					})]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ChevronDown, { className: "h-4 w-4 text-muted-foreground" })
			]
		}), open && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "absolute bottom-full left-0 right-0 mb-2 rounded-md border border-border bg-popover p-1 shadow-lg",
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
				onClick: onSignOut,
				className: "flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-accent",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(LogOut, { className: "h-4 w-4" }), " Sign out"]
			})
		})]
	});
}
function MobileMoreSheet({ visibleNav, pathname, roles, onSignOut, profile, email }) {
	const [open, setOpen] = (0, import_react.useState)(false);
	const navMap = Object.fromEntries(visibleNav.map((n) => [n.to, n]));
	const name = profile?.full_name ?? email ?? "Account";
	const initials = (name || "?").split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase();
	const isMoreActive = ![
		"/dashboard",
		"/customers",
		"/billing",
		"/settings"
	].some((t) => pathname === t || t !== "/dashboard" && pathname.startsWith(t));
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
		onClick: () => setOpen(true),
		className: `flex flex-1 flex-col items-center justify-center gap-1 py-2 text-[10px] font-medium transition-colors ${isMoreActive ? "text-primary" : "text-muted-foreground"}`,
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Ellipsis, { className: `h-5 w-5 ${isMoreActive ? "text-primary" : ""}` }), "More"]
	}), open && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "fixed inset-0 z-[60] flex flex-col justify-end",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "absolute inset-0 bg-black/60 backdrop-blur-sm",
			onClick: () => setOpen(false)
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "relative z-10 rounded-t-2xl border-t border-border bg-background pb-safe",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "flex justify-center pt-3 pb-1",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "h-1 w-10 rounded-full bg-muted-foreground/30" })
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex items-center justify-between px-5 py-3 border-b border-border/60",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "font-semibold text-sm",
						children: "All Sections"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						onClick: () => setOpen(false),
						className: "grid h-7 w-7 place-items-center rounded-full bg-muted text-muted-foreground",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(X, { className: "h-4 w-4" })
					})]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "max-h-[60vh] overflow-y-auto px-4 py-3 space-y-4",
					children: MORE_GROUPS.map((group) => {
						const items = group.items.map((to) => navMap[to]).filter(Boolean);
						if (!items.length) return null;
						return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "mb-2 px-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground",
							children: group.title
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "grid grid-cols-3 gap-2",
							children: items.map((item) => {
								const active = pathname === item.to || item.to !== "/dashboard" && pathname.startsWith(item.to);
								return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Link, {
									to: item.to,
									onClick: () => setOpen(false),
									className: `flex flex-col items-center gap-1.5 rounded-xl px-2 py-3 text-center text-[11px] font-medium transition-colors ${active ? "bg-primary/15 text-primary" : "bg-muted/60 text-foreground hover:bg-muted"}`,
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(item.icon, { className: `h-5 w-5 ${active ? "text-primary" : "text-muted-foreground"}` }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "leading-tight",
										children: item.label
									})]
								}, item.to);
							})
						})] }, group.title);
					})
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "border-t border-border/60 px-4 py-3 flex items-center gap-3",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "grid h-9 w-9 shrink-0 place-items-center rounded-full bg-secondary text-secondary-foreground text-xs font-semibold",
							children: initials
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "min-w-0 flex-1",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "truncate text-sm font-medium",
								children: name
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "truncate text-xs text-muted-foreground",
								children: email
							})]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
							onClick: () => {
								setOpen(false);
								onSignOut();
							},
							className: "flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:border-destructive hover:text-destructive transition-colors",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(LogOut, { className: "h-3.5 w-3.5" }), " Sign out"]
						})
					]
				})
			]
		})]
	})] });
}
var SplitComponent = () => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AppShell, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Outlet, {}) });
//#endregion
export { SplitComponent as component };
