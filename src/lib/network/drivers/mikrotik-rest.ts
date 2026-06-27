/**
 * SmartLinkNet — MikroTik REST API Adapter
 * Phase 1: Router Driver
 *
 * Implements IRouterAdapter for MikroTik RouterOS REST API (v7+).
 * Connection target is resolved from DB — no hardcoded IPs.
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
  ServiceType,
} from "../types";
import type { IRouterAdapter, RouterLogEntry } from "./interfaces";

// ─── Low-level REST client ────────────────────────────────────────────────────

interface MikrotikRestClient {
  get<T>(path: string): Promise<T>;
  post<T>(path: string, body?: Record<string, unknown>): Promise<T>;
  patch<T>(path: string, body?: Record<string, unknown>): Promise<T>;
  delete<T>(path: string): Promise<T>;
}

function createRestClient(cfg: RouterConnectionConfig): MikrotikRestClient {
  const protocol = cfg.useSsl ? "https" : "http";
  const base = `${protocol}://${cfg.host}:${cfg.port}/rest`;
  const auth = btoa(`${cfg.username}:${cfg.password}`);
  const headers: Record<string, string> = {
    Authorization: `Basic ${auth}`,
    "Content-Type": "application/json",
  };

  async function call<T>(method: string, path: string, body?: Record<string, unknown>): Promise<T> {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), cfg.timeoutMs);
    try {
      const res = await fetch(`${base}${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      clearTimeout(tid);
      if (!res.ok) {
        const text = await res.text().catch(() => res.statusText);
        throw new Error(`MikroTik REST ${res.status}: ${text}`);
      }
      const text = await res.text();
      return (text ? JSON.parse(text) : null) as T;
    } catch (err: unknown) {
      clearTimeout(tid);
      if ((err as Error).name === "AbortError") throw new Error("MikroTik REST timeout");
      throw err;
    }
  }

  return {
    get:    (path)        => call("GET",    path),
    post:   (path, body)  => call("POST",   path, body),
    patch:  (path, body)  => call("PATCH",  path, body),
    delete: (path)        => call("DELETE", path),
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function now(): string {
  return new Date().toISOString();
}

function timed<T>(fn: () => Promise<T>): Promise<{ result: T; ms: number }> {
  const start = Date.now();
  return fn().then((result) => ({ result, ms: Date.now() - start }));
}

function wrapResult<T>(
  adapterType: AdapterType,
  fn: () => Promise<T>
): Promise<NetworkCommandResult<T>> {
  const start = Date.now();
  return fn()
    .then((data) => ({
      success: true,
      data,
      error: null,
      durationMs: Date.now() - start,
      adapterType,
      executedAt: now(),
    }))
    .catch((err: Error) => ({
      success: false,
      data: null,
      error: err.message,
      durationMs: Date.now() - start,
      adapterType,
      executedAt: now(),
    }));
}

/** Convert MikroTik rate-limit string to BandwidthPolicy */
function parseRateLimit(rl: string | undefined): BandwidthPolicy | null {
  if (!rl) return null;
  const parts = rl.split(/[ /]/);
  const toKbps = (s: string): number => {
    if (!s) return 0;
    const n = parseFloat(s);
    if (s.endsWith("M") || s.endsWith("m")) return Math.round(n * 1024);
    if (s.endsWith("G") || s.endsWith("g")) return Math.round(n * 1024 * 1024);
    return Math.round(n); // already kbps
  };
  return {
    policyRef: null,
    downloadKbps: toKbps(parts[0] ?? "0"),
    uploadKbps: toKbps(parts[1] ?? "0"),
    burstDownKbps: toKbps(parts[2] ?? "0") || null,
    burstUpKbps: toKbps(parts[3] ?? "0") || null,
    burstThresholdKbps: toKbps(parts[4] ?? "0") || null,
    burstTimeSec: parseInt(parts[6] ?? "0") || null,
    priority: 8,
  };
}

/** Render BandwidthPolicy to MikroTik rate-limit string */
export function renderMikrotikRateLimit(p: BandwidthPolicy): string {
  const fmt = (kbps: number): string =>
    kbps >= 1024 ? `${(kbps / 1024).toFixed(kbps % 1024 === 0 ? 0 : 1)}M` : `${kbps}k`;
  const dl = fmt(p.downloadKbps);
  const ul = fmt(p.uploadKbps);
  if (p.burstDownKbps && p.burstUpKbps) {
    const bd = fmt(p.burstDownKbps);
    const bu = fmt(p.burstUpKbps);
    const bt = fmt(p.burstThresholdKbps ?? Math.round(p.downloadKbps * 0.75));
    const bts = p.burstTimeSec ?? 10;
    return `${dl}/${ul} ${bd}/${bu} ${bt}/${bt} ${p.priority}/${p.priority} ${bts}/${bts}`;
  }
  return `${dl}/${ul}`;
}

// ─── MikroTik Session shape from /ip/hotspot/active ──────────────────────────

interface MtHotspotSession {
  ".id": string;
  user: string;
  address: string;
  "mac-address": string;
  "uptime": string;
  "bytes-in": string;
  "bytes-out": string;
  "idle-time": string;
}

interface MtPppoeSession {
  ".id": string;
  name: string;
  address: string;
  "caller-id": string;
  uptime: string;
  "bytes-in": string;
  "bytes-out": string;
  "idle-time": string;
}

function parseIdleSec(uptime: string): number {
  const m = uptime.match(/(?:(\d+)d)?(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?/);
  if (!m) return 0;
  return (parseInt(m[1] ?? "0") * 86400)
    + (parseInt(m[2] ?? "0") * 3600)
    + (parseInt(m[3] ?? "0") * 60)
    + parseInt(m[4] ?? "0");
}

// ─── Adapter Implementation ───────────────────────────────────────────────────

export class MikrotikRestAdapter implements IRouterAdapter {
  readonly adapterType: AdapterType = "mikrotik_rest";
  readonly routerRef: RouterRef;
  readonly config: RouterConnectionConfig;
  private client: MikrotikRestClient;

  constructor(routerRef: RouterRef, config: RouterConnectionConfig) {
    this.routerRef = routerRef;
    this.config = config;
    this.client = createRestClient(config);
  }

  async getStatus(): Promise<NetworkCommandResult<RouterStatus>> {
    return wrapResult(this.adapterType, async () => {
      const [resource, identity] = await Promise.all([
        this.client.get<Record<string, string>>("/system/resource"),
        this.client.get<Record<string, string>>("/system/identity"),
      ]);
      const total = parseInt(resource["total-memory"] ?? "1");
      const free  = parseInt(resource["free-memory"]  ?? "0");
      return {
        routerRef: this.routerRef,
        isOnline: true,
        cpuLoad: parseInt(resource["cpu-load"] ?? "0"),
        memoryUsed: Math.round(((total - free) / total) * 100),
        uptime: resource["uptime"] ?? "",
        firmwareVersion: resource["version"] ?? null,
        model: resource["board-name"] ?? null,
        identity: identity?.["name"] ?? null,
        checkedAt: now(),
        interfaces: [],
      } satisfies RouterStatus;
    });
  }

  async getInterfaces(): Promise<NetworkCommandResult<NetworkInterface[]>> {
    return wrapResult(this.adapterType, async () => {
      const ifaces = await this.client.get<Record<string, string>[]>("/interface");
      const addresses = await this.client.get<Record<string, string>[]>("/ip/address").catch(() => []);
      const addrMap: Record<string, string> = {};
      for (const a of addresses) addrMap[a["interface"]] = a["address"];
      return (ifaces ?? []).map((i) => ({
        name: i["name"],
        type: i["type"] ?? "ether",
        macAddress: i["mac-address"] ?? null,
        ipAddress: addrMap[i["name"]] ?? null,
        isRunning: i["running"] === "true",
        txBytes: parseInt(i["tx-byte"] ?? "0"),
        rxBytes: parseInt(i["rx-byte"] ?? "0"),
      }));
    });
  }

  async getActiveSessions(): Promise<NetworkCommandResult<AbstractSession[]>> {
    return wrapResult(this.adapterType, async () => {
      const [hotspot, pppoe] = await Promise.all([
        this.client.get<MtHotspotSession[]>("/ip/hotspot/active").catch(() => []),
        this.client.get<MtPppoeSession[]>("/ppp/active").catch(() => []),
      ]);
      const sessions: AbstractSession[] = [];
      for (const s of hotspot ?? []) {
        sessions.push({
          sessionRef: s[".id"],
          routerRef: this.routerRef,
          customerRef: null,
          username: s.user,
          serviceType: "hotspot",
          protocol: "ipv4",
          assignedIp: s.address ?? null,
          macAddress: s["mac-address"] ?? null,
          nasPort: null,
          bytesIn: parseInt(s["bytes-in"] ?? "0"),
          bytesOut: parseInt(s["bytes-out"] ?? "0"),
          startedAt: now(),
          idleSeconds: parseIdleSec(s["idle-time"] ?? ""),
          isActive: true,
        });
      }
      for (const s of pppoe ?? []) {
        sessions.push({
          sessionRef: s[".id"],
          routerRef: this.routerRef,
          customerRef: null,
          username: s.name,
          serviceType: "pppoe",
          protocol: "ipv4",
          assignedIp: s.address ?? null,
          macAddress: s["caller-id"] ?? null,
          nasPort: null,
          bytesIn: parseInt(s["bytes-in"] ?? "0"),
          bytesOut: parseInt(s["bytes-out"] ?? "0"),
          startedAt: now(),
          idleSeconds: parseIdleSec(s["idle-time"] ?? ""),
          isActive: true,
        });
      }
      return sessions;
    });
  }

  async kickSession(nasSessionId: string): Promise<NetworkCommandResult<void>> {
    return wrapResult(this.adapterType, async () => {
      // Try hotspot first, then PPPoE active
      try {
        await this.client.delete(`/ip/hotspot/active/${nasSessionId}`);
      } catch {
        await this.client.delete(`/ppp/active/${nasSessionId}`);
      }
    });
  }

  async addUser(creds: NetworkCredentials): Promise<NetworkCommandResult<void>> {
    return wrapResult(this.adapterType, async () => {
      const rateLimit = creds.rateLimit ? renderMikrotikRateLimit(creds.rateLimit) : undefined;
      if (creds.serviceType === "hotspot") {
        await this.client.post("/ip/hotspot/user", {
          name: creds.username,
          password: creds.password,
          ...(creds.profile && { profile: creds.profile }),
          ...(rateLimit && { "rate-limit": rateLimit }),
        });
      } else if (creds.serviceType === "pppoe") {
        await this.client.post("/ppp/secret", {
          name: creds.username,
          password: creds.password,
          service: "pppoe",
          ...(creds.profile && { profile: creds.profile }),
          ...(rateLimit && { "rate-limit": rateLimit }),
          ...(creds.poolName && { "remote-address": creds.poolName }),
        });
      }
    });
  }

  async removeUser(username: string, serviceType: ServiceType): Promise<NetworkCommandResult<void>> {
    return wrapResult(this.adapterType, async () => {
      if (serviceType === "hotspot") {
        const users = await this.client.get<Record<string, string>[]>(`/ip/hotspot/user?name=${encodeURIComponent(username)}`);
        if (users?.length) await this.client.delete(`/ip/hotspot/user/${users[0][".id"]}`);
      } else if (serviceType === "pppoe") {
        const secrets = await this.client.get<Record<string, string>[]>(`/ppp/secret?name=${encodeURIComponent(username)}`);
        if (secrets?.length) await this.client.delete(`/ppp/secret/${secrets[0][".id"]}`);
      }
    });
  }

  async updateUser(username: string, updates: Partial<NetworkCredentials>): Promise<NetworkCommandResult<void>> {
    return wrapResult(this.adapterType, async () => {
      const rateLimit = updates.rateLimit ? renderMikrotikRateLimit(updates.rateLimit) : undefined;
      const serviceType = updates.serviceType ?? "hotspot";
      const path = serviceType === "pppoe" ? "/ppp/secret" : "/ip/hotspot/user";
      const items = await this.client.get<Record<string, string>[]>(`${path}?name=${encodeURIComponent(username)}`);
      if (!items?.length) throw new Error(`User not found: ${username}`);
      const body: Record<string, unknown> = {};
      if (updates.password) body["password"] = updates.password;
      if (updates.profile) body["profile"] = updates.profile;
      if (rateLimit) body["rate-limit"] = rateLimit;
      await this.client.patch(`${path}/${items[0][".id"]}`, body);
    });
  }

  async applyBandwidthPolicy(username: string, policy: BandwidthPolicy): Promise<NetworkCommandResult<void>> {
    return this.updateUser(username, { rateLimit: policy });
  }

  async getIpPools(): Promise<NetworkCommandResult<IpPool[]>> {
    return wrapResult(this.adapterType, async () => {
      const pools = await this.client.get<Record<string, string>[]>("/ip/pool");
      return (pools ?? []).map((p) => ({
        poolRef: p[".id"],
        name: p["name"],
        protocol: "ipv4" as const,
        cidr: p["ranges"] ?? "",
        gateway: "",
        dns: [],
        isCgnat: (p["name"] ?? "").toLowerCase().includes("cgnat"),
        routerRef: this.routerRef,
        utilization: 0,
      }));
    });
  }

  async getWanLinks(): Promise<NetworkCommandResult<WanLink[]>> {
    return wrapResult(this.adapterType, async () => {
      const routes = await this.client.get<Record<string, string>[]>("/ip/route?dst-address=0.0.0.0/0");
      return (routes ?? []).map((r, i) => ({
        linkRef: r[".id"] ?? `wan-${i}`,
        routerRef: this.routerRef,
        name: r["gateway"] ?? `WAN${i + 1}`,
        interfaceName: r["pref-src"] ?? "",
        isActive: r["active"] === "true",
        priority: parseInt(r["distance"] ?? "1"),
        weightPercent: 100,
        latencyMs: null,
        packetLoss: null,
        bandwidthMbps: null,
        provider: null,
      }));
    });
  }

  async getLogs(limit = 100): Promise<NetworkCommandResult<RouterLogEntry[]>> {
    return wrapResult(this.adapterType, async () => {
      const logs = await this.client.get<Record<string, string>[]>(`/log?count=${limit}`);
      return (logs ?? []).map((l) => ({
        timestamp: l["time"] ?? now(),
        severity: (l["topics"]?.includes("error") ? "error"
          : l["topics"]?.includes("warning") ? "warning"
          : "info") as RouterLogEntry["severity"],
        topic: l["topics"] ?? "",
        message: l["message"] ?? "",
      }));
    });
  }

  async healthCheck(): Promise<AdapterHealth> {
    const start = Date.now();
    try {
      await this.client.get("/system/identity");
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
