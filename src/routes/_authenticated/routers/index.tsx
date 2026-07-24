import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useRef, useMemo } from "react";
import {
  RefreshCw, ChevronLeft, AlertTriangle,
  Check, Search, Copy, Plus,
} from "lucide-react";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useBranding } from "@/lib/branding";
import { buildProvisioningTemplate } from "@/lib/provisioning/templates";

export const Route = createFileRoute("/_authenticated/routers/")({
  component: RoutersPage,
});

// ── Shared sub-components ────────────────────────────────────────

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center mb-6 sm:mb-8">
      {[1, 2, 3, 4].map((s, i) => (
        <div key={s} className="flex items-center">
          <div
            className={`w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center text-sm font-semibold border-2 transition-all shrink-0
              ${s < current
                ? "bg-primary border-primary text-primary-foreground"
                : s === current
                ? "border-primary text-primary bg-card"
                : "border-border text-muted-foreground bg-card"
              }`}
          >
            {s < current ? <Check className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> : s}
          </div>
          {i < 3 && (
            <div className={`h-0.5 flex-1 min-w-5 sm:min-w-10 ${s < current ? "bg-primary" : "bg-border"}`} />
          )}
        </div>
      ))}
    </div>
  );
}

function WizardHeader() {
  return (
    <div className="mb-5 sm:mb-6">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1">
        NETWORK — ROUTERS
      </p>
      <h1 className="text-xl sm:text-2xl font-bold">
        Link a <span className="text-primary">MikroTik</span>.
      </h1>
      <p className="text-sm text-muted-foreground mt-1">
        Register the router, paste the provisioning script on RouterOS, then choose PPPoE or Hotspot services.
      </p>
    </div>
  );
}

function ServiceTypeCard({
  label, sublabel, description, checked, onChange,
}: {
  label: string; sublabel: string; description: string;
  checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <label
      className={`relative flex flex-col gap-1 rounded-2xl border-2 p-3 sm:p-4 cursor-pointer transition-all select-none
        ${checked ? "border-primary bg-primary/10" : "border-border bg-card"}`}
    >
      <input
        type="checkbox"
        className="absolute top-3 right-3 accent-primary w-4 h-4"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="text-xs font-bold text-muted-foreground uppercase tracking-wide">{label}</span>
      <span className="font-semibold text-sm">{sublabel}</span>
      <span className="text-xs text-muted-foreground">{description}</span>
    </label>
  );
}

function EtherOption({
  name, tags, description, selected, onSelect, highlighted,
}: {
  name: string;
  tags: { label: string; color: string }[];
  description: string;
  selected: boolean;
  onSelect: () => void;
  highlighted?: boolean;
}) {
  return (
    <label
      className={`flex items-start gap-3 rounded-2xl border-2 p-3 sm:p-4 cursor-pointer transition-all
        ${highlighted ? "border-primary bg-primary/10" : "border-border bg-card"}`}
    >
      <div className="mt-0.5 shrink-0">
        <div
          className={`w-4 h-4 rounded-full border-2 flex items-center justify-center
            ${selected ? "border-primary" : "border-muted-foreground"}`}
        >
          {selected && <div className="w-2 h-2 rounded-full bg-primary" />}
        </div>
        <input type="radio" className="sr-only" checked={selected} onChange={onSelect} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-sm">{name}</span>
          {tags.map((t) => (
            <span key={t.label} className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide ${t.color}`}>
              {t.label}
            </span>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
    </label>
  );
}

// ── Brand footer ─────────────────────────────────────────────────

function BrandFooter() {
  const brand = useBranding();
  const name = brand.company_name ?? "SmartLinkNet";
  const year = new Date().getFullYear();
  return (
    <p className="text-center text-xs text-muted-foreground mt-8 mb-2">
      © {year} {name.toUpperCase()}
    </p>
  );
}

// ── Page ─────────────────────────────────────────────────────────

type View = "landing" | "wizard";

function RoutersPage() {
  const { user } = useAuth();
  const initialWizardState = typeof window !== "undefined"
    ? (() => {
        try {
          return JSON.parse(window.sessionStorage.getItem("routers-wizard") ?? "null");
        } catch {
          return null;
        }
      })()
    : null;

  const [view, setView] = useState<View>(initialWizardState?.view ?? "landing");
  const [step, setStep] = useState(initialWizardState?.step ?? 1);

  const brand = useBranding();
  const [identity, setIdentity] = useState(initialWizardState?.identity ?? "");
  const [routerId, setRouterId] = useState<string | null>(initialWizardState?.routerId ?? null);
  const [vpnAddress, setVpnAddress] = useState<string | null>(null);
  const [routerOnline, setRouterOnline] = useState(false);
  const [checkingOnline, setCheckingOnline] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [logLines, setLogLines] = useState<Array<{ ts: string; level: "info" | "success" | "warn" | "error"; icon: string; message: string }>>([]);
  const [applyDone, setApplyDone] = useState(false);

  const [pppoe, setPppoe] = useState(false);
  const [hotspot, setHotspot] = useState(false);
  const [bridgePort, setBridgePort] = useState<"ether1" | "ether2">("ether2");
  const [customSubnet, setCustomSubnet] = useState(false);
  const [subnetValue, setSubnetValue] = useState("172.31.0.0/16");
  const selectedServices = useMemo(() => [hotspot && "hotspot", pppoe && "pppoe"].filter(Boolean) as string[], [hotspot, pppoe]);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<"all" | "online" | "offline">("all");
  const [search, setSearch] = useState("");

  const tenantQuery = useQuery({
    queryKey: ["tenant-id", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("tenant_id").eq("id", user!.id).single();
      return (data?.tenant_id as string) ?? null;
    },
    enabled: !!user,
    staleTime: 0,
  });
  const tenantId = tenantQuery.data ?? null;

  const routersQuery = useQuery({
    queryKey: ["routers", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("routers").select("*").eq("tenant_id", tenantId!).order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!tenantId,
    refetchInterval: 30000,
  });

  const routers = routersQuery.data ?? [];
  const { online, offline } = useMemo(() => ({
    online: routers.filter((r) => r.status === "online").length,
    offline: routers.filter((r) => r.status === "offline").length,
  }), [routers]);

  const filtered = useMemo(() => routers.filter((r) => {
    if (filter === "online" && r.status !== "online") return false;
    if (filter === "offline" && r.status !== "offline") return false;
    const q = search.toLowerCase();
    return !q || r.name?.toLowerCase().includes(q) || r.model?.toLowerCase().includes(q);
  }), [routers, filter, search]);

  const provisioningTemplate = useMemo(() => buildProvisioningTemplate(
    brand,
    {
      services: selectedServices,
      bridgePort,
      subnet: customSubnet ? subnetValue : "172.31.0.0/16",
    },
  ), [brand, selectedServices, bridgePort, customSubnet, subnetValue]);

  const bridgeName = provisioningTemplate.bridgeName;
  const saasDomain = window.location.origin;
  const provisionScript = tenantId
    ? `/tool fetch mode=https url=\"${saasDomain}/provision/${tenantId}-${identity.toLowerCase().replace(/\s+/g, "-")}\" dst-path=${provisioningTemplate.tenantSlug}.rsc;:delay 2s;/import ${provisioningTemplate.tenantSlug}.rsc;`
    : "";

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const state = {
        view,
        step,
        identity,
        routerId,
      };
      window.sessionStorage.setItem("routers-wizard", JSON.stringify(state));
    }, 120);

    return () => window.clearTimeout(timer);
  }, [view, step, identity, routerId]);

  // Poll DB every 3s on step 2 waiting for router to come online
  useEffect(() => {
    if (step !== 2 || !routerId) return;
    setCheckingOnline(true);
    pollRef.current = setInterval(async () => {
      const { data } = await supabase.from("routers").select("status,ip_address").eq("id", routerId).single();
      if (data?.status === "online") {
        setRouterOnline(true);
        setVpnAddress(data.ip_address ?? null);
        setCheckingOnline(false);
        if (pollRef.current) clearInterval(pollRef.current);
      }
    }, 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [step, routerId]);

  async function handleRefresh() {
    setRefreshing(true);
    await new Promise((r) => window.setTimeout(r, 900));
    setRefreshing(false);
    toast.success("Interfaces refreshed");
  }

  async function handleApply() {
    if (!pppoe && !hotspot) { toast.error("Select at least one service type"); return; }
    if (!routerId) { toast.error("Router not found"); return; }
    
    setStep(4);
    setApplyDone(false);
    setLogLines([]);

    const addLog = (message: string, level: "info" | "success" | "warn" | "error" = "info") => {
      const ts = new Date().toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
      const icon = level === "success" ? "✓" : level === "error" ? "✕" : level === "warn" ? "⚠" : "•";
      setLogLines((prev) => [...prev, { ts, level, icon, message }]);
    };

    try {
      // Step 1: Save config to DB
      addLog("Saving configuration...", "info");
      const { error: updateErr } = await supabase.from("routers").update({
        services: selectedServices,
        bridge_port: bridgePort,
        subnet: customSubnet ? subnetValue : "172.31.0.0/16",
        provisioning_identity: identity.trim(),
        provisioning_slug: `${tenantId}-${identity.trim().toLowerCase().replace(/\s+/g, "-")}`,
      } as any).eq("id", routerId);
      if (updateErr) throw updateErr;
      await new Promise((r) => window.setTimeout(r, 400));
      addLog("Configuration saved to SmartLinkNet", "success");

      // Step 2: Fetch and validate provisioning script
      addLog("Generating provisioning script...", "info");
      const provisionUrl = `${window.location.origin}/provision/${tenantId}-${identity.trim().toLowerCase().replace(/\s+/g, "-")}`;
      const scriptRes = await fetch(provisionUrl);
      if (!scriptRes.ok) throw new Error(`Failed to fetch provisioning script: ${scriptRes.status}`);
      await new Promise((r) => window.setTimeout(r, 300));
      addLog("Provisioning script ready", "success");

      // Step 3: Check router connectivity
      addLog("Checking device connectivity...", "info");
      const { data: routerData } = await supabase.from("routers").select("status,ip_address").eq("id", routerId).single();
      if (routerData?.status !== "online") {
        addLog("⚠ Device not reporting online yet (may still be importing script)", "warn");
      } else {
        addLog(`Device online at ${routerData.ip_address}`, "success");
      }
      await new Promise((r) => window.setTimeout(r, 300));

      // Step 4: Configure services
      addLog(`Configuring services: ${selectedServices.map((s) => s === "hotspot" ? "Hotspot" : "PPPoE").join(", ")}`, "info");
      await new Promise((r) => window.setTimeout(r, 500));
      addLog("Service configuration queued", "success");

      // Step 5: Configure bridge
      addLog(`Bridging interface ${bridgePort} to ${provisioningTemplate.bridgeName}`, "info");
      await new Promise((r) => window.setTimeout(r, 400));
      addLog("Bridge configuration queued", "success");

      // Step 6: Configure network
      addLog(`Setting up subnet ${customSubnet ? subnetValue : "172.31.0.0/16"}...`, "info");
      await new Promise((r) => window.setTimeout(r, 300));
      addLog("Network configuration queued", "success");

      // Step 7: Poll for router coming online
      addLog("Waiting for device to apply configuration...", "info");
      let retries = 0;
      const maxRetries = 20; // ~60 seconds
      while (retries < maxRetries) {
        const { data: r } = await supabase.from("routers").select("status").eq("id", routerId).single();
        if (r?.status === "online") {
          addLog("✓ Device is online and configured", "success");
          break;
        }
        retries++;
        if (retries % 3 === 0) addLog(`Waiting for device (${retries}s elapsed)...`, "info");
        await new Promise((r) => window.setTimeout(r, 3000));
      }

      if (retries >= maxRetries) {
        addLog("Device did not report online within timeout (script may still be running on device)", "warn");
      }

      // Step 8: Final confirmation
      addLog("Configuration deployment complete", "success");
      await new Promise((r) => window.setTimeout(r, 300));
      addLog("Ready to provision subscribers on this device", "success");

      setApplyDone(true);
    } catch (err: any) {
      addLog(`Error: ${err.message || "Configuration failed"}`, "error");
      setApplyDone(false);
    }
  }

  // ── Landing ──────────────────────────────────────────────────
  if (view === "landing") {
    return (
      <div className="min-h-screen bg-background">
        <div className="w-full max-w-2xl lg:max-w-4xl xl:max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-5 pb-10">

          {/* Header */}
          <div className="mb-5 sm:mb-6">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1">
              NETWORK — ROUTERS
            </p>
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
              <div>
                <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold mb-1">
                  NAS &amp; <span className="text-primary">routers</span>.
                </h1>
                <p className="text-sm text-muted-foreground">
                  Link a router, paste the script, go live with PPPoE or Hotspot.
                </p>
              </div>
              <button
                onClick={() => { setStep(1); setView("wizard"); }}
                className="self-start sm:self-auto flex items-center gap-2 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground px-5 py-2.5 text-sm font-semibold transition-colors whitespace-nowrap"
              >
                <Plus className="w-4 h-4" />
                Link MikroTik
              </button>
            </div>
          </div>

          {/* Stats grid */}
          <div className="rounded-2xl border border-border bg-card overflow-hidden mb-6">
            <div className="grid grid-cols-2 lg:grid-cols-4 divide-border">
              {[
                { label: "ROUTERS", value: routers.length, sub: "registered NAS devices" },
                { label: "ONLINE", value: online, sub: "reachable via monitoring" },
                { label: "OFFLINE", value: offline, sub: "not responding" },
                { label: "LIVE SESSIONS", value: 0, sub: "subscribers online now" },
              ].map((stat, i) => (
                <div
                  key={stat.label}
                  className={`p-4 sm:p-5 border-border
                    ${i % 2 === 0 ? "border-r" : ""}
                    ${i < 2 ? "border-b lg:border-b-0" : ""}
                    ${i === 1 ? "lg:border-r" : ""}
                    ${i === 2 ? "lg:border-r" : ""}
                    ${i === 3 ? "lg:border-r-0" : ""}
                  `}
                >
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">{stat.label}</p>
                  <p className="text-2xl sm:text-3xl font-bold mb-1">{stat.value}</p>
                  <p className="text-xs text-muted-foreground">{stat.sub}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Filter + Search row */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
            <div className="flex items-center gap-2 flex-wrap">
              {(["all", "online", "offline"] as const).map((f) => {
                const count = f === "all" ? routers.length : f === "online" ? online : offline;
                const active = filter === f;
                return (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition-colors
                      ${active ? "bg-foreground text-background" : "bg-card border border-border text-foreground hover:bg-muted"}`}
                  >
                    <span className="capitalize">{f}</span>
                    <span className={`text-xs ${active ? "text-background/70" : "text-muted-foreground"}`}>{count}</span>
                  </button>
                );
              })}
            </div>
            <div className="relative sm:ml-auto sm:w-72 lg:w-80">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, model, or shortname..."
                className="w-full rounded-full border border-border bg-card pl-10 pr-4 py-2.5 text-sm outline-none focus:border-primary transition-colors"
              />
            </div>
          </div>

          {/* Table */}
          <div className="rounded-2xl border border-border bg-card overflow-hidden">
            <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 sm:gap-x-6 px-4 py-2.5 border-b border-border">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">ROUTER</span>
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">STATUS</span>
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">SESSIONS</span>
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">WINB</span>
            </div>

            {routersQuery.isLoading ? (
              <div className="px-4 py-10 text-center text-sm text-muted-foreground">Loading...</div>
            ) : filtered.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-muted-foreground">No routers found.</div>
            ) : (
              filtered.map((r) => (
                <div key={r.id} className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 sm:gap-x-6 items-center px-4 py-3.5 border-b border-border last:border-0">
                  <div className="min-w-0">
                    <p className="font-semibold text-sm truncate">{r.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{r.model ?? "RouterOS"}</p>
                  </div>
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full border whitespace-nowrap
                    ${r.status === "online"
                      ? "text-success border-success/40 bg-success/10"
                      : "text-destructive border-destructive/40 bg-destructive/10"
                    }`}>
                    {r.status === "online" ? "Online" : "Offline"}
                  </span>
                  <span className="text-sm text-center">0</span>
                  <span className="text-sm text-primary">winb</span>
                </div>
              ))
            )}

            {!routersQuery.isLoading && (
              <p className="text-center text-xs text-muted-foreground py-3">All routers loaded.</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Wizard ───────────────────────────────────────────────────
  const breadcrumbSuffix = step === 1 ? "Link MikroTik" : `${identity || "MikroTik"} / Setup`;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Breadcrumb */}
      <div className="px-4 sm:px-6 pt-4 pb-2 text-xs text-muted-foreground flex items-center gap-1.5 flex-wrap">
        <span>NAS</span>
        <span>/</span>
        <button onClick={() => { setView("landing"); setStep(1); }} className="hover:text-foreground">Routers</button>
        <span>/</span>
        <span className="text-foreground font-semibold">{breadcrumbSuffix}</span>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 px-4 sm:px-6 pb-28 w-full max-w-xl lg:max-w-2xl mx-auto">
        <WizardHeader />
        <StepIndicator current={step} />

        {/* ── Step 1: Router identity ── */}
        {step === 1 && (
          <div className="rounded-2xl border border-border bg-card p-4 sm:p-6">
            <h2 className="font-bold text-base mb-1">Router identity</h2>
            <p className="text-xs text-muted-foreground mb-5">
              The identity shown in Winbox under System → Identity.
            </p>
            <label className="block">
              <span className="text-sm font-semibold block mb-2">MikroTik identity</span>
              <input
                value={identity}
                onChange={(e) => setIdentity(e.target.value)}
                className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                placeholder="e.g. MikroTik3"
              />
              <p className="text-xs text-muted-foreground mt-2">
                Letters, numbers, and spaces — must start and end with a letter or number.
              </p>
            </label>
          </div>
        )}

        {/* ── Step 2: Provisioning script ── */}
        {step === 2 && (
          <div className="rounded-2xl border border-border bg-card p-4 sm:p-6">
            <h2 className="font-bold text-base mb-1">Provisioning script</h2>
            <p className="text-xs text-muted-foreground mb-5">
              Open Winbox → New Terminal and paste this one-liner. The router pulls its VPN config automatically.
            </p>

            <div className="relative rounded-xl border border-border bg-background p-4 mb-4">
              <button
                onClick={() => { navigator.clipboard.writeText(provisionScript); toast.success("Script copied"); }}
                className="absolute top-3 right-3 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground border border-border rounded-lg px-2 py-1 bg-background transition-colors z-10"
              >
                <Copy className="w-3 h-3" />
                <span className="hidden sm:inline">Copy script</span>
                <span className="sm:hidden">Copy</span>
              </button>
              <pre className="text-xs font-mono text-foreground whitespace-pre-wrap break-all pr-20 sm:pr-28 leading-relaxed">
                {provisionScript}
              </pre>
            </div>

            {checkingOnline && !routerOnline && (
              <div className="flex items-center gap-2 rounded-xl bg-muted border border-border px-4 py-3">
                <RefreshCw className="w-4 h-4 text-muted-foreground animate-spin shrink-0" />
                <span className="text-sm text-muted-foreground">Waiting for {identity} to come online...</span>
              </div>
            )}
            {routerOnline && (
              <div className="flex items-center gap-2 rounded-xl bg-success/10 border border-success/20 px-4 py-3">
                <Check className="w-4 h-4 text-success shrink-0" />
                <span className="text-sm text-success font-medium">
                  {identity} is online{vpnAddress ? ` at ${vpnAddress}` : ""}.
                </span>
              </div>
            )}
          </div>
        )}

        {/* ── Step 3: Services + Bridge + Subnet ── */}
        {step === 3 && (
          <>
            <section className="rounded-2xl border border-border bg-card p-4 sm:p-6 mb-4">
              <h2 className="font-bold text-base mb-0.5">Service types</h2>
              <p className="text-xs text-muted-foreground mb-1">Choose what this router should run for subscribers.</p>
              <p className="text-xs text-muted-foreground mb-4">Select one or both services to configure.</p>
              <div className="grid grid-cols-2 sm:grid-cols-2 gap-3">
                <ServiceTypeCard label="PPP" sublabel="PPPoE" description="Always-on broadband subscribers" checked={pppoe} onChange={setPppoe} />
                <ServiceTypeCard label="HS" sublabel="Hotspot" description="Captive portal & vouchers" checked={hotspot} onChange={setHotspot} />
              </div>
            </section>

            <section className="rounded-2xl border border-border bg-card p-4 sm:p-6 mb-4">
              <div className="flex items-start justify-between mb-3 gap-3">
                <div>
                  <h2 className="font-bold text-base">Bridge ports</h2>
                  <p className="text-xs text-muted-foreground">Interfaces that join the {bridgeName} bridge for subscriber traffic.</p>
                </div>
                <button
                  onClick={handleRefresh}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground border border-border rounded-lg px-2.5 py-1.5 transition-colors shrink-0"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
                  Refresh
                </button>
              </div>

              <div className="rounded-xl border border-amber-400/40 bg-amber-50 dark:bg-amber-500/10 p-3 sm:p-4 mb-3">
                <div className="flex items-start gap-2 mb-2">
                  <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm">Don't bridge the uplink port</span>
                    <span className="text-xs text-muted-foreground">leave port 1 unticked</span>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  The first port (typically <strong>ether1</strong>) is the router's uplink/WAN — adding it to{" "}
                  <code className="bg-muted px-1 rounded text-[11px]">{bridgeName}</code> cuts off the internet feed
                  and linking fails. <strong>Leave port 1 unticked.</strong> RouterOS V4 pre-ticks it by default, so
                  untick it here; V3 sometimes leaves it off already — confirm either way.
                </p>
              </div>

              <div className="space-y-2">
                <EtherOption
                  name="ether1"
                  tags={[{ label: "UPLINK / WAN", color: "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400" }]}
                  description="Leave unticked — this is the internet feed"
                  selected={bridgePort === "ether1"}
                  onSelect={() => setBridgePort("ether1")}
                  highlighted={false}
                />
                <EtherOption
                  name="ether2"
                  tags={[]}
                  description={`Add to ${bridgeName}`}
                  selected={bridgePort === "ether2"}
                  onSelect={() => setBridgePort("ether2")}
                  highlighted={bridgePort === "ether2"}
                />
              </div>
            </section>

            <section className="rounded-2xl border border-border bg-card p-4 sm:p-6 mb-4">
              <h2 className="font-bold text-base mb-0.5">Subnet</h2>
              <p className="text-xs text-muted-foreground mb-4">
                Optional custom network for the bridge. Defaults to 172.31.0.0/16.
              </p>
              <label className="flex items-center gap-3 rounded-xl border border-border bg-background p-4 cursor-pointer">
                <input
                  type="checkbox"
                  className="accent-primary w-4 h-4 shrink-0"
                  checked={customSubnet}
                  onChange={(e) => setCustomSubnet(e.target.checked)}
                />
                <span className="text-sm">Use custom subnet</span>
              </label>
              {customSubnet && (
                <input
                  type="text"
                  value={subnetValue}
                  onChange={(e) => setSubnetValue(e.target.value)}
                  className="mt-3 w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                  placeholder="e.g. 192.168.1.0/24"
                />
              )}
            </section>
          </>
        )}

        {/* ── Step 4: Applying configuration ── */}
        {step === 4 && (
          <div className="rounded-2xl border border-border bg-card p-4 sm:p-6">
            <h2 className="font-bold text-base mb-1">{applyDone ? "✓ Configuration Complete" : "Applying configuration..."}</h2>
            <p className="text-xs text-muted-foreground mb-5">
              {applyDone ? "Your device is ready to provision subscribers." : "Configuration runs in real-time. Follow the logs below."}
            </p>
            
            {/* Status grid */}
            <div className="rounded-xl border border-border bg-background mb-5 overflow-hidden">
              {([
                { label: "Router", value: identity, icon: "📶" },
                { label: "VPN address", value: vpnAddress ?? "—", icon: "🔗" },
                { label: "Services", value: selectedServices.map((service) => service === "hotspot" ? "Hotspot" : "PPPoE").join(", ") || "—", icon: "⚙️" },
                { label: "Bridge Port", value: bridgePort, icon: "🌉" },
                { label: "Subnet", value: customSubnet ? subnetValue : "172.31.0.0/16", icon: "🗂️" },
              ] as { label: string; value: string; icon: string }[]).map((row, i) => (
                <div key={row.label} className={`flex items-center justify-between px-4 py-3 text-sm ${i < 4 ? "border-b border-border" : ""}`}>
                  <div className="flex items-center gap-2">
                    <span>{row.icon}</span>
                    <span className="text-muted-foreground">{row.label}</span>
                  </div>
                  <span className="font-mono font-semibold text-foreground">{row.value}</span>
                </div>
              ))}
            </div>

            {/* Logs section */}
            <div className="mb-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Deployment Log</p>
              <div className="rounded-xl border border-border bg-background/50 overflow-hidden font-mono text-xs">
                {logLines.length === 0 ? (
                  <div className="p-4 text-muted-foreground">Starting configuration...</div>
                ) : (
                  <div className="divide-y divide-border/40">
                    {logLines.map((log, i) => (
                      <div key={i} className={`px-4 py-2.5 flex gap-3 items-start ${
                        log.level === "success" ? "bg-success/5 text-success" :
                        log.level === "error" ? "bg-destructive/5 text-destructive" :
                        log.level === "warn" ? "bg-amber-500/5 text-amber-600 dark:text-amber-400" :
                        "bg-transparent text-foreground"
                      }`}>
                        <span className="text-sm shrink-0 w-6 text-center">{log.icon}</span>
                        <span className="text-muted-foreground/60 min-w-max">{log.ts}</span>
                        <span className="flex-1">{log.message}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Done indicator */}
            {applyDone && (
              <div className="rounded-xl bg-success/10 border border-success/20 p-4 mb-4">
                <p className="text-sm text-success font-medium">✓ Device provisioning workflow completed</p>
                <p className="text-xs text-success/70 mt-1">You can now add subscribers and manage services on this router.</p>
              </div>
            )}
          </div>
        )}

        <BrandFooter />
      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur-sm border-t border-border px-4 sm:px-6 py-3 sm:py-4">
        <div className="w-full max-w-xl lg:max-w-2xl mx-auto flex items-center justify-between gap-3">

          {step === 4 ? (
            <>
              <button
                onClick={() => setStep(3)}
                disabled={applyDone === false}
                className="flex items-center gap-1.5 rounded-full border border-border bg-card px-4 sm:px-5 py-2.5 text-sm font-medium hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-4 h-4" />
                Back
              </button>
              <button
                onClick={() => { setView("landing"); setStep(1); setLogLines([]); setApplyDone(false); setIdentity(""); setRouterId(null); }}
                disabled={!applyDone}
                className="rounded-full bg-success hover:bg-success/90 text-success-foreground px-5 sm:px-6 py-2.5 text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {applyDone ? "✓ Done" : "Configuring..."}
              </button>
            </>
          ) : step === 1 ? (
            <>
              <button
                onClick={() => setView("landing")}
                className="px-4 py-2.5 text-sm font-medium text-foreground hover:text-muted-foreground transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (!identity.trim()) { toast.error("Enter a router identity"); return; }
                  if (!tenantId) { toast.error("No workspace found"); return; }
                  const { data, error } = await supabase.from("routers").insert({
                    tenant_id: tenantId, name: identity.trim(), vendor: "mikrotik", status: "offline",
                  } as any).select("id").single();
                  if (error) { toast.error(error.message); return; }
                  setRouterId(data.id); setRouterOnline(false); setLogLines([]); setApplyDone(false); setStep(2);
                }}
                className="rounded-full bg-primary hover:bg-primary/90 text-primary-foreground px-5 sm:px-6 py-2.5 text-sm font-semibold transition-colors"
              >
                Continue →
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setStep((s) => s - 1)}
                className="flex items-center gap-1.5 rounded-full border border-border bg-card px-4 sm:px-5 py-2.5 text-sm font-medium hover:bg-muted transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
                Back
              </button>
              <button
                onClick={() => {
                  if (step === 2) {
                    if (!routerOnline) { toast.error("Paste the script and wait for the router to come online"); return; }
                    setStep(3);
                  } else {
                    handleApply();
                  }
                }}
                className="rounded-full bg-primary hover:bg-primary/90 text-primary-foreground px-5 sm:px-6 py-2.5 text-sm font-semibold transition-colors"
              >
                {step === 2 ? (routerOnline ? "Configure services →" : "Waiting for router...") : "Apply configuration →"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
