import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useAuth, useTenantId } from "@/lib/auth";
import { toast } from "sonner";
import {
  getRules, saveRule, deleteRule, toggleRule, getRuleLogs,
  TRIGGER_LABELS, ACTION_LABELS,
  type AutomationRule, type RuleTrigger, type RuleAction,
} from "@/lib/automation";
import { Plus, Zap, Play, Trash2, Clock, CheckCircle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/automation/")({
  component: AutomationPage,
});

const BLANK_RULE = (tenantId: string): AutomationRule => ({
  tenant_id: tenantId,
  name: "",
  trigger: "subscription_expired",
  conditions: {},
  action: "suspend_service",
  action_params: {},
  is_active: true,
});

function AutomationPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: tenantId } = useTenantId();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<AutomationRule | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [form, setForm] = useState<AutomationRule>(BLANK_RULE(""));

  const rules = useQuery({
    queryKey: ["automation-rules", tenantId],
    queryFn: () => getRules(tenantId!),
    enabled: !!tenantId,
  });

  const logs = useQuery({
    queryKey: ["automation-logs", tenantId],
    queryFn: () => getRuleLogs(tenantId!),
    enabled: !!tenantId,
  });

  const save = useMutation({
    mutationFn: (rule: AutomationRule) => saveRule(rule),
    onSuccess: () => {
      toast.success(editing ? "Rule updated" : "Rule created");
      qc.invalidateQueries({ queryKey: ["automation-rules"] });
      setOpen(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteRule(id),
    onSuccess: () => { toast.success("Rule deleted"); qc.invalidateQueries({ queryKey: ["automation-rules"] }); setDeleteTarget(null); },
    onError: (e: any) => toast.error(e.message),
  });

  const toggle = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => toggleRule(id, active),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["automation-rules"] }),
    onError: (e: any) => toast.error(e.message),
  });

  function openNew() {
    setEditing(null);
    setForm(BLANK_RULE(tenantId ?? ""));
    setOpen(true);
  }

  function openEdit(rule: AutomationRule) {
    setEditing(rule);
    setForm({ ...rule });
    setOpen(true);
  }

  const stats = {
    total: rules.data?.length ?? 0,
    active: rules.data?.filter((r) => r.is_active).length ?? 0,
    logsToday: (logs.data ?? []).filter((l) => l.created_at >= new Date(Date.now() - 86400000).toISOString()).length,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Automation Rules</h1>
          <p className="text-sm text-muted-foreground">Configure IF/THEN business automation workflows</p>
        </div>
        <Button onClick={openNew}><Plus className="h-4 w-4 mr-2" />New Rule</Button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <StatCard icon={Zap} label="Total Rules" value={stats.total} />
        <StatCard icon={Play} label="Active" value={stats.active} color="text-green-500" />
        <StatCard icon={Clock} label="Runs Today" value={stats.logsToday} color="text-blue-500" />
      </div>

      <Tabs defaultValue="rules">
        <TabsList>
          <TabsTrigger value="rules">Rules ({stats.total})</TabsTrigger>
          <TabsTrigger value="logs">Execution Logs ({logs.data?.length ?? 0})</TabsTrigger>
        </TabsList>

        <TabsContent value="rules">
          {rules.isLoading ? (
            <div className="text-center py-12 text-muted-foreground">Loading...</div>
          ) : rules.data?.length === 0 ? (
            <div className="rounded-xl border border-border/60 bg-card p-12 text-center">
              <Zap className="h-10 w-10 mx-auto mb-3 opacity-20" />
              <p className="font-medium">No automation rules yet</p>
              <p className="text-xs text-muted-foreground mt-1">Create rules to automate billing, notifications, and service management.</p>
              <Button className="mt-4" onClick={openNew}><Plus className="h-4 w-4 mr-2" />Create First Rule</Button>
            </div>
          ) : (
            <div className="space-y-3">
              {rules.data?.map((rule) => (
                <div key={rule.id} className={`rounded-xl border bg-card p-4 flex items-center gap-4 ${rule.is_active ? "border-border/60" : "border-border/30 opacity-60"}`}>
                  <div className={`h-2 w-2 rounded-full shrink-0 ${rule.is_active ? "bg-green-500 animate-pulse" : "bg-muted-foreground"}`} />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium">{rule.name}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      <span className="bg-primary/10 text-primary rounded px-1.5 py-0.5 mr-1">{TRIGGER_LABELS[rule.trigger]}</span>
                      → <span className="bg-secondary/60 rounded px-1.5 py-0.5 ml-1">{ACTION_LABELS[rule.action]}</span>
                    </div>
                    {rule.last_run && <div className="text-[10px] text-muted-foreground mt-1">Last run: {new Date(rule.last_run).toLocaleString()} · {rule.run_count ?? 0} total runs</div>}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <Switch checked={rule.is_active} onCheckedChange={(v) => toggle.mutate({ id: rule.id!, active: v })} />
                    <button onClick={() => openEdit(rule)} className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded border border-border/60 hover:bg-accent">Edit</button>
                    <button onClick={() => setDeleteTarget(rule.id!)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="logs">
          <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-left">Rule</th>
                  <th className="px-4 py-3 text-left">Result</th>
                  <th className="px-4 py-3 text-left">Message</th>
                  <th className="px-4 py-3 text-left">When</th>
                </tr>
              </thead>
              <tbody>
                {logs.isLoading ? (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">Loading...</td></tr>
                ) : logs.data?.length === 0 ? (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">No executions yet</td></tr>
                ) : logs.data?.map((l: any) => (
                  <tr key={l.id} className="border-t border-border/60">
                    <td className="px-4 py-3 text-sm font-medium">{l.rule_name ?? l.rule_id}</td>
                    <td className="px-4 py-3">
                      {l.success
                        ? <span className="flex items-center gap-1 text-green-600 text-xs"><CheckCircle className="h-3 w-3" />Success</span>
                        : <span className="flex items-center gap-1 text-red-600 text-xs"><XCircle className="h-3 w-3" />Failed</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{l.message ?? "—"}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(l.created_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editing ? "Edit Rule" : "New Automation Rule"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Rule Name *</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Suspend on expiry" />
            </div>
            <div>
              <Label>Trigger (IF)</Label>
              <Select value={form.trigger} onValueChange={(v) => setForm((f) => ({ ...f, trigger: v as RuleTrigger }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(TRIGGER_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {form.trigger === "customer_inactive_days" && (
              <div>
                <Label>Inactive Days Threshold</Label>
                <Input type="number" value={(form.conditions as any).days ?? 30}
                  onChange={(e) => setForm((f) => ({ ...f, conditions: { ...f.conditions, days: Number(e.target.value) } }))} />
              </div>
            )}
            <div>
              <Label>Action (THEN)</Label>
              <Select value={form.action} onValueChange={(v) => setForm((f) => ({ ...f, action: v as RuleAction }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(ACTION_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {(form.action === "send_sms" || form.action === "send_email") && (
              <div>
                <Label>Message Template</Label>
                <Input value={(form.action_params as any).message ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, action_params: { ...f.action_params, message: e.target.value } }))}
                  placeholder="Dear {customer_name}, your service has been updated." />
              </div>
            )}
            <div className="flex items-center gap-3">
              <Switch checked={form.is_active} onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v }))} />
              <Label>Active</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => save.mutate(form)} disabled={!form.name || save.isPending}>
              {save.isPending ? "Saving..." : "Save Rule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Delete Rule</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Are you sure you want to delete this automation rule? This cannot be undone.</p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => remove.mutate(deleteTarget!)} disabled={remove.isPending}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color }: { icon: React.ComponentType<{ className?: string }>; label: string; value: number; color?: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs text-muted-foreground uppercase">{label}</div>
        <Icon className={`h-4 w-4 ${color ?? "text-muted-foreground"}`} />
      </div>
      <div className={`text-2xl font-bold ${color ?? ""}`}>{value}</div>
    </div>
  );
}
