import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useTenantId } from "@/lib/auth";
import { toast } from "sonner";
import {
  Plus, Receipt, TrendingUp, AlertCircle, CreditCard, Download,
  Wallet, FileText, TrendingDown, RefreshCw, Smartphone,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { initiateStkPush, formatPhone } from "@/lib/mpesa";

export const Route = createFileRoute("/_authenticated/billing/")({
  component: BillingPage,
});

const paymentSchema = z.object({
  customer_id: z.string().min(1, "Customer required"),
  amount: z.coerce.number().min(1, "Amount required"),
  method: z.string().min(1).default("mpesa"),
  phone: z.string().optional(),
  reference: z.string().optional(),
  notes: z.string().optional(),
});

const invoiceSchema = z.object({
  customer_id: z.string().min(1),
  description: z.string().min(1),
  amount: z.coerce.number().min(1),
  due_date: z.string().optional(),
  notes: z.string().optional(),
});

const expenseSchema = z.object({
  category: z.string().min(1),
  description: z.string().min(1),
  amount: z.coerce.number().min(1),
  date: z.string().min(1).default(() => new Date().toISOString().split("T")[0]),
});

type PaymentForm = z.infer<typeof paymentSchema>;
type InvoiceForm = z.infer<typeof invoiceSchema>;
type ExpenseForm = z.infer<typeof expenseSchema>;

const STATUS_COLORS: Record<string, string> = {
  completed: "bg-green-500/15 text-green-600",
  pending: "bg-yellow-500/15 text-yellow-600",
  failed: "bg-red-500/15 text-red-600",
  refunded: "bg-blue-500/15 text-blue-600",
  paid: "bg-green-500/15 text-green-600",
  unpaid: "bg-red-500/15 text-red-600",
  partial: "bg-yellow-500/15 text-yellow-600",
  overdue: "bg-red-500/15 text-red-600",
};

function BillingPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: tenantId } = useTenantId();
  const [payOpen, setPayOpen] = useState(false);
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [stkLoading, setStkLoading] = useState(false);
  const [tab, setTab] = useState("payments");

  const payments = useQuery({
    queryKey: ["payments", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select("*, customers(full_name, phone)")
        .eq("tenant_id", tenantId!)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!tenantId,
  });

  const invoices = useQuery({
    queryKey: ["invoices", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("*, customers(full_name, phone)")
        .eq("tenant_id", tenantId!)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!tenantId,
  });

  const expenses = useQuery({
    queryKey: ["expenses", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expenses")
        .select("*")
        .eq("tenant_id", tenantId!)
        .order("date", { ascending: false })
        .limit(200);
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

  const payForm = useForm<PaymentForm>({ resolver: zodResolver(paymentSchema) as any });
  const invForm = useForm<InvoiceForm>({ resolver: zodResolver(invoiceSchema) as any });
  const expForm = useForm<ExpenseForm>({ resolver: zodResolver(expenseSchema) as any });

  const savePayment = useMutation({
    mutationFn: async (data: PaymentForm) => {
      const { error } = await supabase.from("payments").insert({ ...data, tenant_id: tenantId, status: "completed" });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Payment recorded"); qc.invalidateQueries({ queryKey: ["payments"] }); setPayOpen(false); payForm.reset(); },
    onError: (e: any) => toast.error(e.message),
  });

  async function handleStkPush(data: PaymentForm) {
    if (!data.phone) { toast.error("Phone number required for M-Pesa"); return; }
    setStkLoading(true);
    try {
      const result = await initiateStkPush({
        tenantId: tenantId!,
        phone: formatPhone(data.phone),
        amount: data.amount,
        accountRef: "SMARTLINKNET",
        description: data.notes ?? "Internet payment",
        customerId: data.customer_id,
      });
      await supabase.from("payments").insert({
        tenant_id: tenantId,
        customer_id: data.customer_id,
        amount: data.amount,
        method: "mpesa",
        status: "pending",
        phone: formatPhone(data.phone),
        reference: result.checkoutRequestId,
        notes: `STK Push sent. RequestID: ${result.checkoutRequestId}`,
      });
      toast.success("STK Push sent to " + data.phone + ". Customer will receive a prompt.");
      qc.invalidateQueries({ queryKey: ["payments"] });
      setPayOpen(false);
      payForm.reset();
    } catch (e: any) {
      toast.error(e.message ?? "STK Push failed");
    } finally {
      setStkLoading(false);
    }
  }

  const saveInvoice = useMutation({
    mutationFn: async (data: InvoiceForm) => {
      const { data: inv, error } = await supabase.from("invoices").insert({
        tenant_id: tenantId,
        customer_id: data.customer_id,
        subtotal: data.amount,
        total: data.amount,
        status: "unpaid",
        due_date: data.due_date || null,
        notes: data.notes,
      }).select().single();
      if (error) throw error;
      await supabase.from("invoice_items").insert({
        invoice_id: inv.id,
        description: data.description,
        quantity: 1,
        unit_price: data.amount,
        total: data.amount,
      });
    },
    onSuccess: () => { toast.success("Invoice created"); qc.invalidateQueries({ queryKey: ["invoices"] }); setInvoiceOpen(false); invForm.reset(); },
    onError: (e: any) => toast.error(e.message),
  });

  const saveExpense = useMutation({
    mutationFn: async (data: ExpenseForm) => {
      const { error } = await supabase.from("expenses").insert({ ...data, tenant_id: tenantId, created_by: user?.id });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Expense recorded"); qc.invalidateQueries({ queryKey: ["expenses"] }); setExpenseOpen(false); expForm.reset(); },
    onError: (e: any) => toast.error(e.message),
  });

  const markPaid = useMutation({
    mutationFn: async (id: string) => {
      const inv = invoices.data?.find((i) => i.id === id);
      if (!inv) return;
      const { error } = await supabase.from("invoices").update({ status: "paid", amount_paid: inv.total, paid_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Marked as paid"); qc.invalidateQueries({ queryKey: ["invoices"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const totalRevenue = payments.data?.filter((p) => p.status === "completed").reduce((s, p) => s + Number(p.amount), 0) ?? 0;
  const pendingAmount = invoices.data?.filter((i) => i.status === "unpaid").reduce((s, i) => s + Number(i.total), 0) ?? 0;
  const totalExpenses = expenses.data?.reduce((s, e) => s + Number(e.amount), 0) ?? 0;
  const netProfit = totalRevenue - totalExpenses;

  const watchMethod = payForm.watch("method");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Billing</h1>
          <p className="text-sm text-muted-foreground">Payments, invoices, expenses and financial records</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setExpenseOpen(true)}><TrendingDown className="h-4 w-4 mr-2" />Add Expense</Button>
          <Button variant="outline" onClick={() => setInvoiceOpen(true)}><FileText className="h-4 w-4 mr-2" />Create Invoice</Button>
          <Button onClick={() => { payForm.reset(); setPayOpen(true); }}><Plus className="h-4 w-4 mr-2" />Record Payment</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={TrendingUp} label="Total Revenue" value={`KES ${totalRevenue.toLocaleString()}`} color="text-green-500" />
        <StatCard icon={AlertCircle} label="Unpaid Invoices" value={`KES ${pendingAmount.toLocaleString()}`} color="text-yellow-500" />
        <StatCard icon={TrendingDown} label="Total Expenses" value={`KES ${totalExpenses.toLocaleString()}`} color="text-red-500" />
        <StatCard icon={Wallet} label="Net Profit" value={`KES ${netProfit.toLocaleString()}`} color={netProfit >= 0 ? "text-green-500" : "text-red-500"} />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="payments">Payments ({payments.data?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="invoices">Invoices ({invoices.data?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="expenses">Expenses ({expenses.data?.length ?? 0})</TabsTrigger>
        </TabsList>

        <TabsContent value="payments">
          <DataTable
            loading={payments.isLoading}
            cols={["Customer", "Amount", "Method", "Reference", "Status", "Date"]}
            empty="No payments yet"
          >
            {payments.data?.map((p) => (
              <tr key={p.id} className="border-t border-border/60 hover:bg-accent/30">
                <td className="px-4 py-3"><div className="font-medium">{(p as any).customers?.full_name ?? "—"}</div><div className="text-xs text-muted-foreground">{(p as any).customers?.phone}</div></td>
                <td className="px-4 py-3 font-semibold text-green-500">KES {Number(p.amount).toLocaleString()}</td>
                <td className="px-4 py-3 capitalize text-sm flex items-center gap-1">
                  {p.method === "mpesa" ? <Smartphone className="h-3 w-3" /> : <CreditCard className="h-3 w-3" />}{p.method}
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground font-mono">{p.mpesa_receipt ?? p.reference ?? "—"}</td>
                <td className="px-4 py-3"><span className={`rounded-full px-2 py-0.5 text-xs capitalize ${STATUS_COLORS[p.status] ?? "bg-muted"}`}>{p.status}</span></td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(p.created_at).toLocaleString()}</td>
              </tr>
            ))}
          </DataTable>
        </TabsContent>

        <TabsContent value="invoices">
          <DataTable
            loading={invoices.isLoading}
            cols={["Invoice #", "Customer", "Total", "Paid", "Status", "Due", "Actions"]}
            empty="No invoices yet"
          >
            {invoices.data?.map((i) => (
              <tr key={i.id} className="border-t border-border/60 hover:bg-accent/30">
                <td className="px-4 py-3 font-mono text-xs">{i.invoice_no}</td>
                <td className="px-4 py-3">{(i as any).customers?.full_name ?? "—"}</td>
                <td className="px-4 py-3 font-semibold">KES {Number(i.total).toLocaleString()}</td>
                <td className="px-4 py-3 text-green-500">KES {Number(i.amount_paid).toLocaleString()}</td>
                <td className="px-4 py-3"><span className={`rounded-full px-2 py-0.5 text-xs capitalize ${STATUS_COLORS[i.status] ?? "bg-muted"}`}>{i.status}</span></td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{i.due_date ? new Date(i.due_date).toLocaleDateString() : "—"}</td>
                <td className="px-4 py-3">
                  {i.status === "unpaid" && (
                    <Button size="sm" variant="outline" onClick={() => markPaid.mutate(i.id)}>Mark Paid</Button>
                  )}
                </td>
              </tr>
            ))}
          </DataTable>
        </TabsContent>

        <TabsContent value="expenses">
          <DataTable
            loading={expenses.isLoading}
            cols={["Description", "Category", "Amount", "Date"]}
            empty="No expenses recorded"
          >
            {expenses.data?.map((e) => (
              <tr key={e.id} className="border-t border-border/60 hover:bg-accent/30">
                <td className="px-4 py-3 font-medium">{e.description}</td>
                <td className="px-4 py-3 capitalize text-xs">{e.category}</td>
                <td className="px-4 py-3 font-semibold text-red-500">KES {Number(e.amount).toLocaleString()}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{e.date}</td>
              </tr>
            ))}
          </DataTable>
        </TabsContent>
      </Tabs>

      {/* Record Payment Dialog */}
      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Record Payment</DialogTitle></DialogHeader>
          <form onSubmit={payForm.handleSubmit((d) => d.method === "mpesa" && d.phone ? handleStkPush(d) : savePayment.mutate(d))} className="space-y-4">
            <div>
              <Label>Customer *</Label>
              <Select onValueChange={(v) => payForm.setValue("customer_id", v)}>
                <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
                <SelectContent>{customers.data?.map((c) => <SelectItem key={c.id} value={c.id}>{c.full_name} — {c.phone}</SelectItem>)}</SelectContent>
              </Select>
              {payForm.formState.errors.customer_id && <p className="text-xs text-destructive mt-1">{payForm.formState.errors.customer_id.message}</p>}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Amount (KES) *</Label><Input type="number" {...payForm.register("amount")} /></div>
              <div>
                <Label>Method</Label>
                <Select defaultValue="mpesa" onValueChange={(v) => payForm.setValue("method", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mpesa">M-Pesa</SelectItem>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="bank">Bank Transfer</SelectItem>
                    <SelectItem value="airtel">Airtel Money</SelectItem>
                    <SelectItem value="wallet">Wallet</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>{watchMethod === "mpesa" ? "M-Pesa Phone *" : "Phone"}</Label><Input {...payForm.register("phone")} placeholder="+254..." /></div>
              <div><Label>Reference / Receipt</Label><Input {...payForm.register("reference")} /></div>
              <div className="col-span-2"><Label>Notes</Label><Input {...payForm.register("notes")} /></div>
            </div>
            {watchMethod === "mpesa" && payForm.watch("phone") && (
              <div className="rounded-md bg-green-500/10 border border-green-500/30 p-3 text-xs text-green-700">
                <Smartphone className="inline h-3 w-3 mr-1" />
                Will send STK Push to {payForm.watch("phone")}. Customer will enter PIN on their phone.
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setPayOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={savePayment.isPending || stkLoading}>
                {stkLoading ? "Sending STK Push..." : savePayment.isPending ? "Saving..." : watchMethod === "mpesa" && payForm.watch("phone") ? "Send STK Push" : "Record Payment"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Create Invoice Dialog */}
      <Dialog open={invoiceOpen} onOpenChange={setInvoiceOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create Invoice</DialogTitle></DialogHeader>
          <form onSubmit={invForm.handleSubmit((d) => saveInvoice.mutate(d))} className="space-y-4">
            <div>
              <Label>Customer *</Label>
              <Select onValueChange={(v) => invForm.setValue("customer_id", v)}>
                <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
                <SelectContent>{customers.data?.map((c) => <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Description *</Label><Input {...invForm.register("description")} placeholder="e.g. Monthly internet subscription" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Amount (KES) *</Label><Input type="number" {...invForm.register("amount")} /></div>
              <div><Label>Due Date</Label><Input type="date" {...invForm.register("due_date")} /></div>
            </div>
            <div><Label>Notes</Label><Textarea {...invForm.register("notes")} rows={2} /></div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setInvoiceOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saveInvoice.isPending}>{saveInvoice.isPending ? "Creating..." : "Create Invoice"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add Expense Dialog */}
      <Dialog open={expenseOpen} onOpenChange={setExpenseOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Record Expense</DialogTitle></DialogHeader>
          <form onSubmit={expForm.handleSubmit((d) => saveExpense.mutate(d))} className="space-y-4">
            <div>
              <Label>Category *</Label>
              <Select onValueChange={(v) => expForm.setValue("category", v)}>
                <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  {["rent", "salaries", "equipment", "maintenance", "bandwidth", "marketing", "utilities", "fuel", "transport", "other"].map((c) => (
                    <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Description *</Label><Input {...expForm.register("description")} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Amount (KES) *</Label><Input type="number" {...expForm.register("amount")} /></div>
              <div><Label>Date</Label><Input type="date" {...expForm.register("date")} defaultValue={new Date().toISOString().split("T")[0]} /></div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setExpenseOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saveExpense.isPending}>{saveExpense.isPending ? "Saving..." : "Record Expense"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string; color?: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs text-muted-foreground uppercase">{label}</div>
        <Icon className={`h-4 w-4 ${color ?? "text-muted-foreground"}`} />
      </div>
      <div className={`text-xl font-bold ${color ?? ""}`}>{value}</div>
    </div>
  );
}

function DataTable({ loading, cols, empty, children }: { loading: boolean; cols: string[]; empty: string; children?: React.ReactNode }) {
  const hasData = children && (Array.isArray(children) ? children.length > 0 : true);
  return (
    <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
          <tr>{cols.map((c) => <th key={c} className="px-4 py-3 text-left">{c}</th>)}</tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={cols.length} className="px-4 py-12 text-center text-muted-foreground">Loading...</td></tr>
          ) : !hasData ? (
            <tr><td colSpan={cols.length} className="px-4 py-12 text-center text-muted-foreground">{empty}</td></tr>
          ) : children}
        </tbody>
      </table>
    </div>
  );
}
