/**
 * BrandingProvider — per-tenant CSS variable injection + branding context.
 * Reads tenant_branding from Supabase and applies colors to :root automatically.
 */
import { createContext, useContext, useEffect, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenantId } from "@/lib/auth";

export interface TenantBrand {
  logo_url?: string | null;
  favicon_url?: string | null;
  primary_color?: string | null;
  secondary_color?: string | null;
  accent_color?: string | null;
  success_color?: string | null;
  warning_color?: string | null;
  error_color?: string | null;
  portal_tagline?: string | null;
  support_phone?: string | null;
  support_email?: string | null;
  company_name?: string | null;
  sms_sender_id?: string | null;
  invoice_header?: string | null;
  invoice_footer?: string | null;
  welcome_message?: string | null;
  css_overrides?: string | null;
  portal_bg_color?: string | null;
  portal_text_color?: string | null;
  email_from_name?: string | null;
  email_from_address?: string | null;
  social_links?: Record<string, string> | string | null;
  custom_domain?: string | null;
  domain_verified?: boolean | null;
  brand_config?: {
    light_theme_colors?: Record<string, string>;
    dark_theme_colors?: Record<string, string>;
    typography?: Record<string, string>;
    login_screen?: Record<string, string>;
    dashboard_theme?: Record<string, string>;
  } | null;
}

const BrandingCtx = createContext<TenantBrand>({});
export const useBranding = () => useContext(BrandingCtx);

function normalizeBrandConfig(config: TenantBrand["brand_config"] | string | null | undefined) {
  if (!config) return {};
  if (typeof config === "string") {
    try {
      return JSON.parse(config);
    } catch {
      return {};
    }
  }
  return config;
}

export function buildBrandingCssProperties(b: TenantBrand) {
  const theme = normalizeBrandConfig(b.brand_config);
  const light = theme.light_theme_colors ?? {};
  const dark = theme.dark_theme_colors ?? {};
  const typography = theme.typography ?? {};
  const loginScreen = theme.login_screen ?? {};
  const dashboardTheme = theme.dashboard_theme ?? {};

  const css: Record<string, string> = {};
  const set = (value: string | null | undefined, prop: string) => {
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

function applyColors(b: TenantBrand) {
  const r = document.documentElement;
  const css = buildBrandingCssProperties(b);
  Object.entries(css).forEach(([prop, value]) => r.style.setProperty(prop, value));

  // inject optional CSS overrides
  let style = document.getElementById("tenant-css-overrides") as HTMLStyleElement | null;
  if (b.css_overrides) {
    if (!style) {
      style = document.createElement("style");
      style.id = "tenant-css-overrides";
      document.head.appendChild(style);
    }
    style.textContent = b.css_overrides;
  } else if (style) {
    style.textContent = "";
  }

  // favicon
  if (b.favicon_url) {
    const link = document.querySelector<HTMLLinkElement>("link[rel='icon']");
    if (link) link.href = b.favicon_url;
  }
}

export function BrandingProvider({ children }: { children: ReactNode }) {
  const { data: tenantId } = useTenantId();

  const { data: brand } = useQuery<TenantBrand>({
    queryKey: ["tenant-branding", tenantId],
    queryFn: async () => {
      if (!tenantId) return {};
      const { data } = await (supabase as any)
        .from("tenant_branding")
        .select("*")
        .eq("tenant_id", tenantId)
        .maybeSingle();
      return data ?? {};
    },
    enabled: !!tenantId,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (brand) applyColors(brand);
  }, [brand]);

  return <BrandingCtx.Provider value={brand ?? {}}>{children}</BrandingCtx.Provider>;
}

// ─── Branding save helper ─────────────────────────────────────────────────────
export async function saveBranding(tenantId: string, data: Partial<TenantBrand>) {
  const { error } = await (supabase as any)
    .from("tenant_branding")
    .upsert({ ...data, tenant_id: tenantId }, { onConflict: "tenant_id" });
  if (error) throw error;
}
