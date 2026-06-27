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
}

const BrandingCtx = createContext<TenantBrand>({});
export const useBranding = () => useContext(BrandingCtx);

function hexToOklch(hex: string): string {
  // passthrough — CSS supports hex in custom properties directly
  return hex;
}

function applyColors(b: TenantBrand) {
  const r = document.documentElement;
  const set = (v: string | null | undefined, prop: string) => {
    if (v) r.style.setProperty(prop, v);
    else r.style.removeProperty(prop);
  };
  set(b.primary_color, "--primary");
  set(b.secondary_color, "--secondary");
  set(b.accent_color, "--accent");
  set(b.success_color, "--success");
  set(b.warning_color, "--warning");
  set(b.error_color, "--destructive");
  // sidebar inherits primary
  if (b.primary_color) r.style.setProperty("--sidebar-primary", b.primary_color);

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
