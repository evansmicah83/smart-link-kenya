import { supabase } from "@/integrations/supabase/client";

export interface StkPushParams {
  tenantId: string;
  phone: string;
  amount: number;
  accountRef: string;
  description: string;
  customerId: string;
}

export async function initiateStkPush(params: StkPushParams) {
  const { data, error } = await supabase.functions.invoke("mpesa-stk-push", {
    body: params,
  });
  if (error) throw error;
  return data as { checkoutRequestId: string; merchantRequestId: string };
}

export function formatPhone(phone: string): string {
  const cleaned = phone.replace(/\D/g, "");
  if (cleaned.startsWith("0")) return "254" + cleaned.slice(1);
  if (cleaned.startsWith("+")) return cleaned.slice(1);
  if (cleaned.startsWith("254")) return cleaned;
  return "254" + cleaned;
}
