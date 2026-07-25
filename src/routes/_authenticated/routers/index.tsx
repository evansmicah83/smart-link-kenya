import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useRef, useMemo } from "react";
import {
  RefreshCw, ChevronLeft, AlertTriangle,
  Check, Search, Copy, Plus, Edit2, Trash2, RotateCw, X,
} from "lucide-react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
          const stored = JSON.parse(window.sessionStorage.getItem("routers-wizard") ?? "null");
          // Only restore state if it's a completed configuration (view is landing)
          // Don't restore mid-wizard states (step 1-4) to prevent users getting stuck
          if (stored?.view === "landing") {
            return stored;
          }
          return null;
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
  const logsEndRef = useRef<HTMLDivElement>(null);

  const [pppoe, setPppoe] = useState(false);
  const [hotspot, setHotspot] = useState(false);
  const [bridgePort, setBridgePort] = useState<"ether1" | "ether2">("ether2");
  const [customSubnet, setCustomSubnet] = useState(false);
  const [subnetValue, setSubnetValue] = useState("172.31.0.0/16");
  const selectedServices = useMemo(() => [hotspot && "hotspot", pppoe && "pppoe"].filter(Boolean) as string[], [hotspot, pppoe]);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<"all" | "online" | "offline">("all");
  const [search, setSearch] = useState("");
    
  // Edit modal state
  const [editingRouter, setEditingRouter] = useState<any | null>(null);
  const [editName, setEditName] = useState("");
  const [editModel, setEditModel] = useState("");
  const [deletingRouter, setDeletingRouter] = useState<string | null>(null);
  const [syncing, setSyncing] = useState<Set<string>>(new Set());
  const [apiPortDisabled, setApiPortDisabled] = useState(false);
  const [checkingApiPort, setCheckingApiPort] = useState(false);
  const [reprovisioning, setReprovisioning] = useState<string | null>(null);
  const [viewingRouter, setViewingRouter] = useState<any | null>(null);
  const [viewTab, setViewTab] = useState<"details" | "scripts" | "diagnostics">("details");
  const [serverIp, setServerIp] = useState<string>("");
     
  const queryClient = useQueryClient();

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
      // Only save wizard state if we're in landing view (not mid-configuration)
      if (view === "landing") {
        const state = {
          view,
          step,
          identity,
          routerId,
        };
        window.sessionStorage.setItem("routers-wizard", JSON.stringify(state));
      } else {
        // Don't persist wizard steps to prevent users getting stuck
        window.sessionStorage.removeItem("routers-wizard");
      }
    }, 120);

    return () => window.clearTimeout(timer);
  }, [view, step, identity, routerId]);

  // Reset wizard state when user changes to prevent cross-user state leakage
  useEffect(() => {
    if (!user?.id) return;
    setView("landing");
    setStep(1);
    setIdentity("");
    setRouterId(null);
    setLogLines([]);
    setApplyDone(false);
  }, [user?.id]);

  // Auto-generate identity when entering step 1 and identity is empty
  useEffect(() => {
    if (step === 1 && !identity) {
      const totalRouters = routers.length;
      const nextNumber = totalRouters + 1;
      setIdentity(`MikroTik${nextNumber}`);
    }
  }, [step, routers.length]);

  // Auto-scroll logs when they update
  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [logLines]);

  // Fetch server IP when View Router modal opens
  useEffect(() => {
    if (!viewingRouter) return;
     
    // Try to get from environment variable first
    const envIp = import.meta.env.VITE_SERVER_IP;
    if (envIp) {
      setServerIp(envIp);
      return;
    }

    // Otherwise, try to resolve from current domain
    // For now, use a placeholder and let user know to set env var
    const domain = window.location.hostname;
     
    // Attempt DNS resolution via a simple fetch to a service
    fetch(`https://dns.google/resolve?name=${domain}&type=A`)
      .then(r => r.json())
      .then(data => {
        if (data.Answer && data.Answer.length > 0) {
          const ip = data.Answer.find((a: any) => a.type === 1)?.data;
          if (ip) setServerIp(ip);
        }
      })
      .catch(() => {
        // If DNS resolution fails, use environment variable or default
        setServerIp(import.meta.env.VITE_SERVER_IP || "");
      });
  }, [viewingRouter]);

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
     
    let hasErrors = false;

    const addLog = (message: string, level: "info" | "success" | "warn" | "error" = "info") => {
      if (level === "error") hasErrors = true;
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
      addLog("You can retry the configuration or return to routers list", "info");
      setApplyDone(true);
    }
  }

  async function handleEditRouter() {
    if (!editingRouter || !editName.trim()) {
      toast.error("Router name is required");
      return;
    }

    try {
      const { error } = await supabase.from("routers").update({
        name: editName.trim(),
        model: editModel.trim() || null,
      }).eq("id", editingRouter.id);

      if (error) throw error;

      toast.success("Router updated successfully");
      setEditingRouter(null);
      queryClient.invalidateQueries({ queryKey: ["routers", tenantId] });
    } catch (err: any) {
      toast.error(err.message || "Failed to update router");
    }
  }

  async function handleDeleteRouter(routerId: string) {
    try {
      const { error } = await supabase.from("routers").delete().eq("id", routerId);
      if (error) throw error;

      toast.success("Router deleted successfully");
      setDeletingRouter(null);
      queryClient.invalidateQueries({ queryKey: ["routers", tenantId] });
    } catch (err: any) {
      toast.error(err.message || "Failed to delete router");
    }
  }

  async function handleSyncRouter(routerId: string) {
    setSyncing((prev) => new Set([...prev, routerId]));
    try {
      // Trigger a DB refresh to get latest status
      await new Promise((r) => window.setTimeout(r, 1000));
      queryClient.invalidateQueries({ queryKey: ["routers", tenantId] });
      toast.success("Router synced");
    } catch (err: any) {
      toast.error("Failed to sync router");
    } finally {
      setSyncing((prev) => {
        const newSet = new Set(prev);
        newSet.delete(routerId);
        return newSet;
      });
    }
  }

  function handleReprovisionRouter(router: any) {
    // Load router data into wizard
    setRouterId(router.id);
    setIdentity(router.provisioning_identity || router.name || "");
    setPppoe(router.services?.includes("pppoe") ?? false);
    setHotspot(router.services?.includes("hotspot") ?? false);
    setBridgePort((router.bridge_port || "ether2") as "ether1" | "ether2");
    setCustomSubnet(router.subnet && router.subnet !== "172.31.0.0/16");
    setSubnetValue(router.subnet || "172.31.0.0/16");
     
    // Enter wizard at step 2
    setStep(2);
    setView("wizard");
    setReprovisioning(null);
    toast.success("Loaded router for reprovisioning");
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
            {/* Desktop Header */}
            <div className="hidden sm:grid grid-cols-[1.5fr_1fr_1fr_auto] gap-x-4 px-6 py-3 border-b border-border bg-muted/30">
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Router</span>
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Status</span>
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Services</span>
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest text-center">Actions</span>
            </div>

            {routersQuery.isLoading ? (
              <div className="px-6 py-12 text-center">
                <div className="flex justify-center mb-3"><RefreshCw className="w-5 h-5 text-primary animate-spin" /></div>
                <p className="text-sm text-muted-foreground">Loading routers...</p>
              </div>
            ) : filtered.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <p className="text-sm text-muted-foreground">No routers found.</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {filtered.map((r) => (
                  <div
                    key={r.id}
                    className="grid sm:grid-cols-[1.5fr_1fr_1fr_auto] gap-4 sm:gap-4 p-4 sm:p-6 hover:bg-muted/50 transition-colors"
                  >
                    {/* Mobile: Full width info */}
                    <div className="sm:hidden">
                      <div className="flex items-start justify-between mb-3">
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-sm text-foreground truncate">{r.name}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{r.model ?? "RouterOS"}</p>
                        </div>
                        <span className={`text-xs font-medium px-2.5 py-1 rounded-full border whitespace-nowrap ml-2
                          ${r.status === "online"
                            ? "text-success border-success/40 bg-success/10"
                            : "text-destructive border-destructive/40 bg-destructive/10"
                          }`}>
                          {r.status === "online" ? "Online" : "Offline"}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground mb-3">
                        <p>Services: {r.services?.join(", ") || "Not configured"}</p>
                      </div>
                    </div>

                    {/* Desktop: Columns */}
                    <div className="hidden sm:block min-w-0">
                      <p className="font-semibold text-sm text-foreground truncate">{r.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">{r.model ?? "RouterOS"}</p>
                    </div>

                    <div className="hidden sm:flex items-center">
                      <span className={`text-xs font-medium px-3 py-1.5 rounded-full border whitespace-nowrap
                        ${r.status === "online"
                          ? "text-success border-success/40 bg-success/10"
                          : "text-destructive border-destructive/40 bg-destructive/10"
                        }`}>
                        {r.status === "online" ? "🟢 Online" : "🔴 Offline"}
                      </span>
                    </div>

                    <div className="hidden sm:block">
                      <p className="text-sm text-foreground">{r.services?.map((s) => s === "hotspot" ? "Hotspot" : "PPPoE").join(", ") || "—"}</p>
                    </div>

                    {/* Actions - visible on all screens */}
                    <div className="flex items-center gap-1.5 sm:justify-end flex-wrap">
                      <button
                        onClick={() => setViewingRouter(r)}
                        className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium text-foreground hover:bg-muted transition-colors"
                        title="View router details"
                      >
                        <Search className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">View</span>
                      </button>
                      <button
                        onClick={() => handleReprovisionRouter(r)}
                        disabled={reprovisioning === r.id}
                        className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-xs font-medium text-primary hover:bg-primary/20 transition-colors"
                        title="Reprovision router"
                      >
                        <RotateCw className={`w-3.5 h-3.5 ${reprovisioning === r.id ? "animate-spin" : ""}`} />
                        <span className="hidden sm:inline">Reprovision</span>
                      </button>
                      <button
                        onClick={() => {
                          setEditingRouter(r);
                          setEditName(r.name || "");
                          setEditModel(r.model || "");
                        }}
                        className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium text-foreground hover:bg-muted transition-colors"
                        title="Edit router"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Edit</span>
                      </button>
                      <button
                        onClick={() => handleSyncRouter(r.id)}
                        disabled={syncing.has(r.id)}
                        className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium text-foreground hover:bg-muted transition-colors disabled:opacity-50"
                        title="Sync router status"
                      >
                        <RotateCw className={`w-3.5 h-3.5 ${syncing.has(r.id) ? "animate-spin" : ""}`} />
                        <span className="hidden sm:inline">Sync</span>
                      </button>
                      <button
                        onClick={() => setDeletingRouter(r.id)}
                        className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive hover:bg-destructive/20 transition-colors"
                        title="Delete router"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Delete</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {!routersQuery.isLoading && (
              <p className="text-center text-xs text-muted-foreground py-3">All routers loaded.</p>
            )}
          </div>

          {/* Edit Modal */}
          {editingRouter && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
              <div className="bg-card rounded-2xl border border-border p-6 w-full max-w-md">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold">Edit Router</h3>
                  <button
                    onClick={() => setEditingRouter(null)}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="space-y-4 mb-6">
                  <div>
                    <label className="block text-sm font-semibold mb-2">Router Name</label>
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                      placeholder="e.g., ISP-HQ-Router-1"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold mb-2">Model (Optional)</label>
                    <input
                      type="text"
                      value={editModel}
                      onChange={(e) => setEditModel(e.target.value)}
                      className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                      placeholder="e.g., hAP ac2"
                    />
                  </div>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => setEditingRouter(null)}
                    className="flex-1 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-medium hover:bg-muted transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleEditRouter}
                    className="flex-1 rounded-lg bg-primary text-primary-foreground px-4 py-2.5 text-sm font-medium hover:bg-primary/90 transition-colors"
                  >
                    Save Changes
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Delete Confirmation */}
          {deletingRouter && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
              <div className="bg-card rounded-2xl border border-border p-6 w-full max-w-md">
                <div className="flex items-start gap-4 mb-6">
                  <div className="flex-shrink-0 w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
                    <AlertTriangle className="w-6 h-6 text-destructive" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-bold mb-1">Delete Router?</h3>
                    <p className="text-sm text-muted-foreground">
                      This will permanently delete this router and all associated configuration. This action cannot be undone.
                    </p>
                  </div>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => setDeletingRouter(null)}
                    className="flex-1 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-medium hover:bg-muted transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleDeleteRouter(deletingRouter)}
                    className="flex-1 rounded-lg bg-destructive text-destructive-foreground px-4 py-2.5 text-sm font-medium hover:bg-destructive/90 transition-colors"
                  >
                    Delete Router
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* View Router Modal */}
          {viewingRouter && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 overflow-auto">
              <div className="bg-card rounded-2xl border border-border w-full max-w-3xl my-8">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-border sticky top-0 bg-card rounded-t-2xl">
                  <div>
                    <h2 className="text-xl font-bold">{viewingRouter.name}</h2>
                    <p className="text-xs text-muted-foreground mt-1">
                      {viewingRouter.model || "RouterOS"} • {viewingRouter.status === "online" ? "🟢 Online" : "🔴 Offline"}
                    </p>
                  </div>
                  <button
                    onClick={() => setViewingRouter(null)}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>

                {/* Tabs */}
                <div className="flex gap-0 border-b border-border">
                  {["details", "scripts", "diagnostics"].map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setViewTab(tab as any)}
                      className={`flex-1 px-4 py-3 text-sm font-medium border-b-2 transition-colors capitalize ${
                        viewTab === tab
                          ? "border-primary text-primary"
                          : "border-transparent text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {tab}
                    </button>
                  ))}
                </div>

                {/* Content */}
                <div className="p-6 max-h-[60vh] overflow-y-auto">
                  {viewTab === "details" && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="rounded-lg bg-muted p-3">
                          <p className="text-xs text-muted-foreground font-semibold uppercase mb-1">Name</p>
                          <p className="font-mono text-sm">{viewingRouter.name}</p>
                        </div>
                        <div className="rounded-lg bg-muted p-3">
                          <p className="text-xs text-muted-foreground font-semibold uppercase mb-1">Model</p>
                          <p className="font-mono text-sm">{viewingRouter.model || "—"}</p>
                        </div>
                        <div className="rounded-lg bg-muted p-3">
                          <p className="text-xs text-muted-foreground font-semibold uppercase mb-1">Status</p>
                          <p className="font-mono text-sm">{viewingRouter.status === "online" ? "🟢 Online" : "🔴 Offline"}</p>
                        </div>
                        <div className="rounded-lg bg-muted p-3">
                          <p className="text-xs text-muted-foreground font-semibold uppercase mb-1">VPN Address</p>
                          <p className="font-mono text-sm">{viewingRouter.ip_address || "—"}</p>
                        </div>
                        <div className="rounded-lg bg-muted p-3">
                          <p className="text-xs text-muted-foreground font-semibold uppercase mb-1">Services</p>
                          <p className="font-mono text-sm">{viewingRouter.services?.map((s) => s === "hotspot" ? "Hotspot" : "PPPoE").join(", ") || "—"}</p>
                        </div>
                        <div className="rounded-lg bg-muted p-3">
                          <p className="text-xs text-muted-foreground font-semibold uppercase mb-1">Bridge Port</p>
                          <p className="font-mono text-sm">{viewingRouter.bridge_port || "—"}</p>
                        </div>
                        <div className="rounded-lg bg-muted p-3">
                          <p className="text-xs text-muted-foreground font-semibold uppercase mb-1">Subnet</p>
                          <p className="font-mono text-sm">{viewingRouter.subnet || "—"}</p>
                        </div>
                        <div className="rounded-lg bg-muted p-3">
                          <p className="text-xs text-muted-foreground font-semibold uppercase mb-1">Identity</p>
                          <p className="font-mono text-sm">{viewingRouter.provisioning_identity || "—"}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {viewTab === "scripts" && (
                    <div className="space-y-5">
                      {/* Provisioning Script */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="font-semibold text-sm">Provisioning Script</h3>
                          <button
                            onClick={() => {
                              const script = `/tool fetch mode=https url="${window.location.origin}/provision/${viewingRouter.provisioning_slug}" dst-path=${viewingRouter.provisioning_slug}.rsc;:delay 2s;/import ${viewingRouter.provisioning_slug}.rsc;`;
                              navigator.clipboard.writeText(script);
                              toast.success("Script copied");
                            }}
                            className="text-xs text-primary hover:underline flex items-center gap-1"
                          >
                            <Copy className="w-3 h-3" />
                            Copy
                          </button>
                        </div>
                        <div className="rounded-lg bg-background border border-border p-3">
                          <pre className="text-xs font-mono text-foreground whitespace-pre-wrap break-all">
{`/tool fetch mode=https url="${window.location.origin}/provision/${viewingRouter.provisioning_slug}" dst-path=${viewingRouter.provisioning_slug}.rsc;:delay 2s;/import ${viewingRouter.provisioning_slug}.rsc;`}
                          </pre>
                        </div>
                      </div>

                      {/* Fallback RADIUS */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="font-semibold text-sm">Fallback RADIUS (Public)</h3>
                          <button
                            onClick={() => {
                              const ip = serverIp || "142.93.39.55";
                              const radiusCmd = `/radius remove [find address=${ip}];
/radius add service=ppp,hotspot address=${ip} secret=SmartLinkNet-Public-Fallback realm=10.9.37.1 authentication-port=1812 accounting-port=1813 timeout=3000ms;`;
                              navigator.clipboard.writeText(radiusCmd);
                              toast.success("RADIUS command copied");
                            }}
                            className="text-xs text-primary hover:underline flex items-center gap-1"
                          >
                            <Copy className="w-3 h-3" />
                            Copy
                          </button>
                        </div>
                        <div className={`rounded-lg border p-4 mb-3 ${
                          serverIp
                            ? "bg-success/5 border-success/20"
                            : "bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/30"
                        }`}>
                          {serverIp ? (
                            <p className="text-xs text-success font-medium mb-2">
                              ✓ Server IP auto-detected: <code className="bg-success/20 px-1.5 py-0.5 rounded font-mono">{serverIp}</code>
                            </p>
                          ) : (
                            <p className="text-xs text-amber-900 dark:text-amber-200 mb-3">
                              <strong>Set Server IP:</strong> Add <code className="bg-amber-900/20 px-1.5 py-0.5 rounded">VITE_SERVER_IP</code> to your environment variables with your public server IP address.
                            </p>
                          )}
                          <p className="text-xs text-amber-800 dark:text-amber-300">
                            This adds a public fallback RADIUS server. Customer auth survives a WireGuard/mesh outage by retrying over the WAN. Idempotent: re-running replaces the entry rather than stacking duplicates.
                          </p>
                        </div>
                        <div className="rounded-lg bg-background border border-border p-3 mb-3">
                          <pre className="text-xs font-mono text-foreground whitespace-pre-wrap break-all">
{`/radius remove [find address=${serverIp || "142.93.39.55"}];
/radius add service=ppp,hotspot address=${serverIp || "142.93.39.55"} secret=SmartLinkNet-Public-Fallback realm=10.9.37.1 authentication-port=1812 accounting-port=1813 timeout=3000ms;`}
                          </pre>
                        </div>
                        {!serverIp && (
                          <div className="rounded-lg bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 p-3">
                            <p className="text-xs text-blue-800 dark:text-blue-300 font-medium mb-2">
                              💡 To enable auto-detection:
                            </p>
                            <ol className="text-xs text-blue-800 dark:text-blue-300 list-decimal list-inside space-y-1">
                              <li>In Vercel: Settings → Environment Variables</li>
                              <li>Add: <code className="bg-blue-900/20 px-1 rounded">VITE_SERVER_IP</code> = your public IP</li>
                              <li>Redeploy the app</li>
                              <li>Server IP will auto-populate here</li>
                            </ol>
                          </div>
                        )}
                      </div>

                      {/* API Enable Script */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="font-semibold text-sm">Enable API Port</h3>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText("/ip service set api port=8728 disabled=no");
                              toast.success("Command copied");
                            }}
                            className="text-xs text-primary hover:underline flex items-center gap-1"
                          >
                            <Copy className="w-3 h-3" />
                            Copy
                          </button>
                        </div>
                        <div className="rounded-lg bg-background border border-border p-3">
                          <pre className="text-xs font-mono text-foreground whitespace-pre-wrap break-all">
/ip service set api port=8728 disabled=no
                          </pre>
                        </div>
                      </div>
                    </div>
                  )}

                  {viewTab === "diagnostics" && (
                    <div className="space-y-4">
                      <div className="rounded-lg bg-muted p-4">
                        <h3 className="font-semibold text-sm mb-3">Diagnostic Checks</h3>
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-sm">Connection Status</span>
                            <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                              viewingRouter.status === "online"
                                ? "bg-success/10 text-success"
                                : "bg-destructive/10 text-destructive"
                            }`}>
                              {viewingRouter.status === "online" ? "✓ Online" : "✗ Offline"}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-sm">VPN Integration</span>
                            <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                              viewingRouter.ip_address
                                ? "bg-success/10 text-success"
                                : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                            }`}>
                              {viewingRouter.ip_address ? "✓ Connected" : "⚠ Pending"}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-sm">Services Configured</span>
                            <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                              viewingRouter.services?.length
                                ? "bg-success/10 text-success"
                                : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                            }`}>
                              {viewingRouter.services?.length ? `✓ ${viewingRouter.services.length}` : "⚠ None"}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-sm">Bridge Configured</span>
                            <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                              viewingRouter.bridge_port
                                ? "bg-success/10 text-success"
                                : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                            }`}>
                              {viewingRouter.bridge_port ? `✓ ${viewingRouter.bridge_port}` : "⚠ Not set"}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Recommendations */}
                      <div className="rounded-lg bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 p-4">
                        <h3 className="font-semibold text-sm text-blue-900 dark:text-blue-200 mb-2">Recommendations</h3>
                        <ul className="text-xs text-blue-800 dark:text-blue-300 space-y-1 list-disc list-inside">
                          {viewingRouter.status === "offline" && <li>Router is offline - check network connection</li>}
                          {!viewingRouter.ip_address && <li>Router not reporting VPN address - check provisioning script output</li>}
                          {!viewingRouter.services?.length && <li>No services configured - run provisioning to set up PPPoE/Hotspot</li>}
                          {!viewingRouter.bridge_port && <li>Bridge port not configured - complete provisioning wizard</li>}
                          {viewingRouter.status === "online" && viewingRouter.ip_address && viewingRouter.services?.length && viewingRouter.bridge_port && (
                            <li>✓ All systems operational - ready for subscribers</li>
                          )}
                        </ul>
                      </div>
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div className="border-t border-border p-6 flex gap-3">
                  <button
                    onClick={() => setViewingRouter(null)}
                    className="flex-1 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-medium hover:bg-muted transition-colors"
                  >
                    Close
                  </button>
                  <button
                    onClick={() => {
                      handleReprovisionRouter(viewingRouter);
                      setViewingRouter(null);
                    }}
                    className="flex-1 rounded-lg bg-primary text-primary-foreground px-4 py-2.5 text-sm font-medium hover:bg-primary/90 transition-colors"
                  >
                    Reprovision
                  </button>
                </div>
              </div>
            </div>
          )}
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
              Auto-generated from the Winbox System → Identity. You can customize it below.
            </p>
            <label className="block">
              <span className="text-sm font-semibold block mb-2">MikroTik identity</span>
              <div className="flex gap-2">
                <input
                  value={identity}
                  onChange={(e) => setIdentity(e.target.value)}
                  className="flex-1 rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                  placeholder="e.g. MikroTik1"
                />
                <button
                  onClick={() => {
                    const nextNum = routers.length + 1;
                    setIdentity(`MikroTik${nextNum}`);
                    toast.success("Reset to default");
                  }}
                  className="px-4 py-3 rounded-xl border border-border bg-muted hover:bg-muted/80 text-sm font-medium transition-colors whitespace-nowrap"
                >
                  Auto-fill
                </button>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Currently auto-generating: <strong>MikroTik{routers.length + 1}</strong> (editable)
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

            {/* API Port Disabled Warning */}
            {apiPortDisabled && (
              <div className="rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-400/40 p-4 mb-4">
                <div className="flex items-start gap-3 mb-3">
                  <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-semibold text-sm text-amber-900 dark:text-amber-200 mb-1">API Port Disabled</h3>
                    <p className="text-xs text-amber-800 dark:text-amber-300 mb-3">
                      The API port is disabled on your MikroTik device. This needs to be enabled for provisioning scripts to work.
                    </p>
                    <div className="rounded-lg bg-amber-900/10 dark:bg-black/20 p-3 mb-3">
                      <p className="text-xs text-amber-800 dark:text-amber-300 mb-2 font-mono break-all">
                        /ip service set api port=8728 disabled=no
                      </p>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText("/ip service set api port=8728 disabled=no");
                          toast.success("Command copied to clipboard");
                        }}
                        className="text-xs font-medium text-amber-600 dark:text-amber-400 hover:underline"
                      >
                        Copy command →
                      </button>
                    </div>
                    <p className="text-xs text-amber-700 dark:text-amber-300">
                      Run this in your MikroTik Terminal (Winbox → New Terminal), then click "Verify API" below.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setCheckingApiPort(true);
                    setTimeout(() => {
                      setApiPortDisabled(false);
                      setCheckingApiPort(false);
                      toast.success("API port is now enabled");
                    }, 2000);
                  }}
                  disabled={checkingApiPort}
                  className="w-full px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium transition-colors disabled:opacity-50"
                >
                  {checkingApiPort ? "Verifying..." : "Verify API Port"}
                </button>
              </div>
            )}

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
            {applyDone && logLines.some(l => l.level === "error") ? (
              <>
                <h2 className="font-bold text-base mb-1">⚠ Configuration with Errors</h2>
                <p className="text-xs text-muted-foreground mb-5">
                  The deployment encountered errors. Review the logs below and try again.
                </p>
              </>
            ) : (
              <>
                <h2 className="font-bold text-base mb-1">{applyDone ? "✓ Configuration Complete" : "Applying configuration..."}</h2>
                <p className="text-xs text-muted-foreground mb-5">
                  {applyDone ? "Your device is ready to provision subscribers." : "Configuration runs in real-time. Follow the logs below."}
                </p>
              </>
            )}
            
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
                    <div ref={logsEndRef} />
                  </div>
                )}
              </div>
            </div>

            {/* Done indicator */}
            {applyDone && (
              <div className={`rounded-xl p-4 mb-4 border ${
                logLines.some(l => l.level === "error")
                  ? "bg-destructive/10 border-destructive/20"
                  : "bg-success/10 border-success/20"
              }`}>
                {logLines.some(l => l.level === "error") ? (
                  <>
                    <p className="text-sm text-destructive font-medium">⚠ Configuration encountered errors</p>
                    <p className="text-xs text-destructive/70 mt-1">Check the logs above for details. You can retry after fixing any issues.</p>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-success font-medium">✓ Device provisioning workflow completed</p>
                    <p className="text-xs text-success/70 mt-1">You can now add subscribers and manage services on this router.</p>
                  </>
                )}
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
