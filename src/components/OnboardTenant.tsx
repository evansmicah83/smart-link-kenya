import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Building2, Loader2 } from "lucide-react";
import { SetupWizard } from "@/components/SetupWizard";

function slugify(s: string) {
  return s.toLowerCase().trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 40);
}

export function OnboardTenant({ userId }: { userId: string }) {
  return <SetupWizard userId={userId} onComplete={async ()=>{ window.location.reload(); }} />;
}
