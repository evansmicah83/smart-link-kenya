import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useAuth, fetchProfile, fetchMyRoles } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { OnboardTenant } from "@/components/OnboardTenant";
import { Activity, Users, Router as RouterIcon, Receipt, Wifi, TrendingUp } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

function Dashboard() {
  const { user } = useAuth();

  const profile = useQuery({
    queryKey: ["profile", user?.id],
    queryFn: () => (user ? fetchProfile(user.id) : Promise.resolve(null)),
    enabled: !!user,
  });

  const roles = useQuery({
    queryKey: ["roles", user?.id],
    queryFn: () => (user ? fetchMyRoles(user.id) : Promise.resolve([])),
    enabled: !!user,
  });

  const tenantCount = useQuery({
    queryKey: ["tenant-count"],
    queryFn: async () => {
      const { count } = await supabase.from("tenants").select("*", { count: "exact", head: true });
      return count ?? 0;
    },
    enabled: (roles.data ?? []).includes("super_admin"),
  });

  if (profile.isLoading || roles.isLoading) {
    return <div className="text-muted-foreground">Loading workspace…</div>;
  }

  const needsOnboarding =
    !profile.data?.tenant_id && !(roles.data ?? []).includes("super_admin");

  if (needsOnboarding) {
    return <OnboardTenant userId={user!.id} />;
  }

  const isSuper = (roles.data ?? []).includes("super_admin");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">
          Welcome back{profile.data?.full_name ? `, ${profile.data.full_name.split(" ")[0]}` : ""}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {isSuper ? "Platform-wide overview" : "Your ISP at a glance"}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {isSuper && (
          <Stat icon={Activity} label="Tenants" value={tenantCount.data ?? 0} accent="primary" />
        )}
        <Stat icon={Users} label="Customers" value="0" hint="Phase 2" />
        <Stat icon={RouterIcon} label="Routers online" value="0/0" hint="Phase 3" />
        <Stat icon={Receipt} label="Revenue (MTD)" value="KES 0" hint="Phase 2" />
        <Stat icon={Wifi} label="Active sessions" value="0" hint="Phase 3" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-xl border border-border/60 bg-card p-6 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold">Activity</h2>
            <span className="text-xs text-muted-foreground">Live</span>
          </div>
          <EmptyState
            icon={TrendingUp}
            title="No activity yet"
            desc="Once customers, payments and routers come online, you'll see realtime activity here."
          />
        </div>
        <div className="rounded-xl border border-border/60 bg-card p-6">
          <h2 className="mb-4 font-semibold">Quick actions</h2>
          <ul className="space-y-2 text-sm">
            <li className="rounded-md border border-border/60 p-3 text-muted-foreground">Add your first router (Phase 3)</li>
            <li className="rounded-md border border-border/60 p-3 text-muted-foreground">Create a package (Phase 2)</li>
            <li className="rounded-md border border-border/60 p-3 text-muted-foreground">Connect M-Pesa (Phase 2)</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

function Stat({
  icon: Icon, label, value, hint, accent,
}: { icon: React.ComponentType<{ className?: string }>; label: string; value: string | number; hint?: string; accent?: "primary" }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card p-5">
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className={`grid h-8 w-8 place-items-center rounded-md ${accent === "primary" ? "bg-primary/15 text-primary" : "bg-secondary/40 text-secondary-foreground"}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className="mt-3 text-2xl font-semibold">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

function EmptyState({ icon: Icon, title, desc }: { icon: React.ComponentType<{ className?: string }>; title: string; desc: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-full bg-primary/10 text-primary">
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="mt-4 font-medium">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{desc}</p>
    </div>
  );
}
