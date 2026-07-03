import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth, fetchProfile, fetchMyRoles } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import {
  UserCircle2, Mail, Phone, Building2, ShieldCheck,
  KeyRound, Save, Loader2, CheckCircle, Eye, EyeOff,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/my-account/")({
  component: MyAccountPage,
});

function MyAccountPage() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const profile = useQuery({
    queryKey: ["profile", user?.id],
    queryFn: () => (user ? fetchProfile(user.id) : Promise.resolve(null)),
    enabled: !!user,
  });

  const roles = useQuery({
    queryKey: ["roles", user?.id],
    queryFn: () => (user ? fetchMyRoles(user.id) : Promise.resolve([])),
    enabled: !!user,
  });

  const tenant = useQuery({
    queryKey: ["tenant", profile.data?.tenant_id],
    queryFn: async () => {
      const tid = profile.data?.tenant_id;
      if (!tid) return null;
      const { data } = await supabase.from("tenants").select("id,name,slug,plan,status").eq("id", tid).maybeSingle();
      return data;
    },
    enabled: !!profile.data?.tenant_id,
  });

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [profileReady, setProfileReady] = useState(false);

  // Populate form once profile loads
  if (profile.data && !profileReady) {
    setFullName(profile.data.full_name ?? "");
    setPhone(profile.data.phone ?? "");
    setProfileReady(true);
  }

  const updateProfile = useMutation({
    mutationFn: async () => {
      if (!user) return;
      const { error } = await supabase
        .from("profiles")
        .update({ full_name: fullName, phone })
        .eq("id", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["profile", user?.id] });
      toast.success("Profile updated");
    },
    onError: () => toast.error("Failed to update profile"),
  });

  // Password change
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [showPw, setShowPw] = useState(false);

  const changePassword = useMutation({
    mutationFn: async () => {
      if (newPw !== confirmPw) throw new Error("Passwords do not match");
      if (newPw.length < 8) throw new Error("Password must be at least 8 characters");
      const { error } = await supabase.auth.updateUser({ password: newPw });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Password changed successfully");
      setCurrentPw(""); setNewPw(""); setConfirmPw("");
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to change password"),
  });

  const roleLabels: Record<string, string> = {
    super_admin: "Super Admin", isp_owner: "ISP Owner", branch_manager: "Branch Manager",
    network_engineer: "Network Engineer", support_agent: "Support Agent",
    accountant: "Accountant", field_technician: "Field Technician",
    sales_agent: "Sales Agent", customer: "Customer",
  };

  const userRoles = roles.data ?? [];
  const primaryRole = userRoles[0] ? (roleLabels[userRoles[0]] ?? userRoles[0]) : "Member";
  const name = profile.data?.full_name ?? user?.email ?? "Account";
  const initials = (name || "?").split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase();

  if (profile.isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6 py-2">
      {/* Header card */}
      <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-card p-6 shadow-sm">
        <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse at top left, oklch(0.72 0.16 215 / 0.07), transparent 60%)" }} />
        <div className="relative flex items-center gap-4">
          <div className="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-primary/20 text-primary font-bold text-xl ring-2 ring-primary/30">
            {initials}
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">{name}</h1>
            <p className="text-sm text-muted-foreground">{user?.email}</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {userRoles.map((r) => (
                <span key={r} className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-primary">
                  {r === "super_admin" && <ShieldCheck className="h-2.5 w-2.5" />}
                  {roleLabels[r] ?? r}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Workspace info */}
      {tenant.data && (
        <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm">
          <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground mb-3">
            <Building2 className="h-3.5 w-3.5" /> Workspace
          </div>
          <div className="flex items-center justify-between">
            <div>
              <div className="font-semibold">{tenant.data.name}</div>
              <div className="text-sm text-muted-foreground">{tenant.data.slug}</div>
            </div>
            <div className="text-right">
              <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-primary">
                {tenant.data.plan}
              </span>
              <div className={`mt-1 text-xs ${tenant.data.status === "active" ? "text-emerald-500" : "text-amber-500"}`}>
                {tenant.data.status}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Profile form */}
      <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm space-y-4">
        <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
          <UserCircle2 className="h-3.5 w-3.5" /> Profile Information
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Full Name</label>
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              placeholder="Your full name"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Phone</label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full rounded-lg border border-border bg-background pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                placeholder="+254 7XX XXX XXX"
              />
            </div>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <label className="text-xs font-medium text-muted-foreground">Email</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                value={user?.email ?? ""}
                disabled
                className="w-full rounded-lg border border-border bg-muted/40 pl-9 pr-3 py-2 text-sm text-muted-foreground cursor-not-allowed"
              />
            </div>
            <p className="text-[11px] text-muted-foreground">Email is managed by your authentication provider.</p>
          </div>
        </div>

        <button
          onClick={() => updateProfile.mutate()}
          disabled={updateProfile.isPending}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-60"
        >
          {updateProfile.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save Changes
        </button>
      </div>

      {/* Password change */}
      <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm space-y-4">
        <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
          <KeyRound className="h-3.5 w-3.5" /> Change Password
        </div>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">New Password</label>
            <div className="relative">
              <input
                type={showPw ? "text" : "password"}
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                placeholder="Min. 8 characters"
              />
              <button type="button" onClick={() => setShowPw((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Confirm New Password</label>
            <input
              type={showPw ? "text" : "password"}
              value={confirmPw}
              onChange={(e) => setConfirmPw(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              placeholder="Repeat new password"
            />
          </div>
          {confirmPw && newPw !== confirmPw && (
            <p className="text-xs text-destructive">Passwords do not match</p>
          )}
        </div>

        <button
          onClick={() => changePassword.mutate()}
          disabled={changePassword.isPending || !newPw || newPw !== confirmPw}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-60"
        >
          {changePassword.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
          Update Password
        </button>
      </div>

      {/* Account meta */}
      <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm">
        <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground mb-3">
          Account Details
        </div>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">User ID</span>
            <span className="font-mono text-xs">{user?.id?.slice(0, 16)}…</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Member since</span>
            <span>{user?.created_at ? new Date(user.created_at).toLocaleDateString("en-KE", { dateStyle: "medium" }) : "—"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Last sign in</span>
            <span>{user?.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleString("en-KE", { dateStyle: "medium", timeStyle: "short" }) : "—"}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
