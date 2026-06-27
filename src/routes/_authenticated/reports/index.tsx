import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useTenantId } from "@/lib/auth";
import { TrendingUp, TrendingDown, Users, Receipt, Wifi, Package, Download, BarChart3, PieChart } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/reports/")({
  component: ReportsPage,
});

function ReportsPage() {
  const { data: tenantId } = useTenantId();
  const [period, setPeriod] = useState("30");

  const since = new Date(Date.now() - Number(period) * 86400000).toISOString();

  const revenue = useQuery({
    queryKey: ["report-revenue", tenantId, period],
    queryFn: async () => {
      const { data, error } = await supabase.from("payments").select("amount, method, created_at").eq("tenant_id", tenantId!).eq("status", "completed").gte("created_at", since);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!tenantId,
  });

  const expenses = useQuery({
    queryKey: ["report-expenses", tenantId, period],
    queryFn: async () => {
      const { data, error } = await supabase.from("expenses").select("amount, category, date").eq("tenant_id", tenantId!).gte("created_at", since);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!tenantId,
  });

  const customers = useQuery({
    queryKey: ["report-customers", tenantId, period],
    queryFn: async () => {
      const { data } = await supabase.from("customers").select("status, category, created_at").eq("tenant_id", tenantId!);
      return data ?? [];
    },
    enabled: !!tenantId,
  });

  const subscriptions = useQuery({
    queryKey: ["report-subs", tenantId, period],
    queryFn: async () => {
      const { data } = await supabase.from("subscriptions").select("status, type, expires_at, created_at").eq("tenant_id", tenantId!);
      return data ?? [];
    },
    enabled: !!tenantId,
  });

  const tickets = useQuery({
    queryKey: ["report-tickets", tenantId, period],
    queryFn: async () => {
      const { data } = await supabase.from("tickets").select("status, priority, type, created_at, resolved_at").eq("tenant_id", tenantId!).gte("created_at", since);
      return data ?? [];
    },
    enabled: !!tenantId,
  });

  const installations = useQuery({
    queryKey: ["report-inst", tenantId, period],
    queryFn: async () => {
      const { data } = await supabase.from("installations").select("status, type, cost, created_at").eq("tenant_id", tenantId!).gte("created_at", since);
      return data ?? [];
    },
    enabled: !!tenantId,
  });

  const totalRevenue = revenue.data?.reduce((s, p) => s + Number(p.amount), 0) ?? 0;
  const totalExpenses = expenses.data?.reduce((s, e) => s + Number(e.amount), 0) ?? 0;
  const netProfit = totalRevenue - totalExpenses;
  const margin = totalRevenue > 0 ? ((netProfit / totalRevenue) * 100).toFixed(1) : "0";

  const revenueByMethod = (revenue.data ?? []).reduce<Record<string, number>>((acc, p) => {
    acc[p.method] = (acc[p.method] ?? 0) + Number(p.amount);
    return acc;
  }, {});

  const expenseByCategory = (expenses.data ?? []).reduce<Record<string, number>>((acc, e) => {
    acc[e.category] = (acc[e.category] ?? 0) + Number(e.amount);
    return acc;
  }, {});

  const customerByStatus = (customers.data ?? []).reduce<Record<string, number>>((acc, c) => {
    acc[c.status] = (acc[c.status] ?? 0) + 1;
    return acc;
  }, {});

  const customerByCategory = (customers.data ?? []).reduce<Record<string, number>>((acc, c) => {
    acc[c.category] = (acc[c.category] ?? 0) + 1;
    return acc;
  }, {});

  const newCustomers = (customers.data ?? []).filter((c) => c.created_at >= since).length;
  const activeSubs = (subscriptions.data ?? []).filter((s) => s.status === "active").length;
  const expiringSoon = (subscriptions.data ?? []).filter((s) => s.status === "active" && s.expires_at && new Date(s.expires_at) <= new Date(Date.now() + 7 * 86400000)).length;
  const installCost = (installations.data ?? []).reduce((s, i) => s + Number(i.cost ?? 0), 0);
  const resolvedTickets = (tickets.data ?? []).filter((t) => t.status === "resolved" || t.status === "closed").length;

  function downloadReport() {
    const lines = [
      `SmartLinkNet Report — Last ${period} days`,
      `Generated: ${new Date().toLocaleString()}`,
      "",
      "=== FINANCIAL SUMMARY ===",
      `Total Revenue: KES ${totalRevenue.toLocaleString()}`,
      `Total Expenses: KES ${totalExpenses.toLocaleString()}`,
      `Net Profit: KES ${netProfit.toLocaleString()}`,
      `Profit Margin: ${margin}%`,
      "",
      "=== CUSTOMERS ===",
      `New Customers: ${newCustomers}`,
      `Total Customers: ${customers.data?.length ?? 0}`,
      `Active: ${customerByStatus["active"] ?? 0}`,
      `Suspended: ${customerByStatus["suspended"] ?? 0}`,
      "",
      "=== SUBSCRIPTIONS ===",
      `Active: ${activeSubs}`,
      `Expiring in 7 days: ${expiringSoon}`,
      "",
      "=== SUPPORT ===",
      `Tickets: ${tickets.data?.length ?? 0}`,
      `Resolved: ${resolvedTickets}`,
      "",
      "=== REVENUE BY METHOD ===",
      ...Object.entries(revenueByMethod).map(([m, v]) => `${m}: KES ${v.toLocaleString()}`),
      "",
      "=== EXPENSES BY CATEGORY ===",
      ...Object.entries(expenseByCategory).map(([c, v]) => `${c}: KES ${v.toLocaleString()}`),
    ].join("\n");
    const a = document.createElement("a"); a.href = "data:text/plain," + encodeURIComponent(lines); a.download = `smartlinknet-report-${new Date().toISOString().split("T")[0]}.txt`; a.click();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Reports & Analytics</h1>
          <p className="text-sm text-muted-foreground">Financial and operational insights</p>
        </div>
        <div className="flex gap-2">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
              <SelectItem value="365">Last 12 months</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={downloadReport}><Download className="h-4 w-4 mr-2" />Download Report</Button>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPI icon={TrendingUp} label="Revenue" value={`KES ${totalRevenue.toLocaleString()}`} color="text-green-500" />
        <KPI icon={TrendingDown} label="Expenses" value={`KES ${totalExpenses.toLocaleString()}`} color="text-red-500" />
        <KPI icon={Receipt} label="Net Profit" value={`KES ${netProfit.toLocaleString()}`} color={netProfit >= 0 ? "text-green-500" : "text-red-500"} sub={`${margin}% margin`} />
        <KPI icon={Users} label="New Customers" value={newCustomers} sub={`${customers.data?.length ?? 0} total`} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPI icon={Wifi} label="Active Subs" value={activeSubs} />
        <KPI icon={Package} label="Expiring (7d)" value={expiringSoon} color={expiringSoon > 0 ? "text-yellow-500" : ""} />
        <KPI icon={BarChart3} label="Tickets" value={tickets.data?.length ?? 0} sub={`${resolvedTickets} resolved`} />
        <KPI icon={Receipt} label="Install Revenue" value={`KES ${installCost.toLocaleString()}`} />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <ChartCard title="Revenue by Payment Method" data={revenueByMethod} total={totalRevenue} color="bg-primary" />
        <ChartCard title="Expenses by Category" data={expenseByCategory} total={totalExpenses} color="bg-destructive/70" />
        <ChartCard title="Customers by Status" data={customerByStatus} total={customers.data?.length ?? 0} color="bg-blue-500" />
        <ChartCard title="Customers by Category" data={customerByCategory} total={customers.data?.length ?? 0} color="bg-purple-500" />
      </div>

      {/* Subscription Summary */}
      <div className="rounded-xl border border-border/60 bg-card p-6">
        <h2 className="font-semibold mb-4">Subscription Breakdown</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "Active", value: activeSubs, color: "text-green-500" },
            { label: "Expired", value: (subscriptions.data ?? []).filter((s) => s.status === "expired").length, color: "text-red-500" },
            { label: "Suspended", value: (subscriptions.data ?? []).filter((s) => s.status === "suspended").length, color: "text-yellow-500" },
            { label: "Hotspot", value: (subscriptions.data ?? []).filter((s) => s.type === "hotspot").length },
            { label: "PPPoE", value: (subscriptions.data ?? []).filter((s) => s.type === "pppoe").length },
            { label: "Fiber", value: (subscriptions.data ?? []).filter((s) => s.type === "fiber").length },
          ].map((s) => (
            <div key={s.label} className="rounded-lg bg-muted/40 p-3">
              <div className="text-xs text-muted-foreground">{s.label}</div>
              <div className={`text-xl font-bold mt-1 ${s.color ?? ""}`}>{s.value}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function KPI({ icon: Icon, label, value, color, sub }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string | number; color?: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs text-muted-foreground uppercase">{label}</div>
        <Icon className={`h-4 w-4 ${color ?? "text-muted-foreground"}`} />
      </div>
      <div className={`text-xl font-bold ${color ?? ""}`}>{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

function ChartCard({ title, data, total, color }: { title: string; data: Record<string, number>; total: number; color: string }) {
  const sorted = Object.entries(data).sort((a, b) => b[1] - a[1]);
  return (
    <div className="rounded-xl border border-border/60 bg-card p-6">
      <h2 className="font-semibold mb-4">{title}</h2>
      {sorted.length === 0 ? (
        <div className="text-sm text-muted-foreground text-center py-6">No data for this period</div>
      ) : (
        <div className="space-y-3">
          {sorted.map(([key, val]) => (
            <div key={key}>
              <div className="flex justify-between text-sm mb-1">
                <span className="capitalize">{key.replace(/_/g, " ")}</span>
                <span className="font-medium">{typeof val === "number" && val > 999 ? `KES ${val.toLocaleString()}` : val}</span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div className={`h-full rounded-full ${color}`} style={{ width: `${total > 0 ? (val / total) * 100 : 0}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
