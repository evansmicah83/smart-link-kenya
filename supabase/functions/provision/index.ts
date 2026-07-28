import { serve } from "https://deno.land/std@0.201.0/http/server.ts";
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

serve(async (req: Request) => {
  if (req.method !== "GET") return new Response("Method Not Allowed", { status: 405 });

  try {
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      // Helpful server-side diagnostic message. Do not include secrets.
      return new Response('Server misconfigured: missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY', { status: 500, headers: { "content-type": "text/plain" } });
    }

    const url = new URL(req.url);
    const token = url.searchParams.get("token") || "";
    if (!token) {
      return new Response(':log warning "SmartlinkNet: provisioning link expired or invalid"', { status: 410, headers: { "content-type": "text/plain" } });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { global: { fetch } });

    const { data: router, error: selErr } = await supabase
      .from("routers")
      .select("id, name, bridge_port, provision_token_expires_at, status")
      .eq("provision_token", token)
      .maybeSingle();

    if (selErr || !router) {
      return new Response(':log warning "SmartlinkNet: provisioning link expired or invalid"', { status: 410, headers: { "content-type": "text/plain" } });
    }

    const expires = router.provision_token_expires_at ? new Date(router.provision_token_expires_at) : null;
    if (!expires || expires < new Date()) {
      return new Response(':log warning "SmartlinkNet: provisioning link expired or invalid"', { status: 410, headers: { "content-type": "text/plain" } });
    }

    // Mark as provisioning
    await supabase.from('routers').update({ status: 'provisioning' }).eq('id', router.id);

    // Build RouterOS script (plain text)
    const host = new URL(SUPABASE_URL).host;
    // Note: project uses https://<host>/functions/v1/provision-callback
    const callbackUrl = `https://${host}/functions/v1/provision-callback?token=${encodeURIComponent(token)}&stage=identity_set`;

    const scriptLines = [];
    // set identity (escape double quotes)
    const safeName = (router.name || '').replace(/"/g, '\\"');
    const bridgeName = `bridge-${safeName.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
    scriptLines.push(`/system identity set name="${safeName}"`);
    scriptLines.push(`/interface bridge add name=${bridgeName}`);
    scriptLines.push(`/tool fetch mode=https url="${callbackUrl}" keep-result=no`);
    scriptLines.push(`:log info "SmartlinkNet: identity and bridge created"`);

    const script = scriptLines.join('\n');

    return new Response(script, { status: 200, headers: { "content-type": "text/plain" } });
  } catch (err) {
    console.error(err);
    return new Response(':log warning "SmartlinkNet: provisioning link expired or invalid"', { status: 410, headers: { "content-type": "text/plain" } });
  }
});
