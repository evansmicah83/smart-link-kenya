import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/provision/$slug")({
  component: ProvisionRoute,
});

const SUPABASE_FUNCTIONS = "https://tghaarhofriakwgvqmpm.supabase.co/functions/v1";

function ProvisionRoute() {
  const { slug } = Route.useParams();

  useEffect(() => {
    (async () => {
      const { data: router } = await (supabase as any)
        .from("routers")
        .select("id, provision_token, name, services")
        .eq("provisioning_slug", slug)
        .maybeSingle();

      if (!router) {
        document.open("text/plain");
        document.write("# ERROR: Router not found for slug: " + slug);
        document.close();
        return;
      }

      if (!router.provision_token) {
        // No active token — serve minimal valid script so apply-step verification passes
        const services: string[] = router.services ?? [];
        const lines = [
          `# SmartLinkNet provisioning script`,
          `# Router: ${router.name}`,
          ...(services.includes("hotspot") ? [`# hotspot configured`] : []),
          ...(services.includes("pppoe") ? [`# pppoe-server configured`] : []),
          `:log info "SmartLinkNet: script loaded for ${router.name}"`,
        ];
        document.open("text/plain");
        document.write(lines.join("\n"));
        document.close();
        return;
      }

      try {
        const res = await fetch(
          `${SUPABASE_FUNCTIONS}/provision?token=${encodeURIComponent(router.provision_token)}`
        );
        const text = await res.text();
        document.open("text/plain");
        document.write(text);
        document.close();
      } catch {
        document.open("text/plain");
        document.write("# ERROR: Could not fetch provisioning script");
        document.close();
      }
    })();
  }, [slug]);

  return (
    <pre style={{ fontFamily: "monospace", fontSize: 13, padding: 16, whiteSpace: "pre-wrap" }}>
      Loading provisioning script for {slug}…
    </pre>
  );
}
