import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const { tenantId, phone, amount, accountRef, description, customerId } = await req.json();
    if (!tenantId || !phone || !amount) throw new Error("Missing required fields");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Fetch tenant M-Pesa credentials
    const { data: setting, error: sErr } = await supabase
      .from("settings")
      .select("value")
      .eq("tenant_id", tenantId)
      .eq("key", "mpesa")
      .maybeSingle();

    if (sErr || !setting?.value) throw new Error("M-Pesa not configured for this tenant");

    const cfg = setting.value as any;
    const isSandbox = cfg.sandbox !== false;
    const baseUrl = isSandbox
      ? "https://sandbox.safaricom.co.ke"
      : "https://api.safaricom.co.ke";

    // Get OAuth token
    const auth = btoa(`${cfg.consumer_key}:${cfg.consumer_secret}`);
    const tokenRes = await fetch(`${baseUrl}/oauth/v1/generate?grant_type=client_credentials`, {
      headers: { Authorization: `Basic ${auth}` },
    });
    if (!tokenRes.ok) throw new Error("Failed to get M-Pesa token");
    const { access_token } = await tokenRes.json();

    // Generate password
    const timestamp = new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14);
    const password = btoa(`${cfg.shortcode}${cfg.passkey}${timestamp}`);

    const payload = {
      BusinessShortCode: cfg.shortcode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: "CustomerPayBillOnline",
      Amount: Math.round(amount),
      PartyA: phone,
      PartyB: cfg.shortcode,
      PhoneNumber: phone,
      CallBackURL: cfg.callback_url || `${Deno.env.get("SUPABASE_URL")}/functions/v1/mpesa-callback`,
      AccountReference: accountRef || "SMARTLINKNET",
      TransactionDesc: description || "Internet payment",
    };

    const stkRes = await fetch(`${baseUrl}/mpesa/stkpush/v1/processrequest`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const stkData = await stkRes.json();

    if (stkData.ResponseCode !== "0") {
      throw new Error(stkData.ResponseDescription || stkData.CustomerMessage || "STK push failed");
    }

    return new Response(
      JSON.stringify({
        checkoutRequestId: stkData.CheckoutRequestID,
        merchantRequestId: stkData.MerchantRequestID,
      }),
      { headers: { ...CORS, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
