import { useEffect, useState, useCallback, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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

// ── Session cache key ──────────────────────────────────────────
const SESSION_CACHE_KEY = "sln:session";
const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

function cacheSession(session: Session | null) {
  if (typeof window === "undefined") return;
  if (session) {
    sessionStorage.setItem(SESSION_CACHE_KEY, JSON.stringify({
      access_token: session.access_token,
      expires_at: session.expires_at,
      user_id: session.user.id,
    }));
  } else {
    sessionStorage.removeItem(SESSION_CACHE_KEY);
  }
}

function getCachedSession() {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(SESSION_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Treat as expired if within 60s of expiry
    if (parsed.expires_at && Date.now() / 1000 > parsed.expires_at - 60) {
      sessionStorage.removeItem(SESSION_CACHE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

// ── useAuth ────────────────────────────────────────────────────
export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const qc = useQueryClient();

  const resetIdleTimer = useCallback(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(async () => {
      // Auto sign-out after idle timeout
      await supabase.auth.signOut();
      cacheSession(null);
      qc.clear();
      window.location.href = "/auth?reason=idle";
    }, IDLE_TIMEOUT_MS);
  }, [qc]);

  useEffect(() => {
    // Initialise from Supabase (handles token refresh automatically)
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      cacheSession(data.session);
      setLoading(false);
      if (data.session) resetIdleTimer();
    });

    // Listen for auth state changes
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      cacheSession(s);

      if (event === "SIGNED_OUT") {
        qc.clear();
        if (idleTimer.current) clearTimeout(idleTimer.current);
      }
      if (event === "TOKEN_REFRESHED" || event === "SIGNED_IN") {
        resetIdleTimer();
        // Invalidate profile/roles so they reload with fresh token
        qc.invalidateQueries({ queryKey: ["profile"] });
        qc.invalidateQueries({ queryKey: ["roles"] });
      }
      if (event === "USER_UPDATED") {
        qc.invalidateQueries({ queryKey: ["profile"] });
      }
    });

    // Reset idle timer on user activity
    const events = ["mousedown", "keydown", "touchstart", "scroll"] as const;
    const onActivity = () => { if (session) resetIdleTimer(); };
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));

    return () => {
      sub.subscription.unsubscribe();
      events.forEach((e) => window.removeEventListener(e, onActivity));
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { session, user, loading };
}

// ── Profile ────────────────────────────────────────────────────
export async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, tenant_id, full_name, email, phone, avatar_url")
    .eq("id", userId)
    .maybeSingle();
  if (error) { console.error(error); return null; }
  return data as Profile | null;
}

// ── Roles ──────────────────────────────────────────────────────
export async function fetchMyRoles(userId: string): Promise<AppRole[]> {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (error) { console.error(error); return []; }
  return (data ?? []).map((r) => r.role as AppRole);
}

// ── Sign out ───────────────────────────────────────────────────
export async function signOut() {
  cacheSession(null);
  await supabase.auth.signOut({ scope: "local" });
}

// ── Tenant ID ─────────────────────────────────────────────────
export function useTenantId() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["tenant-id", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("tenant_id")
        .eq("id", user!.id)
        .single();
      return (data?.tenant_id ?? null) as string | null;
    },
    enabled: !!user,
    staleTime: 10 * 60 * 1000, // 10 min — tenant rarely changes
    gcTime: 30 * 60 * 1000,
  });
}

// ── Cached session check (no network) ─────────────────────────
export function hasCachedSession(): boolean {
  return getCachedSession() !== null;
}
