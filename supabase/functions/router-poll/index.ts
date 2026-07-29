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
    return new Response(":log warning \"sln-poll: missing params\"", { status: 400, headers: { "content-type": "text/plain" } });
  }

  const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { global: { fetch } });

  const { data: router } = await db
    .from("routers")
    .select("id, tenant_id, api_password, name, provision_token")
    .eq("id", routerId)
    .maybeSingle();

  if (!router || router.api_password !== token) {
    return new Response(":log warning \"sln-poll: unauthorized\"", { status: 401, headers: { "content-type": "text/plain" } });
  }

  const now = new Date().toISOString();

  // Process any command results posted by router
  let body: Record<string, unknown> = {};
  try {
    if (req.method === "POST") {
      const text = await req.text();
      if (text && text.trim().startsWith("{")) body = JSON.parse(text);
    }
  } catch { /* ignore */ }

  if (body.results && Array.isArray(body.results)) {
    for (const r of body.results as Array<{ id: string; success: boolean; error?: string }>) {
      await db.from("router_commands").update({
        status: r.success ? "done" : "failed",
        error: r.error ?? null,
        completed_at: now,
      }).eq("id", r.id).eq("router_id", routerId);
    }
  }

  // Update heartbeat
  await db.from("routers").update({
    status: "online",
    last_seen: now,
    last_poll_at: now,
    api_connected: true,
  }).eq("id", routerId);

  // Fetch pending commands
  const { data: commands } = await db
    .from("router_commands")
    .select("id, command, payload")
    .eq("router_id", routerId)
    .eq("status", "pending")
    .gt("expires_at", now)
    .order("created_at", { ascending: true })
    .limit(1);

  // No pending commands — return empty script (router imports it, nothing happens)
  if (!commands?.length) {
    return new Response(
      ":log debug \"sln-poll: ok, no commands\"",
      { status: 200, headers: { "content-type": "text/plain" } }
    );
  }

  const cmd = commands[0];

  // Mark command as running
  await db.from("router_commands").update({ status: "running", started_at: now }).eq("id", cmd.id);

  // Handle re_provision — return a RouterOS script that re-fetches and re-imports the provision script
  if (cmd.command === "re_provision") {
    const provisionUrl = (cmd.payload as any)?.provision_url || "";

    // Mark done immediately — the script will run on the router
    await db.from("router_commands").update({ status: "done", completed_at: now }).eq("id", cmd.id);

    await db.from("provision_logs").insert({
      router_id: routerId,
      tenant_id: router.tenant_id,
      stage: "re_provision",
      message: "Router re-provisioning with full config including RADIUS",
      success: true,
    });

    const script = [
      "# SmartLinkNet re-provision",
      ":log info \"sln-poll: re-provisioning router\"",
      ":do {",
      " /tool fetch mode=https url=\"" + provisionUrl + "\" dst-path=sln-provision.rsc keep-result=yes",
      " :delay 3s",
      " /import sln-provision.rsc",
      "} on-error={ :log error \"sln-poll: re-provision failed\" }",
    ].join("\n");

    return new Response(script, { status: 200, headers: { "content-type": "text/plain" } });
  }

  // Unknown command — mark done and return empty script
  await db.from("router_commands").update({ status: "done", completed_at: now }).eq("id", cmd.id);
  return new Response(":log info \"sln-poll: command acknowledged\"", { status: 200, headers: { "content-type": "text/plain" } });
});
