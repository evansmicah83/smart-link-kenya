import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const { tenantId, phone, message, template, customerId } = await req.json();
    if (!tenantId || !phone || !message)
      throw new Error("Missing required fields: tenantId, phone, message");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: setting } = await supabase
      .from("settings")
      .select("value")
      .eq("tenant_id", tenantId)
      .eq("key", "whatsapp")
      .maybeSingle();

    const cfg = (setting?.value as any) ?? {};
    const phones: string[] = Array.isArray(phone) ? phone : [phone];

    let status = "pending";
    let errorMsg: string | null = null;

    const waToken = cfg.access_token ?? Deno.env.get("WHATSAPP_ACCESS_TOKEN");
    const phoneNumberId = cfg.phone_number_id ?? Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");

    if (waToken && phoneNumberId) {
      // Meta WhatsApp Business Cloud API
      for (const p of phones) {
        const res = await fetch(
          `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${waToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              messaging_product: "whatsapp",
              to: p.replace(/\D/g, ""),
              type: "text",
              text: { body: message },
            }),
          }
        );
        if (!res.ok) {
          errorMsg = await res.text();
          status = "failed";
        } else {
          status = "sent";
        }
      }
    } else {
      errorMsg =
        "WhatsApp not configured. Add WHATSAPP_ACCESS_TOKEN + WHATSAPP_PHONE_NUMBER_ID in Supabase secrets or Settings → WhatsApp.";
      status = "failed";
    }

    await supabase.from("whatsapp_logs").insert(
      phones.map((p) => ({
        tenant_id: tenantId,
        customer_id: customerId ?? null,
        phone: p,
        message,
        template: template ?? null,
        status,
        error: errorMsg,
      }))
    );

    return new Response(
      JSON.stringify({ success: status === "sent", status, error: errorMsg }),
      { headers: { ...CORS, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
