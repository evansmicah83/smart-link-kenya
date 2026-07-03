import { beforeEach, describe, expect, it, vi } from "vitest";

const mockMaybeSingle = vi.hoisted(() => vi.fn());
const mockGetAuthAdapter = vi.hoisted(() => vi.fn());
const mockRecordProvisioningEvent = vi.hoisted(() => vi.fn());

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: mockMaybeSingle(),
    })),
  },
}));

vi.mock("../adapters/factory", () => ({
  adapterFactory: {
    getAuthAdapter: mockGetAuthAdapter(),
  },
}));

vi.mock("../services/telemetry", () => ({
  recordProvisioningEvent: mockRecordProvisioningEvent(),
}));

import { authService } from "../services/auth";

describe("AuthService subscription lifecycle helpers", () => {
  beforeEach(() => {
    mockMaybeSingle.mockReset();
    mockGetAuthAdapter.mockReset();
    mockRecordProvisioningEvent.mockReset();

    mockMaybeSingle.mockResolvedValue({ data: { id: "pkg-1", speed_down_kbps: 2048, speed_up_kbps: 1024 }, error: null });
    mockGetAuthAdapter.mockResolvedValue({
      provisionCredentials: vi.fn().mockResolvedValue(undefined),
      deprovisionCredentials: vi.fn().mockResolvedValue(undefined),
    });
    mockRecordProvisioningEvent.mockResolvedValue(undefined);
  });

  it("provisions a subscription record through the auth adapter", async () => {
    const adapter = { provisionCredentials: vi.fn().mockResolvedValue(undefined) };
    mockGetAuthAdapter.mockResolvedValue(adapter);

    await authService.provisionSubscriptionFromRecord("tenant-1", {
      id: "sub-1",
      router_id: "router-1",
      username: "alice",
      password: "secret",
      package_id: "pkg-1",
      type: "pppoe",
      profile: "default",
      pool_name: null,
    } as any);

    expect(adapter.provisionCredentials).toHaveBeenCalledWith(
      "router-1",
      expect.objectContaining({ username: "alice", password: "secret", serviceType: "pppoe" })
    );
    expect(mockRecordProvisioningEvent).toHaveBeenCalled();
  });

  it("deprovisions a subscription record when suspending", async () => {
    const adapter = { deprovisionCredentials: vi.fn().mockResolvedValue(undefined) };
    mockGetAuthAdapter.mockResolvedValue(adapter);

    await authService.suspendSubscriptionFromRecord("tenant-1", {
      id: "sub-2",
      router_id: "router-2",
      username: "bob",
      password: "secret",
      package_id: "pkg-1",
      type: "hotspot",
    } as any);

    expect(adapter.deprovisionCredentials).toHaveBeenCalledWith("router-2", "bob");
    expect(mockRecordProvisioningEvent).toHaveBeenCalled();
  });
});
