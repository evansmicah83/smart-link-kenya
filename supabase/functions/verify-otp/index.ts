import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const { action, tenantId, phone, code } = await req.json();
    if (!tenantId || !phone) throw new Error("tenantId and phone are required");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    if (action === "send") {
      // Clean expired/used codes for this phone
      await supabase.from("otp_codes").delete()
        .eq("phone", phone).eq("tenant_id", tenantId)
        .or("used.eq.true,expires_at.lt." + new Date().toISOString());

      // Generate 6-digit OTP
      const otp = String(Math.floor(100000 + Math.random() * 900000));

      await supabase.from("otp_codes").insert({
        tenant_id: tenantId,
        phone,
        code: otp,
        purpose: "portal_login",
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      });

      // Send via SMS
      const { data: smsCfg } = await supabase
        .from("settings").select("value").eq("tenant_id", tenantId).eq("key", "sms").maybeSingle();

      if (smsCfg?.value) {
        await supabase.functions.invoke("send-sms", {
          body: { tenantId, phone, message: `Your WiFi OTP is: ${otp}. Valid for 10 minutes. Do not share.` },
        });
      }

      return new Response(JSON.stringify({ success: true, message: "OTP sent" }), {
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    if (action === "verify") {
      if (!code) throw new Error("code is required for verify action");

      const { data: otpRow } = await supabase.from("otp_codes")
        .select("id, used, expires_at")
        .eq("tenant_id", tenantId)
        .eq("phone", phone)
        .eq("code", code)
        .eq("used", false)
        .gte("expires_at", new Date().toISOString())
        .maybeSingle();

      if (!otpRow) {
        return new Response(JSON.stringify({ success: false, error: "Invalid or expired OTP." }), {
          headers: { ...CORS, "Content-Type": "application/json" },
        });
      }

      // Mark as used
      await supabase.from("otp_codes").update({ used: true }).eq("id", otpRow.id);

      // Get or create customer
      let { data: customer } = await supabase
        .from("customers").select("id").eq("tenant_id", tenantId).eq("phone", phone).maybeSingle();

      if (!customer) {
        const { data: nc } = await supabase.from("customers").insert({
          tenant_id: tenantId,
          phone,
          full_name: `WiFi User ${phone.slice(-4)}`,
          category: "residential",
          status: "active",
        }).select("id").single();
        customer = nc;
      }

      // Create a short-lived customer session token
      const token = crypto.randomUUID() + crypto.randomUUID();
      await supabase.from("customer_sessions").insert({
        tenant_id: tenantId,
        customer_id: customer!.id,
        token,
        phone,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      });

      return new Response(JSON.stringify({ success: true, customerId: customer!.id, token }), {
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    throw new Error("Invalid action. Use 'send' or 'verify'.");
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
