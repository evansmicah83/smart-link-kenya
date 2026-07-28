import { serve } from "https://deno.land/std@0.201.0/http/server.ts";
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405, headers: CORS });

  try {
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) return new Response(JSON.stringify({ error: "Missing Authorization token" }), { status: 401, headers: { ...CORS, "content-type": "application/json" } });

    const userResp = await fetch(SUPABASE_URL.replace(/\/+$/, "") + "/auth/v1/user", { headers: { Authorization: "Bearer " + token, apikey: ANON_KEY } });
    if (!userResp.ok) return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401, headers: { ...CORS, "content-type": "application/json" } });
    const userJson = await userResp.json();
    const userId = userJson?.id;
    if (!userId) return new Response(JSON.stringify({ error: "Unable to resolve user" }), { status: 401, headers: { ...CORS, "content-type": "application/json" } });

    const body = await req.json();
    const { routerId } = body ?? {};
    if (!routerId) return new Response(JSON.stringify({ error: "Missing routerId" }), { status: 400, headers: { ...CORS, "content-type": "application/json" } });

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { global: { fetch } });

    const { data: profile } = await supabase.from("profiles").select("tenant_id").eq("id", userId).maybeSingle();
    if (!profile?.tenant_id) return new Response(JSON.stringify({ error: "Unable to resolve tenant" }), { status: 401, headers: { ...CORS, "content-type": "application/json" } });

    const { data: router, error: selErr } = await supabase.from("routers").select("*").eq("id", routerId).eq("tenant_id", profile.tenant_id).maybeSingle();
    if (selErr || !router) return new Response(JSON.stringify({ error: "Router not found" }), { status: 404, headers: { ...CORS, "content-type": "application/json" } });

    // Mark router active and log completion
    await supabase.from("routers").update({
      status: "active",
      provisioned_at: new Date().toISOString(),
    }).eq("id", routerId);

    await supabase.from("provision_logs").insert([{
      router_id: routerId,
      stage: "complete",
      message: "Router configuration applied successfully",
      success: true,
    }]);

    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { ...CORS, "content-type": "application/json" } });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: "Internal error" }), { status: 500, headers: { ...CORS, "content-type": "application/json" } });
  }
});
