import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useAuth, fetchProfile, fetchMyRoles } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { OnboardTenant } from "@/components/OnboardTenant";
import { useBranding } from "@/lib/branding";
import {
  Activity, Users, Router as RouterIcon, Receipt, Wifi, TrendingUp,
  AlertTriangle, CheckCircle, Clock, Package, ArrowRight, Zap,
  Signal, DollarSign, UserCheck, UserX, BarChart2, Bell, Ticket,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { AreaChart, Area, Tooltip as RTooltip, ResponsiveContainer, XAxis } from "recharts";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

function Dashboard() {
  const { user } = useAuth();
  const brand = useBranding();

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

  const tenantId = profile.data?.tenant_id;
  const isSuper = (roles.data ?? []).includes("super_admin");

  const stats = useQuery({
    queryKey: ["dashboard-stats", tenantId],
    queryFn: async () => {
      const [customers, routers, activeSessions, mtdPayments, openTickets, expiringToday, newThisMonth, suspended] = await Promise.all([
        supabase.from("customers").select("*", { count: "exact", head: true }).eq("tenant_id", tenantId!),
        supabase.from("routers").select("id,status").eq("tenant_id", tenantId!),
        supabase.from("sessions").select("*", { count: "exact", head: true }).eq("tenant_id", tenantId!).is("ended_at", null),
        supabase.from("payments").select("amount").eq("tenant_id", tenantId!).eq("status", "completed").gte("created_at", new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()),
        supabase.from("tickets").select("*", { count: "exact", head: true }).eq("tenant_id", tenantId!).in("status", ["open", "in_progress"]),
        supabase.from("subscriptions").select("*", { count: "exact", head: true }).eq("tenant_id", tenantId!).eq("status", "active").lte("expires_at", new Date(Date.now() + 86400000 * 3).toISOString()).gte("expires_at", new Date().toISOString()),
        supabase.from("customers").select("*", { count: "exact", head: true }).eq("tenant_id", tenantId!).gte("created_at", new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()),
        supabase.from("customers").select("*", { count: "exact", head: true }).eq("tenant_id", tenantId!).eq("status", "suspended"),
      ]);
      const routerData = routers.data ?? [];
      return {
        customers: customers.count ?? 0,
        routersOnline: routerData.filter((r) => r.status === "online").length,
        routersTotal: routerData.length,
        activeSessions: activeSessions.count ?? 0,
        mtdRevenue: (mtdPayments.data ?? []).reduce((s, p) => s + Number(p.amount), 0),
        openTickets: openTickets.count ?? 0,
        expiringToday: expiringToday.count ?? 0,
        newThisMonth: newThisMonth.count ?? 0,
        suspended: suspended.count ?? 0,
      };
    },
    enabled: !!tenantId,
    refetchInterval: 30000,
  });

  // Daily revenue for the last 7 days sparkline
  const revenueChart = useQuery({
    queryKey: ["revenue-chart", tenantId],
    queryFn: async () => {
      const days = Array.from({ length: 7 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (6 - i));
        return d;
      });
      const from = days[0].toISOString();
      const { data } = await supabase
        .from("payments")
        .select("amount, created_at")
        .eq("tenant_id", tenantId!)
        .eq("status", "completed")
        .gte("created_at", from);
      return days.map((d) => {
        const label = d.toLocaleDateString("en-KE", { weekday: "short" });
        const sum = (data ?? [])
          .filter((p) => new Date(p.created_at).toDateString() === d.toDateString())
          .reduce((acc, p) => acc + Number(p.amount), 0);
        return { day: label, amount: sum };
      });
    },
    enabled: !!tenantId,
  });

  const superStats = useQuery({
    queryKey: ["super-stats"],
    queryFn: async () => {
      const [tenants, activeTenants] = await Promise.all([
        supabase.from("tenants").select("*", { count: "exact", head: true }),
        supabase.from("tenants").select("*", { count: "exact", head: true }).eq("status", "active"),
      ]);
      return { total: tenants.count ?? 0, active: activeTenants.count ?? 0 };
    },
    enabled: isSuper,
  });

  const recentPayments = useQuery({
    queryKey: ["recent-payments", tenantId],
    queryFn: async () => {
      const { data } = await supabase
        .from("payments")
        .select("id, amount, method, status, created_at, customers(full_name)")
        .eq("tenant_id", tenantId!)
        .order("created_at", { ascending: false })
        .limit(6);
      return data ?? [];
    },
    enabled: !!tenantId,
  });

  const recentTickets = useQuery({
    queryKey: ["recent-tickets", tenantId],
    queryFn: async () => {
      const { data } = await supabase
        .from("tickets")
        .select("id, ticket_no, subject, priority, status, created_at")
        .eq("tenant_id", tenantId!)
        .in("status", ["open", "in_progress"])
        .order("created_at", { ascending: false })
        .limit(5);
      return data ?? [];
    },
    enabled: !!tenantId,
  });

  if (!user || profile.isLoading || roles.isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <p className="text-sm text-muted-foreground">Loading workspace…</p>
      </div>
    );
  }

  if (!profile.data?.tenant_id && !isSuper) return <OnboardTenant userId={user.id} />;

  const s = stats.data;
  const greeting = profile.data?.full_name ? `, ${profile.data.full_name.split(" ")[0]}` : "";

  return (
    <div className="space-y-6 max-w-[1400px]">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Good {timeOfDay()}{greeting} 👋
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isSuper ? "Platform-wide overview — SmartLinkNet SaaS" : "Here's what's happening with your ISP today."}
          </p>
        </div>
        <div className="hidden sm:flex gap-2">
          <Link to="/customers" className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:opacity-90">
            <Users className="h-3.5 w-3.5" /> Add Customer
          </Link>
          <Link to="/billing" className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium hover:bg-accent">
            <Receipt className="h-3.5 w-3.5" /> New Payment
          </Link>
        </div>
      </div>

      {/* Super admin */}
      {isSuper && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <KpiCard icon={Activity} label="Total Tenants" value={superStats.data?.total ?? 0} accent />
          <KpiCard icon={CheckCircle} label="Active Tenants" value={superStats.data?.active ?? 0} color="text-green-500" trend="+2 this month" />
          <Link to="/admin" className="group rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 to-primary/5 p-5 hover:border-primary/50 transition flex items-center justify-between">
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Admin</div>
              <div className="mt-1 font-semibold">Manage Tenants</div>
            </div>
            <ArrowRight className="h-5 w-5 text-primary group-hover:translate-x-1 transition-transform" />
          </Link>
        </div>
      )}

      {/* ISP operator KPIs */}
      {!isSuper && tenantId && (
        <>
          <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
            <KpiCard icon={Users} label="Total Customers" value={s?.customers ?? 0}
              trend={s?.newThisMonth ? `+${s.newThisMonth} this month` : undefined}
              loading={stats.isLoading} />
            <KpiCard icon={Signal} label="Online Now"
              value={s ? `${s.routersOnline}/${s.routersTotal}` : "—"}
              color={s && s.routersOnline < s.routersTotal ? "text-yellow-500" : "text-green-500"}
              trend={s && s.routersOnline === s.routersTotal ? "All routers healthy" : `${s ? s.routersTotal - s.routersOnline : 0} offline`}
              loading={stats.isLoading} />
            <KpiCard icon={Wifi} label="Active Sessions" value={s?.activeSessions ?? 0}
              color="text-blue-500" trend="Live hotspot users" loading={stats.isLoading} />
            <KpiCard icon={DollarSign} label="Revenue MTD"
              value={s ? `KES ${s.mtdRevenue.toLocaleString()}` : "—"}
              color="text-green-500"
              trend={
                <ResponsiveContainer width="100%" height={32}>
                  <AreaChart data={revenueChart.data ?? []} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                    <Area type="monotone" dataKey="amount" stroke="currentColor" fill="currentColor" className="text-green-500/20 stroke-green-500" strokeWidth={1.5} />
                    <RTooltip formatter={(v: any) => [`KES ${Number(v).toLocaleString()}`, ""]} contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 11 }} />
                    <XAxis dataKey="day" hide />
                  </AreaChart>
                </ResponsiveContainer>
              }
              loading={stats.isLoading} />
          </div>

          {/* Secondary metrics */}
          <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
            <MiniCard icon={Clock} label="Expiring Soon" value={s?.expiringToday ?? 0} color="text-yellow-500" href="/billing" />
            <MiniCard icon={UserX} label="Suspended" value={s?.suspended ?? 0} color="text-red-500" href="/customers" />
            <MiniCard icon={Ticket} label="Open Tickets" value={s?.openTickets ?? 0} color="text-blue-500" href="/support" />
            <MiniCard icon={UserCheck} label="New This Month" value={s?.newThisMonth ?? 0} color="text-primary" href="/customers" />
          </div>

          {/* Alerts */}
          {((s?.expiringToday ?? 0) > 0 || (s?.openTickets ?? 0) > 0) && (
            <div className="grid gap-3 sm:grid-cols-2">
              {(s?.expiringToday ?? 0) > 0 && (
                <AlertBanner icon={AlertTriangle} color="yellow" title={`${s!.expiringToday} subscription${s!.expiringToday > 1 ? "s" : ""} expiring in 3 days`}>
                  <Link to="/billing" className="text-xs font-medium hover:underline">View billing →</Link>
                </AlertBanner>
              )}
              {(s?.openTickets ?? 0) > 0 && (
                <AlertBanner icon={Bell} color="blue" title={`${s!.openTickets} open support ticket${s!.openTickets > 1 ? "s" : ""}`}>
                  <Link to="/support" className="text-xs font-medium hover:underline">View tickets →</Link>
                </AlertBanner>
              )}
            </div>
          )}

          <div className="grid gap-6 lg:grid-cols-3">
            {/* Revenue + Recent Payments */}
            <div className="lg:col-span-2 space-y-4">
              {/* 7-day chart */}
              <div className="rounded-2xl border border-border/60 bg-card p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="font-semibold">Revenue — Last 7 Days</h2>
                    <p className="text-xs text-muted-foreground">Daily M-Pesa collections</p>
                  </div>
                  <BarChart2 className="h-4 w-4 text-muted-foreground" />
                </div>
                <ResponsiveContainer width="100%" height={140}>
                  <AreaChart data={revenueChart.data ?? []} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
                    <defs>
                      <linearGradient id="rev-grad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--color-primary)" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="var(--color-primary)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="day" tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} axisLine={false} tickLine={false} />
                    <RTooltip formatter={(v: any) => [`KES ${Number(v).toLocaleString()}`, "Revenue"]} contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 8, fontSize: 11 }} />
                    <Area type="monotone" dataKey="amount" stroke="var(--color-primary)" strokeWidth={2} fill="url(#rev-grad)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* Recent payments */}
              <div className="rounded-2xl border border-border/60 bg-card p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-semibold">Recent Payments</h2>
                  <Link to="/billing" className="text-xs text-primary hover:underline flex items-center gap-1">View all <ArrowRight className="h-3 w-3" /></Link>
                </div>
                {recentPayments.isLoading ? (
                  <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-10 rounded-md bg-muted animate-pulse" />)}</div>
                ) : recentPayments.data?.length === 0 ? (
                  <EmptyState icon={Receipt} title="No payments yet" desc="Payments appear here as customers pay." />
                ) : (
                  <div className="space-y-1.5">
                    {recentPayments.data?.map((p) => (
                      <div key={p.id} className="flex items-center justify-between rounded-xl bg-muted/40 px-3 py-2.5 text-sm hover:bg-muted/70 transition">
                        <div className="flex items-center gap-3">
                          <div className="grid h-7 w-7 place-items-center rounded-full bg-green-500/15 text-green-600 text-xs font-bold">
                            {((p as any).customers?.full_name ?? "?")[0]}
                          </div>
                          <div>
                            <div className="font-medium text-sm leading-tight">{(p as any).customers?.full_name ?? "—"}</div>
                            <div className="text-xs text-muted-foreground capitalize">{p.method} · {new Date(p.created_at).toLocaleDateString()}</div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-semibold text-green-500">KES {Number(p.amount).toLocaleString()}</div>
                          <PayStatusBadge status={p.status} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Quick Actions + Tickets */}
            <div className="space-y-4">
              <div className="rounded-2xl border border-border/60 bg-card p-5">
                <h2 className="font-semibold mb-3">Quick Actions</h2>
                <div className="space-y-1.5">
                  {[
                    { to: "/customers", icon: Users, label: "Add Customer", desc: "Register new subscriber" },
                    { to: "/billing", icon: Receipt, label: "Record Payment", desc: "Manual payment entry" },
                    { to: "/hotspot", icon: Wifi, label: "Generate Vouchers", desc: "Hotspot voucher codes" },
                    { to: "/support", icon: Activity, label: "New Ticket", desc: "Support request" },
                    { to: "/packages", icon: Package, label: "Manage Plans", desc: "Internet packages" },
                    { to: "/portal-manager", icon: Zap, label: "Captive Portal", desc: "Portal configuration" },
                  ].map((a) => (
                    <Link key={a.to} to={a.to as never} className="flex items-center gap-3 rounded-xl border border-border/50 px-3 py-2.5 text-sm hover:bg-accent/50 hover:border-primary/40 transition group">
                      <div className="grid h-7 w-7 place-items-center rounded-lg bg-primary/10 text-primary shrink-0">
                        <a.icon className="h-3.5 w-3.5" />
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium leading-tight">{a.label}</div>
                        <div className="text-[11px] text-muted-foreground">{a.desc}</div>
                      </div>
                      <ArrowRight className="h-3.5 w-3.5 ml-auto text-muted-foreground opacity-0 group-hover:opacity-100 transition" />
                    </Link>
                  ))}
                </div>
              </div>

              {recentTickets.data && recentTickets.data.length > 0 && (
                <div className="rounded-2xl border border-border/60 bg-card p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="font-semibold text-sm">Open Tickets</h2>
                    <Link to="/support" className="text-xs text-primary hover:underline">View all</Link>
                  </div>
                  <div className="space-y-2">
                    {recentTickets.data.map((t) => (
                      <div key={t.id} className="rounded-xl bg-muted/40 p-2.5 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-muted-foreground">{t.ticket_no}</span>
                          <PriorityBadge priority={t.priority} />
                        </div>
                        <div className="font-medium mt-0.5 truncate">{t.subject}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Portal quick-link */}
              <Link to="/portal-manager" className="block rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 to-transparent p-5 hover:border-primary/50 transition group">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs text-muted-foreground uppercase tracking-wide">Captive Portal</div>
                    <div className="font-semibold mt-0.5">Manage Portal</div>
                    <div className="text-xs text-muted-foreground mt-1">Branding · Packages · Payments</div>
                  </div>
                  <Zap className="h-6 w-6 text-primary" />
                </div>
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function timeOfDay() {
  const h = new Date().getHours();
  if (h < 12) return "morning";
  if (h < 17) return "afternoon";
  return "evening";
}

function KpiCard({ icon: Icon, label, value, accent, color, loading, trend }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string; value: string | number;
  accent?: boolean; color?: string; loading?: boolean;
  trend?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className={`grid h-8 w-8 place-items-center rounded-lg ${accent ? "bg-primary/15 text-primary" : "bg-muted/60 text-muted-foreground"}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className={`text-2xl font-bold ${color ?? ""}`}>
        {loading ? <span className="h-7 w-20 inline-block rounded-lg bg-muted animate-pulse" /> : value}
      </div>
      {trend && <div className="text-xs text-muted-foreground">{trend}</div>}
    </div>
  );
}

function MiniCard({ icon: Icon, label, value, color, href }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string; value: number; color: string; href: string;
}) {
  return (
    <Link to={href as never} className="rounded-2xl border border-border/60 bg-card p-4 flex items-center gap-3 hover:border-primary/40 transition group">
      <div className={`grid h-9 w-9 place-items-center rounded-xl bg-current/10 shrink-0 ${color}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <div className={`text-xl font-bold ${color}`}>{value}</div>
        <div className="text-xs text-muted-foreground">{label}</div>
      </div>
    </Link>
  );
}

function AlertBanner({ icon: Icon, color, title, children }: {
  icon: React.ComponentType<{ className?: string }>;
  color: "yellow" | "blue"; title: string; children: React.ReactNode;
}) {
  const cls = color === "yellow"
    ? "border-yellow-500/30 bg-yellow-500/10 text-yellow-600"
    : "border-blue-500/30 bg-blue-500/10 text-blue-600";
  return (
    <div className={`flex items-center gap-3 rounded-xl border p-4 ${cls}`}>
      <Icon className="h-4 w-4 shrink-0" />
      <div>
        <div className="font-medium text-sm">{title}</div>
        {children}
      </div>
    </div>
  );
}

function EmptyState({ icon: Icon, title, desc }: { icon: React.ComponentType<{ className?: string }>; title: string; desc: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      <div className="grid h-10 w-10 place-items-center rounded-full bg-primary/10 text-primary">
        <Icon className="h-4 w-4" />
      </div>
      <p className="mt-3 font-medium text-sm">{title}</p>
      <p className="mt-1 max-w-xs text-xs text-muted-foreground">{desc}</p>
    </div>
  );
}

function PayStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    completed: "bg-green-500/15 text-green-600",
    pending: "bg-yellow-500/15 text-yellow-600",
    failed: "bg-red-500/15 text-red-600",
  };
  return <span className={`rounded-full px-1.5 py-0.5 text-[10px] capitalize ${map[status] ?? "bg-muted"}`}>{status}</span>;
}

function PriorityBadge({ priority }: { priority: string }) {
  const map: Record<string, string> = {
    low: "bg-blue-500/15 text-blue-600",
    medium: "bg-yellow-500/15 text-yellow-600",
    high: "bg-orange-500/15 text-orange-600",
    critical: "bg-red-500/15 text-red-600",
  };
  return <span className={`rounded-full px-1.5 py-0.5 text-[10px] capitalize ${map[priority] ?? "bg-muted"}`}>{priority}</span>;
}
