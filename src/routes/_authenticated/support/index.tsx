import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useTenantId } from "@/lib/auth";
import { toast } from "sonner";
import {
  Plus, MessageSquare, CheckCircle, Clock, Search, AlertTriangle, ArrowUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/support/")({
  component: SupportPage,
});

const schema = z.object({
  subject: z.string().min(3),
  description: z.string().optional(),
  type: z.string().min(1).default("support"),
  priority: z.string().min(1).default("medium"),
  customer_id: z.string().optional(),
  sla_hours: z.coerce.number().min(1).default(24),
});

type FormData = z.infer<typeof schema>;

const PRIORITY_COLORS: Record<string, string> = {
  low: "bg-blue-500/15 text-blue-600",
  medium: "bg-yellow-500/15 text-yellow-600",
  high: "bg-orange-500/15 text-orange-600",
  critical: "bg-red-500/15 text-red-600",
};

const STATUS_COLORS: Record<string, string> = {
  open: "bg-blue-500/15 text-blue-600",
  in_progress: "bg-yellow-500/15 text-yellow-600",
  resolved: "bg-green-500/15 text-green-600",
  closed: "bg-muted text-muted-foreground",
};

function SupportPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const tenantQuery = useTenantId();
  const tenantId = tenantQuery.data;
  const [open, setOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [replyMsg, setReplyMsg] = useState("");
  const [isInternal, setIsInternal] = useState(false);

  const tickets = useQuery({
    queryKey: ["tickets", tenantId, statusFilter, priorityFilter, search],
    queryFn: async () => {
      let q = supabase
        .from("tickets")
        .select("*, customers(full_name, phone), profiles!assigned_to(full_name)")
        .eq("tenant_id", tenantId!)
        .order("created_at", { ascending: false });
      if (statusFilter !== "all") q = q.eq("status", statusFilter);
      if (priorityFilter !== "all") q = q.eq("priority", priorityFilter);
      if (search) q = q.ilike("subject", `%${search}%`);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!tenantId,
  });

  const threadQuery = useQuery({
    queryKey: ["ticket-thread", detailId],
    queryFn: async () => {
      const [ticket, messages] = await Promise.all([
        supabase.from("tickets").select("*, customers(full_name, phone), profiles!assigned_to(full_name)").eq("id", detailId!).single(),
        supabase.from("ticket_messages").select("*, profiles(full_name)").eq("ticket_id", detailId!).order("created_at"),
      ]);
      return { ticket: ticket.data, messages: messages.data ?? [] };
    },
    enabled: !!detailId,
  });

  const customers = useQuery({
    queryKey: ["customers-list", tenantId],
    queryFn: async () => {
      const { data } = await supabase.from("customers").select("id,full_name,phone").eq("tenant_id", tenantId!).order("full_name");
      return data ?? [];
    },
    enabled: !!tenantId,
  });

  const agents = useQuery({
    queryKey: ["agents", tenantId],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id,full_name").eq("tenant_id", tenantId!).eq("is_active", true);
      return data ?? [];
    },
    enabled: !!tenantId,
  });

  const { register, handleSubmit, reset, setValue } = useForm<FormData>({ resolver: zodResolver(schema) as any });

  const save = useMutation({
    mutationFn: async (data: FormData) => {
      const { error } = await supabase.from("tickets").insert({ ...data, tenant_id: tenantId, status: "open" });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Ticket created"); qc.invalidateQueries({ queryKey: ["tickets"] }); setOpen(false); reset(); },
    onError: (e: any) => toast.error(e.message),
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const updates: any = { status };
      if (status === "resolved") updates.resolved_at = new Date().toISOString();
      if (status === "closed") updates.closed_at = new Date().toISOString();
      const { error } = await supabase.from("tickets").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Ticket updated"); qc.invalidateQueries({ queryKey: ["tickets"] }); qc.invalidateQueries({ queryKey: ["ticket-thread", detailId] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const escalate = useMutation({
    mutationFn: async (id: string) => {
      const t = tickets.data?.find((t) => t.id === id);
      const priorities = ["low", "medium", "high", "critical"];
      const next = priorities[Math.min(priorities.indexOf(t?.priority ?? "medium") + 1, 3)];
      const { error } = await supabase.from("tickets").update({ priority: next }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Priority escalated"); qc.invalidateQueries({ queryKey: ["tickets"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const assign = useMutation({
    mutationFn: async ({ id, userId }: { id: string; userId: string }) => {
      const { error } = await supabase.from("tickets").update({ assigned_to: userId, status: "in_progress" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Assigned"); qc.invalidateQueries({ queryKey: ["tickets"] }); qc.invalidateQueries({ queryKey: ["ticket-thread", detailId] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const addReply = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("ticket_messages").insert({ ticket_id: detailId, sender_id: user?.id, message: replyMsg, is_internal: isInternal });
      if (error) throw error;
      if (!isInternal) await updateStatus.mutateAsync({ id: detailId!, status: "in_progress" });
    },
    onSuccess: () => { toast.success("Reply sent"); setReplyMsg(""); qc.invalidateQueries({ queryKey: ["ticket-thread", detailId] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const stats = {
    open: tickets.data?.filter((t) => t.status === "open").length ?? 0,
    in_progress: tickets.data?.filter((t) => t.status === "in_progress").length ?? 0,
    resolved: tickets.data?.filter((t) => t.status === "resolved").length ?? 0,
    critical: tickets.data?.filter((t) => t.priority === "critical").length ?? 0,
  };

  function getSlaStatus(t: any): string {
    if (t.status === "resolved" || t.status === "closed") return "resolved";
    const created = new Date(t.created_at).getTime();
    const slaMs = (t.sla_hours ?? 24) * 3600000;
    const diff = Date.now() - created;
    if (diff > slaMs) return "breached";
    if (diff > slaMs * 0.8) return "warning";
    return "ok";
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Support Desk</h1>
          <p className="text-sm text-muted-foreground">Customer support tickets and issue tracking</p>
        </div>
        <Button onClick={() => { reset(); setOpen(true); }}><Plus className="h-4 w-4 mr-2" />New Ticket</Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={MessageSquare} label="Open" value={stats.open} color="text-blue-500" />
        <StatCard icon={Clock} label="In Progress" value={stats.in_progress} color="text-yellow-500" />
        <StatCard icon={CheckCircle} label="Resolved" value={stats.resolved} color="text-green-500" />
        <StatCard icon={AlertTriangle} label="Critical" value={stats.critical} color="text-red-500" />
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search subject..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
          </SelectContent>
        </Select>
        <Select value={priorityFilter} onValueChange={setPriorityFilter}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Priority</SelectItem>
            <SelectItem value="low">Low</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        {tickets.isLoading ? (
          <div className="text-center py-12 text-muted-foreground">Loading...</div>
        ) : tickets.data?.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground"><MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-30" />No tickets found</div>
        ) : tickets.data?.map((t) => {
          const sla = getSlaStatus(t);
          return (
            <div key={t.id} className={`rounded-xl border bg-card p-4 cursor-pointer hover:bg-accent/30 transition ${sla === "breached" ? "border-red-500/40" : "border-border/60"}`} onClick={() => setDetailId(t.id)}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="font-mono text-xs text-muted-foreground">{t.ticket_no}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs ${PRIORITY_COLORS[t.priority] ?? "bg-muted"}`}>{t.priority}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_COLORS[t.status] ?? "bg-muted"}`}>{t.status.replace("_", " ")}</span>
                    <span className="text-xs text-muted-foreground capitalize">{t.type}</span>
                    {sla === "breached" && <span className="rounded-full px-2 py-0.5 text-xs bg-red-500/15 text-red-600">SLA Breached</span>}
                    {sla === "warning" && <span className="rounded-full px-2 py-0.5 text-xs bg-yellow-500/15 text-yellow-600">SLA Warning</span>}
                  </div>
                  <div className="font-medium">{t.subject}</div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                    {(t as any).customers && <span>{(t as any).customers.full_name} · {(t as any).customers.phone}</span>}
                    {(t as any).profiles && <span>Assigned: {(t as any).profiles.full_name}</span>}
                    <span>{new Date(t.created_at).toLocaleString()}</span>
                  </div>
                </div>
                <div className="flex gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                  {t.priority !== "critical" && (
                    <button onClick={() => escalate.mutate(t.id)} className="text-xs rounded px-2 py-1 bg-orange-500/15 text-orange-600 hover:bg-orange-500/30 flex items-center gap-1"><ArrowUp className="h-3 w-3" />Escalate</button>
                  )}
                  {t.status === "open" && <Button size="sm" variant="outline" onClick={() => updateStatus.mutate({ id: t.id, status: "in_progress" })}>Start</Button>}
                  {t.status === "in_progress" && <Button size="sm" variant="outline" onClick={() => updateStatus.mutate({ id: t.id, status: "resolved" })}>Resolve</Button>}
                  {t.status === "resolved" && <Button size="sm" variant="outline" onClick={() => updateStatus.mutate({ id: t.id, status: "closed" })}>Close</Button>}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Ticket Thread */}
      <Dialog open={!!detailId} onOpenChange={(o) => !o && setDetailId(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          {threadQuery.isLoading ? <div className="py-12 text-center text-muted-foreground">Loading...</div> : threadQuery.data ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-sm text-muted-foreground">{threadQuery.data.ticket?.ticket_no}</span>
                  {threadQuery.data.ticket?.subject}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="flex gap-2 flex-wrap">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${PRIORITY_COLORS[threadQuery.data.ticket?.priority] ?? "bg-muted"}`}>{threadQuery.data.ticket?.priority}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_COLORS[threadQuery.data.ticket?.status] ?? "bg-muted"}`}>{threadQuery.data.ticket?.status?.replace("_", " ")}</span>
                  {(threadQuery.data.ticket as any)?.customers && <span className="text-xs text-muted-foreground">Customer: {(threadQuery.data.ticket as any).customers.full_name}</span>}
                </div>

                {threadQuery.data.ticket?.description && (
                  <div className="rounded-md bg-muted/30 p-3 text-sm">{threadQuery.data.ticket.description}</div>
                )}

                {/* Assign */}
                <div className="flex gap-2 items-center">
                  <span className="text-xs text-muted-foreground">Assign to:</span>
                  <Select onValueChange={(v) => assign.mutate({ id: detailId!, userId: v })}>
                    <SelectTrigger className="h-8 text-xs w-48"><SelectValue placeholder="Select agent" /></SelectTrigger>
                    <SelectContent>{agents.data?.map((a) => <SelectItem key={a.id} value={a.id}>{a.full_name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>

                {/* Thread */}
                <div className="space-y-3 max-h-64 overflow-y-auto">
                  {threadQuery.data.messages.map((m: any) => (
                    <div key={m.id} className={`rounded-md p-3 text-sm ${m.is_internal ? "bg-yellow-500/10 border border-yellow-500/30" : "bg-muted/30"}`}>
                      <div className="flex justify-between text-xs text-muted-foreground mb-1">
                        <span>{m.profiles?.full_name ?? "Agent"} {m.is_internal ? "· 🔒 Internal" : ""}</span>
                        <span>{new Date(m.created_at).toLocaleString()}</span>
                      </div>
                      <div>{m.message}</div>
                    </div>
                  ))}
                  {threadQuery.data.messages.length === 0 && <div className="text-xs text-muted-foreground text-center py-4">No messages yet</div>}
                </div>

                {/* Reply */}
                <div className="space-y-2">
                  <Textarea placeholder="Type reply..." value={replyMsg} onChange={(e) => setReplyMsg(e.target.value)} rows={3} />
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 text-xs cursor-pointer">
                      <input type="checkbox" checked={isInternal} onChange={(e) => setIsInternal(e.target.checked)} className="rounded" />
                      Internal note (not visible to customer)
                    </label>
                    <Button size="sm" onClick={() => addReply.mutate()} disabled={!replyMsg || addReply.isPending}>
                      {addReply.isPending ? "Sending..." : isInternal ? "Add Note" : "Send Reply"}
                    </Button>
                  </div>
                </div>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* New Ticket Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Support Ticket</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit((d) => save.mutate(d))} className="space-y-4">
            <div>
              <Label>Customer</Label>
              <Select onValueChange={(v) => setValue("customer_id", v)}>
                <SelectTrigger><SelectValue placeholder="Select customer (optional)" /></SelectTrigger>
                <SelectContent>{customers.data?.map((c) => <SelectItem key={c.id} value={c.id}>{c.full_name} — {c.phone}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Subject *</Label><Input {...register("subject")} /></div>
            <div><Label>Description</Label><Textarea {...register("description")} rows={3} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Type</Label>
                <Select defaultValue="support" onValueChange={(v) => setValue("type", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="support">Support</SelectItem>
                    <SelectItem value="billing">Billing</SelectItem>
                    <SelectItem value="installation">Installation</SelectItem>
                    <SelectItem value="complaint">Complaint</SelectItem>
                    <SelectItem value="network">Network Issue</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Priority</Label>
                <Select defaultValue="medium" onValueChange={(v) => setValue("priority", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>SLA (hours)</Label>
                <Select defaultValue="24" onValueChange={(v) => setValue("sla_hours", Number(v))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="4">4 hours</SelectItem>
                    <SelectItem value="8">8 hours</SelectItem>
                    <SelectItem value="24">24 hours</SelectItem>
                    <SelectItem value="48">48 hours</SelectItem>
                    <SelectItem value="72">72 hours</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={save.isPending}>{save.isPending ? "Creating..." : "Create Ticket"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color }: { icon: React.ComponentType<{ className?: string }>; label: string; value: number; color?: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs text-muted-foreground uppercase">{label}</div>
        <Icon className={`h-4 w-4 ${color ?? "text-muted-foreground"}`} />
      </div>
      <div className={`text-2xl font-bold ${color ?? ""}`}>{value}</div>
    </div>
  );
}
