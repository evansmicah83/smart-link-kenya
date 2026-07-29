/**
 * router-poll — NAT-safe command delivery
 *
 * The MikroTik router calls this endpoint every 1 minute via its scheduler.
 * It reports its current status and receives any pending commands to execute.
 * The router then executes the commands locally and calls router-poll again
 * with the results. This works through ANY NAT — no inbound connections needed.
 *
 * Called by RouterOS scheduler:
 *   /tool fetch mode=https url="<SUPABASE_URL>/functions/v1/router-poll?router_id=<id>&token=<api_password>" \
 *     http-method=post http-data="" dst-path=sln-cmds.json
 *   :local cmds [/file get sln-cmds.json contents]
 *   # parse and execute commands from cmds
 */

import { serve } from "https://deno.land/std@0.201.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  const url = new URL(req.url);
  const routerId = url.searchParams.get("router_id") || "";
  const token = url.searchParams.get("token") || "";

  if (!routerId || !token) {
    return new Response(JSON.stringify({ error: "missing router_id or token" }), {
      status: 400, headers: { ...CORS, "content-type": "application/json" },
    });
  }

  const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { global: { fetch } });

  // Authenticate: token must match api_password stored in DB
  const { data: router } = await db
    .from("routers")
    .select("id, tenant_id, api_password, name, status")
    .eq("id", routerId)
    .maybeSingle();

  if (!router || router.api_password !== token) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401, headers: { ...CORS, "content-type": "application/json" },
    });
  }

  const now = new Date().toISOString();

  // Parse body — router may POST results of previously fetched commands
  let body: Record<string, unknown> = {};
  try {
    if (req.method === "POST") {
      const text = await req.text();
      if (text) body = JSON.parse(text);
    }
  } catch { /* ignore parse errors */ }

  // Process command results if router is reporting back
  if (body.results && Array.isArray(body.results)) {
    for (const r of body.results as Array<{ id: string; success: boolean; result?: unknown; error?: string }>) {
      await db.from("router_commands").update({
        status: r.success ? "done" : "failed",
        result: r.result ?? null,
        error: r.error ?? null,
        completed_at: now,
      }).eq("id", r.id).eq("router_id", routerId);

      // Log to provision_logs so UI realtime picks it up
      await db.from("provision_logs").insert({
        router_id: routerId,
        tenant_id: router.tenant_id,
        stage: r.success ? "command_done" : "command_failed",
        message: r.success
          ? `Command completed successfully`
          : `Command failed: ${r.error ?? "unknown error"}`,
        success: r.success,
      }).catch(() => {});
    }
  }

  // Update router heartbeat
  await db.from("routers").update({
    status: "online",
    last_seen: now,
    last_poll_at: now,
    api_connected: true,
  }).eq("id", routerId);

  // Fetch pending commands for this router (not expired)
  const { data: commands } = await db
    .from("router_commands")
    .select("id, command, payload")
    .eq("router_id", routerId)
    .eq("status", "pending")
    .gt("expires_at", now)
    .order("created_at", { ascending: true })
    .limit(5);

  if (commands?.length) {
    // Mark them as running
    const ids = commands.map((c: any) => c.id);
    await db.from("router_commands").update({ status: "running", started_at: now })
      .in("id", ids);
  }

  return new Response(
    JSON.stringify({ commands: commands ?? [], ts: now }),
    { status: 200, headers: { ...CORS, "content-type": "application/json" } },
  );
});
