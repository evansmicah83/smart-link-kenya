import { a as supabase, i as init_client, n as __exportAll, r as __toCommonJS, t as __esmMin } from "./client-D3kKP_Nv.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/factory-BT7u31uI.js
async function recordAdapterHealth(health) {
	const { data } = await supabase.from("routers").select("tenant_id").eq("id", health.routerRef).maybeSingle();
	const tenantId = data?.tenant_id ?? null;
	if (!tenantId) return;
	await supabase.from("network_adapters").upsert({
		tenant_id: tenantId,
		router_id: health.routerRef,
		adapter_type: health.adapterType,
		health_status: health.isHealthy ? "healthy" : "unhealthy",
		last_checked: health.checkedAt,
		error_count: health.errorCount,
		last_error: health.lastError,
		config: {}
	}, { onConflict: "router_id,adapter_type" }).catch(() => {});
}
var init_telemetry = __esmMin((() => {
	init_client();
}));
var mikrotik_rest_exports = /* @__PURE__ */ __exportAll({
	MikrotikRestAdapter: () => MikrotikRestAdapter,
	renderMikrotikRateLimit: () => renderMikrotikRateLimit
});
function createRestClient(cfg) {
	const base = `${cfg.useSsl ? "https" : "http"}://${cfg.host}:${cfg.port}/rest`;
	const headers = {
		Authorization: `Basic ${btoa(`${cfg.username}:${cfg.password}`)}`,
		"Content-Type": "application/json"
	};
	async function call(method, path, body) {
		const controller = new AbortController();
		const tid = setTimeout(() => controller.abort(), cfg.timeoutMs);
		try {
			const res = await fetch(`${base}${path}`, {
				method,
				headers,
				body: body ? JSON.stringify(body) : void 0,
				signal: controller.signal
			});
			clearTimeout(tid);
			if (!res || typeof res !== "object" || !("ok" in res)) throw new Error("MikroTik REST connection failed");
			if (!res.ok) {
				const text = await res.text().catch(() => res.statusText);
				throw new Error(`MikroTik REST ${res.status}: ${text}`);
			}
			const text = await res.text();
			return text ? JSON.parse(text) : null;
		} catch (err) {
			clearTimeout(tid);
			if (err.name === "AbortError") throw new Error("MikroTik REST timeout");
			throw err;
		}
	}
	return {
		get: (path) => call("GET", path),
		post: (path, body) => call("POST", path, body),
		patch: (path, body) => call("PATCH", path, body),
		delete: (path) => call("DELETE", path)
	};
}
function now$2() {
	return (/* @__PURE__ */ new Date()).toISOString();
}
function wrapResult(adapterType, fn) {
	const start = Date.now();
	return fn().then((data) => ({
		success: true,
		data,
		error: null,
		durationMs: Date.now() - start,
		adapterType,
		executedAt: now$2()
	})).catch((err) => ({
		success: false,
		data: null,
		error: err.message,
		durationMs: Date.now() - start,
		adapterType,
		executedAt: now$2()
	}));
}
/** Render BandwidthPolicy to MikroTik rate-limit string */
function renderMikrotikRateLimit(p) {
	const fmt = (kbps) => kbps >= 1024 ? `${(kbps / 1024).toFixed(kbps % 1024 === 0 ? 0 : 1)}M` : `${kbps}k`;
	const dl = fmt(p.downloadKbps);
	const ul = fmt(p.uploadKbps);
	if (p.burstDownKbps && p.burstUpKbps) {
		const bd = fmt(p.burstDownKbps);
		const bu = fmt(p.burstUpKbps);
		const bt = fmt(p.burstThresholdKbps ?? Math.round(p.downloadKbps * .75));
		const bts = p.burstTimeSec ?? 10;
		return `${dl}/${ul} ${bd}/${bu} ${bt}/${bt} ${p.priority}/${p.priority} ${bts}/${bts}`;
	}
	return `${dl}/${ul}`;
}
function parseIdleSec(uptime) {
	const m = uptime.match(/(?:(\d+)d)?(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?/);
	if (!m) return 0;
	return parseInt(m[1] ?? "0") * 86400 + parseInt(m[2] ?? "0") * 3600 + parseInt(m[3] ?? "0") * 60 + parseInt(m[4] ?? "0");
}
var MikrotikRestAdapter;
var init_mikrotik_rest = __esmMin((() => {
	init_telemetry();
	MikrotikRestAdapter = class {
		adapterType = "mikrotik_rest";
		routerRef;
		config;
		client;
		constructor(routerRef, config) {
			this.routerRef = routerRef;
			this.config = config;
			this.client = createRestClient(config);
		}
		async getStatus() {
			return wrapResult(this.adapterType, async () => {
				const [resourceResult, identityResult] = await Promise.allSettled([this.client.get("/system/resource"), this.client.get("/system/identity")]);
				if (resourceResult.status === "rejected") throw resourceResult.reason;
				if (identityResult.status === "rejected") throw identityResult.reason;
				const resource = resourceResult.value;
				const identity = identityResult.value;
				const total = parseInt(resource["total-memory"] ?? "1");
				const free = parseInt(resource["free-memory"] ?? "0");
				return {
					routerRef: this.routerRef,
					isOnline: true,
					cpuLoad: parseInt(resource["cpu-load"] ?? "0"),
					memoryUsed: Math.round((total - free) / total * 100),
					uptime: resource["uptime"] ?? "",
					firmwareVersion: resource["version"] ?? null,
					model: resource["board-name"] ?? null,
					identity: identity?.["name"] ?? null,
					checkedAt: now$2(),
					interfaces: []
				};
			});
		}
		async getInterfaces() {
			return wrapResult(this.adapterType, async () => {
				const ifaces = await this.client.get("/interface");
				const addresses = await this.client.get("/ip/address").catch(() => []);
				const addrMap = {};
				for (const a of addresses) addrMap[a["interface"]] = a["address"];
				return (ifaces ?? []).map((i) => ({
					name: i["name"],
					type: i["type"] ?? "ether",
					macAddress: i["mac-address"] ?? null,
					ipAddress: addrMap[i["name"]] ?? null,
					isRunning: i["running"] === "true",
					txBytes: parseInt(i["tx-byte"] ?? "0"),
					rxBytes: parseInt(i["rx-byte"] ?? "0")
				}));
			});
		}
		async getActiveSessions() {
			return wrapResult(this.adapterType, async () => {
				const [hotspot, pppoe] = await Promise.all([this.client.get("/ip/hotspot/active").catch(() => []), this.client.get("/ppp/active").catch(() => [])]);
				const sessions = [];
				for (const s of hotspot ?? []) sessions.push({
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
					startedAt: now$2(),
					idleSeconds: parseIdleSec(s["idle-time"] ?? ""),
					isActive: true
				});
				for (const s of pppoe ?? []) sessions.push({
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
					startedAt: now$2(),
					idleSeconds: parseIdleSec(s["idle-time"] ?? ""),
					isActive: true
				});
				return sessions;
			});
		}
		async kickSession(nasSessionId) {
			return wrapResult(this.adapterType, async () => {
				try {
					await this.client.delete(`/ip/hotspot/active/${nasSessionId}`);
				} catch {
					await this.client.delete(`/ppp/active/${nasSessionId}`);
				}
			});
		}
		async addUser(creds) {
			return wrapResult(this.adapterType, async () => {
				const rateLimit = creds.rateLimit ? renderMikrotikRateLimit(creds.rateLimit) : void 0;
				if (creds.serviceType === "hotspot") await this.client.post("/ip/hotspot/user", {
					name: creds.username,
					password: creds.password,
					...creds.profile && { profile: creds.profile },
					...rateLimit && { "rate-limit": rateLimit }
				});
				else if (creds.serviceType === "pppoe") await this.client.post("/ppp/secret", {
					name: creds.username,
					password: creds.password,
					service: "pppoe",
					...creds.profile && { profile: creds.profile },
					...rateLimit && { "rate-limit": rateLimit },
					...creds.poolName && { "remote-address": creds.poolName }
				});
			});
		}
		async removeUser(username, serviceType) {
			return wrapResult(this.adapterType, async () => {
				if (serviceType === "hotspot") {
					const users = await this.client.get(`/ip/hotspot/user?name=${encodeURIComponent(username)}`);
					if (users?.length) await this.client.delete(`/ip/hotspot/user/${users[0][".id"]}`);
				} else if (serviceType === "pppoe") {
					const secrets = await this.client.get(`/ppp/secret?name=${encodeURIComponent(username)}`);
					if (secrets?.length) await this.client.delete(`/ppp/secret/${secrets[0][".id"]}`);
				}
			});
		}
		async updateUser(username, updates) {
			return wrapResult(this.adapterType, async () => {
				const rateLimit = updates.rateLimit ? renderMikrotikRateLimit(updates.rateLimit) : void 0;
				const path = (updates.serviceType ?? "hotspot") === "pppoe" ? "/ppp/secret" : "/ip/hotspot/user";
				const items = await this.client.get(`${path}?name=${encodeURIComponent(username)}`);
				if (!items?.length) throw new Error(`User not found: ${username}`);
				const body = {};
				if (updates.password) body["password"] = updates.password;
				if (updates.profile) body["profile"] = updates.profile;
				if (rateLimit) body["rate-limit"] = rateLimit;
				await this.client.patch(`${path}/${items[0][".id"]}`, body);
			});
		}
		async applyBandwidthPolicy(username, policy) {
			return this.updateUser(username, { rateLimit: policy });
		}
		async getIpPools() {
			return wrapResult(this.adapterType, async () => {
				return (await this.client.get("/ip/pool") ?? []).map((p) => ({
					poolRef: p[".id"],
					name: p["name"],
					protocol: "ipv4",
					cidr: p["ranges"] ?? "",
					gateway: "",
					dns: [],
					isCgnat: (p["name"] ?? "").toLowerCase().includes("cgnat"),
					routerRef: this.routerRef,
					utilization: 0
				}));
			});
		}
		async getWanLinks() {
			return wrapResult(this.adapterType, async () => {
				return (await this.client.get("/ip/route?dst-address=0.0.0.0/0") ?? []).map((r, i) => ({
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
					provider: null
				}));
			});
		}
		async getLogs(limit = 100) {
			return wrapResult(this.adapterType, async () => {
				return (await this.client.get(`/log?count=${limit}`) ?? []).map((l) => ({
					timestamp: l["time"] ?? now$2(),
					severity: l["topics"]?.includes("error") ? "error" : l["topics"]?.includes("warning") ? "warning" : "info",
					topic: l["topics"] ?? "",
					message: l["message"] ?? ""
				}));
			});
		}
		async healthCheck() {
			const start = Date.now();
			try {
				await this.client.get("/system/identity");
				const health = {
					adapterType: this.adapterType,
					routerRef: this.routerRef,
					isHealthy: true,
					latencyMs: Date.now() - start,
					errorCount: 0,
					lastError: null,
					checkedAt: now$2()
				};
				await recordAdapterHealth(health);
				return health;
			} catch (err) {
				const health = {
					adapterType: this.adapterType,
					routerRef: this.routerRef,
					isHealthy: false,
					latencyMs: Date.now() - start,
					errorCount: 1,
					lastError: err.message,
					checkedAt: now$2()
				};
				await recordAdapterHealth(health);
				return health;
			}
		}
	};
}));
init_client();
init_mikrotik_rest();
function now$1() {
	return (/* @__PURE__ */ new Date()).toISOString();
}
var FreeRadiusAuthAdapter = class {
	adapterType = "freeradius";
	tenantId;
	constructor(tenantId) {
		this.tenantId = tenantId;
	}
	async provisionCredentials(routerRef, creds) {
		const rateLimit = creds.rateLimit ? renderMikrotikRateLimit(creds.rateLimit) : null;
		const { error } = await supabase.from("radius_users").upsert({
			tenant_id: this.tenantId,
			router_id: routerRef,
			username: creds.username,
			password: creds.password,
			profile: creds.profile,
			rate_limit: rateLimit,
			pool_name: creds.poolName,
			vlan_id: creds.vlanId,
			session_timeout: creds.sessionTimeout,
			idle_timeout: creds.idleTimeout,
			service_type: creds.serviceType,
			is_active: true,
			updated_at: now$1()
		}, { onConflict: "tenant_id,username" });
		if (error) throw new Error(`FreeRADIUS provision failed: ${error.message}`);
	}
	async deprovisionCredentials(routerRef, username) {
		const { error } = await supabase.from("radius_users").update({
			is_active: false,
			updated_at: now$1()
		}).eq("tenant_id", this.tenantId).eq("username", username);
		if (error) throw new Error(`FreeRADIUS deprovision failed: ${error.message}`);
	}
	async updateCredentials(_routerRef, username, updates) {
		const patch = { updated_at: now$1() };
		if (updates.password) patch["password"] = updates.password;
		if (updates.profile) patch["profile"] = updates.profile;
		if (updates.rateLimit) patch["rate_limit"] = renderMikrotikRateLimit(updates.rateLimit);
		if (updates.poolName !== void 0) patch["pool_name"] = updates.poolName;
		if (updates.sessionTimeout !== void 0) patch["session_timeout"] = updates.sessionTimeout;
		if (updates.idleTimeout !== void 0) patch["idle_timeout"] = updates.idleTimeout;
		const { error } = await supabase.from("radius_users").update(patch).eq("tenant_id", this.tenantId).eq("username", username);
		if (error) throw new Error(`FreeRADIUS update failed: ${error.message}`);
	}
	async verifyCredentials(_routerRef, username) {
		const { data } = await supabase.from("radius_users").select("is_active").eq("tenant_id", this.tenantId).eq("username", username).maybeSingle();
		return data?.is_active === true;
	}
};
var FreeRadiusBandwidthAdapter = class {
	adapterType = "freeradius";
	tenantId;
	constructor(tenantId) {
		this.tenantId = tenantId;
	}
	renderRateLimit(policy) {
		return renderMikrotikRateLimit(policy);
	}
	async applyPolicy(_routerRef, username, policy) {
		const rateLimit = this.renderRateLimit(policy);
		const { error } = await supabase.from("radius_users").update({
			rate_limit: rateLimit,
			updated_at: now$1()
		}).eq("tenant_id", this.tenantId).eq("username", username);
		if (error) throw new Error(`FreeRADIUS applyPolicy failed: ${error.message}`);
	}
	async removePolicy(_routerRef, username) {
		const { error } = await supabase.from("radius_users").update({
			rate_limit: null,
			updated_at: now$1()
		}).eq("tenant_id", this.tenantId).eq("username", username);
		if (error) throw new Error(`FreeRADIUS removePolicy failed: ${error.message}`);
	}
	async applyBurst(_routerRef, username, durationSec, multiplier) {
		const { data } = await supabase.from("radius_users").select("rate_limit").eq("tenant_id", this.tenantId).eq("username", username).maybeSingle();
		if (!data?.rate_limit) return;
		await supabase.from("job_queue").insert({
			tenant_id: this.tenantId,
			type: "sync_router",
			payload: {
				action: "revert_burst",
				username,
				original_rate_limit: data.rate_limit
			},
			run_at: new Date(Date.now() + durationSec * 1e3).toISOString(),
			priority: 3,
			queue_name: "router_sync"
		});
	}
};
var RadiusSessionAdapter = class {
	adapterType = "radius_proxy";
	tenantId;
	constructor(tenantId) {
		this.tenantId = tenantId;
	}
	/** Send a CoA packet via edge function */
	async changeAuthorization(routerRef, username, policy) {
		const { error } = await supabase.functions.invoke("router-command", { body: {
			routerId: routerRef,
			command: "apply_profile",
			params: {
				username,
				rateLimit: renderMikrotikRateLimit(policy),
				action: "coa"
			}
		} });
		if (error) throw new Error(`CoA failed: ${error.message}`);
	}
	async sendDisconnect(routerRef, username) {
		const { error } = await supabase.functions.invoke("router-command", { body: {
			routerId: routerRef,
			command: "kick_session",
			params: {
				username,
				action: "disconnect_request"
			}
		} });
		if (error) throw new Error(`Disconnect-Request failed: ${error.message}`);
	}
	async healthCheck(routerRef) {
		const start = Date.now();
		try {
			const { data } = await supabase.from("nas_devices").select("is_active, last_seen").eq("router_id", routerRef).eq("is_active", true).maybeSingle();
			return {
				adapterType: this.adapterType,
				routerRef,
				isHealthy: !!data,
				latencyMs: Date.now() - start,
				errorCount: 0,
				lastError: null,
				checkedAt: now$1()
			};
		} catch (err) {
			return {
				adapterType: this.adapterType,
				routerRef,
				isHealthy: false,
				latencyMs: Date.now() - start,
				errorCount: 1,
				lastError: err.message,
				checkedAt: now$1()
			};
		}
	}
};
init_mikrotik_rest();
function now() {
	return (/* @__PURE__ */ new Date()).toISOString();
}
function createUMClient(cfg) {
	const base = `${cfg.useSsl ? "https" : "http"}://${cfg.host}:${cfg.port}/rest/user-manager`;
	const headers = {
		Authorization: `Basic ${btoa(`${cfg.username}:${cfg.password}`)}`,
		"Content-Type": "application/json"
	};
	async function call(method, path, body) {
		const res = await fetch(`${base}${path}`, {
			method,
			headers,
			body: body ? JSON.stringify(body) : void 0,
			signal: AbortSignal.timeout(cfg.timeoutMs)
		});
		if (!res.ok) {
			const text = await res.text().catch(() => res.statusText);
			throw new Error(`UserManager ${res.status}: ${text}`);
		}
		const text = await res.text();
		return text ? JSON.parse(text) : null;
	}
	return {
		get: (p) => call("GET", p),
		post: (p, b) => call("POST", p, b),
		patch: (p, b) => call("PATCH", p, b),
		delete: (p) => call("DELETE", p)
	};
}
var MikrotikUserManagerAdapter = class {
	adapterType = "mikrotik_rest";
	routerRef;
	cfg;
	constructor(routerRef, cfg) {
		this.routerRef = routerRef;
		this.cfg = cfg;
	}
	async provisionCredentials(_routerRef, creds) {
		const client = createUMClient(this.cfg);
		const rateLimit = creds.rateLimit ? renderMikrotikRateLimit(creds.rateLimit) : void 0;
		await client.post("/user", {
			name: creds.username,
			password: creds.password,
			...creds.profile && { "attributes": { "User-Profile": creds.profile } },
			...rateLimit && { "rate-limit": rateLimit }
		});
	}
	async deprovisionCredentials(_routerRef, username) {
		const client = createUMClient(this.cfg);
		const users = await client.get(`/user?name=${encodeURIComponent(username)}`).catch(() => []);
		if (Array.isArray(users) && users.length) await client.delete(`/user/${users[0][".id"]}`);
	}
	async updateCredentials(_routerRef, username, updates) {
		const client = createUMClient(this.cfg);
		const users = await client.get(`/user?name=${encodeURIComponent(username)}`).catch(() => []);
		if (!Array.isArray(users) || !users.length) throw new Error(`User Manager: user not found: ${username}`);
		const body = {};
		if (updates.password) body["password"] = updates.password;
		if (updates.rateLimit) body["rate-limit"] = renderMikrotikRateLimit(updates.rateLimit);
		await client.patch(`/user/${users[0][".id"]}`, body);
	}
	async verifyCredentials(_routerRef, username) {
		const users = await createUMClient(this.cfg).get(`/user?name=${encodeURIComponent(username)}`).catch(() => []);
		return Array.isArray(users) && users.length > 0;
	}
	renderRateLimit(policy) {
		return renderMikrotikRateLimit(policy);
	}
	async applyPolicy(routerRef, username, policy) {
		await this.updateCredentials(routerRef, username, { rateLimit: policy });
	}
	async removePolicy(routerRef, username) {
		await this.updateCredentials(routerRef, username, { rateLimit: void 0 });
	}
	async applyBurst(_routerRef, _username, _durationSec, _multiplier) {}
	async healthCheck() {
		const start = Date.now();
		try {
			await createUMClient(this.cfg).get("/user?count=1");
			return {
				adapterType: this.adapterType,
				routerRef: this.routerRef,
				isHealthy: true,
				latencyMs: Date.now() - start,
				errorCount: 0,
				lastError: null,
				checkedAt: now()
			};
		} catch (err) {
			return {
				adapterType: this.adapterType,
				routerRef: this.routerRef,
				isHealthy: false,
				latencyMs: Date.now() - start,
				errorCount: 1,
				lastError: err.message,
				checkedAt: now()
			};
		}
	}
};
init_client();
init_mikrotik_rest();
var routerCache = /* @__PURE__ */ new Map();
var adapterCache = /* @__PURE__ */ new Map();
async function resolveRouter(routerRef) {
	const cached = routerCache.get(routerRef);
	if (cached) return cached;
	const { data, error } = await supabase.from("routers").select("id,connection_string,ip_address,api_port,api_username,api_password,use_ssl,vendor,tenant_id,primary_adapter_type").eq("id", routerRef).maybeSingle();
	if (error || !data) throw new Error(`Router not found: ${routerRef}`);
	const row = data;
	routerCache.set(routerRef, row);
	return row;
}
function buildConnectionConfig(row) {
	const host = row.connection_string || row.ip_address;
	if (!host) throw new Error(`Router ${row.id} has no connection address configured`);
	return {
		host,
		port: row.api_port ?? 80,
		username: row.api_username ?? "",
		password: row.api_password ?? "",
		useSsl: row.use_ssl ?? false,
		timeoutMs: 8e3,
		retryCount: 2
	};
}
function resolveAdapterType(row) {
	if (row.primary_adapter_type) return row.primary_adapter_type;
	if (row.vendor === "mikrotik") return "mikrotik_rest";
	if (row.vendor === "ubiquiti") return "ubiquiti";
	if (row.vendor === "cisco") return "cisco";
	return "generic_snmp";
}
var AdapterFactory = class {
	async getRouterAdapter(routerRef) {
		const cached = adapterCache.get(`router:${routerRef}`);
		if (cached) return cached;
		const row = await resolveRouter(routerRef);
		const cfg = buildConnectionConfig(row);
		const adapterType = resolveAdapterType(row);
		let adapter;
		switch (adapterType) {
			case "mikrotik_rest":
			case "mikrotik_api":
				adapter = new MikrotikRestAdapter(routerRef, cfg);
				break;
			default: adapter = new MikrotikRestAdapter(routerRef, cfg);
		}
		adapterCache.set(`router:${routerRef}`, adapter);
		return adapter;
	}
	async getSessionAdapter(routerRef) {
		const row = await resolveRouter(routerRef);
		return new RouterAdapterSessionBridge(await this.getRouterAdapter(routerRef), row.tenant_id);
	}
	async getAuthAdapter(routerRef) {
		const row = await resolveRouter(routerRef);
		const adapterType = resolveAdapterType(row);
		const { data: nas } = await supabase.from("nas_devices").select("id").eq("router_id", routerRef).eq("is_active", true).maybeSingle();
		if (nas || adapterType === "freeradius" || adapterType === "radius_proxy") return new FreeRadiusAuthAdapter(row.tenant_id);
		const { data: umAdapter } = await supabase.from("network_adapters").select("id").eq("router_id", routerRef).contains("supported_features", ["user_manager"]).maybeSingle();
		if (umAdapter) return new MikrotikUserManagerAdapter(routerRef, buildConnectionConfig(row));
		return new RouterAdapterAuthBridge(await this.getRouterAdapter(routerRef));
	}
	async getBandwidthAdapter(routerRef) {
		const row = await resolveRouter(routerRef);
		const { data: nas } = await supabase.from("nas_devices").select("id").eq("router_id", routerRef).eq("is_active", true).maybeSingle();
		if (nas) return new FreeRadiusBandwidthAdapter(row.tenant_id);
		return new RouterAdapterBandwidthBridge(await this.getRouterAdapter(routerRef));
	}
};
var RouterAdapterSessionBridge = class {
	adapterType;
	router;
	tenantId;
	constructor(router, tenantId) {
		this.router = router;
		this.adapterType = router.adapterType;
		this.tenantId = tenantId;
	}
	async listSessions(routerRef) {
		const result = await this.router.getActiveSessions();
		if (!result.success) throw new Error(result.error ?? "Failed to list sessions");
		return result.data ?? [];
	}
	async terminateSession(_routerRef, sessionRef) {
		const result = await this.router.kickSession(sessionRef);
		if (!result.success) throw new Error(result.error ?? "Failed to kick session");
	}
	async changeAuthorization(routerRef, username, policy) {
		const result = await this.router.applyBandwidthPolicy(username, policy);
		if (!result.success) throw new Error(result.error ?? "CoA failed");
	}
	async sendDisconnect(routerRef, username) {
		await new RadiusSessionAdapter(this.tenantId).sendDisconnect(routerRef, username);
	}
};
var RouterAdapterAuthBridge = class {
	adapterType;
	router;
	constructor(router) {
		this.router = router;
		this.adapterType = router.adapterType;
	}
	async provisionCredentials(_routerRef, creds) {
		const result = await this.router.addUser(creds);
		if (!result.success) throw new Error(result.error ?? "Provision failed");
	}
	async deprovisionCredentials(_routerRef, username) {
		const result = await this.router.removeUser(username, "hotspot");
		if (!result.success) throw new Error(result.error ?? "Deprovision failed");
	}
	async updateCredentials(_routerRef, username, updates) {
		const result = await this.router.updateUser(username, updates);
		if (!result.success) throw new Error(result.error ?? "Update failed");
	}
	async verifyCredentials(_routerRef, _username) {
		return (await this.router.getStatus()).success;
	}
};
var RouterAdapterBandwidthBridge = class {
	adapterType;
	router;
	constructor(router) {
		this.router = router;
		this.adapterType = router.adapterType;
	}
	renderRateLimit(policy) {
		const { renderMikrotikRateLimit } = (init_mikrotik_rest(), __toCommonJS(mikrotik_rest_exports));
		return renderMikrotikRateLimit(policy);
	}
	async applyPolicy(_routerRef, username, policy) {
		const result = await this.router.applyBandwidthPolicy(username, policy);
		if (!result.success) throw new Error(result.error ?? "Policy apply failed");
	}
	async removePolicy(_routerRef, username) {
		const result = await this.router.updateUser(username, { rateLimit: null });
		if (!result.success) throw new Error(result.error ?? "Policy remove failed");
	}
	async applyBurst(_routerRef, _username, _durationSec, _multiplier) {}
};
var adapterFactory = new AdapterFactory();
//#endregion
export { adapterFactory as t };
