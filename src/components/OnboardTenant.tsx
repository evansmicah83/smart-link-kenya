import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Building2, Loader2 } from "lucide-react";

function slugify(s: string) {
  return s.toLowerCase().trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 40);
}

export function OnboardTenant({ userId }: { userId: string }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const slug = `${slugify(name)}-${Math.random().toString(36).slice(2, 6)}`;
      // 1. create tenant
      const { data: tenant, error: tErr } = await supabase
        .from("tenants")
        .insert({ name, slug, contact_phone: phone })
        .select()
        .single();
      if (tErr) throw tErr;

      // 2. attach profile to tenant
      const { error: pErr } = await supabase
        .from("profiles")
        .update({ tenant_id: tenant.id, phone })
        .eq("id", userId);
      if (pErr) throw pErr;

      // 3. grant isp_owner role via security definer function
      const { error: rErr } = await supabase.rpc("assign_isp_owner" as any, {
        _user_id: userId,
        _tenant_id: tenant.id,
      });
      if (rErr) throw rErr;

      // 4. create default branch
      if (city) {
        await supabase.from("branches").insert({
          tenant_id: tenant.id,
          name: `${city} HQ`,
          city,
          code: "HQ",
        });
      }

      toast.success("Workspace ready");
      await qc.invalidateQueries({ queryKey: ["profile", userId] });
      await qc.refetchQueries({ queryKey: ["profile", userId] });
    } catch (err: any) {
      toast.error(err?.message ?? err?.details ?? "Failed to create workspace");
      console.error("Workspace creation error:", err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl">
      <div className="rounded-2xl border border-border/60 bg-card p-8">
        <div className="grid h-12 w-12 place-items-center rounded-lg bg-primary/15 text-primary">
          <Building2 className="h-5 w-5" />
        </div>
        <h1 className="mt-4 text-2xl font-semibold">Set up your ISP workspace</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          We'll create your tenant, make you the owner and seed your first branch.
        </p>

        <form onSubmit={handleCreate} className="mt-6 space-y-4">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">ISP / Company name</span>
            <input
              required value={name} onChange={(e) => setName(e.target.value)}
              placeholder="SwiftNet Limited"
              className="w-full rounded-md border border-input bg-background/50 px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">Contact phone</span>
              <input
                value={phone} onChange={(e) => setPhone(e.target.value)}
                placeholder="+254 712 345 678"
                className="w-full rounded-md border border-input bg-background/50 px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">Head office city</span>
              <input
                value={city} onChange={(e) => setCity(e.target.value)}
                placeholder="Nairobi"
                className="w-full rounded-md border border-input bg-background/50 px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </label>
          </div>
          <button
            disabled={loading || !name}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Create workspace
          </button>
        </form>
      </div>
    </div>
  );
}
