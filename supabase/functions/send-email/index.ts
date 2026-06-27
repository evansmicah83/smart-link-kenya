import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const { tenantId, to, subject, body, customerId } = await req.json();
    if (!tenantId || !to || !subject || !body) throw new Error("Missing required fields: tenantId, to, subject, body");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const [settingRes, brandRes] = await Promise.all([
      supabase.from("settings").select("value").eq("tenant_id", tenantId).eq("key", "email").maybeSingle(),
      supabase.from("tenant_branding").select("email_from_name,email_from_address,invoice_footer,primary_color,logo_url").eq("tenant_id", tenantId).maybeSingle(),
    ]);

    const smtpCfg = settingRes.data?.value as any ?? {};
    const brand = brandRes.data as any ?? {};

    const fromName = brand.email_from_name ?? "SmartLinkNet";
    const fromEmail = brand.email_from_address ?? (Deno.env.get("SMTP_FROM") ?? "noreply@smartlinknet.co.ke");
    const primaryColor = brand.primary_color ?? "#0ea5e9";
    const logoUrl = brand.logo_url ?? "";

    const htmlBody = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body{font-family:system-ui,-apple-system,sans-serif;background:#f4f4f8;margin:0;padding:0;}
  .w{max-width:560px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,.08);}
  .hd{background:${primaryColor};padding:24px 32px;text-align:center;}
  .hd img{max-height:48px;max-width:180px;object-fit:contain;}
  .hd h1{color:#fff;font-size:20px;margin:8px 0 0;font-weight:700;}
  .bd{padding:32px;color:#374151;line-height:1.7;font-size:15px;}
  .ft{background:#f9fafb;border-top:1px solid #e5e7eb;padding:20px 32px;text-align:center;color:#9ca3af;font-size:12px;}
</style></head>
<body><div class="w">
  <div class="hd">${logoUrl ? `<img src="${logoUrl}" alt="">` : ""}<h1>${fromName}</h1></div>
  <div class="bd">${body.replace(/\n/g, "<br>")}</div>
  <div class="ft">${brand.invoice_footer ?? `&copy; ${new Date().getFullYear()} ${fromName}. All rights reserved.`}</div>
</div></body></html>`;

    const resendKey = smtpCfg.resend_key ?? Deno.env.get("RESEND_API_KEY");
    let status = "pending";
    let errorMsg = null;

    if (resendKey) {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: `${fromName} <${fromEmail}>`, to: [to], subject, html: htmlBody }),
      });
      status = res.ok ? "sent" : "failed";
      if (!res.ok) errorMsg = await res.text();
    } else {
      errorMsg = "No email provider configured. Add RESEND_API_KEY or configure email settings.";
    }

    await supabase.from("email_logs").insert({
      tenant_id: tenantId,
      customer_id: customerId ?? null,
      to_email: to,
      subject,
      body: htmlBody,
      status,
      provider: resendKey ? "resend" : "none",
      error: errorMsg,
    });

    return new Response(JSON.stringify({ success: status !== "failed", status }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
