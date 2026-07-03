import { i as __toESM } from "../_runtime.mjs";
import { a as supabase, i as init_client } from "./client-D3kKP_Nv.mjs";
import { u as require_react } from "../_libs/@floating-ui/react-dom+[...].mjs";
import { t as QueryClient } from "../_libs/tanstack__query-core.mjs";
import { s as require_jsx_runtime } from "../_libs/@radix-ui/react-arrow+[...].mjs";
import { r as QueryClientProvider } from "../_libs/tanstack__react-query.mjs";
import { t as Toaster } from "../_libs/sonner.mjs";
import { a as objectType, i as literalType, n as coerce, o as stringType, r as enumType, t as booleanType } from "../_libs/zod.mjs";
import { c as HeadContent, d as createRouter, f as Outlet, h as createRootRouteWithContext, j as redirect, m as createFileRoute, p as lazyRouteComponent, s as Scripts, y as useRouter } from "../_libs/@tanstack/react-router+[...].mjs";
import { t as Route$28 } from "./auth-DjMDBomL.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/router-DPXhYMhC.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
var styles_default = "/assets/styles-CSaFR6vs.css";
function reportLovableError(error, context = {}) {
	if (typeof window === "undefined") return;
	window.__lovableEvents?.captureException?.(error, {
		source: "react_error_boundary",
		route: window.location.pathname,
		...context
	}, {
		mechanism: "react_error_boundary",
		handled: false,
		severity: "error"
	});
}
init_client();
function NotFoundComponent() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "flex min-h-screen items-center justify-center bg-background px-4",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "max-w-md text-center",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
					className: "text-7xl font-bold text-gradient",
					children: "404"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
					className: "mt-4 text-xl font-semibold",
					children: "Signal lost"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-2 text-sm text-muted-foreground",
					children: "That route isn't on the SmartLinkNet grid."
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("a", {
					href: "/",
					className: "mt-6 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90",
					children: "Go home"
				})
			]
		})
	});
}
function ErrorComponent({ error, reset }) {
	const router = useRouter();
	(0, import_react.useEffect)(() => {
		reportLovableError(error, { boundary: "tanstack_root_error_component" });
	}, [error]);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "flex min-h-screen items-center justify-center bg-background px-4",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "max-w-md text-center",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
					className: "text-xl font-semibold",
					children: "This page didn't load"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-2 text-sm text-muted-foreground",
					children: error.message
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mt-6 flex justify-center gap-2",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						onClick: () => {
							router.invalidate();
							reset();
						},
						className: "rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground",
						children: "Try again"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("a", {
						href: "/",
						className: "rounded-md border border-input px-4 py-2 text-sm font-medium hover:bg-accent",
						children: "Go home"
					})]
				})
			]
		})
	});
}
var Route$27 = createRootRouteWithContext()({
	head: () => ({
		meta: [
			{ charSet: "utf-8" },
			{
				name: "viewport",
				content: "width=device-width, initial-scale=1"
			},
			{ title: "SmartLinkNet — ISP & Network Management Platform" },
			{
				name: "description",
				content: "Enterprise-grade ISP, Hotspot, PPPoE, Fiber, Billing, CRM, Inventory, and Support platform for Kenyan internet providers."
			},
			{
				name: "author",
				content: "SmartLinkNet"
			},
			{
				property: "og:title",
				content: "SmartLinkNet — ISP Management Platform"
			},
			{
				property: "og:description",
				content: "All-in-one platform for ISPs, WISPs, and hotspot operators in Kenya."
			},
			{
				property: "og:type",
				content: "website"
			},
			{
				name: "twitter:card",
				content: "summary_large_image"
			}
		],
		links: [
			{
				rel: "stylesheet",
				href: styles_default
			},
			{
				rel: "preconnect",
				href: "https://rsms.me"
			},
			{
				rel: "stylesheet",
				href: "https://rsms.me/inter/inter.css"
			},
			{
				rel: "manifest",
				href: "/manifest.json"
			},
			{
				rel: "icon",
				href: "/favicon.ico"
			},
			{
				rel: "apple-touch-icon",
				href: "/icon-192.png"
			}
		]
	}),
	shellComponent: RootShell,
	component: RootComponent,
	notFoundComponent: NotFoundComponent,
	errorComponent: ErrorComponent
});
function RootShell({ children }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("html", {
		lang: "en",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("head", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(HeadContent, {}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("script", { dangerouslySetInnerHTML: { __html: `(function(){var t=localStorage.getItem('theme');if(t==='light'){document.documentElement.classList.remove('dark')}else{document.documentElement.classList.add('dark')}})()` } })] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("body", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(QueryClientProvider, {
			client: queryClient,
			children
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Scripts, {})] })]
	});
}
function RootComponent() {
	const { queryClient: qc } = Route$27.useRouteContext();
	const router = useRouter();
	(0, import_react.useEffect)(() => {
		const { data: sub } = supabase.auth.onAuthStateChange((event) => {
			if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
			router.invalidate();
			if (event !== "SIGNED_OUT") qc.invalidateQueries();
		});
		if (typeof window !== "undefined" && "serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
		return () => sub.subscription.unsubscribe();
	}, [router, qc]);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Outlet, {}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Toaster, {
		theme: "system",
		position: "top-right",
		richColors: true
	})] });
}
init_client();
var $$splitComponentImporter$26 = () => import("./route-Bb4LvvG2.mjs");
var Route$26 = createFileRoute("/_authenticated")({
	ssr: false,
	beforeLoad: async ({ location }) => {
		const { data, error } = await supabase.auth.getUser();
		if (error || !data.user) throw redirect({
			to: "/auth",
			search: { redirect: location.href }
		});
		return { user: data.user };
	},
	component: lazyRouteComponent($$splitComponentImporter$26, "component")
});
var $$splitComponentImporter$25 = () => import("./routes-oe-bGC0Q.mjs");
var Route$25 = createFileRoute("/")({
	head: () => ({ meta: [
		{ title: "SmartLinkNet — ISP, Hotspot & Fiber Management for Kenya" },
		{
			name: "description",
			content: "Run your ISP from one platform: MikroTik, Hotspot, PPPoE, M-Pesa billing, CRM, support, inventory, and field operations."
		},
		{
			property: "og:title",
			content: "SmartLinkNet — ISP & Network Management Platform"
		},
		{
			property: "og:description",
			content: "Built for Kenyan ISPs, WISPs, fiber operators, hotels, schools, and estates."
		}
	] }),
	component: lazyRouteComponent($$splitComponentImporter$25, "component")
});
/**
* Public Captive Portal — /portal?isp=<slug>
* Supports: voucher login, OTP/phone login, package purchase + M-Pesa STK push.
* Works for MikroTik Hotspot, Apartment WiFi, Hotel, School, Estate, WISP.
*/
var $$splitComponentImporter$24 = () => import("./portal-DO57YAt9.mjs");
var searchSchema$1 = objectType({
	isp: stringType().optional(),
	mac: stringType().optional(),
	ip: stringType().optional(),
	url: stringType().optional()
});
var Route$24 = createFileRoute("/portal/")({
	ssr: false,
	validateSearch: (s) => searchSchema$1.parse(s),
	component: lazyRouteComponent($$splitComponentImporter$24, "component"),
	head: () => ({ meta: [{ title: "Connect to WiFi" }] })
});
/**
* Customer Self-Service Portal — /my-account?token=<token>&isp=<slug>
* Subscribers can view their plan, usage, payments, tickets and take actions.
*/
var $$splitComponentImporter$23 = () => import("./my-account-DxEeITNJ.mjs");
var searchSchema = objectType({
	token: stringType().optional(),
	isp: stringType().optional()
});
var Route$23 = createFileRoute("/my-account/")({
	ssr: false,
	validateSearch: (s) => searchSchema.parse(s),
	component: lazyRouteComponent($$splitComponentImporter$23, "component"),
	head: () => ({ meta: [{ title: "My Account — SmartLinkNet" }] })
});
var $$splitComponentImporter$22 = () => import("./dashboard-CPmUQW8a.mjs");
var Route$22 = createFileRoute("/_authenticated/dashboard")({ component: lazyRouteComponent($$splitComponentImporter$22, "component") });
var $$splitComponentImporter$21 = () => import("./admin-B4Cn0YwN.mjs");
var Route$21 = createFileRoute("/_authenticated/admin")({ component: lazyRouteComponent($$splitComponentImporter$21, "component") });
var $$splitComponentImporter$20 = () => import("./wallet-BB7qS3hG.mjs");
var Route$20 = createFileRoute("/_authenticated/wallet/")({ component: lazyRouteComponent($$splitComponentImporter$20, "component") });
var $$splitComponentImporter$19 = () => import("./vouchers-B8WQOfd0.mjs");
var Route$19 = createFileRoute("/_authenticated/vouchers/")({ component: lazyRouteComponent($$splitComponentImporter$19, "component") });
var $$splitComponentImporter$18 = () => import("./technicians-C9SnL8eY.mjs");
var Route$18 = createFileRoute("/_authenticated/technicians/")({ component: lazyRouteComponent($$splitComponentImporter$18, "component") });
objectType({
	full_name: stringType().min(2),
	email: stringType().email().optional().or(literalType("")),
	phone: stringType().min(9),
	national_id: stringType().optional(),
	role: stringType().min(1).default("field_technician"),
	is_active: booleanType().default(true)
});
var $$splitComponentImporter$17 = () => import("./support-CkIPpWWj.mjs");
var Route$17 = createFileRoute("/_authenticated/support/")({ component: lazyRouteComponent($$splitComponentImporter$17, "component") });
objectType({
	subject: stringType().min(3),
	description: stringType().optional(),
	type: stringType().min(1).default("support"),
	priority: stringType().min(1).default("medium"),
	customer_id: stringType().optional(),
	sla_hours: coerce.number().min(1).default(24)
});
var $$splitComponentImporter$16 = () => import("./settings-DPzQU1Uu.mjs");
var Route$16 = createFileRoute("/_authenticated/settings/")({ component: lazyRouteComponent($$splitComponentImporter$16, "component") });
var $$splitComponentImporter$15 = () => import("./routers-CcZgWHp0.mjs");
var Route$15 = createFileRoute("/_authenticated/routers/")({ component: lazyRouteComponent($$splitComponentImporter$15, "component") });
objectType({
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
var $$splitComponentImporter$14 = () => import("./reports-CP5w17g7.mjs");
var Route$14 = createFileRoute("/_authenticated/reports/")({ component: lazyRouteComponent($$splitComponentImporter$14, "component") });
var $$splitComponentImporter$13 = () => import("./provisioning-CbpE3VNA.mjs");
var Route$13 = createFileRoute("/_authenticated/provisioning/")({ component: lazyRouteComponent($$splitComponentImporter$13, "component") });
var $$splitComponentImporter$12 = () => import("./pppoe-I0CmZZ-f.mjs");
var Route$12 = createFileRoute("/_authenticated/pppoe/")({ component: lazyRouteComponent($$splitComponentImporter$12, "component") });
objectType({
	customer_id: stringType().min(1),
	package_id: stringType().min(1),
	router_id: stringType().optional(),
	username: stringType().min(1),
	password: stringType().min(1),
	ip_address: stringType().optional(),
	auto_renew: booleanType().default(false)
});
/**
* Portal Manager — ISP admin view to configure captive portal branding,
* packages, and generate the portal URL for MikroTik / RADIUS.
*/
var $$splitComponentImporter$11 = () => import("./portal-manager-0n-qJWkn.mjs");
var Route$11 = createFileRoute("/_authenticated/portal-manager/")({ component: lazyRouteComponent($$splitComponentImporter$11, "component") });
var $$splitComponentImporter$10 = () => import("./packages-dZYhR_Ut.mjs");
var Route$10 = createFileRoute("/_authenticated/packages/")({ component: lazyRouteComponent($$splitComponentImporter$10, "component") });
objectType({
	name: stringType().min(1),
	description: stringType().optional(),
	type: stringType().min(1).default("hotspot"),
	billing_type: stringType().min(1).default("prepaid"),
	duration_days: coerce.number().min(1).default(30),
	price: coerce.number().min(0),
	speed_down_kbps: coerce.number().min(1).default(1024),
	speed_up_kbps: coerce.number().min(1).default(512),
	data_limit_mb: coerce.number().optional().nullable(),
	is_active: booleanType().default(true)
});
var $$splitComponentImporter$9 = () => import("./noc-BxhKDwvI.mjs");
var Route$9 = createFileRoute("/_authenticated/noc/")({ component: lazyRouteComponent($$splitComponentImporter$9, "component") });
/**
* Marketing & Sales Platform — leads, campaigns, referrals, coupons,
* customer retention, bulk SMS, and win-back campaigns.
*/
var $$splitComponentImporter$8 = () => import("./marketing-B45bL1Oc.mjs");
var Route$8 = createFileRoute("/_authenticated/marketing/")({ component: lazyRouteComponent($$splitComponentImporter$8, "component") });
var $$splitComponentImporter$7 = () => import("./map-DmfK-hpR.mjs");
var Route$7 = createFileRoute("/_authenticated/map/")({ component: lazyRouteComponent($$splitComponentImporter$7, "component") });
var $$splitComponentImporter$6 = () => import("./inventory-CUKZImZJ.mjs");
var Route$6 = createFileRoute("/_authenticated/inventory/")({ component: lazyRouteComponent($$splitComponentImporter$6, "component") });
objectType({
	name: stringType().min(1),
	category: stringType().min(1).default("router"),
	sku: stringType().optional(),
	serial_number: stringType().optional(),
	quantity: coerce.number().min(0).default(0),
	unit_cost: coerce.number().min(0).default(0),
	reorder_level: coerce.number().min(0).default(5),
	location: stringType().optional(),
	status: stringType().min(1).default("available")
});
var $$splitComponentImporter$5 = () => import("./hotspot-CnE_b4ef.mjs");
var Route$5 = createFileRoute("/_authenticated/hotspot/")({ component: lazyRouteComponent($$splitComponentImporter$5, "component") });
var $$splitComponentImporter$4 = () => import("./fiber-Bgaxhshf.mjs");
var Route$4 = createFileRoute("/_authenticated/fiber/")({ component: lazyRouteComponent($$splitComponentImporter$4, "component") });
objectType({
	customer_id: stringType().min(1),
	type: stringType().min(1).default("fiber"),
	address: stringType().min(1),
	scheduled_at: stringType().optional(),
	notes: stringType().optional(),
	cost: coerce.number().min(0).default(0)
});
var $$splitComponentImporter$3 = () => import("./customers-Bt11gOXv.mjs");
var Route$3 = createFileRoute("/_authenticated/customers/")({ component: lazyRouteComponent($$splitComponentImporter$3, "component") });
objectType({
	full_name: stringType().min(2),
	phone: stringType().min(9),
	email: stringType().email().optional().or(literalType("")),
	national_id: stringType().optional(),
	kra_pin: stringType().optional(),
	address: stringType().optional(),
	city: stringType().optional(),
	county: stringType().optional(),
	category: stringType().default("residential"),
	status: stringType().default("active"),
	notes: stringType().optional()
});
var $$splitComponentImporter$2 = () => import("./billing-pfesDkNz.mjs");
var Route$2 = createFileRoute("/_authenticated/billing/")({ component: lazyRouteComponent($$splitComponentImporter$2, "component") });
objectType({
	customer_id: stringType().min(1, "Customer required"),
	amount: coerce.number().min(1, "Amount required"),
	method: stringType().min(1).default("mpesa"),
	phone: stringType().optional(),
	reference: stringType().optional(),
	notes: stringType().optional()
});
objectType({
	customer_id: stringType().min(1),
	description: stringType().min(1),
	amount: coerce.number().min(1),
	due_date: stringType().optional(),
	notes: stringType().optional()
});
objectType({
	category: stringType().min(1),
	description: stringType().min(1),
	amount: coerce.number().min(1),
	date: stringType().min(1).default(() => (/* @__PURE__ */ new Date()).toISOString().split("T")[0])
});
var $$splitComponentImporter$1 = () => import("./automation-DkjTmEim.mjs");
var Route$1 = createFileRoute("/_authenticated/automation/")({ component: lazyRouteComponent($$splitComponentImporter$1, "component") });
var $$splitComponentImporter = () => import("./aaa-DsalFqX2.mjs");
var Route = createFileRoute("/_authenticated/aaa/")({ component: lazyRouteComponent($$splitComponentImporter, "component") });
objectType({
	name: stringType().min(1),
	host: stringType().min(1),
	auth_port: coerce.number().min(1).default(1812),
	acct_port: coerce.number().min(1).default(1813),
	coa_port: coerce.number().min(1).default(3799),
	shared_secret: stringType().min(1),
	protocol: enumType([
		"pap",
		"chap",
		"mschapv2",
		"eap-tls",
		"eap-ttls",
		"peap"
	]).default("mschapv2"),
	role: enumType([
		"primary",
		"secondary",
		"tertiary",
		"backup"
	]).default("primary"),
	is_active: booleanType().default(true),
	timeout_ms: coerce.number().min(100).default(3e3),
	retry_count: coerce.number().min(1).default(3),
	priority: coerce.number().min(1).default(1),
	failover_strategy: enumType([
		"priority",
		"round_robin",
		"least_latency",
		"random"
	]).default("priority")
});
objectType({
	name: stringType().min(1),
	description: stringType().optional(),
	vendor: enumType([
		"mikrotik",
		"cisco",
		"ubiquiti",
		"freeradius",
		"juniper",
		"huawei",
		"generic"
	]).default("mikrotik"),
	nas_identifier: stringType().optional(),
	nas_ip: stringType().optional(),
	shared_secret: stringType().min(1),
	auth_port: coerce.number().min(1).default(1812),
	acct_port: coerce.number().min(1).default(1813),
	coa_port: coerce.number().min(1).default(3799),
	is_active: booleanType().default(true),
	dynamic_vlan_enabled: booleanType().default(false),
	dynamic_profile_enabled: booleanType().default(true),
	dynamic_ip_enabled: booleanType().default(false),
	radius_server_id: stringType().optional().nullable()
});
objectType({
	name: stringType().min(1),
	description: stringType().optional(),
	clientIp: stringType().min(1),
	sharedSecret: stringType().min(1),
	vendor: enumType([
		"mikrotik",
		"cisco",
		"ubiquiti",
		"freeradius",
		"juniper",
		"huawei",
		"generic"
	]).default("generic"),
	isActive: booleanType().default(true)
});
var AuthRoute = Route$28.update({
	id: "/auth",
	path: "/auth",
	getParentRoute: () => Route$27
});
var AuthenticatedRouteRoute = Route$26.update({
	id: "/_authenticated",
	getParentRoute: () => Route$27
});
var IndexRoute = Route$25.update({
	id: "/",
	path: "/",
	getParentRoute: () => Route$27
});
var PortalIndexRoute = Route$24.update({
	id: "/portal/",
	path: "/portal/",
	getParentRoute: () => Route$27
});
var MyAccountIndexRoute = Route$23.update({
	id: "/my-account/",
	path: "/my-account/",
	getParentRoute: () => Route$27
});
var AuthenticatedDashboardRoute = Route$22.update({
	id: "/dashboard",
	path: "/dashboard",
	getParentRoute: () => AuthenticatedRouteRoute
});
var AuthenticatedAdminRoute = Route$21.update({
	id: "/admin",
	path: "/admin",
	getParentRoute: () => AuthenticatedRouteRoute
});
var AuthenticatedWalletIndexRoute = Route$20.update({
	id: "/wallet/",
	path: "/wallet/",
	getParentRoute: () => AuthenticatedRouteRoute
});
var AuthenticatedVouchersIndexRoute = Route$19.update({
	id: "/vouchers/",
	path: "/vouchers/",
	getParentRoute: () => AuthenticatedRouteRoute
});
var AuthenticatedTechniciansIndexRoute = Route$18.update({
	id: "/technicians/",
	path: "/technicians/",
	getParentRoute: () => AuthenticatedRouteRoute
});
var AuthenticatedSupportIndexRoute = Route$17.update({
	id: "/support/",
	path: "/support/",
	getParentRoute: () => AuthenticatedRouteRoute
});
var AuthenticatedSettingsIndexRoute = Route$16.update({
	id: "/settings/",
	path: "/settings/",
	getParentRoute: () => AuthenticatedRouteRoute
});
var AuthenticatedRoutersIndexRoute = Route$15.update({
	id: "/routers/",
	path: "/routers/",
	getParentRoute: () => AuthenticatedRouteRoute
});
var AuthenticatedReportsIndexRoute = Route$14.update({
	id: "/reports/",
	path: "/reports/",
	getParentRoute: () => AuthenticatedRouteRoute
});
var AuthenticatedProvisioningIndexRoute = Route$13.update({
	id: "/provisioning/",
	path: "/provisioning/",
	getParentRoute: () => AuthenticatedRouteRoute
});
var AuthenticatedPppoeIndexRoute = Route$12.update({
	id: "/pppoe/",
	path: "/pppoe/",
	getParentRoute: () => AuthenticatedRouteRoute
});
var AuthenticatedPortalManagerIndexRoute = Route$11.update({
	id: "/portal-manager/",
	path: "/portal-manager/",
	getParentRoute: () => AuthenticatedRouteRoute
});
var AuthenticatedPackagesIndexRoute = Route$10.update({
	id: "/packages/",
	path: "/packages/",
	getParentRoute: () => AuthenticatedRouteRoute
});
var AuthenticatedNocIndexRoute = Route$9.update({
	id: "/noc/",
	path: "/noc/",
	getParentRoute: () => AuthenticatedRouteRoute
});
var AuthenticatedMarketingIndexRoute = Route$8.update({
	id: "/marketing/",
	path: "/marketing/",
	getParentRoute: () => AuthenticatedRouteRoute
});
var AuthenticatedMapIndexRoute = Route$7.update({
	id: "/map/",
	path: "/map/",
	getParentRoute: () => AuthenticatedRouteRoute
});
var AuthenticatedInventoryIndexRoute = Route$6.update({
	id: "/inventory/",
	path: "/inventory/",
	getParentRoute: () => AuthenticatedRouteRoute
});
var AuthenticatedHotspotIndexRoute = Route$5.update({
	id: "/hotspot/",
	path: "/hotspot/",
	getParentRoute: () => AuthenticatedRouteRoute
});
var AuthenticatedFiberIndexRoute = Route$4.update({
	id: "/fiber/",
	path: "/fiber/",
	getParentRoute: () => AuthenticatedRouteRoute
});
var AuthenticatedCustomersIndexRoute = Route$3.update({
	id: "/customers/",
	path: "/customers/",
	getParentRoute: () => AuthenticatedRouteRoute
});
var AuthenticatedBillingIndexRoute = Route$2.update({
	id: "/billing/",
	path: "/billing/",
	getParentRoute: () => AuthenticatedRouteRoute
});
var AuthenticatedAutomationIndexRoute = Route$1.update({
	id: "/automation/",
	path: "/automation/",
	getParentRoute: () => AuthenticatedRouteRoute
});
var AuthenticatedRouteRouteChildren = {
	AuthenticatedAdminRoute,
	AuthenticatedDashboardRoute,
	AuthenticatedAaaIndexRoute: Route.update({
		id: "/aaa/",
		path: "/aaa/",
		getParentRoute: () => AuthenticatedRouteRoute
	}),
	AuthenticatedAutomationIndexRoute,
	AuthenticatedBillingIndexRoute,
	AuthenticatedCustomersIndexRoute,
	AuthenticatedFiberIndexRoute,
	AuthenticatedHotspotIndexRoute,
	AuthenticatedInventoryIndexRoute,
	AuthenticatedMapIndexRoute,
	AuthenticatedMarketingIndexRoute,
	AuthenticatedNocIndexRoute,
	AuthenticatedPackagesIndexRoute,
	AuthenticatedPortalManagerIndexRoute,
	AuthenticatedPppoeIndexRoute,
	AuthenticatedProvisioningIndexRoute,
	AuthenticatedReportsIndexRoute,
	AuthenticatedRoutersIndexRoute,
	AuthenticatedSettingsIndexRoute,
	AuthenticatedSupportIndexRoute,
	AuthenticatedTechniciansIndexRoute,
	AuthenticatedVouchersIndexRoute,
	AuthenticatedWalletIndexRoute
};
var rootRouteChildren = {
	IndexRoute,
	AuthenticatedRouteRoute: AuthenticatedRouteRoute._addFileChildren(AuthenticatedRouteRouteChildren),
	AuthRoute,
	MyAccountIndexRoute,
	PortalIndexRoute
};
var routeTree = Route$27._addFileChildren(rootRouteChildren)._addFileTypes();
var queryClient = new QueryClient();
var getRouter = () => {
	return createRouter({
		routeTree,
		context: { queryClient },
		scrollRestoration: true,
		defaultPreloadStaleTime: 0,
		defaultSsr: true
	});
};
//#endregion
export { getRouter, queryClient };
