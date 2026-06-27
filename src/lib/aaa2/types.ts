/**
 * SmartLinkNet — Phase 2: AAA Platform Types
 * Complete type system for Authentication, Authorization, Accounting
 */

// ─── UUID References ──────────────────────────────────────────────────────────

export type RadiusServerRef  = string;
export type NasDeviceRef     = string;
export type RadiusProfileRef = string;
export type AccountingRef    = string;
export type TenantRef        = string;
export type CustomerRef      = string;
export type SubscriptionRef  = string;
export type SessionRef       = string;

// ─── Enumerations ─────────────────────────────────────────────────────────────

export type NasVendor =
  | "mikrotik" | "cisco" | "ubiquiti"
  | "freeradius" | "juniper" | "huawei" | "generic";

export type RadiusProtocol =
  | "pap" | "chap" | "mschapv2" | "eap-tls" | "eap-ttls" | "peap";

export type RadiusServerRole = "primary" | "secondary" | "tertiary" | "backup";

export type AccountingStatusType =
  | "Start" | "Stop" | "Interim-Update"
  | "Accounting-On" | "Accounting-Off";

export type AuthEventType =
  | "auth_success" | "auth_failure" | "auth_reject"
  | "acct_start" | "acct_stop" | "acct_update"
  | "coa_request" | "coa_ack" | "coa_nack"
  | "disconnect_request" | "disconnect_ack" | "disconnect_nack";

export type DynamicAssignmentType =
  | "vlan" | "profile" | "ip_pool" | "bandwidth" | "session_timeout" | "idle_timeout";

export type RadiusHealthStatus = "healthy" | "degraded" | "unhealthy" | "unknown";

export type FailoverStrategy =
  | "priority" | "round_robin" | "least_latency" | "random";

// ─── RADIUS Server ────────────────────────────────────────────────────────────

export interface RadiusServer {
  id: RadiusServerRef;
  tenantId: TenantRef;
  name: string;
  host: string;
  authPort: number;
  acctPort: number;
  coaPort: number;
  sharedSecret: string;
  protocol: RadiusProtocol;
  role: RadiusServerRole;
  isPrimary: boolean;
  isActive: boolean;
  timeoutMs: number;
  retryCount: number;
  priority: number;
  failoverStrategy: FailoverStrategy;
  isHealthy: boolean | null;
  lastChecked: string | null;
  consecutiveFailures: number;
  lastFailureReason: string | null;
  latencyMs: number | null;
  createdAt: string;
  updatedAt: string;
}

// ─── NAS Device ───────────────────────────────────────────────────────────────

export interface NasDevice {
  id: NasDeviceRef;
  tenantId: TenantRef;
  routerId: string | null;
  name: string;
  description: string | null;
  vendor: NasVendor;
  nasIdentifier: string | null;
  nasIp: string | null;
  sharedSecret: string;
  authPort: number;
  acctPort: number;
  coaPort: number;
  isActive: boolean;
  lastSeen: string | null;
  radiusServerId: RadiusServerRef | null;
  dynamicVlanEnabled: boolean;
  dynamicProfileEnabled: boolean;
  dynamicIpEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

// ─── RADIUS Profile ───────────────────────────────────────────────────────────

export interface RadiusProfile {
  id: RadiusProfileRef;
  tenantId: TenantRef;
  packageId: string | null;
  name: string;
  rateLimit: string | null;
  speedDownKbps: number | null;
  speedUpKbps: number | null;
  burstDownKbps: number | null;
  burstUpKbps: number | null;
  burstThresholdKbps: number | null;
  burstTimeSec: number | null;
  vlanId: number | null;
  vlanName: string | null;
  ipPool: string | null;
  ipPoolRef: string | null;
  sessionTimeout: number | null;
  idleTimeout: number | null;
  simultaneousUse: number | null;
  attributes: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export type RadiusClientRef = string;
export interface RadiusClient {
  id: RadiusClientRef;
  tenantId: TenantRef;
  name: string;
  description: string | null;
  clientIp: string;
  sharedSecret: string;
  vendor: NasVendor;
  isActive: boolean;
  lastSeen: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AccountingReplicaTarget {
  id: string;
  tenantId: TenantRef;
  serverId: RadiusServerRef;
  endpoint: string;
  isActive: boolean;
  lastReplicatedAt: string | null;
  pendingCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface VlanAssignment {
  id: string;
  tenantId: TenantRef;
  sessionId: SessionRef | null;
  subscriptionId: SubscriptionRef | null;
  nasId: NasDeviceRef | null;
  vlanId: number;
  vlanName: string | null;
  assignedAt: string;
  releasedAt: string | null;
}

// ─── Dynamic Assignment ───────────────────────────────────────────────────────

export interface DynamicAssignment {
  customerRef: CustomerRef;
  subscriptionRef: SubscriptionRef;
  assignmentType: DynamicAssignmentType;
  assignedValue: string | number | null;
  profileRef: RadiusProfileRef | null;
  nasRef: NasDeviceRef;
  assignedAt: string;
  expiresAt: string | null;
}

// ─── Auth Request / Response ──────────────────────────────────────────────────

export interface RadiusAuthRequest {
  username: string;
  password: string;
  nasIdentifier: string | null;
  nasIp: string | null;
  nasPort: string | null;
  callingStationId: string | null;
  calledStationId: string | null;
  serviceType: string | null;
  framedProtocol: string | null;
  protocol: RadiusProtocol;
}

export interface RadiusAuthResponse {
  accepted: boolean;
  rejectReason: string | null;
  replyAttributes: RadiusReplyAttributes;
  profileRef: RadiusProfileRef | null;
  customerRef: CustomerRef | null;
  subscriptionRef: SubscriptionRef | null;
  radiusServerRef: RadiusServerRef | null;
}

export interface RadiusReplyAttributes {
  rateLimit: string | null;
  vlanId: number | null;
  vlanName: string | null;
  ipPool: string | null;
  sessionTimeout: number | null;
  idleTimeout: number | null;
  replyMessage: string | null;
  mikrotikRateLimit: string | null;
  mikrotikAddressPool: string | null;
  vsa: Record<string, unknown>;
}

// ─── Accounting Record ────────────────────────────────────────────────────────

export interface AccountingRecord {
  id: AccountingRef;
  tenantId: TenantRef | null;
  nasId: NasDeviceRef | null;
  sessionId: string | null;
  nasIdentifier: string | null;
  username: string;
  framedIp: string | null;
  callingStation: string | null;
  calledStation: string | null;
  acctStatusType: AccountingStatusType;
  acctInputOctets: number;
  acctOutputOctets: number;
  acctSessionTime: number;
  acctInputPackets: number;
  acctOutputPackets: number;
  acctTerminateCause: string | null;
  serviceType: string | null;
  nasPortType: string | null;
  rawAttrs: Record<string, unknown>;
  receivedAt: string;
  receivedByServer: RadiusServerRef | null;
  isReplicated: boolean;
}

// ─── Health Snapshots ─────────────────────────────────────────────────────────

export interface RadiusHealthSnapshot {
  serverId: RadiusServerRef;
  serverName: string;
  host: string;
  role: RadiusServerRole;
  status: RadiusHealthStatus;
  latencyMs: number | null;
  consecutiveFailures: number;
  lastChecked: string | null;
  lastFailureReason: string | null;
  authRequestsPerMin: number;
  acctRequestsPerMin: number;
  failureRatePercent: number;
}

export interface NasHealthSnapshot {
  nasId: NasDeviceRef;
  nasName: string;
  vendor: NasVendor;
  isActive: boolean;
  lastSeen: string | null;
  activeSessionCount: number;
  authSuccessLast1h: number;
  authFailureLast1h: number;
  acctRecordsLast1h: number;
}

export interface AaaStats {
  authSuccess: number;
  authFailure: number;
  authReject: number;
  acctRecords: number;
  activeSessions: number;
  activeNasDevices: number;
  healthyRadiusServers: number;
  failureRatePercent: number;
  avgAuthLatencyMs: number | null;
}

// ─── Label Maps ───────────────────────────────────────────────────────────────

export const NAS_VENDOR_LABELS: Record<NasVendor, string> = {
  mikrotik: "MikroTik", cisco: "Cisco", ubiquiti: "Ubiquiti",
  freeradius: "FreeRADIUS", juniper: "Juniper", huawei: "Huawei", generic: "Generic",
};

export const RADIUS_PROTOCOL_LABELS: Record<RadiusProtocol, string> = {
  pap: "PAP", chap: "CHAP", mschapv2: "MS-CHAPv2",
  "eap-tls": "EAP-TLS", "eap-ttls": "EAP-TTLS", peap: "PEAP",
};

export const RADIUS_ROLE_LABELS: Record<RadiusServerRole, string> = {
  primary: "Primary", secondary: "Secondary", tertiary: "Tertiary", backup: "Backup",
};

export const FAILOVER_STRATEGY_LABELS: Record<FailoverStrategy, string> = {
  priority: "Priority (Ordered)", round_robin: "Round Robin",
  least_latency: "Least Latency", random: "Random",
};

export const AUTH_EVENT_COLORS: Record<AuthEventType, string> = {
  auth_success: "bg-green-500/15 text-green-600",
  auth_failure: "bg-red-500/15 text-red-600",
  auth_reject:  "bg-red-600/20 text-red-700",
  acct_start:   "bg-blue-500/15 text-blue-600",
  acct_stop:    "bg-muted text-muted-foreground",
  acct_update:  "bg-cyan-500/15 text-cyan-600",
  coa_request:  "bg-orange-500/15 text-orange-600",
  coa_ack:      "bg-green-500/15 text-green-600",
  coa_nack:     "bg-red-500/15 text-red-600",
  disconnect_request: "bg-yellow-500/15 text-yellow-600",
  disconnect_ack:     "bg-muted text-muted-foreground",
  disconnect_nack:    "bg-red-500/15 text-red-600",
};
