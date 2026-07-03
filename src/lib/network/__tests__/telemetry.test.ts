import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockFrom } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: mockFrom,
  },
}));

import { recordAdapterHealth, recordProvisioningEvent } from "../services/telemetry";

describe("network telemetry hooks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("records provisioning events with tenant and router references", async () => {
    const insert = vi.fn().mockResolvedValue({ data: null, error: null });
    mockFrom.mockReturnValueOnce({ insert });

    await recordProvisioningEvent({
      tenantRef: "tenant-1",
      subscriptionRef: "sub-1",
      routerRef: "router-1",
      event: "provisioned",
      username: "cust001",
      serviceType: "pppoe",
    });

    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      tenant_id: "tenant-1",
      subscription_id: "sub-1",
      router_id: "router-1",
      event: "provisioned",
      username: "cust001",
      service_type: "pppoe",
    }));
  });

  it("persists adapter health for a router", async () => {
    const routerChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { tenant_id: "tenant-2" }, error: null }),
    };
    const adapterChain = {
      upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    mockFrom
      .mockReturnValueOnce(routerChain as any)
      .mockReturnValueOnce(adapterChain as any);

    await recordAdapterHealth({
      routerRef: "router-2",
      adapterType: "mikrotik_rest",
      isHealthy: true,
      latencyMs: 42,
      errorCount: 0,
      lastError: null,
    });

    expect(adapterChain.upsert).toHaveBeenCalledWith(expect.objectContaining({
      tenant_id: "tenant-2",
      router_id: "router-2",
      adapter_type: "mikrotik_rest",
      health_status: "healthy",
      error_count: 0,
      last_error: null,
    }), { onConflict: "router_id,adapter_type" });
  });
});
