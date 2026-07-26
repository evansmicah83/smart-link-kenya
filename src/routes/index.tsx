import { useState, useEffect } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Wifi, Router as RouterIcon, Receipt, Users, ShieldCheck, Map,
  Activity, CreditCard, ArrowRight, CheckCircle2, MessageCircle,
  Mail, MapPin, Star, Zap, Globe, Lock, Menu, X, Sun, Moon,
} from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SmartLinkNet — ISP, Hotspot & Fiber Management for Kenya" },
      { name: "description", content: "Run your ISP from one platform: MikroTik, Hotspot, PPPoE, M-Pesa billing, CRM, support, inventory, and field operations." },
      { property: "og:title", content: "SmartLinkNet — ISP & Network Management Platform" },
      { property: "og:description", content: "Built for Kenyan ISPs, WISPs, fiber operators, hotels, schools, and estates." },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen gradient-hero">
      <Header />
      <Hero />
      <FeatureGrid />
      <Testimonials />
      <PricingTeaser />
      <Footer />
      <WhatsAppFloat />
    </div>
  );
}

const WA_LINK = "https://wa.me/254759817301";

function useDarkMode(): [boolean, () => void] {
  const [dark, setDark] = useState(() =>
    typeof window !== "undefined"
      ? document.documentElement.classList.contains("dark")
      : false
  );
  useEffect(() => {
    if (dark) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  }, [dark]);
  // Restore saved preference on first load
  useEffect(() => {
    const saved = localStorage.getItem("theme");
    if (saved === "dark") setDark(true);
    else if (saved === "light") setDark(false);
    else if (window.matchMedia("(prefers-color-scheme: dark)").matches) setDark(true);
  }, []);
  return [dark, () => setDark((v) => !v)];
}

function DarkToggle({ dark, toggle }: { dark: boolean; toggle: () => void }) {
  return (
    <button
      onClick={toggle}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      className="grid h-9 w-9 place-items-center rounded-md border border-border/60 bg-card/60 text-foreground transition hover:bg-accent"
    >
      {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}

function Header() {
  const [open, setOpen] = useState(false);
  const [dark, toggleDark] = useDarkMode();
  const close = () => setOpen(false);

  const navLinks = [
    { href: "#features", label: "Features" },
    { href: "#pricing", label: "Pricing" },
    { href: "#testimonials", label: "Reviews" },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2" onClick={close}>
          <div className="grid h-8 w-8 place-items-center rounded-md bg-primary text-primary-foreground">
            <Wifi className="h-4 w-4" />
          </div>
          <span className="text-lg font-semibold tracking-tight">
            SmartLink<span className="text-primary">Net</span>
          </span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
          {navLinks.map((l) => (
            <a key={l.href} href={l.href} className="transition hover:text-foreground">{l.label}</a>
          ))}
          <a
            href={WA_LINK}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-success transition hover:text-success/80"
          >
            <MessageCircle className="h-4 w-4" /> WhatsApp
          </a>
        </nav>

        {/* Desktop right: dark toggle + auth */}
        <div className="hidden items-center gap-2 md:flex">
          <DarkToggle dark={dark} toggle={toggleDark} />
          <Link to="/auth" className="rounded-md px-3 py-2 text-sm hover:bg-accent">
            Sign in
          </Link>
          <Link
            to="/auth"
            search={{ mode: "signup", plan: "starter" } as never}
            className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Start free trial
          </Link>
        </div>

        {/* Mobile right: dark toggle + trial btn + hamburger */}
        <div className="flex items-center gap-2 md:hidden">
          <DarkToggle dark={dark} toggle={toggleDark} />
          <Link
            to="/auth"
            search={{ mode: "signup", plan: "starter" } as never}
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
          >
            Free trial
          </Link>
          <button
            onClick={() => setOpen((v) => !v)}
            aria-label="Toggle menu"
            className="grid h-9 w-9 place-items-center rounded-md border border-border/60 bg-card/60 text-foreground transition hover:bg-accent"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile drawer */}
      {open && (
        <div className="border-t border-border/60 bg-background/95 backdrop-blur-xl md:hidden">
          <nav className="mx-auto flex max-w-7xl flex-col px-4 py-4 gap-1">
            {navLinks.map((l) => (
              <a
                key={l.href}
                href={l.href}
                onClick={close}
                className="rounded-md px-3 py-3 text-sm font-medium text-muted-foreground transition hover:bg-accent hover:text-foreground"
              >
                {l.label}
              </a>
            ))}
            <a
              href={WA_LINK}
              target="_blank"
              rel="noopener noreferrer"
              onClick={close}
              className="flex items-center gap-2 rounded-md px-3 py-3 text-sm font-medium text-success transition hover:bg-success/10"
            >
              <MessageCircle className="h-4 w-4" /> Chat on WhatsApp
            </a>
            <div className="mt-2 border-t border-border/60 pt-3 flex items-center gap-2">
              <Link
                to="/auth"
                onClick={close}
                className="flex-1 rounded-md px-3 py-2.5 text-center text-sm font-medium text-muted-foreground transition hover:bg-accent hover:text-foreground"
              >
                Sign in
              </Link>
              <Link
                to="/auth"
                search={{ mode: "signup", plan: "starter" } as never}
                onClick={close}
                className="flex-1 rounded-md bg-primary px-3 py-2.5 text-center text-sm font-semibold text-primary-foreground hover:opacity-90"
              >
                Start free trial
              </Link>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}

function Hero() {
  return (
    <section className="mx-auto max-w-7xl px-4 sm:px-6 pt-14 pb-16 sm:pt-20 sm:pb-24 text-center">
      <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/40 px-3 py-1 text-xs text-muted-foreground">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" />
        Built for Kenyan ISPs · M-Pesa native · MikroTik ready
      </div>
      <h1 className="mx-auto mt-5 max-w-4xl text-4xl font-bold leading-tight tracking-tight sm:text-5xl md:text-6xl">
        The operating system for{" "}
        <span className="text-gradient">internet providers</span>
      </h1>
      <p className="mx-auto mt-5 max-w-2xl text-base text-muted-foreground sm:text-lg">
        Manage hotspots, PPPoE, fiber, billing, CRM, inventory, support, and field ops —
        across every router, branch, and customer — from one secure cloud platform.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link
          to="/auth"
          search={{ mode: "signup", plan: "growth" } as never}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-glow hover:opacity-90"
        >
          Free Trial <ArrowRight className="h-4 w-4" />
        </Link>
        <a
          href={WA_LINK}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-md border border-success/50 bg-success/10 px-5 py-2.5 text-sm font-semibold text-success hover:bg-success/20"
        >
          <MessageCircle className="h-4 w-4" /> WhatsApp
        </a>
      </div>
      {/* Trust badges */}
      <div className="mx-auto mt-6 flex flex-wrap justify-center gap-3 text-xs text-muted-foreground">
        {["No credit card required", "Cancel anytime", "Setup in 10 min", "M-Pesa included"].map((t) => (
          <span key={t} className="flex items-center gap-1">
            <CheckCircle2 className="h-3.5 w-3.5 text-success" /> {t}
          </span>
        ))}
      </div>
      {/* Stats */}
      <div className="mx-auto mt-12 grid max-w-3xl grid-cols-2 gap-4 text-left sm:gap-6 md:grid-cols-4">
        {[
          { label: "ISPs Onboarded", value: "500+" },
          { label: "Customers Managed", value: "120K+" },
          { label: "M-Pesa Processed", value: "KES 2B+" },
          { label: "Uptime SLA", value: "99.9%" },
        ].map((s) => (
          <div key={s.label} className="rounded-lg border border-border/60 bg-card/50 p-4">
            <div className="text-xl font-bold text-foreground">{s.value}</div>
            <div className="mt-0.5 text-xs uppercase tracking-wide text-muted-foreground">{s.label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

const FEATURES = [
  { icon: RouterIcon, title: "MikroTik & PPPoE", desc: "Provision profiles, queues and PPPoE users across every router." },
  { icon: Wifi, title: "Hotspot & Vouchers", desc: "Captive portals, voucher batches, QR codes and fair-usage policies." },
  { icon: CreditCard, title: "M-Pesa Billing", desc: "STK Push, recurring invoices, wallets and auto-reactivation." },
  { icon: Users, title: "CRM & KYC", desc: "Customers, KRA PIN, IDs, contracts, notes and lifecycle tracking." },
  { icon: Activity, title: "NOC Monitoring", desc: "Live CPU, traffic, uptime and outage alerts for every device." },
  { icon: Receipt, title: "Accounting", desc: "Revenue, expenses, P&L and tax-ready reports by branch." },
  { icon: Map, title: "GIS & Field Ops", desc: "Map customers, technicians and fiber routes. Schedule jobs." },
  { icon: ShieldCheck, title: "Multi-tenant SaaS", desc: "Branding, branches, roles, audit logs and RLS isolation." },
];

const TESTIMONIALS = [
  { name: "James Mwangi", role: "CEO, SwiftNet Nakuru", stars: 5, text: "SmartLinkNet replaced 4 different tools we were using. M-Pesa billing alone saved us 3 hours a day. Best investment for our ISP." },
  { name: "Aisha Omondi", role: "Operations, FiberLink Mombasa", stars: 5, text: "The NOC dashboard is incredible. We catch outages before customers even call. Setup took less than a day." },
  { name: "Peter Kamau", role: "Founder, QuickWifi Kisumu", stars: 5, text: "Affordable pricing and it just works. Our hotspot voucher sales doubled after switching. Support team is very responsive on WhatsApp." },
];

function FeatureGrid() {
  return (
    <section id="features" className="border-t border-border/60 bg-background/40 py-16 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl md:text-4xl">Everything an ISP runs on</h2>
          <p className="mt-3 text-sm text-muted-foreground sm:text-base">
            One platform replaces your billing tool, CRM, NOC dashboard, voucher printer and field tracker.
          </p>
        </div>
        <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 sm:mt-14 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <div key={f.title} className="card-hover group rounded-xl border border-border/60 bg-card/60 p-5 transition hover:border-primary/50 hover:bg-card">
              <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary">
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Testimonials() {
  return (
    <section id="testimonials" className="border-t border-border/60 bg-background/60 py-16 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl md:text-4xl">Trusted by Kenyan ISPs</h2>
          <p className="mt-3 text-sm text-muted-foreground sm:text-base">Real feedback from operators running their networks on SmartLinkNet.</p>
        </div>
        <div className="mt-10 grid grid-cols-1 gap-5 sm:mt-12 md:grid-cols-3">
          {TESTIMONIALS.map((t) => (
            <div key={t.name} className="card-hover rounded-xl border border-border/60 bg-card/70 p-5 sm:p-6">
              <div className="flex gap-0.5">
                {Array.from({ length: t.stars }).map((_, i) => (
                  <Star key={i} className="h-4 w-4 fill-warning text-warning" />
                ))}
              </div>
              <p className="mt-4 text-sm leading-relaxed text-muted-foreground">“{t.text}”</p>
              <div className="mt-5 flex items-center gap-3">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/15 text-sm font-bold text-primary">
                  {t.name.charAt(0)}
                </div>
                <div>
                  <div className="text-sm font-semibold">{t.name}</div>
                  <div className="text-xs text-muted-foreground">{t.role}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const PLANS = [
  { name: "Starter", price: "KES 499", desc: "Small WISPs, estates & schools", features: ["Up to 100 customers", "2 routers", "Hotspot + PPPoE", "M-Pesa STK", "Email support"] },
  { name: "Growth", price: "KES 1,299", desc: "Growing ISPs & fiber operators", features: ["Up to 1,000 customers", "Unlimited routers", "Multi-branch", "Field ops + GIS", "Priority support"], featured: true },
  { name: "Enterprise", price: "KES 2,999", desc: "Large & national operators", features: ["Unlimited customers", "Unlimited routers", "SLA + onboarding", "Dedicated tenant", "SAML SSO + 24/7 support"] },
];

function PricingTeaser() {
  return (
    <section id="pricing" className="py-16 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl md:text-4xl">Pricing built for Kenya</h2>
          <p className="mt-3 text-sm text-muted-foreground sm:text-base">Pay in KES. Start with a 14-day trial — no card required.</p>
        </div>
        <div className="mt-10 grid grid-cols-1 gap-5 sm:mt-12 md:grid-cols-3">
          {PLANS.map((p) => (
            <div
              key={p.name}
              className={`rounded-xl border p-6 sm:p-8 ${
                p.featured ? "border-primary bg-card shadow-glow" : "border-border/60 bg-card/60"
              }`}
            >
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">{p.name}</h3>
                {p.featured && (
                  <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs text-primary">Popular</span>
                )}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{p.desc}</p>
              <div className="mt-5 text-3xl font-bold">
                {p.price}<span className="text-base font-normal text-muted-foreground">/mo</span>
              </div>
              <ul className="mt-5 space-y-2.5 text-sm">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <Link
                to="/auth"
                search={{ mode: "signup", plan: p.name === "Starter" ? "starter" : p.name === "Growth" ? "growth" : "enterprise" } as never}
                className="mt-7 inline-flex w-full items-center justify-center rounded-md bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground hover:opacity-90"
              >
                Start free trial
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border/60 bg-card/40">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-12 sm:py-16">
        <div className="grid grid-cols-2 gap-8 sm:gap-10 md:grid-cols-4">
          {/* Brand — full width on smallest screens */}
          <div className="col-span-2 md:col-span-1">
            <Link to="/" className="flex items-center gap-2">
              <div className="grid h-8 w-8 place-items-center rounded-md bg-primary text-primary-foreground">
                <Wifi className="h-4 w-4" />
              </div>
              <span className="text-lg font-semibold tracking-tight">
                SmartLink<span className="text-primary">Net</span>
              </span>
            </Link>
            <p className="mt-4 text-sm text-muted-foreground leading-relaxed">
              The all-in-one ISP management platform built for Kenya. MikroTik, M-Pesa, fiber, hotspot — all in one place.
            </p>
            <div className="mt-5 flex flex-col gap-2.5 text-sm text-muted-foreground">
              <a href={WA_LINK} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 transition hover:text-success">
                <MessageCircle className="h-4 w-4 shrink-0 text-success" /> +254 759 817 301
              </a>
              <a href="mailto:support@smartlinknet.co.ke"
                className="flex items-center gap-2 transition hover:text-foreground">
                <Mail className="h-4 w-4 shrink-0" /> support@smartlinknet.co.ke
              </a>
              <span className="flex items-center gap-2">
                <MapPin className="h-4 w-4 shrink-0" /> Nairobi, Kenya
              </span>
            </div>
          </div>

          {/* Product */}
          <div>
            <h4 className="mb-4 text-sm font-semibold">Product</h4>
            <ul className="space-y-2.5 text-sm text-muted-foreground">
              <li><a href="#features" className="transition hover:text-foreground">Features</a></li>
              <li><a href="#pricing" className="transition hover:text-foreground">Pricing</a></li>
              <li><a href="#testimonials" className="transition hover:text-foreground">Reviews</a></li>
              <li><Link to="/auth" search={{ mode: "signup", plan: "starter" } as never} className="transition hover:text-foreground">Start Free Trial</Link></li>
            </ul>
          </div>

          {/* Solutions */}
          <div>
            <h4 className="mb-4 text-sm font-semibold">Solutions</h4>
            <ul className="space-y-2.5 text-sm text-muted-foreground">
              {["Hotspot & Vouchers", "PPPoE & Fiber", "M-Pesa Billing", "NOC Monitoring", "Field Operations", "Multi-branch ISPs"].map((s) => (
                <li key={s}><span className="cursor-default transition hover:text-foreground">{s}</span></li>
              ))}
            </ul>
          </div>

          {/* Support */}
          <div>
            <h4 className="mb-4 text-sm font-semibold">Support</h4>
            <ul className="space-y-2.5 text-sm text-muted-foreground">
              <li>
                <a href={WA_LINK} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 font-medium text-success transition hover:text-success/80">
                  <MessageCircle className="h-4 w-4" /> WhatsApp Support
                </a>
              </li>
              <li><a href="mailto:support@smartlinknet.co.ke" className="transition hover:text-foreground">Email Support</a></li>
              <li><Link to="/auth" className="transition hover:text-foreground">Sign In</Link></li>
              <li><Link to="/auth" search={{ mode: "signup", plan: "starter" } as never} className="transition hover:text-foreground">Create Account</Link></li>
            </ul>
            <div className="mt-6 rounded-lg border border-success/30 bg-success/5 p-4">
              <p className="text-xs text-muted-foreground">Need help getting started?</p>
              <a href={WA_LINK} target="_blank" rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-success px-3 py-1.5 text-xs font-semibold text-white hover:bg-success/90">
                <MessageCircle className="h-3.5 w-3.5" /> Chat with us
              </a>
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-10 flex flex-col items-center justify-between gap-4 border-t border-border/60 pt-8 text-xs text-muted-foreground sm:mt-12 md:flex-row">
          <p>© {new Date().getFullYear()} SmartLinkNet. Made with ❤️ in Nairobi, Kenya.</p>
          <div className="flex flex-wrap justify-center gap-4">
            {["Privacy Policy", "Terms of Service", "Acceptable Use"].map((l) => (
              <a key={l} href="#" className="transition hover:text-foreground">{l}</a>
            ))}
          </div>
          <div className="flex flex-wrap justify-center gap-3">
            <span className="flex items-center gap-1"><Zap className="h-3.5 w-3.5 text-warning" /> M-Pesa</span>
            <span className="flex items-center gap-1"><Globe className="h-3.5 w-3.5 text-primary" /> Kenya</span>
            <span className="flex items-center gap-1"><Lock className="h-3.5 w-3.5 text-success" /> SSL</span>
          </div>
        </div>
      </div>
    </footer>
  );
}

function WhatsAppFloat() {
  return (
    <a
      href={WA_LINK}
      target="_blank"
      rel="noopener noreferrer"
      title="Chat with us on WhatsApp"
      className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-success text-white shadow-lg transition hover:scale-110 hover:bg-success/90"
    >
      <MessageCircle className="h-7 w-7" />
    </a>
  );
}
