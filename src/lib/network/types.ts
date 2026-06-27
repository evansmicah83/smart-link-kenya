/**
 * SmartLinkNet — Network Abstraction Layer: Core Types
 * Phase 1: Network Foundation
 *
 * ALL business logic MUST interact with network infrastructure through
 * these types. No hardcoded IP addresses, router models, or vendor-specific
 * constructs are permitted outside of adapter implementations.
 *
 * References to infrastructure are UUID-based only.
 */

// ─── UUID-based Infrastructure References ─────────────────────────────────────

/** UUID FK → routers.id */
export type RouterRef = string;
/** UUID FK → customers.id */
export type CustomerRef = string;
/** UUID FK → packages.id */
export type PackageRef = string;
/** UUID FK → sessions.id */
export type SessionRef = string;
/** UUID FK → tenants.id */
export type TenantRef = string;
/** UUID FK → network_adapters.id */
export type AdapterRef = string;
/** UUID FK → ip_pools.id */
export type IpPoolRef = string;
/** UUID FK → wan_links.id */
export type WanLinkRef = string;

// ─── Vendor & Protocol Enumerations ───────────────────────────────────────────

export type RouterVendor =
  | "mikrotik"
  | "ubiquiti"
  | "cisco"
  | "openwrt"
  | "generic";

export type AdapterType =
  | "mikrotik_rest"    // MikroTik RouterOS REST API (v7+)
  | "mikrotik_api"     // MikroTik Winbox API protocol (8728/8729)
  | "freeradius"       // FreeRADIUS via DB/REST
  | "radius_proxy"     // Generic RADIUS proxy
  | "ubiquiti"         // Ubiquiti UniFi / EdgeOS
  | "cisco"            // Cisco IOS / Meraki
  | "generic_snmp"     // SNMP v2c/v3 fallback
  | "openwrt";         // OpenWrt UCI/LuCI API

export type ServiceType =
  | "hotspot"
  | "pppoe"
  | "dhcp"
  | "fiber"
  | "wimax"
  | "lte"
  | "static";

export type ProtocolType =
  | "ipv4"
  | "ipv6"
  | "dual_stack"
  | "cgnat";

export type NetworkFeature =
  | "hotspot"
  | "pppoe"
  | "dhcp"
  | "ipv4"
  | "ipv6"
  | "cgnat"
  | "multi_wan"
  | "vlan"
  | "qos"
  | "firewall"
  | "nat"
  | "radius_auth"
  | "user_manager";

// ─── Connection Config ────────────────────────────────────────────────────────
// Resolved from DB at runtime — never hardcoded in business logic

export interface RouterConnectionConfig {
  /** Resolved from router.connection_string or router.ip_address */
  host: string;
  port: number;
  username: string;
  password: string;
  useSsl: boolean;
  timeoutMs: number;
  retryCount: number;
}

// ─── Router Status ────────────────────────────────────────────────────────────

export interface RouterStatus {
  routerRef: RouterRef;
  isOnline: boolean;
  cpuLoad: number;
  memoryUsed: number;
  uptime: string;
  firmwareVersion: string | null;
  model: string | null;
  identity: string | null;
  checkedAt: string;
  interfaces: NetworkInterface[];
}

export interface NetworkInterface {
  name: string;
  type: string;
  macAddress: string | null;
  /** Assigned dynamically — never a hardcoded value */
  ipAddress: string | null;
  isRunning: boolean;
  txBytes: number;
  rxBytes: number;
}

// ─── Abstract Session ─────────────────────────────────────────────────────────

export interface AbstractSession {
  sessionRef: SessionRef;
  routerRef: RouterRef;
  customerRef: CustomerRef | null;
  username: string;
  serviceType: ServiceType;
  protocol: ProtocolType;
  /** Assigned by DHCP/PPPoE/RADIUS pool — never hardcoded */
  assignedIp: string | null;
  macAddress: string | null;
  nasPort: string | null;
  bytesIn: number;
  bytesOut: number;
  startedAt: string;
  idleSeconds: number;
  isActive: boolean;
}

// ─── Network Credentials ─────────────────────────────────────────────────────

export interface NetworkCredentials {
  username: string;
  password: string;
  /** Maps to RADIUS / RouterOS profile name — resolved from package */
  profile: string | null;
  serviceType: ServiceType;
  /** Derived from package bandwidth policy */
  rateLimit: BandwidthPolicy | null;
  /** IP pool name on NAS — resolved from pool registry */
  poolName: string | null;
  vlanId: number | null;
  sessionTimeout: number | null;
  idleTimeout: number | null;
}

// ─── Bandwidth Policy ─────────────────────────────────────────────────────────

export interface BandwidthPolicy {
  policyRef: PackageRef | null;
  downloadKbps: number;
  uploadKbps: number;
  burstDownKbps: number | null;
  burstUpKbps: number | null;
  burstThresholdKbps: number | null;
  burstTimeSec: number | null;
  /** Maps to DSCP/QoS queue — 1 (highest) to 8 (lowest) */
  priority: number;
}

// ─── IP Address Management ────────────────────────────────────────────────────

export interface IpPool {
  poolRef: IpPoolRef;
  name: string;
  protocol: ProtocolType;
  /** CIDR notation — stored in DB, never hardcoded */
  cidr: string;
  gateway: string;
  dns: string[];
  isCgnat: boolean;
  routerRef: RouterRef;
  utilization: number;
}

export interface IpAssignment {
  assignmentRef: string;
  sessionRef: SessionRef;
  poolRef: IpPoolRef;
  /** Dynamically assigned at session start */
  assignedAddress: string;
  protocol: ProtocolType;
  leasedAt: string;
  expiresAt: string | null;
}

// ─── Multi-WAN ────────────────────────────────────────────────────────────────

export interface WanLink {
  linkRef: WanLinkRef;
  routerRef: RouterRef;
  name: string;
  /** Interface name from NAS — not hardcoded */
  interfaceName: string;
  isActive: boolean;
  priority: number;
  weightPercent: number;
  latencyMs: number | null;
  packetLoss: number | null;
  bandwidthMbps: number | null;
  provider: string | null;
}

// ─── CGNAT ────────────────────────────────────────────────────────────────────

export interface CgnatMapping {
  mappingRef: string;
  sessionRef: SessionRef;
  /** Private RFC-6598 / RFC-1918 address from CGNAT pool */
  privateAddress: string;
  /** Public shared address — read from NAS at runtime */
  publicAddress: string;
  portRangeStart: number;
  portRangeEnd: number;
  protocol: "tcp" | "udp" | "icmp" | "all";
  createdAt: string;
}

// ─── Command Envelope ────────────────────────────────────────────────────────

export type NetworkCommandType =
  | "get_status"
  | "get_interfaces"
  | "get_active_sessions"
  | "add_user"
  | "remove_user"
  | "update_user"
  | "kick_session"
  | "apply_bandwidth_policy"
  | "get_ip_pools"
  | "get_wan_links"
  | "get_logs"
  | "reboot"
  | "ping_test";

export interface NetworkCommand<T = Record<string, unknown>> {
  routerRef: RouterRef;
  command: NetworkCommandType;
  params: T;
  /** Caller-supplied UUID for idempotency */
  idempotencyKey: string | null;
  timeoutMs: number;
}

export interface NetworkCommandResult<T = unknown> {
  success: boolean;
  data: T | null;
  error: string | null;
  durationMs: number;
  adapterType: AdapterType;
  executedAt: string;
}

// ─── Adapter Health ───────────────────────────────────────────────────────────

export interface AdapterHealth {
  adapterType: AdapterType;
  routerRef: RouterRef;
  isHealthy: boolean;
  latencyMs: number;
  errorCount: number;
  lastError: string | null;
  checkedAt: string;
}

// ─── Provider Config (persisted per-tenant in DB) ────────────────────────────

export interface ProviderConfig {
  tenantRef: TenantRef;
  adapterType: AdapterType;
  features: NetworkFeature[];
  /** Adapter-specific config — no raw IP literals permitted */
  config: Record<string, unknown>;
}

// ─── Label Maps ──────────────────────────────────────────────────────────────

export const ADAPTER_TYPE_LABELS: Record<AdapterType, string> = {
  mikrotik_rest:  "MikroTik REST API",
  mikrotik_api:   "MikroTik API Protocol",
  freeradius:     "FreeRADIUS",
  radius_proxy:   "RADIUS Proxy",
  ubiquiti:       "Ubiquiti",
  cisco:          "Cisco",
  generic_snmp:   "Generic SNMP",
  openwrt:        "OpenWrt",
};

export const SERVICE_TYPE_LABELS: Record<ServiceType, string> = {
  hotspot: "Hotspot",
  pppoe:   "PPPoE",
  dhcp:    "DHCP",
  fiber:   "Fiber",
  wimax:   "WiMAX",
  lte:     "LTE",
  static:  "Static IP",
};

export const PROTOCOL_TYPE_LABELS: Record<ProtocolType, string> = {
  ipv4:        "IPv4",
  ipv6:        "IPv6",
  dual_stack:  "Dual Stack",
  cgnat:       "CGNAT",
};

export const NETWORK_FEATURE_LABELS: Record<NetworkFeature, string> = {
  hotspot:      "Hotspot",
  pppoe:        "PPPoE",
  dhcp:         "DHCP",
  ipv4:         "IPv4",
  ipv6:         "IPv6",
  cgnat:        "CGNAT",
  multi_wan:    "Multi-WAN",
  vlan:         "VLAN",
  qos:          "QoS",
  firewall:     "Firewall",
  nat:          "NAT",
  radius_auth:  "RADIUS Auth",
  user_manager: "User Manager",
};
