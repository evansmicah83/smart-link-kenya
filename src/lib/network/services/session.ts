/**
 * SmartLinkNet — Session Abstraction Service
 * Phase 1: Network Foundation
 *
 * All session operations go through this service.
 * Callers pass UUID references only — no IP addresses, no vendor types.
 */

import { supabase } from "@/integrations/supabase/client";
import { adapterFactory } from "../adapters/factory";
import type { RouterRef, CustomerRef, SessionRef, TenantRef, AbstractSession, BandwidthPolicy } from "../types";

// ─── Session Service ──────────────────────────────────────────────────────────

export class SessionService {
  /**
   * List live sessions from the NAS for a given router UUID.
   * Returns abstract sessions — no vendor-specific fields.
   */
  async getLiveSessions(routerRef: RouterRef): Promise<AbstractSession[]> {
    const adapter = await adapterFactory.getRouterAdapter(routerRef);
    const result = await adapter.getActiveSessions();
    if (!result.success) throw new Error(result.error ?? "Failed to fetch sessions");
    return result.data ?? [];
  }

  /**
   * Terminate a session by its DB session UUID.
   * Resolves the NAS session ID internally.
   */
  async terminateSession(tenantRef: TenantRef, sessionRef: SessionRef): Promise<void> {
    const { data: session, error } = await supabase
      .from("sessions")
      .select("id, router_id, nas_session_id")
      .eq("id", sessionRef)
      .maybeSingle();

    if (error || !session) throw new Error(`Session not found: ${sessionRef}`);

    const adapter = await adapterFactory.getSessionAdapter(session.router_id);
    await adapter.terminateSession(session.router_id, (session as any).nas_session_id ?? sessionRef);

    // Mark ended in DB
    await supabase
      .from("sessions")
      .update({ ended_at: new Date().toISOString(), terminated_by: "admin" })
      .eq("id", sessionRef);
  }

  /**
   * Terminate all active sessions for a customer (by UUID).
   * Used during suspension — no IP traversal.
   */
  async terminateCustomerSessions(tenantRef: TenantRef, customerRef: CustomerRef): Promise<number> {
    const { data: sessions } = await supabase
      .from("sessions")
      .select("id, router_id, nas_session_id")
      .eq("tenant_id", tenantRef)
      .eq("customer_id", customerRef)
      .is("ended_at", null);

    let count = 0;
    for (const s of sessions ?? []) {
      try {
        const adapter = await adapterFactory.getSessionAdapter(s.router_id);
        await adapter.terminateSession(s.router_id, (s as any).nas_session_id ?? s.id);
        await supabase
          .from("sessions")
          .update({ ended_at: new Date().toISOString(), terminated_by: "system" })
          .eq("id", s.id);
        count++;
      } catch {
        // Continue — log failure but don't block other sessions
      }
    }
    return count;
  }

  /**
   * Apply a bandwidth policy to a live session.
   * Policy is identified by package UUID — no hardcoded rate strings.
   */
  async applyBandwidthPolicy(
    tenantRef: TenantRef,
    customerRef: CustomerRef,
    policy: BandwidthPolicy
  ): Promise<void> {
    const { data: sessions } = await supabase
      .from("sessions")
      .select("id, router_id, username")
      .eq("tenant_id", tenantRef)
      .eq("customer_id", customerRef)
      .is("ended_at", null);

    for (const s of sessions ?? []) {
      const adapter = await adapterFactory.getBandwidthAdapter(s.router_id);
      await adapter.applyPolicy(s.router_id, s.username ?? "", policy);
    }
  }

  /**
   * Record an accounting update from RADIUS or router polling.
   * Uses session UUID — never IP-based lookup.
   */
  async recordAccounting(
    sessionRef: SessionRef,
    bytesIn: number,
    bytesOut: number
  ): Promise<void> {
    await supabase
      .from("sessions")
      .update({ bytes_in: bytesIn, bytes_out: bytesOut, updated_at: new Date().toISOString() })
      .eq("id", sessionRef);
  }

  /**
   * Sync live NAS sessions to DB for a tenant's routers.
   * Called by the background queue worker.
   */
  async syncSessionsForTenant(tenantRef: TenantRef): Promise<void> {
    const { data: routers } = await supabase
      .from("routers")
      .select("id")
      .eq("tenant_id", tenantRef)
      .eq("status", "online");

    for (const router of routers ?? []) {
      try {
        const liveSessions = await this.getLiveSessions(router.id);
        const liveIds = new Set(liveSessions.map((s) => s.sessionRef));

        // End DB sessions that are no longer on the NAS
        const { data: dbSessions } = await supabase
          .from("sessions")
          .select("id, nas_session_id")
          .eq("tenant_id", tenantRef)
          .eq("router_id", router.id)
          .is("ended_at", null);

        for (const db of dbSessions ?? []) {
          const nasId = (db as any).nas_session_id ?? db.id;
          if (!liveIds.has(nasId)) {
            await supabase
              .from("sessions")
              .update({ ended_at: new Date().toISOString() })
              .eq("id", db.id);
          }
        }
      } catch {
        // Router offline — skip
      }
    }
  }
}

export const sessionService = new SessionService();
