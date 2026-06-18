import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useAuth, fetchMyRoles } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { ShieldCheck, Building2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminTenants,
});

function AdminTenants() {
  const { user } = useAuth();
  const roles = useQuery({
    queryKey: ["roles", user?.id],
    queryFn: () => (user ? fetchMyRoles(user.id) : Promise.resolve([])),
    enabled: !!user,
  });
  const isSuper = (roles.data ?? []).includes("super_admin");

  const tenants = useQuery({
    queryKey: ["tenants"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenants")
        .select("id, name, slug, status, plan, created_at, country")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: isSuper,
  });

  if (roles.isLoading) return <div className="text-muted-foreground">Loading…</div>;

  if (!isSuper) {
    return (
      <div className="rounded-xl border border-border/60 bg-card p-8 text-center">
        <ShieldCheck className="mx-auto h-8 w-8 text-muted-foreground" />
        <h2 className="mt-3 text-lg font-semibold">Super admin only</h2>
        <p className="mt-1 text-sm text-muted-foreground">You don't have access to this area.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Tenants</h1>
        <p className="text-sm text-muted-foreground">All ISPs running on SmartLinkNet.</p>
      </div>
      <div className="overflow-hidden rounded-xl border border-border/60 bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Slug</th>
              <th className="px-4 py-3">Plan</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Country</th>
              <th className="px-4 py-3">Created</th>
            </tr>
          </thead>
          <tbody>
            {(tenants.data ?? []).length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                <Building2 className="mx-auto mb-2 h-6 w-6" />No tenants yet
              </td></tr>
            ) : (
              tenants.data!.map((t) => (
                <tr key={t.id} className="border-t border-border/60 hover:bg-accent/40">
                  <td className="px-4 py-3 font-medium">{t.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{t.slug}</td>
                  <td className="px-4 py-3"><Badge>{t.plan}</Badge></td>
                  <td className="px-4 py-3"><StatusBadge status={t.status} /></td>
                  <td className="px-4 py-3">{t.country}</td>
                  <td className="px-4 py-3 text-muted-foreground">{new Date(t.created_at).toLocaleDateString()}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-secondary/40 px-2 py-0.5 text-xs">{children}</span>;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    active: "bg-success/15 text-success",
    trial: "bg-primary/15 text-primary",
    suspended: "bg-warning/15 text-warning",
    cancelled: "bg-destructive/15 text-destructive",
  };
  return <span className={`rounded-full px-2 py-0.5 text-xs capitalize ${map[status] ?? "bg-muted"}`}>{status}</span>;
}
