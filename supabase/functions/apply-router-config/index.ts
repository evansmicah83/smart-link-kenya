import { serve } from "https://deno.land/std@0.201.0/http/server.ts";
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: CORS });

  const sendLog = async (supabase: any, routerId: string, stage: string, message: string, success = true) => {
    try {
      await supabase.from('provision_logs').insert([{ router_id: routerId, stage, message, success }]);
    } catch (e) {
      console.error('Failed to write provision_log', e);
    }
  };

  try {
    const authHeader = req.headers.get('authorization') || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!token) return new Response(JSON.stringify({ error: 'Missing Authorization token' }), { status: 401, headers: { ...CORS, 'content-type': 'application/json' } });

    // Verify user
    const authHeaders = { Authorization: 'Bearer ' + token };
    const userResp = await fetch(SUPABASE_URL.replace(/\/+$/, '') + '/auth/v1/user', { headers: authHeaders });
    if (!userResp.ok) return new Response(JSON.stringify({ error: 'Invalid token' }), { status: 401, headers: { ...CORS, 'content-type': 'application/json' } });
    const userJson = await userResp.json();
    const userId = userJson?.id;
    if (!userId) return new Response(JSON.stringify({ error: 'Unable to resolve user' }), { status: 401, headers: { ...CORS, 'content-type': 'application/json' } });

    const body = await req.json();
    const { routerId } = body ?? {};
    if (!routerId) return new Response(JSON.stringify({ error: 'Missing routerId' }), { status: 400, headers: { ...CORS, 'content-type': 'application/json' } });

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { global: { fetch } });

    // Lookup router
    const { data: router, error: selErr } = await supabase
      .from('routers')
      .select('*')
      .eq('id', routerId)
      .maybeSingle();
    if (selErr || !router) return new Response(JSON.stringify({ error: 'Router not found' }), { status: 404, headers: { ...CORS, 'content-type': 'application/json' } });

    // Resolve user's tenant and confirm ownership by tenant_id
    const { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .select('tenant_id')
      .eq('id', userId)
      .maybeSingle();

    if (profileErr || !profile) {
      console.error('Failed to load profile or tenant_id:', profileErr);
      await sendLog(supabase, routerId, 'authorize', 'Failed to load user tenant', false);
      return new Response(JSON.stringify({ error: 'Unable to resolve tenant for user' }), { status: 401, headers: { ...CORS, 'content-type': 'application/json' } });
    }

    const tenantId = profile.tenant_id;
    if (!tenantId) {
      console.error('User has no tenant_id on profile:', userId);
      await sendLog(supabase, routerId, 'authorize', 'User has no tenant assigned', false);
      return new Response(JSON.stringify({ error: 'User is not assigned to a tenant' }), { status: 403, headers: { ...CORS, 'content-type': 'application/json' } });
    }

    if (router.tenant_id !== tenantId) {
      await sendLog(supabase, routerId, 'authorize', 'User is not owner of router', false);
      return new Response(JSON.stringify({ error: 'Not authorized' }), { status: 403, headers: { ...CORS, 'content-type': 'application/json' } });
    }

    const host = router.connection_string || router.ip_address || router.host || null;
    const port = router.api_port || 8728;
    if (!host) {
      await sendLog(supabase, routerId, 'validate', 'Router IP not configured', false);
      await supabase.from('routers').update({ status: 'failed' }).eq('id', routerId);
      return new Response(JSON.stringify({ error: 'Router IP not configured' }), { status: 400, headers: { ...CORS, 'content-type': 'application/json' } });
    }

    const bridgeName = router.bridge_name || 'smartlinknet-bridge';
    const bridgePorts = router.bridge_ports || [];
    const uplink = router.uplink_interface || null;
    const subnet = router.subnet || '172.31.0.0/16';

    // Safety check: uplink must not be in bridge_ports
    if (uplink && bridgePorts.includes(uplink)) {
      const msg = `Uplink ${uplink} is included in bridge_ports — aborting`;
      await sendLog(supabase, routerId, 'validate', msg, false);
      await supabase.from('routers').update({ status: 'failed' }).eq('id', routerId);
      return new Response(JSON.stringify({ error: msg }), { status: 400, headers: { ...CORS, 'content-type': 'application/json' } });
    }

    const baseUrls = [`https://${host}:${port}`, `http://${host}:${port}`];
    const basicAuth = router.api_username && router.api_password ? `Basic ${btoa(`${router.api_username}:${router.api_password}`)}` : null;

    // Helper to call router REST API
    const callRouter = async (method: string, path: string, body?: any) => {
      let lastErr = null;
      for (const base of baseUrls) {
        try {
          const url = `${base}/rest${path}`;
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 5000);
          const res = await fetch(url, {
            method,
            headers: {
              'content-type': 'application/json',
              ...(basicAuth ? { Authorization: basicAuth } : {}),
            },
            body: body ? JSON.stringify(body) : undefined,
            signal: controller.signal,
          });
          clearTimeout(timeout);
          if (!res.ok) {
            lastErr = `HTTP ${res.status} from ${url}`;
            continue;
          }
          try { return await res.json(); } catch { return true; }
        } catch (err) {
          lastErr = err;
        }
      }
      throw new Error(String(lastErr));
    };

    // 1. Add each bridge port to bridge_name
    try {
      for (const p of bridgePorts) {
        await sendLog(supabase, routerId, 'bridge_add_port', `Adding ${p} to bridge ${bridgeName}`);
        // POST /rest/interface/bridge/port with {interface: p, bridge: bridgeName}
        await callRouter('POST', '/interface/bridge/port', { interface: p, bridge: bridgeName });
        await sendLog(supabase, routerId, 'bridge_add_port', `Added ${p} to bridge ${bridgeName}`);
      }
    } catch (err: any) {
      await sendLog(supabase, routerId, 'bridge_add_port', `Failed to add bridge ports: ${err.message || String(err)}`, false);
      await supabase.from('routers').update({ status: 'failed' }).eq('id', routerId);
      return new Response(JSON.stringify({ error: 'Failed to add bridge ports' }), { status: 500, headers: { ...CORS, 'content-type': 'application/json' } });
    }

    // 2. Assign subnet gateway IP to bridge interface
    try {
      const gateway = subnet.includes('/') ? subnet.split('/')[0] : subnet;
      const address = `${gateway}/32`; // best-effort single address; adjust as needed
      await sendLog(supabase, routerId, 'assign_gateway', `Assigning ${address} to ${bridgeName}`);
      await callRouter('POST', '/ip/address', { address, interface: bridgeName });
      await sendLog(supabase, routerId, 'assign_gateway', `Assigned ${address} to ${bridgeName}`);
    } catch (err: any) {
      await sendLog(supabase, routerId, 'assign_gateway', `Failed to assign gateway: ${err.message || String(err)}`, false);
      await supabase.from('routers').update({ status: 'failed' }).eq('id', routerId);
      return new Response(JSON.stringify({ error: 'Failed to assign gateway' }), { status: 500, headers: { ...CORS, 'content-type': 'application/json' } });
    }

    // 3. PPPoE server if requested
    if (router.mode === 'pppoe' || router.mode === 'both') {
      try {
        await sendLog(supabase, routerId, 'pppoe_setup', `Configuring PPPoE on ${bridgeName}`);
        // Create PPP profile and server — endpoints may vary; attempt ppp profile and server
        await callRouter('POST', '/ppp/profile', { name: 'sln-profile', local_address: gateway || '172.31.0.1', remote_address: '172.31.0.0' });
        await callRouter('POST', '/ppp/server', { service: 'pppoe', interface: bridgeName, name: 'pppoe-server' });
        await sendLog(supabase, routerId, 'pppoe_setup', `Configured PPPoE server`);
      } catch (err: any) {
        await sendLog(supabase, routerId, 'pppoe_setup', `Failed PPPoE setup: ${err.message || String(err)}`, false);
        await supabase.from('routers').update({ status: 'failed' }).eq('id', routerId);
        return new Response(JSON.stringify({ error: 'Failed PPPoE setup' }), { status: 500, headers: { ...CORS, 'content-type': 'application/json' } });
      }
    }

    // 4. Hotspot setup
    if (router.mode === 'hotspot' || router.mode === 'both') {
      try {
        await sendLog(supabase, routerId, 'hotspot_setup', `Configuring Hotspot on ${bridgeName}`);
        // Minimal hotspot setup attempt — real setup is more involved
        await callRouter('POST', '/ip/hotspot', { name: 'hotspot1', address_pool: 'hs-pool', interface: bridgeName });
        // Add walled-garden access for payment domain (example: daraja.payments)
        const paymentHost = 'daraja.payments';
        await callRouter('POST', '/ip/hotspot/walled-garden', { dst_host: paymentHost });
        await sendLog(supabase, routerId, 'hotspot_setup', `Configured Hotspot and walled-garden for ${paymentHost}`);
      } catch (err: any) {
        await sendLog(supabase, routerId, 'hotspot_setup', `Failed Hotspot setup: ${err.message || String(err)}`, false);
        await supabase.from('routers').update({ status: 'failed' }).eq('id', routerId);
        return new Response(JSON.stringify({ error: 'Failed Hotspot setup' }), { status: 500, headers: { ...CORS, 'content-type': 'application/json' } });
      }
    }

    // Success — mark router active, clear token
    try {
      await supabase.from('routers').update({ status: 'active', provisioned_at: new Date().toISOString(), provision_token: null }).eq('id', routerId);
      await sendLog(supabase, routerId, 'complete', 'Provisioning complete', true);
    } catch (err) {
      await sendLog(supabase, routerId, 'complete', `Failed to finalize router state: ${String(err)}`, false);
      return new Response(JSON.stringify({ error: 'Failed to finalize router state' }), { status: 500, headers: { ...CORS, 'content-type': 'application/json' } });
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { ...CORS, 'content-type': 'application/json' } });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500, headers: { ...CORS, 'content-type': 'application/json' } });
  }
});
