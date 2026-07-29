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

const SUPABASE_FUNCTIONS = "https://tghaarhofriakwgvqmpm.supabase.co/functions/v1";

export const Route = createFileRoute("/_authenticated/routers/")({
  component: RoutersPage,
});

// ── Sub-components ───────────────────────────────────────────────

function StepIndicator({ current }: { current: number }) {
  const labels = ["Identity", "Services", "Script", "Deploying"];
  return (
    <div className="flex items-center mb-6 sm:mb-8">
      {[1, 2, 3, 4].map((s, i) => (
        <div key={s} className="flex items-center flex-1 last:flex-none">
          <div className="flex flex-col items-center gap-1">
            <div className={`w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center text-sm font-semibold border-2 transition-all shrink-0
              ${s < current ? "bg-primary border-primary text-primary-foreground"
                : s === current ? "border-primary text-primary bg-card"
                : "border-border text-muted-foreground bg-card"}`}>
              {s < current ? <Check className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> : s}
            </div>
            <span className={`text-[10px] font-medium hidden sm:block ${s === current ? "text-primary" : "text-muted-foreground"}`}>
              {labels[i]}
            </span>
          </div>
          {i < 3 && (
            <div className={`h-0.5 flex-1 mx-1 mb-4 ${s < current ? "bg-primary" : "bg-border"}`} />
          )}
        </div>
      ))}
    </div>
  );
}

function ServiceTypeCard({ label, sublabel, description, checked, onChange }: {
  label: string; sublabel: string; description: string;
  checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <label className={`relative flex flex-col gap-1 rounded-2xl border-2 p-3 sm:p-4 cursor-pointer transition-all select-none
      ${checked ? "border-primary bg-primary/10" : "border-border bg-card"}`}>
      <input type="checkbox" className="absolute top-3 right-3 accent-primary w-4 h-4"
        checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="text-xs font-bold text-muted-foreground uppercase tracking-wide">{label}</span>
      <span className="font-semibold text-sm">{sublabel}</span>
      <span className="text-xs text-muted-foreground">{description}</span>
    </label>
  );
}

function BrandFooter() {
  const brand = useBranding();
  const name = brand.company_name ?? "SmartLinkNet";
  return (
    <p className="text-center text-xs text-muted-foreground mt-8 mb-2">
      © {new Date().getFullYear()} {name.toUpperCase()}
    </p>
  );
}

// ── Page ─────────────────────────────────────────────────────────

type View = "landing" | "wizard";
type LogLevel = "info" | "success" | "warn" | "error";
type LogLine = { ts: string; level: LogLevel; icon: string; message: string };

function RoutersPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // ── Wizard state ──────────────────────────────────────────────
  const [view, setView] = useState<View>("landing");
  const [step, setStep] = useState(1);

  // Step 1
  const [identity, setIdentity] = useState("");
  const [routerId, setRouterId] = useState<string | null>(null);
  const [creatingRouter, setCreatingRouter] = useState(false);

  // Step 2 — services, bridge, subnet (saved to DB BEFORE script is generated)
  const [pppoe, setPppoe] = useState(false);
  const [hotspot, setHotspot] = useState(false);
  const [bridgePorts, setBridgePorts] = useState<string[]>(["ether2"]);
  const [uplinkInterface, setUplinkInterface] = useState<string>("ether1");
  const [customSubnet, setCustomSubnet] = useState(false);
  const [subnetValue, setSubnetValue] = useState("172.31.0.0/16");
  const [savingServices, setSavingServices] = useState(false);
  const selectedServices = useMemo(
    () => [hotspot && "hotspot", pppoe && "pppoe"].filter(Boolean) as string[],
    [hotspot, pppoe]
  );

  // Step 3 — script + wait for router online
  const [provisionToken, setProvisionToken] = useState<string | null>(null);
  const [routerOnline, setRouterOnline] = useState(false);
  const [routerPublicIp, setRouterPublicIp] = useState<string | null>(null);
  const [checkingOnline, setCheckingOnline] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Step 4 — apply logs
  const [logLines, setLogLines] = useState<LogLine[]>([]);
  const [applyDone, setApplyDone] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const realtimeChannelRef = useRef<any | null>(null);

  // ── Landing state ─────────────────────────────────────────────
  const [filter, setFilter] = useState<"all" | "online" | "offline">("all");
  const [search, setSearch] = useState("");
  const [editingRouter, setEditingRouter] = useState<any | null>(null);
  const [editName, setEditName] = useState("");
  const [editModel, setEditModel] = useState("");
  const [editIp, setEditIp] = useState("");
  const [editApiUsername, setEditApiUsername] = useState("");
  const [editApiPassword, setEditApiPassword] = useState("");
  const [deletingRouter, setDeletingRouter] = useState<string | null>(null);
  const [syncing, setSyncing] = useState<Set<string>>(new Set());
  const [viewingRouter, setViewingRouter] = useState<any | null>(null);
  const [viewTab, setViewTab] = useState<"details" | "scripts" | "diagnostics">("details");

  // ── Queries ───────────────────────────────────────────────────
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
  });

  const liveSessionsQuery = useQuery({
    queryKey: ["live-sessions", tenantId],
    queryFn: async () => {
      if (!tenantId) return 0;
      const { count } = await supabase.from("sessions")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId).is("ended_at", null);
      return count ?? 0;
    },
    enabled: !!tenantId,
    refetchInterval: 30_000,
    retry: false,
  });
  const liveSessions = liveSessionsQuery.data ?? 0;

  // ── Realtime: routers table ───────────────────────────────────
  const routersRealtimeRef = useRef<any | null>(null);
  useEffect(() => {
    if (!tenantId) return;
    if (routersRealtimeRef.current) {
      try { supabase.removeChannel(routersRealtimeRef.current); } catch {}
      routersRealtimeRef.current = null;
    }
    const ch = supabase.channel(`routers-rt-${tenantId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "routers", filter: `tenant_id=eq.${tenantId}` },
        () => queryClient.invalidateQueries({ queryKey: ["routers", tenantId] }))
      .subscribe();
    routersRealtimeRef.current = ch;
    return () => { try { supabase.removeChannel(ch); } catch {} routersRealtimeRef.current = null; };
  }, [tenantId]);

  // Cleanup provision_logs channel on unmount
  useEffect(() => {
    return () => {
      if (realtimeChannelRef.current) {
        try { supabase.removeChannel(realtimeChannelRef.current); } catch {}
        realtimeChannelRef.current = null;
      }
    };
  }, []);

  const routers = routersQuery.data ?? [];
  const { online, offline } = useMemo(() => ({
    online: routers.filter((r) => r.status === "online" || r.status === "active").length,
    offline: routers.filter((r) => r.status === "offline" || r.status === "pending").length,
  }), [routers]);

  const filtered = useMemo(() => routers.filter((r) => {
    if (filter === "online" && r.status !== "online" && r.status !== "active") return false;
    if (filter === "offline" && r.status !== "offline" && r.status !== "pending") return false;
    const q = search.toLowerCase();
    return !q || r.name?.toLowerCase().includes(q) || r.model?.toLowerCase().includes(q);
  }), [routers, filter, search]);

  // Reset wizard when user changes
  useEffect(() => {
    if (!user?.id) return;
    resetWizard();
  }, [user?.id]);

  // Auto-fill identity
  useEffect(() => {
    if (step === 1 && view === "wizard" && !identity) {
      setIdentity(`MikroTik${routers.length + 1}`);
    }
  }, [step, view, routers.length]);

  // Poll DB every 3s on step 3 waiting for router to come online
  useEffect(() => {
    if (step !== 3 || !routerId) return;
    setCheckingOnline(true);
    pollRef.current = setInterval(async () => {
      const { data } = await supabase.from("routers")
        .select("status, public_ip, ip_address").eq("id", routerId).single();
      if (data?.status === "online" || data?.status === "active") {
        setRouterOnline(true);
        setRouterPublicIp(data.public_ip || data.ip_address || null);
        setCheckingOnline(false);
        if (pollRef.current) clearInterval(pollRef.current);
        toast.success("Router is online — provisioning script completed!");
      }
    }, 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [step, routerId]);

  // Auto-scroll logs
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [logLines]);

  // ── Helpers ───────────────────────────────────────────────────
  function resetWizard() {
    setView("landing");
    setStep(1);
    setIdentity("");
    setRouterId(null);
    setPppoe(false);
    setHotspot(false);
    setBridgePorts(["ether2"]);
    setUplinkInterface("ether1");
    setCustomSubnet(false);
    setSubnetValue("172.31.0.0/16");
    setProvisionToken(null);
    setRouterOnline(false);
    setRouterPublicIp(null);
    setCheckingOnline(false);
    setLogLines([]);
    setApplyDone(false);
    if (pollRef.current) clearInterval(pollRef.current);
    if (realtimeChannelRef.current) {
      try { supabase.removeChannel(realtimeChannelRef.current); } catch {}
      realtimeChannelRef.current = null;
    }
  }

  function addLog(message: string, level: LogLevel = "info") {
    const ts = new Date().toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
    const icon = level === "success" ? "✓" : level === "error" ? "✕" : level === "warn" ? "⚠" : "•";
    setLogLines((prev) => [...prev, { ts, level, icon, message }]);
  }

  // ── Step 1 → 2: Create router row ────────────────────────────
  async function handleCreateRouter() {
    if (!identity.trim()) { toast.error("Enter a router identity"); return; }
    if (!tenantId) { toast.error("No workspace found"); return; }
    setCreatingRouter(true);
    try {
      const provSlug = `${tenantId}-${identity.trim().toLowerCase().replace(/\s+/g, "-")}`;
      const { data, error } = await supabase.from("routers").insert({
        tenant_id: tenantId,
        name: identity.trim(),
        vendor: "mikrotik",
        status: "offline",
        api_port: 8728,
        provisioning_slug: provSlug,
        provisioning_identity: identity.trim(),
      } as any).select("id").single();
      if (error) throw error;
      setRouterId(data.id);
      setStep(2);
    } catch (err: any) {
      toast.error(err.message || "Failed to create router");
    } finally {
      setCreatingRouter(false);
    }
  }

  // ── Step 2 → 3: Save services to DB, then generate token ─────
  async function handleSaveServices() {
    if (!pppoe && !hotspot) { toast.error("Select at least one service"); return; }
    if (!routerId || !tenantId) return;
    if (bridgePorts.includes(uplinkInterface)) {
      toast.error("Uplink interface cannot be a bridge port");
      return;
    }
    setSavingServices(true);
    try {
      const subnet = customSubnet ? subnetValue : "172.31.0.0/16";
      const provSlug = `${tenantId}-${identity.trim().toLowerCase().replace(/\s+/g, "-")}`;

      // Save ALL config to DB — provision script reads this when router runs it
      const { error: updateErr } = await supabase.from("routers").update({
        services: selectedServices,
        bridge_port: bridgePorts[0] ?? "ether2",
        bridge_ports: bridgePorts,
        uplink_interface: uplinkInterface,
        subnet,
        mode: pppoe && hotspot ? "both" : pppoe ? "pppoe" : "hotspot",
        provisioning_identity: identity.trim(),
        provisioning_slug: provSlug,
      } as any).eq("id", routerId);
      if (updateErr) throw updateErr;

      // Upsert NAS device
      const { data: existingNas } = await supabase.from("nas_devices" as any)
        .select("id").eq("router_id", routerId).maybeSingle();
      const nasPayload = {
        tenant_id: tenantId, router_id: routerId, name: identity.trim(), vendor: "mikrotik",
        nas_identifier: identity.trim(), shared_secret: "SmartLinkNet-Public-Fallback",
        auth_port: 1812, acct_port: 1813, coa_port: 3799, is_active: true,
        dynamic_profile_enabled: true, updated_at: new Date().toISOString(),
      };
      if ((existingNas as any)?.id) {
        await supabase.from("nas_devices" as any).update(nasPayload).eq("id", (existingNas as any).id);
      } else {
        await supabase.from("nas_devices" as any).insert(nasPayload);
      }

      // Upsert RADIUS record
      const { data: existingRadius } = await supabase.from("radius_servers" as any)
        .select("id").eq("tenant_id", tenantId).eq("name", identity.trim()).maybeSingle();
      const radiusPayload = {
        tenant_id: tenantId, name: identity.trim(), auth_port: 1812, acct_port: 1813,
        shared_secret: "SmartLinkNet-Public-Fallback", protocol: "mschapv2",
        is_primary: true, is_active: true, is_healthy: true,
        timeout_ms: 3000, retry_count: 3, priority: 1, updated_at: new Date().toISOString(),
      };
      if ((existingRadius as any)?.id) {
        await supabase.from("radius_servers" as any).update(radiusPayload).eq("id", (existingRadius as any).id);
      } else {
        await supabase.from("radius_servers" as any).insert({ ...radiusPayload, host: "pending" });
      }

      // Generate provision token — script is now ready with all config in DB
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;
      if (!accessToken) throw new Error("Not authenticated");
      const res = await fetch(`${SUPABASE_FUNCTIONS}/create-provision-token`, {
        method: "POST",
        headers: { "content-type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ routerId }),
      });
      if (!res.ok) throw new Error(await res.text() || `Token request failed (${res.status})`);
      const json = await res.json();
      setProvisionToken(json.token ?? json.provision_token ?? null);
      setStep(3);
    } catch (err: any) {
      toast.error(err.message || "Failed to save services");
    } finally {
      setSavingServices(false);
    }
  }

  // ── Step 3 → 4: Router is online, call apply-router-config ───
  async function handleApply() {
    if (!routerId || !tenantId) return;
    setStep(4);
    setApplyDone(false);
    setLogLines([]);

    // Subscribe to provision_logs realtime BEFORE calling apply
    if (realtimeChannelRef.current) {
      try { supabase.removeChannel(realtimeChannelRef.current); } catch {}
      realtimeChannelRef.current = null;
    }

    const safetyTimerRef = { current: null as ReturnType<typeof setTimeout> | null };
    const gotFirstLog = { current: false };

    const channel = supabase.channel(`provision-logs-${routerId}`)
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "provision_logs",
        filter: `router_id=eq.${routerId}`,
      }, (payload) => {
        const row = (payload as any).new;
        if (!row) return;
        if (!gotFirstLog.current) {
          gotFirstLog.current = true;
          if (safetyTimerRef.current) { clearTimeout(safetyTimerRef.current); safetyTimerRef.current = null; }
        }
        const level: LogLevel = row.stage === "api_warning" ? "warn" : row.success ? "success" : "error";
        addLog(row.message || row.stage, level);
        if (row.stage === "complete") {
          if (safetyTimerRef.current) clearTimeout(safetyTimerRef.current);
          setApplyDone(true);
          queryClient.invalidateQueries({ queryKey: ["routers", tenantId] });
        }
      })
      .subscribe();
    realtimeChannelRef.current = channel;

    addLog("Saving final configuration...", "info");

    // Safety timeout — if no realtime log within 30s, show error
    const safetyTimer = setTimeout(() => {
      if (gotFirstLog.current) return;
      addLog("No response from server — check your connection and retry.", "error");
      setApplyDone(true);
    }, 30_000);
    safetyTimerRef.current = safetyTimer;

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token ?? null;
      const res = await fetch(`${SUPABASE_FUNCTIONS}/apply-router-config`, {
        method: "POST",
        headers: { "content-type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ routerId }),
      });
      if (!res.ok) {
        clearTimeout(safetyTimer);
        addLog(`Apply failed: ${await res.text()}`, "error");
        setApplyDone(true);
      }
    } catch (err: any) {
      clearTimeout(safetyTimer);
      addLog(err.message || "Apply failed", "error");
      setApplyDone(true);
    }
  }

  // ── Edit router ───────────────────────────────────────────────
  async function handleEditRouter() {
    if (!editingRouter || !editName.trim()) { toast.error("Router name is required"); return; }
    try {
      const { error } = await supabase.from("routers").update({
        name: editName.trim(),
        model: editModel.trim() || null,
        ...(editIp && { connection_string: editIp.trim() }),
        ...(editApiUsername.trim() && { api_username_pending: editApiUsername.trim() }),
        ...(editApiPassword.trim() && { api_password_pending: editApiPassword.trim() }),
      } as any).eq("id", editingRouter.id);
      if (error) throw error;
      toast.success("Router updated");
      setEditingRouter(null);
      queryClient.invalidateQueries({ queryKey: ["routers", tenantId] });
    } catch (err: any) {
      toast.error(err.message || "Failed to update router");
    }
  }

  // ── Delete router ─────────────────────────────────────────────
  async function handleDeleteRouter(id: string) {
    try {
      const { error } = await supabase.from("routers").delete().eq("id", id);
      if (error) throw error;
      toast.success("Router deleted");
      setDeletingRouter(null);
      queryClient.invalidateQueries({ queryKey: ["routers", tenantId] });
    } catch (err: any) {
      toast.error(err.message || "Failed to delete router");
    }
  }

  // ── Sync router status ────────────────────────────────────────
  async function handleSyncRouter(id: string) {
    setSyncing((prev) => new Set([...prev, id]));
    try {
      const { data: row, error } = await supabase.from("routers")
        .select("status, last_seen, last_poll_at, name").eq("id", id).single();
      if (error) throw error;
      const lastPoll = row?.last_poll_at ? new Date(row.last_poll_at) : null;
      const pollAgeMin = lastPoll ? Math.floor((Date.now() - lastPoll.getTime()) / 60000) : null;
      const isPolling = pollAgeMin !== null && pollAgeMin < 3;
      if (isPolling) {
        toast.success(`${row.name} is online — last poll ${pollAgeMin < 1 ? "just now" : `${pollAgeMin}m ago`}`);
      } else {
        await supabase.from("routers").update({ status: "offline", api_connected: false } as any).eq("id", id);
        toast.error(`${row?.name} missed polls — marked offline. Re-run provisioning script to reconnect.`);
        queryClient.invalidateQueries({ queryKey: ["routers", tenantId] });
      }
    } catch {
      toast.error("Sync failed");
    } finally {
      setSyncing((prev) => { const s = new Set(prev); s.delete(id); return s; });
    }
  }

  // ── Reprovision existing router ───────────────────────────────
  function handleReprovisionRouter(router: any) {
    setRouterId(router.id);
    setIdentity(router.provisioning_identity || router.name || "");
    setPppoe(router.services?.includes("pppoe") ?? false);
    setHotspot(router.services?.includes("hotspot") ?? false);
    setBridgePorts(router.bridge_ports?.length ? router.bridge_ports : [router.bridge_port || "ether2"]);
    setUplinkInterface(router.uplink_interface || "ether1");
    setCustomSubnet(!!router.subnet && router.subnet !== "172.31.0.0/16");
    setSubnetValue(router.subnet || "172.31.0.0/16");
    setProvisionToken(null);
    setRouterOnline(false);
    setRouterPublicIp(null);
    setLogLines([]);
    setApplyDone(false);
    // Skip step 1 (router already exists), go to step 2 to re-confirm services
    setStep(2);
    setView("wizard");
    toast.success("Loaded router for reprovisioning");
  }

  // ── Landing view ──────────────────────────────────────────────
  if (view === "landing") {
    return (
      <div className="min-h-screen bg-background">
        <div className="w-full max-w-2xl lg:max-w-4xl xl:max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-5 pb-10">

          {/* Header */}
          <div className="mb-5 sm:mb-6">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1">NETWORK — ROUTERS</p>
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
              <div>
                <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold mb-1">
                  NAS &amp; <span className="text-primary">routers</span>.
                </h1>
                <p className="text-sm text-muted-foreground">Link a MikroTik, configure services, go live.</p>
              </div>
              <button
                onClick={() => { setStep(1); setIdentity(""); setView("wizard"); }}
                className="self-start sm:self-auto flex items-center gap-2 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground px-5 py-2.5 text-sm font-semibold transition-colors whitespace-nowrap"
              >
                <Plus className="w-4 h-4" /> Link MikroTik
              </button>
            </div>
          </div>

          {/* Stats */}
          <div className="rounded-2xl border border-border bg-card overflow-hidden mb-6">
            <div className="grid grid-cols-2 lg:grid-cols-4 divide-border">
              {[
                { label: "ROUTERS", value: routers.length, sub: "registered NAS devices" },
                { label: "ONLINE", value: online, sub: "polling cloud" },
                { label: "OFFLINE", value: offline, sub: "not responding" },
                { label: "LIVE SESSIONS", value: liveSessions, sub: "subscribers online now" },
              ].map((stat, i) => (
                <div key={stat.label} className={`p-4 sm:p-5 border-border
                  ${i % 2 === 0 ? "border-r" : ""} ${i < 2 ? "border-b lg:border-b-0" : ""}
                  ${i === 1 ? "lg:border-r" : ""} ${i === 2 ? "lg:border-r" : ""}`}>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">{stat.label}</p>
                  <p className="text-2xl sm:text-3xl font-bold mb-1">{stat.value}</p>
                  <p className="text-xs text-muted-foreground">{stat.sub}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Filter + Search */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
            <div className="flex items-center gap-2 flex-wrap">
              {(["all", "online", "offline"] as const).map((f) => {
                const count = f === "all" ? routers.length : f === "online" ? online : offline;
                return (
                  <button key={f} onClick={() => setFilter(f)}
                    className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition-colors
                      ${filter === f ? "bg-foreground text-background" : "bg-card border border-border text-foreground hover:bg-muted"}`}>
                    <span className="capitalize">{f}</span>
                    <span className={`text-xs ${filter === f ? "text-background/70" : "text-muted-foreground"}`}>{count}</span>
                  </button>
                );
              })}
            </div>
            <div className="relative sm:ml-auto sm:w-72 lg:w-80">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Search routers..."
                className="w-full rounded-full border border-border bg-card pl-10 pr-4 py-2.5 text-sm outline-none focus:border-primary transition-colors" />
            </div>
          </div>

          {/* Router table */}
          <div className="rounded-2xl border border-border bg-card overflow-hidden">
            <div className="hidden sm:grid grid-cols-[1.5fr_1fr_1fr_auto] gap-x-4 px-6 py-3 border-b border-border bg-muted/30">
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Router</span>
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Status</span>
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Services</span>
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest text-center">Actions</span>
            </div>

            {routersQuery.isLoading ? (
              <div className="px-6 py-12 text-center">
                <RefreshCw className="w-5 h-5 text-primary animate-spin mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">Loading routers...</p>
              </div>
            ) : filtered.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <p className="text-sm text-muted-foreground">No routers found.</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {filtered.map((r) => {
                  const isOnline = r.status === "online" || r.status === "active";
                  return (
                    <div key={r.id} className="grid sm:grid-cols-[1.5fr_1fr_1fr_auto] gap-4 p-4 sm:p-6 hover:bg-muted/50 transition-colors">
                      <div className="min-w-0">
                        <p className="font-semibold text-sm text-foreground truncate">{r.name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">{r.model ?? "RouterOS"}</p>
                        {r.last_poll_at && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Last poll: {new Date(r.last_poll_at).toLocaleTimeString()}
                          </p>
                        )}
                      </div>
                      <div className="hidden sm:flex items-center">
                        <span className={`text-xs font-medium px-3 py-1.5 rounded-full border whitespace-nowrap
                          ${isOnline ? "text-success border-success/40 bg-success/10" : "text-destructive border-destructive/40 bg-destructive/10"}`}>
                          {isOnline ? "🟢 Online" : "🔴 Offline"}
                        </span>
                      </div>
                      <div className="hidden sm:flex items-center">
                        <p className="text-sm text-foreground">
                          {r.services?.map((s: string) => s === "hotspot" ? "Hotspot" : "PPPoE").join(", ") || "—"}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 sm:justify-end flex-wrap">
                        <button onClick={() => { setViewingRouter(r); setViewTab("details"); }}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium hover:bg-muted transition-colors">
                          <Search className="w-3.5 h-3.5" /><span className="hidden sm:inline">View</span>
                        </button>
                        <button onClick={() => handleReprovisionRouter(r)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-xs font-medium text-primary hover:bg-primary/20 transition-colors">
                          <RotateCw className="w-3.5 h-3.5" /><span className="hidden sm:inline">Reprovision</span>
                        </button>
                        <button onClick={() => { setEditingRouter(r); setEditName(r.name || ""); setEditModel(r.model || ""); setEditIp(r.connection_string || ""); setEditApiUsername(""); setEditApiPassword(""); }}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium hover:bg-muted transition-colors">
                          <Edit2 className="w-3.5 h-3.5" /><span className="hidden sm:inline">Edit</span>
                        </button>
                        <button onClick={() => handleSyncRouter(r.id)} disabled={syncing.has(r.id)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium hover:bg-muted transition-colors disabled:opacity-50">
                          <RotateCw className={`w-3.5 h-3.5 ${syncing.has(r.id) ? "animate-spin" : ""}`} />
                          <span className="hidden sm:inline">Sync</span>
                        </button>
                        <button onClick={() => setDeletingRouter(r.id)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive hover:bg-destructive/20 transition-colors">
                          <Trash2 className="w-3.5 h-3.5" /><span className="hidden sm:inline">Delete</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
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
                  <button onClick={() => setEditingRouter(null)}><X className="w-5 h-5 text-muted-foreground" /></button>
                </div>
                <div className="space-y-4 mb-6">
                  <div>
                    <label className="block text-sm font-semibold mb-2">Router Name</label>
                    <input value={editName} onChange={(e) => setEditName(e.target.value)}
                      className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm outline-none focus:border-primary transition-all"
                      placeholder="e.g., ISP-HQ-Router-1" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold mb-2">Model (Optional)</label>
                    <input value={editModel} onChange={(e) => setEditModel(e.target.value)}
                      className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm outline-none focus:border-primary transition-all"
                      placeholder="e.g., hAP ac2" />
                  </div>
                  <div className="border-t border-border pt-4 space-y-3">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Update Credentials (optional)</p>
                    <input value={editApiUsername} onChange={(e) => setEditApiUsername(e.target.value)}
                      className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm outline-none focus:border-primary transition-all"
                      placeholder="New API username" />
                    <input type="password" value={editApiPassword} onChange={(e) => setEditApiPassword(e.target.value)}
                      className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm outline-none focus:border-primary transition-all"
                      placeholder="New API password" />
                    <p className="text-xs text-muted-foreground">Credentials update on next router poll (≤1 min).</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <button onClick={() => setEditingRouter(null)}
                    className="flex-1 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-medium hover:bg-muted transition-colors">Cancel</button>
                  <button onClick={handleEditRouter}
                    className="flex-1 rounded-lg bg-primary text-primary-foreground px-4 py-2.5 text-sm font-medium hover:bg-primary/90 transition-colors">Save</button>
                </div>
              </div>
            </div>
          )}

          {/* Delete Confirmation */}
          {deletingRouter && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
              <div className="bg-card rounded-2xl border border-border p-6 w-full max-w-md">
                <div className="flex items-start gap-4 mb-6">
                  <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center shrink-0">
                    <AlertTriangle className="w-6 h-6 text-destructive" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold mb-1">Delete Router?</h3>
                    <p className="text-sm text-muted-foreground">This permanently deletes the router and all configuration. Cannot be undone.</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <button onClick={() => setDeletingRouter(null)}
                    className="flex-1 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-medium hover:bg-muted transition-colors">Cancel</button>
                  <button onClick={() => handleDeleteRouter(deletingRouter)}
                    className="flex-1 rounded-lg bg-destructive text-destructive-foreground px-4 py-2.5 text-sm font-medium hover:bg-destructive/90 transition-colors">Delete</button>
                </div>
              </div>
            </div>
          )}

          {/* View Router Modal */}
          {viewingRouter && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
              onClick={(e) => { if (e.target === e.currentTarget) setViewingRouter(null); }}>
              <div className="bg-card w-full sm:max-w-2xl sm:rounded-2xl rounded-t-2xl border border-border flex flex-col max-h-[92dvh] sm:max-h-[88vh] overflow-hidden">
                <div className="flex items-start justify-between px-5 py-4 border-b border-border shrink-0">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-2.5 h-2.5 rounded-full shrink-0 mt-0.5 ${viewingRouter.status === "online" || viewingRouter.status === "active" ? "bg-success" : "bg-destructive"}`} />
                    <div className="min-w-0">
                      <h2 className="text-base font-bold truncate">{viewingRouter.name}</h2>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {viewingRouter.model || "RouterOS"} ·{" "}
                        <span className={viewingRouter.status === "online" || viewingRouter.status === "active" ? "text-success font-medium" : "text-destructive font-medium"}>
                          {viewingRouter.status === "online" || viewingRouter.status === "active" ? "Online" : "Offline"}
                        </span>
                        {viewingRouter.last_poll_at && (
                          <span className="ml-2 text-muted-foreground">
                            · polled {new Date(viewingRouter.last_poll_at).toLocaleTimeString()}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                  <button onClick={() => setViewingRouter(null)}
                    className="shrink-0 ml-3 w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex gap-1 px-5 py-2.5 border-b border-border shrink-0 bg-muted/30">
                  {(["details", "scripts", "diagnostics"] as const).map((tab) => (
                    <button key={tab} onClick={() => setViewTab(tab)}
                      className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors capitalize
                        ${viewTab === tab ? "bg-card text-foreground shadow-sm border border-border" : "text-muted-foreground hover:text-foreground"}`}>
                      {tab}
                    </button>
                  ))}
                </div>

                <div className="flex-1 overflow-y-auto px-5 py-4">
                  {viewTab === "details" && (
                    <div className="space-y-0">
                      {[
                        { label: "Name", value: viewingRouter.name },
                        { label: "Model", value: viewingRouter.model || "—" },
                        { label: "Status", value: (viewingRouter.status === "online" || viewingRouter.status === "active") ? "Online" : "Offline", status: viewingRouter.status },
                        { label: "Public IP", value: viewingRouter.public_ip || "—" },
                        { label: "Services", value: viewingRouter.services?.map((s: string) => s === "hotspot" ? "Hotspot" : "PPPoE").join(", ") || "—" },
                        { label: "Bridge Ports", value: viewingRouter.bridge_ports?.join(", ") || viewingRouter.bridge_port || "—" },
                        { label: "Uplink", value: viewingRouter.uplink_interface || "ether1" },
                        { label: "Subnet", value: viewingRouter.subnet || "—" },
                        { label: "Polling", value: viewingRouter.api_connected ? "Active (≤1 min)" : "Not polling" },
                      ].map((row) => (
                        <div key={row.label} className="flex items-center justify-between py-2.5 border-b border-border/60 last:border-0">
                          <span className="text-xs text-muted-foreground font-medium w-28 shrink-0">{row.label}</span>
                          {row.status ? (
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${(row.status === "online" || row.status === "active") ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}>
                              {row.value}
                            </span>
                          ) : (
                            <span className="font-mono text-sm text-foreground text-right break-all">{row.value}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {viewTab === "scripts" && (
                    <div className="space-y-5">
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Provisioning Script</p>
                        <div className="rounded-xl border border-border overflow-hidden">
                          <div className="flex items-center justify-between px-3 py-2 bg-muted/50 border-b border-border">
                            <span className="text-xs text-muted-foreground font-mono">RouterOS Terminal</span>
                            <button onClick={() => {
                              const script = `/tool fetch mode=https url="${SUPABASE_FUNCTIONS.replace("/functions/v1", "")}/functions/v1/provision?token=${viewingRouter.provision_token ?? "TOKEN"}" dst-path=sln-provision.rsc;:delay 2s;/import sln-provision.rsc;`;
                              navigator.clipboard.writeText(script);
                              toast.success("Script copied");
                            }} className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 font-medium">
                              <Copy className="w-3 h-3" /> Copy
                            </button>
                          </div>
                          <div className="p-3 bg-background">
                            <pre className="text-xs font-mono text-foreground whitespace-pre-wrap break-all leading-relaxed">
                              {`/tool fetch mode=https url="${SUPABASE_FUNCTIONS.replace("/functions/v1", "")}/functions/v1/provision?token=<token>" dst-path=sln-provision.rsc;:delay 2s;/import sln-provision.rsc;`}
                            </pre>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {viewTab === "diagnostics" && (
                    <div className="space-y-4">
                      <div className="rounded-xl border border-border overflow-hidden">
                        {[
                          { label: "Router Status", ok: viewingRouter.status === "online" || viewingRouter.status === "active", okText: "Online", failText: "Offline" },
                          { label: "Cloud Polling", ok: !!viewingRouter.api_connected, okText: "Active — polls every 1 min", failText: "Not polling — re-run script" },
                          { label: "Services", ok: !!viewingRouter.services?.length, okText: viewingRouter.services?.join(", "), failText: "Not configured" },
                          { label: "Bridge Ports", ok: !!viewingRouter.bridge_port || !!viewingRouter.bridge_ports?.length, okText: viewingRouter.bridge_ports?.join(", ") || viewingRouter.bridge_port, failText: "Not set" },
                          { label: "NAS Registered", ok: true, okText: "In RADIUS DB", failText: "Missing" },
                        ].map((check, i, arr) => (
                          <div key={check.label} className={`flex items-center justify-between px-4 py-3 ${i < arr.length - 1 ? "border-b border-border" : ""}`}>
                            <span className="text-sm text-foreground">{check.label}</span>
                            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${check.ok ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}>
                              {check.ok ? `✓ ${check.okText}` : `✕ ${check.failText}`}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="shrink-0 border-t border-border px-5 py-3 flex items-center justify-between gap-3">
                  <button onClick={() => setViewingRouter(null)}
                    className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors px-2 py-1.5">Close</button>
                  <button onClick={() => { handleReprovisionRouter(viewingRouter); setViewingRouter(null); }}
                    className="flex items-center gap-2 rounded-full bg-primary text-primary-foreground px-5 py-2 text-sm font-semibold hover:bg-primary/90 transition-colors">
                    <RotateCw className="w-3.5 h-3.5" /> Reprovision
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Wizard view ───────────────────────────────────────────────
  const saasDomain = SUPABASE_FUNCTIONS.replace("/functions/v1", "");
  const provisionScript = provisionToken
    ? `/tool fetch mode=https url="${saasDomain}/functions/v1/provision?token=${encodeURIComponent(provisionToken)}" dst-path=sln-provision.rsc;:delay 2s;/import sln-provision.rsc;`
    : "Generating script...";

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Breadcrumb */}
      <div className="px-4 sm:px-6 pt-4 pb-2 text-xs text-muted-foreground flex items-center gap-1.5 flex-wrap">
        <span>NAS</span><span>/</span>
        <button onClick={resetWizard} className="hover:text-foreground">Routers</button>
        <span>/</span>
        <span className="text-foreground font-semibold">
          {step === 1 ? "Link MikroTik" : `${identity || "MikroTik"} / ${["", "Identity", "Services", "Script", "Deploying"][step]}`}
        </span>
      </div>

      <div className="flex-1 px-4 sm:px-6 pb-28 w-full max-w-xl lg:max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-5 sm:mb-6">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1">NETWORK — ROUTERS</p>
          <h1 className="text-xl sm:text-2xl font-bold">Link a <span className="text-primary">MikroTik</span>.</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {step === 1 && "Name your router — this becomes its RouterOS identity."}
            {step === 2 && "Choose services and network config — baked into the provisioning script."}
            {step === 3 && "Paste the script in Winbox terminal. Router configures itself and calls home."}
            {step === 4 && "Registering router and queuing configuration commands."}
          </p>
        </div>

        <StepIndicator current={step} />

        {/* ── Step 1: Identity ── */}
        {step === 1 && (
          <div className="rounded-2xl border border-border bg-card p-4 sm:p-6 space-y-5">
            <div>
              <h2 className="font-bold text-base mb-1">Router identity</h2>
              <p className="text-xs text-muted-foreground mb-4">
                This name is set on the router via <code>/system identity set name</code>. Use the name shown in Winbox → System → Identity.
              </p>
              <div className="flex gap-2">
                <input
                  value={identity}
                  onChange={(e) => setIdentity(e.target.value)}
                  className="flex-1 rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                  placeholder="e.g. MikroTik1"
                  onKeyDown={(e) => e.key === "Enter" && handleCreateRouter()}
                />
                <button
                  onClick={() => setIdentity(`MikroTik${routers.length + 1}`)}
                  className="px-4 py-3 rounded-xl border border-border bg-muted hover:bg-muted/80 text-sm font-medium transition-colors whitespace-nowrap"
                >
                  Auto-fill
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Step 2: Services + Bridge + Subnet ── */}
        {step === 2 && (
          <>
            <div className="rounded-2xl border border-primary/30 bg-primary/5 px-4 py-3 mb-4 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-primary shrink-0 mt-0.5" />
              <p className="text-xs text-primary/80">
                Configure everything here <strong>before</strong> running the script. The provisioning script reads these settings from the database when the router downloads it.
              </p>
            </div>

            {/* Services */}
            <section className="rounded-2xl border border-border bg-card p-4 sm:p-6 mb-4">
              <h2 className="font-bold text-base mb-0.5">Service types</h2>
              <p className="text-xs text-muted-foreground mb-4">Select what this router will run for subscribers.</p>
              <div className="grid grid-cols-2 gap-3">
                <ServiceTypeCard label="PPP" sublabel="PPPoE" description="Always-on broadband subscribers" checked={pppoe} onChange={setPppoe} />
                <ServiceTypeCard label="HS" sublabel="Hotspot" description="Captive portal & vouchers" checked={hotspot} onChange={setHotspot} />
              </div>
            </section>

            {/* Bridge + Uplink */}
            <section className="rounded-2xl border border-border bg-card p-4 sm:p-6 mb-4">
              <h2 className="font-bold text-base mb-1">Network interfaces</h2>
              <p className="text-xs text-muted-foreground mb-4">
                Set the uplink (WAN) port and which ports join the subscriber bridge.
              </p>

              <div className="rounded-xl border border-amber-400/40 bg-amber-50 dark:bg-amber-500/10 p-3 mb-4">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                  <p className="text-xs text-amber-800 dark:text-amber-300">
                    <strong>Never bridge the uplink port.</strong> ether1 is typically the WAN — adding it to the bridge cuts internet and provisioning fails.
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Uplink / WAN interface</label>
                  <div className="flex gap-2 flex-wrap">
                    {["ether1", "ether2", "ether3", "ether4", "ether5"].map((iface) => (
                      <button key={iface} onClick={() => setUplinkInterface(iface)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors
                          ${uplinkInterface === iface ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-foreground hover:bg-muted"}`}>
                        {iface}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Bridge ports (subscriber LAN)</label>
                  <div className="flex gap-2 flex-wrap">
                    {["ether1", "ether2", "ether3", "ether4", "ether5", "wlan1", "wlan2"].map((iface) => {
                      const isUplink = iface === uplinkInterface;
                      const inBridge = bridgePorts.includes(iface);
                      return (
                        <button key={iface} disabled={isUplink}
                          onClick={() => setBridgePorts((prev) =>
                            inBridge ? prev.filter((p) => p !== iface) : [...prev, iface]
                          )}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors
                            ${isUplink ? "border-border bg-muted text-muted-foreground cursor-not-allowed opacity-40"
                              : inBridge ? "border-primary bg-primary/10 text-primary"
                              : "border-border bg-card text-foreground hover:bg-muted"}`}>
                          {iface}{isUplink ? " (WAN)" : ""}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    Selected: {bridgePorts.filter(p => p !== uplinkInterface).join(", ") || "none"}
                  </p>
                </div>
              </div>
            </section>

            {/* Subnet */}
            <section className="rounded-2xl border border-border bg-card p-4 sm:p-6 mb-4">
              <h2 className="font-bold text-base mb-0.5">Subnet</h2>
              <p className="text-xs text-muted-foreground mb-4">Bridge gateway IP range. Default 172.31.0.0/16 works for most deployments.</p>
              <label className="flex items-center gap-3 rounded-xl border border-border bg-background p-4 cursor-pointer mb-3">
                <input type="checkbox" className="accent-primary w-4 h-4 shrink-0"
                  checked={customSubnet} onChange={(e) => setCustomSubnet(e.target.checked)} />
                <span className="text-sm">Use custom subnet (default: 172.31.0.0/16)</span>
              </label>
              {customSubnet && (
                <input type="text" value={subnetValue} onChange={(e) => setSubnetValue(e.target.value)}
                  className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                  placeholder="e.g. 192.168.1.0/24" />
              )}
            </section>
          </>
        )}

        {/* ── Step 3: Script + Wait ── */}
        {step === 3 && (
          <div className="rounded-2xl border border-border bg-card p-4 sm:p-6">
            <h2 className="font-bold text-base mb-1">Run provisioning script</h2>
            <p className="text-xs text-muted-foreground mb-5">
              Open Winbox → New Terminal and paste this one-liner. The router downloads its full config (bridge, DHCP, RADIUS, {selectedServices.map(s => s === "hotspot" ? "Hotspot" : "PPPoE").join(", ")}) and calls home when done.
            </p>

            {/* Script box */}
            <div className="relative rounded-xl border border-border bg-background p-4 mb-5">
              <button
                onClick={() => { navigator.clipboard.writeText(provisionScript); toast.success("Script copied"); }}
                className="absolute top-3 right-3 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground border border-border rounded-lg px-2 py-1 bg-background transition-colors z-10"
              >
                <Copy className="w-3 h-3" /> Copy
              </button>
              <pre className="text-xs font-mono text-foreground whitespace-pre-wrap break-all pr-20 leading-relaxed">
                {provisionScript}
              </pre>
            </div>

            {/* What the script does */}
            <div className="rounded-xl border border-border bg-muted/30 p-4 mb-5">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Script configures</p>
              <div className="grid grid-cols-2 gap-1">
                {[
                  "System identity", "Bridge + ports",
                  "Gateway IP", "DHCP pool",
                  "NAT masquerade", "DNS",
                  "RADIUS client", ...(hotspot ? ["Hotspot server", "Walled garden"] : []),
                  ...(pppoe ? ["PPPoE server"] : []),
                  "API user (sln-api)", "Poll scheduler (1 min)",
                  "Heartbeat (5 min)",
                ].map((item) => (
                  <div key={item} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Check className="w-3 h-3 text-success shrink-0" /> {item}
                  </div>
                ))}
              </div>
            </div>

            {/* Status */}
            {!routerOnline ? (
              <div className="flex items-center gap-3 rounded-xl bg-muted border border-border px-4 py-3">
                <RefreshCw className="w-4 h-4 text-muted-foreground animate-spin shrink-0" />
                <div>
                  <p className="text-sm font-medium">Waiting for {identity} to call home...</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Router will appear online within ~30 seconds of script completing.</p>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 rounded-xl bg-success/10 border border-success/20 px-4 py-3">
                <Check className="w-5 h-5 text-success shrink-0" />
                <div>
                  <p className="text-sm font-medium text-success">{identity} is online{routerPublicIp ? ` — public IP: ${routerPublicIp}` : ""}!</p>
                  <p className="text-xs text-success/70 mt-0.5">Script completed. Router is now polling cloud every 1 minute. Click "Register &amp; Activate" to finish.</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Step 4: Deployment logs ── */}
        {step === 4 && (
          <div className="rounded-2xl border border-border bg-card p-4 sm:p-6">
            <h2 className="font-bold text-base mb-1">
              {applyDone
                ? logLines.some(l => l.level === "error") ? "⚠ Deployment Error" : "✓ Router Linked"
                : "Registering router..."}
            </h2>
            <p className="text-xs text-muted-foreground mb-5">
              {applyDone
                ? logLines.some(l => l.level === "error")
                  ? "An error occurred. Check logs and retry."
                  : "NAS and RADIUS registered. Router is polling cloud every 1 minute for commands."
                : "Saving NAS, RADIUS records and queuing configuration commands..."}
            </p>

            {/* Summary grid */}
            <div className="rounded-xl border border-border bg-background mb-5 overflow-hidden">
              {[
                { label: "Router", value: identity, icon: "📶" },
                { label: "Public IP", value: routerPublicIp ?? "—", icon: "🌐" },
                { label: "Services", value: selectedServices.map(s => s === "hotspot" ? "Hotspot" : "PPPoE").join(", ") || "—", icon: "⚙️" },
                { label: "Bridge Ports", value: bridgePorts.join(", "), icon: "🌉" },
                { label: "Subnet", value: customSubnet ? subnetValue : "172.31.0.0/16", icon: "🗂️" },
              ].map((row, i) => (
                <div key={row.label} className={`flex items-center justify-between px-4 py-3 text-sm ${i < 4 ? "border-b border-border" : ""}`}>
                  <div className="flex items-center gap-2">
                    <span>{row.icon}</span>
                    <span className="text-muted-foreground">{row.label}</span>
                  </div>
                  <span className="font-mono font-semibold text-foreground">{row.value}</span>
                </div>
              ))}
            </div>

            {/* Logs */}
            <div className="mb-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Deployment Log</p>
              <div className="rounded-xl border border-border bg-background/50 overflow-hidden font-mono text-xs">
                {logLines.length === 0 ? (
                  <div className="p-4 flex items-center gap-2 text-muted-foreground">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Starting...
                  </div>
                ) : (
                  <div className="divide-y divide-border/40">
                    {logLines.map((log, i) => (
                      <div key={i} className={`px-4 py-2.5 flex gap-3 items-start
                        ${log.level === "success" ? "bg-success/5 text-success"
                          : log.level === "error" ? "bg-destructive/5 text-destructive"
                          : log.level === "warn" ? "bg-amber-500/5 text-amber-600 dark:text-amber-400"
                          : "bg-transparent text-foreground"}`}>
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

            {/* Done banner */}
            {applyDone && (
              <div className={`rounded-xl p-4 border ${
                logLines.some(l => l.level === "error")
                  ? "bg-destructive/10 border-destructive/30"
                  : "bg-success/10 border-success/20"
              }`}>
                {logLines.some(l => l.level === "error") ? (
                  <>
                    <p className="text-sm text-destructive font-medium">Deployment encountered errors</p>
                    <p className="text-xs text-destructive/70 mt-1">Check logs above. Click Retry to try again.</p>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-success font-medium">✓ Router fully linked and active</p>
                    <p className="text-xs text-success/70 mt-1">
                      NAS registered, RADIUS configured, poll scheduler running. Router will apply any queued config commands within 1 minute.
                    </p>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        <BrandFooter />
      </div>

      {/* ── Bottom navigation ── */}
      <div className="fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur-sm border-t border-border px-4 sm:px-6 py-3 sm:py-4">
        <div className="w-full max-w-xl lg:max-w-2xl mx-auto flex items-center justify-between gap-3">

          {/* Step 1 */}
          {step === 1 && (
            <>
              <button onClick={resetWizard}
                className="px-4 py-2.5 text-sm font-medium text-foreground hover:text-muted-foreground transition-colors">
                Cancel
              </button>
              <button onClick={handleCreateRouter} disabled={creatingRouter}
                className="rounded-full bg-primary hover:bg-primary/90 text-primary-foreground px-5 sm:px-6 py-2.5 text-sm font-semibold transition-colors disabled:opacity-70 flex items-center gap-2">
                {creatingRouter ? <><RefreshCw className="w-4 h-4 animate-spin" /> Creating...</> : "Continue →"}
              </button>
            </>
          )}

          {/* Step 2 */}
          {step === 2 && (
            <>
              <button onClick={() => setStep(1)}
                className="flex items-center gap-1.5 rounded-full border border-border bg-card px-4 sm:px-5 py-2.5 text-sm font-medium hover:bg-muted transition-colors">
                <ChevronLeft className="w-4 h-4" /> Back
              </button>
              <button onClick={handleSaveServices} disabled={savingServices || (!pppoe && !hotspot)}
                className="rounded-full bg-primary hover:bg-primary/90 text-primary-foreground px-5 sm:px-6 py-2.5 text-sm font-semibold transition-colors disabled:opacity-50 flex items-center gap-2">
                {savingServices ? <><RefreshCw className="w-4 h-4 animate-spin" /> Saving...</> : "Save & Generate Script →"}
              </button>
            </>
          )}

          {/* Step 3 */}
          {step === 3 && (
            <>
              <button onClick={() => setStep(2)}
                className="flex items-center gap-1.5 rounded-full border border-border bg-card px-4 sm:px-5 py-2.5 text-sm font-medium hover:bg-muted transition-colors">
                <ChevronLeft className="w-4 h-4" /> Back
              </button>
              <button onClick={handleApply} disabled={!routerOnline}
                className="rounded-full bg-primary hover:bg-primary/90 text-primary-foreground px-5 sm:px-6 py-2.5 text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                {routerOnline ? "Register & Activate →" : "Waiting for router..."}
              </button>
            </>
          )}

          {/* Step 4 */}
          {step === 4 && (
            <>
              <button onClick={() => setStep(3)} disabled={!applyDone}
                className="flex items-center gap-1.5 rounded-full border border-border bg-card px-4 sm:px-5 py-2.5 text-sm font-medium hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                <ChevronLeft className="w-4 h-4" /> Back
              </button>
              {applyDone && logLines.some(l => l.level === "error") ? (
                <div className="flex gap-2">
                  <button onClick={handleApply}
                    className="rounded-full bg-yellow-500 hover:bg-yellow-600 text-white px-4 sm:px-5 py-2.5 text-sm font-semibold transition-colors">
                    Retry
                  </button>
                  <button onClick={resetWizard}
                    className="rounded-full bg-card border border-border px-5 py-2.5 text-sm font-semibold hover:bg-muted transition-colors">
                    Close
                  </button>
                </div>
              ) : (
                <button onClick={resetWizard} disabled={!applyDone}
                  className="rounded-full bg-success hover:bg-success/90 text-success-foreground px-5 sm:px-6 py-2.5 text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                  {applyDone ? "✓ Done" : "Activating..."}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
