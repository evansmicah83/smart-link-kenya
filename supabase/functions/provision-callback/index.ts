import { serve } from "https://deno.land/std@0.201.0/http/server.ts";
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

serve(async (req: Request) => {
  try {
    const url = new URL(req.url);
    const routerId = url.searchParams.get("router_id") || "";
    const stage = url.searchParams.get("stage") || "unknown";

    if (!routerId) return new Response("missing router_id", { status: 400, headers: { "content-type": "text/plain" } });

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { global: { fetch } });

    await supabase.from("routers").update({
      status: "online",
      last_seen: new Date().toISOString(),
      provision_token: null,
      provision_token_expires_at: null,
    }).eq("id", routerId);

    await supabase.from("provision_logs").insert([{
      router_id: routerId,
      stage,
      message: `Router came online at stage=${stage}`,
      success: true,
    }]);

    return new Response("ok", { status: 200, headers: { "content-type": "text/plain" } });
  } catch (err) {
    console.error(err);
    return new Response("error", { status: 500, headers: { "content-type": "text/plain" } });
  }
});
