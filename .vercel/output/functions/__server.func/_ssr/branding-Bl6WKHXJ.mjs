import { i as __toESM } from "../_runtime.mjs";
import { a as supabase, i as init_client } from "./client-D3kKP_Nv.mjs";
import { u as require_react } from "../_libs/@floating-ui/react-dom+[...].mjs";
import { s as require_jsx_runtime } from "../_libs/@radix-ui/react-arrow+[...].mjs";
import { n as useQuery } from "../_libs/tanstack__react-query.mjs";
import { a as useTenantId } from "./auth-z02iFWqz.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/branding-Bl6WKHXJ.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
/**
* BrandingProvider — per-tenant CSS variable injection + branding context.
* Reads tenant_branding from Supabase and applies colors to :root automatically.
*/
init_client();
var BrandingCtx = (0, import_react.createContext)({});
var useBranding = () => (0, import_react.useContext)(BrandingCtx);
function normalizeBrandConfig(config) {
	if (!config) return {};
	if (typeof config === "string") try {
		return JSON.parse(config);
	} catch {
		return {};
	}
	return config;
}
function buildBrandingCssProperties(b) {
	const theme = normalizeBrandConfig(b.brand_config);
	const light = theme.light_theme_colors ?? {};
	const dark = theme.dark_theme_colors ?? {};
	const typography = theme.typography ?? {};
	const loginScreen = theme.login_screen ?? {};
	const dashboardTheme = theme.dashboard_theme ?? {};
	const css = {};
	const set = (value, prop) => {
		if (value) css[prop] = value;
	};
	set(b.primary_color, "--primary");
	set(b.secondary_color, "--secondary");
	set(b.accent_color, "--accent");
	set(b.success_color, "--success");
	set(b.warning_color, "--warning");
	set(b.error_color, "--destructive");
	if (b.primary_color) css["--sidebar-primary"] = b.primary_color;
	set(light.primary, "--color-primary");
	set(light.secondary, "--color-secondary");
	set(light.accent, "--color-accent");
	set(light.background, "--background");
	set(light.card, "--card");
	set(light.text, "--foreground");
	set(dark.background, "--background-dark");
	set(dark.card, "--card-dark");
	set(dark.text, "--foreground-dark");
	if (!css["--background"] && dark.background) css["--background"] = dark.background;
	if (!css["--card"] && dark.card) css["--card"] = dark.card;
	if (!css["--foreground"] && dark.text) css["--foreground"] = dark.text;
	set(typography.font_family, "--font-sans");
	set(typography.heading_font, "--font-heading");
	set(typography.body_font, "--font-body");
	set(loginScreen.background, "--login-bg");
	set(loginScreen.card, "--login-card");
	set(loginScreen.text, "--login-text");
	set(dashboardTheme.background, "--dashboard-background");
	set(dashboardTheme.card, "--dashboard-card");
	set(dashboardTheme.text, "--dashboard-text");
	return css;
}
function applyColors(b) {
	const r = document.documentElement;
	const css = buildBrandingCssProperties(b);
	Object.entries(css).forEach(([prop, value]) => r.style.setProperty(prop, value));
	let style = document.getElementById("tenant-css-overrides");
	if (b.css_overrides) {
		if (!style) {
			style = document.createElement("style");
			style.id = "tenant-css-overrides";
			document.head.appendChild(style);
		}
		style.textContent = b.css_overrides;
	} else if (style) style.textContent = "";
	if (b.favicon_url) {
		const link = document.querySelector("link[rel='icon']");
		if (link) link.href = b.favicon_url;
	}
}
function BrandingProvider({ children }) {
	const { data: tenantId } = useTenantId();
	const { data: brand } = useQuery({
		queryKey: ["tenant-branding", tenantId],
		queryFn: async () => {
			if (!tenantId) return {};
			const { data } = await supabase.from("tenant_branding").select("*").eq("tenant_id", tenantId).maybeSingle();
			return data ?? {};
		},
		enabled: !!tenantId,
		staleTime: 6e4
	});
	(0, import_react.useEffect)(() => {
		if (brand) applyColors(brand);
	}, [brand]);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(BrandingCtx.Provider, {
		value: brand ?? {},
		children
	});
}
async function saveBranding(tenantId, data) {
	const { error } = await supabase.from("tenant_branding").upsert({
		...data,
		tenant_id: tenantId
	}, { onConflict: "tenant_id" });
	if (error) throw error;
}
//#endregion
export { saveBranding as n, useBranding as r, BrandingProvider as t };
