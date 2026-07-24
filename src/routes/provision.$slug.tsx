import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/provision/$slug")({
  component: ProvisionRoute,
});

function ProvisionRoute() {
  return (
    <div style={{ fontFamily: "Inter, sans-serif", padding: 24 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Provisioning script</h1>
      <p style={{ color: "#64748b" }}>This endpoint serves the RouterOS script for MikroTik provisioning.</p>
    </div>
  );
}
