import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { OnboardTenant } from "@/components/OnboardTenant";
import { BrandingProvider, useBranding } from "@/lib/branding";
import {
  LayoutDashboard, Users, Router as RouterIcon, Wifi, Receipt,
  Ticket, Map, Settings, LogOut, Building2, ShieldCheck, BarChart3, Boxes,
  ChevronDown, Activity, Package, Cable, Network, Wrench,
  QrCode, Bell, Moon, Sun, Wallet, Zap, Layers, Server,
  MoreHorizontal, X, Megaphone, Globe, AlertTriangle, TrendingUp,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, fetchProfile, fetchMyRoles, type AppRole, type Profile, signOut } from "@/lib/auth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

type NavItem = { to: string; label: string; icon: React.ComponentType<{ className?: string }>; roles?: AppRole[] };

const NAV: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/admin", label: "Tenants", icon: ShieldCheck, roles: ["super_admin"] },
  { to: "/customers", label: "Customers", icon: Users },
  { to: "/packages", label: "Plans", icon: Package },
  { to: "/routers", label: "Routers", icon: RouterIcon },
  { to: "/aaa", label: "Net Auth", icon: Server },
  { to: "/hotspot", label: "Hotspot", icon: Wifi },
  { to: "/vouchers", label: "Vouchers", icon: QrCode },
  { to: "/pppoe", label: "PPPoE", icon: Network },
  { to: "/noc", label: "Monitoring", icon: Activity },
  { to: "/fiber", label: "Fiber Lines", icon: Cable },
  { to: "/billing", label: "Billing", icon: Receipt },
  { to: "/wallet", label: "Wallet", icon: Wallet },
  { to: "/inventory", label: "Inventory", icon: Boxes },
  { to: "/support", label: "Support", icon: Ticket },
  { to: "/technicians", label: "Field Team", icon: Wrench },
  { to: "/map", label: "Coverage", icon: Map },
  { to: "/reports", label: "Reports", icon: BarChart3 },
  { to: "/automation", label: "Automation", icon: Zap },
  { to: "/provisioning", label: "Provisioning", icon: Layers },
  { to: "/marketing", label: "Marketing", icon: Megaphone },
  { to: "/portal-manager", label: "Captive Portal", icon: Globe },
  { to: "/settings", label: "Settings", icon: Settings },
];

// Bottom tab bar — 4 primary items always visible
const BOTTOM_TABS = ["/dashboard", "/customers", "/billing", "/settings"];

// "More" sheet groups
const MORE_GROUPS: { title: string; items: string[] }[] = [
  { title: "Network", items: ["/routers", "/aaa", "/hotspot", "/pppoe", "/fiber", "/vouchers"] },
  { title: "Operations", items: ["/noc", "/monitoring", "/automation", "/provisioning", "/map"] },
  { title: "Business", items: ["/packages", "/wallet", "/inventory", "/reports", "/marketing"] },
  { title: "Team", items: ["/technicians", "/support", "/portal-manager", "/admin"] },
];

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <BrandingProvider>
      <AppShellInner>{children}</AppShellInner>
    </BrandingProvider>
  );
}

function AppShellInner({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem("theme");
    if (saved) return saved === "dark";
    // default to dark for enterprise feel
    return true;
  });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
    localStorage.setItem("theme", darkMode ? "dark" : "light");
  }, [darkMode]);

  function toggleDark() { setDarkMode((d) => !d); }

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

  const brand = useBranding();

  const outages = useQuery({
    queryKey: ["active-outages", profileQuery.data?.tenant_id],
    queryFn: async () => {
      const tid = profileQuery.data?.tenant_id;
      if (!tid) return [];
      const { data } = await (supabase as any)
        .from("outages")
        .select("id, title, type, eta")
        .eq("tenant_id", tid)
        .eq("status", "active")
        .limit(1);
      return data ?? [];
    },
    enabled: !!profileQuery.data?.tenant_id,
    refetchInterval: 60_000,
  });

  const roles = rolesQuery.data ?? [];
  const isSuperAdmin = roles.includes("super_admin");
  const hasTenantRole = roles.some((r) => r !== "super_admin");
  const visibleNav = NAV.filter((n) => !n.roles || n.roles.some((r) => roles.includes(r)));
  const bottomTabs = visibleNav.filter((n) => BOTTOM_TABS.includes(n.to));

  async function handleSignOut() {
    await signOut();
    toast.success("Signed out");
    router.navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="flex min-h-screen bg-background text-foreground" data-brand-applied>
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex fixed inset-y-0 left-0 z-40 w-64 flex-col border-r border-sidebar-border bg-sidebar">
        <div className="flex h-16 shrink-0 items-center border-b border-sidebar-border px-5">
          <Link to="/dashboard" className="flex items-center gap-2">
            {brand.logo_url ? (
              <img src={brand.logo_url} alt="Logo" className="h-8 w-auto max-w-[120px] object-contain" />
            ) : (
              <>
                <div className="grid h-8 w-8 place-items-center rounded-md bg-primary text-primary-foreground">
                  <Wifi className="h-4 w-4" />
                </div>
                <span className="font-semibold tracking-tight">
                  {brand.company_name ?? <>SmartLink<span className="text-primary">Net</span></>}
                </span>
              </>
            )}
          </Link>
        </div>

        <nav className="sidebar-scroll flex-1 overflow-y-auto space-y-0.5 px-3 py-4">
          {visibleNav.map((item) => {
            const active = pathname === item.to || (item.to !== "/dashboard" && pathname.startsWith(item.to));
            return (
              <Link
                key={item.to}
                to={item.to as never}
                className={`group flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-all ${
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                    : "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
                }`}
              >
                <item.icon className={`h-4 w-4 shrink-0 ${active ? "text-primary" : "text-muted-foreground group-hover:text-foreground"}`} />
                <span className="truncate">{item.label}</span>
                {active && <div className="ml-auto h-1.5 w-1.5 rounded-full bg-primary" />}
              </Link>
            );
          })}
        </nav>

        <div className="shrink-0 border-t border-sidebar-border p-3">
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
      <div className="flex flex-1 flex-col md:pl-64">
        {/* Outage banner */}
        {(outages.data ?? []).length > 0 && (
          <div className="flex items-center gap-3 bg-destructive/90 px-4 py-2 text-xs text-white">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            <span className="font-medium">{outages.data![0].title}</span>
            {outages.data![0].eta && <span className="opacity-80">· ETA: {new Date(outages.data![0].eta).toLocaleTimeString()}</span>}
          </div>
        )}
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border/60 bg-background/80 px-4 backdrop-blur-xl md:h-16 md:px-8">
          {/* Mobile: brand */}
          <Link to="/dashboard" className="flex items-center gap-2 md:hidden">
            {brand.logo_url ? (
              <img src={brand.logo_url} alt="Logo" className="h-7 w-auto max-w-[100px] object-contain" />
            ) : (
              <>
                <div className="grid h-7 w-7 place-items-center rounded-md bg-primary text-primary-foreground">
                  <Wifi className="h-3.5 w-3.5" />
                </div>
                <span className="font-semibold text-sm tracking-tight">
                  {brand.company_name ?? <>SmartLink<span className="text-primary">Net</span></>}
                </span>
              </>
            )}
          </Link>
          {/* Desktop: page title */}
          <div className="hidden md:block text-sm text-muted-foreground">{titleFromPath(pathname)}</div>
          <div className="flex items-center gap-2">
            <NotificationsBell tenantId={profileQuery.data?.tenant_id ?? null} userId={user?.id ?? null} />
            <button
              onClick={toggleDark}
              className="relative flex h-8 w-13 items-center rounded-full border border-border bg-muted px-1 transition-colors hover:border-primary"
              aria-label="Toggle theme"
            >
              <span className={`absolute flex h-6 w-6 items-center justify-center rounded-full bg-background shadow-sm transition-all duration-300 ${darkMode ? "translate-x-6" : "translate-x-0"}`}>
                {darkMode ? <Moon className="h-3.5 w-3.5 text-primary" /> : <Sun className="h-3.5 w-3.5 text-warning" />}
              </span>
              <Sun className={`h-3 w-3 text-muted-foreground transition-opacity ${darkMode ? "opacity-0" : "opacity-100"}`} />
              <Moon className={`ml-auto h-3 w-3 text-muted-foreground transition-opacity ${darkMode ? "opacity-100" : "opacity-0"}`} />
            </button>
          </div>
        </header>

        <main className="flex-1 min-w-0 overflow-x-hidden px-4 py-6 pb-24 md:px-8 md:py-8 md:pb-8">
          {profileQuery.isLoading || rolesQuery.isLoading || !user ? null
            : profileQuery.isError || profileQuery.data === undefined ? children
            : profileQuery.data !== null && !profileQuery.data.tenant_id && !isSuperAdmin && !hasTenantRole ? (
              <OnboardTenant userId={user.id} />
            ) : children}
        </main>
      </div>

      {/* Mobile Bottom Tab Bar */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-50 flex items-stretch border-t border-border bg-background/95 backdrop-blur-lg">
        {bottomTabs.map((item) => {
          const active = pathname === item.to || (item.to !== "/dashboard" && pathname.startsWith(item.to));
          return (
            <Link
              key={item.to}
              to={item.to as never}
              className={`flex flex-1 flex-col items-center justify-center gap-1 py-2 text-[10px] font-medium transition-colors ${
                active ? "text-primary" : "text-muted-foreground"
              }`}
            >
              <item.icon className={`h-5 w-5 ${active ? "text-primary" : ""}`} />
              {item.label}
            </Link>
          );
        })}
        {/* More button */}
        <MobileMoreSheet visibleNav={visibleNav} pathname={pathname} roles={roles} onSignOut={handleSignOut} profile={profileQuery.data ?? null} email={user?.email ?? null} />
      </nav>
    </div>
  );
}

function titleFromPath(p: string) {
  const seg = p.split("/").filter(Boolean)[0] ?? "dashboard";
  return seg.charAt(0).toUpperCase() + seg.slice(1);
}

function NotificationsBell({ tenantId, userId }: { tenantId: string | null; userId: string | null }) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();

  const notifications = useQuery({
    queryKey: ["notifications", userId],
    queryFn: async () => {
      const { data } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", userId!)
        .order("created_at", { ascending: false })
        .limit(20);
      return data ?? [];
    },
    enabled: !!userId,
    refetchInterval: 30000,
  });

  const unread = notifications.data?.filter((n) => !n.read).length ?? 0;

  async function markAllRead() {
    if (!userId) return;
    await supabase.from("notifications").update({ read: true }).eq("user_id", userId).eq("read", false);
    qc.invalidateQueries({ queryKey: ["notifications", userId] });
  }

  const typeColors: Record<string, string> = {
    info: "bg-blue-500", success: "bg-green-500", warning: "bg-yellow-500", error: "bg-red-500",
  };

  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} className="relative grid h-8 w-8 place-items-center rounded-md hover:bg-accent text-muted-foreground">
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-primary text-[10px] text-primary-foreground grid place-items-center font-bold">{unread > 9 ? "9+" : unread}</span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 rounded-xl border border-border bg-popover shadow-xl z-50">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <span className="font-semibold text-sm">Notifications</span>
            {unread > 0 && <button onClick={markAllRead} className="text-xs text-primary hover:underline">Mark all read</button>}
          </div>
          <div className="max-h-72 overflow-y-auto">
            {notifications.data?.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">No notifications</div>
            ) : notifications.data?.map((n) => (
              <div key={n.id} className={`flex gap-3 px-4 py-3 border-b border-border/60 ${n.read ? "opacity-60" : ""}`}>
                <div className={`h-2 w-2 rounded-full mt-1.5 shrink-0 ${typeColors[n.type] ?? "bg-muted"}`} />
                <div>
                  <div className="font-medium text-xs">{n.title}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{n.message}</div>
                  <div className="text-[10px] text-muted-foreground mt-1">{new Date(n.created_at).toLocaleString()}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
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

function MobileMoreSheet({
  visibleNav, pathname, roles, onSignOut, profile, email,
}: {
  visibleNav: NavItem[]; pathname: string; roles: AppRole[];
  onSignOut: () => void; profile: Profile | null; email: string | null;
}) {
  const [open, setOpen] = useState(false);
  const navMap = Object.fromEntries(visibleNav.map((n) => [n.to, n]));
  const name = profile?.full_name ?? email ?? "Account";
  const initials = (name || "?").split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase();
  const isMoreActive = !["/dashboard", "/customers", "/billing", "/settings"].some(
    (t) => pathname === t || (t !== "/dashboard" && pathname.startsWith(t))
  );

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`flex flex-1 flex-col items-center justify-center gap-1 py-2 text-[10px] font-medium transition-colors ${
          isMoreActive ? "text-primary" : "text-muted-foreground"
        }`}
      >
        <MoreHorizontal className={`h-5 w-5 ${isMoreActive ? "text-primary" : ""}`} />
        More
      </button>

      {open && (
        <div className="fixed inset-0 z-[60] flex flex-col justify-end">
          {/* backdrop */}
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />

          {/* sheet */}
          <div className="relative z-10 rounded-t-2xl border-t border-border bg-background pb-safe">
            {/* drag handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="h-1 w-10 rounded-full bg-muted-foreground/30" />
            </div>

            {/* header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-border/60">
              <span className="font-semibold text-sm">All Sections</span>
              <button onClick={() => setOpen(false)} className="grid h-7 w-7 place-items-center rounded-full bg-muted text-muted-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* grouped nav */}
            <div className="max-h-[60vh] overflow-y-auto px-4 py-3 space-y-4">
              {MORE_GROUPS.map((group) => {
                const items = group.items.map((to) => navMap[to]).filter(Boolean);
                if (!items.length) return null;
                return (
                  <div key={group.title}>
                    <div className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                      {group.title}
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {items.map((item) => {
                        const active = pathname === item.to || (item.to !== "/dashboard" && pathname.startsWith(item.to));
                        return (
                          <Link
                            key={item.to}
                            to={item.to as never}
                            onClick={() => setOpen(false)}
                            className={`flex flex-col items-center gap-1.5 rounded-xl px-2 py-3 text-center text-[11px] font-medium transition-colors ${
                              active
                                ? "bg-primary/15 text-primary"
                                : "bg-muted/60 text-foreground hover:bg-muted"
                            }`}
                          >
                            <item.icon className={`h-5 w-5 ${active ? "text-primary" : "text-muted-foreground"}`} />
                            <span className="leading-tight">{item.label}</span>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* account footer */}
            <div className="border-t border-border/60 px-4 py-3 flex items-center gap-3">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-secondary text-secondary-foreground text-xs font-semibold">
                {initials}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{name}</div>
                <div className="truncate text-xs text-muted-foreground">{email}</div>
              </div>
              <button
                onClick={() => { setOpen(false); onSignOut(); }}
                className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:border-destructive hover:text-destructive transition-colors"
              >
                <LogOut className="h-3.5 w-3.5" /> Sign out
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
