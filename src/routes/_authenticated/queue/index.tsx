import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTenantId } from "@/lib/auth";
import {
  queueService, QUEUE_NAMES, QUEUE_LABELS,
  type QueueName, type JobStatus,
} from "@/lib/queue";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  RefreshCw, AlertTriangle, CheckCircle, Clock, XCircle,
  Activity, RotateCcw, Trash2, Play, Pause, Zap, Server,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/queue/")({
  component: QueueDashboard,
});

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  pending:   "bg-yellow-500/15 text-yellow-600",
  running:   "bg-blue-500/15 text-blue-600",
  completed: "bg-green-500/15 text-green-600",
  failed:    "bg-red-500/15 text-red-600",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_COLORS[status] ?? "bg-muted text-muted-foreground"}`}>
      {status}
    </span>
  );
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

// ── Main Dashboard ────────────────────────────────────────────────────────────

function QueueDashboard() {
  const qc = useQueryClient();
  const { data: tenantId } = useTenantId();
  const [tab, setTab] = useState("jobs");
  const [queueFilter, setQueueFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["queue-stats", tenantId] });
    qc.invalidateQueries({ queryKey: ["queue-jobs", tenantId] });
    qc.invalidateQueries({ queryKey: ["dlq-jobs", tenantId] });
    qc.invalidateQueries({ queryKey: ["scheduled-jobs", tenantId] });
  };

  // ── Queries ───────────────────────────────────────────────────────────────

  const stats = useQuery({
    queryKey: ["queue-stats", tenantId],
    queryFn:  () => queueService.getStats(tenantId!, 24),
    enabled:  !!tenantId,
    refetchInterval: 15_000,
  });

  const jobs = useQuery({
    queryKey: ["queue-jobs", tenantId, queueFilter, statusFilter],
    queryFn:  () => queueService.list(tenantId!, {
      queueName:  queueFilter !== "all" ? queueFilter as QueueName : undefined,
      status:     statusFilter !== "all" ? statusFilter as JobStatus : undefined,
      deadLetter: false,
      limit:      200,
    }),
    enabled:  !!tenantId,
    refetchInterval: 10_000,
  });

  const dlqJobs = useQuery({
    queryKey: ["dlq-jobs", tenantId],
    queryFn:  () => queueService.getDeadLetterJobs(tenantId!, { requeued: false }),
    enabled:  !!tenantId && tab === "dlq",
    refetchInterval: 30_000,
  });

  const scheduledJobs = useQuery({
    queryKey: ["scheduled-jobs", tenantId],
    queryFn:  () => queueService.listScheduledJobs(tenantId!),
    enabled:  !!tenantId && tab === "scheduled",
  });

  // ── Mutations ─────────────────────────────────────────────────────────────

  const retryJob = useMutation({
    mutationFn: (id: string) => queueService.retry(id),
    onSuccess: () => { toast.success("Job re-queued"); refresh(); },
    onError: (e: any) => toast.error(e.message),
  });

  const cancelJob = useMutation({
    mutationFn: (id: string) => queueService.cancel(id),
    onSuccess: () => { toast.success("Job cancelled"); refresh(); },
    onError: (e: any) => toast.error(e.message),
  });

  const requeueDlq = useMutation({
    mutationFn: (id: string) => queueService.requeueDeadLetter(id),
    onSuccess: () => { toast.success("Job re-queued from DLQ"); refresh(); },
    onError: (e: any) => toast.error(e.message),
  });

  const purgeDlq = useMutation({
    mutationFn: () => queueService.purgeDeadLetterJobs(tenantId!),
    onSuccess: () => { toast.success("Dead letter queue purged"); refresh(); },
    onError: (e: any) => toast.error(e.message),
  });

  const recoverJobs = useMutation({
    mutationFn: () => queueService.recoverStaleJobs(),
    onSuccess: (n) => { toast.success(`Recovered ${n} stale job(s)`); refresh(); },
    onError: (e: any) => toast.error(e.message),
  });

  const toggleScheduled = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      queueService.toggleScheduledJob(id, active),
    onSuccess: () => { toast.success("Scheduled job updated"); qc.invalidateQueries({ queryKey: ["scheduled-jobs"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  // ── Aggregated stats ──────────────────────────────────────────────────────

  const agg = (stats.data ?? []).reduce(
    (acc, s) => ({
      pending:   acc.pending   + s.pending,
      running:   acc.running   + s.running,
      completed: acc.completed + s.completed,
      failed:    acc.failed    + s.failed,
      dead:      acc.dead      + s.dead,
    }),
    { pending: 0, running: 0, completed: 0, failed: 0, dead: 0 }
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Queue Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Priority queues · Distributed workers · DLQ · Scheduled jobs
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={refresh}>
            <RefreshCw className="h-4 w-4 mr-2" />Refresh
          </Button>
          <Button variant="outline" onClick={() => recoverJobs.mutate()} disabled={recoverJobs.isPending}>
            <RotateCcw className="h-4 w-4 mr-2" />Recover Stale
          </Button>
        </div>
      </div>

      {/* Aggregate stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard icon={Clock}       label="Pending"   value={agg.pending}   color="text-yellow-500" />
        <StatCard icon={Activity}    label="Running"   value={agg.running}   color="text-blue-500" />
        <StatCard icon={CheckCircle} label="Completed" value={agg.completed} color="text-green-500" />
        <StatCard icon={XCircle}     label="Failed"    value={agg.failed}    color="text-red-500" />
        <StatCard icon={AlertTriangle} label="Dead Letter" value={agg.dead} color="text-orange-500" />
      </div>

      {/* Per-queue breakdown */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {(stats.data ?? []).map((s) => (
          <div key={s.queueName} className="rounded-xl border border-border/60 bg-card p-3">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
              {QUEUE_LABELS[s.queueName as QueueName] ?? s.queueName}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {s.pending > 0 && (
                <span className="text-xs bg-yellow-500/15 text-yellow-600 rounded px-1.5 py-0.5">{s.pending} pending</span>
              )}
              {s.running > 0 && (
                <span className="text-xs bg-blue-500/15 text-blue-600 rounded px-1.5 py-0.5">{s.running} running</span>
              )}
              {s.failed > 0 && (
                <span className="text-xs bg-red-500/15 text-red-600 rounded px-1.5 py-0.5">{s.failed} failed</span>
              )}
              {s.pending === 0 && s.running === 0 && s.failed === 0 && (
                <span className="text-xs text-muted-foreground">idle</span>
              )}
            </div>
            {s.avgDurationSec != null && (
              <div className="text-xs text-muted-foreground mt-1">avg {s.avgDurationSec}s</div>
            )}
          </div>
        ))}
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="jobs"><Server className="h-4 w-4 mr-1.5" />Jobs</TabsTrigger>
          <TabsTrigger value="dlq">
            <AlertTriangle className="h-4 w-4 mr-1.5" />
            Dead Letter {agg.dead > 0 && `(${agg.dead})`}
          </TabsTrigger>
          <TabsTrigger value="scheduled"><Clock className="h-4 w-4 mr-1.5" />Scheduled</TabsTrigger>
        </TabsList>

        {/* Jobs Tab */}
        <TabsContent value="jobs" className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <Select value={queueFilter} onValueChange={setQueueFilter}>
              <SelectTrigger className="w-44"><SelectValue placeholder="All queues" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Queues</SelectItem>
                {QUEUE_NAMES.map((q) => (
                  <SelectItem key={q} value={q}>{QUEUE_LABELS[q]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40"><SelectValue placeholder="All statuses" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="running">Running</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="overflow-x-auto rounded-xl border border-border/60 bg-card">
            <table className="w-full text-sm min-w-[700px]">
              <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-left">Type</th>
                  <th className="px-4 py-3 text-left">Queue</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left hidden md:table-cell">Priority</th>
                  <th className="px-4 py-3 text-left hidden lg:table-cell">Attempts</th>
                  <th className="px-4 py-3 text-left hidden lg:table-cell">Worker</th>
                  <th className="px-4 py-3 text-left">Created</th>
                  <th className="px-4 py-3 text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {jobs.isLoading ? (
                  <tr><td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">Loading…</td></tr>
                ) : jobs.data?.length === 0 ? (
                  <tr><td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">No jobs found</td></tr>
                ) : jobs.data?.map((job) => (
                  <tr key={job.id} className="border-t border-border/60 hover:bg-accent/30">
                    <td className="px-4 py-3">
                      <div className="font-medium text-sm">{job.type.replace(/_/g, " ")}</div>
                      {job.lastError && (
                        <div className="text-xs text-red-500 truncate max-w-[200px]">{job.lastError}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className="text-xs">
                        {QUEUE_LABELS[job.queueName] ?? job.queueName}
                      </Badge>
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={job.status} /></td>
                    <td className="px-4 py-3 text-xs text-muted-foreground hidden md:table-cell">
                      P{job.priority}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground hidden lg:table-cell">
                      {job.attempts}/{job.maxAttempts}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground hidden lg:table-cell font-mono">
                      {job.workerId ? job.workerId.slice(-8) : "—"}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {new Date(job.createdAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {(job.status === "failed" || job.status === "completed") && (
                          <button
                            onClick={() => retryJob.mutate(job.id)}
                            disabled={retryJob.isPending}
                            className="text-xs text-yellow-600 hover:underline flex items-center gap-1"
                          >
                            <RotateCcw className="h-3 w-3" />Retry
                          </button>
                        )}
                        {job.status === "pending" && (
                          <button
                            onClick={() => cancelJob.mutate(job.id)}
                            disabled={cancelJob.isPending}
                            className="text-xs text-red-500 hover:underline flex items-center gap-1"
                          >
                            <XCircle className="h-3 w-3" />Cancel
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

        {/* Dead Letter Queue Tab */}
        <TabsContent value="dlq" className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Dead Letter Queue</h2>
              <p className="text-sm text-muted-foreground">
                Jobs that exhausted all retry attempts. Inspect, requeue, or purge.
              </p>
            </div>
            {(dlqJobs.data?.length ?? 0) > 0 && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => purgeDlq.mutate()}
                disabled={purgeDlq.isPending}
              >
                <Trash2 className="h-4 w-4 mr-2" />Purge All
              </Button>
            )}
          </div>

          {dlqJobs.data?.length === 0 ? (
            <div className="rounded-xl border border-border/60 bg-card p-12 text-center text-muted-foreground">
              <CheckCircle className="h-8 w-8 mx-auto mb-2 text-green-500 opacity-60" />
              Dead letter queue is empty
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border/60 bg-card">
              <table className="w-full text-sm min-w-[600px]">
                <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 text-left">Job Type</th>
                    <th className="px-4 py-3 text-left">Queue</th>
                    <th className="px-4 py-3 text-left hidden md:table-cell">Attempts</th>
                    <th className="px-4 py-3 text-left">Last Error</th>
                    <th className="px-4 py-3 text-left hidden lg:table-cell">Archived</th>
                    <th className="px-4 py-3 text-left">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {dlqJobs.data?.map((job) => (
                    <tr key={job.id} className="border-t border-border/60 hover:bg-accent/30">
                      <td className="px-4 py-3 font-medium text-sm">{job.jobType.replace(/_/g, " ")}</td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className="text-xs">
                          {QUEUE_LABELS[job.queueName as QueueName] ?? job.queueName}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground hidden md:table-cell">
                        {job.attempts}
                      </td>
                      <td className="px-4 py-3 text-xs text-red-500 max-w-[240px] truncate">
                        {job.lastError ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground hidden lg:table-cell">
                        {new Date(job.archivedAt).toLocaleString()}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => requeueDlq.mutate(job.id)}
                          disabled={requeueDlq.isPending}
                          className="text-xs text-primary hover:underline flex items-center gap-1"
                        >
                          <RotateCcw className="h-3 w-3" />Requeue
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        {/* Scheduled Jobs Tab */}
        <TabsContent value="scheduled" className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold">Scheduled Jobs</h2>
            <p className="text-sm text-muted-foreground">
              Recurring jobs triggered by the queue-worker tick. Toggle or inspect each schedule.
            </p>
          </div>

          <div className="overflow-x-auto rounded-xl border border-border/60 bg-card">
            <table className="w-full text-sm min-w-[600px]">
              <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-left">Name</th>
                  <th className="px-4 py-3 text-left">Job Type</th>
                  <th className="px-4 py-3 text-left hidden md:table-cell">Queue</th>
                  <th className="px-4 py-3 text-left hidden md:table-cell">Cron</th>
                  <th className="px-4 py-3 text-left hidden lg:table-cell">Last Run</th>
                  <th className="px-4 py-3 text-left hidden lg:table-cell">Next Run</th>
                  <th className="px-4 py-3 text-left hidden lg:table-cell">Runs</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Toggle</th>
                </tr>
              </thead>
              <tbody>
                {scheduledJobs.isLoading ? (
                  <tr><td colSpan={9} className="px-4 py-12 text-center text-muted-foreground">Loading…</td></tr>
                ) : scheduledJobs.data?.length === 0 ? (
                  <tr><td colSpan={9} className="px-4 py-12 text-center text-muted-foreground">No scheduled jobs</td></tr>
                ) : scheduledJobs.data?.map((sj) => (
                  <tr key={sj.id} className="border-t border-border/60 hover:bg-accent/30">
                    <td className="px-4 py-3 font-medium text-sm">{sj.name.replace(/_/g, " ")}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{sj.jobType.replace(/_/g, " ")}</td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <Badge variant="outline" className="text-xs">
                        {QUEUE_LABELS[sj.queueName as QueueName] ?? sj.queueName}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-xs font-mono text-muted-foreground hidden md:table-cell">
                      {sj.cronExpr}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground hidden lg:table-cell">
                      {sj.lastRunAt ? new Date(sj.lastRunAt).toLocaleString() : "Never"}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground hidden lg:table-cell">
                      {sj.nextRunAt ? new Date(sj.nextRunAt).toLocaleString() : "—"}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground hidden lg:table-cell">
                      {sj.runCount.toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      {sj.isActive ? (
                        <span className="text-xs bg-green-500/15 text-green-600 rounded-full px-2 py-0.5">Active</span>
                      ) : (
                        <span className="text-xs bg-muted text-muted-foreground rounded-full px-2 py-0.5">Paused</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => toggleScheduled.mutate({ id: sj.id, active: !sj.isActive })}
                        disabled={toggleScheduled.isPending}
                        className="text-xs text-primary hover:underline flex items-center gap-1"
                      >
                        {sj.isActive
                          ? <><Pause className="h-3 w-3" />Pause</>
                          : <><Play className="h-3 w-3" />Resume</>
                        }
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="rounded-xl border border-border/60 bg-card p-5">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Zap className="h-4 w-4 text-yellow-500" />Scheduled Job Reference
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-muted-foreground">
              <div><code className="text-foreground">*/5 * * * *</code> — every 5 minutes</div>
              <div><code className="text-foreground">0 * * * *</code> — every hour</div>
              <div><code className="text-foreground">0 2 * * *</code> — daily at 02:00</div>
              <div><code className="text-foreground">0 3 * * *</code> — daily at 03:00</div>
              <div><code className="text-foreground">0 6 * * *</code> — daily at 06:00</div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
