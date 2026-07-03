import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const { email, phone, userId } = await req.json();
    if (!userId) throw new Error("userId required");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // cleanup old otps
    await supabase.from("otp_codes").delete().eq("user_id", userId).or("used.eq.true,expires_at.lt." + new Date().toISOString());

    const otp = String(Math.floor(100000 + Math.random() * 900000));
    await supabase.from("otp_codes").insert({
      user_id: userId,
      phone,
      code: otp,
      purpose: "signup_verify",
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    });

    // send via SMS function
    await supabase.functions.invoke("send-sms", { body: { phone, message: `Your SmartLinkNet verification code is ${otp}.` } });

    return new Response(JSON.stringify({ success: true }), { headers: { ...CORS, "Content-Type": "application/json" } });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });
  }
});
