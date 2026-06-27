import { supabase } from "@/integrations/supabase/client";

export async function sendSms(params: {
  tenantId: string;
  phone: string | string[];
  message: string;
  customerId?: string;
}) {
  const { data, error } = await supabase.functions.invoke("send-sms", {
    body: params,
  });
  if (error) throw error;
  return data as { success: boolean };
}
