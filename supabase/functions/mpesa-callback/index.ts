import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const body = await req.json();
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const stk = body?.Body?.stkCallback;
    if (!stk) return new Response("ok", { headers: CORS });

    const checkoutRequestId = stk.CheckoutRequestID;
    const resultCode = stk.ResultCode;
    const resultDesc = stk.ResultDesc;

    // Idempotency — check if already processed
    const { data: existing } = await supabase
      .from("mpesa_callbacks")
      .select("id, processed")
      .eq("checkout_request_id", checkoutRequestId)
      .maybeSingle();

    if (existing?.processed) {
      return new Response("already processed", { headers: CORS });
    }

    let mpesaReceipt = null, amount = null, phone = null, transactionDate = null;

    if (resultCode === 0 && stk.CallbackMetadata?.Item) {
      for (const item of stk.CallbackMetadata.Item) {
        if (item.Name === "MpesaReceiptNumber") mpesaReceipt = item.Value;
        if (item.Name === "Amount") amount = item.Value;
        if (item.Name === "PhoneNumber") phone = String(item.Value);
        if (item.Name === "TransactionDate") transactionDate = String(item.Value);
      }
    }

    // Store callback (idempotent via unique index on checkout_request_id)
    const { error: upsertErr } = await supabase.from("mpesa_callbacks").upsert({
      checkout_request_id: checkoutRequestId,
      result_code: resultCode,
      result_desc: resultDesc,
      amount,
      mpesa_receipt: mpesaReceipt,
      phone,
      transaction_date: transactionDate,
      raw_payload: body,
      processed: false,
    }, { onConflict: "checkout_request_id", ignoreDuplicates: false });

    // Update matching payment
    if (resultCode === 0 && mpesaReceipt) {
      const { data: payment } = await supabase
        .from("payments")
        .select("id, customer_id, amount, tenant_id")
        .eq("reference", checkoutRequestId)
        .maybeSingle();

      if (payment) {
        await supabase.from("payments").update({
          status: "completed",
          mpesa_receipt: mpesaReceipt,
        }).eq("id", payment.id);

        // Create in-app notification for all ISP owner/admin users in the tenant
        const { data: tenantUsers } = await supabase
          .from("profiles")
          .select("id")
          .eq("tenant_id", payment.tenant_id)
          .limit(10);
        if (tenantUsers?.length) {
          await supabase.from("notifications").insert(
            tenantUsers.map((u) => ({
              user_id: u.id,
              tenant_id: payment.tenant_id,
              title: "Payment Received",
              message: `KES ${amount} received via M-Pesa. Receipt: ${mpesaReceipt}`,
              type: "success",
            }))
          );
        }

        // Send SMS confirmation to customer
        if (phone) {
          const { data: smsCfg } = await supabase
            .from("settings")
            .select("value")
            .eq("tenant_id", payment.tenant_id)
            .eq("key", "sms")
            .maybeSingle();
          if (smsCfg?.value) {
            await supabase.functions.invoke("send-sms", {
              body: {
                tenantId: payment.tenant_id,
                phone,
                message: `Payment of KES ${amount} received. Receipt: ${mpesaReceipt}. Thank you for using SmartLinkNet.`,
                customerId: payment.customer_id,
              },
            }).catch(() => {}); // non-blocking

          // Send email confirmation if customer has email
          const { data: custData } = await supabase
            .from("customers").select("email, full_name").eq("id", payment.customer_id).maybeSingle();
          if (custData?.email) {
            await supabase.functions.invoke("send-email", {
              body: {
                tenantId: payment.tenant_id,
                to: custData.email,
                subject: `Payment Confirmed — KES ${amount}`,
                body: `Dear ${custData.full_name ?? "Customer"},\n\nYour payment of KES ${amount} has been received.\nM-Pesa Receipt: ${mpesaReceipt}\n\nThank you for choosing us!`,
                customerId: payment.customer_id,
              },
            }).catch(() => {});
          }
          }
        }

        // ── Phase 3: Trigger payment_success workflow via provisioning engine ──
        await supabase.rpc("fn_initiate_workflow", {
          _tenant_id:           payment.tenant_id,
          _type:                "payment_success",
          _payload:             {
            payment_id:  payment.id,
            customer_id: payment.customer_id,
            amount:      payment.amount,
            tenant_id:   payment.tenant_id,
            package_id:  (payment as any).package_id ?? null,
          },
          _idempotency_key:     `payment_success-${payment.id}`,
          _trigger_source:      "mpesa_callback",
          _trigger_entity_id:   payment.id,
          _trigger_entity_type: "payment",
          _max_retries:         3,
        }).catch(() => {
          // Fallback: direct subscription activation if workflow engine unavailable
          supabase.from("subscriptions").update({ status: "active" })
            .eq("customer_id", payment.customer_id).eq("status", "pending");
        });
      }
    } else if (resultCode !== 0) {
      // Mark as failed, then trigger payment_failure workflow
      await supabase.from("payments").update({ status: "failed" }).eq("reference", checkoutRequestId);
      const { data: failedPayment } = await supabase
        .from("payments").select("id, customer_id, amount, tenant_id")
        .eq("reference", checkoutRequestId).maybeSingle();
      if (failedPayment) {
        await supabase.rpc("fn_initiate_workflow", {
          _tenant_id:           failedPayment.tenant_id,
          _type:                "payment_failure",
          _payload:             {
            payment_id:      failedPayment.id,
            customer_id:     failedPayment.customer_id,
            amount:          failedPayment.amount,
            tenant_id:       failedPayment.tenant_id,
            failure_reason:  resultDesc ?? "M-Pesa declined",
          },
          _idempotency_key:     `payment_failure-${failedPayment.id}-${Date.now()}`,
          _trigger_source:      "mpesa_callback",
          _trigger_entity_id:   failedPayment.id,
          _trigger_entity_type: "payment",
          _max_retries:         1,
        }).catch(() => {});
      }
    }

    // Mark callback as processed
    await supabase.from("mpesa_callbacks").update({ processed: true }).eq("checkout_request_id", checkoutRequestId);

    return new Response(JSON.stringify({ ResultCode: 0, ResultDesc: "Accepted" }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("M-Pesa callback error:", err);
    return new Response(JSON.stringify({ ResultCode: 1, ResultDesc: err.message }), {
      status: 200, // Always return 200 to Safaricom
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
