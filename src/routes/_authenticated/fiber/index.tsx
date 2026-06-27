import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useTenantId } from "@/lib/auth";
import { toast } from "sonner";
import { Plus, MapPin, Calendar, CheckCircle, Clock, Edit } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

export const Route = createFileRoute("/_authenticated/fiber/")({
  component: FiberPage,
});

const schema = z.object({
  customer_id: z.string().min(1),
  type: z.string().min(1).default("fiber"),
  address: z.string().min(1),
  scheduled_at: z.string().optional(),
  notes: z.string().optional(),
  cost: z.coerce.number().min(0).default(0),
});

type FormData = z.infer<typeof schema>;

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-500/15 text-yellow-600",
  scheduled: "bg-blue-500/15 text-blue-600",
  in_progress: "bg-purple-500/15 text-purple-600",
  completed: "bg-green-500/15 text-green-600",
  cancelled: "bg-muted text-muted-foreground",
};

function FiberPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");

  const { data: tenantId } = useTenantId();

  const installations = useQuery({
    queryKey: ["installations", tenantId, statusFilter],
    queryFn: async () => {
      let q = supabase
        .from("installations")
        .select("*, customers(full_name, phone), profiles!assigned_to(full_name)")
        .eq("tenant_id", tenantId!)
        .order("created_at", { ascending: false });
      if (statusFilter !== "all") q = q.eq("status", statusFilter);
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

  const { register, handleSubmit, reset, setValue, formState: { errors } } = useForm<FormData>({ resolver: zodResolver(schema) as any });

  const save = useMutation({
    mutationFn: async (data: FormData) => {
      const { error } = await supabase.from("installations").insert({ ...data, tenant_id: tenantId, status: "pending" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Installation request created");
      qc.invalidateQueries({ queryKey: ["installations"] });
      setOpen(false); reset();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const updates: any = { status };
      if (status === "completed") updates.completed_at = new Date().toISOString();
      const { error } = await supabase.from("installations").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Status updated"); qc.invalidateQueries({ queryKey: ["installations"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const stats = {
    pending: installations.data?.filter((i) => i.status === "pending").length ?? 0,
    scheduled: installations.data?.filter((i) => i.status === "scheduled").length ?? 0,
    completed: installations.data?.filter((i) => i.status === "completed").length ?? 0,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Fiber & Installations</h1>
          <p className="text-sm text-muted-foreground">Manage installation requests and deployment</p>
        </div>
        <Button onClick={() => { reset(); setOpen(true); }}><Plus className="h-4 w-4 mr-2" />New Installation</Button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border border-border/60 bg-card p-4">
          <div className="text-xs text-muted-foreground uppercase mb-1">Pending</div>
          <div className="text-2xl font-bold text-yellow-500">{stats.pending}</div>
        </div>
        <div className="rounded-xl border border-border/60 bg-card p-4">
          <div className="text-xs text-muted-foreground uppercase mb-1">Scheduled</div>
          <div className="text-2xl font-bold text-blue-500">{stats.scheduled}</div>
        </div>
        <div className="rounded-xl border border-border/60 bg-card p-4">
          <div className="text-xs text-muted-foreground uppercase mb-1">Completed</div>
          <div className="text-2xl font-bold text-green-500">{stats.completed}</div>
        </div>
      </div>

      <div className="flex gap-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="scheduled">Scheduled</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-3">
        {installations.isLoading ? (
          <div className="text-center py-12 text-muted-foreground">Loading...</div>
        ) : installations.data?.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">No installations found</div>
        ) : installations.data?.map((inst) => (
          <div key={inst.id} className="rounded-xl border border-border/60 bg-card p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className={`rounded-full px-2 py-0.5 text-xs capitalize ${STATUS_COLORS[inst.status] ?? "bg-muted"}`}>{inst.status.replace("_", " ")}</span>
                  <span className="text-xs text-muted-foreground capitalize">{inst.type}</span>
                </div>
                <div className="font-medium">{(inst as any).customers?.full_name ?? "—"}</div>
                <div className="text-xs text-muted-foreground">{(inst as any).customers?.phone}</div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                  <MapPin className="h-3 w-3" />{inst.address}
                </div>
                {inst.scheduled_at && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                    <Calendar className="h-3 w-3" />{new Date(inst.scheduled_at).toLocaleString()}
                  </div>
                )}
                {inst.notes && <div className="text-xs text-muted-foreground mt-1">{inst.notes}</div>}
              </div>
              <div className="flex gap-2 shrink-0">
                {inst.status === "pending" && (
                  <Button size="sm" variant="outline" onClick={() => updateStatus.mutate({ id: inst.id, status: "scheduled" })}>Schedule</Button>
                )}
                {inst.status === "scheduled" && (
                  <Button size="sm" variant="outline" onClick={() => updateStatus.mutate({ id: inst.id, status: "in_progress" })}>Start</Button>
                )}
                {inst.status === "in_progress" && (
                  <Button size="sm" onClick={() => updateStatus.mutate({ id: inst.id, status: "completed" })}>Complete</Button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Installation Request</DialogTitle></DialogHeader>
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
              <Label>Type</Label>
              <Select defaultValue="fiber" onValueChange={(v) => setValue("type", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="fiber">Fiber</SelectItem>
                  <SelectItem value="wireless">Wireless</SelectItem>
                  <SelectItem value="pppoe">PPPoE</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Address *</Label><Input {...register("address")} /></div>
            <div><Label>Scheduled Date/Time</Label><Input type="datetime-local" {...register("scheduled_at")} /></div>
            <div><Label>Installation Cost (KES)</Label><Input type="number" {...register("cost")} /></div>
            <div><Label>Notes</Label><Textarea {...register("notes")} rows={2} /></div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={save.isPending}>{save.isPending ? "Creating..." : "Create"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
