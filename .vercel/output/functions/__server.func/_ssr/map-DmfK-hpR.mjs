import { i as __toESM } from "../_runtime.mjs";
import { a as supabase, i as init_client } from "./client-D3kKP_Nv.mjs";
import { u as require_react } from "../_libs/@floating-ui/react-dom+[...].mjs";
import { s as require_jsx_runtime } from "../_libs/@radix-ui/react-arrow+[...].mjs";
import { n as useQuery } from "../_libs/tanstack__react-query.mjs";
import { a as useTenantId, i as useAuth } from "./auth-z02iFWqz.mjs";
import { i as Wifi, q as MapPin, s as Users } from "../_libs/lucide-react.mjs";
import "./router-DPXhYMhC.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/map-DmfK-hpR.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
init_client();
function MapPage() {
	const { user } = useAuth();
	const mapRef = (0, import_react.useRef)(null);
	const mapInstance = (0, import_react.useRef)(null);
	const { data: tenantId } = useTenantId();
	const customers = useQuery({
		queryKey: ["map-customers", tenantId],
		queryFn: async () => {
			const { data } = await supabase.from("customers").select("id, full_name, city, county, gps_lat, gps_lng, status").eq("tenant_id", tenantId).not("gps_lat", "is", null);
			return data ?? [];
		},
		enabled: !!tenantId
	});
	const routers = useQuery({
		queryKey: ["map-routers", tenantId],
		queryFn: async () => {
			const { data } = await supabase.from("routers").select("id, name, gps_lat, gps_lng, status").eq("tenant_id", tenantId).not("gps_lat", "is", null);
			return data ?? [];
		},
		enabled: !!tenantId
	});
	(0, import_react.useEffect)(() => {
		if (!mapRef.current) return;
		if (mapInstance.current) {
			mapInstance.current.remove();
			mapInstance.current = null;
		}
		import("../_libs/leaflet.mjs").then((n) => /* @__PURE__ */ __toESM(n.t())).then((L) => {
			if (!mapRef.current) return;
			if (mapRef.current._leaflet_id) return;
			const map = L.map(mapRef.current).setView([-1.2921, 36.8219], 12);
			L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap contributors" }).addTo(map);
			mapInstance.current = map;
			if (customers.data) customers.data.forEach((c) => {
				if (c.gps_lat && c.gps_lng) L.circleMarker([c.gps_lat, c.gps_lng], {
					radius: 6,
					fillColor: c.status === "active" ? "#22c55e" : "#f59e0b",
					color: "#fff",
					weight: 1,
					fillOpacity: .8
				}).addTo(map).bindPopup(`<b>${c.full_name}</b><br>${c.city ?? ""}`);
			});
			if (routers.data) routers.data.forEach((r) => {
				if (r.gps_lat && r.gps_lng) L.circleMarker([r.gps_lat, r.gps_lng], {
					radius: 10,
					fillColor: r.status === "online" ? "#3b82f6" : "#ef4444",
					color: "#fff",
					weight: 2,
					fillOpacity: .9
				}).addTo(map).bindPopup(`<b>📡 ${r.name}</b><br>Status: ${r.status}`);
			});
		});
		return () => {
			if (mapInstance.current) {
				mapInstance.current.remove();
				mapInstance.current = null;
			}
		};
	}, [customers.data, routers.data]);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "space-y-4 h-full",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex items-center justify-between",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
					className: "text-2xl font-semibold",
					children: "Coverage Map"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "text-sm text-muted-foreground",
					children: "Customer and router locations"
				})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex gap-4 text-xs",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex items-center gap-1",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "h-3 w-3 rounded-full bg-green-500 inline-block" }), "Active Customers"]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex items-center gap-1",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "h-3 w-3 rounded-full bg-yellow-500 inline-block" }), "Inactive"]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex items-center gap-1",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "h-3 w-3 rounded-full bg-blue-500 inline-block" }), "Online Router"]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex items-center gap-1",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "h-3 w-3 rounded-full bg-red-500 inline-block" }), "Offline Router"]
						})
					]
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "grid grid-cols-3 gap-4",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "rounded-xl border border-border/60 bg-card p-4",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex items-center gap-2 text-xs text-muted-foreground mb-1",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Users, { className: "h-3 w-3" }), "Mapped Customers"]
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "text-2xl font-bold",
							children: customers.data?.length ?? 0
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "rounded-xl border border-border/60 bg-card p-4",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex items-center gap-2 text-xs text-muted-foreground mb-1",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Wifi, { className: "h-3 w-3" }), "Mapped Routers"]
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "text-2xl font-bold",
							children: routers.data?.length ?? 0
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "rounded-xl border border-border/60 bg-card p-4",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex items-center gap-2 text-xs text-muted-foreground mb-1",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(MapPin, { className: "h-3 w-3" }), "Coverage Areas"]
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "text-2xl font-bold",
							children: "—"
						})]
					})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "rounded-xl border border-border/60 overflow-hidden",
				style: { height: "500px" },
				children: typeof window !== "undefined" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					ref: mapRef,
					style: {
						height: "100%",
						width: "100%"
					}
				}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "flex items-center justify-center h-full text-muted-foreground",
					children: "Loading map..."
				})
			}),
			customers.data?.length === 0 && routers.data?.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-xs text-center text-muted-foreground",
				children: "Add GPS coordinates to customers and routers to see them on the map."
			})
		]
	});
}
//#endregion
export { MapPage as component };
