import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { Plus, Wifi, WifiOff, Activity, Cpu, HardDrive, Edit, Trash2, RefreshCw, Network } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { adapterFactory, ADAPTER_TYPE_LABELS } from "@/lib/network";
import type { AdapterType } from "@/lib/network";
import { NetworkAdaptersPanel } from "@/components/NetworkAdaptersPanel";

export const Route = createFileRoute("/_authenticated/routers/")({
  component: RoutersPage,
});

const schema = z.object({
  name: z.string().min(1),
  model: z.string().optional(),
  connection_string: z.string().optional(),
  ip_address: z.string().optional(),
  api_port: z.coerce.number().min(1).default(80),
  api_username: z.string().optional(),
  api_password: z.string().optional(),
  location: z.string().optional(),
  vendor: z.string().min(1).default("mikrotik"),
  primary_adapter_type: z.string().optional(),
  use_ssl: z.boolean().default(false),
});

type FormData = z.infer<typeof schema>;

function RoutersPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [tab, setTab] = useState("routers");

  const tenantQuery = useQuery({
    queryKey: ["tenant-id", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("tenant_id").eq("id", user!.id).single();
      return (data?.tenant_id as string) ?? null;
    },
    enabled: !!user,
    staleTime: 0,
  });

  const tenantId = tenantQuery.data ?? null;

  const routers = useQuery({
    queryKey: ["routers", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("routers")
        .select("*")
        .eq("tenant_id", tenantId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!tenantId,
    refetchInterval: 30000,
  });

  const { register, handleSubmit, reset, setValue } = useForm<FormData>({
    resolver: zodResolver(schema) as any,
  });

  async function syncRouter(routerId: string) {
    setSyncing(routerId);
    try {
      const adapter = await adapterFactory.getRouterAdapter(routerId);
      const result = await adapter.getStatus();
      if (result.success) {
        toast.success(`Synced — CPU ${result.data?.cpuLoad}% · RAM ${result.data?.memoryUsed}%`);
      } else {
        toast.error("Sync failed: " + result.error);
      }
      qc.invalidateQueries({ queryKey: ["routers"] });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSyncing(null);
    }
  }

  const save = useMutation({
    mutationFn: async (data: FormData) => {
      if (!tenantId) throw new Error("No tenant found. Please complete workspace setup first.");
      if (editing) {
        const { error } = await supabase.from("routers").update(data as any).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("routers").insert({ ...data, tenant_id: tenantId } as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Router updated" : "Router added");
      qc.invalidateQueries({ queryKey: ["routers"] });
      setOpen(false); reset(); setEditing(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("routers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Router removed"); qc.invalidateQueries({ queryKey: ["routers"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  function openEdit(r: any) {
    setEditing(r);
    Object.keys(schema.shape).forEach((k) => setValue(k as any, r[k] ?? ""));
    setOpen(true);
  }

  const online = routers.data?.filter((r) => r.status === "online").length ?? 0;
  const offline = routers.data?.filter((r) => r.status === "offline").length ?? 0;

  return (
    <div className="space-y-6">
      {!tenantQuery.isLoading && !tenantId && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-600">
          Your workspace is not set up yet. Please complete onboarding before adding routers.
        </div>
      )}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Routers</h1>
          <p className="text-sm text-muted-foreground">Network-agnostic device management — Phase 1</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => qc.invalidateQueries({ queryKey: ["routers"] })}>
            <RefreshCw className="h-4 w-4 mr-2" />Refresh
          </Button>
          <Button onClick={() => { setEditing(null); reset(); setOpen(true); }}>
            <Plus className="h-4 w-4 mr-2" />Add Router
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border border-border/60 bg-card p-4">
          <div className="text-xs text-muted-foreground uppercase">Total</div>
          <div className="text-2xl font-bold mt-1">{routers.data?.length ?? 0}</div>
        </div>
        <div className="rounded-xl border border-border/60 bg-card p-4">
          <div className="text-xs text-muted-foreground uppercase">Online</div>
          <div className="text-2xl font-bold mt-1 text-green-500">{online}</div>
        </div>
        <div className="rounded-xl border border-border/60 bg-card p-4">
          <div className="text-xs text-muted-foreground uppercase">Offline</div>
          <div className="text-2xl font-bold mt-1 text-red-500">{offline}</div>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="routers">Routers</TabsTrigger>
          <TabsTrigger value="adapters">
            <Network className="h-3.5 w-3.5 mr-1" />Network Adapters
          </TabsTrigger>
        </TabsList>

        <TabsContent value="routers" className="space-y-4 mt-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {routers.isLoading ? (
              <div className="col-span-3 text-center py-12 text-muted-foreground">Loading...</div>
            ) : routers.data?.length === 0 ? (
              <div className="col-span-3 text-center py-12 text-muted-foreground">No routers added yet</div>
            ) : routers.data?.map((r) => (
              <div key={r.id} className="rounded-xl border border-border/60 bg-card p-5 space-y-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-semibold">{r.name}</div>
                    <div className="text-xs text-muted-foreground flex items-center gap-1 flex-wrap">
                      <span className="capitalize">{r.vendor ?? "mikrotik"}</span>
                      {(r as any).primary_adapter_type && (
                        <span className="rounded-full bg-primary/15 text-primary px-1.5 py-0.5 text-[10px]">
                          {ADAPTER_TYPE_LABELS[(r as any).primary_adapter_type as AdapterType] ?? (r as any).primary_adapter_type}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className={`flex items-center gap-1 text-xs rounded-full px-2 py-0.5 ${r.status === "online" ? "bg-green-500/15 text-green-600" : "bg-red-500/15 text-red-600"}`}>
                    {r.status === "online" ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
                    {r.status}
                  </div>
                </div>
                {r.status === "online" && (
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="flex items-center gap-1 text-muted-foreground"><Cpu className="h-3 w-3" />CPU: {r.cpu_load ?? 0}%</div>
                    <div className="flex items-center gap-1 text-muted-foreground"><HardDrive className="h-3 w-3" />RAM: {r.memory_used ?? 0}%</div>
                    <div className="flex items-center gap-1 text-muted-foreground"><Activity className="h-3 w-3" />Uptime: {r.uptime ?? "N/A"}</div>
                  </div>
                )}
                {r.location && <div className="text-xs text-muted-foreground">{r.location}</div>}
                <div className="flex gap-2 pt-2 border-t border-border/60">
                  <button
                    onClick={() => syncRouter(r.id)}
                    disabled={syncing === r.id}
                    className="text-xs flex items-center gap-1 text-muted-foreground hover:text-primary"
                  >
                    <RefreshCw className={`h-3 w-3 ${syncing === r.id ? "animate-spin" : ""}`} />
                    {syncing === r.id ? "Syncing..." : "Sync"}
                  </button>
                  <button onClick={() => openEdit(r)} className="text-xs flex items-center gap-1 text-muted-foreground hover:text-foreground">
                    <Edit className="h-3 w-3" />Edit
                  </button>
                  <button onClick={() => setDeleteId(r.id)} className="text-xs flex items-center gap-1 text-muted-foreground hover:text-destructive">
                    <Trash2 className="h-3 w-3" />Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="adapters" className="mt-4">
          <NetworkAdaptersPanel />
        </TabsContent>
      </Tabs>

      <Dialog open={!!deleteId} onOpenChange={(o) => { if (!o) setDeleteId(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Remove Router</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Are you sure you want to remove this router?</p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => { remove.mutate(deleteId!); setDeleteId(null); }} disabled={remove.isPending}>Remove</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Edit Router" : "Add Router"}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit((d) => save.mutate(d))} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Name *</Label><Input {...register("name")} /></div>
              <div><Label>Model</Label><Input {...register("model")} /></div>
              <div className="col-span-2">
                <Label>Connection Address <span className="text-xs text-muted-foreground">(hostname or proxy URL)</span></Label>
                <Input {...register("connection_string")} placeholder="e.g. router1.myisp.co.ke" />
              </div>
              <div><Label>API Port</Label><Input type="number" {...register("api_port")} /></div>
              <div>
                <Label>Adapter Type</Label>
                <Select
                  defaultValue={editing?.primary_adapter_type ?? "mikrotik_rest"}
                  onValueChange={(v) => setValue("primary_adapter_type", v)}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.entries(ADAPTER_TYPE_LABELS) as [AdapterType, string][]).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>API Username</Label><Input {...register("api_username")} /></div>
              <div><Label>API Password</Label><Input type="password" {...register("api_password")} /></div>
              <div className="col-span-2"><Label>Location</Label><Input {...register("location")} /></div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={save.isPending || !tenantId}>{save.isPending ? "Saving..." : "Save"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
