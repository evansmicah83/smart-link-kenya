/**
 * SmartLinkNet — MikroTik User Manager Driver
 * Phase 1: Provider Driver
 *
 * MikroTik User Manager is a RADIUS-compatible hotspot/PPPoE
 * user management system built into RouterOS.
 * It exposes a REST API at /user-manager/...
 */

import type {
  RouterRef,
  AdapterType,
  AdapterHealth,
  NetworkCredentials,
  BandwidthPolicy,
  RouterConnectionConfig,
} from "../types";
import type { IAuthAdapter, IBandwidthAdapter } from "./interfaces";
import { renderMikrotikRateLimit } from "../drivers/mikrotik-rest";

function now(): string {
  return new Date().toISOString();
}

function createUMClient(cfg: RouterConnectionConfig) {
  const protocol = cfg.useSsl ? "https" : "http";
  const base = `${protocol}://${cfg.host}:${cfg.port}/rest/user-manager`;
  const auth = btoa(`${cfg.username}:${cfg.password}`);
  const headers: Record<string, string> = {
    Authorization: `Basic ${auth}`,
    "Content-Type": "application/json",
  };

  async function call<T>(method: string, path: string, body?: Record<string, unknown>): Promise<T> {
    const res = await fetch(`${base}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(cfg.timeoutMs),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      throw new Error(`UserManager ${res.status}: ${text}`);
    }
    const text = await res.text();
    return (text ? JSON.parse(text) : null) as T;
  }

  return {
    get:    <T>(p: string) => call<T>("GET", p),
    post:   <T>(p: string, b?: Record<string, unknown>) => call<T>("POST", p, b),
    patch:  <T>(p: string, b?: Record<string, unknown>) => call<T>("PATCH", p, b),
    delete: <T>(p: string) => call<T>("DELETE", p),
  };
}

// ─── User Manager Auth Adapter ────────────────────────────────────────────────

export class MikrotikUserManagerAdapter implements IAuthAdapter, IBandwidthAdapter {
  readonly adapterType: AdapterType = "mikrotik_rest";
  readonly routerRef: RouterRef;
  private cfg: RouterConnectionConfig;

  constructor(routerRef: RouterRef, cfg: RouterConnectionConfig) {
    this.routerRef = routerRef;
    this.cfg = cfg;
  }

  // ── IAuthAdapter ───────────────────────────────────────────────────────────

  async provisionCredentials(_routerRef: RouterRef, creds: NetworkCredentials): Promise<void> {
    const client = createUMClient(this.cfg);
    const rateLimit = creds.rateLimit ? renderMikrotikRateLimit(creds.rateLimit) : undefined;

    // Create or update user in User Manager
    await client.post("/user", {
      name: creds.username,
      password: creds.password,
      ...(creds.profile && { "attributes": { "User-Profile": creds.profile } }),
      ...(rateLimit && { "rate-limit": rateLimit }),
    });
  }

  async deprovisionCredentials(_routerRef: RouterRef, username: string): Promise<void> {
    const client = createUMClient(this.cfg);
    const users = await client.get<Record<string, string>[]>(`/user?name=${encodeURIComponent(username)}`).catch(() => []);
    if (Array.isArray(users) && users.length) {
      await client.delete(`/user/${users[0][".id"]}`);
    }
  }

  async updateCredentials(_routerRef: RouterRef, username: string, updates: Partial<NetworkCredentials>): Promise<void> {
    const client = createUMClient(this.cfg);
    const users = await client.get<Record<string, string>[]>(`/user?name=${encodeURIComponent(username)}`).catch(() => []);
    if (!Array.isArray(users) || !users.length) throw new Error(`User Manager: user not found: ${username}`);

    const body: Record<string, unknown> = {};
    if (updates.password) body["password"] = updates.password;
    if (updates.rateLimit) body["rate-limit"] = renderMikrotikRateLimit(updates.rateLimit);

    await client.patch(`/user/${users[0][".id"]}`, body);
  }

  async verifyCredentials(_routerRef: RouterRef, username: string): Promise<boolean> {
    const client = createUMClient(this.cfg);
    const users = await client.get<Record<string, string>[]>(`/user?name=${encodeURIComponent(username)}`).catch(() => []);
    return Array.isArray(users) && users.length > 0;
  }

  // ── IBandwidthAdapter ──────────────────────────────────────────────────────

  renderRateLimit(policy: BandwidthPolicy): string {
    return renderMikrotikRateLimit(policy);
  }

  async applyPolicy(routerRef: RouterRef, username: string, policy: BandwidthPolicy): Promise<void> {
    await this.updateCredentials(routerRef, username, { rateLimit: policy });
  }

  async removePolicy(routerRef: RouterRef, username: string): Promise<void> {
    await this.updateCredentials(routerRef, username, { rateLimit: undefined });
  }

  async applyBurst(_routerRef: RouterRef, _username: string, _durationSec: number, _multiplier: number): Promise<void> {
    // User Manager does not support transient burst natively — handled via RADIUS CoA
  }

  // ── Health ─────────────────────────────────────────────────────────────────

  async healthCheck(): Promise<AdapterHealth> {
    const start = Date.now();
    try {
      const client = createUMClient(this.cfg);
      await client.get("/user?count=1");
      return {
        adapterType: this.adapterType,
        routerRef: this.routerRef,
        isHealthy: true,
        latencyMs: Date.now() - start,
        errorCount: 0,
        lastError: null,
        checkedAt: now(),
      };
    } catch (err: unknown) {
      return {
        adapterType: this.adapterType,
        routerRef: this.routerRef,
        isHealthy: false,
        latencyMs: Date.now() - start,
        errorCount: 1,
        lastError: (err as Error).message,
        checkedAt: now(),
      };
    }
  }
}
