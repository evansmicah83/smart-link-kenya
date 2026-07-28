import { serve } from "https://deno.land/std@0.201.0/http/server.ts";
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

serve(async (req: Request) => {
  if (req.method !== "GET") return new Response("Method Not Allowed", { status: 405 });

  const url = new URL(req.url);
  const token = url.searchParams.get("token") || "";

  if (!token) {
    return new Response(':log warning "SmartlinkNet: no token provided"', { status: 400, headers: { "content-type": "text/plain" } });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { global: { fetch } });

  const { data: router, error } = await supabase
    .from("routers")
    .select("id, name, bridge_port, provision_token_expires_at")
    .eq("provision_token", token)
    .maybeSingle();

  if (error || !router) {
    return new Response(`:log warning "SmartlinkNet: token not found"`, { status: 410, headers: { "content-type": "text/plain" } });
  }

  // Auto-extend if expired instead of rejecting
  const expires = router.provision_token_expires_at ? new Date(router.provision_token_expires_at) : null;
  if (expires && expires < new Date()) {
    await supabase.from("routers").update({
      provision_token_expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    }).eq("id", router.id);
  }

  // Mark as provisioning — keep token so callback can find the router
  await supabase.from("routers").update({ status: "provisioning" }).eq("id", router.id);

  const safeName = (router.name || "MikroTik").replace(/"/g, '\\"');
  const bridgeName = `bridge-${safeName.toLowerCase().replace(/[^a-z0-9]/g, "-")}`;

  // Pass router id in callback so it doesn't need to look up by token
  const callbackUrl = `https://${new URL(SUPABASE_URL).host}/functions/v1/provision-callback?router_id=${router.id}&stage=identity_set`;

  const script = [
    `/system identity set name="${safeName}"`,
    `/interface bridge add name=${bridgeName}`,
    `/tool fetch mode=https url="${callbackUrl}" keep-result=no`,
    `:log info "SmartlinkNet: provisioning complete"`,
  ].join("\n");

  return new Response(script, { status: 200, headers: { "content-type": "text/plain" } });
});
