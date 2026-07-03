import { a as supabase, i as init_client } from "./client-D3kKP_Nv.mjs";
import { t as adapterFactory } from "./factory-BT7u31uI.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/mikrotik-DPl0UasE.js
init_client();
var SessionService = class {
	/**
	* List live sessions from the NAS for a given router UUID.
	* Returns abstract sessions — no vendor-specific fields.
	*/
	async getLiveSessions(routerRef) {
		const result = await (await adapterFactory.getRouterAdapter(routerRef)).getActiveSessions();
		if (!result.success) throw new Error(result.error ?? "Failed to fetch sessions");
		return result.data ?? [];
	}
	/**
	* Terminate a session by its DB session UUID.
	* Resolves the NAS session ID internally.
	*/
	async terminateSession(tenantRef, sessionRef) {
		const { data: session, error } = await supabase.from("sessions").select("id, router_id, nas_session_id").eq("id", sessionRef).maybeSingle();
		if (error || !session) throw new Error(`Session not found: ${sessionRef}`);
		await (await adapterFactory.getSessionAdapter(session.router_id)).terminateSession(session.router_id, session.nas_session_id ?? sessionRef);
		await supabase.from("sessions").update({
			ended_at: (/* @__PURE__ */ new Date()).toISOString(),
			terminated_by: "admin"
		}).eq("id", sessionRef);
	}
	/**
	* Terminate all active sessions for a customer (by UUID).
	* Used during suspension — no IP traversal.
	*/
	async terminateCustomerSessions(tenantRef, customerRef) {
		const { data: sessions } = await supabase.from("sessions").select("id, router_id, nas_session_id").eq("tenant_id", tenantRef).eq("customer_id", customerRef).is("ended_at", null);
		let count = 0;
		for (const s of sessions ?? []) try {
			await (await adapterFactory.getSessionAdapter(s.router_id)).terminateSession(s.router_id, s.nas_session_id ?? s.id);
			await supabase.from("sessions").update({
				ended_at: (/* @__PURE__ */ new Date()).toISOString(),
				terminated_by: "system"
			}).eq("id", s.id);
			count++;
		} catch {}
		return count;
	}
	/**
	* Apply a bandwidth policy to a live session.
	* Policy is identified by package UUID — no hardcoded rate strings.
	*/
	async applyBandwidthPolicy(tenantRef, customerRef, policy) {
		const { data: sessions } = await supabase.from("sessions").select("id, router_id, username").eq("tenant_id", tenantRef).eq("customer_id", customerRef).is("ended_at", null);
		for (const s of sessions ?? []) await (await adapterFactory.getBandwidthAdapter(s.router_id)).applyPolicy(s.router_id, s.username ?? "", policy);
	}
	/**
	* Record an accounting update from RADIUS or router polling.
	* Uses session UUID — never IP-based lookup.
	*/
	async recordAccounting(sessionRef, bytesIn, bytesOut) {
		await supabase.from("sessions").update({
			bytes_in: bytesIn,
			bytes_out: bytesOut,
			updated_at: (/* @__PURE__ */ new Date()).toISOString()
		}).eq("id", sessionRef);
	}
	/**
	* Sync live NAS sessions to DB for a tenant's routers.
	* Called by the background queue worker.
	*/
	async syncSessionsForTenant(tenantRef) {
		const { data: routers } = await supabase.from("routers").select("id").eq("tenant_id", tenantRef).eq("status", "online");
		for (const router of routers ?? []) try {
			const liveSessions = await this.getLiveSessions(router.id);
			const liveIds = new Set(liveSessions.map((s) => s.sessionRef));
			const { data: dbSessions } = await supabase.from("sessions").select("id, nas_session_id").eq("tenant_id", tenantRef).eq("router_id", router.id).is("ended_at", null);
			for (const db of dbSessions ?? []) {
				const nasId = db.nas_session_id ?? db.id;
				if (!liveIds.has(nasId)) await supabase.from("sessions").update({ ended_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", db.id);
			}
		} catch {}
	}
};
var sessionService = new SessionService();
/**
* @deprecated Use adapterFactory.getRouterAdapter(routerId).getStatus()
*/
async function syncRouterStatus(routerId) {
	return (await adapterFactory.getRouterAdapter(routerId)).getStatus();
}
/**
* @deprecated Use sessionService.getLiveSessions(routerId)
*/
async function getActiveSessions(routerId) {
	return sessionService.getLiveSessions(routerId);
}
/**
* @deprecated Use sessionService.terminateSession(tenantId, sessionId)
* or adapterFactory.getRouterAdapter(routerId).kickSession(nasSessionId)
*/
async function kickSession(routerId, sessionId) {
	return (await adapterFactory.getRouterAdapter(routerId)).kickSession(sessionId);
}
//#endregion
export { kickSession as n, syncRouterStatus as r, getActiveSessions as t };
