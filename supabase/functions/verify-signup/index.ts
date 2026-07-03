import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const { userId, code } = await req.json();
    if (!userId || !code) throw new Error('userId and code required');

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const { data: otpRow } = await supabase.from('otp_codes').select('id, used, expires_at, phone').eq('user_id', userId).eq('code', code).eq('used', false).gte('expires_at', new Date().toISOString()).maybeSingle();
    if (!otpRow) return new Response(JSON.stringify({ error: 'Invalid or expired code' }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } });

    await supabase.from('otp_codes').update({ used: true }).eq('id', otpRow.id);

    // update profile phone and mark verified
    await supabase.from('profiles').update({ phone: otpRow.phone }).eq('id', userId);

    return new Response(JSON.stringify({ success: true }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
  } catch (err:any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }
});
