/**
 * Portal Manager — ISP admin view to configure captive portal branding,
 * packages, and generate the portal URL for MikroTik / RADIUS.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenantId } from "@/lib/auth";
import { saveBranding } from "@/lib/branding";
import { toast } from "sonner";
import {
  Globe, Palette, Package, Link as LinkIcon, Copy, ExternalLink,
  Save, Eye, Wifi, Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/_authenticated/portal-manager/")({
  component: PortalManagerPage,
});

function PortalManagerPage() {
  const qc = useQueryClient();
  const { data: tenantId } = useTenantId();
  const [copied, setCopied] = useState(false);

  const tenant = useQuery({
    queryKey: ["tenant-detail", tenantId],
    queryFn: async () => {
      const { data } = await supabase.from("tenants").select("*").eq("id", tenantId!).single();
      return data;
    },
    enabled: !!tenantId,
  });

  const branding = useQuery({
    queryKey: ["tenant-branding", tenantId],
    queryFn: async () => {
      const { data } = await (supabase as any).from("tenant_branding").select("*").eq("tenant_id", tenantId!).maybeSingle();
      return data ?? {};
    },
    enabled: !!tenantId,
  });

  const packages = useQuery({
    queryKey: ["packages-portal", tenantId],
    queryFn: async () => {
      const { data } = await supabase.from("packages").select("*").eq("tenant_id", tenantId!).eq("is_active", true).order("price");
      return data ?? [];
    },
    enabled: !!tenantId,
  });

  const [form, setForm] = useState<Record<string, any>>({});
  const f = { ...(branding.data ?? {}), ...form };

  const saveB = useMutation({
    mutationFn: async () => saveBranding(tenantId!, { ...f, tenant_id: tenantId }),
    onSuccess: () => { toast.success("Portal branding saved"); qc.invalidateQueries({ queryKey: ["tenant-branding"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const portalUrl = `${window.location.origin}/portal?isp=${tenant.data?.slug ?? ""}`;

  // MikroTik redirect URL for hotspot login page
  const mikrotikRedirect = `http://$(dst-ip)/portal?isp=${tenant.data?.slug ?? ""}&mac=$(mac)&ip=$(ip)&url=$(link-orig)`;

  function copyUrl(text: string) {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const colorFields = [
    { key: "primary_color", label: "Primary Color", placeholder: "#0ea5e9", desc: "Main brand color — buttons, links" },
    { key: "secondary_color", label: "Secondary Color", placeholder: "#8b5cf6", desc: "Accent highlights" },
    { key: "accent_color", label: "Accent Color", placeholder: "#f59e0b", desc: "Badges, tags" },
    { key: "success_color", label: "Success Color", placeholder: "#22c55e", desc: "Positive states" },
    { key: "warning_color", label: "Warning Color", placeholder: "#f59e0b", desc: "Warnings" },
    { key: "error_color", label: "Error Color", placeholder: "#ef4444", desc: "Error states" },
  ];

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Captive Portal</h1>
          <p className="text-sm text-muted-foreground">Configure your WiFi login portal for MikroTik, hotel, school, apartment, and event WiFi.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild>
            <a href={portalUrl} target="_blank" rel="noopener noreferrer">
              <Eye className="h-4 w-4 mr-2" />Preview
            </a>
          </Button>
          <Button onClick={() => saveB.mutate()} disabled={saveB.isPending}>
            <Save className="h-4 w-4 mr-2" />Save
          </Button>
        </div>
      </div>

      <Tabs defaultValue="portal-url">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="portal-url"><LinkIcon className="h-3.5 w-3.5 mr-1.5" />Portal URL</TabsTrigger>
          <TabsTrigger value="branding"><Palette className="h-3.5 w-3.5 mr-1.5" />Branding</TabsTrigger>
          <TabsTrigger value="content"><Globe className="h-3.5 w-3.5 mr-1.5" />Content</TabsTrigger>
          <TabsTrigger value="packages"><Package className="h-3.5 w-3.5 mr-1.5" />Packages</TabsTrigger>
        </TabsList>

        {/* Portal URL + MikroTik config */}
        <TabsContent value="portal-url" className="space-y-4 mt-4">
          <Card title="Your Portal URL" desc="Share this URL or embed it in your router configuration">
            <div className="flex gap-2">
              <Input readOnly value={portalUrl} className="font-mono text-xs" />
              <Button variant="outline" size="sm" onClick={() => copyUrl(portalUrl)}>
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
              <Button variant="outline" size="sm" asChild>
                <a href={portalUrl} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-4 w-4" /></a>
              </Button>
            </div>
          </Card>

          <Card title="MikroTik Hotspot Setup" desc="Use this redirect URL in your MikroTik hotspot profile → Login Page">
            <div className="space-y-3">
              <Label className="text-xs font-medium text-muted-foreground">Hotspot Login Page Redirect URL</Label>
              <div className="flex gap-2">
                <Input readOnly value={mikrotikRedirect} className="font-mono text-xs" />
                <Button variant="outline" size="sm" onClick={() => copyUrl(mikrotikRedirect)}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground space-y-1">
                <p className="font-medium text-foreground">MikroTik Configuration Steps:</p>
                <ol className="list-decimal list-inside space-y-1">
                  <li>Go to <span className="font-mono">IP → Hotspot → Server Profiles</span></li>
                  <li>Set <span className="font-mono">Login Page</span> to the URL above</li>
                  <li>Enable <span className="font-mono">Use RADIUS</span> or use built-in auth</li>
                  <li>Set <span className="font-mono">Walled Garden</span> to allow your portal domain</li>
                </ol>
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="rounded-lg border border-border/60 p-3">
                  <div className="font-medium mb-1">RADIUS Setup</div>
                  <p className="text-muted-foreground">Point RADIUS auth to your Supabase edge function endpoint for automated session management.</p>
                </div>
                <div className="rounded-lg border border-border/60 p-3">
                  <div className="font-medium mb-1">Walled Garden</div>
                  <p className="text-muted-foreground">Allow: <span className="font-mono">{window.location.hostname}</span>, safaricom.com, mpesa.safaricom.co.ke</p>
                </div>
              </div>
            </div>
          </Card>

          <Card title="Portal QR Code" desc="Print this QR code at your hotspot location">
            <div className="flex items-center gap-6">
              <div className="grid h-24 w-24 place-items-center rounded-xl border-2 border-dashed border-border bg-muted/30">
                <Wifi className="h-8 w-8 text-muted-foreground" />
              </div>
              <div className="text-sm text-muted-foreground">
                <p>QR code generation requires a QR library.</p>
                <p className="mt-1">Use <a href={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(portalUrl)}`} className="text-primary hover:underline" target="_blank">this free QR service</a> with your portal URL.</p>
              </div>
            </div>
          </Card>
        </TabsContent>

        {/* Branding */}
        <TabsContent value="branding" className="space-y-4 mt-4">
          <Card title="Logo & Favicon" desc="Upload your ISP logo and browser favicon">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label className="mb-1.5 block">Logo URL</Label>
                <Input value={f.logo_url ?? ""} onChange={(e) => setForm((p) => ({ ...p, logo_url: e.target.value }))} placeholder="https://..." />
                {f.logo_url && <img src={f.logo_url} alt="logo preview" className="mt-2 h-10 w-auto object-contain rounded border border-border/60 bg-muted p-1" />}
              </div>
              <div>
                <Label className="mb-1.5 block">Favicon URL</Label>
                <Input value={f.favicon_url ?? ""} onChange={(e) => setForm((p) => ({ ...p, favicon_url: e.target.value }))} placeholder="https://..." />
              </div>
            </div>
          </Card>

          <Card title="Brand Colors" desc="Set your ISP's color palette — applied across the entire platform">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {colorFields.map((cf) => (
                <div key={cf.key}>
                  <Label className="mb-1 block">{cf.label}</Label>
                  <div className="flex gap-2 items-center">
                    <input
                      type="color"
                      value={f[cf.key] ?? cf.placeholder}
                      onChange={(e) => setForm((p) => ({ ...p, [cf.key]: e.target.value }))}
                      className="h-9 w-12 rounded border border-input cursor-pointer bg-transparent"
                    />
                    <Input
                      value={f[cf.key] ?? ""}
                      onChange={(e) => setForm((p) => ({ ...p, [cf.key]: e.target.value }))}
                      placeholder={cf.placeholder}
                      className="font-mono text-xs"
                    />
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{cf.desc}</p>
                </div>
              ))}
            </div>
          </Card>

          <Card title="Typography & Custom CSS" desc="Advanced styling overrides">
            <div>
              <Label className="mb-1.5 block">Custom CSS overrides (injected into the platform)</Label>
              <Textarea
                value={f.css_overrides ?? ""}
                onChange={(e) => setForm((p) => ({ ...p, css_overrides: e.target.value }))}
                placeholder="/* Custom CSS */\n:root { --radius: 0.5rem; }"
                rows={5}
                className="font-mono text-xs"
              />
            </div>
          </Card>
        </TabsContent>

        {/* Content */}
        <TabsContent value="content" className="space-y-4 mt-4">
          <Card title="Portal Content" desc="Text shown to customers on the captive portal">
            <div className="space-y-4">
              <div>
                <Label className="mb-1.5 block">Portal Tagline</Label>
                <Input value={f.portal_tagline ?? ""} onChange={(e) => setForm((p) => ({ ...p, portal_tagline: e.target.value }))} placeholder="Fast, Reliable Internet — Powered by..." />
              </div>
              <div>
                <Label className="mb-1.5 block">Welcome Message</Label>
                <Textarea value={f.welcome_message ?? ""} onChange={(e) => setForm((p) => ({ ...p, welcome_message: e.target.value }))} rows={3} placeholder="Welcome! Select a package to get started." />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label className="mb-1.5 block">Support Phone</Label>
                  <Input value={f.support_phone ?? ""} onChange={(e) => setForm((p) => ({ ...p, support_phone: e.target.value }))} placeholder="0712345678" />
                </div>
                <div>
                  <Label className="mb-1.5 block">Support Email</Label>
                  <Input value={f.support_email ?? ""} onChange={(e) => setForm((p) => ({ ...p, support_email: e.target.value }))} placeholder="support@yourisp.co.ke" />
                </div>
              </div>
              <div>
                <Label className="mb-1.5 block">SMS Sender ID</Label>
                <Input value={f.sms_sender_id ?? ""} onChange={(e) => setForm((p) => ({ ...p, sms_sender_id: e.target.value }))} placeholder="SMARTNET" maxLength={11} />
                <p className="text-xs text-muted-foreground mt-0.5">Max 11 characters. Used as SMS sender name.</p>
              </div>
              <div>
                <Label className="mb-1.5 block">Invoice Header</Label>
                <Textarea value={f.invoice_header ?? ""} onChange={(e) => setForm((p) => ({ ...p, invoice_header: e.target.value }))} rows={2} placeholder="Your ISP Ltd | P.O Box 123, Nairobi | support@yourisp.co.ke" />
              </div>
              <div>
                <Label className="mb-1.5 block">Invoice Footer</Label>
                <Textarea value={f.invoice_footer ?? ""} onChange={(e) => setForm((p) => ({ ...p, invoice_footer: e.target.value }))} rows={2} placeholder="Thank you for choosing us. Terms apply." />
              </div>
            </div>
          </Card>
        </TabsContent>

        {/* Packages visible on portal */}
        <TabsContent value="packages" className="mt-4">
          <Card title="Packages on Portal" desc="These packages appear on your captive portal for customers to purchase">
            <div className="space-y-2">
              {packages.isLoading && <p className="text-sm text-muted-foreground">Loading...</p>}
              {(packages.data ?? []).length === 0 && !packages.isLoading && (
                <p className="text-sm text-muted-foreground">No active packages. <a href="/packages" className="text-primary hover:underline">Add packages →</a></p>
              )}
              {(packages.data ?? []).map((pkg: any) => (
                <div key={pkg.id} className="flex items-center justify-between rounded-xl border border-border/60 bg-card px-4 py-3">
                  <div>
                    <div className="font-medium text-sm">{pkg.name}</div>
                    <div className="text-xs text-muted-foreground">{pkg.duration_days}d · {pkg.speed_limit ?? "Shared"} · {pkg.type}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-primary">KES {Number(pkg.price).toLocaleString()}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs ${pkg.is_active ? "bg-green-500/15 text-green-600" : "bg-muted text-muted-foreground"}`}>{pkg.is_active ? "Active" : "Inactive"}</span>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-2">Manage packages from the <a href="/packages" className="text-primary hover:underline">Plans page →</a></p>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Card({ title, desc, children }: { title: string; desc: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card p-5 space-y-4">
      <div>
        <h3 className="font-semibold">{title}</h3>
        <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
      </div>
      {children}
    </div>
  );
}
