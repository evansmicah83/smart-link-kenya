import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useTenantId } from "@/lib/auth";
import { toast } from "sonner";
import { Plus, Download, Printer, QrCode, Search, Trash2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/vouchers/")({
  component: VouchersPage,
});

function generateCode(prefix = "", length = 8): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const random = Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  return prefix ? `${prefix}-${random}` : random;
}

function VouchersPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [genOpen, setGenOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [tab, setTab] = useState("vouchers");
  const [genForm, setGenForm] = useState({ qty: 10, prefix: "", package_id: "", router_id: "", batch_name: "" });

  const { data: tenantId } = useTenantId();

  const vouchers = useQuery({
    queryKey: ["vouchers", tenantId, search, statusFilter],
    queryFn: async () => {
      let q = supabase.from("vouchers").select("*, packages(name, duration_days, speed_down_kbps, price), voucher_batches(name)").eq("tenant_id", tenantId!).order("created_at", { ascending: false }).limit(500);
      if (search) q = q.ilike("code", `%${search}%`);
      if (statusFilter !== "all") q = q.eq("status", statusFilter);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!tenantId,
  });

  const batches = useQuery({
    queryKey: ["voucher-batches", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase.from("voucher_batches").select("*").eq("tenant_id", tenantId!).order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!tenantId,
  });

  const packages = useQuery({
    queryKey: ["packages-hotspot", tenantId],
    queryFn: async () => {
      const { data } = await supabase.from("packages").select("id,name").eq("tenant_id", tenantId!).eq("type", "hotspot").eq("is_active", true);
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

  const generate = useMutation({
    mutationFn: async () => {
      const batchName = genForm.batch_name || `Batch-${Date.now()}`;
      const { data: batch, error: bErr } = await supabase.from("voucher_batches").insert({
        tenant_id: tenantId,
        name: batchName,
        prefix: genForm.prefix || null,
        quantity: genForm.qty,
        generated: genForm.qty,
        package_id: genForm.package_id || null,
        router_id: genForm.router_id || null,
        created_by: user?.id,
      }).select().single();
      if (bErr) throw bErr;

      const codes = Array.from({ length: genForm.qty }, () => ({
        tenant_id: tenantId,
        batch_id: batch.id,
        code: generateCode(genForm.prefix),
        package_id: genForm.package_id || null,
        router_id: genForm.router_id || null,
        status: "unused",
      }));
      const { error } = await supabase.from("vouchers").insert(codes);
      if (error) throw error;
      return batch;
    },
    onSuccess: () => {
      toast.success(`${genForm.qty} vouchers generated`);
      qc.invalidateQueries({ queryKey: ["vouchers"] });
      qc.invalidateQueries({ queryKey: ["voucher-batches"] });
      setGenOpen(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  function exportCSV() {
    const rows = vouchers.data ?? [];
    const csv = ["Code,Package,Status,Expires,Created",
      ...rows.map((v) => [v.code, (v as any).packages?.name ?? "", v.status, v.expires_at ?? "", new Date(v.created_at).toLocaleDateString()].join(","))
    ].join("\n");
    const a = document.createElement("a"); a.href = "data:text/csv," + encodeURIComponent(csv); a.download = "vouchers.csv"; a.click();
  }

  function printVouchers() {
    const rows = (vouchers.data ?? []).filter((v) => v.status === "unused").slice(0, 50);
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`<html><head><title>Vouchers</title><style>
      body{font-family:monospace;} .grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;padding:16px;}
      .card{border:1px dashed #ccc;padding:8px;text-align:center;border-radius:4px;}
      .code{font-size:16px;font-weight:bold;letter-spacing:2px;margin:4px 0;}
      .meta{font-size:10px;color:#666;}
    </style></head><body><div class="grid">${rows.map((v) => `<div class="card"><div class="meta">SmartLinkNet WiFi</div><div class="code">${v.code}</div><div class="meta">${(v as any).packages?.name ?? "Voucher"}</div></div>`).join("")}</div></body></html>`);
    win.print();
  }

  const stats = {
    total: vouchers.data?.length ?? 0,
    unused: vouchers.data?.filter((v) => v.status === "unused").length ?? 0,
    active: vouchers.data?.filter((v) => v.status === "active").length ?? 0,
    used: vouchers.data?.filter((v) => v.status === "used").length ?? 0,
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Vouchers</h1>
          <p className="text-sm text-muted-foreground">Generate and manage hotspot vouchers</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={printVouchers}><Printer className="h-4 w-4 mr-2" />Print</Button>
          <Button variant="outline" onClick={exportCSV}><Download className="h-4 w-4 mr-2" />Export CSV</Button>
          <Button onClick={() => setGenOpen(true)}><Plus className="h-4 w-4 mr-2" />Generate</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total", value: stats.total },
          { label: "Unused", value: stats.unused, color: "text-green-500" },
          { label: "Active", value: stats.active, color: "text-blue-500" },
          { label: "Used", value: stats.used, color: "text-muted-foreground" },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-border/60 bg-card p-4">
            <div className="text-xs text-muted-foreground uppercase">{s.label}</div>
            <div className={`text-2xl font-bold mt-1 ${s.color ?? ""}`}>{s.value}</div>
          </div>
        ))}
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="vouchers">Vouchers</TabsTrigger>
          <TabsTrigger value="batches">Batches ({batches.data?.length ?? 0})</TabsTrigger>
        </TabsList>

        <TabsContent value="vouchers">
          <div className="flex gap-3 mb-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input className="pl-9" placeholder="Search code..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="unused">Unused</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="used">Used</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={() => qc.invalidateQueries({ queryKey: ["vouchers"] })}><RefreshCw className="h-4 w-4" /></Button>
          </div>

          <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-left">Code</th>
                  <th className="px-4 py-3 text-left">Package</th>
                  <th className="px-4 py-3 text-left">Batch</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Expires</th>
                  <th className="px-4 py-3 text-left">Created</th>
                </tr>
              </thead>
              <tbody>
                {vouchers.isLoading ? (
                  <tr><td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">Loading...</td></tr>
                ) : vouchers.data?.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-12 text-center text-muted-foreground"><QrCode className="h-8 w-8 mx-auto mb-2 opacity-30" />No vouchers yet. Generate some to get started.</td></tr>
                ) : vouchers.data?.map((v) => (
                  <tr key={v.id} className="border-t border-border/60 hover:bg-accent/30">
                    <td className="px-4 py-3 font-mono font-bold tracking-widest text-sm">{v.code}</td>
                    <td className="px-4 py-3 text-xs">{(v as any).packages?.name ?? "—"}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{(v as any).voucher_batches?.name ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs capitalize ${
                        v.status === "unused" ? "bg-green-500/15 text-green-600" :
                        v.status === "active" ? "bg-blue-500/15 text-blue-600" :
                        v.status === "used" ? "bg-muted text-muted-foreground" :
                        "bg-red-500/15 text-red-600"
                      }`}>{v.status}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{v.expires_at ? new Date(v.expires_at).toLocaleDateString() : "—"}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(v.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="batches">
          <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-left">Batch Name</th>
                  <th className="px-4 py-3 text-left">Prefix</th>
                  <th className="px-4 py-3 text-left">Quantity</th>
                  <th className="px-4 py-3 text-left">Used</th>
                  <th className="px-4 py-3 text-left">Created</th>
                </tr>
              </thead>
              <tbody>
                {batches.isLoading ? (
                  <tr><td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">Loading...</td></tr>
                ) : batches.data?.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">No batches yet</td></tr>
                ) : batches.data?.map((b) => (
                  <tr key={b.id} className="border-t border-border/60 hover:bg-accent/30">
                    <td className="px-4 py-3 font-medium">{b.name}</td>
                    <td className="px-4 py-3 text-xs font-mono">{b.prefix ?? "—"}</td>
                    <td className="px-4 py-3">{b.quantity}</td>
                    <td className="px-4 py-3 text-muted-foreground">{b.used}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(b.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={genOpen} onOpenChange={setGenOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Generate Vouchers</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Batch Name</Label><Input value={genForm.batch_name} onChange={(e) => setGenForm((f) => ({ ...f, batch_name: e.target.value }))} placeholder="e.g. Weekend Promo" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Quantity (max 500)</Label><Input type="number" value={genForm.qty} min={1} max={500} onChange={(e) => setGenForm((f) => ({ ...f, qty: Number(e.target.value) }))} /></div>
              <div><Label>Code Prefix (optional)</Label><Input value={genForm.prefix} onChange={(e) => setGenForm((f) => ({ ...f, prefix: e.target.value.toUpperCase() }))} placeholder="e.g. VIP" maxLength={6} /></div>
            </div>
            <div>
              <Label>Package (optional)</Label>
              <Select onValueChange={(v) => setGenForm((f) => ({ ...f, package_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Select package" /></SelectTrigger>
                <SelectContent>{packages.data?.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Router (optional)</Label>
              <Select onValueChange={(v) => setGenForm((f) => ({ ...f, router_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Select router" /></SelectTrigger>
                <SelectContent>{routers.data?.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="rounded-md bg-muted/40 p-3 text-xs text-muted-foreground">
              Preview: <span className="font-mono font-bold">{genForm.prefix ? `${genForm.prefix}-XXXXXXXX` : "XXXXXXXX"}</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGenOpen(false)}>Cancel</Button>
            <Button onClick={() => generate.mutate()} disabled={generate.isPending}>
              {generate.isPending ? "Generating..." : `Generate ${genForm.qty} Vouchers`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
