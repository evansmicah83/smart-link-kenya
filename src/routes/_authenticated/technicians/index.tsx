import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useTenantId } from "@/lib/auth";
import { toast } from "sonner";
import { Plus, Wrench, MapPin, Phone, Edit, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

export const Route = createFileRoute("/_authenticated/technicians/")({
  component: TechniciansPage,
});

const schema = z.object({
  full_name: z.string().min(2),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().min(9),
  national_id: z.string().optional(),
  role: z.string().min(1).default("field_technician"),
  is_active: z.boolean().default(true),
});

type FormData = z.infer<typeof schema>;

function TechniciansPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: tenantId } = useTenantId();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);

  const technicians = useQuery({
    queryKey: ["technicians", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .rpc("fn_get_tenant_technicians", { _tenant_id: tenantId! } as any);
      if (error) throw error;
      return (data ?? []) as any[];
    },
    enabled: !!tenantId,
  });

  const jobs = useQuery({
    queryKey: ["tech-jobs", tenantId],
    queryFn: async () => {
      const { data } = await supabase
        .from("installations")
        .select("assigned_to, status")
        .eq("tenant_id", tenantId!)
        .neq("status", "cancelled");
      return data ?? [];
    },
    enabled: !!tenantId,
  });

  const { register, handleSubmit, reset, setValue } = useForm<FormData>({ resolver: zodResolver(schema) as any });

  const stats = {
    total: technicians.data?.length ?? 0,
    active: technicians.data?.filter((t) => t.is_active).length ?? 0,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Field Technicians</h1>
          <p className="text-sm text-muted-foreground">Manage field technicians and job assignments</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-xl border border-border/60 bg-card p-4">
          <div className="text-xs text-muted-foreground uppercase">Total Technicians</div>
          <div className="text-2xl font-bold mt-1">{stats.total}</div>
        </div>
        <div className="rounded-xl border border-border/60 bg-card p-4">
          <div className="text-xs text-muted-foreground uppercase">Active</div>
          <div className="text-2xl font-bold mt-1 text-green-500">{stats.active}</div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {technicians.isLoading ? (
          <div className="col-span-3 text-center py-12 text-muted-foreground">Loading...</div>
        ) : technicians.data?.length === 0 ? (
          <div className="col-span-3 rounded-xl border border-border/60 bg-card p-8 text-center text-muted-foreground">
            <Wrench className="h-8 w-8 mx-auto mb-3 opacity-30" />
            <p>No field technicians yet.</p>
            <p className="text-xs mt-1">Invite users and assign the field_technician role from the admin panel.</p>
          </div>
        ) : technicians.data?.map((tech) => {
          const techJobs = jobs.data?.filter((j) => j.assigned_to === tech.id) ?? [];
          const pending = techJobs.filter((j) => ["pending", "scheduled", "in_progress"].includes(j.status)).length;
          return (
            <div key={tech.id} className="rounded-xl border border-border/60 bg-card p-5">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="font-semibold">{tech.full_name}</div>
                  <div className="text-xs text-muted-foreground">{tech.email}</div>
                </div>
                <span className={`text-xs rounded-full px-2 py-0.5 ${tech.is_active ? "bg-green-500/15 text-green-600" : "bg-muted text-muted-foreground"}`}>
                  {tech.is_active ? "Active" : "Inactive"}
                </span>
              </div>
              <div className="space-y-1 text-xs text-muted-foreground">
                {tech.phone && <div className="flex items-center gap-1"><Phone className="h-3 w-3" />{tech.phone}</div>}
              </div>
              <div className="mt-3 pt-3 border-t border-border/60 flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Active jobs</span>
                <span className={`font-semibold ${pending > 0 ? "text-primary" : "text-muted-foreground"}`}>{pending}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
