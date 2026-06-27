import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useTenantId } from "@/lib/auth";
import { toast } from "sonner";
import { Wallet, TrendingUp, TrendingDown, Plus, Search, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/wallet/")({
  component: WalletPage,
});

function WalletPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ customer_id: "", amount: "", description: "Manual top-up" });

  const { data: tenantId } = useTenantId();

  const wallets = useQuery({
    queryKey: ["wallets", tenantId, search],
    queryFn: async () => {
      let q = supabase
        .from("wallets")
        .select("*, customers(full_name, phone)")
        .eq("tenant_id", tenantId!)
        .order("balance", { ascending: false });
      const { data, error } = await q;
      if (error) throw error;
      const all = data ?? [];
      if (!search) return all;
      return all.filter((w: any) =>
        w.customers?.full_name?.toLowerCase().includes(search.toLowerCase()) ||
        w.customers?.phone?.includes(search)
      );
    },
    enabled: !!tenantId,
  });

  const transactions = useQuery({
    queryKey: ["wallet-txns", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wallet_transactions")
        .select("*, customers(full_name, phone)")
        .eq("tenant_id", tenantId!)
        .order("created_at", { ascending: false })
        .limit(100);
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

  const topUp = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).rpc("fn_wallet_credit", {
        _customer_id: form.customer_id,
        _tenant_id: tenantId,
        _amount: Number(form.amount),
        _description: form.description,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Wallet topped up");
      qc.invalidateQueries({ queryKey: ["wallets"] });
      qc.invalidateQueries({ queryKey: ["wallet-txns"] });
      setOpen(false);
      setForm({ customer_id: "", amount: "", description: "Manual top-up" });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const totalBalance = wallets.data?.reduce((s: number, w: any) => s + Number(w.balance), 0) ?? 0;
  const totalCredits = transactions.data?.filter((t: any) => t.type === "credit").reduce((s: number, t: any) => s + Number(t.amount), 0) ?? 0;
  const totalDebits = transactions.data?.filter((t: any) => t.type === "debit").reduce((s: number, t: any) => s + Number(t.amount), 0) ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Wallet Management</h1>
          <p className="text-sm text-muted-foreground">Customer wallet balances and transactions</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => qc.invalidateQueries({ queryKey: ["wallets"] })}><RefreshCw className="h-4 w-4" /></Button>
          <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-2" />Top Up Wallet</Button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border border-border/60 bg-card p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs text-muted-foreground uppercase">Total Balances</div>
            <Wallet className="h-4 w-4 text-primary" />
          </div>
          <div className="text-2xl font-bold">KES {totalBalance.toLocaleString()}</div>
        </div>
        <div className="rounded-xl border border-border/60 bg-card p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs text-muted-foreground uppercase">Total Credits</div>
            <TrendingUp className="h-4 w-4 text-green-500" />
          </div>
          <div className="text-2xl font-bold text-green-500">KES {totalCredits.toLocaleString()}</div>
        </div>
        <div className="rounded-xl border border-border/60 bg-card p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs text-muted-foreground uppercase">Total Debits</div>
            <TrendingDown className="h-4 w-4 text-red-500" />
          </div>
          <div className="text-2xl font-bold text-red-500">KES {totalDebits.toLocaleString()}</div>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Wallet Balances */}
        <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/60">
            <h2 className="font-semibold text-sm">Customer Wallets</h2>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input className="pl-8 h-8 text-xs w-48" placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left">Customer</th>
                <th className="px-4 py-2 text-right">Balance</th>
              </tr>
            </thead>
            <tbody>
              {wallets.isLoading ? (
                <tr><td colSpan={2} className="px-4 py-8 text-center text-muted-foreground">Loading...</td></tr>
              ) : wallets.data?.length === 0 ? (
                <tr><td colSpan={2} className="px-4 py-8 text-center text-muted-foreground">No wallets yet</td></tr>
              ) : (wallets.data as any[])?.map((w: any) => (
                <tr key={w.id} className="border-t border-border/60 hover:bg-accent/30">
                  <td className="px-4 py-2.5">
                    <div className="font-medium text-sm">{w.customers?.full_name ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">{w.customers?.phone}</div>
                  </td>
                  <td className={`px-4 py-2.5 text-right font-semibold ${Number(w.balance) > 0 ? "text-green-500" : "text-muted-foreground"}`}>
                    KES {Number(w.balance).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Recent Transactions */}
        <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border/60">
            <h2 className="font-semibold text-sm">Recent Transactions</h2>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left">Customer</th>
                <th className="px-4 py-2 text-left">Type</th>
                <th className="px-4 py-2 text-right">Amount</th>
                <th className="px-4 py-2 text-right">Balance After</th>
              </tr>
            </thead>
            <tbody>
              {transactions.isLoading ? (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">Loading...</td></tr>
              ) : transactions.data?.length === 0 ? (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">No transactions</td></tr>
              ) : (transactions.data as any[])?.map((t: any) => (
                <tr key={t.id} className="border-t border-border/60 hover:bg-accent/30">
                  <td className="px-4 py-2">
                    <div className="text-sm font-medium">{t.customers?.full_name ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">{new Date(t.created_at).toLocaleDateString()}</div>
                  </td>
                  <td className="px-4 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs capitalize ${t.type === "credit" ? "bg-green-500/15 text-green-600" : "bg-red-500/15 text-red-600"}`}>{t.type}</span>
                  </td>
                  <td className={`px-4 py-2 text-right font-semibold ${t.type === "credit" ? "text-green-500" : "text-red-500"}`}>
                    {t.type === "credit" ? "+" : "-"}KES {Number(t.amount).toLocaleString()}
                  </td>
                  <td className="px-4 py-2 text-right text-sm">KES {Number(t.balance_after).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Top Up Customer Wallet</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Customer *</Label>
              <Select onValueChange={(v) => setForm((f) => ({ ...f, customer_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
                <SelectContent>{customers.data?.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.full_name} — {c.phone}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Amount (KES) *</Label><Input type="number" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} /></div>
            <div><Label>Description</Label><Input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => topUp.mutate()} disabled={!form.customer_id || !form.amount || topUp.isPending}>
              {topUp.isPending ? "Processing..." : "Top Up"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
