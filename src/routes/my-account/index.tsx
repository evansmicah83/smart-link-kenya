/**
 * Customer Self-Service Portal — /my-account?token=<token>&isp=<slug>
 * Subscribers can view their plan, usage, payments, tickets and take actions.
 */
import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import {
  Wifi, Package, Clock, Zap, Database, CreditCard, Activity,
  Ticket, RefreshCw, Download, Phone, ChevronRight, CheckCircle,
  AlertCircle, Loader2, ArrowLeft, TrendingUp, Shield,
} from "lucide-react";
import { AreaChart, Area, ResponsiveContainer, XAxis, Tooltip } from "recharts";

const searchSchema = z.object({
  token: z.string().optional(),
  isp: z.string().optional(),
});

export const Route = createFileRoute("/my-account/")({
  ssr: false,
  validateSearch: (s) => searchSchema.parse(s),
  component: CustomerPortal,
  head: () => ({ meta: [{ title: "My Account — SmartLinkNet" }] }),
});

type Tab = "overview" | "payments" | "tickets" | "support";

interface Brand { company_name?: string; logo_url?: string; primary_color?: string; support_phone?: string; portal_tagline?: string; }
interface Customer { id: string; full_name: string; phone: string; email?: string; status: string; customer_no?: string; }
interface Subscription { id: string; status: string; expires_at: string; packages: { name: string; price: number; speed_down_kbps: number; speed_up_kbps: number; data_limit_mb?: number; duration_days: number; }; }
interface Payment { id: string; amount: number; method: string; status: string; created_at: string; mpesa_receipt?: string; }
interface TicketRow { id: string; ticket_no: string; subject: string; priority: string; status: string; created_at: string; }
interface Session { id: string; ip_address?: string; mac_address?: string; started_at: string; bytes_in?: number; bytes_out?: number; }

function fmtBytes(b: number) {
  if (!b) return "0 B";
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1073741824) return `${(b / 1048576).toFixed(1)} MB`;
  return `${(b / 1073741824).toFixed(2)} GB`;
}

function daysLeft(expiresAt: string) {
  const diff = new Date(expiresAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / 86400000));
}

function speedLabel(kbps: number) {
  return kbps >= 1024 ? `${(kbps / 1024).toFixed(0)} Mbps` : `${kbps} Kbps`;
}

export default function CustomerPortal() {
  const { token, isp } = useSearch({ from: "/my-account/" });
  const [tab, setTab] = useState<Tab>("overview");
  const [brand, setBrand] = useState<Brand>({});
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionLoading, setActionLoading] = useState("");
  const [ticketSubject, setTicketSubject] = useState("");
  const [ticketDesc, setTicketDesc] = useState("");
  const [ticketSending, setTicketSending] = useState(false);
  const [ticketSent, setTicketSent] = useState(false);

  // Usage chart — 7 days
  const [usageChart, setUsageChart] = useState<{ day: string; mb: number }[]>([]);

  useEffect(() => {
    if (!token || !isp) { setError("Invalid or missing access token."); setLoading(false); return; }
    (async () => {
      try {
        // Resolve tenant
        const { data: tenant } = await (supabase as any).from("tenants").select("id,name").eq("slug", isp).maybeSingle();
        if (!tenant) throw new Error("ISP not found.");
        setTenantId(tenant.id);

        // Verify token
        const { data: sess } = await (supabase as any)
          .from("customer_sessions").select("customer_id, expires_at")
          .eq("token", token).eq("tenant_id", tenant.id).maybeSingle();
        if (!sess || new Date(sess.expires_at) < new Date()) throw new Error("Session expired. Please log in again.");

        // Load brand
        const { data: b } = await (supabase as any).from("tenant_branding").select("*").eq("tenant_id", tenant.id).maybeSingle();
        setBrand({ ...(b ?? {}), company_name: b?.company_name ?? tenant.name });
        if (b?.primary_color) document.documentElement.style.setProperty("--primary", b.primary_color);

        // Load customer
        const { data: cust } = await (supabase as any).from("customers").select("*").eq("id", sess.customer_id).single();
        setCustomer(cust);

        // Load subscription, payments, tickets, sessions in parallel
        const [subRes, payRes, tickRes, sesRes] = await Promise.all([
          (supabase as any).from("subscriptions").select("*, packages(name,price,speed_down_kbps,speed_up_kbps,data_limit_mb,duration_days)")
            .eq("customer_id", cust.id).eq("status", "active").order("created_at", { ascending: false }).limit(1).maybeSingle(),
          (supabase as any).from("payments").select("id,amount,method,status,created_at,mpesa_receipt")
            .eq("customer_id", cust.id).order("created_at", { ascending: false }).limit(10),
          (supabase as any).from("tickets").select("id,ticket_no,subject,priority,status,created_at")
            .eq("customer_id", cust.id).order("created_at", { ascending: false }).limit(10),
          (supabase as any).from("sessions").select("id,ip_address,mac_address,started_at,bytes_in,bytes_out")
            .eq("customer_id", cust.id).is("ended_at", null).order("started_at", { ascending: false }).limit(5),
        ]);

        setSubscription(subRes.data ?? null);
        setPayments(payRes.data ?? []);
        setTickets(tickRes.data ?? []);
        setSessions(sesRes.data ?? []);

        // Build usage chart from sessions last 7 days
        const days = Array.from({ length: 7 }, (_, i) => {
          const d = new Date(); d.setDate(d.getDate() - (6 - i));
          return d;
        });
        const { data: allSessions } = await (supabase as any).from("sessions")
          .select("started_at,bytes_in,bytes_out").eq("customer_id", cust.id)
          .gte("started_at", days[0].toISOString());
        setUsageChart(days.map(d => ({
          day: d.toLocaleDateString("en-KE", { weekday: "short" }),
          mb: ((allSessions ?? []).filter((s: any) => new Date(s.started_at).toDateString() === d.toDateString())
            .reduce((acc: number, s: any) => acc + (s.bytes_in ?? 0) + (s.bytes_out ?? 0), 0) / 1048576),
        })));
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [token, isp]);

  async function restartSession() {
    if (!sessions[0] || !tenantId) return;
    setActionLoading("restart");
    try {
      await (supabase as any).from("sessions").update({ ended_at: new Date().toISOString() }).eq("id", sessions[0].id);
      setSessions(s => s.filter((_, i) => i !== 0));
    } finally { setActionLoading(""); }
  }

  async function submitTicket() {
    if (!ticketSubject || !customer || !tenantId) return;
    setTicketSending(true);
    try {
      await (supabase as any).from("tickets").insert({
        tenant_id: tenantId, customer_id: customer.id,
        subject: ticketSubject, description: ticketDesc,
        type: "support", priority: "medium", status: "open",
      });
      setTicketSent(true); setTicketSubject(""); setTicketDesc("");
      // refresh tickets
      const { data } = await (supabase as any).from("tickets").select("id,ticket_no,subject,priority,status,created_at")
        .eq("customer_id", customer.id).order("created_at", { ascending: false }).limit(10);
      setTickets(data ?? []);
    } finally { setTicketSending(false); }
  }

  const primary = brand.primary_color ?? "#0ea5e9";

  if (loading) return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-white/60" />
    </div>
  );

  if (error) return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center px-4">
      <div className="text-center max-w-sm">
        <AlertCircle className="h-12 w-12 text-red-400 mx-auto mb-4" />
        <h2 className="text-white font-bold text-lg mb-2">Access Error</h2>
        <p className="text-slate-400 text-sm mb-4">{error}</p>
        <a href={`/portal?isp=${isp ?? ""}`} className="inline-flex items-center gap-2 text-sm text-primary hover:underline">
          <ArrowLeft className="h-4 w-4" /> Back to Portal
        </a>
      </div>
    </div>
  );

  const days = subscription ? daysLeft(subscription.expires_at) : 0;
  const pkg = subscription?.packages;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-white/10 bg-black/40 backdrop-blur-xl px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {brand.logo_url
            ? <img src={brand.logo_url} alt="logo" className="h-8 w-auto object-contain" />
            : <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-primary-foreground"><Wifi className="h-4 w-4" /></div>}
          <div>
            <div className="font-semibold text-sm">{brand.company_name ?? "My Account"}</div>
            {customer && <div className="text-xs text-slate-400">{customer.full_name}</div>}
          </div>
        </div>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${customer?.status === "active" ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}`}>
          {customer?.status ?? ""}
        </span>
      </header>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-4 pb-24">
        {/* Active plan card */}
        <div className="rounded-2xl p-5 space-y-3" style={{ background: `linear-gradient(135deg, ${primary}33, ${primary}11)`, border: `1px solid ${primary}44` }}>
          <div className="flex items-center justify-between">
            <div className="text-xs text-slate-400 uppercase tracking-wide">Active Plan</div>
            <Package className="h-4 w-4 text-slate-400" />
          </div>
          {subscription && pkg ? (
            <>
              <div className="text-xl font-bold">{pkg.name}</div>
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl bg-white/5 p-3 text-center">
                  <Clock className="h-4 w-4 mx-auto mb-1 text-yellow-400" />
                  <div className={`text-lg font-bold ${days <= 3 ? "text-red-400" : "text-white"}`}>{days}</div>
                  <div className="text-[10px] text-slate-400">Days Left</div>
                </div>
                <div className="rounded-xl bg-white/5 p-3 text-center">
                  <Zap className="h-4 w-4 mx-auto mb-1 text-blue-400" />
                  <div className="text-lg font-bold">{speedLabel(pkg.speed_down_kbps)}</div>
                  <div className="text-[10px] text-slate-400">Download</div>
                </div>
                <div className="rounded-xl bg-white/5 p-3 text-center">
                  <Database className="h-4 w-4 mx-auto mb-1 text-green-400" />
                  <div className="text-lg font-bold">{pkg.data_limit_mb ? fmtBytes(pkg.data_limit_mb * 1024 * 1024) : "∞"}</div>
                  <div className="text-[10px] text-slate-400">Data Cap</div>
                </div>
              </div>
              {days <= 3 && (
                <div className="rounded-xl bg-red-500/15 border border-red-500/30 px-3 py-2 text-xs text-red-400 flex items-center gap-2">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  Your plan expires in {days} day{days !== 1 ? "s" : ""}. Renew now to stay connected.
                </div>
              )}
              <div className="text-xs text-slate-400">
                Expires: {new Date(subscription.expires_at).toLocaleDateString("en-KE", { dateStyle: "full" })}
              </div>
            </>
          ) : (
            <div className="text-slate-400 text-sm py-2">No active subscription. Purchase a plan to connect.</div>
          )}
        </div>

        {/* Quick actions */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { icon: RefreshCw, label: "Renew", href: `/portal?isp=${isp}&token=${token}` },
            { icon: TrendingUp, label: "Upgrade", href: `/portal?isp=${isp}&token=${token}` },
            { icon: Phone, label: "Support", action: () => setTab("support") },
          ].map((a) => (
            a.href
              ? <a key={a.label} href={a.href} className="flex flex-col items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 py-3 text-xs font-medium hover:bg-white/10 transition">
                  <a.icon className="h-5 w-5 text-primary" />{a.label}
                </a>
              : <button key={a.label} onClick={a.action} className="flex flex-col items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 py-3 text-xs font-medium hover:bg-white/10 transition">
                  <a.icon className="h-5 w-5 text-primary" />{a.label}
                </button>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 rounded-xl bg-white/5 p-1">
          {(["overview", "payments", "tickets", "support"] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 rounded-lg py-1.5 text-xs font-medium capitalize transition ${tab === t ? "bg-primary text-primary-foreground" : "text-slate-400 hover:text-white"}`}>
              {t}
            </button>
          ))}
        </div>

        {/* Overview tab */}
        {tab === "overview" && (
          <div className="space-y-4">
            {/* Usage chart */}
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="text-sm font-semibold mb-3">Data Usage — Last 7 Days</div>
              <ResponsiveContainer width="100%" height={100}>
                <AreaChart data={usageChart} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="ug" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={primary} stopOpacity={0.4} />
                      <stop offset="95%" stopColor={primary} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="day" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                  <Tooltip formatter={(v: any) => [`${Number(v).toFixed(1)} MB`, "Usage"]} contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8, fontSize: 11 }} />
                  <Area type="monotone" dataKey="mb" stroke={primary} strokeWidth={2} fill="url(#ug)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Active sessions */}
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm font-semibold">Active Sessions</div>
                <Activity className="h-4 w-4 text-slate-400" />
              </div>
              {sessions.length === 0
                ? <div className="text-xs text-slate-400 py-2">No active sessions.</div>
                : sessions.map(s => (
                  <div key={s.id} className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2 text-xs mb-1">
                    <div>
                      <div className="font-mono text-slate-300">{s.ip_address ?? "—"}</div>
                      <div className="text-slate-500">{s.mac_address ?? ""} · {new Date(s.started_at).toLocaleTimeString()}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-green-400">↓ {fmtBytes(s.bytes_in ?? 0)}</div>
                      <div className="text-blue-400">↑ {fmtBytes(s.bytes_out ?? 0)}</div>
                    </div>
                  </div>
                ))}
              {sessions.length > 0 && (
                <button onClick={restartSession} disabled={actionLoading === "restart"}
                  className="mt-2 w-full rounded-lg border border-white/10 py-2 text-xs text-slate-400 hover:text-white hover:border-white/30 transition flex items-center justify-center gap-2">
                  {actionLoading === "restart" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                  Restart Session
                </button>
              )}
            </div>

            {/* Account info */}
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-2">
              <div className="text-sm font-semibold mb-2">Account Details</div>
              {[
                ["Customer No", customer?.customer_no ?? customer?.id.slice(0, 8)],
                ["Phone", customer?.phone],
                ["Email", customer?.email ?? "—"],
                ["Status", customer?.status],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between text-xs">
                  <span className="text-slate-400">{k}</span>
                  <span className="font-medium capitalize">{v}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Payments tab */}
        {tab === "payments" && (
          <div className="space-y-2">
            <div className="text-sm font-semibold px-1">Payment History</div>
            {payments.length === 0
              ? <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center text-slate-400 text-sm">No payments yet.</div>
              : payments.map(p => (
                <div key={p.id} className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold text-green-400">KES {Number(p.amount).toLocaleString()}</div>
                    <div className="text-xs text-slate-400 capitalize">{p.method} · {new Date(p.created_at).toLocaleDateString()}</div>
                    {p.mpesa_receipt && <div className="text-xs font-mono text-slate-500">{p.mpesa_receipt}</div>}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] capitalize ${p.status === "completed" ? "bg-green-500/20 text-green-400" : "bg-yellow-500/20 text-yellow-400"}`}>{p.status}</span>
                    <button title="Download receipt" className="text-slate-500 hover:text-white">
                      <Download className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
          </div>
        )}

        {/* Tickets tab */}
        {tab === "tickets" && (
          <div className="space-y-2">
            <div className="text-sm font-semibold px-1">My Support Tickets</div>
            {tickets.length === 0
              ? <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center text-slate-400 text-sm">No tickets. Use the Support tab to open one.</div>
              : tickets.map(t => (
                <div key={t.id} className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-mono text-xs text-slate-400">{t.ticket_no}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] capitalize ${t.status === "open" ? "bg-blue-500/20 text-blue-400" : t.status === "resolved" ? "bg-green-500/20 text-green-400" : "bg-yellow-500/20 text-yellow-400"}`}>{t.status}</span>
                  </div>
                  <div className="text-sm font-medium">{t.subject}</div>
                  <div className="text-xs text-slate-400 mt-0.5">{new Date(t.created_at).toLocaleDateString()}</div>
                </div>
              ))}
          </div>
        )}

        {/* Support tab */}
        {tab === "support" && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-4">
              <div className="text-sm font-semibold">Open a Support Ticket</div>
              {ticketSent && (
                <div className="rounded-xl bg-green-500/15 border border-green-500/30 px-3 py-2 text-sm text-green-400 flex items-center gap-2">
                  <CheckCircle className="h-4 w-4" /> Ticket submitted! We'll get back to you soon.
                </div>
              )}
              <input className="w-full rounded-xl border border-white/10 bg-white/10 px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-primary"
                placeholder="Subject" value={ticketSubject} onChange={e => setTicketSubject(e.target.value)} />
              <textarea className="w-full rounded-xl border border-white/10 bg-white/10 px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-primary resize-none"
                placeholder="Describe your issue..." rows={4} value={ticketDesc} onChange={e => setTicketDesc(e.target.value)} />
              <button onClick={submitTicket} disabled={!ticketSubject || ticketSending}
                className="w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50 flex items-center justify-center gap-2">
                {ticketSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ticket className="h-4 w-4" />}
                Submit Ticket
              </button>
            </div>
            {brand.support_phone && (
              <a href={`tel:${brand.support_phone}`} className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-5 py-4 hover:bg-white/10 transition">
                <div>
                  <div className="text-sm font-semibold">Call Support</div>
                  <div className="text-xs text-slate-400">{brand.support_phone}</div>
                </div>
                <ChevronRight className="h-5 w-5 text-slate-400" />
              </a>
            )}
            <a href={`https://wa.me/${(brand.support_phone ?? "").replace(/\D/g, "")}`} target="_blank" rel="noreferrer"
              className="flex items-center justify-between rounded-2xl border border-green-500/30 bg-green-500/10 px-5 py-4 hover:bg-green-500/20 transition">
              <div>
                <div className="text-sm font-semibold text-green-400">WhatsApp Support</div>
                <div className="text-xs text-slate-400">Chat with us on WhatsApp</div>
              </div>
              <ChevronRight className="h-5 w-5 text-green-400" />
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
