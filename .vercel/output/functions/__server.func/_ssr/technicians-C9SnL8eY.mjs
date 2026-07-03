import { i as __toESM } from "../_runtime.mjs";
import { a as supabase, i as init_client } from "./client-D3kKP_Nv.mjs";
import { u as require_react } from "../_libs/@floating-ui/react-dom+[...].mjs";
import { s as require_jsx_runtime } from "../_libs/@radix-ui/react-arrow+[...].mjs";
import { i as useQueryClient, n as useQuery } from "../_libs/tanstack__react-query.mjs";
import { a as useTenantId, i as useAuth } from "./auth-z02iFWqz.mjs";
import { R as Phone, r as Wrench } from "../_libs/lucide-react.mjs";
import { a as objectType, i as literalType, o as stringType, t as booleanType } from "../_libs/zod.mjs";
import { n as useForm, t as u } from "../_libs/@hookform/resolvers+[...].mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/technicians-C9SnL8eY.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
init_client();
var schema = objectType({
	full_name: stringType().min(2),
	email: stringType().email().optional().or(literalType("")),
	phone: stringType().min(9),
	national_id: stringType().optional(),
	role: stringType().min(1).default("field_technician"),
	is_active: booleanType().default(true)
});
function TechniciansPage() {
	const { user } = useAuth();
	useQueryClient();
	const { data: tenantId } = useTenantId();
	const [open, setOpen] = (0, import_react.useState)(false);
	const [editing, setEditing] = (0, import_react.useState)(null);
	const technicians = useQuery({
		queryKey: ["technicians", tenantId],
		queryFn: async () => {
			const { data, error } = await supabase.rpc("fn_get_tenant_technicians", { _tenant_id: tenantId });
			if (error) throw error;
			return data ?? [];
		},
		enabled: !!tenantId
	});
	const jobs = useQuery({
		queryKey: ["tech-jobs", tenantId],
		queryFn: async () => {
			const { data } = await supabase.from("installations").select("assigned_to, status").eq("tenant_id", tenantId).neq("status", "cancelled");
			return data ?? [];
		},
		enabled: !!tenantId
	});
	const { register, handleSubmit, reset, setValue } = useForm({ resolver: u(schema) });
	const stats = {
		total: technicians.data?.length ?? 0,
		active: technicians.data?.filter((t) => t.is_active).length ?? 0
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "space-y-6",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "flex items-center justify-between",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
					className: "text-2xl font-semibold",
					children: "Field Technicians"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "text-sm text-muted-foreground",
					children: "Manage field technicians and job assignments"
				})] })
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "grid grid-cols-2 gap-4",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "rounded-xl border border-border/60 bg-card p-4",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "text-xs text-muted-foreground uppercase",
						children: "Total Technicians"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "text-2xl font-bold mt-1",
						children: stats.total
					})]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "rounded-xl border border-border/60 bg-card p-4",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "text-xs text-muted-foreground uppercase",
						children: "Active"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "text-2xl font-bold mt-1 text-green-500",
						children: stats.active
					})]
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "grid gap-4 md:grid-cols-2 lg:grid-cols-3",
				children: technicians.isLoading ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "col-span-3 text-center py-12 text-muted-foreground",
					children: "Loading..."
				}) : technicians.data?.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "col-span-3 rounded-xl border border-border/60 bg-card p-8 text-center text-muted-foreground",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Wrench, { className: "h-8 w-8 mx-auto mb-3 opacity-30" }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "No field technicians yet." }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "text-xs mt-1",
							children: "Invite users and assign the field_technician role from the admin panel."
						})
					]
				}) : technicians.data?.map((tech) => {
					const pending = (jobs.data?.filter((j) => j.assigned_to === tech.id) ?? []).filter((j) => [
						"pending",
						"scheduled",
						"in_progress"
					].includes(j.status)).length;
					return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "rounded-xl border border-border/60 bg-card p-5",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "flex items-start justify-between mb-3",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
									className: "font-semibold",
									children: tech.full_name
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
									className: "text-xs text-muted-foreground",
									children: tech.email
								})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: `text-xs rounded-full px-2 py-0.5 ${tech.is_active ? "bg-green-500/15 text-green-600" : "bg-muted text-muted-foreground"}`,
									children: tech.is_active ? "Active" : "Inactive"
								})]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "space-y-1 text-xs text-muted-foreground",
								children: tech.phone && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "flex items-center gap-1",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Phone, { className: "h-3 w-3" }), tech.phone]
								})
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "mt-3 pt-3 border-t border-border/60 flex items-center justify-between text-xs",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "text-muted-foreground",
									children: "Active jobs"
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: `font-semibold ${pending > 0 ? "text-primary" : "text-muted-foreground"}`,
									children: pending
								})]
							})
						]
					}, tech.id);
				})
			})
		]
	});
}
//#endregion
export { TechniciansPage as component };
