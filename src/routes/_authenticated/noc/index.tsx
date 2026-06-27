import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useTenantId } from "@/lib/auth";
import { toast } from "sonner";
import { Activity, Wifi, WifiOff, RefreshCw, Cpu, HardDrive, Clock, Users, Zap, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { syncRouterStatus, getActiveSessions, kickSession } from "@/lib/mikrotik";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/noc/")({
  component: NocPage,
});

function NocPage() {
  const qc = useQueryClient();
  const tenantQuery = useTenantId();
  const tenantId = tenantQuery.data;
  const [selectedRouter, setSelectedRouter] = useState<any>(null);
  const [syncing, setSyncing] = useState<string | null>(null);

  const routers = useQuery({
    queryKey: ["noc-routers", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase.from("routers").select("*").eq("tenant_id", tenantId!).order("name");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!tenantId,
    refetchInterval: 30000,
  });

  const sessions = useQuery({
    queryKey: ["noc-sessions", tenantId],
    queryFn: async () => {
      const { data } = await supabase.from("sessions").select("*, customers(full_name)").eq("tenant_id", tenantId!).is("ended_at", null).order("started_at", { ascending: false }).limit(50);
      return data ?? [];
    },
    enabled: !!tenantId,
    refetchInterval: 15000,
  });

  const routerSessions = useQuery({
    queryKey: ["router-live-sessions", selectedRouter?.id],
    queryFn: async () => {
      const data = await getActiveSessions(selectedRouter.id);
      return (data as any)?.data ?? [];
    },
    enabled: !!selectedRouter?.id && selectedRouter?.status === "online",
    refetchInterval: 10000,
  });

  async function syncRouter(routerId: string) {
    setSyncing(routerId);
    try {
      await syncRouterStatus(routerId);
      qc.invalidateQueries({ queryKey: ["noc-routers"] });
      toast.success("Router synced");
    } catch (e: any) {
      toast.error("Sync failed: " + e.message);
    } finally {
      setSyncing(null);
    }
  }

  async function syncAll() {
    const active = routers.data?.filter((r) => r.is_active) ?? [];
    for (const r of active) await syncRouter(r.id);
  }

  const kickSessionMut = useMutation({
    mutationFn: async ({ routerId, sessionId }: { routerId: string; sessionId: string }) => kickSession(routerId, sessionId),
    onSuccess: () => { toast.success("Session terminated"); qc.invalidateQueries({ queryKey: ["router-live-sessions"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const online = routers.data?.filter((r) => r.status === "online") ?? [];
  const offline = routers.data?.filter((r) => r.status === "offline") ?? [];
  const degraded = routers.data?.filter((r) => r.status === "degraded") ?? [];

  function fmtBytes(bytes: number) {
    if (!bytes) return "0B";
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Network Operations Center</h1>
          <p className="text-sm text-muted-foreground">Real-time monitoring of all network devices</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => qc.invalidateQueries({ queryKey: ["noc-routers"] })}><RefreshCw className="h-4 w-4 mr-2" />Refresh</Button>
          <Button variant="outline" onClick={syncAll} disabled={!!syncing}>{syncing ? "Syncing..." : "Sync All Routers"}</Button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 lg:grid-cols-5 gap-4">
        <div className="rounded-xl border border-green-500/30 bg-green-500/10 p-4">
          <div className="flex items-center gap-2 mb-1"><Wifi className="h-4 w-4 text-green-500" /><div className="text-xs text-muted-foreground uppercase">Online</div></div>
          <div className="text-3xl font-bold text-green-500">{online.length}</div>
        </div>
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4">
          <div className="flex items-center gap-2 mb-1"><WifiOff className="h-4 w-4 text-red-500" /><div className="text-xs text-muted-foreground uppercase">Offline</div></div>
          <div className="text-3xl font-bold text-red-500">{offline.length}</div>
        </div>
        <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-4">
          <div className="flex items-center gap-2 mb-1"><Activity className="h-4 w-4 text-yellow-500" /><div className="text-xs text-muted-foreground uppercase">Degraded</div></div>
          <div className="text-3xl font-bold text-yellow-500">{degraded.length}</div>
        </div>
        <div className="rounded-xl border border-border/60 bg-card p-4">
          <div className="flex items-center gap-2 mb-1"><Users className="h-4 w-4 text-blue-500" /><div className="text-xs text-muted-foreground uppercase">Sessions</div></div>
          <div className="text-3xl font-bold text-blue-500">{sessions.data?.length ?? 0}</div>
        </div>
        <div className="rounded-xl border border-border/60 bg-card p-4">
          <div className="flex items-center gap-2 mb-1"><Zap className="h-4 w-4 text-primary" /><div className="text-xs text-muted-foreground uppercase">Total</div></div>
          <div className="text-3xl font-bold">{routers.data?.length ?? 0}</div>
        </div>
      </div>

      {/* Outage alert */}
      {offline.length > 0 && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4">
          <div className="font-medium text-red-600 mb-2">⚠ {offline.length} Router{offline.length > 1 ? "s" : ""} Offline</div>
          <div className="flex flex-wrap gap-2">
            {offline.map((r) => <span key={r.id} className="rounded-full bg-red-500/20 text-red-600 px-3 py-1 text-xs font-medium">{r.name} {r.location ? `(${r.location})` : ""}</span>)}
          </div>
        </div>
      )}

      {/* Router cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {routers.isLoading ? (
          <div className="col-span-3 text-center py-12 text-muted-foreground">Loading...</div>
        ) : routers.data?.length === 0 ? (
          <div className="col-span-3 text-center py-12 text-muted-foreground">No routers configured</div>
        ) : routers.data?.map((r) => (
          <div
            key={r.id}
            className={`rounded-xl border bg-card p-5 cursor-pointer hover:shadow-md transition ${r.status === "online" ? "border-green-500/30" : r.status === "degraded" ? "border-yellow-500/30" : "border-red-500/30"}`}
            onClick={() => setSelectedRouter(r)}
          >
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="font-semibold">{r.name}</div>
                <div className="text-xs text-muted-foreground">{r.model ?? r.vendor} · {r.location ?? "No location"}</div>
              </div>
              <div className="flex items-center gap-1.5">
                <span className={`h-2 w-2 rounded-full ${r.status === "online" ? "bg-green-500 animate-pulse" : r.status === "degraded" ? "bg-yellow-500" : "bg-red-500"}`} />
                <span className={`text-xs font-medium ${r.status === "online" ? "text-green-600" : r.status === "degraded" ? "text-yellow-600" : "text-red-600"}`}>{r.status}</span>
              </div>
            </div>

            {r.status === "online" ? (
              <div className="space-y-2">
                <ProgressBar label="CPU" value={r.cpu_load ?? 0} color={r.cpu_load > 80 ? "bg-red-500" : r.cpu_load > 60 ? "bg-yellow-500" : "bg-green-500"} icon={<Cpu className="h-3 w-3" />} />
                <ProgressBar label="Memory" value={r.memory_used ?? 0} color="bg-blue-500" icon={<HardDrive className="h-3 w-3" />} />
                <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
                  <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{r.uptime ?? "N/A"}</span>
                  {r.last_seen && <span>Seen: {new Date(r.last_seen).toLocaleTimeString()}</span>}
                </div>
              </div>
            ) : (
              <div className="text-xs text-muted-foreground mt-2">
                {r.last_seen ? `Last seen: ${new Date(r.last_seen).toLocaleString()}` : "Never connected"}
              </div>
            )}

            <div className="mt-3 pt-2 border-t border-border/60 flex gap-2" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={() => syncRouter(r.id)}
                disabled={syncing === r.id}
                className="text-xs flex items-center gap-1 text-muted-foreground hover:text-foreground"
              >
                <RefreshCw className={`h-3 w-3 ${syncing === r.id ? "animate-spin" : ""}`} />
                {syncing === r.id ? "Syncing..." : "Sync"}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Live sessions table */}
      <div className="rounded-xl border border-border/60 bg-card p-5">
        <h2 className="font-semibold mb-4">Active Sessions ({sessions.data?.length ?? 0})</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left">User</th>
                <th className="px-4 py-2 text-left">IP</th>
                <th className="px-4 py-2 text-left">MAC</th>
                <th className="px-4 py-2 text-left">Started</th>
                <th className="px-4 py-2 text-left">Data In</th>
                <th className="px-4 py-2 text-left">Data Out</th>
              </tr>
            </thead>
            <tbody>
              {sessions.data?.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No active sessions</td></tr>
              ) : sessions.data?.map((s) => (
                <tr key={s.id} className="border-t border-border/60">
                  <td className="px-4 py-2">{(s as any).customers?.full_name ?? s.username ?? "Guest"}</td>
                  <td className="px-4 py-2 text-xs font-mono text-muted-foreground">{s.ip_address ?? "—"}</td>
                  <td className="px-4 py-2 text-xs font-mono text-muted-foreground">{s.mac_address ?? "—"}</td>
                  <td className="px-4 py-2 text-xs">{new Date(s.started_at).toLocaleTimeString()}</td>
                  <td className="px-4 py-2 text-xs">{fmtBytes(s.bytes_in ?? 0)}</td>
                  <td className="px-4 py-2 text-xs">{fmtBytes(s.bytes_out ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Router Detail Dialog */}
      <Dialog open={!!selectedRouter} onOpenChange={(o) => !o && setSelectedRouter(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedRouter?.name}
              <span className={`h-2 w-2 rounded-full ${selectedRouter?.status === "online" ? "bg-green-500" : "bg-red-500"}`} />
            </DialogTitle>
          </DialogHeader>
          {selectedRouter && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                {[
                  ["Connection", selectedRouter.connection_string ?? selectedRouter.ip_address],
                  ["Model", selectedRouter.model ?? selectedRouter.vendor],
                  ["Uptime", selectedRouter.uptime],
                  ["Firmware", selectedRouter.firmware_version],
                  ["CPU Load", selectedRouter.cpu_load != null ? `${selectedRouter.cpu_load}%` : null],
                  ["Memory Used", selectedRouter.memory_used != null ? `${selectedRouter.memory_used}%` : null],
                  ["Location", selectedRouter.location],
                  ["Last Seen", selectedRouter.last_seen ? new Date(selectedRouter.last_seen).toLocaleString() : null],
                ].map(([label, val]) => val ? (
                  <div key={label} className="rounded-md bg-muted/30 p-2">
                    <div className="text-xs text-muted-foreground">{label}</div>
                    <div className="font-medium mt-0.5 text-sm">{val}</div>
                  </div>
                ) : null)}
              </div>

              {selectedRouter.status === "online" && (
                <div>
                  <h3 className="font-medium text-sm mb-2">Live Sessions from Router</h3>
                  {routerSessions.isLoading ? (
                    <div className="text-xs text-muted-foreground">Fetching sessions...</div>
                  ) : routerSessions.data?.length === 0 ? (
                    <div className="text-xs text-muted-foreground">No active sessions on router</div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead className="bg-muted/40">
                          <tr>
                            <th className="px-3 py-2 text-left">User</th>
                            <th className="px-3 py-2 text-left">IP</th>
                            <th className="px-3 py-2 text-left">MAC</th>
                            <th className="px-3 py-2 text-left">Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(routerSessions.data as any[])?.map((s: any, i: number) => (
                            <tr key={i} className="border-t border-border/60">
                              <td className="px-3 py-1.5">{s.user ?? s.name ?? "—"}</td>
                              <td className="px-3 py-1.5 font-mono">{s.address ?? s["caller-id"] ?? "—"}</td>
                              <td className="px-3 py-1.5 font-mono">{s["mac-address"] ?? "—"}</td>
                              <td className="px-3 py-1.5">
                                <button
                                  onClick={() => kickSessionMut.mutate({ routerId: selectedRouter.id, sessionId: s[".id"] })}
                                  className="text-red-500 hover:text-red-700 text-xs"
                                >
                                  Kick
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ProgressBar({ label, value, color, icon }: { label: string; value: number; color: string; icon: React.ReactNode }) {
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="flex items-center gap-1 text-muted-foreground">{icon}{label}</span>
        <span className={value > 80 ? "text-red-500 font-medium" : ""}>{value}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}
