import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useTenantId } from "@/lib/auth";
import { toast } from "sonner";
import { Plus, Edit, Trash2, Zap, Clock, Database } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

export const Route = createFileRoute("/_authenticated/packages/")({
  component: PackagesPage,
});

const schema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  type: z.string().min(1).default("hotspot"),
  billing_type: z.string().min(1).default("prepaid"),
  duration_days: z.coerce.number().min(1).default(30),
  price: z.coerce.number().min(0),
  speed_down_kbps: z.coerce.number().min(1).default(1024),
  speed_up_kbps: z.coerce.number().min(1).default(512),
  data_limit_mb: z.coerce.number().optional().nullable(),
  is_active: z.boolean().default(true),
});

type FormData = z.infer<typeof schema>;

function PackagesPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: tenantId } = useTenantId();

  const packages = useQuery({
    queryKey: ["packages", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase.from("packages").select("*").eq("tenant_id", tenantId!).order("price");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!tenantId,
  });

  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<FormData>({ resolver: zodResolver(schema) as any });

  const save = useMutation({
    mutationFn: async (data: FormData) => {
      if (editing) {
        const { error } = await supabase.from("packages").update(data).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("packages").insert({ ...data, tenant_id: tenantId });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Package updated" : "Package created");
      qc.invalidateQueries({ queryKey: ["packages"] });
      setOpen(false); reset(); setEditing(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("packages").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Package deleted"); qc.invalidateQueries({ queryKey: ["packages"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  function openEdit(p: any) {
    setEditing(p);
    Object.keys(schema.shape).forEach((k) => setValue(k as any, p[k] ?? ""));
    setOpen(true);
  }

  const typeColors: Record<string, string> = {
    hotspot: "bg-blue-500/15 text-blue-600",
    pppoe: "bg-purple-500/15 text-purple-600",
    fiber: "bg-green-500/15 text-green-600",
    data: "bg-orange-500/15 text-orange-600",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Packages</h1>
          <p className="text-sm text-muted-foreground">Internet packages and service plans</p>
        </div>
        <Button onClick={() => { setEditing(null); reset(); setOpen(true); }}><Plus className="h-4 w-4 mr-2" />New Package</Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {packages.isLoading ? (
          <div className="col-span-3 text-center py-12 text-muted-foreground">Loading...</div>
        ) : packages.data?.length === 0 ? (
          <div className="col-span-3 text-center py-12 text-muted-foreground">No packages yet. Create your first package.</div>
        ) : packages.data?.map((p) => (
          <div key={p.id} className={`rounded-xl border bg-card p-5 space-y-3 ${p.is_active ? "border-border/60" : "border-border/30 opacity-60"}`}>
            <div className="flex items-start justify-between">
              <div>
                <div className="font-semibold">{p.name}</div>
                {p.description && <div className="text-xs text-muted-foreground mt-0.5">{p.description}</div>}
              </div>
              <span className={`text-xs rounded-full px-2 py-0.5 capitalize ${typeColors[p.type] ?? "bg-muted"}`}>{p.type}</span>
            </div>
            <div className="text-2xl font-bold">KES {Number(p.price).toLocaleString()}<span className="text-sm font-normal text-muted-foreground">/{p.duration_days}d</span></div>
            <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
              <div className="flex items-center gap-1"><Zap className="h-3 w-3" />↓{p.speed_down_kbps >= 1024 ? `${p.speed_down_kbps / 1024}Mbps` : `${p.speed_down_kbps}Kbps`}</div>
              <div className="flex items-center gap-1"><Zap className="h-3 w-3" />↑{p.speed_up_kbps >= 1024 ? `${p.speed_up_kbps / 1024}Mbps` : `${p.speed_up_kbps}Kbps`}</div>
              <div className="flex items-center gap-1"><Database className="h-3 w-3" />{p.data_limit_mb ? `${p.data_limit_mb >= 1024 ? `${(p.data_limit_mb / 1024).toFixed(0)}GB` : `${p.data_limit_mb}MB`}` : "Unlimited"}</div>
              <div className="flex items-center gap-1"><Clock className="h-3 w-3" />{p.duration_days} days</div>
            </div>
            <div className="flex gap-2 pt-2 border-t border-border/60">
              <button onClick={() => openEdit(p)} className="text-xs flex items-center gap-1 text-muted-foreground hover:text-foreground"><Edit className="h-3 w-3" />Edit</button>
              <button onClick={() => setDeleteId(p.id)} className="text-xs flex items-center gap-1 text-muted-foreground hover:text-destructive"><Trash2 className="h-3 w-3" />Delete</button>
            </div>
          </div>
        ))}
      </div>

      <Dialog open={!!deleteId} onOpenChange={(o) => { if (!o) setDeleteId(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Delete Package</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Are you sure you want to delete this package? Active subscriptions using this package will not be affected.</p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => { remove.mutate(deleteId!); setDeleteId(null); }} disabled={remove.isPending}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>{editing ? "Edit Package" : "New Package"}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit((d) => save.mutate(d))} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2"><Label>Package Name *</Label><Input {...register("name")} /></div>
              <div className="col-span-2"><Label>Description</Label><Input {...register("description")} /></div>
              <div>
                <Label>Type</Label>
                <Select defaultValue="hotspot" onValueChange={(v) => setValue("type", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hotspot">Hotspot</SelectItem>
                    <SelectItem value="pppoe">PPPoE</SelectItem>
                    <SelectItem value="fiber">Fiber</SelectItem>
                    <SelectItem value="data">Data Bundle</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Billing</Label>
                <Select defaultValue="prepaid" onValueChange={(v) => setValue("billing_type", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="prepaid">Prepaid</SelectItem>
                    <SelectItem value="postpaid">Postpaid</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Price (KES) *</Label><Input type="number" {...register("price")} /></div>
              <div><Label>Duration (days) *</Label><Input type="number" {...register("duration_days")} /></div>
              <div><Label>Download (Kbps)</Label><Input type="number" {...register("speed_down_kbps")} /></div>
              <div><Label>Upload (Kbps)</Label><Input type="number" {...register("speed_up_kbps")} /></div>
              <div className="col-span-2"><Label>Data Limit (MB, blank=unlimited)</Label><Input type="number" {...register("data_limit_mb")} /></div>
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
