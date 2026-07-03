import { i as __toESM } from "../_runtime.mjs";
import { a as supabase, i as init_client } from "./client-D3kKP_Nv.mjs";
import { u as require_react } from "../_libs/@floating-ui/react-dom+[...].mjs";
import { s as require_jsx_runtime } from "../_libs/@radix-ui/react-arrow+[...].mjs";
import { i as useQueryClient, n as useQuery, t as useMutation } from "../_libs/tanstack__react-query.mjs";
import { a as useTenantId, i as useAuth } from "./auth-z02iFWqz.mjs";
import { n as cn, t as Button } from "./button-DRsC1qZi.mjs";
import { t as Input } from "./input-DicJzR9-.mjs";
import { t as Label } from "./label-B4PTMSG2.mjs";
import { E as Server, I as Plus, M as RefreshCw, O as Search, b as SquarePen, m as Trash2, t as Zap, w as ShieldCheck } from "../_libs/lucide-react.mjs";
import { a as DialogTitle, i as DialogHeader, n as DialogContent, r as DialogFooter, t as Dialog } from "./dialog-BpdftUtE.mjs";
import { a as SelectValue, i as SelectTrigger, n as SelectContent, r as SelectItem, t as Select } from "./select-DUy71i1r.mjs";
import { i as TabsTrigger, n as TabsContent, r as TabsList, t as Tabs } from "./tabs-WTjz7Ps0.mjs";
import { n as toast } from "../_libs/sonner.mjs";
import { a as objectType, n as coerce, o as stringType, r as enumType, t as booleanType } from "../_libs/zod.mjs";
import { n as useForm, t as u } from "../_libs/@hookform/resolvers+[...].mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/aaa-DsalFqX2.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
init_client();
function now$4() {
	return (/* @__PURE__ */ new Date()).toISOString();
}
function mapRow$2(r) {
	return {
		id: r["id"],
		tenantId: r["tenant_id"],
		name: r["name"],
		host: r["host"],
		authPort: r["auth_port"] ?? 1812,
		acctPort: r["acct_port"] ?? 1813,
		coaPort: r["coa_port"] ?? 3799,
		sharedSecret: r["shared_secret"],
		protocol: r["protocol"] ?? "mschapv2",
		role: r["role"] ?? "primary",
		isPrimary: r["is_primary"] ?? true,
		isActive: r["is_active"] ?? true,
		timeoutMs: r["timeout_ms"] ?? 3e3,
		retryCount: r["retry_count"] ?? 3,
		priority: r["priority"] ?? 1,
		failoverStrategy: r["failover_strategy"] ?? "priority",
		isHealthy: r["is_healthy"] ?? null,
		lastChecked: r["last_checked"] ?? null,
		consecutiveFailures: r["consecutive_failures"] ?? 0,
		lastFailureReason: r["last_failure_reason"] ?? null,
		latencyMs: r["latency_ms"] ?? null,
		createdAt: r["created_at"],
		updatedAt: r["updated_at"]
	};
}
var rrIndex = /* @__PURE__ */ new Map();
function nextRoundRobin(tenantId, servers) {
	const idx = (rrIndex.get(tenantId) ?? 0) % servers.length;
	rrIndex.set(tenantId, idx + 1);
	return servers[idx];
}
var RadiusServerPoolService = class {
	async list(tenantId) {
		const { data, error } = await supabase.from("radius_servers").select("*").eq("tenant_id", tenantId).order("priority");
		if (error) throw new Error(error.message);
		return (data ?? []).map(mapRow$2);
	}
	async get(serverId) {
		const { data } = await supabase.from("radius_servers").select("*").eq("id", serverId).maybeSingle();
		return data ? mapRow$2(data) : null;
	}
	async save(tenantId, server) {
		const r = server;
		const payload = {
			tenant_id: tenantId,
			name: r["name"],
			host: r["host"],
			auth_port: r["authPort"] ?? r["auth_port"] ?? 1812,
			acct_port: r["acctPort"] ?? r["acct_port"] ?? 1813,
			coa_port: r["coaPort"] ?? r["coa_port"] ?? 3799,
			shared_secret: r["sharedSecret"] ?? r["shared_secret"] ?? "",
			protocol: r["protocol"] ?? "mschapv2",
			role: r["role"] ?? "primary",
			is_primary: r["isPrimary"] ?? r["is_primary"] ?? true,
			is_active: r["isActive"] ?? r["is_active"] ?? true,
			timeout_ms: r["timeoutMs"] ?? r["timeout_ms"] ?? 3e3,
			retry_count: r["retryCount"] ?? r["retry_count"] ?? 3,
			priority: r["priority"] ?? 1,
			failover_strategy: r["failoverStrategy"] ?? r["failover_strategy"] ?? "priority",
			consecutive_failures: 0,
			updated_at: now$4()
		};
		if (server.id) {
			const { data, error } = await supabase.from("radius_servers").update(payload).eq("id", server.id).select().single();
			if (error) throw new Error(error.message);
			return mapRow$2(data);
		}
		const { data, error } = await supabase.from("radius_servers").insert(payload).select().single();
		if (error) throw new Error(error.message);
		return mapRow$2(data);
	}
	async delete(serverId) {
		const { error } = await supabase.from("radius_servers").delete().eq("id", serverId);
		if (error) throw new Error(error.message);
	}
	/**
	* Select the best RADIUS server for a tenant using its failover strategy.
	* Returns null if no healthy server is available.
	*/
	async selectServer(tenantId) {
		const servers = await this.list(tenantId);
		const healthy = servers.filter((s) => s.isActive && s.isHealthy !== false);
		if (!healthy.length) return servers.filter((s) => s.isActive)[0] ?? null;
		switch (healthy[0]?.failoverStrategy ?? "priority") {
			case "priority": return healthy.sort((a, b) => a.priority - b.priority)[0];
			case "round_robin": return nextRoundRobin(tenantId, healthy);
			case "least_latency": return healthy.filter((s) => s.latencyMs !== null).sort((a, b) => (a.latencyMs ?? 9999) - (b.latencyMs ?? 9999))[0] ?? healthy[0];
			case "random": return healthy[Math.floor(Math.random() * healthy.length)];
			default: return healthy[0];
		}
	}
	/**
	* Select an ordered list of servers for failover retry.
	*/
	async getFailoverChain(tenantId) {
		return (await this.list(tenantId)).filter((s) => s.isActive).sort((a, b) => a.priority - b.priority);
	}
	async recordHealthCheck(serverId, isHealthy, latencyMs, failureReason) {
		const current = await this.get(serverId);
		if (!current) return;
		const consecutiveFailures = isHealthy ? 0 : current.consecutiveFailures + 1;
		const status = isHealthy ? "healthy" : consecutiveFailures >= 5 ? "unhealthy" : "degraded";
		await supabase.from("radius_servers").update({
			is_healthy: isHealthy,
			last_checked: now$4(),
			latency_ms: latencyMs,
			consecutive_failures: consecutiveFailures,
			last_failure_reason: failureReason ?? null,
			updated_at: now$4()
		}).eq("id", serverId);
		await supabase.from("radius_health_checks").insert({
			tenant_id: current.tenantId,
			server_id: serverId,
			is_healthy: isHealthy,
			latency_ms: latencyMs,
			status,
			error: failureReason ?? null,
			checked_at: now$4()
		}).catch(() => {});
		if (!isHealthy && consecutiveFailures === 3) await supabase.from("job_queue").insert({
			tenant_id: current.tenantId,
			type: "notify_admin",
			payload: {
				event: "radius.server_unhealthy",
				server_id: serverId,
				server_name: current.name,
				reason: failureReason
			},
			priority: 1,
			queue_name: "notifications"
		}).catch(() => {});
	}
	async getHealthSnapshots(tenantId) {
		const servers = await this.list(tenantId);
		const since1h = (/* @__PURE__ */ new Date(Date.now() - 36e5)).toISOString();
		return await Promise.all(servers.map(async (s) => {
			const { data: events } = await supabase.from("auth_events").select("event_type").eq("tenant_id", tenantId).gte("received_at", since1h);
			const ev = events ?? [];
			const authReqs = ev.filter((e) => [
				"auth_success",
				"auth_failure",
				"auth_reject"
			].includes(e.event_type)).length;
			const failures = ev.filter((e) => ["auth_failure", "auth_reject"].includes(e.event_type)).length;
			const { count: acctCount } = await supabase.from("radius_accounting").select("id", {
				count: "exact",
				head: true
			}).eq("tenant_id", tenantId).gte("received_at", since1h);
			const status = s.isHealthy === null ? "unknown" : s.isHealthy && s.consecutiveFailures === 0 ? "healthy" : s.isHealthy && s.consecutiveFailures > 0 ? "degraded" : "unhealthy";
			return {
				serverId: s.id,
				serverName: s.name,
				host: s.host,
				role: s.role,
				status,
				latencyMs: s.latencyMs,
				consecutiveFailures: s.consecutiveFailures,
				lastChecked: s.lastChecked,
				lastFailureReason: s.lastFailureReason,
				authRequestsPerMin: Math.round(authReqs / 60),
				acctRequestsPerMin: Math.round((acctCount ?? 0) / 60),
				failureRatePercent: authReqs > 0 ? Math.round(failures / authReqs * 100) : 0
			};
		}));
	}
};
var radiusServerPool = new RadiusServerPoolService();
init_client();
function now$3() {
	return (/* @__PURE__ */ new Date()).toISOString();
}
function mapRow$1(r) {
	return {
		id: r["id"],
		tenantId: r["tenant_id"],
		routerId: r["router_id"] ?? null,
		name: r["name"],
		description: r["description"] ?? null,
		vendor: r["vendor"] ?? "mikrotik",
		nasIdentifier: r["nas_identifier"] ?? null,
		nasIp: r["nas_ip"] ?? null,
		sharedSecret: r["shared_secret"],
		authPort: r["auth_port"] ?? 1812,
		acctPort: r["acct_port"] ?? 1813,
		coaPort: r["coa_port"] ?? 3799,
		isActive: r["is_active"] ?? true,
		lastSeen: r["last_seen"] ?? null,
		radiusServerId: r["radius_server_id"] ?? null,
		dynamicVlanEnabled: r["dynamic_vlan_enabled"] ?? false,
		dynamicProfileEnabled: r["dynamic_profile_enabled"] ?? true,
		dynamicIpEnabled: r["dynamic_ip_enabled"] ?? false,
		createdAt: r["created_at"],
		updatedAt: r["updated_at"]
	};
}
var NasManagementService = class {
	async list(tenantId) {
		const { data, error } = await supabase.from("nas_devices").select("*, routers(name, status)").eq("tenant_id", tenantId).order("created_at", { ascending: false });
		if (error) throw new Error(error.message);
		return (data ?? []).map((r) => ({
			...mapRow$1(r),
			routerName: r.routers?.name ?? null,
			routerStatus: r.routers?.status ?? null
		}));
	}
	async get(nasId) {
		const { data } = await supabase.from("nas_devices").select("*").eq("id", nasId).maybeSingle();
		return data ? mapRow$1(data) : null;
	}
	async save(tenantId, nas) {
		const r = nas;
		const sharedSecret = r["sharedSecret"] ?? r["shared_secret"] ?? "";
		const radiusServerId = r["radiusServerId"] ?? r["radius_server_id"] ?? null;
		const payload = {
			tenant_id: tenantId,
			router_id: r["routerId"] ?? r["router_id"] ?? null,
			name: r["name"],
			description: r["description"] ?? null,
			vendor: r["vendor"] ?? "mikrotik",
			nas_identifier: r["nasIdentifier"] ?? r["nas_identifier"] ?? null,
			nas_ip: r["nasIp"] ?? r["nas_ip"] ?? null,
			shared_secret: sharedSecret,
			auth_port: r["authPort"] ?? r["auth_port"] ?? 1812,
			acct_port: r["acctPort"] ?? r["acct_port"] ?? 1813,
			coa_port: r["coaPort"] ?? r["coa_port"] ?? 3799,
			is_active: r["isActive"] ?? r["is_active"] ?? true,
			radius_server_id: radiusServerId || null,
			dynamic_vlan_enabled: r["dynamicVlanEnabled"] ?? r["dynamic_vlan_enabled"] ?? false,
			dynamic_profile_enabled: r["dynamicProfileEnabled"] ?? r["dynamic_profile_enabled"] ?? true,
			dynamic_ip_enabled: r["dynamicIpEnabled"] ?? r["dynamic_ip_enabled"] ?? false,
			updated_at: now$3()
		};
		if (nas.id) {
			const { data, error } = await supabase.from("nas_devices").update(payload).eq("id", nas.id).select().single();
			if (error) throw new Error(error.message);
			return mapRow$1(data);
		}
		const { data, error } = await supabase.from("nas_devices").insert(payload).select().single();
		if (error) throw new Error(error.message);
		return mapRow$1(data);
	}
	async delete(nasId) {
		const { error } = await supabase.from("nas_devices").delete().eq("id", nasId);
		if (error) throw new Error(error.message);
	}
	async setActive(nasId, isActive) {
		await supabase.from("nas_devices").update({
			is_active: isActive,
			updated_at: now$3()
		}).eq("id", nasId);
	}
	/**
	* Resolve NAS from RADIUS packet attributes.
	* Uses DB lookup — never hardcoded IP matching.
	*/
	async resolveFromPacket(opts) {
		let data = null;
		if (opts.nasIdentifier) data = (await supabase.from("nas_devices").select("*").eq("nas_identifier", opts.nasIdentifier).eq("is_active", true).maybeSingle()).data;
		if (!data && opts.nasIp) data = (await supabase.from("nas_devices").select("*").eq("nas_ip", opts.nasIp).eq("is_active", true).maybeSingle()).data;
		if (!data) return null;
		const nas = mapRow$1(data);
		return {
			nas,
			tenantId: nas.tenantId
		};
	}
	async touchLastSeen(nasId) {
		await supabase.from("nas_devices").update({
			last_seen: now$3(),
			updated_at: now$3()
		}).eq("id", nasId);
	}
	async getHealthSnapshots(tenantId) {
		const devices = await this.list(tenantId);
		const since1h = (/* @__PURE__ */ new Date(Date.now() - 36e5)).toISOString();
		return Promise.all(devices.map(async (nas) => {
			const [sessions, authEvents, acctRows] = await Promise.all([
				supabase.from("sessions").select("id", {
					count: "exact",
					head: true
				}).eq("tenant_id", tenantId).is("ended_at", null),
				supabase.from("auth_events").select("event_type").eq("tenant_id", tenantId).eq("nas_id", nas.id).gte("received_at", since1h),
				supabase.from("radius_accounting").select("id", {
					count: "exact",
					head: true
				}).eq("tenant_id", tenantId).eq("nas_id", nas.id).gte("received_at", since1h)
			]);
			const ev = authEvents.data ?? [];
			return {
				nasId: nas.id,
				nasName: nas.name,
				vendor: nas.vendor,
				isActive: nas.isActive,
				lastSeen: nas.lastSeen,
				activeSessionCount: sessions.count ?? 0,
				authSuccessLast1h: ev.filter((e) => e.event_type === "auth_success").length,
				authFailureLast1h: ev.filter((e) => ["auth_failure", "auth_reject"].includes(e.event_type)).length,
				acctRecordsLast1h: acctRows.count ?? 0
			};
		}));
	}
};
var nasManagement = new NasManagementService();
init_client();
function now$2() {
	return (/* @__PURE__ */ new Date()).toISOString();
}
var AccountingService = class {
	/**
	* Process an accounting record from any NAS vendor.
	* Resolves tenant by NAS identifier/IP — never by hardcoded values.
	*/
	async process(body) {
		const { nas_identifier, nas_ip, username, session_id, framed_ip, calling_station, called_station, acct_status_type, acct_input_octets = 0, acct_output_octets = 0, acct_session_time = 0, acct_input_packets = 0, acct_output_packets = 0, acct_terminate_cause, service_type, nas_port_type, raw_attrs = {}, tenant_id, received_by_server = null } = body;
		if (!username || !acct_status_type) throw new Error("username and acct_status_type required");
		let resolvedTenantId = tenant_id;
		let nasDeviceId = null;
		if (!resolvedTenantId) {
			const resolved = await nasManagement.resolveFromPacket({
				nasIdentifier: nas_identifier ?? null,
				nasIp: nas_ip ?? null
			});
			if (resolved) {
				resolvedTenantId = resolved.tenantId;
				nasDeviceId = resolved.nas.id;
			}
		}
		const { data: acctRow, error: acctErr } = await supabase.from("radius_accounting").insert({
			tenant_id: resolvedTenantId,
			nas_id: nasDeviceId,
			session_id,
			nas_identifier,
			username,
			framed_ip,
			calling_station,
			called_station,
			acct_status_type,
			acct_input_octets,
			acct_output_octets,
			acct_session_time,
			acct_input_packets,
			acct_output_packets,
			acct_terminate_cause,
			service_type,
			nas_port_type,
			raw_attrs,
			received_at: now$2(),
			received_by_server,
			is_replicated: false
		}).select("id").single();
		if (acctErr) throw new Error(`Accounting insert failed: ${acctErr.message}`);
		const statusType = acct_status_type;
		await this._updateSessionState(resolvedTenantId, nasDeviceId, username, session_id, statusType, {
			framedIp: framed_ip ?? null,
			callingStation: calling_station ?? null,
			bytesIn: acct_input_octets,
			bytesOut: acct_output_octets,
			sessionTime: acct_session_time,
			terminateCause: acct_terminate_cause ?? null
		});
		if (nasDeviceId) await nasManagement.touchLastSeen(nasDeviceId);
		if (resolvedTenantId) await this._enqueueReplication(resolvedTenantId, acctRow.id);
	}
	/**
	* Session state machine:
	* Start → create session
	* Interim-Update → update bytes
	* Stop → close session + update subscription usage
	* Accounting-On/Off → NAS restart handling
	*/
	async _updateSessionState(tenantId, nasId, username, sessionId, statusType, data) {
		const { data: sub } = await supabase.from("subscriptions").select("id, customer_id, tenant_id").eq("username", username).eq("status", "active").maybeSingle();
		if (statusType === "Start") {
			await supabase.from("sessions").upsert({
				tenant_id: tenantId ?? sub?.tenant_id,
				customer_id: sub?.customer_id ?? null,
				subscription_id: sub?.id ?? null,
				username,
				nas_session_id: sessionId,
				ip_address: data.framedIp,
				mac_address: data.callingStation,
				bytes_in: data.bytesIn,
				bytes_out: data.bytesOut,
				started_at: now$2()
			}, {
				onConflict: "username,tenant_id",
				ignoreDuplicates: false
			});
			if (sub?.customer_id && tenantId) await this._detectConcurrentSessions(tenantId, sub.customer_id, username);
			if (data.callingStation && sub?.customer_id && tenantId) await this._detectMacCloning(tenantId, sub.customer_id, data.callingStation, username);
		} else if (statusType === "Interim-Update") await supabase.from("sessions").update({
			bytes_in: data.bytesIn,
			bytes_out: data.bytesOut,
			updated_at: now$2()
		}).eq("username", username).is("ended_at", null);
		else if (statusType === "Stop") {
			await supabase.from("sessions").update({
				bytes_in: data.bytesIn,
				bytes_out: data.bytesOut,
				duration_seconds: data.sessionTime,
				ended_at: now$2(),
				terminated_by: data.terminateCause ?? "User-Request"
			}).eq("username", username).is("ended_at", null);
			if (sub?.id) {
				const totalMb = Math.ceil((data.bytesIn + data.bytesOut) / (1024 * 1024));
				const { error: rpcErr } = await supabase.rpc("fn_increment_data_usage", {
					_subscription_id: sub.id,
					_mb: totalMb
				});
				if (rpcErr) {
					const { data: current } = await supabase.from("subscriptions").select("data_used_mb").eq("id", sub.id).single();
					await supabase.from("subscriptions").update({
						data_used_mb: (current?.data_used_mb ?? 0) + totalMb,
						last_connected: now$2()
					}).eq("id", sub.id);
				} else await supabase.from("subscriptions").update({ last_connected: now$2() }).eq("id", sub.id);
			}
		} else if (statusType === "Accounting-On" || statusType === "Accounting-Off") {
			if (nasId && statusType === "Accounting-Off") await supabase.from("sessions").update({
				ended_at: now$2(),
				terminated_by: "NAS-Reboot"
			}).eq("tenant_id", tenantId).is("ended_at", null);
		}
	}
	async _detectConcurrentSessions(tenantId, customerId, username) {
		const { data } = await supabase.from("sessions").select("id").eq("tenant_id", tenantId).eq("customer_id", customerId).is("ended_at", null);
		if ((data?.length ?? 0) > 3) await supabase.from("fraud_incidents").insert({
			tenant_id: tenantId,
			customer_id: customerId,
			type: "concurrent_login",
			severity: "medium",
			description: `Customer has ${data.length} concurrent sessions`,
			evidence: {
				username,
				session_count: data.length
			},
			status: "open"
		}).catch(() => {});
	}
	async _detectMacCloning(tenantId, customerId, mac, username) {
		const { data } = await supabase.from("sessions").select("customer_id").eq("tenant_id", tenantId).eq("mac_address", mac).neq("customer_id", customerId).is("ended_at", null).limit(1);
		if (data?.length) await supabase.from("fraud_incidents").insert({
			tenant_id: tenantId,
			customer_id: customerId,
			type: "mac_cloning",
			severity: "high",
			description: `MAC ${mac} used by multiple accounts`,
			evidence: {
				mac,
				username
			},
			status: "open"
		}).catch(() => {});
	}
	async _enqueueReplication(tenantId, acctId) {
		await supabase.from("job_queue").insert({
			tenant_id: tenantId,
			type: "sync_router",
			payload: {
				action: "replicate_accounting",
				acct_id: acctId
			},
			priority: 5,
			queue_name: "router_sync",
			run_at: now$2()
		}).catch(() => {});
	}
	async getRecords(tenantId, opts = {}) {
		let q = supabase.from("radius_accounting").select("*").eq("tenant_id", tenantId).order("received_at", { ascending: false }).limit(opts.limit ?? 200);
		if (opts.username) q = q.ilike("username", `%${opts.username}%`);
		if (opts.nasId) q = q.eq("nas_id", opts.nasId);
		if (opts.statusType) q = q.eq("acct_status_type", opts.statusType);
		if (opts.since) q = q.gte("received_at", opts.since);
		const { data } = await q;
		return (data ?? []).map((r) => ({
			id: r["id"],
			tenantId: r["tenant_id"],
			nasId: r["nas_id"],
			sessionId: r["session_id"],
			nasIdentifier: r["nas_identifier"],
			username: r["username"],
			framedIp: r["framed_ip"],
			callingStation: r["calling_station"],
			calledStation: r["called_station"],
			acctStatusType: r["acct_status_type"],
			acctInputOctets: r["acct_input_octets"],
			acctOutputOctets: r["acct_output_octets"],
			acctSessionTime: r["acct_session_time"],
			acctInputPackets: r["acct_input_packets"],
			acctOutputPackets: r["acct_output_packets"],
			acctTerminateCause: r["acct_terminate_cause"],
			serviceType: r["service_type"],
			nasPortType: r["nas_port_type"],
			rawAttrs: r["raw_attrs"],
			receivedAt: r["received_at"],
			receivedByServer: r["received_by_server"],
			isReplicated: r["is_replicated"]
		}));
	}
	async getStats(tenantId, since) {
		const [events, acctCount, activeSessions] = await Promise.all([
			supabase.from("auth_events").select("event_type").eq("tenant_id", tenantId).gte("received_at", since),
			supabase.from("radius_accounting").select("id", {
				count: "exact",
				head: true
			}).eq("tenant_id", tenantId).gte("received_at", since),
			supabase.from("sessions").select("id", {
				count: "exact",
				head: true
			}).eq("tenant_id", tenantId).is("ended_at", null)
		]);
		const ev = events.data ?? [];
		const total = ev.length;
		const failures = ev.filter((e) => ["auth_failure", "auth_reject"].includes(e.event_type)).length;
		return {
			authSuccess: ev.filter((e) => e.event_type === "auth_success").length,
			authFailure: ev.filter((e) => e.event_type === "auth_failure").length,
			authReject: ev.filter((e) => e.event_type === "auth_reject").length,
			acctRecords: acctCount.count ?? 0,
			activeSessions: activeSessions.count ?? 0,
			failureRatePercent: total > 0 ? Math.round(failures / total * 100) : 0
		};
	}
};
var accountingService = new AccountingService();
init_client();
function now$1() {
	return (/* @__PURE__ */ new Date()).toISOString();
}
var RadiusMonitoringService = class {
	async runHealthCycle(tenantId) {
		const servers = await radiusServerPool.list(tenantId);
		for (const server of servers.filter((s) => s.isActive)) {
			const start = Date.now();
			let isHealthy = false;
			let failureReason;
			try {
				const { data, error } = await supabase.functions.invoke("health-check", { body: {
					service: "radius",
					server_id: server.id,
					tenant_id: tenantId
				} });
				isHealthy = !error && data?.healthy === true;
				if (!isHealthy) failureReason = error?.message ?? data?.error ?? "Probe failed";
			} catch (e) {
				failureReason = e.message;
			}
			await radiusServerPool.recordHealthCheck(server.id, isHealthy, Date.now() - start, failureReason);
		}
	}
	async getAaaStats(tenantId) {
		const since1h = (/* @__PURE__ */ new Date(Date.now() - 36e5)).toISOString();
		const [stats, servers, nasDevices] = await Promise.all([
			accountingService.getStats(tenantId, since1h),
			radiusServerPool.list(tenantId),
			nasManagement.list(tenantId)
		]);
		const { data: latencyRows } = await supabase.from("radius_health_checks").select("latency_ms").eq("tenant_id", tenantId).eq("is_healthy", true).gte("checked_at", since1h).limit(100);
		const latencies = (latencyRows ?? []).map((r) => r.latency_ms).filter(Boolean);
		const avgLatency = latencies.length > 0 ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : null;
		return {
			...stats,
			activeNasDevices: nasDevices.filter((n) => n.isActive).length,
			healthyRadiusServers: servers.filter((s) => s.isHealthy === true).length,
			avgAuthLatencyMs: avgLatency
		};
	}
	async getAuthTimeline(tenantId, hours = 24) {
		const since = (/* @__PURE__ */ new Date(Date.now() - hours * 36e5)).toISOString();
		const { data } = await supabase.from("auth_events").select("event_type, received_at").eq("tenant_id", tenantId).gte("received_at", since).order("received_at");
		const buckets = /* @__PURE__ */ new Map();
		for (const row of data ?? []) {
			const hour = new Date(row.received_at).toISOString().slice(0, 13);
			if (!buckets.has(hour)) buckets.set(hour, {
				success: 0,
				failure: 0,
				reject: 0
			});
			const b = buckets.get(hour);
			if (row.event_type === "auth_success") b.success++;
			else if (row.event_type === "auth_failure") b.failure++;
			else if (row.event_type === "auth_reject") b.reject++;
		}
		return Array.from(buckets.entries()).map(([hour, counts]) => ({
			hour,
			...counts
		})).sort((a, b) => a.hour.localeCompare(b.hour));
	}
	async getAccountingByNas(tenantId) {
		const since = (/* @__PURE__ */ new Date(Date.now() - 864e5)).toISOString();
		const { data } = await supabase.from("radius_accounting").select("nas_id, acct_status_type, nas_devices(name)").eq("tenant_id", tenantId).gte("received_at", since);
		const map = /* @__PURE__ */ new Map();
		for (const row of data ?? []) {
			const name = row.nas_devices?.name ?? row.nas_id ?? "Unknown";
			if (!map.has(name)) map.set(name, {
				nasName: name,
				startCount: 0,
				stopCount: 0,
				updateCount: 0
			});
			const b = map.get(name);
			if (row.acct_status_type === "Start") b.startCount++;
			else if (row.acct_status_type === "Stop") b.stopCount++;
			else if (row.acct_status_type === "Interim-Update") b.updateCount++;
		}
		return Array.from(map.values());
	}
	async getAuthEvents(tenantId, opts = {}) {
		let q = supabase.from("auth_events").select("*, nas_devices(name,vendor)").eq("tenant_id", tenantId).order("received_at", { ascending: false }).limit(opts.limit ?? 200);
		if (opts.eventType) q = q.eq("event_type", opts.eventType);
		if (opts.username) q = q.ilike("username", `%${opts.username}%`);
		if (opts.since) q = q.gte("received_at", opts.since);
		const { data } = await q;
		return data ?? [];
	}
	async triggerFailover(tenantId, failedServerId) {
		await supabase.from("radius_servers").update({
			is_healthy: false,
			consecutive_failures: 99,
			updated_at: now$1()
		}).eq("id", failedServerId);
		const next = await radiusServerPool.selectServer(tenantId);
		await supabase.from("job_queue").insert({
			tenant_id: tenantId,
			type: "notify_admin",
			payload: {
				event: "radius.failover_triggered",
				failed_server_id: failedServerId,
				promoted_server_id: next?.id
			},
			priority: 1,
			queue_name: "notifications"
		}).catch(() => {});
		return next?.id ?? null;
	}
};
var radiusMonitoring = new RadiusMonitoringService();
init_client();
function now() {
	return (/* @__PURE__ */ new Date()).toISOString();
}
function mapRow(r) {
	return {
		id: r["id"],
		tenantId: r["tenant_id"],
		name: r["name"],
		description: r["description"] ?? null,
		clientIp: r["client_ip"],
		sharedSecret: r["shared_secret"],
		vendor: r["vendor"] ?? "generic",
		isActive: r["is_active"] ?? true,
		lastSeen: r["last_seen"] ?? null,
		createdAt: r["created_at"],
		updatedAt: r["updated_at"]
	};
}
var RadiusClientService = class {
	async list(tenantId) {
		const { data, error } = await supabase.from("radius_clients").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false });
		if (error) throw new Error(error.message);
		return (data ?? []).map(mapRow);
	}
	async get(clientId) {
		const { data } = await supabase.from("radius_clients").select("*").eq("id", clientId).maybeSingle();
		return data ? mapRow(data) : null;
	}
	async findByIp(tenantId, clientIp) {
		const { data } = await supabase.from("radius_clients").select("*").eq("tenant_id", tenantId).eq("client_ip", clientIp).eq("is_active", true).maybeSingle();
		return data ? mapRow(data) : null;
	}
	async listActive(tenantId) {
		const { data, error } = await supabase.from("radius_clients").select("*").eq("tenant_id", tenantId).eq("is_active", true).order("created_at", { ascending: false });
		if (error) throw new Error(error.message);
		return (data ?? []).map(mapRow);
	}
	async save(tenantId, client) {
		const payload = {
			tenant_id: tenantId,
			name: client.name,
			description: client.description ?? null,
			client_ip: client.clientIp,
			shared_secret: client.sharedSecret,
			vendor: client.vendor ?? "generic",
			is_active: client.isActive ?? true,
			updated_at: now()
		};
		if (client.id) {
			const { data, error } = await supabase.from("radius_clients").update(payload).eq("id", client.id).select().single();
			if (error) throw new Error(error.message);
			return mapRow(data);
		}
		const { data, error } = await supabase.from("radius_clients").insert(payload).select().single();
		if (error) throw new Error(error.message);
		return mapRow(data);
	}
	async delete(clientId) {
		const { error } = await supabase.from("radius_clients").delete().eq("id", clientId);
		if (error) throw new Error(error.message);
	}
	async touchLastSeen(clientId) {
		await supabase.from("radius_clients").update({
			last_seen: now(),
			updated_at: now()
		}).eq("id", clientId);
	}
};
var radiusClientService = new RadiusClientService();
var Table = import_react.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
	className: "relative w-full overflow-auto",
	children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("table", {
		ref,
		className: cn("w-full caption-bottom text-sm", className),
		...props
	})
}));
Table.displayName = "Table";
var TableHeader = import_react.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("thead", {
	ref,
	className: cn("[&_tr]:border-b", className),
	...props
}));
TableHeader.displayName = "TableHeader";
var TableBody = import_react.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tbody", {
	ref,
	className: cn("[&_tr:last-child]:border-0", className),
	...props
}));
TableBody.displayName = "TableBody";
var TableFooter = import_react.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tfoot", {
	ref,
	className: cn("border-t bg-muted/50 font-medium [&>tr]:last:border-b-0", className),
	...props
}));
TableFooter.displayName = "TableFooter";
var TableRow = import_react.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tr", {
	ref,
	className: cn("border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted", className),
	...props
}));
TableRow.displayName = "TableRow";
var TableHead = import_react.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
	ref,
	className: cn("h-10 px-2 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]", className),
	...props
}));
TableHead.displayName = "TableHead";
var TableCell = import_react.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
	ref,
	className: cn("p-2 align-middle [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]", className),
	...props
}));
TableCell.displayName = "TableCell";
var TableCaption = import_react.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("caption", {
	ref,
	className: cn("mt-4 text-sm text-muted-foreground", className),
	...props
}));
TableCaption.displayName = "TableCaption";
var serverSchema = objectType({
	name: stringType().min(1),
	host: stringType().min(1),
	auth_port: coerce.number().min(1).default(1812),
	acct_port: coerce.number().min(1).default(1813),
	coa_port: coerce.number().min(1).default(3799),
	shared_secret: stringType().min(1),
	protocol: enumType([
		"pap",
		"chap",
		"mschapv2",
		"eap-tls",
		"eap-ttls",
		"peap"
	]).default("mschapv2"),
	role: enumType([
		"primary",
		"secondary",
		"tertiary",
		"backup"
	]).default("primary"),
	is_active: booleanType().default(true),
	timeout_ms: coerce.number().min(100).default(3e3),
	retry_count: coerce.number().min(1).default(3),
	priority: coerce.number().min(1).default(1),
	failover_strategy: enumType([
		"priority",
		"round_robin",
		"least_latency",
		"random"
	]).default("priority")
});
var nasSchema = objectType({
	name: stringType().min(1),
	description: stringType().optional(),
	vendor: enumType([
		"mikrotik",
		"cisco",
		"ubiquiti",
		"freeradius",
		"juniper",
		"huawei",
		"generic"
	]).default("mikrotik"),
	nas_identifier: stringType().optional(),
	nas_ip: stringType().optional(),
	shared_secret: stringType().min(1),
	auth_port: coerce.number().min(1).default(1812),
	acct_port: coerce.number().min(1).default(1813),
	coa_port: coerce.number().min(1).default(3799),
	is_active: booleanType().default(true),
	dynamic_vlan_enabled: booleanType().default(false),
	dynamic_profile_enabled: booleanType().default(true),
	dynamic_ip_enabled: booleanType().default(false),
	radius_server_id: stringType().optional().nullable()
});
var clientSchema = objectType({
	name: stringType().min(1),
	description: stringType().optional(),
	clientIp: stringType().min(1),
	sharedSecret: stringType().min(1),
	vendor: enumType([
		"mikrotik",
		"cisco",
		"ubiquiti",
		"freeradius",
		"juniper",
		"huawei",
		"generic"
	]).default("generic"),
	isActive: booleanType().default(true)
});
function AaaPage() {
	const { user } = useAuth();
	const qc = useQueryClient();
	const [tab, setTab] = (0, import_react.useState)("overview");
	const [serverDialogOpen, setServerDialogOpen] = (0, import_react.useState)(false);
	const [nasDialogOpen, setNasDialogOpen] = (0, import_react.useState)(false);
	const [clientDialogOpen, setClientDialogOpen] = (0, import_react.useState)(false);
	const [editingServer, setEditingServer] = (0, import_react.useState)(null);
	const [editingNas, setEditingNas] = (0, import_react.useState)(null);
	const [editingClient, setEditingClient] = (0, import_react.useState)(null);
	const [deleteId, setDeleteId] = (0, import_react.useState)(null);
	const [deleteType, setDeleteType] = (0, import_react.useState)(null);
	const [accountingSearch, setAccountingSearch] = (0, import_react.useState)("");
	const [accountingType, setAccountingType] = (0, import_react.useState)("all");
	const { data: tenantId } = useTenantId();
	const stats = useQuery({
		queryKey: ["aaa-stats", tenantId],
		queryFn: async () => radiusMonitoring.getAaaStats(tenantId),
		enabled: !!tenantId,
		refetchInterval: 3e4
	});
	const servers = useQuery({
		queryKey: ["aaa-servers", tenantId],
		queryFn: async () => radiusServerPool.list(tenantId),
		enabled: !!tenantId
	});
	const nasDevices = useQuery({
		queryKey: ["aaa-nas", tenantId],
		queryFn: async () => nasManagement.list(tenantId),
		enabled: !!tenantId
	});
	const clients = useQuery({
		queryKey: ["aaa-clients", tenantId],
		queryFn: async () => radiusClientService.list(tenantId),
		enabled: !!tenantId
	});
	const accounting = useQuery({
		queryKey: [
			"aaa-accounting",
			tenantId,
			accountingSearch,
			accountingType
		],
		queryFn: async () => {
			return accountingService.getRecords(tenantId, {
				username: accountingSearch || void 0,
				statusType: accountingType !== "all" ? accountingType : void 0,
				limit: 50
			});
		},
		enabled: !!tenantId
	});
	const runHealth = useMutation({
		mutationFn: async () => radiusMonitoring.runHealthCycle(tenantId),
		onSuccess: () => {
			toast.success("RADIUS health cycle completed");
			qc.invalidateQueries({ queryKey: ["aaa-stats", tenantId] });
			qc.invalidateQueries({ queryKey: ["aaa-servers", tenantId] });
		},
		onError: (e) => toast.error(e.message)
	});
	const saveServer = useMutation({
		mutationFn: async (data) => radiusServerPool.save(tenantId, editingServer ? {
			...data,
			id: editingServer.id
		} : data),
		onSuccess: () => {
			toast.success(editingServer ? "Radius server updated" : "Radius server added");
			qc.invalidateQueries({ queryKey: ["aaa-servers", tenantId] });
			qc.invalidateQueries({ queryKey: ["aaa-stats", tenantId] });
			setServerDialogOpen(false);
			setEditingServer(null);
		},
		onError: (e) => toast.error(e.message)
	});
	const deleteServer = useMutation({
		mutationFn: async (id) => radiusServerPool.delete(id),
		onSuccess: () => {
			toast.success("Radius server removed");
			qc.invalidateQueries({ queryKey: ["aaa-servers", tenantId] });
			qc.invalidateQueries({ queryKey: ["aaa-stats", tenantId] });
			setDeleteId(null);
			setDeleteType(null);
		},
		onError: (e) => toast.error(e.message)
	});
	const saveNas = useMutation({
		mutationFn: async (data) => nasManagement.save(tenantId, editingNas ? {
			...data,
			id: editingNas.id
		} : data),
		onSuccess: () => {
			toast.success(editingNas ? "NAS device updated" : "NAS device added");
			qc.invalidateQueries({ queryKey: ["aaa-nas", tenantId] });
			qc.invalidateQueries({ queryKey: ["aaa-stats", tenantId] });
			setNasDialogOpen(false);
			setEditingNas(null);
		},
		onError: (e) => toast.error(e.message)
	});
	const deleteNas = useMutation({
		mutationFn: async (id) => nasManagement.delete(id),
		onSuccess: () => {
			toast.success("NAS device removed");
			qc.invalidateQueries({ queryKey: ["aaa-nas", tenantId] });
			qc.invalidateQueries({ queryKey: ["aaa-stats", tenantId] });
			setDeleteId(null);
			setDeleteType(null);
		},
		onError: (e) => toast.error(e.message)
	});
	const saveClient = useMutation({
		mutationFn: async (data) => radiusClientService.save(tenantId, editingClient ? {
			...data,
			id: editingClient.id
		} : data),
		onSuccess: () => {
			toast.success(editingClient ? "Radius client updated" : "Radius client added");
			qc.invalidateQueries({ queryKey: ["aaa-clients", tenantId] });
			setClientDialogOpen(false);
			setEditingClient(null);
		},
		onError: (e) => toast.error(e.message)
	});
	const deleteClient = useMutation({
		mutationFn: async (id) => radiusClientService.delete(id),
		onSuccess: () => {
			toast.success("Radius client removed");
			qc.invalidateQueries({ queryKey: ["aaa-clients", tenantId] });
			setDeleteId(null);
			setDeleteType(null);
		},
		onError: (e) => toast.error(e.message)
	});
	const { register: registerServer, handleSubmit: handleSubmitServer, reset: resetServer, setValue: setServerValue, watch: watchServer } = useForm({
		resolver: u(serverSchema),
		defaultValues: {
			auth_port: 1812,
			acct_port: 1813,
			coa_port: 3799,
			timeout_ms: 3e3,
			retry_count: 3,
			priority: 1,
			protocol: "mschapv2",
			role: "primary",
			failover_strategy: "priority",
			is_active: true
		}
	});
	const { register: registerNas, handleSubmit: handleSubmitNas, reset: resetNas, setValue: setNasValue, watch: watchNas } = useForm({
		resolver: u(nasSchema),
		defaultValues: {
			auth_port: 1812,
			acct_port: 1813,
			coa_port: 3799,
			vendor: "mikrotik",
			is_active: true,
			dynamic_vlan_enabled: false,
			dynamic_profile_enabled: true,
			dynamic_ip_enabled: false
		}
	});
	const { register: registerClient, handleSubmit: handleSubmitClient, reset: resetClient, setValue: setClientValue, watch: watchClient } = useForm({
		resolver: u(clientSchema),
		defaultValues: {
			vendor: "generic",
			isActive: true
		}
	});
	function openServerDialog(server) {
		setEditingServer(server ?? null);
		if (server) resetServer({
			name: server.name ?? "",
			host: server.host ?? "",
			auth_port: server.authPort ?? server.auth_port ?? 1812,
			acct_port: server.acctPort ?? server.acct_port ?? 1813,
			coa_port: server.coaPort ?? server.coa_port ?? 3799,
			shared_secret: server.sharedSecret ?? server.shared_secret ?? "",
			protocol: server.protocol ?? "mschapv2",
			role: server.role ?? "primary",
			failover_strategy: server.failoverStrategy ?? server.failover_strategy ?? "priority",
			timeout_ms: server.timeoutMs ?? server.timeout_ms ?? 3e3,
			retry_count: server.retryCount ?? server.retry_count ?? 3,
			priority: server.priority ?? 1,
			is_active: server.isActive ?? server.is_active ?? true
		});
		else resetServer({
			auth_port: 1812,
			acct_port: 1813,
			coa_port: 3799,
			timeout_ms: 3e3,
			retry_count: 3,
			priority: 1,
			protocol: "mschapv2",
			role: "primary",
			failover_strategy: "priority",
			is_active: true
		});
		setServerDialogOpen(true);
	}
	function openNasDialog(nas) {
		setEditingNas(nas ?? null);
		if (nas) resetNas({
			name: nas.name ?? "",
			description: nas.description ?? "",
			vendor: nas.vendor ?? "mikrotik",
			nas_identifier: nas.nasIdentifier ?? nas.nas_identifier ?? "",
			nas_ip: nas.nasIp ?? nas.nas_ip ?? "",
			shared_secret: nas.sharedSecret ?? nas.shared_secret ?? "",
			auth_port: nas.authPort ?? nas.auth_port ?? 1812,
			acct_port: nas.acctPort ?? nas.acct_port ?? 1813,
			coa_port: nas.coaPort ?? nas.coa_port ?? 3799,
			is_active: nas.isActive ?? nas.is_active ?? true,
			dynamic_vlan_enabled: nas.dynamicVlanEnabled ?? nas.dynamic_vlan_enabled ?? false,
			dynamic_profile_enabled: nas.dynamicProfileEnabled ?? nas.dynamic_profile_enabled ?? true,
			dynamic_ip_enabled: nas.dynamicIpEnabled ?? nas.dynamic_ip_enabled ?? false,
			radius_server_id: nas.radiusServerId ?? nas.radius_server_id ?? null
		});
		else resetNas({
			auth_port: 1812,
			acct_port: 1813,
			coa_port: 3799,
			vendor: "mikrotik",
			is_active: true,
			dynamic_vlan_enabled: false,
			dynamic_profile_enabled: true,
			dynamic_ip_enabled: false
		});
		setNasDialogOpen(true);
	}
	function openClientDialog(client) {
		setEditingClient(client ?? null);
		if (client) resetClient({
			name: client.name ?? "",
			description: client.description ?? "",
			clientIp: client.clientIp ?? "",
			sharedSecret: client.sharedSecret ?? "",
			vendor: client.vendor ?? "generic",
			isActive: client.isActive ?? true
		});
		else resetClient({
			vendor: "generic",
			isActive: true
		});
		setClientDialogOpen(true);
	}
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "space-y-8",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex flex-col gap-3 md:flex-row md:items-end md:justify-between",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
					className: "text-3xl font-semibold",
					children: "AAA & RADIUS"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "text-sm text-muted-foreground",
					children: "Manage RADIUS servers, NAS devices, clients, accounting and health for your tenant."
				})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex flex-wrap gap-2",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
						variant: "outline",
						onClick: () => runHealth.mutate(),
						disabled: runHealth.isPending || !tenantId,
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(RefreshCw, { className: "h-4 w-4 mr-2" }), "Run health cycle"]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
						onClick: () => setTab("servers"),
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Server, { className: "h-4 w-4 mr-2" }), "Open AAA sections"]
					})]
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "grid gap-4 md:grid-cols-4",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "rounded-xl border border-border/60 bg-card p-5",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "text-xs text-muted-foreground uppercase",
							children: "Auth Success"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "mt-3 text-3xl font-semibold text-green-600",
							children: stats.data?.authSuccess ?? "—"
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "rounded-xl border border-border/60 bg-card p-5",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "text-xs text-muted-foreground uppercase",
							children: "Auth Failures"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "mt-3 text-3xl font-semibold text-red-600",
							children: stats.data?.authFailure ?? "—"
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "rounded-xl border border-border/60 bg-card p-5",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "text-xs text-muted-foreground uppercase",
							children: "Active Sessions"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "mt-3 text-3xl font-semibold text-blue-600",
							children: stats.data?.activeSessions ?? "—"
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "rounded-xl border border-border/60 bg-card p-5",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "text-xs text-muted-foreground uppercase",
							children: "Healthy Servers"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "mt-3 text-3xl font-semibold text-emerald-600",
							children: stats.data?.healthyRadiusServers ?? "—"
						})]
					})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Tabs, {
				value: tab,
				onValueChange: setTab,
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(TabsList, { children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TabsTrigger, {
							value: "overview",
							children: "Overview"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TabsTrigger, {
							value: "servers",
							children: "Servers"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TabsTrigger, {
							value: "nas",
							children: "NAS Devices"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TabsTrigger, {
							value: "clients",
							children: "Clients"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TabsTrigger, {
							value: "accounting",
							children: "Accounting"
						})
					] }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(TabsContent, {
						value: "overview",
						className: "space-y-6",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "grid gap-4 md:grid-cols-3",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "rounded-xl border border-border/60 bg-card p-5",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "flex items-center gap-2 text-sm text-muted-foreground",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ShieldCheck, { className: "h-4 w-4" }), "NAS devices"]
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
										className: "mt-3 text-3xl font-semibold",
										children: nasDevices.data?.length ?? "—"
									})]
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "rounded-xl border border-border/60 bg-card p-5",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "flex items-center gap-2 text-sm text-muted-foreground",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Server, { className: "h-4 w-4" }), "Radius clients"]
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
										className: "mt-3 text-3xl font-semibold",
										children: clients.data?.length ?? "—"
									})]
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "rounded-xl border border-border/60 bg-card p-5",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "flex items-center gap-2 text-sm text-muted-foreground",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Zap, { className: "h-4 w-4" }), "Accounting records"]
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
										className: "mt-3 text-3xl font-semibold",
										children: accounting.data?.length ?? "—"
									})]
								})
							]
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "grid gap-4 lg:grid-cols-2",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "rounded-xl border border-border/60 bg-card p-5",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "flex items-center justify-between",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
										className: "text-lg font-semibold",
										children: "Server health"
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
										className: "text-sm text-muted-foreground",
										children: "Latest RADIUS health cycle metrics."
									})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
										variant: "outline",
										size: "sm",
										onClick: () => runHealth.mutate(),
										disabled: runHealth.isPending || !tenantId,
										children: "Refresh"
									})]
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "mt-4 grid gap-3",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "rounded-xl bg-muted/70 p-4",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
											className: "text-xs text-muted-foreground",
											children: "Failure rate"
										}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
											className: "mt-2 text-2xl font-semibold",
											children: [stats.data?.failureRatePercent ?? "—", "%"]
										})]
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "rounded-xl bg-muted/70 p-4",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
											className: "text-xs text-muted-foreground",
											children: "Avg auth latency"
										}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
											className: "mt-2 text-2xl font-semibold",
											children: stats.data?.avgAuthLatencyMs != null ? `${stats.data.avgAuthLatencyMs} ms` : "—"
										})]
									})]
								})]
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "rounded-xl border border-border/60 bg-card p-5",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
									className: "text-lg font-semibold",
									children: "Alert guidance"
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "mt-3 space-y-2 text-sm text-muted-foreground",
									children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: "High failure rate" }), " indicates authentication or profile mapping issues."] }),
										/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: "Offline NAS" }), " may need router or secret validation."] }),
										/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: "Slow latency" }), " signals RADIUS server overload or reachability problems."] })
									]
								})]
							})]
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(TabsContent, {
						value: "servers",
						className: "space-y-6",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
								className: "text-2xl font-semibold",
								children: "RADIUS Servers"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "text-sm text-muted-foreground",
								children: "Primary/secondary RADIUS pool management and failover settings."
							})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
								onClick: () => openServerDialog(),
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Plus, { className: "h-4 w-4 mr-2" }), "Add Server"]
							})]
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "grid gap-4 md:grid-cols-2 xl:grid-cols-3",
							children: [servers.data?.map((server) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "rounded-xl border border-border/60 bg-card p-5 space-y-3",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "flex items-center justify-between",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
											className: "font-semibold",
											children: server.name
										}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
											className: "text-xs text-muted-foreground",
											children: [
												server.host,
												":",
												server.authPort
											]
										})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
											className: `rounded-full px-2 py-0.5 text-xs ${server.isHealthy ? "bg-green-500/15 text-green-600" : server.isHealthy === false ? "bg-red-500/15 text-red-600" : "bg-muted text-muted-foreground"}`,
											children: server.isHealthy === true ? "Healthy" : server.isHealthy === false ? "Unhealthy" : "Unknown"
										})]
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "grid grid-cols-2 gap-2 text-xs text-muted-foreground",
										children: [
											/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: ["Role: ", server.role] }),
											/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: ["Strategy: ", server.failoverStrategy] }),
											/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: ["Priority: ", server.priority] }),
											/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
												"Latency: ",
												server.latencyMs ?? "—",
												" ms"
											] })
										]
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "flex flex-wrap gap-2 pt-3 border-t border-border/60",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
											onClick: () => openServerDialog(server),
											className: "text-xs text-muted-foreground hover:text-foreground flex items-center gap-1",
											children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SquarePen, { className: "h-3 w-3" }), "Edit"]
										}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
											onClick: () => {
												setDeleteId(server.id);
												setDeleteType("server");
											},
											className: "text-xs text-destructive hover:text-red-600 flex items-center gap-1",
											children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Trash2, { className: "h-3 w-3" }), "Delete"]
										})]
									})
								]
							}, server.id)), servers.data?.length === 0 && !servers.isLoading && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "col-span-full rounded-xl border border-border/60 bg-card p-6 text-center text-muted-foreground",
								children: "No RADIUS servers configured yet."
							})]
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(TabsContent, {
						value: "nas",
						className: "space-y-6",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
								className: "text-2xl font-semibold",
								children: "NAS Devices"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "text-sm text-muted-foreground",
								children: "Add and manage NAS devices that authenticate and account traffic."
							})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
								onClick: () => openNasDialog(),
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Plus, { className: "h-4 w-4 mr-2" }), "Add NAS"]
							})]
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "overflow-x-auto rounded-xl border border-border/60 bg-card",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Table, { children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TableHeader, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(TableRow, { children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TableHead, { children: "Name" }),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TableHead, { children: "Vendor" }),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TableHead, {
										className: "hidden lg:table-cell",
										children: "Identifier"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TableHead, {
										className: "hidden sm:table-cell",
										children: "IP"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TableHead, { children: "Status" }),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TableHead, { children: "Actions" })
								] }) }),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TableBody, { children: nasDevices.data?.map((nas) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(TableRow, { children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TableCell, { children: nas.name }),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TableCell, { children: nas.vendor }),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TableCell, {
										className: "hidden lg:table-cell",
										children: nas.nasIdentifier ?? "—"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TableCell, {
										className: "hidden sm:table-cell",
										children: nas.nasIp ?? "—"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TableCell, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: `rounded-full px-2 py-0.5 text-[11px] ${nas.isActive ? "bg-green-500/15 text-green-600" : "bg-red-500/15 text-red-600"}`,
										children: nas.isActive ? "Active" : "Disabled"
									}) }),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(TableCell, {
										className: "space-x-2",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
											onClick: () => openNasDialog(nas),
											className: "text-xs text-muted-foreground hover:text-foreground",
											children: "Edit"
										}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
											onClick: () => {
												setDeleteId(nas.id);
												setDeleteType("nas");
											},
											className: "text-xs text-destructive hover:text-red-600",
											children: "Delete"
										})]
									})
								] }, nas.id)) }),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TableCaption, { children: "Last seen and activity available in the router network monitor." })
							] })
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(TabsContent, {
						value: "clients",
						className: "space-y-6",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
								className: "text-2xl font-semibold",
								children: "RADIUS Clients"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "text-sm text-muted-foreground",
								children: "Manage network devices with RADIUS access and shared secrets."
							})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
								onClick: () => openClientDialog(),
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Plus, { className: "h-4 w-4 mr-2" }), "Add Client"]
							})]
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "overflow-x-auto rounded-xl border border-border/60 bg-card",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Table, { children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TableHeader, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(TableRow, { children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TableHead, { children: "Name" }),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TableHead, { children: "IP" }),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TableHead, {
										className: "hidden sm:table-cell",
										children: "Vendor"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TableHead, { children: "Status" }),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TableHead, { children: "Actions" })
								] }) }),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TableBody, { children: clients.data?.map((client) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(TableRow, { children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TableCell, { children: client.name }),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TableCell, { children: client.clientIp }),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TableCell, {
										className: "hidden sm:table-cell",
										children: client.vendor
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TableCell, { children: client.isActive ? "Active" : "Disabled" }),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(TableCell, {
										className: "space-x-2",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
											onClick: () => openClientDialog(client),
											className: "text-xs text-muted-foreground hover:text-foreground",
											children: "Edit"
										}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
											onClick: () => {
												setDeleteId(client.id);
												setDeleteType("client");
											},
											className: "text-xs text-destructive hover:text-red-600",
											children: "Delete"
										})]
									})
								] }, client.id)) }),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TableCaption, { children: "Radius clients are allowed to submit accounting and auth requests against your pool." })
							] })
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(TabsContent, {
						value: "accounting",
						className: "space-y-6",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
								className: "text-2xl font-semibold",
								children: "Accounting"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "text-sm text-muted-foreground",
								children: "Recent RADIUS accounting events and session updates."
							})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "flex flex-wrap gap-2",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "relative",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Search, { className: "pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
										className: "pl-10",
										value: accountingSearch,
										onChange: (event) => setAccountingSearch(event.target.value),
										placeholder: "Search username"
									})]
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Select, {
									value: accountingType,
									onValueChange: setAccountingType,
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectTrigger, {
										className: "w-48",
										children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectValue, { placeholder: "Filter status" })
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(SelectContent, { children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
											value: "all",
											children: "All statuses"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
											value: "Start",
											children: "Start"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
											value: "Stop",
											children: "Stop"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
											value: "Interim-Update",
											children: "Interim"
										})
									] })]
								})]
							})]
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "overflow-x-auto rounded-xl border border-border/60 bg-card",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Table, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TableHeader, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(TableRow, { children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TableHead, { children: "Username" }),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TableHead, { children: "Status" }),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TableHead, {
									className: "hidden lg:table-cell",
									children: "Framed IP"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TableHead, {
									className: "hidden xl:table-cell",
									children: "NAS"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TableHead, { children: "Received" })
							] }) }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TableBody, { children: accounting.data?.map((row) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(TableRow, { children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TableCell, { children: row.username }),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TableCell, { children: row.acctStatusType }),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TableCell, {
									className: "hidden lg:table-cell",
									children: row.framedIp ?? "—"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TableCell, {
									className: "hidden xl:table-cell",
									children: row.nasIdentifier ?? row.nasId ?? "—"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TableCell, { children: new Date(row.receivedAt).toLocaleString() })
							] }, row.id)) })] })
						})]
					})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Dialog, {
				open: serverDialogOpen,
				onOpenChange: setServerDialogOpen,
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DialogContent, {
					className: "max-w-3xl",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(DialogHeader, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DialogTitle, { children: editingServer ? "Edit RADIUS Server" : "Add RADIUS Server" }) }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("form", {
						onSubmit: handleSubmitServer((data) => saveServer.mutate(data)),
						className: "space-y-4",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "grid gap-4 md:grid-cols-2",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "Name" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, { ...registerServer("name") })] }),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "Host" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, { ...registerServer("host") })] }),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "Shared Secret" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
									type: "password",
									...registerServer("shared_secret")
								})] }),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "Protocol" }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Select, {
									value: watchServer("protocol"),
									onValueChange: (value) => setServerValue("protocol", value),
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectTrigger, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectValue, {}) }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(SelectContent, { children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
											value: "pap",
											children: "PAP"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
											value: "chap",
											children: "CHAP"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
											value: "mschapv2",
											children: "MS-CHAPv2"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
											value: "eap-tls",
											children: "EAP-TLS"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
											value: "eap-ttls",
											children: "EAP-TTLS"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
											value: "peap",
											children: "PEAP"
										})
									] })]
								})] }),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "Role" }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Select, {
									value: watchServer("role"),
									onValueChange: (value) => setServerValue("role", value),
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectTrigger, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectValue, {}) }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(SelectContent, { children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
											value: "primary",
											children: "Primary"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
											value: "secondary",
											children: "Secondary"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
											value: "tertiary",
											children: "Tertiary"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
											value: "backup",
											children: "Backup"
										})
									] })]
								})] }),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "Failover strategy" }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Select, {
									value: watchServer("failover_strategy"),
									onValueChange: (value) => setServerValue("failover_strategy", value),
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectTrigger, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectValue, {}) }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(SelectContent, { children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
											value: "priority",
											children: "Priority"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
											value: "round_robin",
											children: "Round Robin"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
											value: "least_latency",
											children: "Least latency"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
											value: "random",
											children: "Random"
										})
									] })]
								})] }),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "Auth port" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
									type: "number",
									...registerServer("auth_port")
								})] }),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "Acct port" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
									type: "number",
									...registerServer("acct_port")
								})] }),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "CoA port" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
									type: "number",
									...registerServer("coa_port")
								})] }),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "Timeout (ms)" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
									type: "number",
									...registerServer("timeout_ms")
								})] }),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "Retry count" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
									type: "number",
									...registerServer("retry_count")
								})] }),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "Priority" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
									type: "number",
									...registerServer("priority")
								})] }),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "Active" }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Select, {
									value: watchServer("is_active") ? "true" : "false",
									onValueChange: (value) => setServerValue("is_active", value === "true"),
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectTrigger, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectValue, {}) }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(SelectContent, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
										value: "true",
										children: "Active"
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
										value: "false",
										children: "Disabled"
									})] })]
								})] })
							]
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DialogFooter, {
							className: "gap-2",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
								variant: "outline",
								type: "button",
								onClick: () => setServerDialogOpen(false),
								children: "Cancel"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
								type: "submit",
								disabled: saveServer.isPending,
								children: saveServer.isPending ? "Saving..." : "Save server"
							})]
						})]
					})]
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Dialog, {
				open: nasDialogOpen,
				onOpenChange: setNasDialogOpen,
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DialogContent, {
					className: "max-w-3xl",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(DialogHeader, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DialogTitle, { children: editingNas ? "Edit NAS Device" : "Add NAS Device" }) }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("form", {
						onSubmit: handleSubmitNas((data) => saveNas.mutate(data)),
						className: "space-y-4",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "grid gap-4 md:grid-cols-2",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "Name" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, { ...registerNas("name") })] }),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "Vendor" }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Select, {
									value: watchNas("vendor"),
									onValueChange: (value) => setNasValue("vendor", value),
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectTrigger, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectValue, {}) }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(SelectContent, { children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
											value: "mikrotik",
											children: "MikroTik"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
											value: "cisco",
											children: "Cisco"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
											value: "ubiquiti",
											children: "Ubiquiti"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
											value: "freeradius",
											children: "FreeRADIUS"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
											value: "juniper",
											children: "Juniper"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
											value: "huawei",
											children: "Huawei"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
											value: "generic",
											children: "Generic"
										})
									] })]
								})] }),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "NAS Identifier" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, { ...registerNas("nas_identifier") })] }),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "NAS IP" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, { ...registerNas("nas_ip") })] }),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "Shared Secret" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
									type: "password",
									...registerNas("shared_secret")
								})] }),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "Radius server" }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Select, {
									value: watchNas("radius_server_id") ?? "__none__",
									onValueChange: (value) => setNasValue("radius_server_id", value === "__none__" ? null : value),
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectTrigger, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectValue, { placeholder: "None" }) }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(SelectContent, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
										value: "__none__",
										children: "None"
									}), servers.data?.map((server) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
										value: server.id,
										children: server.name
									}, server.id))] })]
								})] }),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "Auth port" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
									type: "number",
									...registerNas("auth_port")
								})] }),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "Acct port" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
									type: "number",
									...registerNas("acct_port")
								})] }),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "CoA port" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
									type: "number",
									...registerNas("coa_port")
								})] }),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "Dynamic VLAN" }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Select, {
									value: watchNas("dynamic_vlan_enabled") ? "true" : "false",
									onValueChange: (value) => setNasValue("dynamic_vlan_enabled", value === "true"),
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectTrigger, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectValue, {}) }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(SelectContent, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
										value: "true",
										children: "Enabled"
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
										value: "false",
										children: "Disabled"
									})] })]
								})] }),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "Dynamic Profile" }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Select, {
									value: watchNas("dynamic_profile_enabled") ? "true" : "false",
									onValueChange: (value) => setNasValue("dynamic_profile_enabled", value === "true"),
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectTrigger, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectValue, {}) }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(SelectContent, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
										value: "true",
										children: "Enabled"
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
										value: "false",
										children: "Disabled"
									})] })]
								})] }),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "Dynamic IP" }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Select, {
									value: watchNas("dynamic_ip_enabled") ? "true" : "false",
									onValueChange: (value) => setNasValue("dynamic_ip_enabled", value === "true"),
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectTrigger, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectValue, {}) }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(SelectContent, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
										value: "true",
										children: "Enabled"
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
										value: "false",
										children: "Disabled"
									})] })]
								})] }),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "Active" }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Select, {
									value: watchNas("is_active") ? "true" : "false",
									onValueChange: (value) => setNasValue("is_active", value === "true"),
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectTrigger, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectValue, {}) }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(SelectContent, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
										value: "true",
										children: "Active"
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
										value: "false",
										children: "Disabled"
									})] })]
								})] })
							]
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DialogFooter, {
							className: "gap-2",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
								variant: "outline",
								type: "button",
								onClick: () => setNasDialogOpen(false),
								children: "Cancel"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
								type: "submit",
								disabled: saveNas.isPending,
								children: saveNas.isPending ? "Saving..." : "Save NAS"
							})]
						})]
					})]
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Dialog, {
				open: clientDialogOpen,
				onOpenChange: setClientDialogOpen,
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DialogContent, {
					className: "max-w-3xl",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(DialogHeader, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DialogTitle, { children: editingClient ? "Edit RADIUS Client" : "Add RADIUS Client" }) }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("form", {
						onSubmit: handleSubmitClient((data) => saveClient.mutate(data)),
						className: "space-y-4",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "grid gap-4 md:grid-cols-2",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "Name" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, { ...registerClient("name") })] }),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "Client IP" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, { ...registerClient("clientIp") })] }),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "Shared Secret" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
									type: "password",
									...registerClient("sharedSecret")
								})] }),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "Vendor" }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Select, {
									value: watchClient("vendor"),
									onValueChange: (value) => setClientValue("vendor", value),
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectTrigger, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectValue, {}) }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(SelectContent, { children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
											value: "mikrotik",
											children: "MikroTik"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
											value: "cisco",
											children: "Cisco"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
											value: "ubiquiti",
											children: "Ubiquiti"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
											value: "freeradius",
											children: "FreeRADIUS"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
											value: "juniper",
											children: "Juniper"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
											value: "huawei",
											children: "Huawei"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
											value: "generic",
											children: "Generic"
										})
									] })]
								})] }),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "Active" }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Select, {
									value: watchClient("isActive") ? "true" : "false",
									onValueChange: (value) => setClientValue("isActive", value === "true"),
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectTrigger, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectValue, {}) }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(SelectContent, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
										value: "true",
										children: "Active"
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
										value: "false",
										children: "Disabled"
									})] })]
								})] }),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "md:col-span-2",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "Description" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, { ...registerClient("description") })]
								})
							]
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DialogFooter, {
							className: "gap-2",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
								variant: "outline",
								type: "button",
								onClick: () => setClientDialogOpen(false),
								children: "Cancel"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
								type: "submit",
								disabled: saveClient.isPending,
								children: saveClient.isPending ? "Saving..." : "Save Client"
							})]
						})]
					})]
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Dialog, {
				open: !!deleteId,
				onOpenChange: (open) => {
					if (!open) {
						setDeleteId(null);
						setDeleteType(null);
					}
				},
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DialogContent, {
					className: "max-w-sm",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(DialogHeader, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DialogTitle, { children: "Confirm delete" }) }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "space-y-4 py-4 text-sm text-muted-foreground",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "This will permanently remove the selected AAA item. It will not affect active sessions." })
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DialogFooter, {
							className: "gap-2",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
								variant: "outline",
								onClick: () => {
									setDeleteId(null);
									setDeleteType(null);
								},
								children: "Cancel"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
								variant: "destructive",
								onClick: () => {
									if (!deleteId) return;
									if (deleteType === "server") deleteServer.mutate(deleteId);
									else if (deleteType === "nas") deleteNas.mutate(deleteId);
									else if (deleteType === "client") deleteClient.mutate(deleteId);
								},
								children: "Delete"
							})]
						})
					]
				})
			})
		]
	});
}
//#endregion
export { AaaPage as component };
