import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Plus, Server, Wifi, ShieldCheck, RefreshCw, AlertTriangle, CheckCircle, Zap, Edit, Trash2, Search } from "lucide-react";
import { useAuth, useTenantId } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import {
  radiusMonitoring,
  radiusServerPool,
  nasManagement,
  radiusClientService,
  accountingService,
} from "@/lib/aaa2";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell, TableCaption } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/aaa/")({
  component: AaaPage,
});

const serverSchema = z.object({
  name: z.string().min(1),
  host: z.string().min(1),
  auth_port: z.coerce.number().min(1).default(1812),
  acct_port: z.coerce.number().min(1).default(1813),
  coa_port: z.coerce.number().min(1).default(3799),
  shared_secret: z.string().min(1),
  protocol: z.enum(["pap", "chap", "mschapv2", "eap-tls", "eap-ttls", "peap"]).default("mschapv2"),
  role: z.enum(["primary", "secondary", "tertiary", "backup"]).default("primary"),
  is_active: z.boolean().default(true),
  timeout_ms: z.coerce.number().min(100).default(3000),
  retry_count: z.coerce.number().min(1).default(3),
  priority: z.coerce.number().min(1).default(1),
  failover_strategy: z.enum(["priority", "round_robin", "least_latency", "random"]).default("priority"),
});

const nasSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  vendor: z.enum(["mikrotik", "cisco", "ubiquiti", "freeradius", "juniper", "huawei", "generic"]).default("mikrotik"),
  nas_identifier: z.string().optional(),
  nas_ip: z.string().optional(),
  shared_secret: z.string().min(1),
  auth_port: z.coerce.number().min(1).default(1812),
  acct_port: z.coerce.number().min(1).default(1813),
  coa_port: z.coerce.number().min(1).default(3799),
  is_active: z.boolean().default(true),
  dynamic_vlan_enabled: z.boolean().default(false),
  dynamic_profile_enabled: z.boolean().default(true),
  dynamic_ip_enabled: z.boolean().default(false),
  radius_server_id: z.string().optional().nullable(),
});

const clientSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  clientIp: z.string().min(1),
  sharedSecret: z.string().min(1),
  vendor: z.enum(["mikrotik", "cisco", "ubiquiti", "freeradius", "juniper", "huawei", "generic"]).default("generic"),
  isActive: z.boolean().default(true),
});

type ServerForm = z.infer<typeof serverSchema>;
type NasForm = z.infer<typeof nasSchema>;
type ClientForm = z.infer<typeof clientSchema>;

function AaaPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState("overview");
  const [serverDialogOpen, setServerDialogOpen] = useState(false);
  const [nasDialogOpen, setNasDialogOpen] = useState(false);
  const [clientDialogOpen, setClientDialogOpen] = useState(false);
  const [editingServer, setEditingServer] = useState<any>(null);
  const [editingNas, setEditingNas] = useState<any>(null);
  const [editingClient, setEditingClient] = useState<any>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteType, setDeleteType] = useState<"server" | "nas" | "client" | null>(null);
  const [accountingSearch, setAccountingSearch] = useState("");
  const [accountingType, setAccountingType] = useState("all");

  const { data: tenantId } = useTenantId();

  const stats = useQuery({
    queryKey: ["aaa-stats", tenantId],
    queryFn: async () => radiusMonitoring.getAaaStats(tenantId!),
    enabled: !!tenantId,
    refetchInterval: 30000,
  });

  const servers = useQuery({
    queryKey: ["aaa-servers", tenantId],
    queryFn: async () => radiusServerPool.list(tenantId!),
    enabled: !!tenantId,
  });

  const nasDevices = useQuery({
    queryKey: ["aaa-nas", tenantId],
    queryFn: async () => nasManagement.list(tenantId!),
    enabled: !!tenantId,
  });

  const clients = useQuery({
    queryKey: ["aaa-clients", tenantId],
    queryFn: async () => radiusClientService.list(tenantId!),
    enabled: !!tenantId,
  });

  const accounting = useQuery({
    queryKey: ["aaa-accounting", tenantId, accountingSearch, accountingType],
    queryFn: async () => {
      return accountingService.getRecords(tenantId!, {
        username: accountingSearch || undefined,
        statusType: accountingType !== "all" ? (accountingType as any) : undefined,
        limit: 50,
      });
    },
    enabled: !!tenantId,
  });

  const runHealth = useMutation({
    mutationFn: async () => radiusMonitoring.runHealthCycle(tenantId!),
    onSuccess: () => {
      toast.success("RADIUS health cycle completed");
      qc.invalidateQueries({ queryKey: ["aaa-stats", tenantId] });
      qc.invalidateQueries({ queryKey: ["aaa-servers", tenantId] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const saveServer = useMutation({
    mutationFn: async (data: ServerForm) => radiusServerPool.save(tenantId!, editingServer ? { ...data, id: editingServer.id } : data),
    onSuccess: () => {
      toast.success(editingServer ? "Radius server updated" : "Radius server added");
      qc.invalidateQueries({ queryKey: ["aaa-servers", tenantId] });
      qc.invalidateQueries({ queryKey: ["aaa-stats", tenantId] });
      setServerDialogOpen(false);
      setEditingServer(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteServer = useMutation({
    mutationFn: async (id: string) => radiusServerPool.delete(id),
    onSuccess: () => {
      toast.success("Radius server removed");
      qc.invalidateQueries({ queryKey: ["aaa-servers", tenantId] });
      qc.invalidateQueries({ queryKey: ["aaa-stats", tenantId] });
      setDeleteId(null); setDeleteType(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const saveNas = useMutation({
    mutationFn: async (data: NasForm) => nasManagement.save(tenantId!, editingNas ? { ...data, id: editingNas.id } : data),
    onSuccess: () => {
      toast.success(editingNas ? "NAS device updated" : "NAS device added");
      qc.invalidateQueries({ queryKey: ["aaa-nas", tenantId] });
      qc.invalidateQueries({ queryKey: ["aaa-stats", tenantId] });
      setNasDialogOpen(false);
      setEditingNas(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteNas = useMutation({
    mutationFn: async (id: string) => nasManagement.delete(id),
    onSuccess: () => {
      toast.success("NAS device removed");
      qc.invalidateQueries({ queryKey: ["aaa-nas", tenantId] });
      qc.invalidateQueries({ queryKey: ["aaa-stats", tenantId] });
      setDeleteId(null); setDeleteType(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const saveClient = useMutation({
    mutationFn: async (data: ClientForm) => radiusClientService.save(tenantId!, editingClient ? { ...data, id: editingClient.id } : data),
    onSuccess: () => {
      toast.success(editingClient ? "Radius client updated" : "Radius client added");
      qc.invalidateQueries({ queryKey: ["aaa-clients", tenantId] });
      setClientDialogOpen(false);
      setEditingClient(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteClient = useMutation({
    mutationFn: async (id: string) => radiusClientService.delete(id),
    onSuccess: () => {
      toast.success("Radius client removed");
      qc.invalidateQueries({ queryKey: ["aaa-clients", tenantId] });
      setDeleteId(null); setDeleteType(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const { register: registerServer, handleSubmit: handleSubmitServer, reset: resetServer, setValue: setServerValue, watch: watchServer } = useForm<ServerForm>({
    resolver: zodResolver(serverSchema) as any,
    defaultValues: { auth_port: 1812, acct_port: 1813, coa_port: 3799, timeout_ms: 3000, retry_count: 3, priority: 1, protocol: "mschapv2", role: "primary", failover_strategy: "priority", is_active: true },
  });

  const { register: registerNas, handleSubmit: handleSubmitNas, reset: resetNas, setValue: setNasValue, watch: watchNas } = useForm<NasForm>({
    resolver: zodResolver(nasSchema) as any,
    defaultValues: { auth_port: 1812, acct_port: 1813, coa_port: 3799, vendor: "mikrotik", is_active: true, dynamic_vlan_enabled: false, dynamic_profile_enabled: true, dynamic_ip_enabled: false },
  });

  const { register: registerClient, handleSubmit: handleSubmitClient, reset: resetClient, setValue: setClientValue, watch: watchClient } = useForm<ClientForm>({
    resolver: zodResolver(clientSchema) as any,
    defaultValues: { vendor: "generic", isActive: true },
  });

  function openServerDialog(server?: any) {
    setEditingServer(server ?? null);
    if (server) {
      resetServer({
        name: server.name ?? "",
        host: server.host ?? "",
        auth_port: server.authPort ?? server.auth_port ?? 1812,
        acct_port: server.acctPort ?? server.acct_port ?? 1813,
        coa_port: server.coaPort ?? server.coa_port ?? 3799,
        shared_secret: server.sharedSecret ?? server.shared_secret ?? "",
        protocol: server.protocol ?? "mschapv2",
        role: server.role ?? "primary",
        failover_strategy: server.failoverStrategy ?? server.failover_strategy ?? "priority",
        timeout_ms: server.timeoutMs ?? server.timeout_ms ?? 3000,
        retry_count: server.retryCount ?? server.retry_count ?? 3,
        priority: server.priority ?? 1,
        is_active: server.isActive ?? server.is_active ?? true,
      });
    } else {
      resetServer({ auth_port: 1812, acct_port: 1813, coa_port: 3799, timeout_ms: 3000, retry_count: 3, priority: 1, protocol: "mschapv2", role: "primary", failover_strategy: "priority", is_active: true });
    }
    setServerDialogOpen(true);
  }

  function openNasDialog(nas?: any) {
    setEditingNas(nas ?? null);
    if (nas) {
      resetNas({
        name: nas.name ?? "",
        description: nas.description ?? "",
        vendor: nas.vendor ?? "mikrotik",
        nas_identifier: nas.nasIdentifier ?? nas.nas_identifier ?? "",
        nas_ip: nas.nasIp ?? nas.nas_ip ?? "",
        shared_secret: nas.sharedSecret ?? nas.shared_secret ?? "",
        auth_port: nas.authPort ?? nas.auth_port ?? 1812,
        acct_port: nas.acctPort ?? nas.acct_port ?? 1813,
        coa_port: nas.coaPort ?? nas.coa_port ?? 3799,
        is_active: nas.isActive ?? nas.is_active ?? true,
        dynamic_vlan_enabled: nas.dynamicVlanEnabled ?? nas.dynamic_vlan_enabled ?? false,
        dynamic_profile_enabled: nas.dynamicProfileEnabled ?? nas.dynamic_profile_enabled ?? true,
        dynamic_ip_enabled: nas.dynamicIpEnabled ?? nas.dynamic_ip_enabled ?? false,
        radius_server_id: nas.radiusServerId ?? nas.radius_server_id ?? null,
      });
    } else {
      resetNas({ auth_port: 1812, acct_port: 1813, coa_port: 3799, vendor: "mikrotik", is_active: true, dynamic_vlan_enabled: false, dynamic_profile_enabled: true, dynamic_ip_enabled: false });
    }
    setNasDialogOpen(true);
  }

  function openClientDialog(client?: any) {
    setEditingClient(client ?? null);
    if (client) {
      resetClient({
        name: client.name ?? "",
        description: client.description ?? "",
        clientIp: client.clientIp ?? "",
        sharedSecret: client.sharedSecret ?? "",
        vendor: client.vendor ?? "generic",
        isActive: client.isActive ?? true,
      });
    } else {
      resetClient({ vendor: "generic", isActive: true });
    }
    setClientDialogOpen(true);
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-semibold">AAA & RADIUS</h1>
          <p className="text-sm text-muted-foreground">Manage RADIUS servers, NAS devices, clients, accounting and health for your tenant.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => runHealth.mutate()} disabled={runHealth.isPending || !tenantId}>
            <RefreshCw className="h-4 w-4 mr-2" />Run health cycle
          </Button>
          <Button onClick={() => setTab("servers")}><Server className="h-4 w-4 mr-2" />Open AAA sections</Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-xl border border-border/60 bg-card p-5">
          <div className="text-xs text-muted-foreground uppercase">Auth Success</div>
          <div className="mt-3 text-3xl font-semibold text-green-600">{stats.data?.authSuccess ?? "—"}</div>
        </div>
        <div className="rounded-xl border border-border/60 bg-card p-5">
          <div className="text-xs text-muted-foreground uppercase">Auth Failures</div>
          <div className="mt-3 text-3xl font-semibold text-red-600">{stats.data?.authFailure ?? "—"}</div>
        </div>
        <div className="rounded-xl border border-border/60 bg-card p-5">
          <div className="text-xs text-muted-foreground uppercase">Active Sessions</div>
          <div className="mt-3 text-3xl font-semibold text-blue-600">{stats.data?.activeSessions ?? "—"}</div>
        </div>
        <div className="rounded-xl border border-border/60 bg-card p-5">
          <div className="text-xs text-muted-foreground uppercase">Healthy Servers</div>
          <div className="mt-3 text-3xl font-semibold text-emerald-600">{stats.data?.healthyRadiusServers ?? "—"}</div>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="servers">Servers</TabsTrigger>
          <TabsTrigger value="nas">NAS Devices</TabsTrigger>
          <TabsTrigger value="clients">Clients</TabsTrigger>
          <TabsTrigger value="accounting">Accounting</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-xl border border-border/60 bg-card p-5">
              <div className="flex items-center gap-2 text-sm text-muted-foreground"><ShieldCheck className="h-4 w-4" />NAS devices</div>
              <div className="mt-3 text-3xl font-semibold">{nasDevices.data?.length ?? "—"}</div>
            </div>
            <div className="rounded-xl border border-border/60 bg-card p-5">
              <div className="flex items-center gap-2 text-sm text-muted-foreground"><Server className="h-4 w-4" />Radius clients</div>
              <div className="mt-3 text-3xl font-semibold">{clients.data?.length ?? "—"}</div>
            </div>
            <div className="rounded-xl border border-border/60 bg-card p-5">
              <div className="flex items-center gap-2 text-sm text-muted-foreground"><Zap className="h-4 w-4" />Accounting records</div>
              <div className="mt-3 text-3xl font-semibold">{accounting.data?.length ?? "—"}</div>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-border/60 bg-card p-5">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold">Server health</h2>
                  <p className="text-sm text-muted-foreground">Latest RADIUS health cycle metrics.</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => runHealth.mutate()} disabled={runHealth.isPending || !tenantId}>Refresh</Button>
              </div>
              <div className="mt-4 grid gap-3">
                <div className="rounded-xl bg-muted/70 p-4">
                  <div className="text-xs text-muted-foreground">Failure rate</div>
                  <div className="mt-2 text-2xl font-semibold">{stats.data?.failureRatePercent ?? "—"}%</div>
                </div>
                <div className="rounded-xl bg-muted/70 p-4">
                  <div className="text-xs text-muted-foreground">Avg auth latency</div>
                  <div className="mt-2 text-2xl font-semibold">{stats.data?.avgAuthLatencyMs != null ? `${stats.data.avgAuthLatencyMs} ms` : "—"}</div>
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-border/60 bg-card p-5">
              <div className="text-lg font-semibold">Alert guidance</div>
              <div className="mt-3 space-y-2 text-sm text-muted-foreground">
                <p><strong>High failure rate</strong> indicates authentication or profile mapping issues.</p>
                <p><strong>Offline NAS</strong> may need router or secret validation.</p>
                <p><strong>Slow latency</strong> signals RADIUS server overload or reachability problems.</p>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="servers" className="space-y-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-2xl font-semibold">RADIUS Servers</h2>
              <p className="text-sm text-muted-foreground">Primary/secondary RADIUS pool management and failover settings.</p>
            </div>
            <Button onClick={() => openServerDialog()}><Plus className="h-4 w-4 mr-2" />Add Server</Button>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {servers.data?.map((server: any) => (
              <div key={server.id} className="rounded-xl border border-border/60 bg-card p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-semibold">{server.name}</div>
                    <div className="text-xs text-muted-foreground">{server.host}:{server.authPort}</div>
                  </div>
                  <div className={`rounded-full px-2 py-0.5 text-xs ${server.isHealthy ? "bg-green-500/15 text-green-600" : server.isHealthy === false ? "bg-red-500/15 text-red-600" : "bg-muted text-muted-foreground"}`}>
                    {server.isHealthy === true ? "Healthy" : server.isHealthy === false ? "Unhealthy" : "Unknown"}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                  <div>Role: {server.role}</div>
                  <div>Strategy: {server.failoverStrategy}</div>
                  <div>Priority: {server.priority}</div>
                  <div>Latency: {server.latencyMs ?? "—"} ms</div>
                </div>
                <div className="flex flex-wrap gap-2 pt-3 border-t border-border/60">
                  <button onClick={() => openServerDialog(server)} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"><Edit className="h-3 w-3" />Edit</button>
                  <button onClick={() => { setDeleteId(server.id); setDeleteType("server"); }} className="text-xs text-destructive hover:text-red-600 flex items-center gap-1"><Trash2 className="h-3 w-3" />Delete</button>
                </div>
              </div>
            ))}
            {servers.data?.length === 0 && !servers.isLoading && (
              <div className="col-span-full rounded-xl border border-border/60 bg-card p-6 text-center text-muted-foreground">No RADIUS servers configured yet.</div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="nas" className="space-y-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-2xl font-semibold">NAS Devices</h2>
              <p className="text-sm text-muted-foreground">Add and manage NAS devices that authenticate and account traffic.</p>
            </div>
            <Button onClick={() => openNasDialog()}><Plus className="h-4 w-4 mr-2" />Add NAS</Button>
          </div>

          <div className="overflow-hidden rounded-xl border border-border/60 bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead className="hidden lg:table-cell">Identifier</TableHead>
                  <TableHead className="hidden sm:table-cell">IP</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {nasDevices.data?.map((nas: any) => (
                  <TableRow key={nas.id}>
                    <TableCell>{nas.name}</TableCell>
                    <TableCell>{nas.vendor}</TableCell>
                    <TableCell className="hidden lg:table-cell">{nas.nasIdentifier ?? "—"}</TableCell>
                    <TableCell className="hidden sm:table-cell">{nas.nasIp ?? "—"}</TableCell>
                    <TableCell>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] ${nas.isActive ? "bg-green-500/15 text-green-600" : "bg-red-500/15 text-red-600"}`}>
                        {nas.isActive ? "Active" : "Disabled"}
                      </span>
                    </TableCell>
                    <TableCell className="space-x-2">
                      <button onClick={() => openNasDialog(nas)} className="text-xs text-muted-foreground hover:text-foreground">Edit</button>
                      <button onClick={() => { setDeleteId(nas.id); setDeleteType("nas"); }} className="text-xs text-destructive hover:text-red-600">Delete</button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableCaption>Last seen and activity available in the router network monitor.</TableCaption>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="clients" className="space-y-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-2xl font-semibold">RADIUS Clients</h2>
              <p className="text-sm text-muted-foreground">Manage network devices with RADIUS access and shared secrets.</p>
            </div>
            <Button onClick={() => openClientDialog()}><Plus className="h-4 w-4 mr-2" />Add Client</Button>
          </div>

          <div className="overflow-hidden rounded-xl border border-border/60 bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>IP</TableHead>
                  <TableHead className="hidden sm:table-cell">Vendor</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {clients.data?.map((client: any) => (
                  <TableRow key={client.id}>
                    <TableCell>{client.name}</TableCell>
                    <TableCell>{client.clientIp}</TableCell>
                    <TableCell className="hidden sm:table-cell">{client.vendor}</TableCell>
                    <TableCell>{client.isActive ? "Active" : "Disabled"}</TableCell>
                    <TableCell className="space-x-2">
                      <button onClick={() => openClientDialog(client)} className="text-xs text-muted-foreground hover:text-foreground">Edit</button>
                      <button onClick={() => { setDeleteId(client.id); setDeleteType("client"); }} className="text-xs text-destructive hover:text-red-600">Delete</button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableCaption>Radius clients are allowed to submit accounting and auth requests against your pool.</TableCaption>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="accounting" className="space-y-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-2xl font-semibold">Accounting</h2>
              <p className="text-sm text-muted-foreground">Recent RADIUS accounting events and session updates.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-10"
                  value={accountingSearch}
                  onChange={(event) => setAccountingSearch(event.target.value)}
                  placeholder="Search username"
                />
              </div>
              <Select value={accountingType} onValueChange={setAccountingType}>
                <SelectTrigger className="w-48"><SelectValue placeholder="Filter status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="Start">Start</SelectItem>
                  <SelectItem value="Stop">Stop</SelectItem>
                  <SelectItem value="Interim-Update">Interim</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-border/60 bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Username</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden lg:table-cell">Framed IP</TableHead>
                  <TableHead className="hidden xl:table-cell">NAS</TableHead>
                  <TableHead>Received</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accounting.data?.map((row: any) => (
                  <TableRow key={row.id}>
                    <TableCell>{row.username}</TableCell>
                    <TableCell>{row.acctStatusType}</TableCell>
                    <TableCell className="hidden lg:table-cell">{row.framedIp ?? "—"}</TableCell>
                    <TableCell className="hidden xl:table-cell">{row.nasIdentifier ?? row.nasId ?? "—"}</TableCell>
                    <TableCell>{new Date(row.receivedAt).toLocaleString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={serverDialogOpen} onOpenChange={setServerDialogOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{editingServer ? "Edit RADIUS Server" : "Add RADIUS Server"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmitServer((data) => saveServer.mutate(data))} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label>Name</Label>
                <Input {...registerServer("name")} />
              </div>
              <div>
                <Label>Host</Label>
                <Input {...registerServer("host")} />
              </div>
              <div>
                <Label>Shared Secret</Label>
                <Input type="password" {...registerServer("shared_secret")} />
              </div>
              <div>
                <Label>Protocol</Label>
                <Select value={watchServer("protocol")} onValueChange={(value) => setServerValue("protocol", value as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pap">PAP</SelectItem>
                    <SelectItem value="chap">CHAP</SelectItem>
                    <SelectItem value="mschapv2">MS-CHAPv2</SelectItem>
                    <SelectItem value="eap-tls">EAP-TLS</SelectItem>
                    <SelectItem value="eap-ttls">EAP-TTLS</SelectItem>
                    <SelectItem value="peap">PEAP</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Role</Label>
                <Select value={watchServer("role")} onValueChange={(value) => setServerValue("role", value as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="primary">Primary</SelectItem>
                    <SelectItem value="secondary">Secondary</SelectItem>
                    <SelectItem value="tertiary">Tertiary</SelectItem>
                    <SelectItem value="backup">Backup</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Failover strategy</Label>
                <Select value={watchServer("failover_strategy")} onValueChange={(value) => setServerValue("failover_strategy", value as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="priority">Priority</SelectItem>
                    <SelectItem value="round_robin">Round Robin</SelectItem>
                    <SelectItem value="least_latency">Least latency</SelectItem>
                    <SelectItem value="random">Random</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Auth port</Label>
                <Input type="number" {...registerServer("auth_port")} />
              </div>
              <div>
                <Label>Acct port</Label>
                <Input type="number" {...registerServer("acct_port")} />
              </div>
              <div>
                <Label>CoA port</Label>
                <Input type="number" {...registerServer("coa_port")} />
              </div>
              <div>
                <Label>Timeout (ms)</Label>
                <Input type="number" {...registerServer("timeout_ms")} />
              </div>
              <div>
                <Label>Retry count</Label>
                <Input type="number" {...registerServer("retry_count")} />
              </div>
              <div>
                <Label>Priority</Label>
                <Input type="number" {...registerServer("priority")} />
              </div>
              <div>
                <Label>Active</Label>
                <Select value={watchServer("is_active") ? "true" : "false"} onValueChange={(value) => setServerValue("is_active", value === "true")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">Active</SelectItem>
                    <SelectItem value="false">Disabled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" type="button" onClick={() => setServerDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saveServer.isPending}>{saveServer.isPending ? "Saving..." : "Save server"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={nasDialogOpen} onOpenChange={setNasDialogOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{editingNas ? "Edit NAS Device" : "Add NAS Device"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmitNas((data) => saveNas.mutate(data))} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label>Name</Label>
                <Input {...registerNas("name")} />
              </div>
              <div>
                <Label>Vendor</Label>
                <Select value={watchNas("vendor")} onValueChange={(value) => setNasValue("vendor", value as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mikrotik">MikroTik</SelectItem>
                    <SelectItem value="cisco">Cisco</SelectItem>
                    <SelectItem value="ubiquiti">Ubiquiti</SelectItem>
                    <SelectItem value="freeradius">FreeRADIUS</SelectItem>
                    <SelectItem value="juniper">Juniper</SelectItem>
                    <SelectItem value="huawei">Huawei</SelectItem>
                    <SelectItem value="generic">Generic</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>NAS Identifier</Label>
                <Input {...registerNas("nas_identifier")} />
              </div>
              <div>
                <Label>NAS IP</Label>
                <Input {...registerNas("nas_ip")} />
              </div>
              <div>
                <Label>Shared Secret</Label>
                <Input type="password" {...registerNas("shared_secret")} />
              </div>
              <div>
                <Label>Radius server</Label>
                <Select value={watchNas("radius_server_id") ?? "__none__"} onValueChange={(value) => setNasValue("radius_server_id", value === "__none__" ? null : value)}>
                  <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None</SelectItem>
                    {servers.data?.map((server: any) => (
                      <SelectItem key={server.id} value={server.id}>{server.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Auth port</Label>
                <Input type="number" {...registerNas("auth_port")} />
              </div>
              <div>
                <Label>Acct port</Label>
                <Input type="number" {...registerNas("acct_port")} />
              </div>
              <div>
                <Label>CoA port</Label>
                <Input type="number" {...registerNas("coa_port")} />
              </div>
              <div>
                <Label>Dynamic VLAN</Label>
                <Select value={watchNas("dynamic_vlan_enabled") ? "true" : "false"} onValueChange={(value) => setNasValue("dynamic_vlan_enabled", value === "true")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">Enabled</SelectItem>
                    <SelectItem value="false">Disabled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Dynamic Profile</Label>
                <Select value={watchNas("dynamic_profile_enabled") ? "true" : "false"} onValueChange={(value) => setNasValue("dynamic_profile_enabled", value === "true")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">Enabled</SelectItem>
                    <SelectItem value="false">Disabled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Dynamic IP</Label>
                <Select value={watchNas("dynamic_ip_enabled") ? "true" : "false"} onValueChange={(value) => setNasValue("dynamic_ip_enabled", value === "true")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">Enabled</SelectItem>
                    <SelectItem value="false">Disabled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Active</Label>
                <Select value={watchNas("is_active") ? "true" : "false"} onValueChange={(value) => setNasValue("is_active", value === "true")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">Active</SelectItem>
                    <SelectItem value="false">Disabled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" type="button" onClick={() => setNasDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saveNas.isPending}>{saveNas.isPending ? "Saving..." : "Save NAS"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={clientDialogOpen} onOpenChange={setClientDialogOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{editingClient ? "Edit RADIUS Client" : "Add RADIUS Client"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmitClient((data) => saveClient.mutate(data))} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label>Name</Label>
                <Input {...registerClient("name")} />
              </div>
              <div>
                <Label>Client IP</Label>
                <Input {...registerClient("clientIp")} />
              </div>
              <div>
                <Label>Shared Secret</Label>
                <Input type="password" {...registerClient("sharedSecret")} />
              </div>
              <div>
                <Label>Vendor</Label>
                <Select value={watchClient("vendor")} onValueChange={(value) => setClientValue("vendor", value as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mikrotik">MikroTik</SelectItem>
                    <SelectItem value="cisco">Cisco</SelectItem>
                    <SelectItem value="ubiquiti">Ubiquiti</SelectItem>
                    <SelectItem value="freeradius">FreeRADIUS</SelectItem>
                    <SelectItem value="juniper">Juniper</SelectItem>
                    <SelectItem value="huawei">Huawei</SelectItem>
                    <SelectItem value="generic">Generic</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Active</Label>
                <Select value={watchClient("isActive") ? "true" : "false"} onValueChange={(value) => setClientValue("isActive", value === "true")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">Active</SelectItem>
                    <SelectItem value="false">Disabled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="md:col-span-2">
                <Label>Description</Label>
                <Input {...registerClient("description")} />
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" type="button" onClick={() => setClientDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saveClient.isPending}>{saveClient.isPending ? "Saving..." : "Save Client"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteId} onOpenChange={(open) => { if (!open) { setDeleteId(null); setDeleteType(null); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Confirm delete</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4 text-sm text-muted-foreground">
            <p>This will permanently remove the selected AAA item. It will not affect active sessions.</p>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setDeleteId(null); setDeleteType(null); }}>Cancel</Button>
            <Button variant="destructive" onClick={() => {
              if (!deleteId) return;
              if (deleteType === "server") deleteServer.mutate(deleteId);
              else if (deleteType === "nas") deleteNas.mutate(deleteId);
              else if (deleteType === "client") deleteClient.mutate(deleteId);
            }}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
