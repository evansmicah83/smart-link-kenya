import { serve } from "https://deno.land/std@0.201.0/http/server.ts";
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

serve(async (req: Request) => {
  // RouterOS will call this with /functions/v1/provision-callback?token=...&stage=...
  try {
    const url = new URL(req.url);
    const token = url.searchParams.get('token') || '';
    const stage = url.searchParams.get('stage') || '';
    if (!token) return new Response('missing token', { status: 400, headers: { 'content-type': 'text/plain' } });

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { global: { fetch } });

    const { data: router, error: selErr } = await supabase
      .from('routers')
      .select('id')
      .eq('provision_token', token)
      .maybeSingle();

    if (selErr || !router) return new Response('not found', { status: 404, headers: { 'content-type': 'text/plain' } });

    // Insert a provision log row
    const message = `callback received for stage=${stage}`;
    await supabase.from('provision_logs').insert([{ router_id: router.id, stage: stage || 'unknown', message, success: true }]);

    // Minimal plain-text 200 OK so RouterOS fetch() doesn't error
    return new Response('ok', { status: 200, headers: { 'content-type': 'text/plain' } });
  } catch (err) {
    console.error(err);
    return new Response('error', { status: 500, headers: { 'content-type': 'text/plain' } });
  }
});
