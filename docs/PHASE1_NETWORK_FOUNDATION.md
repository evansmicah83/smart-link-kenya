# SmartLinkNet — Phase 1: Network Foundation

## Overview

Phase 1 upgrades SmartLinkNet into a fully **network-agnostic** ISP platform through four abstraction layers. No business logic references specific IP addresses, router models, or WAN providers directly — all infrastructure is addressed by UUID.

---

## Architecture

```
Business Logic (routes, provisioning, automation)
        │
        ▼
┌─────────────────────────────────────────────┐
│         Network Abstraction Layer           │
│  SessionService · AuthService ·             │
│  BandwidthService                           │
└──────────────────┬──────────────────────────┘
                   │
        ┌──────────▼──────────┐
        │   Adapter Factory   │  ← resolves adapter by RouterRef (UUID)
        └──────────┬──────────┘
                   │
     ┌─────────────┼──────────────┐
     ▼             ▼              ▼
MikrotikRest   FreeRadius    (Phase 2)
  Adapter       Adapter      Ubiquiti / Cisco
```

---

## Abstraction Layers

### 1. Router Abstraction Layer
**File:** `src/lib/network/adapters/interfaces.ts`

`IRouterAdapter` — every vendor must implement:
- `getStatus()` → `RouterStatus`
- `getActiveSessions()` → `AbstractSession[]`
- `kickSession(nasSessionId)`
- `addUser(credentials: NetworkCredentials)`
- `removeUser(username, serviceType)`
- `updateUser(username, updates)`
- `applyBandwidthPolicy(username, policy)`
- `getIpPools()` → `IpPool[]`
- `getWanLinks()` → `WanLink[]`
- `getLogs(limit)`
- `healthCheck()` → `AdapterHealth`

### 2. Network Abstraction Layer
**Files:** `src/lib/network/services/`

| Service | Responsibility |
|---|---|
| `sessionService` | Live sessions, termination, accounting sync |
| `authService` | Provision / suspend / reactivate subscribers |
| `bandwidthService` | Apply / remove / burst rate policies |

All methods accept UUID references only — `RouterRef`, `CustomerRef`, `PackageRef`, `TenantRef`.

### 3. Provider Abstraction Layer
**File:** `src/lib/network/providers/index.ts`

| Provider | Service Type |
|---|---|
| `PPPoEProvider` | PPPoE secret management |
| `HotspotProvider` | Hotspot user management |
| `DhcpProvider` | DHCP static leases |
| `IPv4Provider` | IP pool registry (UUID-referenced) |
| `IPv6Provider` | IPv6 prefix delegation |
| `CgnatProvider` | CGNAT mapping and compliance logging |
| `MultiWanProvider` | WAN link health and failover |

### 4. Vendor Adapter Architecture
**Files:** `src/lib/network/drivers/`, `src/lib/network/adapters/`

| Adapter | Status |
|---|---|
| `MikrotikRestAdapter` | Implemented (RouterOS REST v7+) |
| `FreeRadiusAuthAdapter` | Implemented (via DB) |
| `FreeRadiusBandwidthAdapter` | Implemented |
| `RadiusSessionAdapter` | Implemented (CoA / Disconnect-Request) |
| Ubiquiti | Stub — Phase 2 |
| Cisco | Stub — Phase 2 |
| OpenWrt | Stub — Phase 2 |

---

## Enforcement Rules

### UUID-based infrastructure references
```typescript
// CORRECT
await authService.provisionSubscriber(tenantId, subscriptionId, routerId, { ... });
await sessionService.terminateSession(tenantId, sessionId);

// WRONG — never do this
await supabase.from("sessions").eq("ip_address", "192.168.1.100");
```

### No hardcoded IP addresses
Connection targets are resolved from DB at runtime inside `AdapterFactory`:
```typescript
const host = row.connection_string || row.ip_address;
// Never: const host = "192.168.88.1"
```

### No hardcoded router models
Adapter type resolved from `routers.primary_adapter_type` or `routers.vendor`:
```typescript
function resolveAdapter(row: RouterRow): AdapterType {
  if (row.primary_adapter_type) return row.primary_adapter_type;
  if (row.vendor === "mikrotik") return "mikrotik_rest";
}
```

### No hardcoded WAN providers
`wan_links.provider` is informational only — no business logic switches on it.

---

## Database Schema (Migration: 20260627000000)

| Table | Purpose |
|---|---|
| `network_adapters` | Per-router adapter registry with health status |
| `ip_pools` | CIDR pools, UUID-referenced — never hardcoded in app |
| `ip_assignments` | Dynamic address leases, session-scoped |
| `cgnat_mappings` | CGNAT compliance logging (lookup by customer UUID) |
| `wan_links` | Multi-WAN interface registry |
| `radius_users` | FreeRADIUS subscriber credentials |
| `provisioning_events` | Audit trail for all adapter operations |

New columns on existing tables:
- `routers`: `primary_adapter_type`, `use_ssl`, `vendor`, `is_active`, `firmware_version`, `tags`
- `sessions`: `nas_session_id`, `service_type`, `protocol`, `pool_id`, `vlan_id`, `terminated_by`
- `packages`: `speed_down_kbps`, `speed_up_kbps`, `burst_*`, `priority`, `pool_id`, `protocol`

---

## Usage Examples

### Provision a PPPoE subscriber
```typescript
import { authService } from "@/lib/network";

await authService.provisionSubscriber(tenantId, subscriptionId, routerId, {
  username: "cust001",
  password: "secure-pass",
  serviceType: "pppoe",
  packageRef: packageId, // bandwidth policy resolved from DB
});
```

### Terminate all sessions for a customer
```typescript
import { sessionService } from "@/lib/network";

const count = await sessionService.terminateCustomerSessions(tenantId, customerId);
```

### Apply bandwidth policy on package upgrade
```typescript
import { authService } from "@/lib/network";

await authService.updateBandwidth(routerId, username, newPackageId);
```

### Get live sessions from a router
```typescript
import { sessionService } from "@/lib/network";

const sessions = await sessionService.getLiveSessions(routerId);
// Returns AbstractSession[] — no vendor-specific fields
```

### Direct adapter access (advanced)
```typescript
import { adapterFactory } from "@/lib/network";

const adapter = await adapterFactory.getRouterAdapter(routerId);
const health  = await adapter.healthCheck();
const pools   = await adapter.getIpPools();
```

---

## Adding a New Vendor Adapter

1. Implement `IRouterAdapter` in `src/lib/network/drivers/your-vendor.ts`
2. Add the type to `AdapterType` union in `types.ts`
3. Add a label to `ADAPTER_TYPE_LABELS`
4. Add a `case` in `AdapterFactory.getRouterAdapter()`
5. Add the type to the migration `CHECK` constraint and re-run

```typescript
// src/lib/network/drivers/ubiquiti.ts
export class UbiquitiAdapter implements IRouterAdapter {
  readonly adapterType: AdapterType = "ubiquiti";
  // implement all interface methods...
}

// AdapterFactory switch:
case "ubiquiti":
  adapter = new UbiquitiAdapter(routerRef, cfg);
  break;
```

---

## File Structure

```
src/lib/network/
├── index.ts                    ← Public API (always import from here)
├── types.ts                    ← Types, enums, label maps
├── adapters/
│   ├── interfaces.ts           ← IRouterAdapter, ISessionAdapter, etc.
│   ├── factory.ts              ← AdapterFactory (UUID → adapter instance)
│   └── freeradius.ts           ← FreeRADIUS auth + bandwidth adapters
├── drivers/
│   └── mikrotik-rest.ts        ← MikroTik RouterOS REST API driver
├── providers/
│   └── index.ts                ← PPPoE, Hotspot, DHCP, IPv4/6, CGNAT, MultiWAN
└── services/
    ├── session.ts              ← SessionService
    ├── auth.ts                 ← AuthService
    └── bandwidth.ts            ← BandwidthService

src/components/
└── NetworkAdaptersPanel.tsx    ← Adapter management + WAN links + IP pools UI

supabase/
├── functions/router-command/
│   └── index.ts                ← Edge function with adapter dispatch
└── migrations/
    └── 20260627000000_phase1_network_foundation.sql
```
