import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, type ComponentType } from "react";
import { useAuth, fetchProfile, fetchMyRoles } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { OnboardTenant } from "@/components/OnboardTenant";
import { useBranding } from "@/lib/branding";
import {
  Activity,
  Users,
  Router as RouterIcon,
  Receipt,
  Wifi,
  Ticket,
  TrendingUp,
  AlertTriangle,
  CheckCircle,
  Clock,
  Package,
  ArrowRight,
  Zap,
  Signal,
  DollarSign,
  Bell,
  Search,
  MapPin,
  ShieldCheck,
  BarChart3,
  Map,
  Globe,
  FileText,
  Shield,
  Percent,
  WifiOff,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { AreaChart, Area, ResponsiveContainer, Tooltip as RTooltip, XAxis, CartesianGrid } from "recharts";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

const currencyFormatter = new Intl.NumberFormat("en-KE", { style: "currency", currency: "KES", maximumFractionDigits: 0 });

function formatCurrency(n?: number | null) {
  if (n === null || n === undefined) return "—";
  return currencyFormatter.format(Number(n));
}

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

  const stats = useQuery({
    queryKey: ["dashboard-stats", tenantId],
    queryFn: async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const [customers, routers, activeSessions, mtdPayments, openTickets, expiringSoon, newCustomers, suspendedCustomers, activeSubscriptions, unpaidInvoices, todayPayments, notifications] = await Promise.all([
        supabase.from("customers").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId!),
        supabase.from("routers").select("id,status", { count: "exact", head: true }).eq("tenant_id", tenantId!),
        supabase.from("sessions").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId!).is("ended_at", null),
        supabase.from("payments").select("amount").eq("tenant_id", tenantId!).eq("status", "completed").gte("created_at", new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()),
        supabase.from("tickets").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId!).in("status", ["open", "in_progress"]),
        supabase.from("subscriptions").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId!).eq("status", "active").lte("expires_at", new Date(Date.now() + 86400000 * 3).toISOString()).gte("expires_at", new Date().toISOString()),
        supabase.from("customers").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId!).gte("created_at", new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()),
        supabase.from("customers").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId!).eq("status", "suspended"),
        supabase.from("subscriptions").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId!).eq("status", "active"),
        supabase.from("invoices").select("total").eq("tenant_id", tenantId!).eq("status", "unpaid"),
        supabase.from("payments").select("amount").eq("tenant_id", tenantId!).eq("status", "completed").gte("created_at", today.toISOString()).lt(tomorrow.toISOString()),
        supabase.from("notifications").select("id,is_read").eq("tenant_id", tenantId!),
      ]);

      const unpaidTotal = (unpaidInvoices.data ?? []).reduce((sum, invoice) => sum + Number(invoice.total ?? 0), 0);
      const todayTotal = (todayPayments.data ?? []).reduce((sum, payment) => sum + Number(payment.amount ?? 0), 0);
      const unreadNotifications = (notifications.data ?? []).filter((notification) => notification.is_read === false).length;

      const routerData = routers.data ?? [];
      return {
        customers: customers.count ?? 0,
        routersOnline: routerData.filter((r) => r.status === "online").length,
        routersTotal: routerData.length,
        activeSessions: activeSessions.count ?? 0,
        mtdRevenue: (mtdPayments.data ?? []).reduce((sum, payment) => sum + Number(payment.amount ?? 0), 0),
        openTickets: openTickets.count ?? 0,
        expiringSoon: expiringSoon.count ?? 0,
        newCustomers: newCustomers.count ?? 0,
        suspendedCustomers: suspendedCustomers.count ?? 0,
        activeSubscriptions: activeSubscriptions.count ?? 0,
        unpaidInvoices: unpaidInvoices.count ?? 0,
        outstandingAmount: unpaidTotal,
        todayRevenue: todayTotal,
        unreadNotifications,
      };
    },
    enabled: !!tenantId,
    refetchInterval: 30000,
  });

  const routerDetails = useQuery({
    queryKey: ["dashboard-routers", tenantId],
    queryFn: async () => {
      const { data } = await supabase
        .from("routers")
        .select("id,name,status,cpu_load,memory_used,uptime,is_active")
        .eq("tenant_id", tenantId!)
        .order("name", { ascending: true });
      return data ?? [];
    },
    enabled: !!tenantId,
  });

  const revenueChart = useQuery({
    queryKey: ["revenue-chart", tenantId],
    queryFn: async () => {
      const days = Array.from({ length: 7 }, (_, index) => {
        const date = new Date();
        date.setDate(date.getDate() - (6 - index));
        date.setHours(0, 0, 0, 0);
        return date;
      });
      const from = days[0].toISOString();
      const { data } = await supabase
        .from("payments")
        .select("amount,created_at")
        .eq("tenant_id", tenantId!)
        .eq("status", "completed")
        .gte("created_at", from);
      return days.map((day) => {
        const label = day.toLocaleDateString("en-KE", { weekday: "short" });
        const sum = (data ?? [])
          .filter((payment) => new Date(payment.created_at).toDateString() === day.toDateString())
          .reduce((total, payment) => total + Number(payment.amount ?? 0), 0);
        return { day: label, amount: sum };
      });
    },
    enabled: !!tenantId,
  });

  const recentPayments = useQuery({
    queryKey: ["recent-payments", tenantId],
    queryFn: async () => {
      const { data } = await supabase
        .from("payments")
        .select("id,amount,method,status,created_at,customers(full_name)")
        .eq("tenant_id", tenantId!)
        .order("created_at", { ascending: false })
        .limit(6);
      return data ?? [];
    },
    enabled: !!tenantId,
  });

  const recentInvoices = useQuery({
    queryKey: ["recent-invoices", tenantId],
    queryFn: async () => {
      const { data } = await supabase
        .from("invoices")
        .select("id,total,status,created_at,customers(full_name)")
        .eq("tenant_id", tenantId!)
        .order("created_at", { ascending: false })
        .limit(5);
      return data ?? [];
    },
    enabled: !!tenantId,
  });

  const recentTickets = useQuery({
    queryKey: ["recent-tickets", tenantId],
    queryFn: async () => {
      const { data } = await supabase
        .from("tickets")
        .select("id,ticket_no,subject,priority,status,created_at")
        .eq("tenant_id", tenantId!)
        .in("status", ["open", "in_progress"])
        .order("created_at", { ascending: false })
        .limit(5);
      return data ?? [];
    },
    enabled: !!tenantId,
  });

  const customerBreakdown = useQuery({
    queryKey: ["customer-breakdown", tenantId],
    queryFn: async () => {
      const { data } = await supabase
        .from("customers")
        .select("status")
        .eq("tenant_id", tenantId!);
      const counts = {
        active: 0,
        suspended: 0,
        pending: 0,
      };
      (data ?? []).forEach((customer) => {
        if (customer.status === "active") counts.active += 1;
        else if (customer.status === "suspended") counts.suspended += 1;
        else counts.pending += 1;
      });
      return counts;
    },
    enabled: !!tenantId,
  });

  const alertItems = useMemo(() => {
    const alerts: Array<{ icon: ComponentType<{ className?: string }> ; title: string; label: string; color: string }> = [];
    if (stats.data?.openTickets) {
      alerts.push({ icon: Ticket, title: `${stats.data.openTickets} open tickets`, label: "Review support issues", color: "orange" });
    }
    if (stats.data?.expiringSoon) {
      alerts.push({ icon: AlertTriangle, title: `${stats.data.expiringSoon} subscriptions expiring`, label: "Renew before service interruption", color: "yellow" });
    }
    (routerDetails.data ?? [])
      .filter((router) => router.status !== "online")
      .slice(0, 2)
      .forEach((router) => {
        alerts.push({ icon: WifiOff, title: `Router ${router.name ?? router.id} ${router.status}`, label: "Investigate connectivity", color: "red" });
      });
    return alerts.length ? alerts : [{ icon: CheckCircle, title: "No critical alerts", label: "All systems are within normal range", color: "green" }];
  }, [routerDetails.data, stats.data?.expiringSoon, stats.data?.openTickets]);

  const branchName = "Nairobi HQ";

  if (!user || profile.isLoading || roles.isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <p className="text-sm text-muted-foreground">Loading dashboard…</p>
      </div>
    );
  }

  if (!profile.data?.tenant_id) return <OnboardTenant userId={user.id} />;

  const s = stats.data;
  const routerItems = routerDetails.data ?? [];
  const isHealthy = s && s.routersOnline === s.routersTotal && s.openTickets === 0;
  const greeting = profile.data.full_name ? `, ${profile.data.full_name.split(" ")[0]}` : "";
  const systemStatusLabel = isHealthy ? "All Systems Operational" : "Attention Required";
  const systemStatusClass = isHealthy ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/30" : "bg-amber-500/10 text-amber-700 border-amber-500/30";
  const onlineCustomerPercent = s ? `${Math.round((s.activeSessions / Math.max(s.customers, 1)) * 1000) / 10}%` : "—";
  const customerMetrics = [
    { label: "New Today", value: s?.newCustomers ?? 0 },
    { label: "Expiring Soon", value: s?.expiringSoon ?? 0 },
    { label: "Suspended", value: s?.suspendedCustomers ?? 0 },
    { label: "Pending Installation", value: "—" },
    { label: "Online", value: s?.activeSessions ?? 0 },
    { label: "Offline", value: "—" },
    { label: "PPPoE", value: "—" },
    { label: "Hotspot", value: "—" },
    { label: "Fiber", value: "—" },
  ];
  const recentActivity = [
    ...(recentPayments.data ?? []).slice(0, 2).map((payment) => ({
      key: payment.id,
      time: new Date(payment.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      title: `${payment.customers?.full_name ?? "Customer"} paid KES ${Number(payment.amount).toLocaleString()}`,
      detail: payment.method,
    })),
    ...(recentTickets.data ?? []).slice(0, 2).map((ticket) => ({
      key: ticket.id,
      time: new Date(ticket.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      title: `Ticket ${ticket.ticket_no} opened`,
      detail: ticket.subject,
    })),
    { key: "sync-1", time: "09:15", title: "Router Nairobi synchronized", detail: "Network configuration updated" },
    { key: "voucher-1", time: "09:18", title: "Voucher redeemed", detail: "Hotspot access granted" },
    { key: "pppoe-1", time: "09:22", title: "PPPoE user connected", detail: "New session established" },
  ];

  return (
    <div className="space-y-6 w-full px-4 py-6 sm:px-6 lg:px-8">
      <section className="relative overflow-hidden rounded-2xl border border-border/60 bg-card p-6 shadow-sm" aria-labelledby="dashboard-title">
        <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse at top left, oklch(0.72 0.16 215 / 0.08), transparent 60%)" }} />
        <div className="relative flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-widest text-muted-foreground mb-1">Good {timeOfDay()}</p>
            <h1 id="dashboard-title" className="text-2xl font-bold tracking-tight">Dashboard{greeting}</h1>
            <p className="mt-1 text-sm text-muted-foreground">Overview of customers, network health, and billing.</p>
          </div>
          <div className="flex items-center gap-3">
            <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${systemStatusClass}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${isHealthy ? "bg-emerald-500" : "bg-amber-500"} animate-pulse`} />
              {systemStatusLabel}
            </span>
            <div className="text-sm text-muted-foreground hidden sm:block">Branch: <span className="font-medium text-foreground">{branchName}</span></div>
            <Link to="/billing" className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity shadow-sm">Create Invoice</Link>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-labelledby="kpi-region">
        <h2 id="kpi-region" className="sr-only">Key performance indicators</h2>
        <StatCard loading={stats.isLoading} title="Total Customers" value={s?.customers ?? 0} delta={s?.newCustomers ? `+${s.newCustomers} this month` : undefined} icon={Users} href="/customers" accent="blue" />
        <StatCard loading={stats.isLoading} title="Active Sessions" value={s?.activeSessions ?? 0} delta={s ? `${Math.round((s.activeSessions / Math.max(s.customers, 1)) * 100)}% online` : undefined} icon={Signal} href="/customers" accent="emerald" />
        <StatCard loading={stats.isLoading} title="MTD Revenue" value={s ? formatCurrency(s.mtdRevenue) : null} delta={s ? `Today: ${formatCurrency(s.todayRevenue)}` : undefined} icon={DollarSign} href="/billing" accent="violet" />
        <StatCard loading={stats.isLoading} title="Outstanding" value={s ? formatCurrency(s.outstandingAmount) : null} delta={`${s?.unpaidInvoices ?? 0} unpaid invoices`} icon={Receipt} href="/billing" accent="amber" />
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs uppercase tracking-widest text-muted-foreground">Revenue Trend</div>
                <h2 className="mt-1 text-lg font-semibold">Last 7 Days</h2>
              </div>
              <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">7-day view</span>
            </div>
            <div className="mt-4 h-56">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={revenueChart.data ?? []} margin={{ top: 6, right: 8, bottom: 6, left: 0 }}>
                  <defs>
                    <linearGradient id="usage-gradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#60a5fa" stopOpacity={0.22} />
                      <stop offset="95%" stopColor="#60a5fa" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} />
                  <RTooltip contentStyle={{ borderRadius: 10, border: "1px solid var(--border)", background: "var(--card)", color: "var(--foreground)" }} formatter={(value: number) => [`KES ${Number(value).toLocaleString()}`, "Revenue"]} />
                  <Area type="monotone" dataKey="amount" stroke="#3b82f6" strokeWidth={2} fill="url(#usage-gradient)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-border/60 bg-card p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs uppercase tracking-widest text-muted-foreground">Recent Payments</div>
                  <h3 className="mt-1 text-sm font-semibold">Latest transactions</h3>
                </div>
                <Link to="/billing" className="text-xs text-primary hover:underline">View all</Link>
              </div>
              <div className="mt-3 divide-y divide-border/50">
                {(recentPayments.data ?? []).slice(0, 4).map((p) => (
                  <div key={p.id} className="flex items-center justify-between py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="h-7 w-7 rounded-full bg-primary/10 grid place-items-center shrink-0">
                        <DollarSign className="h-3.5 w-3.5 text-primary" />
                      </div>
                      <div className="text-sm font-medium">{p.customers?.full_name ?? 'Customer'}</div>
                    </div>
                    <div className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">+{formatCurrency(Number(p.amount))}</div>
                  </div>
                ))}
                {(recentPayments.data ?? []).length === 0 && <div className="text-sm text-muted-foreground py-4 text-center">No recent payments</div>}
              </div>
            </div>

            <div className="rounded-2xl border border-border/60 bg-card p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs uppercase tracking-widest text-muted-foreground">Invoices</div>
                  <h3 className="mt-1 text-sm font-semibold">Recent invoices</h3>
                </div>
                <Link to="/billing" className="text-xs text-primary hover:underline">Manage</Link>
              </div>
              <div className="mt-3 divide-y divide-border/50">
                {(recentInvoices.data ?? []).map((inv) => (
                  <div key={inv.id} className="flex items-center justify-between py-2.5">
                    <div className="text-sm font-medium truncate max-w-[120px]">{inv.customers?.full_name ?? 'Customer'}</div>
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                        inv.status === 'paid' ? 'bg-emerald-500/10 text-emerald-600' :
                        inv.status === 'unpaid' ? 'bg-amber-500/10 text-amber-600' :
                        'bg-muted text-muted-foreground'
                      }`}>{inv.status}</span>
                      <div className="text-sm font-semibold">{formatCurrency(Number(inv.total))}</div>
                    </div>
                  </div>
                ))}
                {(recentInvoices.data ?? []).length === 0 && <div className="text-sm text-muted-foreground py-4 text-center">No invoices</div>}
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl border border-border/60 bg-card p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs uppercase tracking-widest text-muted-foreground">Network</div>
                <h3 className="mt-1 text-sm font-semibold">Router health</h3>
              </div>
              <Badge variant={isHealthy ? "secondary" : "destructive"} className="px-2 py-1 text-sm">{isHealthy ? "Healthy" : "Attention"}</Badge>
            </div>
            <div className="mt-3 divide-y divide-border/50">
              {routerDetails.isLoading ? (
                <div className="space-y-2 py-2">
                  {[1,2,3].map(i => <div key={i} className="h-8 rounded-md bg-muted/40 animate-pulse" />)}
                </div>
              ) : routerItems.length === 0 ? (
                <div className="text-sm text-muted-foreground py-4 text-center">No routers configured</div>
              ) : (
                routerItems.slice(0, 4).map((r) => (
                  <div key={r.id} className="flex items-center justify-between py-2.5">
                    <div className="flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-full shrink-0 ${r.status === "online" ? "bg-emerald-500" : "bg-amber-500"}`} />
                      <div className="truncate text-sm font-medium">{r.name ?? r.id}</div>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      {r.cpu_load != null && <span>{r.cpu_load}% CPU</span>}
                      <span className={`rounded-full px-2 py-0.5 font-medium ${r.status === "online" ? "bg-emerald-500/10 text-emerald-600" : "bg-amber-500/10 text-amber-600"}`}>{r.status}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-border/60 bg-card p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs uppercase tracking-widest text-muted-foreground">Alerts</div>
                <h3 className="mt-1 text-sm font-semibold">Critical items</h3>
              </div>
              <Link to="/noc" className="text-xs text-primary hover:underline">View all</Link>
            </div>
            <div className="mt-3 space-y-2">
              {alertItems.map((alert) => (
                <div key={`${alert.title}-${alert.label}`} className={`flex items-start gap-3 rounded-xl p-2.5 ${
                  alert.color === "red" ? "bg-red-500/5" :
                  alert.color === "orange" ? "bg-orange-500/5" :
                  alert.color === "yellow" ? "bg-yellow-500/5" :
                  "bg-emerald-500/5"
                }`}>
                  <div className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${alert.color === "red" ? "bg-red-500/15 text-red-600" : alert.color === "orange" ? "bg-orange-500/15 text-orange-600" : alert.color === "yellow" ? "bg-yellow-500/15 text-yellow-600" : "bg-emerald-500/15 text-emerald-600"}`}>
                    <alert.icon className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold">{alert.title}</div>
                    <div className="text-xs text-muted-foreground">{alert.label}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-border/60 bg-card p-4">
            <div className="text-xs uppercase tracking-widest text-muted-foreground">Recent Activity</div>
            <div className="mt-3 divide-y divide-border/50">
              {recentActivity.slice(0, 5).map((event) => (
                <div key={String(event.key)} className="flex items-start gap-3 py-2.5">
                  <div className="h-1.5 w-1.5 rounded-full bg-primary/60 mt-1.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="truncate text-sm font-medium">{event.title}</div>
                    <div className="text-xs text-muted-foreground truncate">{event.detail}</div>
                  </div>
                  <div className="text-xs text-muted-foreground shrink-0">{event.time}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function timeOfDay() {
  const hour = new Date().getHours();
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}

const ACCENT_STYLES: Record<string, { card: string; icon: string; bar: string }> = {
  blue:    { card: "border-blue-500/20",    icon: "bg-blue-500/15 text-blue-500",    bar: "bg-blue-500" },
  emerald: { card: "border-emerald-500/20", icon: "bg-emerald-500/15 text-emerald-500", bar: "bg-emerald-500" },
  violet:  { card: "border-violet-500/20",  icon: "bg-violet-500/15 text-violet-500",  bar: "bg-violet-500" },
  amber:   { card: "border-amber-500/20",   icon: "bg-amber-500/15 text-amber-500",   bar: "bg-amber-500" },
};

function StatCard({ title, value, delta, icon: Icon, href, accent = "blue", loading = false }: { title: string; value: string | number | null; delta?: string; icon: ComponentType<{ className?: string }>; href: string; accent?: string; loading?: boolean; }) {
  const a = ACCENT_STYLES[accent] ?? ACCENT_STYLES.blue;
  return (
    <Link
      to={href as never}
      className={`group relative flex flex-col justify-between overflow-hidden rounded-2xl border bg-card p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${a.card}`}
      aria-busy={loading}
      aria-label={title}
    >
      <div className={`absolute top-0 left-0 right-0 h-0.5 ${a.bar}`} />
      <div className="flex items-start justify-between gap-2">
        <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground">{title}</div>
        <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${a.icon}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className="mt-4">
        {loading
          ? <span className="inline-block h-7 w-28 rounded-lg bg-muted/40 animate-pulse" />
          : <div className="text-2xl font-bold tracking-tight text-foreground">{value ?? "—"}</div>
        }
        {delta && <div className="mt-1 text-xs text-muted-foreground">{delta}</div>}
      </div>
    </Link>
  );
}

function RevenueBreakdown({ label, amount }: { label: string; amount: number }) {
  return (
    <div className="h-full rounded-3xl border border-border/60 bg-background/50 p-4 transition-all duration-300 ease-out hover:-translate-y-1 hover:shadow-sm flex flex-col justify-between">
      <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{label}</div>
      <div className="mt-3 text-xl font-semibold">KES {amount.toLocaleString()}</div>
    </div>
  );
}

function MiniMetric({ label, value, icon: Icon }: { label: string; value: number; icon: ComponentType<{ className?: string }> }) {
  return (
    <div className="h-full rounded-3xl border border-border/60 bg-background/80 p-4 transition-all duration-300 ease-out hover:-translate-y-1 hover:shadow-sm flex flex-col justify-between">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-4 w-4" />
        <span className="text-xs uppercase tracking-[0.2em]">{label}</span>
      </div>
      <div className="mt-3 text-2xl font-semibold">{value}</div>
    </div>
  );
}

function SummaryStat({ title, value }: { title: string; value: string }) {
  return (
    <div className="h-full rounded-3xl border border-border/60 bg-background/80 p-4 transition-all duration-300 ease-out hover:-translate-y-1 hover:shadow-sm flex flex-col justify-between">
      <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{title}</div>
      <div className="mt-3 text-lg font-semibold">{value}</div>
    </div>
  );
}

function FeedItem({ time, title, detail }: { time: string; title: string; detail: string }) {
  return (
    <div className="h-full rounded-3xl border border-border/60 bg-background/80 p-4 transition-all duration-300 ease-out hover:-translate-y-1 hover:shadow-sm flex flex-col justify-between">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-medium">{title}</div>
        <span className="text-xs text-muted-foreground">{time}</span>
      </div>
      <div className="mt-2 text-sm text-muted-foreground">{detail}</div>
    </div>
  );
}

function SupportStat({ title, value, icon: Icon, color }: { title: string; value: number; icon: ComponentType<{ className?: string }>; color: string }) {
  return (
    <div className="h-full rounded-3xl border border-border/60 bg-background/80 p-4 transition-all duration-300 ease-out hover:-translate-y-1 hover:shadow-sm flex flex-col justify-between">
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <Icon className="h-4 w-4" />
        <span>{title}</span>
      </div>
      <div className={`mt-3 text-3xl font-semibold ${color}`}>{value}</div>
    </div>
  );
}
