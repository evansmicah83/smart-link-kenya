/**
 * Public Captive Portal — /portal?isp=<slug>
 * Supports: voucher login, M-Pesa STK push package purchase.
 * Works for MikroTik Hotspot, Apartment WiFi, Hotel, School, Estate, WISP.
 */
import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { initiateStkPush, formatPhone } from "@/lib/mpesa";
import {
  Wifi, CheckCircle, Loader2, ArrowLeft, Star, Zap,
  Clock, PhoneCall, QrCode, AlertCircle,
} from "lucide-react";

const searchSchema = z.object({
  isp: z.string().optional(),
  mac: z.string().optional(),
  ip: z.string().optional(),
  url: z.string().optional(),
});

export const Route = createFileRoute("/portal/")(({
  ssr: false,
  validateSearch: (s) => searchSchema.parse(s),
  component: CaptivePortal,
  head: () => ({ meta: [{ title: "Connect to WiFi" }] }),
} as any));

type Page = "landing" | "packages" | "voucher" | "payment" | "success" | "error" | "terms" | "support";

interface Brand {
  logo_url?: string;
  company_name?: string;
  primary_color?: string;
  portal_tagline?: string;
  support_phone?: string;
  support_email?: string;
}

interface Pkg {
  id: string;
  name: string;
  price: number;
  duration_days: number;
  speed_limit?: string;
  data_limit_mb?: number;
  description?: string;
  is_popular?: boolean;
}

function CaptivePortal() {
  const { isp, mac, ip, url } = useSearch({ from: "/portal/" });

  const [page, setPage] = useState<Page>("landing");
  const [brand, setBrand] = useState<Brand>({});
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [packages, setPackages] = useState<Pkg[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [noTenant, setNoTenant] = useState(false);

  // M-Pesa flow
  const [selectedPkg, setSelectedPkg] = useState<Pkg | null>(null);
  const [phone, setPhone] = useState("");
  const [paying, setPaying] = useState(false);
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const pollRef = useRef<any>(null);

  // Voucher flow
  const [voucher, setVoucher] = useState("");
  const [voucherLoading, setVoucherLoading] = useState(false);

  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // ── Load tenant + branding + packages ──────────────────────────────────────
  useEffect(() => {
    if (!isp) { setLoadingData(false); setNoTenant(true); return; }
    (async () => {
      setLoadingData(true);
      const { data: tenant } = await (supabase as any)
        .from("tenants")
        .select("id, name")
        .eq("slug", isp)
        .maybeSingle();

      if (!tenant) { setLoadingData(false); setNoTenant(true); return; }
      setTenantId(tenant.id);

      const [brandRes, pkgRes] = await Promise.all([
        (supabase as any).from("tenant_branding").select("*").eq("tenant_id", tenant.id).maybeSingle(),
        (supabase as any).from("packages").select("id,name,price,duration_days,speed_limit,data_limit_mb,description,is_popular").eq("tenant_id", tenant.id).eq("is_active", true).order("price"),
      ]);

      setBrand(brandRes.data ? { ...brandRes.data, company_name: tenant.name } : { company_name: tenant.name });
      setPackages(pkgRes.data ?? []);

      if (brandRes.data?.primary_color) {
        document.documentElement.style.setProperty("--primary", brandRes.data.primary_color);
      }
      setLoadingData(false);
    })();
  }, [isp]);

  // ── Poll payment status by payment row id ──────────────────────────────────
  useEffect(() => {
    if (!paymentId) return;
    pollRef.current = setInterval(async () => {
      const { data } = await (supabase as any)
        .from("payments")
        .select("status")
        .eq("id", paymentId)
        .maybeSingle();

      if (data?.status === "completed") {
        clearInterval(pollRef.current);
        setSuccessMsg("Payment confirmed! You are now connected.");
        setPage("success");
        if (url) {
          // MikroTik expects redirect to its login page which then grants access
          // $(link-orig) is the original URL — redirecting there directly bypasses MikroTik auth
          // Instead redirect to MikroTik's alogin page which sets the auth cookie
          setTimeout(() => {
            // Try MikroTik alogin (auto-login) URL first, fallback to original url
            const loginUrl = new URL(url);
            const mikrotikLogin = `${loginUrl.protocol}//${loginUrl.hostname}/login?dst=${encodeURIComponent(url)}`;
            window.location.href = mikrotikLogin;
          }, 2500);
        }
      } else if (data?.status === "failed") {
        clearInterval(pollRef.current);
        setError("Payment failed or was cancelled. Please try again.");
        setPage("error");
      }
    }, 3000);
    return () => clearInterval(pollRef.current);
  }, [paymentId, url]);

  // ── M-Pesa STK push ────────────────────────────────────────────────────────
  async function handleStkPush() {
    if (!selectedPkg || !tenantId) return;
    setPaying(true);
    setError("");
    try {
      const fmtPhone = formatPhone(phone);

      // Get or create customer
      let { data: customer } = await (supabase as any)
        .from("customers")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("phone", fmtPhone)
        .maybeSingle();

      if (!customer) {
        const { data: nc, error: ce } = await (supabase as any)
          .from("customers")
          .insert({
            tenant_id: tenantId,
            phone: fmtPhone,
            full_name: `WiFi User ${fmtPhone.slice(-4)}`,
            category: "residential",
            status: "active",
          })
          .select("id")
          .single();
        if (ce) throw new Error("Could not create customer: " + ce.message);
        customer = nc;
      }

      // Create pending payment row FIRST so callback can find it
      const { data: payment, error: pe } = await (supabase as any)
        .from("payments")
        .insert({
          tenant_id: tenantId,
          customer_id: customer.id,
          amount: selectedPkg.price,
          currency: "KES",
          method: "mpesa",
          status: "pending",
          phone: fmtPhone,
          notes: `Portal purchase: ${selectedPkg.name}`,
          package_id: selectedPkg.id,
        })
        .select("id")
        .single();
      if (pe) throw new Error("Could not create payment: " + pe.message);

      // Initiate STK push — pass paymentId as accountRef so callback can match
      const result = await initiateStkPush({
        tenantId,
        phone: fmtPhone,
        amount: selectedPkg.price,
        accountRef: payment.id.slice(0, 12).toUpperCase(),
        description: selectedPkg.name,
        customerId: customer.id,
      });

      // Store checkoutRequestId as reference on the payment row
      await (supabase as any)
        .from("payments")
        .update({ reference: result.checkoutRequestId })
        .eq("id", payment.id);

      setPaymentId(payment.id);
      setPage("payment");
    } catch (e: any) {
      setError(e.message ?? "Payment failed. Please try again.");
    } finally {
      setPaying(false);
    }
  }

  // ── Voucher login ──────────────────────────────────────────────────────────
  async function handleVoucherLogin() {
    if (!tenantId) return;
    setVoucherLoading(true);
    setError("");
    try {
      const { data, error: ve } = await (supabase as any)
        .from("vouchers")
        .select("id, status, package_id, packages(name)")
        .eq("tenant_id", tenantId)
        .eq("code", voucher.trim().toUpperCase())
        .eq("status", "unused")
        .maybeSingle();

      if (ve || !data) throw new Error("Invalid or already used voucher code.");

      // Only update columns that exist on the vouchers table
      await (supabase as any)
        .from("vouchers")
        .update({ status: "active", used_at: new Date().toISOString() })
        .eq("id", data.id);

      setSuccessMsg(`Voucher accepted! Connected with ${(data as any).packages?.name ?? "internet access"}.`);
      setPage("success");
      if (url) {
        setTimeout(() => {
          const loginUrl = new URL(url);
          const mikrotikLogin = `${loginUrl.protocol}//${loginUrl.hostname}/login?dst=${encodeURIComponent(url)}`;
          window.location.href = mikrotikLogin;
        }, 2500);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setVoucherLoading(false);
    }
  }

  const featured = packages.filter((p) => p.is_popular || p.price <= 500).slice(0, 2);

  // ── No ISP / loading states ────────────────────────────────────────────────
  if (loadingData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (noTenant) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center px-4">
        <div className="text-center space-y-3">
          <Wifi className="h-12 w-12 text-slate-500 mx-auto" />
          <h1 className="text-white font-bold text-xl">Portal not found</h1>
          <p className="text-slate-400 text-sm">No ISP configured for this URL. Contact your network administrator.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">

        {/* Brand header */}
        <div className="text-center mb-6">
          {brand.logo_url ? (
            <img src={brand.logo_url} alt="Logo" className="h-12 w-auto mx-auto object-contain" />
          ) : (
            <div className="flex items-center justify-center gap-2">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary text-primary-foreground">
                <Wifi className="h-5 w-5" />
              </div>
              <span className="text-xl font-bold text-white">{brand.company_name ?? "WiFi"}</span>
            </div>
          )}
          {brand.portal_tagline && <p className="mt-2 text-sm text-slate-400">{brand.portal_tagline}</p>}
        </div>

        {/* Card */}
        <div className="rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 overflow-hidden shadow-2xl">

          {/* ── Landing ── */}
          {page === "landing" && (
            <div className="p-6 space-y-4">
              <h1 className="text-lg font-bold text-white text-center">Connect to WiFi</h1>
              <p className="text-sm text-slate-400 text-center">Select how you'd like to get online.</p>

              <div className="space-y-2">
                <PortalBtn
                  icon={PhoneCall}
                  label="Buy with M-Pesa"
                  sub="Instant STK push — pay & connect"
                  onClick={() => setPage("packages")}
                  primary
                />
                <PortalBtn
                  icon={QrCode}
                  label="Enter Voucher Code"
                  sub="Activate with a prepaid voucher"
                  onClick={() => setPage("voucher")}
                />
              </div>

              {featured.length > 0 && (
                <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">Popular packages</div>
                  {featured.map((pkg) => (
                    <div key={pkg.id} className="flex items-center justify-between rounded-lg bg-black/20 px-3 py-2 mb-1 last:mb-0">
                      <div>
                        <div className="text-sm font-medium text-white">{pkg.name}</div>
                        <div className="text-xs text-slate-400">
                          {pkg.duration_days === 1 ? "1 Day" : pkg.duration_days === 7 ? "1 Week" : pkg.duration_days === 30 ? "1 Month" : `${pkg.duration_days} days`}
                          {pkg.speed_limit ? ` · ${pkg.speed_limit}` : ""}
                        </div>
                      </div>
                      <span className="text-sm font-bold text-primary">KES {Number(pkg.price).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex justify-center gap-4 text-xs text-slate-500 pt-1">
                <button className="hover:text-slate-300 transition" onClick={() => setPage("terms")}>Terms</button>
                <button className="hover:text-slate-300 transition" onClick={() => setPage("support")}>Support</button>
              </div>
              {brand.support_phone && (
                <p className="text-center text-xs text-slate-500">
                  Help? <a href={`tel:${brand.support_phone}`} className="text-primary hover:underline">{brand.support_phone}</a>
                </p>
              )}
            </div>
          )}

          {/* ── Packages + M-Pesa ── */}
          {page === "packages" && (
            <div className="p-6 space-y-4">
              <BackBtn onClick={() => { setPage("landing"); setSelectedPkg(null); setError(""); }} />
              <h2 className="text-lg font-bold text-white">Choose a Package</h2>

              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {packages.length === 0 && (
                  <p className="text-sm text-slate-400 text-center py-6">No packages available yet.</p>
                )}
                {packages.map((pkg) => (
                  <button
                    key={pkg.id}
                    onClick={() => setSelectedPkg(pkg)}
                    className={`w-full rounded-xl border px-4 py-3 text-left transition ${
                      selectedPkg?.id === pkg.id
                        ? "border-primary bg-primary/20"
                        : "border-white/10 bg-white/5 hover:bg-white/10"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-white text-sm">{pkg.name}</span>
                          {pkg.is_popular && (
                            <span className="rounded-full bg-primary/30 text-primary px-1.5 py-0.5 text-[10px] font-bold flex items-center gap-0.5">
                              <Star className="h-2.5 w-2.5" /> Popular
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-400 mt-0.5 flex gap-2 flex-wrap">
                          {pkg.duration_days > 0 && (
                            <span><Clock className="h-3 w-3 inline mr-0.5" />
                              {pkg.duration_days === 1 ? "1 Day" : pkg.duration_days === 7 ? "1 Week" : pkg.duration_days === 30 ? "1 Month" : `${pkg.duration_days} days`}
                            </span>
                          )}
                          {pkg.speed_limit && <span><Zap className="h-3 w-3 inline mr-0.5" />{pkg.speed_limit}</span>}
                          {pkg.data_limit_mb && <span>{pkg.data_limit_mb >= 1024 ? `${(pkg.data_limit_mb / 1024).toFixed(0)}GB` : `${pkg.data_limit_mb}MB`}</span>}
                        </div>
                      </div>
                      <span className="font-bold text-primary text-sm">KES {Number(pkg.price).toLocaleString()}</span>
                    </div>
                  </button>
                ))}
              </div>

              {selectedPkg && (
                <div className="space-y-3 pt-3 border-t border-white/10">
                  <p className="text-sm text-slate-300 font-medium">
                    Pay KES {Number(selectedPkg.price).toLocaleString()} for {selectedPkg.name}
                  </p>
                  <input
                    className="w-full rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-white placeholder:text-slate-500 focus:outline-none focus:border-primary"
                    placeholder="07XX XXX XXX (M-Pesa number)"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    type="tel"
                    inputMode="tel"
                  />
                  {error && <ErrorMsg msg={error} />}
                  <button
                    onClick={handleStkPush}
                    disabled={paying || phone.replace(/\D/g, "").length < 9}
                    className="w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {paying ? <Loader2 className="h-4 w-4 animate-spin" /> : <PhoneCall className="h-4 w-4" />}
                    {paying ? "Sending STK push…" : `Pay KES ${Number(selectedPkg.price).toLocaleString()} via M-Pesa`}
                  </button>
                  <p className="text-xs text-slate-500 text-center">You will receive an M-Pesa prompt on your phone</p>
                </div>
              )}
            </div>
          )}

          {/* ── Voucher ── */}
          {page === "voucher" && (
            <div className="p-6 space-y-4">
              <BackBtn onClick={() => { setPage("landing"); setVoucher(""); setError(""); }} />
              <h2 className="text-lg font-bold text-white">Enter Voucher Code</h2>
              <p className="text-sm text-slate-400">Type the code printed on your voucher card</p>
              <input
                className="w-full rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-white text-center text-xl font-mono tracking-widest placeholder:text-slate-500 focus:outline-none focus:border-primary uppercase"
                placeholder="XXXXXXXX"
                value={voucher}
                onChange={(e) => setVoucher(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
                maxLength={12}
                autoCapitalize="characters"
              />
              {error && <ErrorMsg msg={error} />}
              <button
                onClick={handleVoucherLogin}
                disabled={voucherLoading || voucher.length < 6}
                className="w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {voucherLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Connect Now
              </button>
            </div>
          )}

          {/* ── Payment pending ── */}
          {page === "payment" && (
            <div className="p-6 text-center space-y-5">
              <div className="grid h-16 w-16 mx-auto place-items-center rounded-full bg-primary/20 pulse-ring">
                <PhoneCall className="h-7 w-7 text-primary" />
              </div>
              <h2 className="text-lg font-bold text-white">Check Your Phone</h2>
              <p className="text-sm text-slate-400">
                An M-Pesa STK push was sent to{" "}
                <span className="text-white font-medium">{phone}</span>.
                Enter your M-Pesa PIN to complete payment.
              </p>
              <div className="flex items-center justify-center gap-2 text-xs text-slate-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Waiting for confirmation…
              </div>
              <button
                onClick={() => { clearInterval(pollRef.current); setPage("packages"); setPaymentId(null); }}
                className="text-xs text-slate-500 hover:text-white underline"
              >
                Cancel
              </button>
            </div>
          )}

          {/* ── Success ── */}
          {page === "success" && (
            <div className="p-6 text-center space-y-4">
              <div className="grid h-16 w-16 mx-auto place-items-center rounded-full bg-green-500/20">
                <CheckCircle className="h-8 w-8 text-green-400" />
              </div>
              <h2 className="text-xl font-bold text-white">You're Connected! 🎉</h2>
              <p className="text-sm text-slate-400">{successMsg || "Enjoy your internet access."}</p>
              {url && <p className="text-xs text-slate-500 animate-pulse">Redirecting you automatically…</p>}
              {!url && (
                <p className="text-xs text-slate-500">You can now close this page and browse the internet.</p>
              )}
            </div>
          )}

          {/* ── Error ── */}
          {page === "error" && (
            <div className="p-6 text-center space-y-4">
              <div className="grid h-16 w-16 mx-auto place-items-center rounded-full bg-red-500/20">
                <AlertCircle className="h-8 w-8 text-red-400" />
              </div>
              <h2 className="text-lg font-bold text-white">Something went wrong</h2>
              <p className="text-sm text-slate-400">{error || "An unexpected error occurred."}</p>
              <button
                onClick={() => { setPage("landing"); setError(""); setPaymentId(null); }}
                className="w-full rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
              >
                Try Again
              </button>
            </div>
          )}

          {/* ── Terms ── */}
          {page === "terms" && (
            <div className="p-6 space-y-3">
              <BackBtn onClick={() => setPage("landing")} />
              <h2 className="text-lg font-bold text-white">Terms & Fair Usage</h2>
              <div className="space-y-2 text-sm text-slate-400">
                <p>Access is subject to availability and package terms.</p>
                <p>Fair usage policies may apply during peak periods.</p>
                <p>Payments are non-refundable once service has been activated.</p>
                <p>Misuse of the network may result in immediate suspension.</p>
              </div>
            </div>
          )}

          {/* ── Support ── */}
          {page === "support" && (
            <div className="p-6 space-y-3">
              <BackBtn onClick={() => setPage("landing")} />
              <h2 className="text-lg font-bold text-white">Contact Support</h2>
              <div className="space-y-2 text-sm text-slate-400">
                {brand.support_phone && (
                  <p>📞 Call: <a href={`tel:${brand.support_phone}`} className="text-primary hover:underline">{brand.support_phone}</a></p>
                )}
                {brand.support_email && (
                  <p>✉️ Email: <a href={`mailto:${brand.support_email}`} className="text-primary hover:underline">{brand.support_email}</a></p>
                )}
                <p>Our team can assist with activation, payments, and service issues.</p>
              </div>
            </div>
          )}

        </div>

        <p className="mt-4 text-center text-xs text-slate-600">
          By connecting you agree to our{" "}
          <button onClick={() => setPage("terms")} className="underline hover:text-slate-400">Terms of Use</button>
          {" & "}
          <button onClick={() => setPage("terms")} className="underline hover:text-slate-400">Fair Usage Policy</button>.
        </p>
      </div>
    </div>
  );
}

function PortalBtn({ icon: Icon, label, sub, onClick, primary }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string; sub: string; onClick: () => void; primary?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 rounded-xl px-4 py-3.5 text-left transition ${
        primary
          ? "bg-primary text-primary-foreground hover:opacity-90"
          : "border border-white/10 bg-white/5 text-white hover:bg-white/10"
      }`}
    >
      <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${primary ? "bg-primary-foreground/20" : "bg-white/10"}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <div className="font-semibold text-sm">{label}</div>
        <div className={`text-xs ${primary ? "opacity-80" : "text-slate-400"}`}>{sub}</div>
      </div>
    </button>
  );
}

function BackBtn({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex items-center gap-1 text-xs text-slate-400 hover:text-white mb-1 transition">
      <ArrowLeft className="h-3.5 w-3.5" /> Back
    </button>
  );
}

function ErrorMsg({ msg }: { msg: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg bg-red-500/15 border border-red-500/30 px-3 py-2 text-xs text-red-400">
      <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {msg}
    </div>
  );
}
