import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useTenantId } from "@/lib/auth";
import { toast } from "sonner";
import {
  Plus, Search, Eye, Edit, Trash2, Phone, Mail, MapPin, Users,
  StickyNote, Wifi, Download, FileText, ChevronDown, ChevronUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

export const Route = createFileRoute("/_authenticated/customers/")({
  component: CustomersPage,
});

const schema = z.object({
  full_name: z.string().min(2),
  phone: z.string().min(9),
  email: z.string().email().optional().or(z.literal("")),
  national_id: z.string().optional(),
  kra_pin: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  county: z.string().optional(),
  category: z.string().default("residential"),
  status: z.string().default("active"),
  notes: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-500/15 text-green-600",
  suspended: "bg-yellow-500/15 text-yellow-600",
  disconnected: "bg-red-500/15 text-red-600",
  prospect: "bg-blue-500/15 text-blue-600",
};

function CustomersPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: tenantId } = useTenantId();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const customers = useQuery({
    queryKey: ["customers", tenantId, search, statusFilter, categoryFilter],
    queryFn: async () => {
      let q = supabase.from("customers").select("*").eq("tenant_id", tenantId!).order("created_at", { ascending: false });
      if (search) q = q.or(`full_name.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%,national_id.ilike.%${search}%`);
      if (statusFilter !== "all") q = q.eq("status", statusFilter);
      if (categoryFilter !== "all") q = q.eq("category", categoryFilter);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!tenantId,
  });

  const detail = useQuery({
    queryKey: ["customer-detail", detailId],
    queryFn: async () => {
      const [cust, subs, payments, notes] = await Promise.all([
        supabase.from("customers").select("*").eq("id", detailId!).single(),
        supabase.from("subscriptions").select("*, packages(name, type, price)").eq("customer_id", detailId!).order("created_at", { ascending: false }),
        supabase.from("payments").select("*").eq("customer_id", detailId!).order("created_at", { ascending: false }).limit(10),
        supabase.from("customer_notes").select("*, profiles(full_name)").eq("customer_id", detailId!).order("created_at", { ascending: false }),
      ]);
      return { customer: cust.data, subscriptions: subs.data ?? [], payments: payments.data ?? [], notes: notes.data ?? [] };
    },
    enabled: !!detailId,
  });

  const [newNote, setNewNote] = useState("");

  const { register, handleSubmit, reset, setValue, formState: { errors } } = useForm<FormData>({ resolver: zodResolver(schema) as any });

  const save = useMutation({
    mutationFn: async (data: FormData) => {
      if (editing) {
        const { error } = await supabase.from("customers").update(data).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("customers").insert({ ...data, tenant_id: tenantId });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Customer updated" : "Customer added");
      qc.invalidateQueries({ queryKey: ["customers"] });
      setOpen(false); reset(); setEditing(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("customers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Customer deleted"); qc.invalidateQueries({ queryKey: ["customers"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const addNote = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("customer_notes").insert({ customer_id: detailId, tenant_id: tenantId, note: newNote, created_by: user?.id });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Note added"); setNewNote(""); qc.invalidateQueries({ queryKey: ["customer-detail", detailId] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("customers").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Status updated"); qc.invalidateQueries({ queryKey: ["customers"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  function openEdit(c: any) {
    setEditing(c);
    Object.keys(schema.shape).forEach((k) => setValue(k as any, c[k] ?? ""));
    setOpen(true);
  }

  function exportCSV() {
    const rows = customers.data ?? [];
    const header = ["Name", "Phone", "Email", "National ID", "City", "County", "Category", "Status", "Joined"];
    const csv = [header, ...rows.map((c) => [c.full_name, c.phone, c.email ?? "", c.national_id ?? "", c.city ?? "", c.county ?? "", c.category, c.status, new Date(c.created_at).toLocaleDateString()])].map((r) => r.join(",")).join("\n");
    const a = document.createElement("a"); a.href = "data:text/csv," + encodeURIComponent(csv); a.download = "customers.csv"; a.click();
  }

  const stats = {
    total: customers.data?.length ?? 0,
    active: customers.data?.filter((c) => c.status === "active").length ?? 0,
    suspended: customers.data?.filter((c) => c.status === "suspended").length ?? 0,
    prospects: customers.data?.filter((c) => c.status === "prospect").length ?? 0,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Customers</h1>
          <p className="text-sm text-muted-foreground">Manage your customer base and CRM</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportCSV}><Download className="h-4 w-4 mr-2" />Export CSV</Button>
          <Button onClick={() => { setEditing(null); reset(); setOpen(true); }}><Plus className="h-4 w-4 mr-2" />Add Customer</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total", value: stats.total },
          { label: "Active", value: stats.active, color: "text-green-500" },
          { label: "Suspended", value: stats.suspended, color: "text-yellow-500" },
          { label: "Prospects", value: stats.prospects, color: "text-blue-500" },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-border/60 bg-card p-4">
            <div className="text-xs text-muted-foreground uppercase">{s.label}</div>
            <div className={`text-2xl font-bold mt-1 ${s.color ?? ""}`}>{s.value}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search name, phone, email, ID..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="suspended">Suspended</SelectItem>
            <SelectItem value="disconnected">Disconnected</SelectItem>
            <SelectItem value="prospect">Prospect</SelectItem>
          </SelectContent>
        </Select>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            <SelectItem value="residential">Residential</SelectItem>
            <SelectItem value="business">Business</SelectItem>
            <SelectItem value="hotel">Hotel</SelectItem>
            <SelectItem value="school">School</SelectItem>
            <SelectItem value="estate">Estate</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-xl border border-border/60 bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3 text-left">Customer</th>
              <th className="px-4 py-3 text-left">Contact</th>
              <th className="px-4 py-3 text-left">Location</th>
              <th className="px-4 py-3 text-left">Category</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-left">Joined</th>
              <th className="px-4 py-3 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {customers.isLoading ? (
              <tr><td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">Loading...</td></tr>
            ) : customers.data?.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-12 text-center text-muted-foreground"><Users className="h-8 w-8 mx-auto mb-2 opacity-30" />No customers found</td></tr>
            ) : customers.data?.map((c) => (
              <tr key={c.id} className="border-t border-border/60 hover:bg-accent/30">
                <td className="px-4 py-3">
                  <div className="font-medium">{c.full_name}</div>
                  <div className="text-xs text-muted-foreground font-mono">{c.customer_no ?? c.id.slice(0, 8)}</div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1 text-xs"><Phone className="h-3 w-3" />{c.phone}</div>
                  {c.email && <div className="flex items-center gap-1 text-xs text-muted-foreground"><Mail className="h-3 w-3" />{c.email}</div>}
                </td>
                <td className="px-4 py-3">
                  {c.city && <div className="flex items-center gap-1 text-xs"><MapPin className="h-3 w-3" />{c.city}{c.county ? `, ${c.county}` : ""}</div>}
                </td>
                <td className="px-4 py-3 capitalize text-xs">{c.category}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs capitalize ${STATUS_COLORS[c.status] ?? "bg-muted"}`}>{c.status}</span>
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(c.created_at).toLocaleDateString()}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-1">
                    <button onClick={() => setDetailId(c.id)} className="text-muted-foreground hover:text-primary p-1"><Eye className="h-4 w-4" /></button>
                    <button onClick={() => openEdit(c)} className="text-muted-foreground hover:text-foreground p-1"><Edit className="h-4 w-4" /></button>
                    {c.status === "active" ? (
                      <button onClick={() => updateStatus.mutate({ id: c.id, status: "suspended" })} className="text-xs rounded px-1.5 py-0.5 bg-yellow-500/15 text-yellow-600 hover:bg-yellow-500/30">Suspend</button>
                    ) : (
                      <button onClick={() => updateStatus.mutate({ id: c.id, status: "active" })} className="text-xs rounded px-1.5 py-0.5 bg-green-500/15 text-green-600 hover:bg-green-500/30">Activate</button>
                    )}
                    <button onClick={() => setDeleteId(c.id)} className="text-muted-foreground hover:text-destructive p-1"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={!!deleteId} onOpenChange={(o) => { if (!o) setDeleteId(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Delete Customer</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Are you sure you want to delete this customer? All their data will be permanently removed.</p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => { remove.mutate(deleteId!); setDeleteId(null); }} disabled={remove.isPending}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Customer Detail Dialog */}
      <Dialog open={!!detailId} onOpenChange={(o) => !o && setDetailId(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          {detail.isLoading ? (
            <div className="py-12 text-center text-muted-foreground">Loading...</div>
          ) : detail.data ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {detail.data.customer?.full_name}
                  <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_COLORS[detail.data.customer?.status] ?? "bg-muted"}`}>{detail.data.customer?.status}</span>
                </DialogTitle>
              </DialogHeader>
              <Tabs defaultValue="info">
                <TabsList>
                  <TabsTrigger value="info">Info</TabsTrigger>
                  <TabsTrigger value="subscriptions">Subscriptions ({detail.data.subscriptions.length})</TabsTrigger>
                  <TabsTrigger value="payments">Payments ({detail.data.payments.length})</TabsTrigger>
                  <TabsTrigger value="notes">Notes ({detail.data.notes.length})</TabsTrigger>
                </TabsList>
                <TabsContent value="info" className="space-y-3 mt-3">
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    {[
                      ["Phone", detail.data.customer?.phone],
                      ["Email", detail.data.customer?.email],
                      ["National ID", detail.data.customer?.national_id],
                      ["KRA PIN", detail.data.customer?.kra_pin],
                      ["City", detail.data.customer?.city],
                      ["County", detail.data.customer?.county],
                      ["Category", detail.data.customer?.category],
                      ["Customer No", detail.data.customer?.customer_no],
                    ].map(([label, val]) => val ? (
                      <div key={label} className="rounded-md bg-muted/30 p-2">
                        <div className="text-xs text-muted-foreground">{label}</div>
                        <div className="font-medium mt-0.5">{val}</div>
                      </div>
                    ) : null)}
                  </div>
                  {detail.data.customer?.address && <div className="rounded-md bg-muted/30 p-2 text-sm"><div className="text-xs text-muted-foreground">Address</div><div className="mt-0.5">{detail.data.customer.address}</div></div>}
                </TabsContent>
                <TabsContent value="subscriptions" className="mt-3">
                  {detail.data.subscriptions.length === 0 ? <div className="text-sm text-muted-foreground text-center py-6">No subscriptions</div> : (
                    <div className="space-y-2">
                      {detail.data.subscriptions.map((s: any) => (
                        <div key={s.id} className="rounded-md border border-border/60 p-3 text-sm flex items-center justify-between">
                          <div>
                            <div className="font-medium">{s.packages?.name} <span className="text-xs text-muted-foreground capitalize">({s.type})</span></div>
                            <div className="text-xs text-muted-foreground">KES {Number(s.packages?.price ?? 0).toLocaleString()} · Expires: {s.expires_at ? new Date(s.expires_at).toLocaleDateString() : "—"}</div>
                          </div>
                          <span className={`rounded-full px-2 py-0.5 text-xs capitalize ${s.status === "active" ? "bg-green-500/15 text-green-600" : "bg-yellow-500/15 text-yellow-600"}`}>{s.status}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>
                <TabsContent value="payments" className="mt-3">
                  {detail.data.payments.length === 0 ? <div className="text-sm text-muted-foreground text-center py-6">No payments</div> : (
                    <div className="space-y-2">
                      {detail.data.payments.map((p: any) => (
                        <div key={p.id} className="rounded-md border border-border/60 p-3 text-sm flex items-center justify-between">
                          <div>
                            <div className="font-medium">KES {Number(p.amount).toLocaleString()} <span className="text-xs text-muted-foreground capitalize">via {p.method}</span></div>
                            <div className="text-xs text-muted-foreground">{new Date(p.created_at).toLocaleString()}</div>
                          </div>
                          <span className={`rounded-full px-2 py-0.5 text-xs capitalize ${p.status === "completed" ? "bg-green-500/15 text-green-600" : "bg-yellow-500/15 text-yellow-600"}`}>{p.status}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>
                <TabsContent value="notes" className="mt-3 space-y-3">
                  <div className="flex gap-2">
                    <Textarea placeholder="Add a note..." value={newNote} onChange={(e) => setNewNote(e.target.value)} rows={2} className="flex-1" />
                    <Button onClick={() => addNote.mutate()} disabled={!newNote || addNote.isPending} className="self-end">Add</Button>
                  </div>
                  {detail.data.notes.map((n: any) => (
                    <div key={n.id} className="rounded-md border border-border/60 p-3 text-sm">
                      <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                        <span>{n.profiles?.full_name ?? "Agent"}</span>
                        <span>{new Date(n.created_at).toLocaleString()}</span>
                      </div>
                      <div>{n.note}</div>
                    </div>
                  ))}
                </TabsContent>
              </Tabs>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Add/Edit Customer Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{editing ? "Edit Customer" : "Add Customer"}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit((d) => save.mutate(d))} className="grid grid-cols-2 gap-4">
            <div><Label>Full Name *</Label><Input {...register("full_name")} />{errors.full_name && <p className="text-xs text-destructive mt-1">{errors.full_name.message}</p>}</div>
            <div><Label>Phone *</Label><Input {...register("phone")} />{errors.phone && <p className="text-xs text-destructive mt-1">{errors.phone.message}</p>}</div>
            <div><Label>Email</Label><Input {...register("email")} /></div>
            <div><Label>National ID</Label><Input {...register("national_id")} /></div>
            <div><Label>KRA PIN</Label><Input {...register("kra_pin")} /></div>
            <div><Label>City</Label><Input {...register("city")} /></div>
            <div><Label>County</Label><Input {...register("county")} /></div>
            <div><Label>Address</Label><Input {...register("address")} /></div>
            <div>
              <Label>Category</Label>
              <Select defaultValue={editing?.category ?? "residential"} onValueChange={(v) => setValue("category", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["residential", "business", "hotel", "school", "university", "estate", "cyber_cafe", "corporate"].map((c) => <SelectItem key={c} value={c} className="capitalize">{c.replace("_", " ")}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Status</Label>
              <Select defaultValue={editing?.status ?? "active"} onValueChange={(v) => setValue("status", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="suspended">Suspended</SelectItem>
                  <SelectItem value="disconnected">Disconnected</SelectItem>
                  <SelectItem value="prospect">Prospect</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2"><Label>Notes</Label><Textarea {...register("notes")} rows={2} /></div>
            <div className="col-span-2 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={save.isPending}>{save.isPending ? "Saving..." : "Save"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
