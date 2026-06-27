/**
 * SmartLinkNet — MikroTik lib (Compatibility Shim)
 * Phase 1 Refactor
 *
 * All calls now go through the Network Abstraction Layer.
 * This module exists only for backward compatibility.
 * New code should import from "@/lib/network" directly.
 */

import { supabase } from "@/integrations/supabase/client";
import { adapterFactory, sessionService } from "@/lib/network";

export interface RouterCommand {
  routerId: string;
  command:
    | "get_status"
    | "add_hotspot_user"
    | "remove_hotspot_user"
    | "add_pppoe_user"
    | "remove_pppoe_user"
    | "get_active_sessions"
    | "kick_session"
    | "get_interfaces"
    | "apply_profile";
  params?: Record<string, unknown>;
}

/**
 * @deprecated Use adapterFactory.getRouterAdapter(routerId) directly.
 */
export async function routerCommand(cmd: RouterCommand) {
  const { data, error } = await supabase.functions.invoke("router-command", {
    body: cmd,
  });
  if (error) throw error;
  return data;
}

/**
 * @deprecated Use adapterFactory.getRouterAdapter(routerId).getStatus()
 */
export async function syncRouterStatus(routerId: string) {
  const adapter = await adapterFactory.getRouterAdapter(routerId);
  return adapter.getStatus();
}

/**
 * @deprecated Use sessionService.getLiveSessions(routerId)
 */
export async function getActiveSessions(routerId: string) {
  return sessionService.getLiveSessions(routerId);
}

/**
 * @deprecated Use sessionService.terminateSession(tenantId, sessionId)
 * or adapterFactory.getRouterAdapter(routerId).kickSession(nasSessionId)
 */
export async function kickSession(routerId: string, sessionId: string) {
  const adapter = await adapterFactory.getRouterAdapter(routerId);
  return adapter.kickSession(sessionId);
}
