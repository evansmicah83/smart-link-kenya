import { i as __toESM } from "../_runtime.mjs";
import { a as supabase, i as init_client } from "./client-D3kKP_Nv.mjs";
import { u as require_react } from "../_libs/@floating-ui/react-dom+[...].mjs";
import { s as require_jsx_runtime } from "../_libs/@radix-ui/react-arrow+[...].mjs";
import { i as useQueryClient } from "../_libs/tanstack__react-query.mjs";
import { Ot as Building2, X as LoaderCircle } from "../_libs/lucide-react.mjs";
import { n as toast } from "../_libs/sonner.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/OnboardTenant-D5S-QYO4.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
init_client();
function slugify(s) {
	return s.toLowerCase().trim().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").slice(0, 40);
}
function OnboardTenant({ userId }) {
	const qc = useQueryClient();
	const [name, setName] = (0, import_react.useState)("");
	const [phone, setPhone] = (0, import_react.useState)("");
	const [city, setCity] = (0, import_react.useState)("");
	const [loading, setLoading] = (0, import_react.useState)(false);
	async function handleCreate(e) {
		e.preventDefault();
		setLoading(true);
		try {
			const slug = `${slugify(name)}-${Math.random().toString(36).slice(2, 6)}`;
			const { data: tenant, error: tErr } = await supabase.from("tenants").insert({
				name,
				slug,
				contact_phone: phone
			}).select().single();
			if (tErr) throw tErr;
			const { error: pErr } = await supabase.from("profiles").update({
				tenant_id: tenant.id,
				phone
			}).eq("id", userId);
			if (pErr) throw pErr;
			const { error: rErr } = await supabase.rpc("assign_isp_owner", {
				_user_id: userId,
				_tenant_id: tenant.id
			});
			if (rErr) throw rErr;
			if (city) await supabase.from("branches").insert({
				tenant_id: tenant.id,
				name: `${city} HQ`,
				city,
				code: "HQ"
			});
			toast.success("Workspace ready");
			await qc.invalidateQueries({ queryKey: ["profile", userId] });
			await qc.refetchQueries({ queryKey: ["profile", userId] });
		} catch (err) {
			toast.error(err?.message ?? err?.details ?? "Failed to create workspace");
			console.error("Workspace creation error:", err);
		} finally {
			setLoading(false);
		}
	}
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "mx-auto max-w-xl",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "rounded-2xl border border-border/60 bg-card p-8",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "grid h-12 w-12 place-items-center rounded-lg bg-primary/15 text-primary",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Building2, { className: "h-5 w-5" })
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
					className: "mt-4 text-2xl font-semibold",
					children: "Set up your ISP workspace"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-1 text-sm text-muted-foreground",
					children: "We'll create your tenant, make you the owner and seed your first branch."
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("form", {
					onSubmit: handleCreate,
					className: "mt-6 space-y-4",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
							className: "block",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "mb-1 block text-xs font-medium text-muted-foreground",
								children: "ISP / Company name"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
								required: true,
								value: name,
								onChange: (e) => setName(e.target.value),
								placeholder: "SwiftNet Limited",
								className: "w-full rounded-md border border-input bg-background/50 px-3 py-2 text-sm outline-none focus:border-primary"
							})]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "grid gap-4 sm:grid-cols-2",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
								className: "block",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "mb-1 block text-xs font-medium text-muted-foreground",
									children: "Contact phone"
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
									value: phone,
									onChange: (e) => setPhone(e.target.value),
									placeholder: "+254 712 345 678",
									className: "w-full rounded-md border border-input bg-background/50 px-3 py-2 text-sm outline-none focus:border-primary"
								})]
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
								className: "block",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "mb-1 block text-xs font-medium text-muted-foreground",
									children: "Head office city"
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
									value: city,
									onChange: (e) => setCity(e.target.value),
									placeholder: "Nairobi",
									className: "w-full rounded-md border border-input bg-background/50 px-3 py-2 text-sm outline-none focus:border-primary"
								})]
							})]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
							disabled: loading || !name,
							className: "mt-2 flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50",
							children: [loading && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(LoaderCircle, { className: "h-4 w-4 animate-spin" }), "Create workspace"]
						})
					]
				})
			]
		})
	});
}
//#endregion
export { OnboardTenant as t };
