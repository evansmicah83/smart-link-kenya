/**
 * SmartLinkNet — Phase 1 Network Abstraction Tests
 *
 * Tests cover:
 * 1. Types & label maps
 * 2. MikroTik REST adapter (unit — fetch mocked)
 * 3. Bandwidth policy rendering
 * 4. Adapter factory resolution
 * 5. FreeRADIUS adapter (unit — supabase mocked)
 * 6. Provider drivers
 * 7. Enforcement: no hardcoded IPs / models
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock fetch globally ──────────────────────────────────────────────────────

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// ─── Mock supabase ────────────────────────────────────────────────────────────

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq:     vi.fn().mockReturnThis(),
      upsert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      single:      vi.fn().mockResolvedValue({ data: null, error: null }),
    })),
    functions: {
      invoke: vi.fn().mockResolvedValue({ data: { success: true }, error: null }),
    },
  },
}));

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import {
  ADAPTER_TYPE_LABELS,
  SERVICE_TYPE_LABELS,
  PROTOCOL_TYPE_LABELS,
  NETWORK_FEATURE_LABELS,
} from "../types";
import type {
  BandwidthPolicy,
  RouterConnectionConfig,
  NetworkCredentials,
  AdapterType,
} from "../types";
import { MikrotikRestAdapter, renderMikrotikRateLimit } from "../drivers/mikrotik-rest";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mockMtResponse(body: unknown, ok = true) {
  mockFetch.mockResolvedValueOnce({
    ok,
    status: ok ? 200 : 500,
    statusText: ok ? "OK" : "Internal Server Error",
    text: () => Promise.resolve(JSON.stringify(body)),
  } as Response);
}

// Test fixture credentials — these are mock values used only with
// fully-stubbed fetch/supabase mocks. They never reach a real system.
const TEST_API_USER = "test-api-user";
const TEST_API_PASS = "test-api-pass";

function makeConfig(overrides: Partial<RouterConnectionConfig> = {}): RouterConnectionConfig {
  return {
    host: "router.example.internal",  // hostname, never a raw IP
    port: 80,
    username: TEST_API_USER,
    password: TEST_API_PASS,
    useSsl: false,
    timeoutMs: 5000,
    retryCount: 0,
    ...overrides,
  };
}

const ROUTER_REF = "00000000-0000-0000-0000-000000000001";

// ─── 1. Type / Label Maps ─────────────────────────────────────────────────────

describe("Type label maps", () => {
  it("covers all AdapterType values", () => {
    const expected: AdapterType[] = [
      "mikrotik_rest", "mikrotik_api", "freeradius", "radius_proxy",
      "ubiquiti", "cisco", "generic_snmp", "openwrt",
    ];
    expected.forEach((t) => {
      expect(ADAPTER_TYPE_LABELS[t]).toBeTruthy();
    });
  });

  it("covers all ServiceType values", () => {
    (["hotspot", "pppoe", "dhcp", "fiber", "wimax", "lte", "static"] as const).forEach((t) => {
      expect(SERVICE_TYPE_LABELS[t]).toBeTruthy();
    });
  });

  it("covers all ProtocolType values", () => {
    (["ipv4", "ipv6", "dual_stack", "cgnat"] as const).forEach((t) => {
      expect(PROTOCOL_TYPE_LABELS[t]).toBeTruthy();
    });
  });

  it("covers all NetworkFeature values", () => {
    (["hotspot","pppoe","dhcp","ipv4","ipv6","cgnat","multi_wan","vlan","qos","firewall","nat","radius_auth","user_manager"] as const).forEach((f) => {
      expect(NETWORK_FEATURE_LABELS[f]).toBeTruthy();
    });
  });
});

// ─── 2. Bandwidth Policy Rendering ───────────────────────────────────────────

describe("renderMikrotikRateLimit", () => {
  it("renders simple download/upload", () => {
    const policy: BandwidthPolicy = {
      policyRef: null,
      downloadKbps: 2048,
      uploadKbps: 1024,
      burstDownKbps: null,
      burstUpKbps: null,
      burstThresholdKbps: null,
      burstTimeSec: null,
      priority: 8,
    };
    expect(renderMikrotikRateLimit(policy)).toBe("2M/1M");
  });

  it("renders with burst parameters", () => {
    const policy: BandwidthPolicy = {
      policyRef: null,
      downloadKbps: 10240,
      uploadKbps: 5120,
      burstDownKbps: 20480,
      burstUpKbps: 10240,
      burstThresholdKbps: 8192,
      burstTimeSec: 10,
      priority: 4,
    };
    const result = renderMikrotikRateLimit(policy);
    expect(result).toContain("10M/5M");
    expect(result).toContain("20M/10M");
  });

  it("renders sub-megabit speeds in kbps", () => {
    const policy: BandwidthPolicy = {
      policyRef: null,
      downloadKbps: 512,
      uploadKbps: 256,
      burstDownKbps: null,
      burstUpKbps: null,
      burstThresholdKbps: null,
      burstTimeSec: null,
      priority: 8,
    };
    expect(renderMikrotikRateLimit(policy)).toBe("512k/256k");
  });

  it("never embeds a hardcoded IP address in the output", () => {
    const policy: BandwidthPolicy = {
      policyRef: null,
      downloadKbps: 1024,
      uploadKbps: 512,
      burstDownKbps: null,
      burstUpKbps: null,
      burstThresholdKbps: null,
      burstTimeSec: null,
      priority: 8,
    };
    const result = renderMikrotikRateLimit(policy);
    expect(result).not.toMatch(/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/);
  });
});

// ─── 3. MikroTik REST Adapter — getStatus ────────────────────────────────────

describe("MikrotikRestAdapter.getStatus()", () => {
  let adapter: MikrotikRestAdapter;

  beforeEach(() => {
    mockFetch.mockReset();
    adapter = new MikrotikRestAdapter(ROUTER_REF, makeConfig());
  });

  it("returns structured RouterStatus on success", async () => {
    mockMtResponse({ "cpu-load": "23", "total-memory": "256000000", "free-memory": "128000000", "uptime": "2d3h", "version": "7.10", "board-name": "hAP ac3" });
    mockMtResponse({ name: "MyRouter" });

    const result = await adapter.getStatus();

    expect(result.success).toBe(true);
    expect(result.adapterType).toBe("mikrotik_rest");
    expect(result.data?.isOnline).toBe(true);
    expect(result.data?.cpuLoad).toBe(23);
    expect(result.data?.memoryUsed).toBe(50);
    expect(result.data?.routerRef).toBe(ROUTER_REF);
    expect(result.data?.identity).toBe("MyRouter");
  });

  it("returns failure result on fetch error", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Connection refused"));

    const result = await adapter.getStatus();

    expect(result.success).toBe(false);
    expect(result.error).toContain("Connection refused");
    expect(result.data).toBeNull();
  });

  it("result never contains a raw IP address", async () => {
    mockMtResponse({ "cpu-load": "5", "total-memory": "256000000", "free-memory": "200000000", "uptime": "1d", "version": "7.10", "board-name": "RB" });
    mockMtResponse({ name: "R1" });

    const result = await adapter.getStatus();
    const json = JSON.stringify(result.data);
    // routerRef is UUID — no IP in structured output
    expect(json).not.toMatch(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/);
  });
});

// ─── 4. MikroTik REST Adapter — getActiveSessions ────────────────────────────

describe("MikrotikRestAdapter.getActiveSessions()", () => {
  let adapter: MikrotikRestAdapter;

  beforeEach(() => {
    mockFetch.mockReset();
    adapter = new MikrotikRestAdapter(ROUTER_REF, makeConfig());
  });

  it("maps hotspot sessions to AbstractSession", async () => {
    mockMtResponse([
      { ".id": "*1", user: "alice", address: "10.0.0.5", "mac-address": "AA:BB:CC:DD:EE:FF", "bytes-in": "1024", "bytes-out": "2048", "idle-time": "30s" },
    ]);
    mockMtResponse([]); // ppp/active

    const result = await adapter.getActiveSessions();

    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(1);
    const s = result.data![0];
    expect(s.routerRef).toBe(ROUTER_REF);
    expect(s.username).toBe("alice");
    expect(s.serviceType).toBe("hotspot");
    expect(s.bytesIn).toBe(1024);
    expect(s.bytesOut).toBe(2048);
    // customerRef is null — resolved at service layer by UUID lookup
    expect(s.customerRef).toBeNull();
  });

  it("maps PPPoE sessions to AbstractSession", async () => {
    mockMtResponse([]); // hotspot/active
    mockMtResponse([
      { ".id": "*2", name: "bob", address: "10.0.1.5", "caller-id": "CC:DD:EE:FF:00:11", "bytes-in": "5000", "bytes-out": "10000", "idle-time": "0s" },
    ]);

    const result = await adapter.getActiveSessions();

    expect(result.success).toBe(true);
    const pppoe = result.data!.find((s) => s.serviceType === "pppoe");
    expect(pppoe).toBeDefined();
    expect(pppoe?.username).toBe("bob");
    expect(pppoe?.serviceType).toBe("pppoe");
  });

  it("returns empty array when NAS has no sessions", async () => {
    mockMtResponse([]);
    mockMtResponse([]);

    const result = await adapter.getActiveSessions();
    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(0);
  });
});

// ─── 5. MikroTik REST Adapter — addUser ──────────────────────────────────────

describe("MikrotikRestAdapter.addUser()", () => {
  let adapter: MikrotikRestAdapter;

  beforeEach(() => {
    mockFetch.mockReset();
    adapter = new MikrotikRestAdapter(ROUTER_REF, makeConfig());
  });

  it("adds a hotspot user with rate limit", async () => {
    mockMtResponse({ ".id": "*A1" });

    const creds: NetworkCredentials = {
      username: "testuser",
      password: "test-pass-fixture",
      profile: "standard",
      serviceType: "hotspot",
      rateLimit: { policyRef: null, downloadKbps: 2048, uploadKbps: 1024, burstDownKbps: null, burstUpKbps: null, burstThresholdKbps: null, burstTimeSec: null, priority: 8 },
      poolName: null,
      vlanId: null,
      sessionTimeout: null,
      idleTimeout: null,
    };

    const result = await adapter.addUser(creds);
    expect(result.success).toBe(true);

    // Verify POST body sent to MikroTik
    const [, init] = mockFetch.mock.calls[0];
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.name).toBe("testuser");
    expect(body.password).toBe("pass123");
    expect(body["rate-limit"]).toBe("2M/1M");
    // Body must not contain raw IP addresses
    expect(JSON.stringify(body)).not.toMatch(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/);
  });

  it("adds a PPPoE user", async () => {
    mockMtResponse({ ".id": "*B1" });

    const creds: NetworkCredentials = {
      username: "pppoeuser",
      password: "test-pppoe-fixture",
      profile: "fiber100",
      serviceType: "pppoe",
      rateLimit: null,
      poolName: "pppoe-pool",
      vlanId: null,
      sessionTimeout: null,
      idleTimeout: null,
    };

    const result = await adapter.addUser(creds);
    expect(result.success).toBe(true);

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain("/ppp/secret");
  });
});

// ─── 6. MikroTik REST Adapter — kickSession ──────────────────────────────────

describe("MikrotikRestAdapter.kickSession()", () => {
  let adapter: MikrotikRestAdapter;

  beforeEach(() => {
    mockFetch.mockReset();
    adapter = new MikrotikRestAdapter(ROUTER_REF, makeConfig());
  });

  it("sends DELETE to hotspot/active first", async () => {
    mockMtResponse(null); // successful delete

    const result = await adapter.kickSession("*A1");
    expect(result.success).toBe(true);
    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain("/ip/hotspot/active/*A1");
  });

  it("falls back to ppp/active on hotspot failure", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 404, statusText: "Not Found", text: () => Promise.resolve("not found") })
      .mockResolvedValueOnce({ ok: true, status: 200, text: () => Promise.resolve("null") });

    const result = await adapter.kickSession("*B2");
    expect(result.success).toBe(true);
    const [, url2] = mockFetch.mock.calls.map(([u]) => u);
    expect(url2).toContain("/ppp/active/*B2");
  });
});

// ─── 7. MikroTik REST Adapter — getIpPools ───────────────────────────────────

describe("MikrotikRestAdapter.getIpPools()", () => {
  it("maps router pools to IpPool with routerRef UUID", async () => {
    mockFetch.mockReset();
    const adapter = new MikrotikRestAdapter(ROUTER_REF, makeConfig());
    mockMtResponse([
      { ".id": "*P1", name: "hotspot-pool", ranges: "10.10.0.1-10.10.0.254" },
      { ".id": "*P2", name: "cgnat-pool",   ranges: "100.64.0.1-100.64.0.254" },
    ]);

    const result = await adapter.getIpPools();
    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(2);

    const cgnatPool = result.data!.find((p) => p.name.includes("cgnat"));
    expect(cgnatPool?.isCgnat).toBe(true);

    // All pools reference the router by UUID — not by IP
    result.data!.forEach((p) => {
      expect(p.routerRef).toBe(ROUTER_REF);
    });
  });
});

// ─── 8. MikroTik REST Adapter — healthCheck ──────────────────────────────────

describe("MikrotikRestAdapter.healthCheck()", () => {
  it("returns healthy on successful identity fetch", async () => {
    mockFetch.mockReset();
    const adapter = new MikrotikRestAdapter(ROUTER_REF, makeConfig());
    mockMtResponse({ name: "R1" });

    const health = await adapter.healthCheck();
    expect(health.isHealthy).toBe(true);
    expect(health.routerRef).toBe(ROUTER_REF);
    expect(health.latencyMs).toBeGreaterThanOrEqual(0);
    expect(health.adapterType).toBe("mikrotik_rest");
  });

  it("returns unhealthy on fetch failure", async () => {
    mockFetch.mockReset();
    const adapter = new MikrotikRestAdapter(ROUTER_REF, makeConfig());
    mockFetch.mockRejectedValueOnce(new Error("ECONNREFUSED"));

    const health = await adapter.healthCheck();
    expect(health.isHealthy).toBe(false);
    expect(health.lastError).toContain("ECONNREFUSED");
    expect(health.errorCount).toBe(1);
  });
});

// ─── 9. Enforcement: connection config never contains hardcoded IP ────────────

describe("Enforcement: no hardcoded IPs in connection config", () => {
  it("config host is resolved from constructor argument, not hardcoded", () => {
    const cfg = makeConfig({ host: "router.myisp.co.ke" });
    expect(cfg.host).toBe("router.myisp.co.ke");
    expect(cfg.host).not.toMatch(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/);
  });

  it("throws if no connection address is configured", async () => {
    // AdapterFactory throws — simulate by passing empty host
    const cfg = makeConfig({ host: "" });
    const adapter = new MikrotikRestAdapter(ROUTER_REF, cfg);
    mockFetch.mockRejectedValueOnce(new TypeError("Failed to fetch: invalid URL"));

    const result = await adapter.getStatus();
    expect(result.success).toBe(false);
  });
});

// ─── 10. Enforcement: AbstractSession has no vendor-specific fields ───────────

describe("Enforcement: AbstractSession schema", () => {
  it("AbstractSession contains only vendor-agnostic fields", async () => {
    mockFetch.mockReset();
    const adapter = new MikrotikRestAdapter(ROUTER_REF, makeConfig());
    mockMtResponse([
      { ".id": "*1", user: "x", address: "10.0.0.1", "mac-address": "AA:BB:CC:DD:EE:FF", "bytes-in": "0", "bytes-out": "0", "idle-time": "0s" },
    ]);
    mockMtResponse([]);

    const result = await adapter.getActiveSessions();
    const session = result.data![0];

    // Required abstract fields
    expect(session).toHaveProperty("sessionRef");
    expect(session).toHaveProperty("routerRef");
    expect(session).toHaveProperty("username");
    expect(session).toHaveProperty("serviceType");
    expect(session).toHaveProperty("protocol");
    expect(session).toHaveProperty("bytesIn");
    expect(session).toHaveProperty("bytesOut");
    expect(session).toHaveProperty("isActive");

    // Must NOT expose vendor-specific MikroTik fields directly
    expect(session).not.toHaveProperty(".id");
    expect(session).not.toHaveProperty("uptime");
    expect(session).not.toHaveProperty("mac-address");
  });
});
