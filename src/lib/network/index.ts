/**
 * SmartLinkNet — Network Abstraction Layer: Public API
 * Phase 1: Network Foundation
 *
 * Single import point for all network abstraction.
 * Import from "@/lib/network" — never from sub-modules directly.
 */

// Types
export type {
  RouterRef,
  CustomerRef,
  PackageRef,
  SessionRef,
  TenantRef,
  AdapterRef,
  IpPoolRef,
  WanLinkRef,
  RouterVendor,
  AdapterType,
  ServiceType,
  ProtocolType,
  NetworkFeature,
  RouterConnectionConfig,
  RouterStatus,
  NetworkInterface,
  AbstractSession,
  NetworkCredentials,
  BandwidthPolicy,
  IpPool,
  IpAssignment,
  WanLink,
  CgnatMapping,
  NetworkCommand,
  NetworkCommandType,
  NetworkCommandResult,
  AdapterHealth,
  ProviderConfig,
} from "./types";

export {
  ADAPTER_TYPE_LABELS,
  SERVICE_TYPE_LABELS,
  PROTOCOL_TYPE_LABELS,
  NETWORK_FEATURE_LABELS,
} from "./types";

// Adapter interfaces
export type {
  IRouterAdapter,
  ISessionAdapter,
  IAuthAdapter,
  IBandwidthAdapter,
  IProviderAdapter,
  IAdapterFactory,
  RouterLogEntry,
} from "./adapters/interfaces";

// Factory
export { adapterFactory, clearAdapterCache } from "./adapters/factory";

// Services
export { sessionService, SessionService } from "./services/session";
export { authService, AuthService } from "./services/auth";
export { bandwidthService, BandwidthService } from "./services/bandwidth";

// Adapters
export { MikrotikRestAdapter, renderMikrotikRateLimit } from "./drivers/mikrotik-rest";
export { MikrotikUserManagerAdapter } from "./adapters/user-manager";

// Providers
export {
  PPPoEProvider,
  HotspotProvider,
  DhcpProvider,
  IPv4Provider,
  IPv6Provider,
  CgnatProvider,
  MultiWanProvider,
} from "./providers/index";
