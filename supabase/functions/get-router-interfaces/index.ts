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

    const { data: profile, error: profileErr } = await supabase
      .from("profiles")
      .select("tenant_id")
      .eq("id", userId)
      .maybeSingle();

    if (profileErr || !profile) {
      return new Response(JSON.stringify({ error: "Unable to resolve tenant for user" }), { status: 401, headers: { ...CORS, "content-type": "application/json" } });
    }

    const tenantId = profile.tenant_id;
    if (!tenantId) {
      return new Response(JSON.stringify({ error: "User is not assigned to a tenant" }), { status: 403, headers: { ...CORS, "content-type": "application/json" } });
    }

    const { data: router, error: selErr } = await supabase
      .from("routers")
      .select("id, name, connection_string, ip_address, api_port, api_username, api_password")
      .eq("id", routerId)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (selErr || !router) {
      return new Response(JSON.stringify({ error: "Router not found or not owned by user" }), { status: 404, headers: { ...CORS, "content-type": "application/json" } });
    }

    const host = router.connection_string || router.ip_address || null;
    const port = router.api_port || 8728;
    if (!host) return new Response(JSON.stringify({ interfaces: [] }), { status: 200, headers: { ...CORS, "content-type": "application/json" } });

    const basicAuth = router.api_username && router.api_password
      ? `Basic ${btoa(`${router.api_username}:${router.api_password}`)}`
      : null;

    const paths = [
      `https://${host}:${port}/rest/interface`,
      `http://${host}:${port}/rest/interface`,
    ];

    let lastErr: any = null;
    for (const p of paths) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        const res = await fetch(p, {
          method: "GET",
          headers: {
            "accept": "application/json",
            ...(basicAuth ? { Authorization: basicAuth } : {}),
          },
          signal: controller.signal,
        });
        clearTimeout(timeout);
        if (!res.ok) { lastErr = `HTTP ${res.status} from ${p}`; continue; }

        const json = await res.json();
        const interfaces = (Array.isArray(json) ? json : []).map((it: any) => ({
          name: it.name || it[".id"] || null,
          link: it.link_up ? true : (it.link ? (it.link === "true" || it.link === true) : null),
          rx: Number(it.rx_byte ?? it["rx-byte"] ?? 0),
          tx: Number(it.tx_byte ?? it["tx-byte"] ?? 0),
          running: it.running ?? null,
        })).filter((i: any) => i.name);

        return new Response(JSON.stringify({ interfaces, source: p }), { status: 200, headers: { ...CORS, "content-type": "application/json" } });
      } catch (err) {
        lastErr = err;
      }
    }

    return new Response(JSON.stringify({ interfaces: [] }), { status: 200, headers: { ...CORS, "content-type": "application/json" } });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: "Internal error" }), { status: 500, headers: { ...CORS, "content-type": "application/json" } });
  }
});
