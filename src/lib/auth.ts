import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session, User } from "@supabase/supabase-js";

export type AppRole =
  | "super_admin"
  | "isp_owner"
  | "branch_manager"
  | "network_engineer"
  | "support_agent"
  | "sales_agent"
  | "accountant"
  | "field_technician"
  | "customer";

export interface Profile {
  id: string;
  tenant_id: string | null;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
}

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, s) => {
      setSession(s);
      setUser(s?.user ?? null);
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return { session, user, loading };
}

export async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, tenant_id, full_name, email, phone, avatar_url")
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    console.error(error);
    return null;
  }
  return data as Profile | null;
}

export async function fetchMyRoles(userId: string): Promise<AppRole[]> {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (error) {
    console.error(error);
    return [];
  }
  return (data ?? []).map((r) => r.role as AppRole);
}

export async function signOut() {
  await supabase.auth.signOut();
}
