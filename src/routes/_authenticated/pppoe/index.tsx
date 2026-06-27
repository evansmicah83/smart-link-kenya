import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useTenantId } from "@/lib/auth";
import { toast } from "sonner";
import { Plus, Edit, Trash2, Wifi, WifiOff, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

export const Route = createFileRoute("/_authenticated/pppoe/")({
  component: PPPoEPage,
});

const schema = z.object({
  customer_id: z.string().min(1),
  package_id: z.string().min(1),
  router_id: z.string().optional(),
  username: z.string().min(1),
  password: z.string().min(1),
  ip_address: z.string().optional(),
  auto_renew: z.boolean().default(false),
});

type FormData = z.infer<typeof schema>;

function PPPoEPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [search, setSearch] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: tenantId } = useTenantId();

  const subscriptions = useQuery({
    queryKey: ["pppoe-subs", tenantId, search],
    queryFn: async () => {
      let q = supabase
        .from("subscriptions")
        .select("*, customers(full_name, phone), packages(name, speed_down_kbps, speed_up_kbps), routers(name)")
        .eq("tenant_id", tenantId!)
        .eq("type", "pppoe")
        .order("created_at", { ascending: false });
      if (search) q = q.ilike("username", `%${search}%`);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!tenantId,
  });

  const customers = useQuery({
    queryKey: ["customers-list", tenantId],
    queryFn: async () => {
      const { data } = await supabase.from("customers").select("id,full_name,phone").eq("tenant_id", tenantId!).order("full_name");
      return data ?? [];
    },
    enabled: !!tenantId,
  });

  const packages = useQuery({
    queryKey: ["packages-pppoe", tenantId],
    queryFn: async () => {
      const { data } = await supabase.from("packages").select("id,name").eq("tenant_id", tenantId!).eq("type", "pppoe").eq("is_active", true);
      return data ?? [];
    },
    enabled: !!tenantId,
  });

  const routers = useQuery({
    queryKey: ["routers-list", tenantId],
    queryFn: async () => {
      const { data } = await supabase.from("routers").select("id,name").eq("tenant_id", tenantId!).eq("is_active", true);
      return data ?? [];
    },
    enabled: !!tenantId,
  });

  const { register, handleSubmit, reset, setValue, formState: { errors } } = useForm<FormData>({ resolver: zodResolver(schema) as any });

  const save = useMutation({
    mutationFn: async (data: FormData) => {
      if (editing) {
        const { error } = await supabase.from("subscriptions").update(data).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("subscriptions").insert({
          ...data, tenant_id: tenantId, type: "pppoe", status: "active", starts_at: new Date().toISOString(),
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "PPPoE user updated" : "PPPoE user created");
      qc.invalidateQueries({ queryKey: ["pppoe-subs"] });
      setOpen(false); reset(); setEditing(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const toggleStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("subscriptions").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Status updated"); qc.invalidateQueries({ queryKey: ["pppoe-subs"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("subscriptions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Deleted"); qc.invalidateQueries({ queryKey: ["pppoe-subs"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  function openEdit(s: any) {
    setEditing(s);
    setValue("customer_id", s.customer_id);
    setValue("package_id", s.package_id);
    setValue("username", s.username ?? "");
    setValue("password", s.password ?? "");
    setValue("ip_address", s.ip_address ?? "");
    setOpen(true);
  }

  const stats = {
    total: subscriptions.data?.length ?? 0,
    active: subscriptions.data?.filter((s) => s.status === "active").length ?? 0,
    suspended: subscriptions.data?.filter((s) => s.status === "suspended").length ?? 0,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">PPPoE</h1>
          <p className="text-sm text-muted-foreground">PPPoE user management and sessions</p>
        </div>
        <Button onClick={() => { setEditing(null); reset(); setOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" />Add PPPoE User
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Total Users", value: stats.total },
          { label: "Active", value: stats.active, color: "text-green-500" },
          { label: "Suspended", value: stats.suspended, color: "text-yellow-500" },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-border/60 bg-card p-4">
            <div className="text-xs text-muted-foreground uppercase">{s.label}</div>
            <div className={`text-2xl font-bold mt-1 ${s.color ?? ""}`}>{s.value}</div>
          </div>
        ))}
      </div>

      <div className="flex gap-3">
        <Input className="max-w-sm" placeholder="Search by username..." value={search} onChange={(e) => setSearch(e.target.value)} />
        <Button variant="outline" onClick={() => qc.invalidateQueries({ queryKey: ["pppoe-subs"] })}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3 text-left">Customer</th>
              <th className="px-4 py-3 text-left">Username</th>
              <th className="px-4 py-3 text-left">Package</th>
              <th className="px-4 py-3 text-left">Router</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-left">Expires</th>
              <th className="px-4 py-3 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {subscriptions.isLoading ? (
              <tr><td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">Loading...</td></tr>
            ) : subscriptions.data?.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">No PPPoE users yet</td></tr>
            ) : subscriptions.data?.map((s) => (
              <tr key={s.id} className="border-t border-border/60 hover:bg-accent/30">
                <td className="px-4 py-3">
                  <div className="font-medium">{(s as any).customers?.full_name}</div>
                  <div className="text-xs text-muted-foreground">{(s as any).customers?.phone}</div>
                </td>
                <td className="px-4 py-3 font-mono text-xs">{s.username}</td>
                <td className="px-4 py-3 text-xs">{(s as any).packages?.name}</td>
                <td className="px-4 py-3 text-xs">{(s as any).routers?.name ?? "—"}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs capitalize ${s.status === "active" ? "bg-green-500/15 text-green-600" : "bg-yellow-500/15 text-yellow-600"}`}>{s.status}</span>
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{s.expires_at ? new Date(s.expires_at).toLocaleDateString() : "—"}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <button onClick={() => toggleStatus.mutate({ id: s.id, status: s.status === "active" ? "suspended" : "active" })} className="text-muted-foreground hover:text-foreground">
                      {s.status === "active" ? <WifiOff className="h-4 w-4" /> : <Wifi className="h-4 w-4" />}
                    </button>
                    <button onClick={() => openEdit(s)} className="text-muted-foreground hover:text-foreground"><Edit className="h-4 w-4" /></button>
                    <button onClick={() => setDeleteId(s.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={!!deleteId} onOpenChange={(o) => { if (!o) setDeleteId(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Delete PPPoE User</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Are you sure you want to delete this PPPoE user? This will remove their subscription permanently.</p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => { remove.mutate(deleteId!); setDeleteId(null); }} disabled={remove.isPending}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Edit PPPoE User" : "Add PPPoE User"}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit((d) => save.mutate(d))} className="space-y-4">
            <div>
              <Label>Customer *</Label>
              <Select onValueChange={(v) => setValue("customer_id", v)}>
                <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
                <SelectContent>
                  {customers.data?.map((c) => <SelectItem key={c.id} value={c.id}>{c.full_name} — {c.phone}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Package *</Label>
              <Select onValueChange={(v) => setValue("package_id", v)}>
                <SelectTrigger><SelectValue placeholder="Select package" /></SelectTrigger>
                <SelectContent>
                  {packages.data?.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Router</Label>
              <Select onValueChange={(v) => setValue("router_id", v)}>
                <SelectTrigger><SelectValue placeholder="Select router (optional)" /></SelectTrigger>
                <SelectContent>
                  {routers.data?.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Username *</Label><Input {...register("username")} /></div>
              <div><Label>Password *</Label><Input type="password" {...register("password")} /></div>
              <div><Label>IP Address</Label><Input {...register("ip_address")} placeholder="Optional" /></div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={save.isPending}>{save.isPending ? "Saving..." : "Save"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
