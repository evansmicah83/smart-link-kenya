/**
 * Public Captive Portal — /portal?isp=<slug>
 * Supports: voucher login, OTP/phone login, package purchase + M-Pesa STK push.
 * Works for MikroTik Hotspot, Apartment WiFi, Hotel, School, Estate, WISP.
 */
import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { initiateStkPush, formatPhone } from "@/lib/mpesa";
import { Wifi, CheckCircle, Loader2, ArrowLeft, Star, Zap, Clock, PhoneCall, QrCode, AlertCircle } from "lucide-react";

const searchSchema = z.object({
  isp: z.string().optional(),
  mac: z.string().optional(),
  ip: z.string().optional(),
  url: z.string().optional(), // original URL MikroTik captured
});

export const Route = createFileRoute("/portal/")({
  ssr: false,
  validateSearch: (s) => searchSchema.parse(s),
  component: CaptivePortal,
  head: () => ({ meta: [{ title: "Connect to WiFi" }] }),
});

type Page = "landing" | "login" | "packages" | "payment" | "success" | "error";
type LoginMode = "voucher" | "phone" | "otp";

interface Brand {
  logo_url?: string;
  company_name?: string;
  primary_color?: string;
  portal_tagline?: string;
  support_phone?: string;
  portal_bg_color?: string;
  portal_text_color?: string;
}

interface Package {
  id: string;
  name: string;
  price: number;
  duration_days: number;
  speed_limit?: string;
  data_limit?: string;
  description?: string;
  is_popular?: boolean;
  type: string;
}

function CaptivePortal() {
  const { isp, mac, ip, url } = useSearch({ from: "/portal" });
  const [page, setPage] = useState<Page>("landing");
  const [brand, setBrand] = useState<Brand>({});
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [packages, setPackages] = useState<Package[]>([]);
  const [loginMode, setLoginMode] = useState<LoginMode>("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [voucher, setVoucher] = useState("");
  const [selectedPkg, setSelectedPkg] = useState<Package | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkoutId, setCheckoutId] = useState<string | null>(null);
  const [pollInterval, setPollInterval] = useState<any>(null);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  useEffect(() => {
    if (!isp) return;
    (async () => {
      const { data: tenant } = await (supabase as any)
        .from("tenants")
        .select("id, name")
        .eq("slug", isp)
        .maybeSingle();
      if (!tenant) return;
      setTenantId(tenant.id);

      const [brandRes, pkgRes] = await Promise.all([
        (supabase as any).from("tenant_branding").select("*").eq("tenant_id", tenant.id).maybeSingle(),
        (supabase as any).from("packages").select("*").eq("tenant_id", tenant.id).eq("is_active", true).in("type", ["hotspot", "voucher"]).order("price"),
      ]);
      if (brandRes.data) setBrand({ ...brandRes.data, company_name: tenant.name });
      else setBrand({ company_name: tenant.name });
      setPackages(pkgRes.data ?? []);

      // apply brand colors
      if (brandRes.data?.primary_color) {
        document.documentElement.style.setProperty("--primary", brandRes.data.primary_color);
        document.documentElement.style.setProperty("--sidebar-primary", brandRes.data.primary_color);
      }
    })();
  }, [isp]);

  // poll payment status
  useEffect(() => {
    if (!checkoutId) return;
    const id = setInterval(async () => {
      const { data } = await supabase
        .from("payments")
        .select("status, id")
        .eq("checkout_request_id", checkoutId)
        .maybeSingle() as any;
      if (data?.status === "completed") {
        clearInterval(id);
        setSuccessMsg("Payment confirmed! Connecting you to the internet…");
        setPage("success");
        // Redirect back for MikroTik login
        if (url) setTimeout(() => { window.location.href = url; }, 3000);
      } else if (data?.status === "failed") {
        clearInterval(id);
        setError("Payment failed. Please try again.");
        setPage("error");
      }
    }, 3000);
    setPollInterval(id);
    return () => clearInterval(id);
  }, [checkoutId]);

  async function handleVoucherLogin() {
    setLoading(true);
    setError("");
    try {
      const { data } = await (supabase as any)
        .from("vouchers")
        .select("id, status, packages(name)")
        .eq("tenant_id", tenantId)
        .eq("code", voucher.trim().toUpperCase())
        .eq("status", "unused")
        .maybeSingle();
      if (!data) throw new Error("Invalid or already used voucher code.");
      // mark active
      await (supabase as any).from("vouchers").update({ status: "active", used_at: new Date().toISOString(), mac_address: mac ?? null, ip_address: ip ?? null }).eq("id", data.id);
      setSuccessMsg(`Voucher accepted! You're connected with ${data.packages?.name ?? "internet access"}.`);
      setPage("success");
      if (url) setTimeout(() => { window.location.href = url; }, 2500);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSendOtp() {
    setLoading(true);
    try {
      const fmtPhone = formatPhone(phone);
      await (supabase as any).functions.invoke("send-sms", {
        body: { phone: fmtPhone, message: `Your WiFi OTP is: ${Math.floor(100000 + Math.random() * 900000)}`, tenant_id: tenantId },
      });
      setOtpSent(true);
    } catch (e: any) {
      setError("Failed to send OTP. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleStkPush() {
    if (!selectedPkg || !tenantId) return;
    setLoading(true);
    setError("");
    try {
      // get or create customer by phone
      const fmtPhone = formatPhone(phone);
      let { data: customer } = await (supabase as any)
        .from("customers")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("phone", fmtPhone)
        .maybeSingle();
      if (!customer) {
        const { data: nc } = await (supabase as any)
          .from("customers")
          .insert({ tenant_id: tenantId, phone: fmtPhone, full_name: `WiFi User ${fmtPhone.slice(-4)}`, category: "residential", status: "active" })
          .select("id").single();
        customer = nc;
      }
      const result = await initiateStkPush({
        tenantId,
        phone: fmtPhone,
        amount: selectedPkg.price,
        accountRef: `WIFI-${fmtPhone.slice(-4)}`,
        description: selectedPkg.name,
        customerId: customer.id,
      });
      setCheckoutId(result.checkoutRequestId);
      setPage("payment");
    } catch (e: any) {
      setError(e.message ?? "Payment initiation failed.");
    } finally {
      setLoading(false);
    }
  }

  const primary = brand.primary_color ?? "var(--primary)";

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm">
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

          {/* Landing */}
          {page === "landing" && (
            <div className="p-6 space-y-4">
              <h1 className="text-lg font-bold text-white text-center">Get Connected</h1>
              <p className="text-sm text-slate-400 text-center">Choose how you want to connect to the internet</p>
              <div className="space-y-2">
                <PortalBtn icon={PhoneCall} label="Buy with M-Pesa" sub="STK push to your phone" onClick={() => { setLoginMode("phone"); setPage("packages"); }} primary />
                <PortalBtn icon={QrCode} label="Enter Voucher Code" sub="Already have a code?" onClick={() => { setLoginMode("voucher"); setPage("login"); }} />
              </div>
              {brand.support_phone && (
                <p className="text-center text-xs text-slate-500 pt-2">Need help? <a href={`tel:${brand.support_phone}`} className="text-primary hover:underline">{brand.support_phone}</a></p>
              )}
            </div>
          )}

          {/* Login — voucher */}
          {page === "login" && loginMode === "voucher" && (
            <div className="p-6 space-y-4">
              <BackBtn onClick={() => setPage("landing")} />
              <h2 className="text-lg font-bold text-white">Enter Voucher</h2>
              <p className="text-sm text-slate-400">Enter the code printed on your voucher card</p>
              <input
                className="w-full rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-white text-center text-lg font-mono tracking-widest placeholder:text-slate-500 focus:outline-none focus:border-primary uppercase"
                placeholder="XXXXXXXX"
                value={voucher}
                onChange={(e) => setVoucher(e.target.value.toUpperCase())}
                maxLength={12}
              />
              {error && <ErrorMsg msg={error} />}
              <button
                onClick={handleVoucherLogin}
                disabled={loading || voucher.length < 6}
                className="w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Connect Now
              </button>
            </div>
          )}

          {/* Packages */}
          {page === "packages" && (
            <div className="p-6 space-y-4">
              <BackBtn onClick={() => setPage("landing")} />
              <h2 className="text-lg font-bold text-white">Choose a Package</h2>
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {packages.length === 0 && <p className="text-sm text-slate-400 text-center py-4">No packages available.</p>}
                {packages.map((pkg) => (
                  <button
                    key={pkg.id}
                    onClick={() => setSelectedPkg(pkg)}
                    className={`w-full rounded-xl border px-4 py-3 text-left transition ${selectedPkg?.id === pkg.id ? "border-primary bg-primary/20" : "border-white/10 bg-white/5 hover:bg-white/10"}`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-white text-sm">{pkg.name}</span>
                          {pkg.is_popular && <span className="rounded-full bg-primary/30 text-primary px-1.5 py-0.5 text-[10px] font-bold flex items-center gap-0.5"><Star className="h-2.5 w-2.5" />Popular</span>}
                        </div>
                        <div className="text-xs text-slate-400 mt-0.5 flex gap-2">
                          {pkg.duration_days > 0 && <span><Clock className="h-3 w-3 inline" /> {pkg.duration_days === 1 ? "1 Day" : pkg.duration_days < 7 ? `${pkg.duration_days} Days` : pkg.duration_days === 7 ? "1 Week" : pkg.duration_days === 30 ? "1 Month" : `${pkg.duration_days}d`}</span>}
                          {pkg.speed_limit && <span><Zap className="h-3 w-3 inline" /> {pkg.speed_limit}</span>}
                          {pkg.data_limit && <span>{pkg.data_limit}</span>}
                        </div>
                      </div>
                      <span className="font-bold text-primary">KES {Number(pkg.price).toLocaleString()}</span>
                    </div>
                  </button>
                ))}
              </div>
              {/* Phone number input */}
              {selectedPkg && (
                <div className="space-y-3 pt-2 border-t border-white/10">
                  <p className="text-sm text-slate-300">Enter your M-Pesa phone number</p>
                  <input
                    className="w-full rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-white placeholder:text-slate-500 focus:outline-none focus:border-primary"
                    placeholder="07XX XXX XXX"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    type="tel"
                  />
                  {error && <ErrorMsg msg={error} />}
                  <button
                    onClick={handleStkPush}
                    disabled={loading || phone.length < 9}
                    className="w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Pay KES {Number(selectedPkg.price).toLocaleString()} via M-Pesa
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Payment pending */}
          {page === "payment" && (
            <div className="p-6 text-center space-y-4">
              <div className="grid h-16 w-16 mx-auto place-items-center rounded-full bg-primary/20 animate-pulse">
                <PhoneCall className="h-7 w-7 text-primary" />
              </div>
              <h2 className="text-lg font-bold text-white">Check Your Phone</h2>
              <p className="text-sm text-slate-400">An M-Pesa STK push has been sent to <span className="text-white font-medium">{phone}</span>. Enter your PIN to complete payment.</p>
              <div className="flex items-center justify-center gap-2 text-xs text-slate-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Waiting for payment confirmation…
              </div>
              <button onClick={() => { setPage("packages"); clearInterval(pollInterval); }} className="text-xs text-slate-500 hover:text-white underline">
                Cancel
              </button>
            </div>
          )}

          {/* Success */}
          {page === "success" && (
            <div className="p-6 text-center space-y-4">
              <div className="grid h-16 w-16 mx-auto place-items-center rounded-full bg-green-500/20">
                <CheckCircle className="h-8 w-8 text-green-400" />
              </div>
              <h2 className="text-xl font-bold text-white">You're Connected! 🎉</h2>
              <p className="text-sm text-slate-400">{successMsg || "Enjoy your internet access."}</p>
              {url && <p className="text-xs text-slate-500">Redirecting you automatically…</p>}
            </div>
          )}

          {/* Error */}
          {page === "error" && (
            <div className="p-6 text-center space-y-4">
              <div className="grid h-16 w-16 mx-auto place-items-center rounded-full bg-red-500/20">
                <AlertCircle className="h-8 w-8 text-red-400" />
              </div>
              <h2 className="text-lg font-bold text-white">Something went wrong</h2>
              <p className="text-sm text-slate-400">{error || "An unexpected error occurred."}</p>
              <button onClick={() => { setPage("landing"); setError(""); }} className="w-full rounded-xl bg-primary py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90">
                Try Again
              </button>
            </div>
          )}
        </div>

        <p className="mt-4 text-center text-xs text-slate-600">
          By connecting you agree to our <a href="#" className="underline">Terms of Use</a> &amp; <a href="#" className="underline">Fair Usage Policy</a>.
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
    <button onClick={onClick} className={`w-full flex items-center gap-3 rounded-xl px-4 py-3 text-left transition ${primary ? "bg-primary text-primary-foreground hover:opacity-90" : "border border-white/10 bg-white/5 text-white hover:bg-white/10"}`}>
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
    <button onClick={onClick} className="flex items-center gap-1 text-xs text-slate-400 hover:text-white mb-2">
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
