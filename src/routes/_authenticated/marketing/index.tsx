/**
 * Marketing & Sales Platform — leads, campaigns, referrals, coupons,
 * customer retention, bulk SMS, and win-back campaigns.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenantId } from "@/lib/auth";
import { toast } from "sonner";
import {
  Megaphone, Users, Tag, Gift, MessageSquare, TrendingUp,
  Plus, Send, BarChart2, Star, RefreshCw, CheckCircle,
  Target, Phone, Mail, UserPlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/marketing/")({
  component: MarketingPage,
});

function MarketingPage() {
  const qc = useQueryClient();
  const { data: tenantId } = useTenantId();

  // ── Leads ─────────────────────────────────────────────────────────────────
  const [leadOpen, setLeadOpen] = useState(false);
  const [leadForm, setLeadForm] = useState({ full_name: "", phone: "", email: "", source: "walk-in", area: "", notes: "" });

  const leads = useQuery({
    queryKey: ["leads", tenantId],
    queryFn: async () => {
      const { data } = await (supabase as any).from("leads").select("*").eq("tenant_id", tenantId!).order("created_at", { ascending: false }).limit(50);
      return data ?? [];
    },
    enabled: !!tenantId,
  });

  const addLead = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).from("leads").insert({ ...leadForm, tenant_id: tenantId, status: "new" });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Lead captured"); qc.invalidateQueries({ queryKey: ["leads"] }); setLeadOpen(false); setLeadForm({ full_name: "", phone: "", email: "", source: "walk-in", area: "", notes: "" }); },
    onError: (e: any) => toast.error(e.message),
  });

  const updateLeadStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await (supabase as any).from("leads").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["leads"] }),
  });

  // ── Bulk SMS ──────────────────────────────────────────────────────────────
  const [smsTarget, setSmsTarget] = useState("all");
  const [smsMessage, setSmsMessage] = useState("");
  const [smsSending, setSmsSending] = useState(false);

  async function sendBulkSms() {
    setSmsSending(true);
    try {
      let q = (supabase as any).from("customers").select("phone").eq("tenant_id", tenantId!).eq("status", "active");
      if (smsTarget === "expiring") q = q.lte("subscriptions.expires_at", new Date(Date.now() + 86400000 * 3).toISOString());
      if (smsTarget === "suspended") q = q.eq("status", "suspended");
      const { data: customers } = await q;
      const phones = (customers ?? []).map((c: any) => c.phone).filter(Boolean);
      // send via edge function in batches
      await supabase.functions.invoke("send-sms", {
        body: { phones, message: smsMessage, tenant_id: tenantId },
      });
      toast.success(`SMS queued for ${phones.length} customers`);
      setSmsMessage("");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSmsSending(false);
    }
  }

  // ── Coupons ───────────────────────────────────────────────────────────────
  const [couponOpen, setCouponOpen] = useState(false);
  const [couponForm, setCouponForm] = useState({ code: "", discount_type: "percent", discount_value: 10, max_uses: 100, expires_at: "" });

  const coupons = useQuery({
    queryKey: ["coupons", tenantId],
    queryFn: async () => {
      const { data } = await (supabase as any).from("coupons").select("*").eq("tenant_id", tenantId!).order("created_at", { ascending: false });
      return data ?? [];
    },
    enabled: !!tenantId,
  });

  const addCoupon = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).from("coupons").insert({ ...couponForm, tenant_id: tenantId, uses: 0, is_active: true });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Coupon created"); qc.invalidateQueries({ queryKey: ["coupons"] }); setCouponOpen(false); },
    onError: (e: any) => toast.error(e.message),
  });

  // ── Retention stats ───────────────────────────────────────────────────────
  const retention = useQuery({
    queryKey: ["retention-stats", tenantId],
    queryFn: async () => {
      const [expiring7, suspended, newMonth] = await Promise.all([
        (supabase as any).from("subscriptions").select("*", { count: "exact", head: true }).eq("tenant_id", tenantId!).eq("status", "active").lte("expires_at", new Date(Date.now() + 86400000 * 7).toISOString()).gte("expires_at", new Date().toISOString()),
        (supabase as any).from("customers").select("*", { count: "exact", head: true }).eq("tenant_id", tenantId!).eq("status", "suspended"),
        (supabase as any).from("customers").select("*", { count: "exact", head: true }).eq("tenant_id", tenantId!).gte("created_at", new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()),
      ]);
      return {
        expiring7: expiring7.count ?? 0,
        suspended: suspended.count ?? 0,
        newMonth: newMonth.count ?? 0,
      };
    },
    enabled: !!tenantId,
  });

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold">Marketing & Sales</h1>
        <p className="text-sm text-muted-foreground">Leads, campaigns, coupons, and customer retention tools.</p>
      </div>

      {/* Retention KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <KpiCard icon={Target} label="Expiring in 7 Days" value={retention.data?.expiring7 ?? 0} color="text-yellow-500" sub="Send renewal reminders" />
        <KpiCard icon={UserPlus} label="New This Month" value={retention.data?.newMonth ?? 0} color="text-green-500" sub="New acquisitions" />
        <KpiCard icon={Users} label="Suspended" value={retention.data?.suspended ?? 0} color="text-red-500" sub="Win-back targets" />
      </div>

      <Tabs defaultValue="leads">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="leads"><Users className="h-3.5 w-3.5 mr-1.5" />Leads</TabsTrigger>
          <TabsTrigger value="sms"><MessageSquare className="h-3.5 w-3.5 mr-1.5" />Bulk SMS</TabsTrigger>
          <TabsTrigger value="coupons"><Tag className="h-3.5 w-3.5 mr-1.5" />Coupons</TabsTrigger>
          <TabsTrigger value="retention"><RefreshCw className="h-3.5 w-3.5 mr-1.5" />Retention</TabsTrigger>
        </TabsList>

        {/* Leads */}
        <TabsContent value="leads" className="mt-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Lead Pipeline</h2>
            <Button size="sm" onClick={() => setLeadOpen(true)}><Plus className="h-4 w-4 mr-2" />Add Lead</Button>
          </div>
          <div className="rounded-2xl border border-border/60 bg-card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-left">Name</th>
                  <th className="px-4 py-3 text-left">Phone</th>
                  <th className="px-4 py-3 text-left">Source</th>
                  <th className="px-4 py-3 text-left">Area</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Action</th>
                </tr>
              </thead>
              <tbody>
                {leads.isLoading && <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Loading...</td></tr>}
                {!leads.isLoading && (leads.data ?? []).length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No leads yet. Start capturing.</td></tr>
                )}
                {(leads.data ?? []).map((lead: any) => (
                  <tr key={lead.id} className="border-t border-border/60 hover:bg-accent/30">
                    <td className="px-4 py-3 font-medium">{lead.full_name}</td>
                    <td className="px-4 py-3 text-xs font-mono">{lead.phone}</td>
                    <td className="px-4 py-3 text-xs capitalize">{lead.source?.replace("-", " ")}</td>
                    <td className="px-4 py-3 text-xs">{lead.area ?? "—"}</td>
                    <td className="px-4 py-3">
                      <LeadStatusBadge status={lead.status} />
                    </td>
                    <td className="px-4 py-3">
                      <Select value={lead.status} onValueChange={(v) => updateLeadStatus.mutate({ id: lead.id, status: v })}>
                        <SelectTrigger className="h-7 text-xs w-28"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {["new", "contacted", "site_survey", "installation", "converted", "lost"].map((s) => (
                            <SelectItem key={s} value={s} className="text-xs capitalize">{s.replace("_", " ")}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Dialog open={leadOpen} onOpenChange={setLeadOpen}>
            <DialogContent>
              <DialogHeader><DialogTitle>Capture Lead</DialogTitle></DialogHeader>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Full Name *"><Input value={leadForm.full_name} onChange={(e) => setLeadForm((f) => ({ ...f, full_name: e.target.value }))} /></Field>
                <Field label="Phone *"><Input value={leadForm.phone} onChange={(e) => setLeadForm((f) => ({ ...f, phone: e.target.value }))} /></Field>
                <Field label="Email"><Input value={leadForm.email} onChange={(e) => setLeadForm((f) => ({ ...f, email: e.target.value }))} /></Field>
                <Field label="Area / Location"><Input value={leadForm.area} onChange={(e) => setLeadForm((f) => ({ ...f, area: e.target.value }))} /></Field>
                <Field label="Source">
                  <Select value={leadForm.source} onValueChange={(v) => setLeadForm((f) => ({ ...f, source: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["walk-in", "referral", "social-media", "google", "flyer", "agent", "whatsapp", "call", "other"].map((s) => (
                        <SelectItem key={s} value={s} className="capitalize">{s.replace("-", " ")}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Notes" className="col-span-2"><Textarea value={leadForm.notes} onChange={(e) => setLeadForm((f) => ({ ...f, notes: e.target.value }))} rows={2} /></Field>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setLeadOpen(false)}>Cancel</Button>
                <Button onClick={() => addLead.mutate()} disabled={!leadForm.full_name || !leadForm.phone || addLead.isPending}>Save Lead</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>

        {/* Bulk SMS */}
        <TabsContent value="sms" className="mt-4 space-y-4">
          <div className="rounded-2xl border border-border/60 bg-card p-5 space-y-4">
            <h2 className="font-semibold">Send Bulk SMS Campaign</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Target Audience">
                <Select value={smsTarget} onValueChange={setSmsTarget}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Active Customers</SelectItem>
                    <SelectItem value="expiring">Expiring in 3 Days</SelectItem>
                    <SelectItem value="suspended">Suspended Customers (Win-back)</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <Field label="Message">
              <Textarea value={smsMessage} onChange={(e) => setSmsMessage(e.target.value)} rows={4} placeholder="Dear {name}, your subscription is expiring soon. Renew at {portal_url} or call {support_phone}." />
              <p className="text-xs text-muted-foreground mt-1">Variables: {"{name}"}, {"{portal_url}"}, {"{support_phone}"}, {"{expiry_date}"}</p>
            </Field>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{smsMessage.length} / 160 chars{smsMessage.length > 160 ? ` (${Math.ceil(smsMessage.length / 160)} SMS)` : ""}</span>
              <Button onClick={sendBulkSms} disabled={!smsMessage || smsSending}>
                {smsSending ? <><Send className="h-4 w-4 mr-2 animate-pulse" />Sending…</> : <><Send className="h-4 w-4 mr-2" />Send Campaign</>}
              </Button>
            </div>
          </div>

          {/* Quick templates */}
          <div className="rounded-2xl border border-border/60 bg-card p-5">
            <h3 className="font-semibold mb-3 text-sm">Quick Templates</h3>
            <div className="grid gap-2">
              {[
                { label: "Renewal Reminder", msg: "Dear {name}, your internet subscription expires on {expiry_date}. Renew now to stay connected. Pay via M-Pesa to {paybill} or visit {portal_url}." },
                { label: "Win-back Campaign", msg: "Hi {name}, we miss you! Your account is suspended. Reconnect today and get 10% off. Call {support_phone} or pay {paybill}." },
                { label: "New Package Promo", msg: "Hi {name}! We have new internet packages starting from KES 99. Unlimited browsing, fast speeds. Reply YES or call {support_phone}." },
                { label: "Happy Hours", msg: "🌙 Night Bundle Alert! Get 5GB from 10PM-6AM for KES 50 tonight only. Dial {ussd_code} or pay via M-Pesa Paybill {paybill}." },
              ].map((t) => (
                <button key={t.label} onClick={() => setSmsMessage(t.msg)} className="flex items-start gap-3 rounded-xl border border-border/60 p-3 text-sm text-left hover:bg-accent/50 transition">
                  <MessageSquare className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div>
                    <div className="font-medium">{t.label}</div>
                    <div className="text-xs text-muted-foreground truncate">{t.msg.slice(0, 80)}…</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </TabsContent>

        {/* Coupons */}
        <TabsContent value="coupons" className="mt-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Discount Coupons</h2>
            <Button size="sm" onClick={() => setCouponOpen(true)}><Plus className="h-4 w-4 mr-2" />New Coupon</Button>
          </div>
          <div className="rounded-2xl border border-border/60 bg-card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-left">Code</th>
                  <th className="px-4 py-3 text-left">Discount</th>
                  <th className="px-4 py-3 text-left">Uses</th>
                  <th className="px-4 py-3 text-left">Max</th>
                  <th className="px-4 py-3 text-left">Expires</th>
                  <th className="px-4 py-3 text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {coupons.isLoading && <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Loading...</td></tr>}
                {!coupons.isLoading && (coupons.data ?? []).length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No coupons yet.</td></tr>
                )}
                {(coupons.data ?? []).map((c: any) => (
                  <tr key={c.id} className="border-t border-border/60 hover:bg-accent/30">
                    <td className="px-4 py-3 font-mono font-bold">{c.code}</td>
                    <td className="px-4 py-3 text-sm">{c.discount_type === "percent" ? `${c.discount_value}%` : `KES ${c.discount_value}`}</td>
                    <td className="px-4 py-3 text-xs">{c.uses ?? 0}</td>
                    <td className="px-4 py-3 text-xs">{c.max_uses}</td>
                    <td className="px-4 py-3 text-xs">{c.expires_at ? new Date(c.expires_at).toLocaleDateString() : "Never"}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs ${c.is_active ? "bg-green-500/15 text-green-600" : "bg-muted text-muted-foreground"}`}>{c.is_active ? "Active" : "Inactive"}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Dialog open={couponOpen} onOpenChange={setCouponOpen}>
            <DialogContent>
              <DialogHeader><DialogTitle>Create Coupon</DialogTitle></DialogHeader>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Coupon Code *">
                  <Input value={couponForm.code} onChange={(e) => setCouponForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))} placeholder="SAVE20" />
                </Field>
                <Field label="Discount Type">
                  <Select value={couponForm.discount_type} onValueChange={(v) => setCouponForm((f) => ({ ...f, discount_type: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percent">Percentage (%)</SelectItem>
                      <SelectItem value="fixed">Fixed Amount (KES)</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Discount Value">
                  <Input type="number" value={couponForm.discount_value} onChange={(e) => setCouponForm((f) => ({ ...f, discount_value: Number(e.target.value) }))} />
                </Field>
                <Field label="Max Uses">
                  <Input type="number" value={couponForm.max_uses} onChange={(e) => setCouponForm((f) => ({ ...f, max_uses: Number(e.target.value) }))} />
                </Field>
                <Field label="Expires At" className="col-span-2">
                  <Input type="date" value={couponForm.expires_at} onChange={(e) => setCouponForm((f) => ({ ...f, expires_at: e.target.value }))} />
                </Field>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCouponOpen(false)}>Cancel</Button>
                <Button onClick={() => addCoupon.mutate()} disabled={!couponForm.code || addCoupon.isPending}>Create Coupon</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>

        {/* Retention */}
        <TabsContent value="retention" className="mt-4 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <RetentionCard
              icon={RefreshCw}
              title="Expiry Reminders"
              desc={`${retention.data?.expiring7 ?? 0} subscriptions expire in 7 days. Send automated renewal SMS.`}
              action="Send Reminders"
              color="yellow"
              onClick={() => { setSmsTarget("expiring"); toast.info("Switch to Bulk SMS tab to send reminders."); }}
            />
            <RetentionCard
              icon={Gift}
              title="Win-Back Campaign"
              desc={`${retention.data?.suspended ?? 0} suspended customers. Target them with a special offer.`}
              action="Start Win-Back"
              color="red"
              onClick={() => { setSmsTarget("suspended"); toast.info("Switch to Bulk SMS tab to send win-back campaign."); }}
            />
            <RetentionCard
              icon={Star}
              title="Loyalty Rewards"
              desc="Reward long-term customers with loyalty discounts and free days."
              action="Configure Rewards"
              color="blue"
              onClick={() => toast.info("Loyalty rewards: Create a coupon code and share with long-term customers.")}
            />
            <RetentionCard
              icon={Megaphone}
              title="Referral Program"
              desc="Create referral codes and reward customers who bring new subscribers."
              action="Setup Referrals"
              color="green"
              onClick={() => toast.info("Create a coupon code per customer and track via coupons tab.")}
            />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function KpiCard({ icon: Icon, label, value, color, sub }: { icon: any; label: string; value: number; color: string; sub: string }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card p-5">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs text-muted-foreground uppercase">{label}</div>
        <Icon className={`h-4 w-4 ${color}`} />
      </div>
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-muted-foreground mt-1">{sub}</div>
    </div>
  );
}

function RetentionCard({ icon: Icon, title, desc, action, color, onClick }: {
  icon: any; title: string; desc: string; action: string;
  color: "yellow" | "red" | "blue" | "green"; onClick: () => void;
}) {
  const clr = { yellow: "text-yellow-500 bg-yellow-500/10", red: "text-red-500 bg-red-500/10", blue: "text-blue-500 bg-blue-500/10", green: "text-green-500 bg-green-500/10" }[color];
  return (
    <div className="rounded-2xl border border-border/60 bg-card p-5 flex flex-col gap-3">
      <div className={`grid h-10 w-10 place-items-center rounded-xl ${clr}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <h3 className="font-semibold">{title}</h3>
        <p className="text-xs text-muted-foreground mt-1">{desc}</p>
      </div>
      <Button variant="outline" size="sm" onClick={onClick} className="self-start">{action}</Button>
    </div>
  );
}

function LeadStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    new: "bg-blue-500/15 text-blue-600",
    contacted: "bg-yellow-500/15 text-yellow-600",
    site_survey: "bg-orange-500/15 text-orange-600",
    installation: "bg-purple-500/15 text-purple-600",
    converted: "bg-green-500/15 text-green-600",
    lost: "bg-muted text-muted-foreground",
  };
  return <span className={`rounded-full px-2 py-0.5 text-xs capitalize ${map[status] ?? "bg-muted"}`}>{status?.replace("_", " ")}</span>;
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <Label className="mb-1 block">{label}</Label>
      {children}
    </div>
  );
}
