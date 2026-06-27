import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useAuth, fetchMyRoles } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  ShieldCheck, Building2, Plus, Trash2, RefreshCw,
  CheckCircle, PauseCircle, TrendingUp, DollarSign,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminPage,
});

const STATUS_MAP: Record<string, string> = {
  active: "bg-green-500/15 text-green-600",
  trial: "bg-blue-500/15 text-blue-600",
  suspended: "bg-yellow-500/15 text-yellow-600",
  cancelled: "bg-red-500/15 text-red-600",
};

const PLAN_MAP: Record<string, string> = {
  trial: "bg-muted text-muted-foreground",
  starter: "bg-blue-500/15 text-blue-600",
  growth: "bg-purple-500/15 text-purple-600",
  enterprise: "bg-primary/15 text-primary",
};

function AdminPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ name: "", slug: "", contact_email: "", contact_phone: "", country: "KE", plan: "trial" });

  const roles = useQuery({
    queryKey: ["roles", user?.id],
    queryFn: () => (user ? fetchMyRoles(user.id) : Promise.resolve([])),
    enabled: !!user,
  });
  const isSuper = (roles.data ?? []).includes("super_admin");

  const tenants = useQuery({
    queryKey: ["tenants", search],
    queryFn: async () => {
      let q = supabase.from("tenants").select("id,name,slug,status,plan,country,created_at,contact_email,contact_phone,trial_ends_at").order("created_at", { ascending: false });
      if (search) q = q.ilike("name", `%${search}%`);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
    enabled: isSuper,
  });

  const platformStats = useQuery({
    queryKey: ["platform-stats"],
    queryFn: async () => {
      const [total, active, suspended, trial, revenue] = await Promise.all([
        supabase.from("tenants").select("*", { count: "exact", head: true }),
        supabase.from("tenants").select("*", { count: "exact", head: true }).eq("status", "active"),
        supabase.from("tenants").select("*", { count: "exact", head: true }).eq("status", "suspended"),
        supabase.from("tenants").select("*", { count: "exact", head: true }).eq("status", "trial"),
        supabase.from("payments").select("amount").eq("status", "completed").gte("created_at", new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()),
      ]);
      const mtdRevenue = (revenue.data ?? []).reduce((s: number, p: any) => s + Number(p.amount), 0);
      return { total: total.count ?? 0, active: active.count ?? 0, suspended: suspended.count ?? 0, trial: trial.count ?? 0, mtdRevenue };
    },
    enabled: isSuper,
  });

  const createTenant = useMutation({
    mutationFn: async () => {
      const slug = form.slug || form.name.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-").slice(0, 40) + "-" + Math.random().toString(36).slice(2, 6);
      const { error } = await supabase.from("tenants").insert({ ...form, slug } as any);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Tenant created"); qc.invalidateQueries({ queryKey: ["tenants"] }); setOpen(false); setForm({ name: "", slug: "", contact_email: "", contact_phone: "", country: "KE", plan: "trial" }); },
    onError: (e: any) => toast.error(e.message),
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("tenants").update({ status } as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Tenant updated"); qc.invalidateQueries({ queryKey: ["tenants"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteTenant = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("tenants").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Tenant deleted"); qc.invalidateQueries({ queryKey: ["tenants"] }); },
    onError: (e: any) => toast.error(e.message),
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary" />Super Admin</h1>
          <p className="text-sm text-muted-foreground">Manage all tenants on SmartLinkNet</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => qc.invalidateQueries({ queryKey: ["tenants"] })}><RefreshCw className="h-4 w-4" /></Button>
          <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-2" />New Tenant</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {[
          { label: "Total Tenants", value: platformStats.data?.total ?? 0, icon: Building2 },
          { label: "Active", value: platformStats.data?.active ?? 0, icon: CheckCircle, color: "text-green-500" },
          { label: "Trial", value: platformStats.data?.trial ?? 0, icon: TrendingUp, color: "text-blue-500" },
          { label: "Suspended", value: platformStats.data?.suspended ?? 0, icon: PauseCircle, color: "text-yellow-500" },
          { label: "Revenue MTD", value: `KES ${(platformStats.data?.mtdRevenue ?? 0).toLocaleString()}`, icon: DollarSign, color: "text-green-500" },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-border/60 bg-card p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs text-muted-foreground uppercase">{s.label}</div>
              <s.icon className={`h-4 w-4 ${s.color ?? "text-muted-foreground"}`} />
            </div>
            <div className={`text-2xl font-bold ${s.color ?? ""}`}>{s.value}</div>
          </div>
        ))}
      </div>

      <div className="flex gap-3">
        <Input className="max-w-sm" placeholder="Search tenants..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3 text-left">Tenant</th>
              <th className="px-4 py-3 text-left">Contact</th>
              <th className="px-4 py-3 text-left">Plan</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-left">Country</th>
              <th className="px-4 py-3 text-left">Joined</th>
              <th className="px-4 py-3 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {tenants.isLoading ? (
              <tr><td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">Loading...</td></tr>
            ) : tenants.data?.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-12 text-center text-muted-foreground"><Building2 className="h-6 w-6 mx-auto mb-2 opacity-30" />No tenants yet</td></tr>
            ) : tenants.data?.map((t) => (
              <tr key={t.id} className="border-t border-border/60 hover:bg-accent/30">
                <td className="px-4 py-3">
                  <div className="font-medium">{t.name}</div>
                  <div className="text-xs text-muted-foreground">{t.slug}</div>
                </td>
                <td className="px-4 py-3 text-xs">
                  <div>{t.contact_email ?? "—"}</div>
                  <div className="text-muted-foreground">{t.contact_phone ?? "—"}</div>
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs capitalize ${PLAN_MAP[t.plan] ?? "bg-muted"}`}>{t.plan}</span>
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs capitalize ${STATUS_MAP[t.status] ?? "bg-muted"}`}>{t.status}</span>
                </td>
                <td className="px-4 py-3 text-xs">{t.country}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(t.created_at).toLocaleDateString()}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-1">
                    {t.status !== "active" && (
                      <button onClick={() => updateStatus.mutate({ id: t.id, status: "active" })} className="text-xs rounded px-2 py-1 bg-green-500/15 text-green-600 hover:bg-green-500/30">Activate</button>
                    )}
                    {t.status === "active" && (
                      <button onClick={() => updateStatus.mutate({ id: t.id, status: "suspended" })} className="text-xs rounded px-2 py-1 bg-yellow-500/15 text-yellow-600 hover:bg-yellow-500/30">Suspend</button>
                    )}
                    <button onClick={() => { if (confirm(`Delete tenant "${t.name}"? This is irreversible.`)) deleteTenant.mutate(t.id); }} className="text-muted-foreground hover:text-destructive p-1"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Create New Tenant</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2"><Label>Company / ISP Name *</Label><Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></div>
              <div><Label>Slug (auto-generated)</Label><Input value={form.slug} onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))} placeholder="auto" /></div>
              <div>
                <Label>Plan</Label>
                <Select value={form.plan} onValueChange={(v) => setForm((f) => ({ ...f, plan: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="trial">Trial</SelectItem>
                    <SelectItem value="starter">Starter</SelectItem>
                    <SelectItem value="growth">Growth</SelectItem>
                    <SelectItem value="enterprise">Enterprise</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Contact Email</Label><Input type="email" value={form.contact_email} onChange={(e) => setForm((f) => ({ ...f, contact_email: e.target.value }))} /></div>
              <div><Label>Contact Phone</Label><Input value={form.contact_phone} onChange={(e) => setForm((f) => ({ ...f, contact_phone: e.target.value }))} placeholder="+254..." /></div>
              <div>
                <Label>Country</Label>
                <Select value={form.country} onValueChange={(v) => setForm((f) => ({ ...f, country: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="KE">Kenya</SelectItem>
                    <SelectItem value="UG">Uganda</SelectItem>
                    <SelectItem value="TZ">Tanzania</SelectItem>
                    <SelectItem value="RW">Rwanda</SelectItem>
                    <SelectItem value="ET">Ethiopia</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={() => createTenant.mutate()} disabled={!form.name || createTenant.isPending}>
                {createTenant.isPending ? "Creating..." : "Create Tenant"}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
