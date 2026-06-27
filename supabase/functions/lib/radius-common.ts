import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export function createSupabaseClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

export function now(): string {
  return new Date().toISOString();
}

export interface NasDeviceRecord {
  id: string;
  tenant_id: string;
  shared_secret: string | null;
  is_active: boolean;
  radius_server_id: string | null;
}

export async function resolveNasDevice(
  sb: SupabaseClient,
  nasIdentifier?: string | null,
  nasIp?: string | null
): Promise<NasDeviceRecord | null> {
  if (!nasIdentifier && !nasIp) return null;

  let query = sb
    .from("nas_devices")
    .select("id,tenant_id,shared_secret,is_active,radius_server_id")
    .eq("is_active", true);

  if (nasIdentifier) {
    query = query.eq("nas_identifier", nasIdentifier) as any;
  } else {
    query = query.eq("nas_ip", nasIp) as any;
  }

  const { data, error } = await (query as any).maybeSingle();
  if (error) throw new Error(error.message);
  return data as NasDeviceRecord | null;
}

export function verifyNasSecret(
  nas: NasDeviceRecord | null,
  suppliedSecret?: string | null
): boolean {
  if (!nas) return false;
  if (!nas.shared_secret) return true;
  return suppliedSecret === nas.shared_secret;
}
