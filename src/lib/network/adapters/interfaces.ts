/**
 * SmartLinkNet — Router Adapter Interface
 * Phase 1: Vendor Adapter Architecture
 *
 * Every router vendor MUST implement this interface.
 * Business logic calls IRouterAdapter — never vendor SDKs directly.
 */

import type {
  RouterRef,
  RouterStatus,
  NetworkInterface,
  AbstractSession,
  NetworkCredentials,
  BandwidthPolicy,
  IpPool,
  WanLink,
  NetworkCommandResult,
  AdapterType,
  AdapterHealth,
  RouterConnectionConfig,
} from "../types";

// ─── Core Router Adapter Interface ───────────────────────────────────────────

export interface IRouterAdapter {
  readonly adapterType: AdapterType;
  readonly routerRef: RouterRef;
  readonly config: RouterConnectionConfig;

  /** Check connectivity and retrieve router status */
  getStatus(): Promise<NetworkCommandResult<RouterStatus>>;

  /** List all physical/virtual interfaces */
  getInterfaces(): Promise<NetworkCommandResult<NetworkInterface[]>>;

  /** List all currently active sessions (hotspot + PPPoE) */
  getActiveSessions(): Promise<NetworkCommandResult<AbstractSession[]>>;

  /** Forcefully terminate a session by its NAS-local session ID */
  kickSession(nasSessionId: string): Promise<NetworkCommandResult<void>>;

  /** Add a user credential to the router/NAS */
  addUser(credentials: NetworkCredentials): Promise<NetworkCommandResult<void>>;

  /** Remove a user from the router/NAS */
  removeUser(username: string, serviceType: NetworkCredentials["serviceType"]): Promise<NetworkCommandResult<void>>;

  /** Update an existing user's credentials or bandwidth policy */
  updateUser(username: string, updates: Partial<NetworkCredentials>): Promise<NetworkCommandResult<void>>;

  /** Apply a bandwidth policy to a live session without disconnecting */
  applyBandwidthPolicy(username: string, policy: BandwidthPolicy): Promise<NetworkCommandResult<void>>;

  /** List all IP pools defined on the router */
  getIpPools(): Promise<NetworkCommandResult<IpPool[]>>;

  /** List all WAN interfaces (for Multi-WAN) */
  getWanLinks(): Promise<NetworkCommandResult<WanLink[]>>;

  /** Retrieve the last N log entries from the router */
  getLogs(limit: number): Promise<NetworkCommandResult<RouterLogEntry[]>>;

  /** Health check — lightweight ping to measure adapter latency */
  healthCheck(): Promise<AdapterHealth>;
}

// ─── Log Entry ────────────────────────────────────────────────────────────────

export interface RouterLogEntry {
  timestamp: string;
  severity: "debug" | "info" | "warning" | "error" | "critical";
  topic: string;
  message: string;
}

// ─── Session Adapter Interface ────────────────────────────────────────────────

export interface ISessionAdapter {
  readonly adapterType: AdapterType;

  /** List active sessions */
  listSessions(routerRef: RouterRef): Promise<AbstractSession[]>;

  /** Terminate a session */
  terminateSession(routerRef: RouterRef, sessionRef: string): Promise<void>;

  /** Send a CoA (Change of Authorization) to modify a live session */
  changeAuthorization(routerRef: RouterRef, username: string, policy: BandwidthPolicy): Promise<void>;

  /** Send a Disconnect-Request (RFC 3576) */
  sendDisconnect(routerRef: RouterRef, username: string): Promise<void>;
}

// ─── Authentication Adapter Interface ────────────────────────────────────────

export interface IAuthAdapter {
  readonly adapterType: AdapterType;

  /** Provision credentials for a new subscriber */
  provisionCredentials(routerRef: RouterRef, creds: NetworkCredentials): Promise<void>;

  /** Deprovision credentials (suspend/cancel) */
  deprovisionCredentials(routerRef: RouterRef, username: string): Promise<void>;

  /** Update credentials or rate limit */
  updateCredentials(routerRef: RouterRef, username: string, updates: Partial<NetworkCredentials>): Promise<void>;

  /** Verify credentials are active on the NAS */
  verifyCredentials(routerRef: RouterRef, username: string): Promise<boolean>;
}

// ─── Bandwidth Adapter Interface ──────────────────────────────────────────────

export interface IBandwidthAdapter {
  readonly adapterType: AdapterType;

  /** Apply a rate-limit policy to an existing user */
  applyPolicy(routerRef: RouterRef, username: string, policy: BandwidthPolicy): Promise<void>;

  /** Remove any rate-limit policy from a user */
  removePolicy(routerRef: RouterRef, username: string): Promise<void>;

  /** Temporarily burst a user beyond their normal limits */
  applyBurst(routerRef: RouterRef, username: string, durationSec: number, multiplier: number): Promise<void>;

  /** Render the policy into the vendor-specific rate-limit string */
  renderRateLimit(policy: BandwidthPolicy): string;
}

// ─── Provider Adapter Interface ───────────────────────────────────────────────

export interface IProviderAdapter {
  readonly adapterType: AdapterType;
  readonly supportedFeatures: NetworkCredentials["serviceType"][];

  /** Provision a new subscriber on this provider */
  provision(routerRef: RouterRef, creds: NetworkCredentials): Promise<void>;

  /** Suspend a subscriber */
  suspend(routerRef: RouterRef, username: string): Promise<void>;

  /** Reactivate a suspended subscriber */
  reactivate(routerRef: RouterRef, username: string): Promise<void>;

  /** Permanently remove a subscriber */
  terminate(routerRef: RouterRef, username: string): Promise<void>;
}

// ─── Adapter Factory Interface ────────────────────────────────────────────────

export interface IAdapterFactory {
  /** Resolve the correct adapter for a router by its UUID */
  getRouterAdapter(routerRef: RouterRef): Promise<IRouterAdapter>;
  getSessionAdapter(routerRef: RouterRef): Promise<ISessionAdapter>;
  getAuthAdapter(routerRef: RouterRef): Promise<IAuthAdapter>;
  getBandwidthAdapter(routerRef: RouterRef): Promise<IBandwidthAdapter>;
}
