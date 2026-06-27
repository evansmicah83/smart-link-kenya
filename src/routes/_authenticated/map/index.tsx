import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useTenantId } from "@/lib/auth";
import { MapPin, Wifi, Users } from "lucide-react";
import "leaflet/dist/leaflet.css";

export const Route = createFileRoute("/_authenticated/map/")({
  component: MapPage,
});

function MapPage() {
  const { user } = useAuth();
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);

  const { data: tenantId } = useTenantId();

  const customers = useQuery({
    queryKey: ["map-customers", tenantId],
    queryFn: async () => {
      const { data } = await supabase
        .from("customers")
        .select("id, full_name, city, county, gps_lat, gps_lng, status")
        .eq("tenant_id", tenantId!)
        .not("gps_lat", "is", null);
      return data ?? [];
    },
    enabled: !!tenantId,
  });

  const routers = useQuery({
    queryKey: ["map-routers", tenantId],
    queryFn: async () => {
      const { data } = await supabase
        .from("routers")
        .select("id, name, gps_lat, gps_lng, status")
        .eq("tenant_id", tenantId!)
        .not("gps_lat", "is", null);
      return data ?? [];
    },
    enabled: !!tenantId,
  });

  useEffect(() => {
    if (!mapRef.current) return;
    if (mapInstance.current) {
      mapInstance.current.remove();
      mapInstance.current = null;
    }
    import("leaflet").then((L) => {
      if (!mapRef.current) return;
      if ((mapRef.current as any)._leaflet_id) return;
      const map = L.map(mapRef.current).setView([-1.2921, 36.8219], 12);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap contributors",
      }).addTo(map);
      mapInstance.current = map;

      if (customers.data) {
        customers.data.forEach((c) => {
          if (c.gps_lat && c.gps_lng) {
            L.circleMarker([c.gps_lat, c.gps_lng], {
              radius: 6,
              fillColor: c.status === "active" ? "#22c55e" : "#f59e0b",
              color: "#fff",
              weight: 1,
              fillOpacity: 0.8,
            }).addTo(map).bindPopup(`<b>${c.full_name}</b><br>${c.city ?? ""}`);
          }
        });
      }

      if (routers.data) {
        routers.data.forEach((r) => {
          if (r.gps_lat && r.gps_lng) {
            L.circleMarker([r.gps_lat, r.gps_lng], {
              radius: 10,
              fillColor: r.status === "online" ? "#3b82f6" : "#ef4444",
              color: "#fff",
              weight: 2,
              fillOpacity: 0.9,
            }).addTo(map).bindPopup(`<b>📡 ${r.name}</b><br>Status: ${r.status}`);
          }
        });
      }
    });
    return () => {
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }
    };
  }, [customers.data, routers.data]);

  return (
    <div className="space-y-4 h-full">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Coverage Map</h1>
          <p className="text-sm text-muted-foreground">Customer and router locations</p>
        </div>
        <div className="flex gap-4 text-xs">
          <div className="flex items-center gap-1"><span className="h-3 w-3 rounded-full bg-green-500 inline-block" />Active Customers</div>
          <div className="flex items-center gap-1"><span className="h-3 w-3 rounded-full bg-yellow-500 inline-block" />Inactive</div>
          <div className="flex items-center gap-1"><span className="h-3 w-3 rounded-full bg-blue-500 inline-block" />Online Router</div>
          <div className="flex items-center gap-1"><span className="h-3 w-3 rounded-full bg-red-500 inline-block" />Offline Router</div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border border-border/60 bg-card p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1"><Users className="h-3 w-3" />Mapped Customers</div>
          <div className="text-2xl font-bold">{customers.data?.length ?? 0}</div>
        </div>
        <div className="rounded-xl border border-border/60 bg-card p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1"><Wifi className="h-3 w-3" />Mapped Routers</div>
          <div className="text-2xl font-bold">{routers.data?.length ?? 0}</div>
        </div>
        <div className="rounded-xl border border-border/60 bg-card p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1"><MapPin className="h-3 w-3" />Coverage Areas</div>
          <div className="text-2xl font-bold">—</div>
        </div>
      </div>

      <div className="rounded-xl border border-border/60 overflow-hidden" style={{ height: "500px" }}>
        {typeof window !== "undefined" ? (
          <div ref={mapRef} style={{ height: "100%", width: "100%" }} />
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground">Loading map...</div>
        )}
      </div>

      {(customers.data?.length === 0 && routers.data?.length === 0) && (
        <p className="text-xs text-center text-muted-foreground">
          Add GPS coordinates to customers and routers to see them on the map.
        </p>
      )}
    </div>
  );
}
