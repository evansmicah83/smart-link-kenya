import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function SetupWizard({ userId, onComplete }: { userId: string; onComplete: () => void }) {
  const [step, setStep] = useState(1);
  const [businessName, setBusinessName] = useState("");
  const [businessType, setBusinessType] = useState("ISP");
  const [country, setCountry] = useState("KE");
  const [currency, setCurrency] = useState("KES");
  const [timezone, setTimezone] = useState("Africa/Nairobi");
  const [kraPin, setKraPin] = useState("");
  const [regNo, setRegNo] = useState("");

  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [primaryColor, setPrimaryColor] = useState("#1e3a8a");
  const [accentColor, setAccentColor] = useState("#0ea5e9");
  const [theme, setTheme] = useState<"dark"|"light">("dark");

  const [businessEmail, setBusinessEmail] = useState("");
  const [supportEmail, setSupportEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [website, setWebsite] = useState("");
  const [address, setAddress] = useState("");

  // Step 4 — Payment
  const [mpesaShortcode, setMpesaShortcode] = useState("");
  const [mpesaPasskey, setMpesaPasskey] = useState("");
  const [mpesaCallback, setMpesaCallback] = useState("/api/mpesa-callback");

  // Step 5 — Communications
  const [smsProvider, setSmsProvider] = useState("africastalking");
  const [smsApiKey, setSmsApiKey] = useState("");
  const [emailProvider, setEmailProvider] = useState("smtp");
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpUser, setSmtpUser] = useState("");

  // Step 6 — Network type
  const [networkTypes, setNetworkTypes] = useState<{[k:string]:boolean}>({ hotspot:true, pppoe:false, fiber:false, apartment:false });

  // Step 7 — Routers
  const [routerName, setRouterName] = useState("");
  const [routerIp, setRouterIp] = useState("");
  const [routerPort, setRouterPort] = useState(8728);
  const [routerUser, setRouterUser] = useState("");
  const [routerPass, setRouterPass] = useState("");

  // Step 8 — Branches
  const [branchName, setBranchName] = useState("");

  // Step 9 — Packages (collect simple list)
  const [packages, setPackages] = useState<{name:string, price:number}[]>([{name:"10 Mbps Home", price:4900}]);

  // Step 10 — Staff invites
  const [inviteEmails, setInviteEmails] = useState("");

  const [loading, setLoading] = useState(false);

  async function currentTenantId(userId: string) {
    const { data, error } = await supabase.from('profiles').select('tenant_id').eq('id', userId).maybeSingle();
    if (error) throw error;
    return data?.tenant_id;
  }

  async function saveStep1() {
    if (!businessName) return toast.error("Business name required");
    setLoading(true);
    try {
      const slug = `${businessName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Math.random().toString(36).slice(2,6)}`;
      const { data, error } = await supabase.from("tenants").insert({ name: businessName, slug, country, currency, timezone }).select().single();
      if (error) throw error;
      if (regNo || kraPin) {
        await supabase.from("profiles").update({ kra_pin: kraPin || null }).eq("id", userId);
      }
      await supabase.from("profiles").update({ tenant_id: data.id }).eq("id", userId);
      toast.success("Saved business info");
      setStep(2);
    } catch (err: any) { toast.error(err.message || "Failed to save business info"); }
    finally { setLoading(false); }
  }

  async function saveStep2() {
    setLoading(true);
    try {
      const tid = await currentTenantId(userId);
      if (!tid) throw new Error("No tenant found");
      if (logoFile) {
        const key = `tenant-logos/${tid}/${Date.now()}-${logoFile.name}`;
        const res = await supabase.storage.from("assets").upload(key, logoFile as any, { upsert: true });
        if (res.error) throw res.error;
        const { data } = await supabase.storage.from("assets").getPublicUrl(key);
        await supabase.from("tenants").update({ logo_url: data.publicUrl, primary_color: primaryColor, accent_color: accentColor, theme }).eq("id", tid);
      } else {
        await supabase.from("tenants").update({ primary_color: primaryColor, accent_color: accentColor, theme }).eq("id", tid);
      }
      toast.success("Branding saved");
      setStep(3);
    } catch (err:any) { toast.error(err.message || "Failed to save branding"); }
    finally { setLoading(false); }
  }

  async function saveStep3() {
    setLoading(true);
    try {
      const tid = await currentTenantId(userId);
      if (!tid) throw new Error("No tenant found");
      await supabase.from("tenants").update({ contact_email: businessEmail, support_email: supportEmail, contact_phone: phone, whatsapp: whatsapp, website, address }).eq("id", tid);
      toast.success("Contact info saved");
      setStep(4);
    } catch (err:any) { toast.error(err.message || "Failed to save contact info"); }
    finally { setLoading(false); }
  }

  async function saveStep4() {
    setLoading(true);
    try {
      const tid = await currentTenantId(userId);
      if (!tid) throw new Error("No tenant found");
      // store mpesa config in settings table
      const cfg = { provider: 'mpesa', shortcode: mpesaShortcode, passkey: mpesaPasskey, callback: mpesaCallback };
      await upsertSetting(tid, 'payments', cfg);
      toast.success('Payment config saved');
      setStep(5);
    } catch (err:any) { toast.error(err.message || 'Failed to save payment config'); }
    finally { setLoading(false); }
  }

  async function saveStep5() {
    setLoading(true);
    try {
      const tid = await currentTenantId(userId);
      if (!tid) throw new Error('No tenant found');
      const comms = { sms: { provider: smsProvider, api_key: smsApiKey }, email: { provider: emailProvider, smtp: { host: smtpHost, user: smtpUser } } };
      await upsertSetting(tid, 'communications', comms);
      toast.success('Communication settings saved');
      setStep(6);
    } catch (err:any) { toast.error(err.message || 'Failed to save communications'); }
    finally { setLoading(false); }
  }

  async function saveStep6() {
    setLoading(true);
    try {
      const tid = await currentTenantId(userId);
      if (!tid) throw new Error('No tenant found');
      await upsertSetting(tid, 'network_types', networkTypes);
      toast.success('Network types saved');
      setStep(7);
    } catch (err:any) { toast.error(err.message || 'Failed to save network types'); }
    finally { setLoading(false); }
  }

  async function saveStep7() {
    setLoading(true);
    try {
      const tid = await currentTenantId(userId);
      if (!tid) throw new Error('No tenant found');
      await supabase.from('routers').insert({ tenant_id: tid, name: routerName, address: routerIp, api_port: routerPort, username: routerUser, password: routerPass });
      toast.success('Router added');
      setStep(8);
    } catch (err:any) { toast.error(err.message || 'Failed to add router'); }
    finally { setLoading(false); }
  }

  async function saveStep8() {
    setLoading(true);
    try {
      const tid = await currentTenantId(userId);
      if (!tid) throw new Error('No tenant found');
      await supabase.from('branches').insert({ tenant_id: tid, name: branchName });
      toast.success('Branch created');
      setStep(9);
    } catch (err:any) { toast.error(err.message || 'Failed to create branch'); }
    finally { setLoading(false); }
  }

  async function saveStep9() {
    setLoading(true);
    try {
      const tid = await currentTenantId(userId);
      if (!tid) throw new Error('No tenant found');
      for (const p of packages) {
        await supabase.from('packages').insert({ tenant_id: tid, name: p.name, price: p.price });
      }
      toast.success('Packages created');
      setStep(10);
    } catch (err:any) { toast.error(err.message || 'Failed to create packages'); }
    finally { setLoading(false); }
  }

  async function saveStep10() {
    setLoading(true);
    try {
      const tid = await currentTenantId(userId);
      if (!tid) throw new Error('No tenant found');
      // Store pending invites in settings for later processing by admin job
      const invites = inviteEmails.split(/,|\n/).map(s=>s.trim()).filter(Boolean);
      await upsertSetting(tid, 'pending_staff_invites', invites);
      toast.success('Staff invites saved');
      // finish
      onComplete();
    } catch (err:any) { toast.error(err.message || 'Failed to save invites'); }
    finally { setLoading(false); }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="rounded-2xl border border-border/60 bg-card p-6 portal-glass card-hover animate__animated animate__fadeIn"> 
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Setup Wizard</h2>
          <div className="text-sm text-muted-foreground">Step {step} of 10</div>
        </div>
        {step === 1 && (
          <form onSubmit={(e)=>{ e.preventDefault(); saveStep1(); }} className="space-y-4">
            <label className="block"><span className="text-xs text-muted-foreground">Business / ISP name</span>
              <input value={businessName} onChange={(e)=>setBusinessName(e.target.value)} className="w-full rounded-md border px-3 py-2" /></label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block"><span className="text-xs text-muted-foreground">Business type</span>
                <input value={businessType} onChange={(e)=>setBusinessType(e.target.value)} className="w-full rounded-md border px-3 py-2" /></label>
              <label className="block"><span className="text-xs text-muted-foreground">Country / Timezone</span>
                <div className="flex gap-2"><input value={country} onChange={(e)=>setCountry(e.target.value)} className="rounded-md border px-3 py-2" /><input value={timezone} onChange={(e)=>setTimezone(e.target.value)} className="rounded-md border px-3 py-2" /></div></label>
            </div>
            <div className="flex justify-end"><button className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground">Save & Continue</button></div>
          </form>
        )}
      </div>
    </div>
  );
}
