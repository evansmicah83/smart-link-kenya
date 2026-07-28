import { serve } from "https://deno.land/std@0.201.0/http/server.ts";
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || ""

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
    if (!userResp.ok) return new Response(JSON.stringify({ error: 'Invalid token' }), { status: 401, headers: { ...CORS, 'content-type': 'application/json' } });
    const userJson = await userResp.json();
    const userId = userJson?.id;
    if (!userId) return new Response(JSON.stringify({ error: 'Unable to resolve user' }), { status: 401, headers: { ...CORS, 'content-type': 'application/json' } });

    const body = await req.json();
    const { routerId } = body ?? {};
    if (!routerId) return new Response(JSON.stringify({ error: "Missing routerId" }), { status: 400, headers: { ...CORS, "content-type": "application/json" } });

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { global: { fetch } });

    // Lookup user's tenant_id from profiles (tenant_id is a workspace id, not the user's auth id)
    const { data: profile, error: profileErr } = await supabase
      .from("profiles")
      .select("tenant_id")
      .eq("id", userId)
      .maybeSingle();

    if (profileErr || !profile) {
      console.error("Failed to load profile or tenant_id:", profileErr);
      return new Response(JSON.stringify({ error: "Unable to resolve tenant for user" }), {
        status: 401,
        headers: { ...CORS, "content-type": "application/json" },
      });
    }

    const tenantId = profile.tenant_id;
    if (!tenantId) {
      console.error("User has no tenant_id on profile:", userId);
      return new Response(JSON.stringify({ error: "User is not assigned to a tenant" }), {
        status: 403,
        headers: { ...CORS, "content-type": "application/json" },
      });
    }

    const { data: existing, error: selErr } = await supabase
      .from("routers")
      .select("id")
      .eq("id", routerId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (selErr || !existing) {
      return new Response(JSON.stringify({ error: "Router not found or not owned by user" }), { status: 404, headers: { ...CORS, "content-type": "application/json" } });
    }

    const extra = crypto.getRandomValues(new Uint8Array(16));
    const extraHex = Array.from(extra).map((b) => b.toString(16).padStart(2, "0")).join("");
    const provisionToken = crypto.randomUUID() + extraHex;
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

    const { error: updErr } = await supabase
      .from("routers")
      .update({ provision_token: provisionToken, provision_token_expires_at: expiresAt })
      .eq("id", routerId);

    if (updErr) {
      console.error("Failed to set provision token:", updErr);
      return new Response(JSON.stringify({ error: "Failed to set provision token" }), { status: 500, headers: { ...CORS, "content-type": "application/json" } });
    }

    return new Response(JSON.stringify({ token: provisionToken }), { status: 200, headers: { ...CORS, "content-type": "application/json" } });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: "Internal error" }), { status: 500, headers: { ...CORS, "content-type": "application/json" } });
  }
});



