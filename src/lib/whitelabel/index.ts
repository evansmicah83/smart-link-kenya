/**
 * SmartLinkNet — White-Label SaaS Platform
 * Per-tenant branding: logo, colours, custom domain, invoice templates,
 * SMS/email templates, and full tenant isolation.
 */
import { supabase } from "@/integrations/supabase/client";

export interface TenantBranding {
  id?: string;
  tenant_id: string;
  logo_url?: string | null;
  favicon_url?: string | null;
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  custom_domain?: string | null;
  domain_verified?: boolean;
  invoice_header?: string | null;
  invoice_footer?: string | null;
  sms_sender_id?: string | null;
  email_from_name?: string | null;
  email_from_address?: string | null;
  welcome_message?: string | null;
  portal_tagline?: string | null;
  support_phone?: string | null;
  support_email?: string | null;
  social_links?: Record<string, string>;
  css_overrides?: string | null;
}

// ─── Branding CRUD ───────────────────────────────────────────────────────────

export async function getTenantBranding(tenantId: string): Promise<TenantBranding | null> {
  const { data } = await (supabase as any)
    .from("tenant_branding")
    .select("*")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  return data as TenantBranding | null;
}

export async function saveTenantBranding(branding: TenantBranding): Promise<void> {
  const { error } = await (supabase as any)
    .from("tenant_branding")
    .upsert(branding, { onConflict: "tenant_id" });
  if (error) throw error;
}

// ─── Default SMS Templates ───────────────────────────────────────────────────

export const DEFAULT_SMS_TEMPLATES: Record<string, string> = {
  payment_received:
    "Dear {customer_name}, payment of {currency} {amount} received. Receipt: {receipt}. Valid until {expires_at}.",
  subscription_expiry:
    "Dear {customer_name}, your internet subscription expires on {expires_at}. Renew now to avoid interruption.",
  subscription_suspended:
    "Dear {customer_name}, your internet service has been suspended. Contact support or pay your balance.",
  subscription_activated:
    "Dear {customer_name}, your internet service is now active until {expires_at}. Enjoy!",
  welcome:
    "Welcome to {company_name}, {customer_name}! Your account is ready. Contact us at {support_phone} for help.",
  password_reset:
    "Your SmartLinkNet OTP is {otp}. Valid for 10 minutes. Do not share.",
};

export function interpolateTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{([^}]+)\}/g, (_, key) => vars[key] ?? `{${key}}`);
}

// ─── Tenant Resource Limits ───────────────────────────────────────────────────

export const PLAN_LIMITS: Record<string, Record<string, number>> = {
  trial: {
    max_customers: 50,
    max_routers: 2,
    max_users: 3,
    max_branches: 1,
    sms_per_month: 100,
  },
  starter: {
    max_customers: 500,
    max_routers: 10,
    max_users: 10,
    max_branches: 3,
    sms_per_month: 1000,
  },
  growth: {
    max_customers: 5000,
    max_routers: 50,
    max_users: 50,
    max_branches: 10,
    sms_per_month: 10000,
  },
  enterprise: {
    max_customers: -1,    // unlimited
    max_routers: -1,
    max_users: -1,
    max_branches: -1,
    sms_per_month: -1,
  },
};

export async function checkResourceLimit(
  tenantId: string,
  resource: keyof typeof PLAN_LIMITS.trial,
  plan: string
): Promise<{ allowed: boolean; current: number; limit: number }> {
  const limit = PLAN_LIMITS[plan]?.[resource] ?? -1;
  if (limit === -1) return { allowed: true, current: 0, limit: -1 };

  const tableMap: Record<string, string> = {
    max_customers: "customers",
    max_routers: "routers",
    max_users: "profiles",
    max_branches: "branches",
  };
  const table = tableMap[resource];
  if (!table) return { allowed: true, current: 0, limit };

  const { count } = await (supabase as any)
    .from(table)
    .select("*", { count: "exact", head: true })
    .eq("tenant_id", tenantId);

  const current = count ?? 0;
  return { allowed: current < limit, current, limit };
}

// ─── CSS Custom Property Injection ───────────────────────────────────────────

export function applyBrandingToDOM(branding: TenantBranding | null): void {
  if (!branding) return;
  const root = document.documentElement;
  if (branding.primary_color) {
    root.style.setProperty("--branding-primary", branding.primary_color);
  }
  if (branding.secondary_color) {
    root.style.setProperty("--branding-secondary", branding.secondary_color);
  }
  if (branding.css_overrides) {
    let style = document.getElementById("tenant-css-overrides");
    if (!style) {
      style = document.createElement("style");
      style.id = "tenant-css-overrides";
      document.head.appendChild(style);
    }
    style.textContent = branding.css_overrides;
  }
}
