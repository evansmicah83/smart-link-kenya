/**
 * SmartLinkNet — Network Adapters UI
 * Phase 1: Adapter Management Panel
 *
 * Allows operators to configure, test, and monitor router adapters.
 * All identifiers are UUID-based — no hardcoded IPs in component state.
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { adapterFactory } from "@/lib/network";
import type { AdapterType, NetworkFeature } from "@/lib/network";
import {
  ADAPTER_TYPE_LABELS,
  NETWORK_FEATURE_LABELS,
} from "@/lib/network";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Wifi, WifiOff, Activity, RefreshCw, Plus, CheckCircle,
  AlertTriangle, Cpu, HardDrive, Clock, Network, Zap,
} from "lucide-react";

const HEALTH_COLORS = {
  healthy:   "bg-green-500/15 text-green-600 border-green-500/30",
  degraded:  "bg-yellow-500/15 text-yellow-600 border-yellow-500/30",
  unhealthy: "bg-red-500/15 text-red-600 border-red-500/30",
  unknown:   "bg-muted text-muted-foreground border-border",
};

const ALL_FEATURES: NetworkFeature[] = [
  "hotspot", "pppoe", "dhcp", "ipv4", "ipv6",
  "cgnat", "multi_wan", "vlan", "qos", "radius_auth", "user_manager",
];

function useTenantId() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["tenant-id", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("tenant_id").eq("id", user!.id).single();
      return (data?.tenant_id as string) ?? null;
    },
    enabled: !!user,
  });
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function NetworkAdaptersPanel() {
  const qc = useQueryClient();
  const tenantQuery = useTenantId();
  const tenantId = tenantQuery.data ?? null;
  const [addOpen, setAddOpen] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [featureErrors, setFeatureErrors] = useState<string[]>([]);
  const isMountedRef = useRef(true);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  function getTableErrorMessage(error: any, table: string) {
    return error?.status === 404
      ? `The ${table} table is not available in this Supabase project.`
      : error?.message ?? `Unable to load ${table}.`;
  }

  function handleTableError(error: any, table: string) {
    if (!isMountedRef.current) return;
    const message = getTableErrorMessage(error, table);
    setFeatureErrors((prev) => (prev.includes(message) ? prev : [...prev, message]));
  }

  function clearTableError(table: string) {
    if (!isMountedRef.current) return;
    setFeatureErrors((prev) => prev.filter((msg) => !msg.includes(` ${table} table`) && !msg.includes(`load ${table}`)));
  }

  const routers = useQuery({
    queryKey: ["routers-adapters", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("routers")
        .select("id,name,vendor,status,primary_adapter_type,cpu_load,memory_used,uptime,last_seen,is_active")
        .eq("tenant_id", tenantId!)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!tenantId,
    refetchInterval: 30000,
  });

  const networkFeatureProbe = useQuery({
    queryKey: ["network-feature-schema", tenantId],
    queryFn: async () => {
      const { error } = await (supabase as any)
        .from("network_adapters")
        .select("id")
        .limit(1);
      if (error) throw error;
      return true;
    },
    enabled: !!tenantId,
    retry: false,
    onError: (error) => handleTableError(error, "network_adapters"),
  });

  const hasNetworkFeatureSchema = networkFeatureProbe.data === true && featureErrors.length === 0;

  const adapters = useQuery({
    queryKey: ["network-adapters", tenantId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("network_adapters")
        .select("*, routers(name,status,vendor)")
        .eq("tenant_id", tenantId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as AdapterRow[];
    },
    enabled: hasNetworkFeatureSchema,
    retry: false,
    onError: (error) => handleTableError(error, "network_adapters"),
  });

  const wanLinksProbe = useQuery({
    queryKey: ["network-feature-schema", tenantId, "wan_links"],
    queryFn: async () => {
      const { error } = await (supabase as any)
        .from("wan_links")
        .select("id")
        .limit(1);
      if (error) throw error;
      return true;
    },
    enabled: !!tenantId && featureErrors.length === 0,
    retry: false,
    onError: (error) => handleTableError(error, "wan_links"),
  });

  const ipPoolsProbe = useQuery({
    queryKey: ["network-feature-schema", tenantId, "ip_pools"],
    queryFn: async () => {
      const { error } = await (supabase as any)
        .from("ip_pools")
        .select("id")
        .limit(1);
      if (error) throw error;
      return true;
    },
    enabled: !!tenantId && featureErrors.length === 0,
    retry: false,
    onError: (error) => handleTableError(error, "ip_pools"),
  });

  const hasWanLinksSchema = wanLinksProbe.data === true && featureErrors.length === 0;
  const hasIpPoolsSchema = ipPoolsProbe.data === true && featureErrors.length === 0;

  const wanLinks = useQuery({
    queryKey: ["wan-links", tenantId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("wan_links")
        .select("*, routers(name)")
        .eq("tenant_id", tenantId!)
        .order("priority");
      if (error) throw error;
      return (data ?? []) as WanLinkRow[];
    },
    enabled: !!tenantId && hasWanLinksSchema,
    retry: false,
    onError: (error) => handleTableError(error, "wan_links"),
  });

  const ipPools = useQuery({
    queryKey: ["ip-pools", tenantId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("ip_pools")
        .select("*")
        .eq("tenant_id", tenantId!)
        .order("name");
      if (error) throw error;
      return (data ?? []) as IpPoolRow[];
    },
    enabled: !!tenantId && hasIpPoolsSchema,
    retry: false,
    onError: (error) => handleTableError(error, "ip_pools"),
  });

  async function testAdapter(routerId: string) {
    setTestingId(routerId);
    try {
      const adapter = await adapterFactory.getRouterAdapter(routerId);
      const health = await adapter.healthCheck();
      if (health.isHealthy) {
        toast.success(`Adapter healthy — ${health.latencyMs}ms`);
      } else {
        toast.error(`Adapter unhealthy: ${health.lastError}`);
      }
      qc.invalidateQueries({ queryKey: ["network-adapters"] });
    } catch (e: any) {
      toast.error("Test failed: " + e.message);
    } finally {
      if (isMountedRef.current) {
        setTestingId(null);
      }
    }
  }

  const online   = routers.data?.filter((r) => r.status === "online").length ?? 0;
  const offline  = routers.data?.filter((r) => r.status === "offline").length ?? 0;
  const healthy  = adapters.data?.filter((a) => a.health_status === "healthy").length ?? 0;
  const unhealthy = adapters.data?.filter((a) => a.health_status === "unhealthy").length ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Network Adapters</h2>
          <p className="text-sm text-muted-foreground">Vendor-agnostic adapter registry — Phase 1</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => qc.invalidateQueries({ queryKey: ["network-adapters", "routers-adapters"] })}>
            <RefreshCw className="h-4 w-4 mr-2" />Refresh
          </Button>
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />Add Adapter
          </Button>
        </div>
      </div>

      {featureErrors.length > 0 ? (
        <div className="rounded-xl border border-amber-300/70 bg-amber-100 p-4 text-sm text-amber-900">
          <div className="font-medium">Network feature unavailable</div>
          <ul className="mt-2 list-disc pl-5 space-y-1 text-left text-sm text-amber-900">
            {featureErrors.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-amber-700">Run the latest database migrations or enable the Phase 1 network schema to restore adapter and link queries.</p>
        </div>
      ) : null}

      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { icon: Wifi,       label: "Online Routers",   value: online,    color: "text-green-500" },
          { icon: WifiOff,    label: "Offline Routers",  value: offline,   color: "text-red-500" },
          { icon: CheckCircle,label: "Healthy Adapters", value: healthy,   color: "text-green-500" },
          { icon: AlertTriangle, label: "Unhealthy",     value: unhealthy, color: "text-red-500" },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-border/60 bg-card p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs text-muted-foreground uppercase">{s.label}</div>
              <s.icon className={`h-4 w-4 ${s.color}`} />
            </div>
            <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Router Adapter Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {routers.isLoading ? (
          <div className="col-span-3 text-center py-12 text-muted-foreground">Loading...</div>
        ) : routers.data?.map((r) => {
          const adapter = adapters.data?.find((a) => a.router_id === r.id && a.is_primary);
          const adapterType: AdapterType = (r.primary_adapter_type as AdapterType) ?? "mikrotik_rest";
          return (
            <div key={r.id} className={`rounded-xl border bg-card p-5 space-y-3 ${
              r.status === "online"   ? "border-green-500/30"
              : r.status === "offline" ? "border-red-500/30"
              : "border-border/60"
            }`}>
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-semibold">{r.name}</div>
                  <div className="text-xs text-muted-foreground capitalize">{r.vendor}</div>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className={`h-2 w-2 rounded-full ${
                    r.status === "online" ? "bg-green-500 animate-pulse"
                    : r.status === "degraded" ? "bg-yellow-500"
                    : "bg-red-500"
                  }`} />
                  <span className="text-xs font-medium capitalize">{r.status}</span>
                </div>
              </div>

              {/* Adapter type badge */}
              <div className="flex flex-wrap gap-1">
                <span className="rounded-full bg-primary/15 text-primary px-2 py-0.5 text-[10px] font-medium">
                  {ADAPTER_TYPE_LABELS[adapterType]}
                </span>
                {adapter?.supported_features?.slice(0, 3).map((f: string) => (
                  <span key={f} className="rounded-full bg-muted text-muted-foreground px-2 py-0.5 text-[10px]">
                    {NETWORK_FEATURE_LABELS[f as NetworkFeature] ?? f}
                  </span>
                ))}
              </div>

              {/* Metrics */}
              {r.status === "online" && (
                <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1"><Cpu className="h-3 w-3" />{r.cpu_load ?? 0}%</div>
                  <div className="flex items-center gap-1"><HardDrive className="h-3 w-3" />{r.memory_used ?? 0}%</div>
                  <div className="flex items-center gap-1"><Clock className="h-3 w-3" />{r.uptime?.split("d")[0] ?? "—"}d</div>
                </div>
              )}

              {/* Adapter health */}
              {adapter && (
                <div className={`rounded-md border px-2 py-1 text-xs flex items-center justify-between ${HEALTH_COLORS[adapter.health_status as keyof typeof HEALTH_COLORS] ?? HEALTH_COLORS.unknown}`}>
                  <span>Adapter: {adapter.health_status}</span>
                  {adapter.last_checked && (
                    <span className="opacity-70">{new Date(adapter.last_checked).toLocaleTimeString()}</span>
                  )}
                </div>
              )}

              <div className="pt-2 border-t border-border/60 flex gap-2">
                <button
                  onClick={() => testAdapter(r.id)}
                  disabled={testingId === r.id}
                  className="text-xs flex items-center gap-1 text-muted-foreground hover:text-primary"
                >
                  <Activity className={`h-3 w-3 ${testingId === r.id ? "animate-spin" : ""}`} />
                  {testingId === r.id ? "Testing..." : "Test"}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* WAN Links */}
      {(wanLinks.data?.length ?? 0) > 0 && (
        <div className="rounded-xl border border-border/60 bg-card p-5">
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <Network className="h-4 w-4 text-primary" /> WAN Links
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Router</th>
                  <th className="px-3 py-2 text-left">Link</th>
                  <th className="px-3 py-2 text-left">Interface</th>
                  <th className="px-3 py-2 text-left">Priority</th>
                  <th className="px-3 py-2 text-left">Latency</th>
                  <th className="px-3 py-2 text-left">Loss</th>
                  <th className="px-3 py-2 text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {wanLinks.data?.map((w) => (
                  <tr key={w.id} className="border-t border-border/60">
                    <td className="px-3 py-2 text-xs">{w.routers?.name ?? "—"}</td>
                    <td className="px-3 py-2 font-medium">{w.name}</td>
                    <td className="px-3 py-2 font-mono text-xs">{w.interface_name}</td>
                    <td className="px-3 py-2 text-xs">{w.priority}</td>
                    <td className="px-3 py-2 text-xs">{w.latency_ms != null ? `${w.latency_ms}ms` : "—"}</td>
                    <td className="px-3 py-2 text-xs">{w.packet_loss != null ? `${w.packet_loss}%` : "—"}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs ${w.is_active ? "bg-green-500/15 text-green-600" : "bg-red-500/15 text-red-600"}`}>
                        {w.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* IP Pools */}
      {(ipPools.data?.length ?? 0) > 0 && (
        <div className="rounded-xl border border-border/60 bg-card p-5">
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" /> IP Pools
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Name</th>
                  <th className="px-3 py-2 text-left">Protocol</th>
                  <th className="px-3 py-2 text-left">CIDR</th>
                  <th className="px-3 py-2 text-left">Type</th>
                  <th className="px-3 py-2 text-left">Utilization</th>
                </tr>
              </thead>
              <tbody>
                {ipPools.data?.map((p) => (
                  <tr key={p.id} className="border-t border-border/60">
                    <td className="px-3 py-2 font-medium">{p.name}</td>
                    <td className="px-3 py-2 uppercase text-xs">{p.protocol}</td>
                    <td className="px-3 py-2 font-mono text-xs">{p.cidr}</td>
                    <td className="px-3 py-2">
                      {p.is_cgnat && <span className="rounded-full bg-orange-500/15 text-orange-600 px-2 py-0.5 text-xs">CGNAT</span>}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-20 rounded-full bg-muted overflow-hidden">
                          <div
                            className={`h-full rounded-full ${Number(p.utilization) > 80 ? "bg-red-500" : Number(p.utilization) > 60 ? "bg-yellow-500" : "bg-green-500"}`}
                            style={{ width: `${Math.min(100, Number(p.utilization))}%` }}
                          />
                        </div>
                        <span className="text-xs">{p.utilization}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <AddAdapterDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        tenantId={tenantId ?? ""}
        onSuccess={() => { qc.invalidateQueries({ queryKey: ["network-adapters"] }); setAddOpen(false); }}
      />
    </div>
  );
}

// ─── Add Adapter Dialog ───────────────────────────────────────────────────────

function AddAdapterDialog({
  open, onOpenChange, tenantId, onSuccess,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  tenantId: string;
  onSuccess: () => void;
}) {
  const [routerId, setRouterId] = useState("");
  const [adapterType, setAdapterType] = useState<AdapterType>("mikrotik_rest");
  const [features, setFeatures] = useState<NetworkFeature[]>(ALL_FEATURES);
  const [saving, setSaving] = useState(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    if (!open) return;
    setRouterId("");
    setAdapterType("mikrotik_rest");
    setFeatures(ALL_FEATURES);
  }, [open]);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const routers = useQuery({
    queryKey: ["routers-list-adapters", tenantId],
    queryFn: async () => {
      const { data } = await supabase.from("routers").select("id,name").eq("tenant_id", tenantId).order("name");
      return data ?? [];
    },
    enabled: !!tenantId && open,
  });

  function toggleFeature(f: NetworkFeature) {
    setFeatures((prev) =>
      prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f]
    );
  }

  async function handleSave() {
    if (!routerId) { toast.error("Select a router"); return; }
    setSaving(true);
    let saved = false;
    try {
      const { error } = await (supabase as any).from("network_adapters").upsert({
        tenant_id: tenantId,
        router_id: routerId,
        adapter_type: adapterType,
        supported_features: features,
        is_primary: true,
        health_status: "unknown",
        config: {},
      }, { onConflict: ["router_id", "adapter_type"] });
      if (error) throw error;

      // Also update router's primary_adapter_type
      const { error: routerError } = await supabase.from("routers").update({ primary_adapter_type: adapterType } as any).eq("id", routerId);
      if (routerError) throw routerError;

      // Run an initial health check immediately and persist the result.
      try {
        const adapter = await adapterFactory.getRouterAdapter(routerId);
        const health = await adapter.healthCheck();
        const healthStatus = health.isHealthy ? "healthy" : "unhealthy";
        await (supabase as any)
          .from("network_adapters")
          .update({
            health_status: healthStatus,
            last_checked: health.checkedAt ?? new Date().toISOString(),
            error_count: health.errorCount ?? 0,
            last_error: health.lastError,
          } as any)
          .eq("router_id", routerId)
          .eq("adapter_type", adapterType);
      } catch (healthError: any) {
        // Preserve adapter creation even if health probe fails.
        console.warn("Adapter health check failed", healthError);
      }

      toast.success("Adapter configured");
      saved = true;
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      if (isMountedRef.current) {
        setSaving(false);
      }
      if (saved) {
        qc.invalidateQueries({ queryKey: ["network-adapters", tenantId] });
        qc.invalidateQueries({ queryKey: ["routers-adapters", tenantId] });
        onSuccess();
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Configure Network Adapter</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Router</Label>
            <Select onValueChange={setRouterId}>
              <SelectTrigger><SelectValue placeholder="Select router" /></SelectTrigger>
              <SelectContent>
                {routers.data?.map((r) => (
                  <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Adapter Type</Label>
            <Select value={adapterType} onValueChange={(v) => setAdapterType(v as AdapterType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.entries(ADAPTER_TYPE_LABELS) as [AdapterType, string][]).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="mb-2 block">Supported Features</Label>
            <div className="flex flex-wrap gap-2">
              {ALL_FEATURES.map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => toggleFeature(f)}
                  className={`rounded-full px-2.5 py-1 text-xs border transition ${
                    features.includes(f)
                      ? "bg-primary/15 border-primary/30 text-primary"
                      : "bg-muted border-border text-muted-foreground hover:border-primary/30"
                  }`}
                >
                  {NETWORK_FEATURE_LABELS[f]}
                </button>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Save Adapter"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface AdapterRow {
  id: string;
  router_id: string;
  adapter_type: string;
  health_status: string;
  supported_features: string[];
  last_checked: string | null;
  error_count: number;
  is_primary: boolean;
  routers?: { name: string; status: string; vendor: string };
}

interface WanLinkRow {
  id: string;
  name: string;
  interface_name: string;
  priority: number;
  is_active: boolean;
  latency_ms: number | null;
  packet_loss: number | null;
  bandwidth_mbps: number | null;
  routers?: { name: string };
}

interface IpPoolRow {
  id: string;
  name: string;
  protocol: string;
  cidr: string;
  gateway: string;
  is_cgnat: boolean;
  utilization: number | string;
}
