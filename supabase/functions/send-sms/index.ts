import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const { tenantId, phone, message, customerId } = await req.json();
    if (!tenantId || !phone || !message) throw new Error("Missing required fields");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: setting } = await supabase
      .from("settings")
      .select("value")
      .eq("tenant_id", tenantId)
      .eq("key", "sms")
      .maybeSingle();

    if (!setting?.value) throw new Error("SMS not configured for this tenant");
    const cfg = setting.value as any;

    const phones = Array.isArray(phone) ? phone : [phone];
    let result: any = null;

    if (cfg.provider === "africastalking") {
      const formData = new URLSearchParams({
        username: cfg.username,
        to: phones.join(","),
        message,
        ...(cfg.sender_id ? { from: cfg.sender_id } : {}),
      });
      const res = await fetch("https://api.africastalking.com/version1/messaging", {
        method: "POST",
        headers: {
          Accept: "application/json",
          apiKey: cfg.api_key,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: formData.toString(),
      });
      result = await res.json();
    } else if (cfg.provider === "twilio") {
      for (const p of phones) {
        const auth = btoa(`${cfg.username}:${cfg.api_key}`);
        await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${cfg.username}/Messages.json`,
          {
            method: "POST",
            headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({ From: cfg.sender_id, To: p, Body: message }).toString(),
          }
        );
      }
      result = { success: true };
    }

    // Log SMS — mark status based on provider response
    const smsStatus = result?.SMSMessageData?.Recipients?.[0]?.status === "Success" ||
      result?.success === true ? "sent" : "failed";

    await supabase.from("sms_logs").insert(
      phones.map((p) => ({
        tenant_id: tenantId,
        customer_id: customerId || null,
        phone: p,
        message,
        provider: cfg.provider,
        status: smsStatus,
      }))
    );

    return new Response(JSON.stringify({ success: true, result }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
