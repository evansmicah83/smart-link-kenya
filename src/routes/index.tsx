import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Wifi, Router as RouterIcon, Receipt, Users, ShieldCheck, Map,
  Activity, CreditCard, ArrowRight, CheckCircle2,
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
      <PricingTeaser />
      <Footer />
    </div>
  );
}

function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/70 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        <Link to="/" className="flex items-center gap-2">
          <div className="grid h-8 w-8 place-items-center rounded-md bg-primary text-primary-foreground">
            <Wifi className="h-4 w-4" />
          </div>
          <span className="text-lg font-semibold tracking-tight">
            SmartLink<span className="text-primary">Net</span>
          </span>
        </Link>
        <nav className="hidden items-center gap-8 text-sm text-muted-foreground md:flex">
          <a href="#features" className="hover:text-foreground">Features</a>
          <a href="#pricing" className="hover:text-foreground">Pricing</a>
        </nav>
        <div className="flex items-center gap-2">
          <Link to="/auth" className="rounded-md px-3 py-2 text-sm hover:bg-accent">
            Sign in
          </Link>
          <Link
            to="/auth"
            search={{ mode: "signup" } as never}
            className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Start free trial
          </Link>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="mx-auto max-w-7xl px-6 pt-20 pb-24 text-center">
      <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/40 px-3 py-1 text-xs text-muted-foreground">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" />
        Built for Kenyan ISPs · M-Pesa native · MikroTik ready
      </div>
      <h1 className="mx-auto mt-6 max-w-4xl text-5xl font-bold leading-tight tracking-tight md:text-6xl">
        The operating system for <span className="text-gradient">internet providers</span>
      </h1>
      <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
        Manage hotspots, PPPoE, fiber, billing, CRM, inventory, support, and field ops —
        across every router, branch, and customer — from one secure cloud platform.
      </p>
      <div className="mt-10 flex flex-wrap justify-center gap-3">
        <Link
          to="/auth"
          search={{ mode: "signup" } as never}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-3 text-sm font-medium text-primary-foreground shadow-glow hover:opacity-90"
        >
          Start 14-day trial <ArrowRight className="h-4 w-4" />
        </Link>
        <a href="#features" className="rounded-md border border-input px-5 py-3 text-sm font-medium hover:bg-accent">
          Explore features
        </a>
      </div>
      <div className="mx-auto mt-16 grid max-w-3xl grid-cols-2 gap-6 text-left text-sm text-muted-foreground md:grid-cols-4">
        {[
          { label: "Routers", value: "Unlimited" },
          { label: "Branches", value: "Multi-site" },
          { label: "Payments", value: "M-Pesa STK" },
          { label: "Uptime SLA", value: "99.9%" },
        ].map((s) => (
          <div key={s.label} className="rounded-lg border border-border/60 bg-card/50 p-4">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">{s.label}</div>
            <div className="mt-1 text-lg font-semibold text-foreground">{s.value}</div>
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

function FeatureGrid() {
  return (
    <section id="features" className="border-t border-border/60 bg-background/40 py-24">
      <div className="mx-auto max-w-7xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight md:text-4xl">Everything an ISP runs on</h2>
          <p className="mt-3 text-muted-foreground">
            One platform replaces your billing tool, CRM, NOC dashboard, voucher printer and field tracker.
          </p>
        </div>
        <div className="mt-16 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <div key={f.title} className="group rounded-xl border border-border/60 bg-card/60 p-6 transition hover:border-primary/50 hover:bg-card">
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

const PLANS = [
  { name: "Starter", price: "KES 4,900", desc: "Small WISPs and estates", features: ["Up to 200 customers", "2 routers", "Hotspot + PPPoE", "M-Pesa STK"] },
  { name: "Growth", price: "KES 14,900", desc: "Growing ISPs", features: ["Up to 2,000 customers", "Unlimited routers", "Multi-branch", "Field ops + GIS"], featured: true },
  { name: "Enterprise", price: "Custom", desc: "National operators", features: ["Unlimited everything", "SLA + onboarding", "Dedicated tenant", "SAML SSO"] },
];

function PricingTeaser() {
  return (
    <section id="pricing" className="py-24">
      <div className="mx-auto max-w-7xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight md:text-4xl">Pricing built for Kenya</h2>
          <p className="mt-3 text-muted-foreground">Pay in KES. Start with a 14-day trial — no card required.</p>
        </div>
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {PLANS.map((p) => (
            <div
              key={p.name}
              className={`rounded-xl border p-8 ${p.featured ? "border-primary bg-card shadow-glow" : "border-border/60 bg-card/60"}`}
            >
              <div className="flex items-baseline justify-between">
                <h3 className="text-lg font-semibold">{p.name}</h3>
                {p.featured && <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs text-primary">Popular</span>}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{p.desc}</p>
              <div className="mt-6 text-3xl font-bold">{p.price}<span className="text-base font-normal text-muted-foreground">/mo</span></div>
              <ul className="mt-6 space-y-2 text-sm">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 text-success" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <Link
                to="/auth"
                search={{ mode: "signup" } as never}
                className="mt-8 inline-flex w-full items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                Start trial
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
    <footer className="border-t border-border/60 py-10">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-6 text-sm text-muted-foreground md:flex-row">
        <p>© {new Date().getFullYear()} SmartLinkNet. Made in Nairobi.</p>
        <div className="flex gap-6">
          <a href="#features" className="hover:text-foreground">Features</a>
          <a href="#pricing" className="hover:text-foreground">Pricing</a>
          <Link to="/auth" className="hover:text-foreground">Sign in</Link>
        </div>
      </div>
    </footer>
  );
}
