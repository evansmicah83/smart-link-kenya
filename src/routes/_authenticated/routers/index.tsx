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

  const [routerIp, setRouterIp] = useState("");
  const [apiUsername, setApiUsername] = useState("admin");
  const [apiPassword, setApiPassword] = useState("");
  const [pppoe, setPppoe] = useState(false);
  const [hotspot, setHotspot] = useState(false);
  const [bridgePort, setBridgePort] = useState<"ether1" | "ether2">("ether2");
  // New: support multiple bridge ports and explicit uplink selection
  const [bridgePorts, setBridgePorts] = useState<string[]>(["ether2"]);
  const [uplinkInterface, setUplinkInterface] = useState<string | null>(null);
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
  const [editIp, setEditIp] = useState("");
  const [editApiUsername, setEditApiUsername] = useState("");
  const [editApiPassword, setEditApiPassword] = useState("");
  const [deletingRouter, setDeletingRouter] = useState<string | null>(null);
  const [syncing, setSyncing] = useState<Set<string>>(new Set());
  const [apiPortDisabled, setApiPortDisabled] = useState(false);
  const [checkingApiPort, setCheckingApiPort] = useState(false);
  const [reprovisioning, setReprovisioning] = useState<string | null>(null);
  const [viewingRouter, setViewingRouter] = useState<any | null>(null);
  const [viewTab, setViewTab] = useState<"details" | "scripts" | "diagnostics">("details");
  const [serverIp, setServerIp] = useState<string>("");
  const [provisionToken, setProvisionToken] = useState<string | null>(null);
  const [showTokenModal, setShowTokenModal] = useState(false);
     
  const queryClient = useQueryClient();
  const realtimeChannelRef = useRef<any | null>(null);

  // cleanup realtime channel on unmount
  useEffect(() => {
    return () => {
      if (realtimeChannelRef.current) {
        try { supabase.removeChannel(realtimeChannelRef.current); } catch {};
        realtimeChannelRef.current = null;
      }
    };
  }, []);

  // Fetch live interfaces from Edge Function when in Step 3 and router is online
  const interfacesQuery = useQuery({
    queryKey: ["router-interfaces", routerId],
    queryFn: async () => {
      if (!routerId) throw new Error("Missing routerId");
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;
      if (!accessToken) { throw new Error("Not authenticated"); }
      const res = await fetch(`/functions/v1/get-router-interfaces`, {
        method: "POST",
        headers: { "content-type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ routerId }),
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || `Failed to fetch interfaces (${res.status})`);
      }
      return res.json();
    },
    enabled: !!routerId && routerOnline === true,
    staleTime: 10_000,
    cacheTime: 30_000,
  });

  // When interfaces arrive, suggest uplink (highest traffic) and default bridge ports
  useEffect(() => {
    if (!interfacesQuery.data || !interfacesQuery.data.interfaces) return;
    const ifs: Array<any> = interfacesQuery.data.interfaces;
    // choose interface with max (rx+tx)
    let best: any = null;
    for (const it of ifs) {
      const score = (Number(it.rx) || 0) + (Number(it.tx) || 0);
      if (!best || score > best.score) best = { name: it.name, score };
    }
    if (best && !uplinkInterface) setUplinkInterface(best.name);
    // default bridgePorts to include ether2 if present and not already set
    const hasEther2 = ifs.some((i) => i.name === 'ether2');
    if (hasEther2 && (!bridgePorts || bridgePorts.length === 0)) setBridgePorts(['ether2']);
  }, [interfacesQuery.data]);

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

  // Auto-refresh router list every 60s — status is set by heartbeat (server.ts /provision/notify)
  useEffect(() => {
    if (!tenantId) return;
    const interval = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ["routers", tenantId] });
    }, 60000);
    return () => clearInterval(interval);
  }, [tenantId]);

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
  const provisionScript = provisionToken
    ? `/tool fetch mode=https url=\"${saasDomain}/functions/v1/provision?token=${encodeURIComponent(provisionToken)}\" dst-path=smartlinknet-provision.rsc;:delay 2s;/import smartlinknet-provision.rsc;`
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
    setRouterIp("");
    setApiUsername("admin");
    setApiPassword("");
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
    if (!routerId || !tenantId) { toast.error("Router not found"); return; }

    setStep(4);
    setApplyDone(false);
    setLogLines([]);

    const addLog = (message: string, level: "info" | "success" | "warn" | "error" = "info") => {
      const ts = new Date().toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
      const icon = level === "success" ? "✓" : level === "error" ? "✕" : level === "warn" ? "⚠" : "•";
      setLogLines((prev) => [...prev, { ts, level, icon, message }]);
    };

    try {
      const provSlug = `${tenantId}-${identity.trim().toLowerCase().replace(/\s+/g, "-")}`;
      const subnet = customSubnet ? subnetValue : "172.31.0.0/16";

      // client-side validation: uplink must not be included in bridge_ports
      if (uplinkInterface && bridgePorts.includes(uplinkInterface)) {
        toast.error("Selected uplink must not be joined to the bridge");
        setStep(3);
        return;
      }

      // 1. Save router config to DB
      addLog("Saving router configuration...", "info");
      const { error: updateErr } = await supabase.from("routers").update({
        services: selectedServices,
        // Backwards compatibility: single bridge_port (first in array)
        bridge_port: bridgePorts && bridgePorts.length ? bridgePorts[0] : bridgePort,
        // New fields
        bridge_ports: bridgePorts,
        uplink_interface: uplinkInterface,
        subnet,
        // mode column: pppoe, hotspot, both
        mode: (pppoe && hotspot) ? 'both' : (pppoe ? 'pppoe' : (hotspot ? 'hotspot' : null)),
        provisioning_identity: identity.trim(),
        provisioning_slug: provSlug,
      } as any).eq("id", routerId);
      if (updateErr) throw new Error(`Failed to save router config: ${updateErr.message}`);
      addLog(`Router config saved — services: ${selectedServices.map(s => s === "hotspot" ? "Hotspot" : "PPPoE").join(", ")}`, "success");

      // 2. Upsert NAS device record
      addLog("Registering NAS device...", "info");
      const { data: existingNas } = await supabase.from("nas_devices" as any).select("id").eq("router_id", routerId).maybeSingle();
      const nasPayload = {
        tenant_id: tenantId,
        router_id: routerId,
        name: identity.trim(),
        vendor: "mikrotik",
        nas_identifier: identity.trim(),
        shared_secret: "SmartLinkNet-Public-Fallback",
        auth_port: 1812,
        acct_port: 1813,
        coa_port: 3799,
        is_active: true,
        dynamic_profile_enabled: true,
        updated_at: new Date().toISOString(),
      };
      if (existingNas?.id) {
        await supabase.from("nas_devices" as any).update(nasPayload).eq("id", existingNas.id);
      } else {
        await supabase.from("nas_devices" as any).insert(nasPayload);
      }
      addLog("NAS device registered", "success");

      // 3. Upsert RADIUS server record
      addLog("Configuring RADIUS server...", "info");
      const { data: existingRadius } = await supabase.from("radius_servers" as any).select("id").eq("tenant_id", tenantId).eq("name", identity.trim()).maybeSingle();
      const radiusPayload = {
        tenant_id: tenantId,
        name: identity.trim(),
        auth_port: 1812,
        acct_port: 1813,
        shared_secret: "SmartLinkNet-Public-Fallback",
        protocol: "mschapv2",
        is_primary: true,
        is_active: true,
        is_healthy: true,
        timeout_ms: 3000,
        retry_count: 3,
        priority: 1,
        updated_at: new Date().toISOString(),
      };
      if (existingRadius?.id) {
        await supabase.from("radius_servers" as any).update(radiusPayload).eq("id", existingRadius.id);
      } else {
        // host will be updated by markRouterOnline when router checks in with real SERVER_IP
        await supabase.from("radius_servers" as any).insert({ ...radiusPayload, host: "pending" });
      }
      addLog("RADIUS server record saved", "success");

      // 4. Save hotspot portal URL if hotspot enabled
      if (hotspot) {
        addLog("Configuring hotspot captive portal...", "info");
        const { data: tenantRow } = await supabase.from("tenants").select("slug").eq("id", tenantId).maybeSingle();
        const ispSlug = (tenantRow as any)?.slug ?? tenantId;
        const portalLoginPage = `${window.location.origin}/portal?isp=${ispSlug}&mac=$(mac)&ip=$(ip)&url=$(link-orig)&dst=$(dst-ip)`;
        await (supabase as any).from("settings").upsert({
          tenant_id: tenantId,
          key: "hotspot_login_page",
          value: portalLoginPage,
        }, { onConflict: "tenant_id,key" });
        addLog(`Captive portal URL configured`, "success");
      }

      // 5. Verify provisioning script is reachable and contains full config
      addLog("Verifying provisioning script...", "info");
      const provisionUrl = `${window.location.origin}/provision/${provSlug}`;
      const scriptRes = await fetch(provisionUrl);
      if (!scriptRes.ok) throw new Error(`Provisioning script not reachable (HTTP ${scriptRes.status})`);
      const scriptText = await scriptRes.text();
      if (!scriptText.includes("SmartLinkNet")) throw new Error("Provisioning script content invalid");
      const hasCorrectServices = (
        (!pppoe || scriptText.includes("pppoe-server")) &&
        (!hotspot || scriptText.includes("hotspot"))
      );
      if (!hasCorrectServices) throw new Error("Provisioning script missing selected service configuration");
      addLog("Provisioning script verified — all services present", "success");

      // 6. Read router status (set by heartbeat in step 2)
      const { data: routerRow } = await supabase.from("routers").select("status, ip_address, last_seen").eq("id", routerId).single();
      if (routerRow?.status === "online") {
        addLog(`Router online — last heartbeat ${routerRow.last_seen ? new Date(routerRow.last_seen).toLocaleTimeString() : "just now"}`, "success");
        if (routerRow.ip_address) setVpnAddress(routerRow.ip_address);
      } else {
        addLog("Router is offline — run the provisioning script in Winbox to activate", "warn");
      }

      // 7. Summary (persisted locally, provisioning worker will perform router-facing changes)
      addLog(`Bridge: ${bridgePort} → ${provisioningTemplate.bridgeName}`, "success");
      addLog(`Subnet: ${subnet}`, "success");
      addLog(`Auto-update scheduler: daily at 00:00`, "success");
      addLog("Router is fully configured and ready for subscribers — starting apply step", "info");

      queryClient.invalidateQueries({ queryKey: ["routers", tenantId] });

      // Subscribe to provision_logs and routers updates for live logs/status
      try {
        if (realtimeChannelRef.current) {
          try { supabase.removeChannel(realtimeChannelRef.current); } catch {}
          realtimeChannelRef.current = null;
        }

        const channel = supabase.channel(`provision-${routerId}`)
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'provision_logs', filter: `router_id=eq.${routerId}` }, (payload) => {
            const row = (payload as any).new;
            if (!row) return;
            addLog(row.message || row.stage || 'log', row.success ? 'success' : 'error');
          })
          .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'routers', filter: `id=eq.${routerId}` }, (payload) => {
            const row = (payload as any).new;
            if (!row) return;
            if (row.status === 'active') {
              addLog('Router marked active', 'success');
              setApplyDone(true);
            }
            if (row.status === 'failed') {
              addLog('Router provisioning failed', 'error');
              setApplyDone(true);
            }
          })
          .subscribe();

        realtimeChannelRef.current = channel;

        // Invoke Edge Function to apply router config
        addLog('Invoking apply-router-config...', 'info');
        const { data } = await supabase.auth.getSession();
        const accessToken = data?.session?.access_token ?? data?.access_token ?? null;
        const res = await fetch('/functions/v1/apply-router-config', {
          method: 'POST',
          headers: { 'content-type': 'application/json', Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({ routerId }),
        });
        if (!res.ok) {
          const txt = await res.text();
          addLog(`Apply function returned error: ${txt}`, 'error');
          setApplyDone(true);
          // Unsubscribe channel
          try { supabase.removeChannel(realtimeChannelRef.current); } catch {};
          realtimeChannelRef.current = null;
        } else {
          addLog('Apply started — streaming logs will appear below', 'info');
          // Do not set applyDone here — wait for realtime status update
        }
      } catch (err: any) {
        addLog(`Error starting apply: ${err?.message || String(err)}`, 'error');
        setApplyDone(true);
      }
    } catch (err: any) {
      addLog(`Error: ${err.message || "Configuration failed"}`, "error");
      setApplyDone(true);
    }
  }

  async function reInvokeApply() {
    if (!routerId) return;
    setApplyDone(false);
    setLogLines([]);
    // subscribe and call apply function similar to handleApply's final step
    try {
      if (realtimeChannelRef.current) {
        try { supabase.removeChannel(realtimeChannelRef.current); } catch {}
        realtimeChannelRef.current = null;
      }
      const channel = supabase.channel(`provision-${routerId}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'provision_logs', filter: `router_id=eq.${routerId}` }, (payload) => {
          const row = (payload as any).new;
          if (!row) return;
          const level = row.success ? 'success' : 'error';
          const icon = level === 'success' ? '✓' : '✕';
          const ts = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
          setLogLines((prev) => [...prev, { ts, level: level as any, icon, message: row.message || row.stage || 'log' }]);
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'routers', filter: `id=eq.${routerId}` }, (payload) => {
          const row = (payload as any).new;
          if (!row) return;
          if (row.status === 'active') {
            setLogLines((prev) => [...prev, { ts: new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }), level: 'success', icon: '✓', message: 'Router marked active' }]);
            setApplyDone(true);
          }
          if (row.status === 'failed') {
            setLogLines((prev) => [...prev, { ts: new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }), level: 'error', icon: '✕', message: 'Router provisioning failed' }]);
            setApplyDone(true);
          }
        })
        .subscribe();

      realtimeChannelRef.current = channel;

      addLog('Invoking apply-router-config (retry)...', 'info');
      const { data } = await supabase.auth.getSession();
      const accessToken = data?.session?.access_token ?? data?.access_token ?? null;
      const res = await fetch('/functions/v1/apply-router-config', {
        method: 'POST',
        headers: { 'content-type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ routerId }),
      });
      if (!res.ok) {
        const txt = await res.text();
        addLog(`Apply function returned error: ${txt}`, 'error');
        setApplyDone(true);
        try { supabase.removeChannel(realtimeChannelRef.current); } catch {};
        realtimeChannelRef.current = null;
      } else {
        addLog('Apply started — streaming logs will appear below', 'info');
      }
    } catch (err: any) {
      addLog(`Retry start failed: ${err?.message || String(err)}`, 'error');
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
        ...(editIp && { connection_string: editIp.trim() }),
        ...(editApiUsername && { api_username: editApiUsername.trim() }),
        ...(editApiPassword && { api_password: editApiPassword.trim() }),
        api_port: 8728,
      } as any).eq("id", editingRouter.id);

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

  async function handleSyncRouter(id: string) {
    setSyncing((prev) => new Set([...prev, id]));
    try {
      const { data: row, error } = await supabase
        .from("routers")
        .select("status, last_seen, provisioning_slug, name")
        .eq("id", id)
        .single();

      if (error) throw error;

      if (row?.status === "online" && row.last_seen) {
        const minutesAgo = Math.floor((Date.now() - new Date(row.last_seen).getTime()) / 60000);
        const timeLabel = minutesAgo < 1 ? "just now" : minutesAgo === 1 ? "1 minute ago" : `${minutesAgo} minutes ago`;
        toast.success(`${row.name} is online — last seen ${timeLabel}`);
      } else if (row?.status === "online" && !row.last_seen) {
        // Marked online but no heartbeat timestamp — treat as stale
        await supabase.from("routers").update({ status: "offline" }).eq("id", id);
        toast.error(`${row.name} has not sent a heartbeat — marked offline. Run the provisioning script again.`);
      } else {
        // Offline — give actionable guidance
        toast.error(`${row.name} is offline. Open Winbox and run the provisioning script to bring it online.`);
      }

      queryClient.invalidateQueries({ queryKey: ["routers", tenantId] });
    } catch {
      toast.error("Sync failed — please try again.");
    } finally {
      setSyncing((prev) => {
        const s = new Set(prev);
        s.delete(id);
        return s;
      });
    }
  }

  function handleReprovisionRouter(router: any) {
    setRouterId(router.id);
    setIdentity(router.provisioning_identity || router.name || "");
    setPppoe(router.services?.includes("pppoe") ?? false);
    setHotspot(router.services?.includes("hotspot") ?? false);
    setBridgePort((router.bridge_port || "ether2") as "ether1" | "ether2");
    setCustomSubnet(router.subnet && router.subnet !== "172.31.0.0/16");
    setSubnetValue(router.subnet || "172.31.0.0/16");
    setReprovisioning(null);

    if (router.status === "online") {
      // Router already online — skip the wait screen, go straight to services
      setRouterOnline(true);
      setVpnAddress(router.ip_address ?? null);
      setStep(3);
    } else {
      // Router offline — show provisioning script and wait for it to come online
      setRouterOnline(false);
      setStep(2);
    }
    setView("wizard");
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
                          setEditIp(r.connection_string || "");
                          setEditApiUsername(r.api_username || "");
                          setEditApiPassword("");
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
                  <div className="border-t border-border pt-4">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">API Credentials</p>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-sm font-semibold mb-2">Router IP / Hostname</label>
                        <input
                          type="text"
                          value={editIp}
                          onChange={(e) => setEditIp(e.target.value)}
                          className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                          placeholder="e.g., 192.168.88.1"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-sm font-semibold mb-2">Username</label>
                          <input
                            type="text"
                            value={editApiUsername}
                            onChange={(e) => setEditApiUsername(e.target.value)}
                            className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                            placeholder="admin"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-semibold mb-2">Password</label>
                          <input
                            type="password"
                            value={editApiPassword}
                            onChange={(e) => setEditApiPassword(e.target.value)}
                            className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                            placeholder="leave blank to keep current"
                          />
                        </div>
                      </div>
                    </div>
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
            <div
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
              onClick={(e) => { if (e.target === e.currentTarget) setViewingRouter(null); }}
            >
              <div className="bg-card w-full sm:max-w-2xl sm:rounded-2xl rounded-t-2xl border border-border flex flex-col max-h-[92dvh] sm:max-h-[88vh] overflow-hidden">
                {/* Header */}
                <div className="flex items-start justify-between px-5 py-4 border-b border-border shrink-0">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-2.5 h-2.5 rounded-full shrink-0 mt-0.5 ${
                      viewingRouter.status === "online" ? "bg-success" : "bg-destructive"
                    }`} />
                    <div className="min-w-0">
                      <h2 className="text-base font-bold leading-tight truncate">{viewingRouter.name}</h2>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {viewingRouter.model || "RouterOS"}
                        <span className={`ml-2 font-medium ${
                          viewingRouter.status === "online" ? "text-success" : "text-destructive"
                        }`}>
                          {viewingRouter.status === "online" ? "Online" : "Offline"}
                        </span>
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setViewingRouter(null)}
                    className="shrink-0 ml-3 w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Tabs */}
                <div className="flex gap-1 px-5 py-2.5 border-b border-border shrink-0 bg-muted/30">
                  {(["details", "scripts", "diagnostics"] as const).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setViewTab(tab)}
                      className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors capitalize ${
                        viewTab === tab
                          ? "bg-card text-foreground shadow-sm border border-border"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {tab}
                    </button>
                  ))}
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto px-5 py-4">
                  {viewTab === "details" && (
                    <div className="space-y-2">
                      {([
                        { label: "Name", value: viewingRouter.name },
                        { label: "Model", value: viewingRouter.model || "—" },
                        { label: "Status", value: viewingRouter.status === "online" ? "Online" : "Offline", status: viewingRouter.status },
                        { label: "VPN Address", value: viewingRouter.ip_address || "—" },
                        { label: "Services", value: viewingRouter.services?.map((s: string) => s === "hotspot" ? "Hotspot" : "PPPoE").join(", ") || "—" },
                        { label: "Bridge Port", value: viewingRouter.bridge_port || "—" },
                        { label: "Subnet", value: viewingRouter.subnet || "—" },
                        { label: "Identity", value: viewingRouter.provisioning_identity || "—" },
                      ]).map((row) => (
                        <div key={row.label} className="flex items-center justify-between py-2.5 border-b border-border/60 last:border-0">
                          <span className="text-xs text-muted-foreground font-medium w-28 shrink-0">{row.label}</span>
                          {row.status ? (
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                              row.status === "online" ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"
                            }`}>{row.value}</span>
                          ) : (
                            <span className="font-mono text-sm text-foreground text-right break-all">{row.value}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {viewTab === "scripts" && (
                    <div className="space-y-5">
                      {/* Provisioning Script */}
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Provisioning Script</p>
                        <div className="rounded-xl border border-border overflow-hidden">
                          <div className="flex items-center justify-between px-3 py-2 bg-muted/50 border-b border-border">
                            <span className="text-xs text-muted-foreground font-mono">RouterOS Terminal</span>
                            <button
                              onClick={() => {
                                const script = `/tool fetch mode=https url="${window.location.origin}/provision/${viewingRouter.provisioning_slug}" dst-path=${viewingRouter.provisioning_slug}.rsc;:delay 2s;/import ${viewingRouter.provisioning_slug}.rsc;`;
                                navigator.clipboard.writeText(script);
                                toast.success("Script copied");
                              }}
                              className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 font-medium transition-colors"
                            >
                              <Copy className="w-3 h-3" /> Copy
                            </button>
                          </div>
                          <div className="p-3 bg-background">
                            <pre className="text-xs font-mono text-foreground whitespace-pre-wrap break-all leading-relaxed">
{`/tool fetch mode=https url="${window.location.origin}/provision/${viewingRouter.provisioning_slug}" dst-path=${viewingRouter.provisioning_slug}.rsc;:delay 2s;/import ${viewingRouter.provisioning_slug}.rsc;`}
                            </pre>
                          </div>
                        </div>
                      </div>

                      {/* Fallback RADIUS */}
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Fallback RADIUS (Public)</p>
                        {serverIp ? (
                          <div className="flex items-center gap-2 rounded-lg bg-success/5 border border-success/20 px-3 py-2 mb-2">
                            <span className="text-xs text-success font-medium">✓ Server IP:</span>
                            <code className="text-xs font-mono text-success">{serverIp}</code>
                          </div>
                        ) : (
                          <div className="flex items-start gap-2 rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 px-3 py-2 mb-2">
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                            <p className="text-xs text-amber-800 dark:text-amber-300">
                              Set <code className="bg-amber-900/10 px-1 rounded">VITE_SERVER_IP</code> in Vercel env vars to auto-populate.
                            </p>
                          </div>
                        )}
                        <div className="rounded-xl border border-border overflow-hidden">
                          <div className="flex items-center justify-between px-3 py-2 bg-muted/50 border-b border-border">
                            <span className="text-xs text-muted-foreground font-mono">RouterOS Terminal</span>
                            <button
                              onClick={() => {
                                const ip = serverIp || "142.93.39.55";
                                navigator.clipboard.writeText(`/radius remove [find address=${ip}];
/radius add service=ppp,hotspot address=${ip} secret=SmartLinkNet-Public-Fallback realm=10.9.37.1 authentication-port=1812 accounting-port=1813 timeout=3000ms;`);
                                toast.success("RADIUS command copied");
                              }}
                              className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 font-medium transition-colors"
                            >
                              <Copy className="w-3 h-3" /> Copy
                            </button>
                          </div>
                          <div className="p-3 bg-background">
                            <pre className="text-xs font-mono text-foreground whitespace-pre-wrap break-all leading-relaxed">
{`/radius remove [find address=${serverIp || "142.93.39.55"}];
/radius add service=ppp,hotspot address=${serverIp || "142.93.39.55"} secret=SmartLinkNet-Public-Fallback realm=10.9.37.1 authentication-port=1812 accounting-port=1813 timeout=3000ms;`}
                            </pre>
                          </div>
                        </div>
                      </div>

                      {/* Enable API Port */}
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Enable API Port</p>
                        <div className="rounded-xl border border-border overflow-hidden">
                          <div className="flex items-center justify-between px-3 py-2 bg-muted/50 border-b border-border">
                            <span className="text-xs text-muted-foreground font-mono">RouterOS Terminal</span>
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText("/ip service set api port=8728 disabled=no");
                                toast.success("Command copied");
                              }}
                              className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 font-medium transition-colors"
                            >
                              <Copy className="w-3 h-3" /> Copy
                            </button>
                          </div>
                          <div className="p-3 bg-background">
                            <pre className="text-xs font-mono text-foreground">/ip service set api port=8728 disabled=no</pre>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {viewTab === "diagnostics" && (
                    <div className="space-y-4">
                      <div className="rounded-xl border border-border overflow-hidden">
                        {([
                          { label: "Connection Status", ok: viewingRouter.status === "online", okText: "Online", failText: "Offline" },
                          { label: "VPN Integration", ok: !!viewingRouter.ip_address, okText: "Connected", failText: "Pending" },
                          { label: "Services Configured", ok: !!viewingRouter.services?.length, okText: `${viewingRouter.services?.length} active`, failText: "None" },
                          { label: "Bridge Configured", ok: !!viewingRouter.bridge_port, okText: viewingRouter.bridge_port, failText: "Not set" },
                          { label: "Hotspot Portal", ok: viewingRouter.services?.includes("hotspot") && !!viewingRouter.provisioning_slug, okText: "Login page auto-configured", failText: viewingRouter.services?.includes("hotspot") ? "Re-provision to fix" : "N/A (no hotspot)" },
                        ]).map((check, i, arr) => (
                          <div key={check.label} className={`flex items-center justify-between px-4 py-3 ${
                            i < arr.length - 1 ? "border-b border-border" : ""
                          }`}>
                            <span className="text-sm text-foreground">{check.label}</span>
                            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                              check.ok
                                ? "bg-success/10 text-success"
                                : i === 1 ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                                : "bg-destructive/10 text-destructive"
                            }`}>
                              {check.ok ? `✓ ${check.okText}` : `⚠ ${check.failText}`}
                            </span>
                          </div>
                        ))}
                      </div>

                      {/* Recommendations */}
                      {(() => {
                        const tips: string[] = [];
                        if (viewingRouter.status === "offline") tips.push("Router is offline — check network connection");
                        if (!viewingRouter.ip_address) tips.push("Not reporting VPN address — check provisioning script output");
                        if (!viewingRouter.services?.length) tips.push("No services configured — run provisioning wizard");
                        if (!viewingRouter.bridge_port) tips.push("Bridge port not set — complete provisioning wizard");
                        return tips.length > 0 ? (
                          <div className="rounded-xl border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 p-4">
                            <p className="text-xs font-semibold text-amber-900 dark:text-amber-200 mb-2">Recommendations</p>
                            <ul className="space-y-1.5">
                              {tips.map((t) => (
                                <li key={t} className="text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2">
                                  <span className="mt-0.5 shrink-0">•</span>{t}
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : (
                          <div className="rounded-xl border border-success/20 bg-success/5 p-4">
                            <p className="text-xs font-semibold text-success">✓ All systems operational — ready for subscribers</p>
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div className="shrink-0 border-t border-border px-5 py-3 flex items-center justify-between gap-3">
                  <button
                    onClick={() => setViewingRouter(null)}
                    className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors px-2 py-1.5"
                  >
                    Close
                  </button>
                  <button
                    onClick={() => {
                      handleReprovisionRouter(viewingRouter);
                      setViewingRouter(null);
                    }}
                    className="flex items-center gap-2 rounded-full bg-primary text-primary-foreground px-5 py-2 text-sm font-semibold hover:bg-primary/90 transition-colors"
                  >
                    <RotateCw className="w-3.5 h-3.5" />
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

        {/* ── Step 1: Router identity + credentials ── */}
        {step === 1 && (
          <div className="rounded-2xl border border-border bg-card p-4 sm:p-6 space-y-5">
            <div>
              <h2 className="font-bold text-base mb-1">Router identity</h2>
              <p className="text-xs text-muted-foreground mb-4">
                Match the identity shown in Winbox under System → Identity.
              </p>
              <div className="flex gap-2">
                <input
                  value={identity}
                  onChange={(e) => setIdentity(e.target.value)}
                  className="flex-1 rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                  placeholder="e.g. MikroTik1"
                />
                <button
                  onClick={() => { setIdentity(`MikroTik${routers.length + 1}`); toast.success("Reset to default"); }}
                  className="px-4 py-3 rounded-xl border border-border bg-muted hover:bg-muted/80 text-sm font-medium transition-colors whitespace-nowrap"
                >
                  Auto-fill
                </button>
              </div>
            </div>


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
                {/* If live interfaces are available, render them, otherwise fall back to ether1/ether2 */}
                {interfacesQuery.isSuccess && interfacesQuery.data?.interfaces?.length ? (
                  interfacesQuery.data.interfaces.map((it: any) => (
                    <div key={it.name} className="flex items-center gap-3">
                      <div className="flex items-start gap-3 w-full">
                        {/* Uplink radio */}
                        <label className="flex items-center gap-3 cursor-pointer w-full">
                          <input
                            type="radio"
                            name="uplink"
                            className="accent-primary w-4 h-4"
                            checked={uplinkInterface === it.name}
                            onChange={() => setUplinkInterface(it.name)}
                          />
                          <div className="flex-1">
                            <div className="flex items-center justify-between">
                              <div className="font-semibold">{it.name}</div>
                              <div className="text-xs text-muted-foreground">{it.link ? 'up' : 'down'}</div>
                            </div>
                            <div className="text-xs text-muted-foreground">Rx: {Number(it.rx).toLocaleString()} • Tx: {Number(it.tx).toLocaleString()}</div>
                          </div>
                        </label>
                        {/* Bridge checkbox */}
                        <label className="flex items-center gap-2 ml-4">
                          <input
                            type="checkbox"
                            checked={bridgePorts.includes(it.name)}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              setBridgePorts((prev) => {
                                if (checked) return Array.from(new Set([...prev, it.name]));
                                return prev.filter((p) => p !== it.name);
                              });
                            }}
                            className="accent-primary w-4 h-4"
                          />
                          <span className="text-xs text-muted-foreground">Join bridge</span>
                        </label>
                      </div>
                    </div>
                  ))
                ) : (
                  <>
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
                  </>
                )}
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
                    <p className="text-sm text-success font-medium">✓ Device provisioning complete</p>
                    <p className="text-xs text-success/70 mt-1">You can now add subscribers and manage services on this router.</p>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        <BrandFooter />
      </div>

      {/* ── Provision Token Modal ── */}
      {showTokenModal && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={(e) => { if (e.target === e.currentTarget) { setShowTokenModal(false); setStep(2); } }}
        >
          <div className="bg-card rounded-2xl border border-border p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold">Provision Token</h3>
              <button
                onClick={() => { setShowTokenModal(false); setStep(2); }}
                className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              Copy this token and keep it safe. It will be used by the router during provisioning.
            </p>
            <div className="relative rounded-xl border border-border bg-background px-4 py-3 mb-3 font-mono text-sm break-all">
              {provisionToken ?? "—"}
              <button
                onClick={() => {
                  if (provisionToken) {
                    navigator.clipboard.writeText(provisionToken);
                    toast.success("Token copied");
                  }
                }}
                className="absolute top-2 right-2 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground border border-border rounded-lg px-2 py-1 bg-background transition-colors"
              >
                <Copy className="w-3 h-3" /> Copy
              </button>
            </div>
            <p className="text-xs text-amber-600 dark:text-amber-400 font-medium mb-5">⚠ This code won't be shown again.</p>
            <button
              onClick={() => { setShowTokenModal(false); setStep(2); }}
              className="w-full rounded-full bg-primary hover:bg-primary/90 text-primary-foreground py-2.5 text-sm font-semibold transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}

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

              {/* If apply finished with errors, show Retry */}
              {applyDone && logLines.some(l => l.level === 'error') ? (
                <div className="flex gap-2">
                  <button
                    onClick={() => reInvokeApply()}
                    className="rounded-full bg-yellow-500 hover:bg-yellow-600 text-white px-4 sm:px-5 py-2.5 text-sm font-semibold transition-colors"
                  >
                    Retry from this step
                  </button>
                  <button
                    onClick={() => { setView("landing"); setStep(1); setLogLines([]); setApplyDone(false); setIdentity(""); setRouterId(null); }}
                    className="rounded-full bg-success hover:bg-success/90 text-success-foreground px-5 sm:px-6 py-2.5 text-sm font-semibold transition-colors disabled:opacity-50"
                  >
                    Close
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => { setView("landing"); setStep(1); setLogLines([]); setApplyDone(false); setIdentity(""); setRouterId(null); }}
                  disabled={!applyDone}
                  className="rounded-full bg-success hover:bg-success/90 text-success-foreground px-5 sm:px-6 py-2.5 text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {applyDone ? "✓ Done" : "Configuring..."}
                </button>
              )}
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
                  if (error) { toast.error(error.message); return; }
                  const newRouterId = data.id;
                  setRouterId(newRouterId);
                  setRouterOnline(false);
                  setLogLines([]);
                  setApplyDone(false);
                  // Call create-provision-token edge function
                  try {
                    const { data: sessionData } = await supabase.auth.getSession();
                    const accessToken = sessionData?.session?.access_token;
                    if (!accessToken) throw new Error("Not authenticated");
                    const res = await fetch("/functions/v1/create-provision-token", {
                      method: "POST",
                      headers: { "content-type": "application/json", Authorization: `Bearer ${accessToken}` },
                      body: JSON.stringify({ routerId: newRouterId }),
                    });
                    if (!res.ok) {
                      const txt = await res.text();
                      throw new Error(txt || `Token request failed (${res.status})`);
                    }
                    const json = await res.json();
                    setProvisionToken(json.token ?? json.provision_token ?? null);
                  } catch (err: any) {
                    toast.error(`Could not generate provision token: ${err.message}`);
                    setProvisionToken(null);
                  }
                  setShowTokenModal(true);
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



