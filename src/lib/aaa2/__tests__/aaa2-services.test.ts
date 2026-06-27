import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockQuery } from "./mocks/supabase-client";

// ─── Import services under test ───────────────────────────────────────────────
// Aliases in vitest.config.ts redirect @/integrations/supabase/client and
// @/lib/network/drivers/mikrotik-rest to stub files — no vi.mock needed.

import { radiusClientService } from "../services/clients";
import { accountingReplicationService } from "../services/replication";
import { vlanAssignmentService } from "../services/assignments";
import { radiusServerPool } from "../services/radius-pool";
import { nasManagement } from "../services/nas";

// ─── Reset mocks between tests ────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockQuery.select.mockReturnThis();
  mockQuery.eq.mockReturnThis();
  mockQuery.neq.mockReturnThis();
  mockQuery.order.mockReturnThis();
  mockQuery.limit.mockReturnThis();
  mockQuery.ilike.mockReturnThis();
  mockQuery.gte.mockReturnThis();
  mockQuery.is.mockReturnThis();
  mockQuery.insert.mockReturnThis();
  mockQuery.update.mockReturnThis();
  mockQuery.delete.mockReturnThis();
  mockQuery.upsert.mockReturnThis();
  mockQuery.catch.mockReturnThis();
  mockQuery.maybeSingle.mockReset();
  mockQuery.single.mockReset();
});

// ─── RadiusClientService ──────────────────────────────────────────────────────

describe("RadiusClientService", () => {
  it("lists radius clients for a tenant", async () => {
    mockQuery.order.mockResolvedValueOnce({ data: [], error: null });
    await radiusClientService.list("tenant-001");
    expect(mockQuery.select).toHaveBeenCalledWith("*");
    expect(mockQuery.order).toHaveBeenCalledWith("created_at", { ascending: false });
  });

  it("returns a client by id", async () => {
    const row = {
      id: "client-1", tenant_id: "tenant-1", name: "Radius Client",
      description: "Test client", client_ip: "10.0.0.1", shared_secret: "secret",
      vendor: "generic", is_active: true, last_seen: null,
      created_at: "2026-06-20T00:00:00.000Z", updated_at: "2026-06-20T00:00:00.000Z",
    };
    mockQuery.maybeSingle.mockResolvedValueOnce({ data: row, error: null });
    const result = await radiusClientService.get("client-1");
    expect(result).toEqual({
      id: "client-1", tenantId: "tenant-1", name: "Radius Client",
      description: "Test client", clientIp: "10.0.0.1", sharedSecret: "secret",
      vendor: "generic", isActive: true, lastSeen: null,
      createdAt: "2026-06-20T00:00:00.000Z", updatedAt: "2026-06-20T00:00:00.000Z",
    });
  });

  it("creates a radius client", async () => {
    const row = {
      id: "client-new", tenant_id: "tenant-1", name: "New Client", description: null,
      client_ip: "10.0.0.2", shared_secret: "secret2", vendor: "mikrotik",
      is_active: true, last_seen: null,
      created_at: "2026-06-20T00:00:00.000Z", updated_at: "2026-06-20T00:00:00.000Z",
    };
    mockQuery.single.mockResolvedValueOnce({ data: row, error: null });
    const result = await radiusClientService.save("tenant-1", {
      name: "New Client", clientIp: "10.0.0.2", sharedSecret: "secret2", vendor: "mikrotik",
    });
    expect(mockQuery.insert).toHaveBeenCalledWith({
      tenant_id: "tenant-1", name: "New Client", description: null,
      client_ip: "10.0.0.2", shared_secret: "secret2", vendor: "mikrotik",
      is_active: true, updated_at: expect.any(String),
    });
    expect(result.id).toBe("client-new");
  });

  it("updates an existing radius client", async () => {
    const row = {
      id: "client-1", tenant_id: "tenant-1", name: "Updated Client", description: "Updated",
      client_ip: "10.0.0.3", shared_secret: "secret3", vendor: "cisco",
      is_active: false, last_seen: null,
      created_at: "2026-06-20T00:00:00.000Z", updated_at: "2026-06-20T00:00:00.000Z",
    };
    mockQuery.single.mockResolvedValueOnce({ data: row, error: null });
    const result = await radiusClientService.save("tenant-1", {
      id: "client-1", name: "Updated Client", description: "Updated",
      clientIp: "10.0.0.3", sharedSecret: "secret3", vendor: "cisco", isActive: false,
    });
    expect(mockQuery.update).toHaveBeenCalledWith({
      tenant_id: "tenant-1", name: "Updated Client", description: "Updated",
      client_ip: "10.0.0.3", shared_secret: "secret3", vendor: "cisco",
      is_active: false, updated_at: expect.any(String),
    });
    expect(mockQuery.eq).toHaveBeenCalledWith("id", "client-1");
    expect(result.name).toBe("Updated Client");
  });

  it("deletes a radius client", async () => {
    mockQuery.eq.mockResolvedValueOnce({ error: null });
    await radiusClientService.delete("client-1");
    expect(mockQuery.delete).toHaveBeenCalled();
    expect(mockQuery.eq).toHaveBeenCalledWith("id", "client-1");
  });

  it("touches last seen for a client", async () => {
    mockQuery.eq.mockResolvedValueOnce({ error: null });
    await radiusClientService.touchLastSeen("client-1");
    expect(mockQuery.update).toHaveBeenCalledWith({
      last_seen: expect.any(String), updated_at: expect.any(String),
    });
    expect(mockQuery.eq).toHaveBeenCalledWith("id", "client-1");
  });
});

// ─── AccountingReplicationService ─────────────────────────────────────────────

describe("AccountingReplicationService", () => {
  it("lists targets for a tenant", async () => {
    mockQuery.order.mockResolvedValueOnce({ data: [], error: null });
    await accountingReplicationService.list("tenant-1");
    expect(mockQuery.order).toHaveBeenCalledWith("created_at", { ascending: false });
  });

  it("gets a target by id", async () => {
    const row = {
      id: "target-1", tenant_id: "tenant-1", server_id: "server-1",
      endpoint: "https://collector.example/api/acct", is_active: true,
      last_replicated_at: null, pending_count: 0,
      created_at: "2026-06-20T00:00:00.000Z", updated_at: "2026-06-20T00:00:00.000Z",
    };
    mockQuery.maybeSingle.mockResolvedValueOnce({ data: row, error: null });
    const result = await accountingReplicationService.get("target-1");
    expect(result).toMatchObject({ id: "target-1", endpoint: "https://collector.example/api/acct" });
  });

  it("creates a replica target", async () => {
    const row = {
      id: "target-new", tenant_id: "tenant-1", server_id: "server-2",
      endpoint: "https://collector.example/api/acct2", is_active: true,
      last_replicated_at: null, pending_count: 0,
      created_at: "2026-06-20T00:00:00.000Z", updated_at: "2026-06-20T00:00:00.000Z",
    };
    mockQuery.single.mockResolvedValueOnce({ data: row, error: null });
    const result = await accountingReplicationService.save("tenant-1", {
      serverId: "server-2", endpoint: "https://collector.example/api/acct2",
    });
    expect(mockQuery.insert).toHaveBeenCalledWith({
      tenant_id: "tenant-1", server_id: "server-2",
      endpoint: "https://collector.example/api/acct2",
      is_active: true, last_replicated_at: null, pending_count: 0,
      updated_at: expect.any(String),
    });
    expect(result.id).toBe("target-new");
  });

  it("updates an existing replica target", async () => {
    const row = {
      id: "target-1", tenant_id: "tenant-1", server_id: "server-1",
      endpoint: "https://collector.example/api/acct", is_active: false,
      last_replicated_at: "2026-06-20T00:00:00.000Z", pending_count: 5,
      created_at: "2026-06-20T00:00:00.000Z", updated_at: "2026-06-20T00:00:00.000Z",
    };
    mockQuery.single.mockResolvedValueOnce({ data: row, error: null });
    const result = await accountingReplicationService.save("tenant-1", {
      id: "target-1", serverId: "server-1", endpoint: "https://collector.example/api/acct",
      isActive: false, lastReplicatedAt: "2026-06-20T00:00:00.000Z", pendingCount: 5,
    });
    expect(mockQuery.update).toHaveBeenCalledWith({
      tenant_id: "tenant-1", server_id: "server-1",
      endpoint: "https://collector.example/api/acct", is_active: false,
      last_replicated_at: "2026-06-20T00:00:00.000Z", pending_count: 5,
      updated_at: expect.any(String),
    });
    expect(result.pendingCount).toBe(5);
  });

  it("deletes a replica target", async () => {
    mockQuery.eq.mockResolvedValueOnce({ error: null });
    await accountingReplicationService.delete("target-1");
    expect(mockQuery.delete).toHaveBeenCalled();
    expect(mockQuery.eq).toHaveBeenCalledWith("id", "target-1");
  });

  it("marks a target as replicated", async () => {
    mockQuery.eq.mockResolvedValueOnce({ error: null });
    await accountingReplicationService.markReplicated("target-1");
    expect(mockQuery.update).toHaveBeenCalledWith({
      last_replicated_at: expect.any(String),
      pending_count: 0, updated_at: expect.any(String),
    });
    expect(mockQuery.eq).toHaveBeenCalledWith("id", "target-1");
  });
});

// ─── VlanAssignmentService ────────────────────────────────────────────────────

describe("VlanAssignmentService", () => {
  it("lists VLAN assignments for a tenant", async () => {
    mockQuery.order.mockResolvedValueOnce({ data: [], error: null });
    await vlanAssignmentService.list("tenant-1");
    expect(mockQuery.order).toHaveBeenCalledWith("assigned_at", { ascending: false });
  });

  it("gets an assignment by id", async () => {
    const row = {
      id: "assign-1", tenant_id: "tenant-1", session_id: "session-1",
      subscription_id: "sub-1", nas_id: "nas-1",
      vlan_id: 100, vlan_name: "VLAN100",
      assigned_at: "2026-06-20T00:00:00.000Z", released_at: null,
    };
    mockQuery.maybeSingle.mockResolvedValueOnce({ data: row, error: null });
    const result = await vlanAssignmentService.get("assign-1");
    expect(result?.vlanId).toBe(100);
    expect(result?.vlanName).toBe("VLAN100");
  });

  it("creates a VLAN assignment record", async () => {
    const row = {
      id: "assign-new", tenant_id: "tenant-1", session_id: "session-1",
      subscription_id: "sub-1", nas_id: "nas-1",
      vlan_id: 200, vlan_name: "VLAN200",
      assigned_at: "2026-06-20T00:00:00.000Z", released_at: null,
    };
    mockQuery.single.mockResolvedValueOnce({ data: row, error: null });
    const result = await vlanAssignmentService.create({
      tenantId: "tenant-1", vlanId: 200, sessionId: "session-1",
      subscriptionId: "sub-1", nasId: "nas-1", vlanName: "VLAN200",
    });
    expect(mockQuery.insert).toHaveBeenCalledWith({
      tenant_id: "tenant-1", session_id: "session-1", subscription_id: "sub-1",
      nas_id: "nas-1", vlan_id: 200, vlan_name: "VLAN200",
      assigned_at: expect.any(String), released_at: null,
    });
    expect(result.id).toBe("assign-new");
  });

  it("releases a VLAN assignment", async () => {
    mockQuery.eq.mockResolvedValueOnce({ error: null });
    await vlanAssignmentService.release("assign-1");
    expect(mockQuery.update).toHaveBeenCalledWith({ released_at: expect.any(String) });
    expect(mockQuery.eq).toHaveBeenCalledWith("id", "assign-1");
  });
});

// ─── RadiusServerPoolService ──────────────────────────────────────────────────

describe("RadiusServerPoolService field mapping", () => {
  const baseRow = {
    id: "srv-1", tenant_id: "tenant-1", name: "Primary RADIUS", host: "10.0.0.1",
    auth_port: 1812, acct_port: 1813, coa_port: 3799, shared_secret: "secret",
    protocol: "mschapv2", role: "primary", is_primary: true, is_active: true,
    timeout_ms: 3000, retry_count: 3, priority: 1, failover_strategy: "priority",
    is_healthy: null, last_checked: null, consecutive_failures: 0,
    last_failure_reason: null, latency_ms: null,
    created_at: "2026-06-28T00:00:00.000Z", updated_at: "2026-06-28T00:00:00.000Z",
  };

  it("saves a new server accepting snake_case form fields", async () => {
    mockQuery.single.mockResolvedValueOnce({ data: baseRow, error: null });
    await radiusServerPool.save("tenant-1", {
      name: "Primary RADIUS", host: "10.0.0.1",
      auth_port: 1812, shared_secret: "secret",
      failover_strategy: "priority", is_active: true,
    } as any);
    expect(mockQuery.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id: "tenant-1", name: "Primary RADIUS",
        auth_port: 1812, shared_secret: "secret", failover_strategy: "priority",
      })
    );
  });

  it("updates an existing server with snake_case fields", async () => {
    mockQuery.single.mockResolvedValueOnce({ data: { ...baseRow, name: "Updated" }, error: null });
    await radiusServerPool.save("tenant-1", {
      id: "srv-1", name: "Updated", host: "10.0.0.2",
      auth_port: 1812, shared_secret: "new-secret",
      failover_strategy: "round_robin", is_active: false,
    } as any);
    expect(mockQuery.update).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Updated", failover_strategy: "round_robin", is_active: false })
    );
    expect(mockQuery.eq).toHaveBeenCalledWith("id", "srv-1");
  });

  it("maps DB row to camelCase RadiusServer", async () => {
    mockQuery.maybeSingle.mockResolvedValueOnce({ data: baseRow, error: null });
    const result = await radiusServerPool.get("srv-1");
    expect(result?.authPort).toBe(1812);
    expect(result?.failoverStrategy).toBe("priority");
    expect(result?.latencyMs).toBeNull();
    expect(result?.consecutiveFailures).toBe(0);
  });

  it("deletes a server by id", async () => {
    mockQuery.eq.mockResolvedValueOnce({ error: null });
    await radiusServerPool.delete("srv-1");
    expect(mockQuery.delete).toHaveBeenCalled();
    expect(mockQuery.eq).toHaveBeenCalledWith("id", "srv-1");
  });
});

// ─── NasManagementService ─────────────────────────────────────────────────────

describe("NasManagementService field mapping", () => {
  const nasRow = {
    id: "nas-1", tenant_id: "tenant-1", router_id: null,
    name: "Router A", description: null, vendor: "mikrotik",
    nas_identifier: "router-a", nas_ip: "192.168.1.1", shared_secret: "secret",
    auth_port: 1812, acct_port: 1813, coa_port: 3799,
    is_active: true, last_seen: null, radius_server_id: null,
    dynamic_vlan_enabled: false, dynamic_profile_enabled: true, dynamic_ip_enabled: false,
    created_at: "2026-06-28T00:00:00.000Z", updated_at: "2026-06-28T00:00:00.000Z",
    routers: null,
  };

  it("saves a new NAS accepting snake_case form fields", async () => {
    mockQuery.single.mockResolvedValueOnce({ data: nasRow, error: null });
    await nasManagement.save("tenant-1", {
      name: "Router A", nas_identifier: "router-a", nas_ip: "192.168.1.1",
      shared_secret: "secret", vendor: "mikrotik", is_active: true,
      dynamic_vlan_enabled: false, dynamic_profile_enabled: true,
      dynamic_ip_enabled: false, radius_server_id: null,
    } as any);
    expect(mockQuery.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id: "tenant-1", name: "Router A",
        nas_identifier: "router-a", nas_ip: "192.168.1.1", vendor: "mikrotik",
      })
    );
  });

  it("maps DB row to camelCase NasDevice", async () => {
    mockQuery.maybeSingle.mockResolvedValueOnce({ data: nasRow, error: null });
    const result = await nasManagement.get("nas-1");
    expect(result?.nasIdentifier).toBe("router-a");
    expect(result?.nasIp).toBe("192.168.1.1");
    expect(result?.dynamicVlanEnabled).toBe(false);
    expect(result?.dynamicProfileEnabled).toBe(true);
  });

  it("resolves NAS from packet by identifier", async () => {
    mockQuery.maybeSingle.mockResolvedValueOnce({ data: nasRow, error: null });
    const result = await nasManagement.resolveFromPacket({ nasIdentifier: "router-a" });
    expect(result?.nas.nasIdentifier).toBe("router-a");
    expect(result?.tenantId).toBe("tenant-1");
  });

  it("stores empty radius_server_id string as null", async () => {
    mockQuery.single.mockResolvedValueOnce({ data: nasRow, error: null });
    await nasManagement.save("tenant-1", {
      name: "Router A", shared_secret: "secret", radius_server_id: "",
    } as any);
    expect(mockQuery.insert).toHaveBeenCalledWith(
      expect.objectContaining({ radius_server_id: null })
    );
  });
});
