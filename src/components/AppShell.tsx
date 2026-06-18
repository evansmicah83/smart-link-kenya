import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import {
  LayoutDashboard, Users, Router as RouterIcon, Wifi, Receipt,
  Ticket, Map, Settings, LogOut, Building2, ShieldCheck, BarChart3, Boxes,
  Menu, X, ChevronDown,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, fetchProfile, fetchMyRoles, type AppRole, type Profile, signOut } from "@/lib/auth";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

type NavItem = { to: string; label: string; icon: React.ComponentType<{ className?: string }>; roles?: AppRole[] };

const NAV: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/admin", label: "Tenants", icon: ShieldCheck, roles: ["super_admin"] },
  { to: "/customers", label: "Customers", icon: Users },
  { to: "/routers", label: "Routers", icon: RouterIcon },
  { to: "/hotspot", label: "Hotspot", icon: Wifi },
  { to: "/billing", label: "Billing", icon: Receipt },
  { to: "/inventory", label: "Inventory", icon: Boxes },
  { to: "/support", label: "Support", icon: Ticket },
  { to: "/map", label: "Coverage Map", icon: Map },
  { to: "/reports", label: "Reports", icon: BarChart3 },
  { to: "/settings", label: "Settings", icon: Settings },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => setMobileOpen(false), [pathname]);

  const profileQuery = useQuery({
    queryKey: ["profile", user?.id],
    queryFn: () => (user ? fetchProfile(user.id) : Promise.resolve(null)),
    enabled: !!user,
  });

  const rolesQuery = useQuery({
    queryKey: ["roles", user?.id],
    queryFn: () => (user ? fetchMyRoles(user.id) : Promise.resolve([])),
    enabled: !!user,
  });

  const tenantQuery = useQuery({
    queryKey: ["tenant", profileQuery.data?.tenant_id],
    queryFn: async () => {
      const tid = profileQuery.data?.tenant_id;
      if (!tid) return null;
      const { data } = await supabase.from("tenants").select("id, name, slug, plan, status").eq("id", tid).maybeSingle();
      return data;
    },
    enabled: !!profileQuery.data?.tenant_id,
  });

  const roles = rolesQuery.data ?? [];
  const isSuperAdmin = roles.includes("super_admin");

  async function handleSignOut() {
    await signOut();
    toast.success("Signed out");
    router.navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-40 w-64 transform border-r border-sidebar-border bg-sidebar transition-transform md:static md:translate-x-0 ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex h-16 items-center justify-between border-b border-sidebar-border px-5">
          <Link to="/dashboard" className="flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-md bg-primary text-primary-foreground">
              <Wifi className="h-4 w-4" />
            </div>
            <span className="font-semibold tracking-tight">
              SmartLink<span className="text-primary">Net</span>
            </span>
          </Link>
          <button className="md:hidden" onClick={() => setMobileOpen(false)}><X className="h-5 w-5" /></button>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-4">
          {NAV.filter((n) => !n.roles || n.roles.some((r) => roles.includes(r))).map((item) => {
            const active = pathname === item.to || (item.to !== "/dashboard" && pathname.startsWith(item.to));
            return (
              <Link
                key={item.to}
                to={item.to as never}
                className={`group flex items-center gap-3 rounded-md px-3 py-2 text-sm transition ${
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
                }`}
              >
                <item.icon className={`h-4 w-4 ${active ? "text-primary" : "text-muted-foreground group-hover:text-foreground"}`} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-sidebar-border p-3">
          {tenantQuery.data ? (
            <div className="mb-2 rounded-md bg-sidebar-accent/50 p-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Building2 className="h-3.5 w-3.5" /> Workspace
              </div>
              <div className="mt-0.5 truncate text-sm font-medium">{tenantQuery.data.name}</div>
              <div className="mt-1 inline-flex rounded-full bg-primary/15 px-2 py-0.5 text-[10px] uppercase tracking-wider text-primary">
                {tenantQuery.data.plan}
              </div>
            </div>
          ) : isSuperAdmin ? (
            <div className="mb-2 rounded-md bg-primary/10 p-3">
              <div className="flex items-center gap-2 text-xs text-primary">
                <ShieldCheck className="h-3.5 w-3.5" /> Super Admin
              </div>
              <div className="mt-1 text-sm">Platform owner</div>
            </div>
          ) : null}
          <UserMenu profile={profileQuery.data ?? null} email={user?.email ?? null} onSignOut={handleSignOut} />
        </div>
      </aside>

      {/* Main */}
      <div className="flex flex-1 flex-col md:pl-0">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border/60 bg-background/70 px-4 backdrop-blur-xl md:px-8">
          <button className="md:hidden" onClick={() => setMobileOpen(true)}><Menu className="h-5 w-5" /></button>
          <div className="text-sm text-muted-foreground">{titleFromPath(pathname)}</div>
          <div />
        </header>
        <main className="flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>
      </div>
    </div>
  );
}

function titleFromPath(p: string) {
  const seg = p.split("/").filter(Boolean)[0] ?? "dashboard";
  return seg.charAt(0).toUpperCase() + seg.slice(1);
}

function UserMenu({ profile, email, onSignOut }: { profile: Profile | null; email: string | null; onSignOut: () => void }) {
  const [open, setOpen] = useState(false);
  const name = profile?.full_name ?? email ?? "Account";
  const initials = (name || "?").split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase();
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 rounded-md p-2 text-left hover:bg-sidebar-accent"
      >
        <div className="grid h-8 w-8 place-items-center rounded-full bg-secondary text-secondary-foreground text-xs font-semibold">
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{name}</div>
          <div className="truncate text-xs text-muted-foreground">{email}</div>
        </div>
        <ChevronDown className="h-4 w-4 text-muted-foreground" />
      </button>
      {open && (
        <div className="absolute bottom-full left-0 right-0 mb-2 rounded-md border border-border bg-popover p-1 shadow-lg">
          <button
            onClick={onSignOut}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-accent"
          >
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}
