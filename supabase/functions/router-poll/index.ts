import { serve } from "https://deno.land/std@0.201.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204 });

  const url = new URL(req.url);
  const routerId = url.searchParams.get("router_id") || "";
  const token = url.searchParams.get("token") || "";

  if (!routerId || !token) return new Response("missing params", { status: 400 });

  const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { global: { fetch } });

  const { data: router } = await db
    .from("routers")
    .select("id, tenant_id, api_password, provision_token")
    .eq("id", routerId)
    .maybeSingle();

  if (!router || router.api_password !== token) return new Response("unauthorized", { status: 401 });

  const now = new Date().toISOString();

  await db.from("routers").update({
    status: "online",
    last_seen: now,
    last_poll_at: now,
    api_connected: true,
  }).eq("id", routerId);

  // Check for pending re_provision command
  const { data: commands } = await db
    .from("router_commands")
    .select("id, command, payload")
    .eq("router_id", routerId)
    .eq("status", "pending")
    .gt("expires_at", now)
    .order("created_at", { ascending: true })
    .limit(1);

  if (!commands?.length) {
    // No command — return plain "ok" so router poll on-event does nothing extra
    return new Response("ok", { status: 200, headers: { "content-type": "text/plain" } });
  }

  const cmd = commands[0];
  await db.from("router_commands").update({ status: "running", started_at: now }).eq("id", cmd.id);

  if (cmd.command === "re_provision") {
    const provisionUrl = (cmd.payload as any)?.provision_url || "";

    await db.from("router_commands").update({ status: "done", completed_at: now }).eq("id", cmd.id);

    await db.from("provision_logs").insert({
      router_id: routerId,
      tenant_id: router.tenant_id,
      stage: "router_applying",
      message: "Router received config command — fetching and applying full script now",
      success: true,
    });

    // Return JUST the URL as plain text — router reads it directly, no JSON parsing needed
    return new Response(provisionUrl, {
      status: 200,
      headers: { "content-type": "text/plain" },
    });
  }

  await db.from("router_commands").update({ status: "done", completed_at: now }).eq("id", cmd.id);
  return new Response("ok", { status: 200, headers: { "content-type": "text/plain" } });
});
