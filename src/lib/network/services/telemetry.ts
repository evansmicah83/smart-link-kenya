/**
 * SmartLinkNet — Network Telemetry Helpers
 * Phase 1: persist adapter health and provisioning events through the abstraction layer.
 */

import { supabase } from "@/integrations/supabase/client";
import type { AdapterHealth, RouterRef, ServiceType, TenantRef } from "../types";

export interface ProvisioningEventInput {
  tenantRef: TenantRef;
  subscriptionRef: string;
  routerRef: RouterRef;
  event: string;
  username?: string | null;
  serviceType?: ServiceType | null;
}

export async function recordProvisioningEvent(input: ProvisioningEventInput): Promise<void> {
  await (supabase as any).from("provisioning_events").insert({
    tenant_id: input.tenantRef,
    subscription_id: input.subscriptionRef,
    router_id: input.routerRef,
    event: input.event,
    username: input.username ?? null,
    service_type: input.serviceType ?? null,
    created_at: new Date().toISOString(),
  }).catch(() => {});
}

export async function recordAdapterHealth(health: AdapterHealth): Promise<void> {
  const { data } = await (supabase as any)
    .from("routers")
    .select("tenant_id")
    .eq("id", health.routerRef)
    .maybeSingle();

  const tenantId = data?.tenant_id ?? null;
  if (!tenantId) return;

  await (supabase as any).from("network_adapters").upsert({
    tenant_id: tenantId,
    router_id: health.routerRef,
    adapter_type: health.adapterType,
    health_status: health.isHealthy ? "healthy" : "unhealthy",
    last_checked: health.checkedAt,
    error_count: health.errorCount,
    last_error: health.lastError,
    config: {},
  }, { onConflict: "router_id,adapter_type" }).catch(() => {});
}
