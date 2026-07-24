import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { toast } from "sonner";
import { Wifi, Loader2, ArrowLeft, Eye, EyeOff, CheckCircle2, Shield, Zap, Users } from "lucide-react";

const searchSchema = z.object({
  mode: z.enum(["signin", "signup"]).optional(),
  redirect: z.string().optional(),
  plan: z.string().optional(),
  reason: z.enum(["idle", "expired"]).optional(),
});

export const Route = createFileRoute("/auth")({
  ssr: false,
  validateSearch: (s) => searchSchema.parse(s),
  head: () => ({
    meta: [
      { title: "Sign in — SmartLinkNet" },
      { name: "description", content: "Sign in to manage your ISP, hotspots, and customers on SmartLinkNet." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthPage,
});

// Kenya-themed ISP/tech images from Unsplash
const BG_IMAGES = [
  "https://images.unsplash.com/photo-1611348586804-61bf6c080437?w=1200&q=80", // Nairobi skyline night
  "https://images.unsplash.com/photo-1580060839134-75a5edca2e99?w=1200&q=80", // Africa tech/network
  "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=1200&q=80", // Network cables/ISP
];

const FEATURES = [
  { icon: Zap, text: "M-Pesa STK Push billing — automated & instant" },
  { icon: Wifi, text: "MikroTik & PPPoE provisioning in one click" },
  { icon: Users, text: "Full CRM, ticketing & field ops for your team" },
  { icon: Shield, text: "Multi-tenant, role-based, RLS-secured platform" },
];

function AuthPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const [mounted, setMounted] = useState(false);
  const [mode, setMode] = useState<"signin" | "signup">(search.mode ?? "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [fullName, setFullName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);
  const [bgIndex, setBgIndex] = useState(0);
  const [attempts, setAttempts] = useState(0);
  const [lockoutUntil, setLockoutUntil] = useState<number | null>(null);
  const [lockoutSeconds, setLockoutSeconds] = useState(0);
  useEffect(() => { setBgIndex(Math.floor(Math.random() * BG_IMAGES.length)); }, []);
  const plan = search.plan;
  const reason = search.reason;

  useEffect(() => { setMounted(true); }, []);

  // Lockout countdown
  useEffect(() => {
    if (!lockoutUntil) return;
    const tick = setInterval(() => {
      const secs = Math.ceil((lockoutUntil - Date.now()) / 1000);
      if (secs <= 0) { setLockoutUntil(null); setLockoutSeconds(0); clearInterval(tick); }
      else setLockoutSeconds(secs);
    }, 1000);
    return () => clearInterval(tick);
  }, [lockoutUntil]);

  useEffect(() => {
    if (!mounted) return;
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard" });
    });
  }, [mounted, navigate]);

  if (!mounted) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/dashboard`,
            data: { full_name: fullName, company_name: companyName, phone, plan },
          },
        });
        if (error) throw error;
        const userId = (data as any)?.user?.id;
        if (userId) {
          try {
            await supabase.functions.invoke("signup-send-otp", { body: { userId, email, phone } });
          } catch (e) {
            console.warn("signup-send-otp failed:", e);
          }
        }
        if (data.session) {
          toast.success("Welcome to SmartLinkNet");
          navigate({ to: "/dashboard" });
        } else {
          toast.success("Check your email to confirm your account. We also sent an SMS verification code.");
          navigate({ to: "/verify" });
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          const next = attempts + 1;
          setAttempts(next);
          // Progressive lockout: 3 fails = 30s, 5 fails = 120s
          if (next >= 5) setLockoutUntil(Date.now() + 120_000);
          else if (next >= 3) setLockoutUntil(Date.now() + 30_000);
          throw error;
        }
        setAttempts(0);
        toast.success("Signed in");
        navigate({ to: search.redirect ?? "/dashboard" });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setOauthLoading(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: `${window.location.origin}/dashboard`,
      });
      if (result.error) { toast.error(result.error.message ?? "Google sign-in failed"); return; }
      if (result.redirected) return;
      navigate({ to: "/dashboard" });
    } finally {
      setOauthLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex bg-background">
      {/* ── Left panel — hero image + features ── */}
      <div className="relative hidden lg:flex lg:w-[55%] xl:w-[60%] flex-col overflow-hidden">
        {/* Background image */}
        <img
          src={BG_IMAGES[bgIndex]}
          alt="Kenya ISP"
          className="absolute inset-0 h-full w-full object-cover"
        />
        {/* Dark overlay gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-black/80 via-black/60 to-primary/40" />

        {/* Content */}
        <div className="relative z-10 flex flex-col h-full p-10 xl:p-14">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-3 w-fit">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary text-primary-foreground shadow-lg">
              <Wifi className="h-5 w-5" />
            </div>
            <span className="text-xl font-bold text-white tracking-tight">
              SmartLink<span className="text-primary">Net</span>
            </span>
          </Link>

          {/* Hero text */}
          <div className="mt-auto mb-10">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs text-white/80 backdrop-blur-sm mb-6">
              <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
              Built for Kenyan ISPs · M-Pesa Native · MikroTik Ready
            </div>
            <h1 className="text-4xl xl:text-5xl font-bold text-white leading-tight tracking-tight">
              The operating system<br />
              <span className="text-primary">for internet providers</span>
            </h1>
            <p className="mt-4 text-base text-white/70 max-w-md leading-relaxed">
              Manage hotspots, PPPoE, fiber, billing, CRM, inventory, support and field ops — all from one secure cloud platform.
            </p>

            {/* Feature list */}
            <div className="mt-8 grid grid-cols-1 gap-3 max-w-md">
              {FEATURES.map(({ icon: Icon, text }) => (
                <div key={text} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm px-4 py-3">
                  <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/20 text-primary">
                    <Icon className="h-4 w-4" />
                  </div>
                  <span className="text-sm text-white/85">{text}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Stats bar */}
          <div className="grid grid-cols-3 gap-4 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-5">
            {[
              { value: "500+", label: "ISPs onboarded" },
              { value: "99.9%", label: "Uptime SLA" },
              { value: "M-Pesa", label: "Native payments" },
            ].map((s) => (
              <div key={s.label} className="text-center">
                <div className="text-xl font-bold text-white">{s.value}</div>
                <div className="text-xs text-white/60 mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Right panel — form ── */}
      <div className="flex flex-1 flex-col min-h-screen overflow-y-auto">
        {/* Mobile top bar */}
        <div className="flex items-center justify-between px-6 py-4 lg:hidden border-b border-border/60">
          <Link to="/" className="flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-primary-foreground">
              <Wifi className="h-4 w-4" />
            </div>
            <span className="font-bold text-sm">SmartLink<span className="text-primary">Net</span></span>
          </Link>
          <Link to="/" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Back
          </Link>
        </div>

        {/* Desktop back link */}
        <div className="hidden lg:flex items-center justify-end px-10 pt-6">
          <Link to="/" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" /> Back to home
          </Link>
        </div>

        {/* Form container */}
        <div className="flex flex-1 items-center justify-center px-6 py-8 lg:px-12 xl:px-16">
          <div className="w-full max-w-md">

            {/* Idle / expired session banner */}
            {reason === "idle" && (
              <div className="mb-6 flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-600 dark:text-amber-400">
                <Shield className="h-4 w-4 mt-0.5 shrink-0" />
                <span>You were signed out after 30 minutes of inactivity. Please sign in again.</span>
              </div>
            )}
            {reason === "expired" && (
              <div className="mb-6 flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-400">
                <Shield className="h-4 w-4 mt-0.5 shrink-0" />
                <span>Your session expired. Please sign in again to continue.</span>
              </div>
            )}

            {/* Lockout banner */}
            {lockoutUntil && lockoutSeconds > 0 && (
              <div className="mb-6 flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-400">
                <Shield className="h-4 w-4 mt-0.5 shrink-0" />
                <span>Too many failed attempts. Try again in <strong>{lockoutSeconds}s</strong>.</span>
              </div>
            )}

            {/* Heading */}
            <div className="mb-8">
              <h2 className="text-2xl font-bold tracking-tight">
                {mode === "signin" ? "Welcome back 👋" : "Create your account"}
              </h2>
              <p className="mt-1.5 text-sm text-muted-foreground">
                {mode === "signin"
                  ? "Sign in to your ISP dashboard to continue"
                  : `Start your 14-day free trial${plan ? ` on the ${plan.charAt(0).toUpperCase() + plan.slice(1)} plan` : ""}`}
              </p>
            </div>

            {/* Plan badge (signup only) */}
            {mode === "signup" && plan && (
              <div className="mb-6 flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3">
                <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                <div>
                  <div className="text-xs text-muted-foreground">Selected plan</div>
                  <div className="text-sm font-semibold capitalize">{plan} — 14-day free trial</div>
                </div>
              </div>
            )}

            {/* Google OAuth */}
            <button
              onClick={handleGoogle}
              disabled={oauthLoading}
              className="flex w-full items-center justify-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-sm font-medium shadow-sm hover:bg-accent transition-colors disabled:opacity-50"
            >
              {oauthLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <GoogleIcon />}
              Continue with Google
            </button>

            {/* Divider */}
            <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
              <div className="h-px flex-1 bg-border" />
              <span>or continue with email</span>
              <div className="h-px flex-1 bg-border" />
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === "signup" && (
                <>
                  <Field label="Full name">
                    <input
                      required value={fullName} onChange={(e) => setFullName(e.target.value)}
                      className="auth-input" placeholder="Jane Wanjiru"
                    />
                  </Field>
                  <Field label="Company / ISP name">
                    <input
                      required value={companyName} onChange={(e) => setCompanyName(e.target.value)}
                      className="auth-input" placeholder="SwiftNet Limited"
                    />
                  </Field>
                  <Field label="Contact phone">
                    <input
                      required value={phone} onChange={(e) => setPhone(e.target.value)}
                      className="auth-input" placeholder="+254 712 345 678" type="tel"
                    />
                  </Field>
                </>
              )}

              <Field label="Email address">
                <input
                  type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                  className="auth-input" placeholder="Email"
                />
              </Field>

              <Field label="Password">
                <div className="relative">
                  <input
                    type={showPw ? "text" : "password"} required minLength={8}
                    value={password} onChange={(e) => setPassword(e.target.value)}
                    className="auth-input pr-10" placeholder="Password"
                  />
                  <button
                    type="button" onClick={() => setShowPw((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </Field>

              <button
                disabled={loading || (!!lockoutUntil && lockoutSeconds > 0)}
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-sm hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                {lockoutUntil && lockoutSeconds > 0
                  ? `Try again in ${lockoutSeconds}s`
                  : mode === "signin" ? "Sign in to dashboard" : "Create account — it's free"}
              </button>
            </form>

            {/* Toggle mode */}
            <p className="mt-6 text-center text-sm text-muted-foreground">
              {mode === "signin" ? "Don't have an account? " : "Already have an account? "}
              <button
                onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
                className="font-semibold text-primary hover:underline"
              >
                {mode === "signin" ? "Sign up free" : "Sign in"}
              </button>
            </p>

            {/* Trust badges */}
            <div className="mt-8 flex items-center justify-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><Shield className="h-3 w-3" /> SSL secured</span>
              <span className="h-3 w-px bg-border" />
              <span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> No credit card</span>
              <span className="h-3 w-px bg-border" />
              <span className="flex items-center gap-1"><Zap className="h-3 w-3" /> M-Pesa ready</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 text-center text-xs text-muted-foreground border-t border-border/40">
          © {new Date().getFullYear()} SmartLinkNet · Made in Nairobi 🇰🇪
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.4 29.3 35.5 24 35.5c-6.4 0-11.5-5.1-11.5-11.5S17.6 12.5 24 12.5c2.9 0 5.6 1.1 7.6 2.9l5.7-5.7C33.6 6.4 29 4.5 24 4.5 13.2 4.5 4.5 13.2 4.5 24S13.2 43.5 24 43.5 43.5 34.8 43.5 24c0-1.2-.1-2.4-.3-3.5z"/>
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 16 18.9 12.5 24 12.5c2.9 0 5.6 1.1 7.6 2.9l5.7-5.7C33.6 6.4 29 4.5 24 4.5 16.3 4.5 9.7 8.9 6.3 14.7z"/>
      <path fill="#4CAF50" d="M24 43.5c5.2 0 9.8-1.8 13.3-4.8l-6.1-5c-2 1.4-4.4 2.3-7.2 2.3-5.3 0-9.7-3.4-11.3-8.1l-6.5 5C9.5 39 16.2 43.5 24 43.5z"/>
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.5l6.1 5C40.7 35.4 43.5 30.1 43.5 24c0-1.2-.1-2.4-.3-3.5z"/>
    </svg>
  );
}
