import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useTenantId } from "@/lib/auth";
import { toast } from "sonner";
import {
  Save, Building2, CreditCard, Bell, Wifi, Shield, Users,
  Plus, Trash2, Eye, EyeOff, Palette, Globe,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { saveBranding } from "@/lib/branding";

export const Route = createFileRoute("/_authenticated/settings/")({
  component: SettingsPage,
});

function SettingsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const tenantQuery = useTenantId();
  const tenantId = tenantQuery.data;
  const [showSecrets, setShowSecrets] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("support_agent");
  const [brandForm, setBrandForm] = useState<Record<string, any>>({});

  const brandingQuery = useQuery({
    queryKey: ["tenant-branding", tenantId],
    queryFn: async () => {
      const { data } = await (supabase as any).from("tenant_branding").select("*").eq("tenant_id", tenantId!).maybeSingle();
      return data ?? {};
    },
    enabled: !!tenantId,
  });

  const tenant = useQuery({
    queryKey: ["tenant-detail", tenantId],
    queryFn: async () => {
      const { data } = await supabase.from("tenants").select("*").eq("id", tenantId!).single();
      return data;
    },
    enabled: !!tenantId,
  });

  const settings = useQuery({
    queryKey: ["settings", tenantId],
    queryFn: async () => {
      const { data } = await supabase.from("settings").select("*").eq("tenant_id", tenantId!);
      return Object.fromEntries((data ?? []).map((s: any) => [s.key, s.value]));
    },
    enabled: !!tenantId,
  });

  const teamMembers = useQuery({
    queryKey: ["team", tenantId],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, email, phone, is_active")
        .eq("tenant_id", tenantId!);
      return data ?? [];
    },
    enabled: !!tenantId,
  });

  const teamRoles = useQuery({
    queryKey: ["team-roles", tenantId],
    queryFn: async () => {
      const { data } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .in("user_id", (teamMembers.data ?? []).map((m: any) => m.id));
      const map: Record<string, string[]> = {};
      for (const r of data ?? []) { (map[r.user_id] ??= []).push(r.role); }
      return map;
    },
    enabled: (teamMembers.data?.length ?? 0) > 0,
  });

  const branches = useQuery({
    queryKey: ["branches", tenantId],
    queryFn: async () => {
      const { data } = await supabase.from("branches").select("*").eq("tenant_id", tenantId!).order("name");
      return data ?? [];
    },
    enabled: !!tenantId,
  });

  const [tenantForm, setTenantForm] = useState<Record<string, any>>({});
  const [mpesaForm, setMpesaForm] = useState<Record<string, any>>(settings.data?.mpesa ?? {});
  const [smsForm, setSmsForm] = useState<Record<string, any>>(settings.data?.sms ?? {});
  const [networkForm, setNetworkForm] = useState<Record<string, any>>(settings.data?.network ?? {});
  const [notifForm, setNotifForm] = useState<Record<string, any>>(settings.data?.notifications ?? {});
  const [securityForm, setSecurityForm] = useState<Record<string, any>>(settings.data?.security ?? {});
  const [branchForm, setBranchForm] = useState({ name: "", city: "", code: "", phone: "", address: "" });
  const [branchOpen, setBranchOpen] = useState(false);
  const [deleteBranchId, setDeleteBranchId] = useState<string | null>(null);

  const saveBrand = useMutation({
    mutationFn: async () => {
      const merged = { ...(brandingQuery.data ?? {}), ...brandForm };
      await saveBranding(tenantId!, merged);
    },
    onSuccess: () => { toast.success("Branding saved"); qc.invalidateQueries({ queryKey: ["tenant-branding"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const bf = { ...(brandingQuery.data ?? {}), ...brandForm };

  const saveTenant = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("tenants").update(tenantForm as any).eq("id", tenantId!);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Saved"); qc.invalidateQueries({ queryKey: ["tenant-detail"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const saveSetting = useMutation({
    mutationFn: async ({ key, value }: { key: string; value: any }) => {
      const { error } = await supabase.from("settings").upsert({ tenant_id: tenantId, key, value } as any, { onConflict: "tenant_id,key" });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Saved"); qc.invalidateQueries({ queryKey: ["settings"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const addBranch = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("branches").insert({ ...branchForm, tenant_id: tenantId! });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Branch added"); qc.invalidateQueries({ queryKey: ["branches"] }); setBranchOpen(false); setBranchForm({ name: "", city: "", code: "", phone: "", address: "" }); },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteBranch = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("branches").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Branch removed"); qc.invalidateQueries({ queryKey: ["branches"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const t = { ...(tenant.data ?? {}), ...tenantForm } as Record<string, string>;

  return (
    <div className="space-y-6 w-full max-w-6xl px-2 sm:px-0">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Configure your SmartLinkNet workspace</p>
      </div>

      <Tabs defaultValue="general" className="flex flex-col md:flex-row gap-6">
        <TooltipProvider delayDuration={300}>
        <TabsList className="flex flex-row md:flex-col h-auto w-full md:w-52 shrink-0 bg-muted/50 p-1.5 rounded-xl gap-1 overflow-x-auto md:overflow-visible scrollbar-none">
          {([
            { value: "general",       icon: <Building2 className="h-4 w-4" />,  label: "General" },
            { value: "branding",       icon: <Palette className="h-4 w-4" />,   label: "Branding" },
            { value: "branches",      icon: <Building2 className="h-4 w-4" />,  label: "Branches" },
            { value: "mpesa",         icon: <CreditCard className="h-4 w-4" />, label: "M-Pesa" },
            { value: "sms",           icon: <Bell className="h-4 w-4" />,       label: "SMS" },
            { value: "network",       icon: <Wifi className="h-4 w-4" />,       label: "Network" },
            { value: "notifications", icon: <Bell className="h-4 w-4" />,       label: "Notifications" },
            { value: "team",          icon: <Users className="h-4 w-4" />,      label: "Team" },
            { value: "security",      icon: <Shield className="h-4 w-4" />,     label: "Security" },
            { value: "outages",        icon: <Globe className="h-4 w-4" />,      label: "Outages" },
          ] as const).map(({ value, icon, label }) => (
            <Tooltip key={value}>
              <TooltipTrigger asChild>
                <TabsTrigger value={value} className="shrink-0 md:w-full justify-start gap-2 px-3 py-2 text-sm">
                  {icon}
                  <span className="hidden xs:inline md:inline">{label}</span>
                </TabsTrigger>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="md:hidden">{label}</TooltipContent>
            </Tooltip>
          ))}
        </TabsList>
        </TooltipProvider>

        <div className="flex-1 min-w-0">

        {/* Branding */}
        <TabsContent value="branding">
          <Section title="Brand Identity" desc="Logo, colors, and portal customization applied across the entire platform">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Logo URL (link to your logo image)">
                <Input value={bf.logo_url ?? ""} onChange={(e) => setBrandForm((f) => ({ ...f, logo_url: e.target.value }))} placeholder="https://..." />
                {bf.logo_url && <img src={bf.logo_url} alt="logo" className="mt-2 h-10 w-auto object-contain rounded border border-border/60 bg-muted p-1" />}
              </Field>
              <Field label="Favicon URL">
                <Input value={bf.favicon_url ?? ""} onChange={(e) => setBrandForm((f) => ({ ...f, favicon_url: e.target.value }))} placeholder="https://..." />
              </Field>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {([
                { key: "primary_color", label: "Primary", placeholder: "#0ea5e9" },
                { key: "secondary_color", label: "Secondary", placeholder: "#8b5cf6" },
                { key: "accent_color", label: "Accent", placeholder: "#f59e0b" },
                { key: "success_color", label: "Success", placeholder: "#22c55e" },
                { key: "warning_color", label: "Warning", placeholder: "#f59e0b" },
                { key: "error_color", label: "Error", placeholder: "#ef4444" },
              ] as const).map((c) => (
                <div key={c.key}>
                  <Label className="mb-1 block text-xs">{c.label}</Label>
                  <div className="flex gap-2">
                    <input type="color" value={bf[c.key] ?? c.placeholder} onChange={(e) => setBrandForm((f) => ({ ...f, [c.key]: e.target.value }))} className="h-9 w-11 cursor-pointer rounded border border-input bg-transparent" />
                    <Input value={bf[c.key] ?? ""} onChange={(e) => setBrandForm((f) => ({ ...f, [c.key]: e.target.value }))} placeholder={c.placeholder} className="font-mono text-xs" />
                  </div>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="SMS Sender ID">
                <Input value={bf.sms_sender_id ?? ""} onChange={(e) => setBrandForm((f) => ({ ...f, sms_sender_id: e.target.value }))} placeholder="SMARTNET" maxLength={11} />
              </Field>
              <Field label="Support Phone">
                <Input value={bf.support_phone ?? ""} onChange={(e) => setBrandForm((f) => ({ ...f, support_phone: e.target.value }))} />
              </Field>
              <Field label="Support Email">
                <Input value={bf.support_email ?? ""} onChange={(e) => setBrandForm((f) => ({ ...f, support_email: e.target.value }))} />
              </Field>
              <Field label="Portal Tagline">
                <Input value={bf.portal_tagline ?? ""} onChange={(e) => setBrandForm((f) => ({ ...f, portal_tagline: e.target.value }))} />
              </Field>
            </div>
            <Field label="Invoice Header">
              <Textarea value={bf.invoice_header ?? ""} onChange={(e) => setBrandForm((f) => ({ ...f, invoice_header: e.target.value }))} rows={2} />
            </Field>
            <Field label="Invoice Footer">
              <Textarea value={bf.invoice_footer ?? ""} onChange={(e) => setBrandForm((f) => ({ ...f, invoice_footer: e.target.value }))} rows={2} />
            </Field>
            <Field label="Custom CSS Overrides">
              <Textarea value={bf.css_overrides ?? ""} onChange={(e) => setBrandForm((f) => ({ ...f, css_overrides: e.target.value }))} rows={4} className="font-mono text-xs" placeholder="/* optional */" />
            </Field>
            <Button onClick={() => saveBrand.mutate()} disabled={saveBrand.isPending}><Save className="h-4 w-4 mr-2" />{saveBrand.isPending ? "Saving…" : "Save Branding"}</Button>
          </Section>
        </TabsContent>

        {/* General */}
        <TabsContent value="general">
          <Section title="Company Information" desc="Your ISP branding and contact details">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Company Name"><Input value={(t.name ?? "") as string} onChange={(e) => setTenantForm((f: any) => ({ ...f, name: e.target.value }))} /></Field>
              <Field label="Slug"><Input value={(t.slug ?? "") as string} onChange={(e) => setTenantForm((f: any) => ({ ...f, slug: e.target.value }))} /></Field>
              <Field label="Contact Email"><Input type="email" value={(t.contact_email ?? "") as string} onChange={(e) => setTenantForm((f: any) => ({ ...f, contact_email: e.target.value }))} /></Field>
              <Field label="Contact Phone"><Input value={(t.contact_phone ?? "") as string} onChange={(e) => setTenantForm((f: any) => ({ ...f, contact_phone: e.target.value }))} /></Field>
              <Field label="Country"><Input value={(t.country ?? "KE") as string} onChange={(e) => setTenantForm((f: any) => ({ ...f, country: e.target.value }))} /></Field>
              <Field label="Currency"><Input value={(t.currency ?? "KES") as string} onChange={(e) => setTenantForm((f: any) => ({ ...f, currency: e.target.value }))} /></Field>
              <Field label="Timezone"><Input value={(t.timezone ?? "Africa/Nairobi") as string} onChange={(e) => setTenantForm((f: any) => ({ ...f, timezone: e.target.value }))} /></Field>
              <Field label="Primary Color (hex)"><Input value={(t.primary_color ?? "") as string} onChange={(e) => setTenantForm((f: any) => ({ ...f, primary_color: e.target.value }))} placeholder="#3B82F6" /></Field>
            </div>
            <Button onClick={() => saveTenant.mutate()} disabled={saveTenant.isPending}><Save className="h-4 w-4 mr-2" />{saveTenant.isPending ? "Saving..." : "Save Changes"}</Button>
          </Section>
        </TabsContent>

        {/* Branches */}
        <TabsContent value="branches">
          <Section title="Branches" desc="Manage your office and service locations" action={<Button size="sm" onClick={() => setBranchOpen(true)}><Plus className="h-4 w-4 mr-2" />Add Branch</Button>}>
            <div className="space-y-2">
              {branches.data?.length === 0 && <p className="text-sm text-muted-foreground">No branches yet.</p>}
              {branches.data?.map((b: any) => (
                <div key={b.id} className="flex items-center justify-between rounded-md border border-border/60 p-3">
                  <div>
                    <div className="font-medium">{b.name} <span className="text-xs text-muted-foreground">({b.code})</span></div>
                    <div className="text-xs text-muted-foreground">{b.city ?? ""} · {(b as any).phone ?? ""}</div>
                  </div>
                  <button onClick={() => setDeleteBranchId(b.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
                </div>
              ))}
            </div>
          </Section>
          <Dialog open={!!deleteBranchId} onOpenChange={(o) => { if (!o) setDeleteBranchId(null); }}>
            <DialogContent className="max-w-sm">
              <DialogHeader><DialogTitle>Remove Branch</DialogTitle></DialogHeader>
              <p className="text-sm text-muted-foreground">Are you sure you want to remove this branch? This action cannot be undone.</p>
              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => setDeleteBranchId(null)}>Cancel</Button>
                <Button variant="destructive" onClick={() => { deleteBranch.mutate(deleteBranchId!); setDeleteBranchId(null); }} disabled={deleteBranch.isPending}>Remove</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={branchOpen} onOpenChange={setBranchOpen}>
            <DialogContent>
              <DialogHeader><DialogTitle>Add Branch</DialogTitle></DialogHeader>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Branch Name *"><Input value={branchForm.name} onChange={(e) => setBranchForm((f) => ({ ...f, name: e.target.value }))} /></Field>
                <Field label="Code"><Input value={branchForm.code} onChange={(e) => setBranchForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))} placeholder="HQ" /></Field>
                <Field label="City"><Input value={branchForm.city} onChange={(e) => setBranchForm((f) => ({ ...f, city: e.target.value }))} /></Field>
                <Field label="Phone"><Input value={branchForm.phone} onChange={(e) => setBranchForm((f) => ({ ...f, phone: e.target.value }))} /></Field>
                <Field label="Address" className="col-span-2"><Input value={branchForm.address} onChange={(e) => setBranchForm((f) => ({ ...f, address: e.target.value }))} /></Field>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setBranchOpen(false)}>Cancel</Button>
                <Button onClick={() => addBranch.mutate()} disabled={!branchForm.name || addBranch.isPending}>Add Branch</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>

        {/* M-Pesa */}
        <TabsContent value="mpesa">
          <Section title="M-Pesa Daraja API" desc="Safaricom Daraja integration for STK Push and payment callbacks">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Consumer Key"><Input type={showSecrets ? "text" : "password"} value={mpesaForm.consumer_key ?? ""} onChange={(e) => setMpesaForm((f) => ({ ...f, consumer_key: e.target.value }))} /></Field>
              <Field label="Consumer Secret"><Input type={showSecrets ? "text" : "password"} value={mpesaForm.consumer_secret ?? ""} onChange={(e) => setMpesaForm((f) => ({ ...f, consumer_secret: e.target.value }))} /></Field>
              <Field label="Paybill / Till Shortcode"><Input value={mpesaForm.shortcode ?? ""} onChange={(e) => setMpesaForm((f) => ({ ...f, shortcode: e.target.value }))} /></Field>
              <Field label="Passkey"><Input type={showSecrets ? "text" : "password"} value={mpesaForm.passkey ?? ""} onChange={(e) => setMpesaForm((f) => ({ ...f, passkey: e.target.value }))} /></Field>
              <Field label="Initiator Name"><Input value={mpesaForm.initiator_name ?? ""} onChange={(e) => setMpesaForm((f) => ({ ...f, initiator_name: e.target.value }))} /></Field>
              <Field label="Security Credential"><Input type={showSecrets ? "text" : "password"} value={mpesaForm.security_credential ?? ""} onChange={(e) => setMpesaForm((f) => ({ ...f, security_credential: e.target.value }))} /></Field>
              <Field label="Callback URL" className="col-span-2"><Input value={mpesaForm.callback_url ?? ""} onChange={(e) => setMpesaForm((f) => ({ ...f, callback_url: e.target.value }))} placeholder="https://your-project.supabase.co/functions/v1/mpesa-callback" /></Field>
            </div>
            <div className="flex items-center gap-4">
              <button onClick={() => setShowSecrets((v) => !v)} className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground">
                {showSecrets ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}{showSecrets ? "Hide" : "Show"} secrets
              </button>
              <Switch checked={mpesaForm.sandbox ?? true} onCheckedChange={(v) => setMpesaForm((f) => ({ ...f, sandbox: v }))} />
              <Label className="text-sm">Sandbox Mode {mpesaForm.sandbox ? "(Testing)" : "(Production)"}</Label>
            </div>
            <Button onClick={() => saveSetting.mutate({ key: "mpesa", value: mpesaForm })} disabled={saveSetting.isPending}><Save className="h-4 w-4 mr-2" />{saveSetting.isPending ? "Saving..." : "Save M-Pesa Settings"}</Button>
          </Section>
        </TabsContent>

        {/* SMS */}
        <TabsContent value="sms">
          <Section title="SMS Configuration" desc="Africa's Talking or Twilio for automated SMS notifications">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Provider">
                <Select value={smsForm.provider ?? "africastalking"} onValueChange={(v) => setSmsForm((f) => ({ ...f, provider: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="africastalking">Africa's Talking</SelectItem>
                    <SelectItem value="twilio">Twilio</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="API Key"><Input type={showSecrets ? "text" : "password"} value={smsForm.api_key ?? ""} onChange={(e) => setSmsForm((f) => ({ ...f, api_key: e.target.value }))} /></Field>
              <Field label="Username / Account SID"><Input value={smsForm.username ?? ""} onChange={(e) => setSmsForm((f) => ({ ...f, username: e.target.value }))} /></Field>
              <Field label="Sender ID / Phone Number"><Input value={smsForm.sender_id ?? ""} onChange={(e) => setSmsForm((f) => ({ ...f, sender_id: e.target.value }))} placeholder="e.g. SMARTNET" /></Field>
            </div>
            <Button onClick={() => saveSetting.mutate({ key: "sms", value: smsForm })} disabled={saveSetting.isPending}><Save className="h-4 w-4 mr-2" />{saveSetting.isPending ? "Saving..." : "Save SMS Settings"}</Button>
          </Section>
        </TabsContent>

        {/* Network */}
        <TabsContent value="network">
          <Section title="Network Defaults" desc="Default network configuration applied to all new subscriptions">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Default DNS Primary"><Input value={networkForm.dns1 ?? "8.8.8.8"} onChange={(e) => setNetworkForm((f) => ({ ...f, dns1: e.target.value }))} /></Field>
              <Field label="Default DNS Secondary"><Input value={networkForm.dns2 ?? "8.8.4.4"} onChange={(e) => setNetworkForm((f) => ({ ...f, dns2: e.target.value }))} /></Field>
              <Field label="Session Timeout (minutes)"><Input type="number" value={networkForm.session_timeout ?? 60} onChange={(e) => setNetworkForm((f) => ({ ...f, session_timeout: Number(e.target.value) }))} /></Field>
              <Field label="Grace Period (days)"><Input type="number" value={networkForm.grace_period ?? 3} onChange={(e) => setNetworkForm((f) => ({ ...f, grace_period: Number(e.target.value) }))} /></Field>
              <Field label="Max Failed Logins"><Input type="number" value={networkForm.max_failed_logins ?? 5} onChange={(e) => setNetworkForm((f) => ({ ...f, max_failed_logins: Number(e.target.value) }))} /></Field>
              <Field label="Auto Suspend After (days overdue)"><Input type="number" value={networkForm.auto_suspend_days ?? 7} onChange={(e) => setNetworkForm((f) => ({ ...f, auto_suspend_days: Number(e.target.value) }))} /></Field>
            </div>
            <Button onClick={() => saveSetting.mutate({ key: "network", value: networkForm })} disabled={saveSetting.isPending}><Save className="h-4 w-4 mr-2" />{saveSetting.isPending ? "Saving..." : "Save Network Settings"}</Button>
          </Section>
        </TabsContent>

        {/* Notifications */}
        <TabsContent value="notifications">
          <Section title="Notification Triggers" desc="Configure automated SMS and email notifications">
            <div className="space-y-3">
              {[
                { key: "sms_payment_confirm", label: "SMS on payment confirmation" },
                { key: "sms_expiry_reminder", label: "SMS expiry reminder (3 days before)" },
                { key: "sms_suspension", label: "SMS on account suspension" },
                { key: "sms_activation", label: "SMS on account activation" },
                { key: "sms_otp", label: "SMS OTP for login" },
                { key: "email_invoice", label: "Email invoice to customer" },
                { key: "email_receipt", label: "Email payment receipt" },
                { key: "email_welcome", label: "Email welcome message" },
              ].map((n) => (
                <div key={n.key} className="flex items-center justify-between rounded-md border border-border/60 px-4 py-3">
                  <Label className="text-sm">{n.label}</Label>
                  <Switch checked={notifForm[n.key] ?? true} onCheckedChange={(v) => setNotifForm((f) => ({ ...f, [n.key]: v }))} />
                </div>
              ))}
            </div>
            <Button onClick={() => saveSetting.mutate({ key: "notifications", value: notifForm })} disabled={saveSetting.isPending}><Save className="h-4 w-4 mr-2" />{saveSetting.isPending ? "Saving..." : "Save Notifications"}</Button>
          </Section>
        </TabsContent>

        {/* Team */}
        <TabsContent value="team">
          <Section title="Team Members" desc="Users with access to this workspace" action={
            <Button size="sm" onClick={() => setInviteOpen(true)}><Plus className="h-4 w-4 mr-2" />Invite User</Button>
          }>
            {/* Mobile: card list */}
            <div className="sm:hidden space-y-2">
              {teamMembers.isLoading ? (
                <p className="text-sm text-muted-foreground py-4 text-center">Loading...</p>
              ) : teamMembers.data?.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No team members</p>
              ) : teamMembers.data?.map((m: any) => (
                <div key={m.id} className="rounded-lg border border-border/60 p-3 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm">{m.full_name ?? "—"}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs ${m.is_active ? "bg-green-500/15 text-green-600" : "bg-muted text-muted-foreground"}`}>{m.is_active ? "Active" : "Inactive"}</span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{m.email}</p>
                  <div className="flex flex-wrap gap-1">
                    {(teamRoles.data?.[m.id] ?? []).map((role: string) => (
                      <span key={role} className="rounded-full bg-primary/15 text-primary px-2 py-0.5 text-xs capitalize">{role.replace(/_/g, " ")}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            {/* Desktop: table */}
            <div className="hidden sm:block rounded-xl border border-border/60 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 text-left">Name</th>
                    <th className="px-4 py-3 text-left">Email</th>
                    <th className="px-4 py-3 text-left">Role</th>
                    <th className="px-4 py-3 text-left">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {teamMembers.isLoading ? (
                    <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">Loading...</td></tr>
                  ) : teamMembers.data?.length === 0 ? (
                    <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">No team members</td></tr>
                  ) : teamMembers.data?.map((m: any) => (
                    <tr key={m.id} className="border-t border-border/60">
                      <td className="px-4 py-3 font-medium">{m.full_name ?? "—"}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">{m.email}</td>
                      <td className="px-4 py-3">
                        {(teamRoles.data?.[m.id] ?? []).map((role: string) => (
                          <span key={role} className="rounded-full bg-primary/15 text-primary px-2 py-0.5 text-xs mr-1 capitalize">{role.replace(/_/g, " ")}</span>
                        ))}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-xs ${m.is_active ? "bg-green-500/15 text-green-600" : "bg-muted text-muted-foreground"}`}>{m.is_active ? "Active" : "Inactive"}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
          <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
            <DialogContent>
              <DialogHeader><DialogTitle>Invite Team Member</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <Field label="Email address"><Input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} /></Field>
                <Field label="Role">
                  <Select value={inviteRole} onValueChange={setInviteRole}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["isp_owner", "branch_manager", "network_engineer", "support_agent", "sales_agent", "accountant", "field_technician"].map((r) => (
                        <SelectItem key={r} value={r} className="capitalize">{r.replace(/_/g, " ")}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <p className="text-xs text-muted-foreground">The user will need to register with this email. Their role will be assigned automatically.</p>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setInviteOpen(false)}>Cancel</Button>
                <Button onClick={() => { toast.info("Invitation system requires email edge function. Configure SMTP in Supabase Auth settings."); setInviteOpen(false); }}>Send Invite</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>

        {/* Security */}
        <TabsContent value="security">
          <Section title="Security Settings" desc="Control authentication and access policies">
            <div className="space-y-3">
              {[
                { key: "require_mfa", label: "Require MFA for all admin users" },
                { key: "enforce_session_expiry", label: "Enforce session expiry (8 hours)" },
                { key: "ip_restriction", label: "IP address restrictions" },
                { key: "audit_logging", label: "Audit all user actions" },
                { key: "rate_limiting", label: "Enable rate limiting on API calls" },
              ].map((s) => (
                <div key={s.key} className="flex items-center justify-between rounded-md border border-border/60 px-4 py-3">
                  <Label className="text-sm">{s.label}</Label>
                  <Switch checked={securityForm[s.key] ?? false} onCheckedChange={(v) => setSecurityForm((f) => ({ ...f, [s.key]: v }))} />
                </div>
              ))}
            </div>
            <Button onClick={() => saveSetting.mutate({ key: "security", value: securityForm })} disabled={saveSetting.isPending}><Save className="h-4 w-4 mr-2" />{saveSetting.isPending ? "Saving..." : "Save Security Settings"}</Button>
          </Section>
        </TabsContent>

        {/* Outages */}
        <TabsContent value="outages">
          <OutagesTab tenantId={tenantId ?? null} />
        </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

function OutagesTab({ tenantId }: { tenantId: string | null }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", type: "outage", area: "", eta: "" });

  const outages = useQuery({
    queryKey: ["outages-settings", tenantId],
    queryFn: async () => {
      const { data } = await (supabase as any).from("outages").select("*").eq("tenant_id", tenantId!).order("created_at", { ascending: false }).limit(20);
      return data ?? [];
    },
    enabled: !!tenantId,
  });

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).from("outages").insert({
        ...form, tenant_id: tenantId, status: "active", eta: form.eta || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Outage notice posted");
      qc.invalidateQueries({ queryKey: ["outages-settings"] });
      qc.invalidateQueries({ queryKey: ["active-outages"] });
      setOpen(false);
      setForm({ title: "", description: "", type: "outage", area: "", eta: "" });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const resolve = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("outages").update({ status: "resolved", resolved_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Outage marked resolved");
      qc.invalidateQueries({ queryKey: ["outages-settings"] });
      qc.invalidateQueries({ queryKey: ["active-outages"] });
    },
  });

  return (
    <Section title="Service Outages" desc="Post outage and maintenance notices — shown as a banner across the dashboard" action={
      <Button size="sm" onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-2" />Post Notice</Button>
    }>
      <div className="space-y-2">
        {(outages.data ?? []).length === 0 && <p className="text-sm text-muted-foreground">No outage notices. All systems operational.</p>}
        {(outages.data ?? []).map((o: any) => (
          <div key={o.id} className={`flex items-start justify-between rounded-md border p-3 ${
            o.status === "active" ? "border-destructive/30 bg-destructive/5" : "border-border/60 opacity-60"
          }`}>
            <div className="space-y-0.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-sm">{o.title}</span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] capitalize ${
                  o.status === "active" ? "bg-destructive/15 text-destructive" : "bg-green-500/15 text-green-600"
                }`}>{o.status}</span>
                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] capitalize">{o.type}</span>
              </div>
              {o.area && <div className="text-xs text-muted-foreground">Area: {o.area}</div>}
              {o.eta && <div className="text-xs text-muted-foreground">ETA: {new Date(o.eta).toLocaleString()}</div>}
              {o.description && <div className="text-xs text-muted-foreground">{o.description}</div>}
            </div>
            {o.status === "active" && (
              <Button size="sm" variant="outline" onClick={() => resolve.mutate(o.id)} disabled={resolve.isPending} className="shrink-0 ml-3">Resolve</Button>
            )}
          </div>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Post Outage Notice</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <Field label="Title *">
              <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Network maintenance tonight" />
            </Field>
            <Field label="Type">
              <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="outage">Emergency Outage</SelectItem>
                  <SelectItem value="maintenance">Scheduled Maintenance</SelectItem>
                  <SelectItem value="degraded">Degraded Service</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Affected Area">
              <Input value={form.area} onChange={(e) => setForm((f) => ({ ...f, area: e.target.value }))} placeholder="e.g. Westlands, Kilimani" />
            </Field>
            <Field label="Estimated Restoration Time">
              <Input type="datetime-local" value={form.eta} onChange={(e) => setForm((f) => ({ ...f, eta: e.target.value }))} />
            </Field>
            <Field label="Description">
              <Textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={3} placeholder="What happened and what's being done..." />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => create.mutate()} disabled={!form.title || create.isPending}>Post Notice</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Section>
  );
}

function Section({ title, desc, children, action }: { title: string; desc: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card p-4 sm:p-6 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-semibold">{title}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
    </div>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <Label className="mb-1 block">{label}</Label>
      {children}
    </div>
  );
}
