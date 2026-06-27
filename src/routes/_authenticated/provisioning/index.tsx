import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import {
  workflowEngine, eventStore, auditTrail, recoveryService,
  WORKFLOW_TYPE_LABELS, WORKFLOW_STATUS_COLORS, STEP_STATUS_COLORS, STEP_TYPE_ICONS,
} from "@/lib/provisioning3";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  RefreshCw, Activity, CheckCircle, XCircle, Clock,
  RotateCcw, ChevronRight, AlertTriangle, Layers,
  FileText, Zap, ShieldCheck,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/provisioning/")({
  component: ProvisioningPage,
});

function useTenantId() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["profile", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data } = await supabase.from("profiles").select("tenant_id").eq("id", user.id).single();
      return (data?.tenant_id ?? null) as string | null;
    },
    enabled: !!user,
  });
}

function StatCard({ icon: Icon, label, value, color }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string; value: number | string; color?: string;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-card p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
        <Icon className={`h-4 w-4 ${color ?? "text-muted-foreground"}`} />
      </div>
      <div className={`text-2xl font-bold ${color ?? ""}`}>{value}</div>
    </div>
  );
}

function StatusBadge({ status, map }: { status: string; map: Record<string, string> }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${map[status] ?? "bg-muted text-muted-foreground"}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

function ProgressBar({ pct }: { pct: number }) {
  return (
    <div className="w-full bg-muted rounded-full h-1.5">
      <div
        className="bg-primary rounded-full h-1.5 transition-all"
        style={{ width: `${Math.min(pct, 100)}%` }}
      />
    </div>
  );
}

// ── Workflow Detail Dialog ────────────────────────────────────────────────────

function WorkflowDetail({ workflowId, tenantId, onClose }: {
  workflowId: string; tenantId: string; onClose: () => void;
}) {
  const steps = useQuery({
    queryKey: ["wf-steps", workflowId],
    queryFn: () => workflowEngine.getSteps(workflowId),
  });
  const events = useQuery({
    queryKey: ["wf-events", workflowId],
    queryFn: () => eventStore.getForWorkflow(workflowId),
  });
  const auditEntries = useQuery({
    queryKey: ["wf-audit", workflowId],
    queryFn: () => auditTrail.getForWorkflow(workflowId),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Workflow Detail</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="steps">
          <TabsList>
            <TabsTrigger value="steps">Steps ({steps.data?.length ?? 0})</TabsTrigger>
            <TabsTrigger value="events">Event Store ({events.data?.length ?? 0})</TabsTrigger>
            <TabsTrigger value="audit">Audit Trail ({auditEntries.data?.length ?? 0})</TabsTrigger>
          </TabsList>

          <TabsContent value="steps" className="space-y-2 mt-4">
            {steps.data?.map((s) => (
              <div key={s.id} className="rounded-lg border border-border/60 bg-card p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-base">{STEP_TYPE_ICONS[s.stepType] ?? "⚙️"}</span>
                    <span className="text-sm font-medium">{s.stepName.replace(/_/g, " ")}</span>
                    {s.canCompensate && (
                      <span className="text-[10px] bg-blue-500/10 text-blue-600 px-1.5 py-0.5 rounded">compensable</span>
                    )}
                    {s.compensated && (
                      <span className="text-[10px] bg-purple-500/10 text-purple-600 px-1.5 py-0.5 rounded">rolled back</span>
                    )}
                  </div>
                  <StatusBadge status={s.status} map={STEP_STATUS_COLORS} />
                </div>
                {s.error && (
                  <div className="mt-2 text-xs text-red-500 bg-red-500/10 rounded p-2">{s.error}</div>
                )}
                {s.stepDurationSec !== null && s.status === "completed" && (
                  <div className="mt-1 text-xs text-muted-foreground">{s.stepDurationSec}s</div>
                )}
              </div>
            ))}
          </TabsContent>

          <TabsContent value="events" className="mt-4">
            <div className="space-y-1">
              {events.data?.map((ev) => (
                <div key={ev.id} className="flex items-start gap-3 py-2 border-b border-border/40 last:border-0">
                  <div className="text-xs font-mono text-muted-foreground w-6 text-right shrink-0">#{ev.sequenceNo}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium">{ev.eventType.replace(/_/g, " ")}</span>
                      {ev.stepName && <span className="text-xs text-muted-foreground">→ {ev.stepName}</span>}
                    </div>
                    <div className="text-xs text-muted-foreground">{new Date(ev.occurredAt).toLocaleString()}</div>
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="audit" className="mt-4">
            <div className="space-y-2">
              {auditEntries.data?.map((a) => (
                <div key={a.id} className="rounded-lg border border-border/60 bg-card p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{a.action.replace(/_/g, " ")}</span>
                    <span className="text-xs text-muted-foreground">{new Date(a.occurredAt).toLocaleString()}</span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {a.entityType} · {a.actor}
                  </div>
                  {a.diff && Object.keys(a.diff).length > 0 && (
                    <pre className="mt-2 text-xs bg-muted/50 rounded p-2 overflow-x-auto">
                      {JSON.stringify(a.diff, null, 2)}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

function ProvisioningPage() {
  const qc = useQueryClient();
  const { data: tenantId } = useTenantId();
  const [tab, setTab] = useState("workflows");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [auditSearch, setAuditSearch] = useState("");
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);

  const stats = useQuery({
    queryKey: ["prov-stats", tenantId],
    queryFn: () => workflowEngine.getStats(tenantId!),
    enabled: !!tenantId,
    refetchInterval: 15000,
  });

  const workflows = useQuery({
    queryKey: ["workflows", tenantId, statusFilter, typeFilter],
    queryFn: () => workflowEngine.list(tenantId!, {
      status: statusFilter !== "all" ? statusFilter as any : undefined,
      type:   typeFilter !== "all" ? typeFilter : undefined,
      limit:  100,
    }),
    enabled: !!tenantId,
    refetchInterval: 10000,
  });

  const auditEntries = useQuery({
    queryKey: ["audit-trail", tenantId, auditSearch],
    queryFn: () => auditTrail.getRecent(tenantId!, {
      action: auditSearch || undefined,
      limit:  100,
    }),
    enabled: !!tenantId && tab === "audit",
  });

  const stuckWorkflows = useQuery({
    queryKey: ["stuck-workflows", tenantId],
    queryFn: () => recoveryService.getStuckWorkflows(tenantId!),
    enabled: !!tenantId && tab === "recovery",
    refetchInterval: 30000,
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["workflows", tenantId] });
    qc.invalidateQueries({ queryKey: ["prov-stats", tenantId] });
  };

  const retryWf = useMutation({
    mutationFn: (id: string) => workflowEngine.retry(id),
    onSuccess: () => { toast.success("Workflow queued for retry"); refresh(); },
    onError: (e: any) => toast.error(e.message),
  });

  const recoverAll = useMutation({
    mutationFn: () => recoveryService.recoverStaleWorkflows(),
    onSuccess: (n) => { toast.success(`Recovered ${n} stale workflow(s)`); refresh(); qc.invalidateQueries({ queryKey: ["stuck-workflows"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const forceReset = useMutation({
    mutationFn: (id: string) => recoveryService.forceReset(id, tenantId!),
    onSuccess: () => { toast.success("Workflow reset and re-queued"); qc.invalidateQueries({ queryKey: ["stuck-workflows"] }); refresh(); },
    onError: (e: any) => toast.error(e.message),
  });

  const s = stats.data;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Provisioning Engine</h1>
          <p className="text-sm text-muted-foreground">Event-driven state machine workflows with saga rollback, event store, and audit trail.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={refresh}><RefreshCw className="h-4 w-4 mr-2" />Refresh</Button>
          <Button variant="outline" onClick={() => recoverAll.mutate()} disabled={recoverAll.isPending}>
            <ShieldCheck className="h-4 w-4 mr-2" />Run Recovery
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
        <StatCard icon={Layers}       label="Total (24h)"   value={s?.total ?? 0} />
        <StatCard icon={CheckCircle}  label="Completed"     value={s?.completed ?? 0}  color="text-green-500" />
        <StatCard icon={XCircle}      label="Failed"        value={s?.failed ?? 0}     color="text-red-500" />
        <StatCard icon={Clock}        label="Pending"       value={s?.pending ?? 0}    color="text-yellow-500" />
        <StatCard icon={Activity}     label="Running"       value={s?.running ?? 0}    color="text-blue-500" />
        <StatCard icon={Zap}          label="Success Rate"  value={`${s?.successRate ?? 100}%`} color="text-emerald-500" />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="workflows"><Layers className="h-4 w-4 mr-1.5" />Workflows</TabsTrigger>
          <TabsTrigger value="audit"><FileText className="h-4 w-4 mr-1.5" />Audit Trail</TabsTrigger>
          <TabsTrigger value="recovery"><AlertTriangle className="h-4 w-4 mr-1.5" />Recovery {(stuckWorkflows.data?.length ?? 0) > 0 && `(${stuckWorkflows.data?.length})`}</TabsTrigger>
        </TabsList>

        {/* Workflows Tab */}
        <TabsContent value="workflows" className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40"><SelectValue placeholder="All statuses" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="running">Running</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="rolled_back">Rolled Back</SelectItem>
                <SelectItem value="compensating">Compensating</SelectItem>
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-48"><SelectValue placeholder="All types" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {Object.entries(WORKFLOW_TYPE_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="overflow-hidden rounded-xl border border-border/60 bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-left">Type</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left hidden md:table-cell">Progress</th>
                  <th className="px-4 py-3 text-left hidden lg:table-cell">Retries</th>
                  <th className="px-4 py-3 text-left hidden lg:table-cell">Duration</th>
                  <th className="px-4 py-3 text-left">Created</th>
                  <th className="px-4 py-3 text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {workflows.isLoading ? (
                  <tr><td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">Loading…</td></tr>
                ) : workflows.data?.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">No workflows found</td></tr>
                ) : workflows.data?.map((wf) => (
                  <tr key={wf.id} className="border-t border-border/60 hover:bg-accent/30">
                    <td className="px-4 py-3">
                      <div className="font-medium text-sm">{WORKFLOW_TYPE_LABELS[wf.type] ?? wf.type}</div>
                      {wf.error && <div className="text-xs text-red-500 truncate max-w-[180px]">{wf.error}</div>}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={wf.status} map={WORKFLOW_STATUS_COLORS} />
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell w-32">
                      <div className="text-xs text-muted-foreground mb-1">{wf.completedSteps}/{wf.totalSteps} steps</div>
                      <ProgressBar pct={wf.progressPct} />
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground hidden lg:table-cell">
                      {wf.retryCount}/{wf.maxRetries}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground hidden lg:table-cell">
                      {wf.durationSeconds != null ? `${wf.durationSeconds}s` : "—"}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {new Date(wf.createdAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setSelectedWorkflowId(wf.id)}
                          className="text-xs text-primary hover:underline flex items-center gap-1"
                        >
                          <ChevronRight className="h-3 w-3" />Detail
                        </button>
                        {wf.status === "failed" && wf.retryCount < wf.maxRetries && (
                          <button
                            onClick={() => retryWf.mutate(wf.id)}
                            disabled={retryWf.isPending}
                            className="text-xs text-yellow-600 hover:underline flex items-center gap-1"
                          >
                            <RotateCcw className="h-3 w-3" />Retry
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        {/* Audit Trail Tab */}
        <TabsContent value="audit" className="space-y-4">
          <div className="flex gap-3">
            <Input
              placeholder="Filter by action…"
              value={auditSearch}
              onChange={(e) => setAuditSearch(e.target.value)}
              className="max-w-xs"
            />
          </div>
          <div className="overflow-hidden rounded-xl border border-border/60 bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-left">Action</th>
                  <th className="px-4 py-3 text-left">Entity</th>
                  <th className="px-4 py-3 text-left hidden md:table-cell">Workflow</th>
                  <th className="px-4 py-3 text-left hidden lg:table-cell">Actor</th>
                  <th className="px-4 py-3 text-left">Time</th>
                </tr>
              </thead>
              <tbody>
                {auditEntries.isLoading ? (
                  <tr><td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">Loading…</td></tr>
                ) : auditEntries.data?.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">No audit entries found</td></tr>
                ) : auditEntries.data?.map((a) => (
                  <tr key={a.id} className="border-t border-border/60 hover:bg-accent/30">
                    <td className="px-4 py-3 font-medium text-sm">{a.action.replace(/_/g, " ")}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{a.entityType}</td>
                    <td className="px-4 py-3 text-xs hidden md:table-cell">
                      {a.workflowType ? (
                        <span>{WORKFLOW_TYPE_LABELS[a.workflowType] ?? a.workflowType}</span>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground hidden lg:table-cell">{a.actor}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(a.occurredAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        {/* Recovery Tab */}
        <TabsContent value="recovery" className="space-y-4">
          <div className="rounded-xl border border-border/60 bg-card p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold">Stale Lock Recovery</h2>
                <p className="text-sm text-muted-foreground">Workflows stuck in "running" with an expired lock are automatically reset.</p>
              </div>
              <Button onClick={() => recoverAll.mutate()} disabled={recoverAll.isPending}>
                <ShieldCheck className="h-4 w-4 mr-2" />Recover All Stale
              </Button>
            </div>

            {stuckWorkflows.data?.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <CheckCircle className="h-8 w-8 mx-auto mb-2 text-green-500 opacity-60" />
                No stuck workflows detected
              </div>
            ) : (
              <div className="space-y-2">
                {stuckWorkflows.data?.map((wf) => (
                  <div key={wf.id} className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/30 p-3">
                    <div>
                      <div className="text-sm font-medium">{wf.type.replace(/_/g, " ")}</div>
                      <div className="text-xs text-muted-foreground">
                        Locked until: {new Date(wf.lockedUntil).toLocaleString()} · Worker: {wf.lockedBy}
                      </div>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => forceReset.mutate(wf.id)} disabled={forceReset.isPending}>
                      <RotateCcw className="h-3.5 w-3.5 mr-1.5" />Force Reset
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-border/60 bg-card p-5">
            <h2 className="text-lg font-semibold mb-2">Recovery Guidance</h2>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p><strong>Stale lock</strong> — worker crashed mid-execution. Lock TTL is 5 minutes; auto-recovery runs on every queue-worker cycle.</p>
              <p><strong>Force Reset</strong> — manually re-queues a stuck workflow. Increments retry count. Idempotent steps will resume from where they left off.</p>
              <p><strong>Max retries exceeded</strong> — workflow must be re-triggered from source (payment, subscription event) with a new idempotency key.</p>
              <p><strong>Rollback errors</strong> — compensation failures are logged but do not block workflow failure recording. Review manually.</p>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {selectedWorkflowId && tenantId && (
        <WorkflowDetail
          workflowId={selectedWorkflowId}
          tenantId={tenantId}
          onClose={() => setSelectedWorkflowId(null)}
        />
      )}
    </div>
  );
}
