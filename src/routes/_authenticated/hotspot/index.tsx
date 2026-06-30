import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useTenantId } from "@/lib/auth";
import { toast } from "sonner";
import { Plus, Wifi, Activity, QrCode, Printer, Download, RefreshCw, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { kickSession } from "@/lib/mikrotik";

export const Route = createFileRoute("/_authenticated/hotspot/")({
  component: HotspotPage,
});

function genCode(prefix = "", length = 8) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const r = Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  return prefix ? `${prefix}-${r}` : r;
}

function fmtBytes(b: number) {
  if (!b) return "0B";
  if (b < 1024) return `${b}B`;
  if (b < 1048576) return `${(b / 1024).toFixed(1)}KB`;
  return `${(b / 1048576).toFixed(1)}MB`;
}

function HotspotPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState("sessions");
  const [vOpen, setVOpen] = useState(false);
  const [disconnectTarget, setDisconnectTarget] = useState<{ dbId: string; routerId?: string; sessionId: string } | null>(null);
  const [qty, setQty] = useState(10);
  const [pfx, setPfx] = useState("");
  const [selPkg, setSelPkg] = useState("");
  const [selRouter, setSelRouter] = useState("");

  const { data: tid } = useTenantId();

  const sessions = useQuery({
    queryKey: ["sessions", tid],
    queryFn: async () => {
      const { data } = await supabase.from("sessions").select("*, customers(full_name)").eq("tenant_id", tid!).is("ended_at", null).order("started_at", { ascending: false });
      return data ?? [];
    },
    enabled: !!tid,
    refetchInterval: 15000,
  });

  const vouchers = useQuery({
    queryKey: ["vouchers", tid],
    queryFn: async () => {
      const { data } = await supabase.from("vouchers").select("*, packages(name, duration_days, price), voucher_batches(name)").eq("tenant_id", tid!).order("created_at", { ascending: false }).limit(300);
      return data ?? [];
    },
    enabled: !!tid,
  });

  const packages = useQuery({
    queryKey: ["packages-hotspot", tid],
    queryFn: async () => {
      const { data } = await supabase.from("packages").select("id,name,price").eq("tenant_id", tid!).eq("type", "hotspot").eq("is_active", true);
      return data ?? [];
    },
    enabled: !!tid,
  });

  const routers = useQuery({
    queryKey: ["routers-list", tid],
    queryFn: async () => {
      const { data } = await supabase.from("routers").select("id,name").eq("tenant_id", tid!).eq("is_active", true);
      return data ?? [];
    },
    enabled: !!tid,
  });

  const generate = useMutation({
    mutationFn: async () => {
      const bname = `Batch-${new Date().toISOString().slice(0, 10)}`;
      const { data: batch, error: bErr } = await supabase.from("voucher_batches").insert({
        tenant_id: tid, name: bname, prefix: pfx || null, quantity: qty, generated: qty,
        package_id: selPkg || null, router_id: selRouter || null, created_by: user?.id,
      } as any).select().single();
      if (bErr) throw bErr;
      const codes = Array.from({ length: qty }, () => ({
        tenant_id: tid, batch_id: batch.id, code: genCode(pfx),
        package_id: selPkg || null, router_id: selRouter || null, status: "unused",
      }));
      const { error } = await supabase.from("vouchers").insert(codes as any);
      if (error) throw error;
    },
    onSuccess: () => { toast.success(`${qty} vouchers generated`); qc.invalidateQueries({ queryKey: ["vouchers"] }); setVOpen(false); },
    onError: (e: any) => toast.error(e.message),
  });

  const disconnect = useMutation({
    mutationFn: async ({ dbId, routerId, sessionId }: { dbId: string; routerId?: string; sessionId: string }) => {
      if (routerId) { try { await kickSession(routerId, sessionId); } catch {} }
      await supabase.from("sessions").update({ ended_at: new Date().toISOString(), terminated_by: "admin" } as any).eq("id", dbId);
    },
    onSuccess: () => { toast.success("Session disconnected"); qc.invalidateQueries({ queryKey: ["sessions"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  function exportCSV() {
    const csv = ["Code,Package,Status,Created", ...(vouchers.data ?? []).map((v: any) => [v.code, v.packages?.name ?? "", v.status, new Date(v.created_at).toLocaleDateString()].join(","))].join("\n");
    const a = document.createElement("a"); a.href = "data:text/csv," + encodeURIComponent(csv); a.download = "vouchers.csv"; a.click();
  }

  function printVouchers() {
    const rows = (vouchers.data ?? []).filter((v: any) => v.status === "unused").slice(0, 100);
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`<html><head><title>Vouchers</title><style>
    body{font-family:monospace;padding:16px;} .grid{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;}
    .card{border:1px dashed #999;padding:8px;text-align:center;border-radius:4px;}
    .code{font-size:15px;font-weight:bold;letter-spacing:2px;margin:4px 0;} .meta{font-size:9px;color:#666;}
    </style></head><body><div class="grid">${rows.map((v: any) =>
      `<div class="card"><div class="meta">SmartLinkNet WiFi</div><div class="code">${v.code}</div><div class="meta">${v.packages?.name ?? "Voucher"}</div></div>`
    ).join("")}</div></body></html>`);
    win.print();
  }

  const stats = { sessions: sessions.data?.length ?? 0, unused: (vouchers.data ?? []).filter((v: any) => v.status === "unused").length, active: (vouchers.data ?? []).filter((v: any) => v.status === "active").length, used: (vouchers.data ?? []).filter((v: any) => v.status === "used").length };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div><h1 className="text-2xl font-semibold">Hotspot</h1><p className="text-sm text-muted-foreground">Sessions, vouchers and hotspot management</p></div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={printVouchers}><Printer className="h-4 w-4 mr-2" />Print</Button>
          <Button variant="outline" onClick={exportCSV}><Download className="h-4 w-4 mr-2" />Export</Button>
          <Button onClick={() => setVOpen(true)}><Plus className="h-4 w-4 mr-2" />Generate Vouchers</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat icon={Activity} label="Active Sessions" value={stats.sessions} color="text-green-500" />
        <Stat icon={QrCode} label="Unused" value={stats.unused} />
        <Stat icon={Wifi} label="Active" value={stats.active} color="text-blue-500" />
        <Stat icon={QrCode} label="Used" value={stats.used} color="text-muted-foreground" />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <TabsList>
            <TabsTrigger value="sessions">Live Sessions</TabsTrigger>
            <TabsTrigger value="vouchers">Vouchers ({(vouchers.data ?? []).length})</TabsTrigger>
          </TabsList>
          <Button variant="outline" size="sm" onClick={() => { qc.invalidateQueries({ queryKey: ["sessions"] }); qc.invalidateQueries({ queryKey: ["vouchers"] }); }}><RefreshCw className="h-4 w-4" /></Button>
        </div>

        <TabsContent value="sessions">
          <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-left">User</th><th className="px-4 py-3 text-left">IP / MAC</th>
                  <th className="px-4 py-3 text-left">Started</th><th className="px-4 py-3 text-left">In</th>
                  <th className="px-4 py-3 text-left">Out</th><th className="px-4 py-3 text-left">Action</th>
                </tr>
              </thead>
              <tbody>
                {sessions.isLoading ? <tr><td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">Loading...</td></tr>
                : sessions.data?.length === 0 ? <tr><td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">No active sessions</td></tr>
                : sessions.data?.map((s: any) => (
                  <tr key={s.id} className="border-t border-border/60 hover:bg-accent/30">
                    <td className="px-4 py-3 font-medium">{s.customers?.full_name ?? s.username ?? "Guest"}</td>
                    <td className="px-4 py-3 text-xs font-mono text-muted-foreground"><div>{s.ip_address ?? "—"}</div><div>{s.mac_address ?? "—"}</div></td>
                    <td className="px-4 py-3 text-xs">{new Date(s.started_at).toLocaleTimeString()}</td>
                    <td className="px-4 py-3 text-xs">{fmtBytes(s.bytes_in ?? 0)}</td>
                    <td className="px-4 py-3 text-xs">{fmtBytes(s.bytes_out ?? 0)}</td>
                    <td className="px-4 py-3">
                      <button onClick={() => setDisconnectTarget({ dbId: s.id, routerId: s.router_id, sessionId: s.id })} className="text-muted-foreground hover:text-destructive"><UserX className="h-4 w-4" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="vouchers">
          <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-left">Code</th><th className="px-4 py-3 text-left">Package</th>
                  <th className="px-4 py-3 text-left">Batch</th><th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Created</th>
                </tr>
              </thead>
              <tbody>
                {vouchers.isLoading ? <tr><td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">Loading...</td></tr>
                : vouchers.data?.length === 0 ? <tr><td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">No vouchers yet. Generate some to get started.</td></tr>
                : vouchers.data?.map((v: any) => (
                  <tr key={v.id} className="border-t border-border/60 hover:bg-accent/30">
                    <td className="px-4 py-3 font-mono font-bold tracking-widest">{v.code}</td>
                    <td className="px-4 py-3 text-xs">{v.packages?.name ?? "—"}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{v.voucher_batches?.name ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs capitalize ${v.status === "unused" ? "bg-green-500/15 text-green-600" : v.status === "active" ? "bg-blue-500/15 text-blue-600" : v.status === "used" ? "bg-muted text-muted-foreground" : "bg-red-500/15 text-red-600"}`}>{v.status}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(v.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={!!disconnectTarget} onOpenChange={(o) => { if (!o) setDisconnectTarget(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Disconnect Session</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Are you sure you want to forcefully disconnect this session?</p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDisconnectTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => { disconnect.mutate(disconnectTarget!); setDisconnectTarget(null); }} disabled={disconnect.isPending}>Disconnect</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={vOpen} onOpenChange={setVOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Generate Vouchers</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Quantity (max 500)</Label><Input type="number" value={qty} min={1} max={500} onChange={(e) => setQty(Number(e.target.value))} /></div>
              <div><Label>Prefix (optional)</Label><Input value={pfx} onChange={(e) => setPfx(e.target.value.toUpperCase())} placeholder="VIP" maxLength={6} /></div>
            </div>
            <div><Label>Package</Label>
              <Select onValueChange={setSelPkg}><SelectTrigger><SelectValue placeholder="Any package" /></SelectTrigger>
                <SelectContent>{packages.data?.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name} — KES {Number(p.price).toLocaleString()}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Router</Label>
              <Select onValueChange={setSelRouter}><SelectTrigger><SelectValue placeholder="Any router" /></SelectTrigger>
                <SelectContent>{routers.data?.map((r: any) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="rounded-md bg-muted/40 p-3 text-xs text-muted-foreground">Code format: <span className="font-mono font-bold">{pfx ? `${pfx}-XXXXXXXX` : "XXXXXXXX"}</span></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVOpen(false)}>Cancel</Button>
            <Button onClick={() => generate.mutate()} disabled={generate.isPending}>{generate.isPending ? "Generating..." : `Generate ${qty}`}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Stat({ icon: Icon, label, value, color }: { icon: React.ComponentType<{ className?: string }>; label: string; value: number; color?: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card p-4">
      <div className="flex items-center justify-between mb-2"><div className="text-xs text-muted-foreground uppercase">{label}</div><Icon className={`h-4 w-4 ${color ?? "text-muted-foreground"}`} /></div>
      <div className={`text-2xl font-bold ${color ?? ""}`}>{value}</div>
    </div>
  );
}
