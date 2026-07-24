import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    // Use getSession() (reads from storage, no network) then verify with getUser()
    const { data: sessionData } = await supabase.auth.getSession();

    if (!sessionData.session) {
      throw redirect({
        to: "/auth",
        search: { redirect: location.href },
      });
    }

    // Check token expiry — if within 60s, refresh proactively
    const expiresAt = sessionData.session.expires_at ?? 0;
    if (Date.now() / 1000 > expiresAt - 60) {
      const { data: refreshed, error } = await supabase.auth.refreshSession();
      if (error || !refreshed.session) {
        throw redirect({
          to: "/auth",
          search: { redirect: location.href },
        });
      }
      return { user: refreshed.session.user };
    }

    return { user: sessionData.session.user };
  },
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});
