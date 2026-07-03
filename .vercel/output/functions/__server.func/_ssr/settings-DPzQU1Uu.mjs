import { i as __toESM } from "../_runtime.mjs";
import { a as supabase, i as init_client } from "./client-D3kKP_Nv.mjs";
import { u as require_react } from "../_libs/@floating-ui/react-dom+[...].mjs";
import { s as require_jsx_runtime } from "../_libs/@radix-ui/react-arrow+[...].mjs";
import { i as useQueryClient, n as useQuery, t as useMutation } from "../_libs/tanstack__react-query.mjs";
import { a as useTenantId, i as useAuth } from "./auth-z02iFWqz.mjs";
import { t as Button } from "./button-DRsC1qZi.mjs";
import { t as Input } from "./input-DicJzR9-.mjs";
import { t as Label } from "./label-B4PTMSG2.mjs";
import { At as Bell, B as Palette, C as Shield, I as Plus, Ot as Building2, at as EyeOff, dt as CreditCard, i as Wifi, it as Eye, k as Save, m as Trash2, s as Users, tt as Globe } from "../_libs/lucide-react.mjs";
import { a as DialogTitle, i as DialogHeader, n as DialogContent, r as DialogFooter, t as Dialog } from "./dialog-BpdftUtE.mjs";
import { a as SelectValue, i as SelectTrigger, n as SelectContent, r as SelectItem, t as Select } from "./select-DUy71i1r.mjs";
import { i as TabsTrigger, n as TabsContent, r as TabsList, t as Tabs } from "./tabs-WTjz7Ps0.mjs";
import { n as toast } from "../_libs/sonner.mjs";
import { t as Switch } from "./switch-CCza_WcE.mjs";
import { t as Textarea } from "./textarea-DBn9CRiI.mjs";
import { n as saveBranding } from "./branding-Bl6WKHXJ.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/settings-DPzQU1Uu.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
init_client();
function SettingsPage() {
	const { user } = useAuth();
	const qc = useQueryClient();
	const tenantId = useTenantId().data;
	const [showSecrets, setShowSecrets] = (0, import_react.useState)(false);
	const [inviteOpen, setInviteOpen] = (0, import_react.useState)(false);
	const [inviteEmail, setInviteEmail] = (0, import_react.useState)("");
	const [inviteRole, setInviteRole] = (0, import_react.useState)("support_agent");
	const [brandForm, setBrandForm] = (0, import_react.useState)({});
	const brandingQuery = useQuery({
		queryKey: ["tenant-branding", tenantId],
		queryFn: async () => {
			const { data } = await supabase.from("tenant_branding").select("*").eq("tenant_id", tenantId).maybeSingle();
			return data ?? {};
		},
		enabled: !!tenantId
	});
	const tenant = useQuery({
		queryKey: ["tenant-detail", tenantId],
		queryFn: async () => {
			const { data } = await supabase.from("tenants").select("*").eq("id", tenantId).single();
			return data;
		},
		enabled: !!tenantId
	});
	const settings = useQuery({
		queryKey: ["settings", tenantId],
		queryFn: async () => {
			const { data } = await supabase.from("settings").select("*").eq("tenant_id", tenantId);
			return Object.fromEntries((data ?? []).map((s) => [s.key, s.value]));
		},
		enabled: !!tenantId
	});
	const teamMembers = useQuery({
		queryKey: ["team", tenantId],
		queryFn: async () => {
			const { data } = await supabase.from("profiles").select("id, full_name, email, phone, is_active").eq("tenant_id", tenantId);
			return data ?? [];
		},
		enabled: !!tenantId
	});
	const teamRoles = useQuery({
		queryKey: ["team-roles", tenantId],
		queryFn: async () => {
			const { data } = await supabase.from("user_roles").select("user_id, role").in("user_id", (teamMembers.data ?? []).map((m) => m.id));
			const map = {};
			for (const r of data ?? []) (map[r.user_id] ??= []).push(r.role);
			return map;
		},
		enabled: (teamMembers.data?.length ?? 0) > 0
	});
	const branches = useQuery({
		queryKey: ["branches", tenantId],
		queryFn: async () => {
			const { data } = await supabase.from("branches").select("*").eq("tenant_id", tenantId).order("name");
			return data ?? [];
		},
		enabled: !!tenantId
	});
	const [tenantForm, setTenantForm] = (0, import_react.useState)({});
	const [mpesaForm, setMpesaForm] = (0, import_react.useState)(settings.data?.mpesa ?? {});
	const [smsForm, setSmsForm] = (0, import_react.useState)(settings.data?.sms ?? {});
	const [networkForm, setNetworkForm] = (0, import_react.useState)(settings.data?.network ?? {});
	const [notifForm, setNotifForm] = (0, import_react.useState)(settings.data?.notifications ?? {});
	const [securityForm, setSecurityForm] = (0, import_react.useState)(settings.data?.security ?? {});
	const [branchForm, setBranchForm] = (0, import_react.useState)({
		name: "",
		city: "",
		code: "",
		phone: "",
		address: ""
	});
	const [branchOpen, setBranchOpen] = (0, import_react.useState)(false);
	const [deleteBranchId, setDeleteBranchId] = (0, import_react.useState)(null);
	const saveBrand = useMutation({
		mutationFn: async () => {
			await saveBranding(tenantId, {
				...brandingQuery.data ?? {},
				...brandForm
			});
		},
		onSuccess: () => {
			toast.success("Branding saved");
			qc.invalidateQueries({ queryKey: ["tenant-branding"] });
		},
		onError: (e) => toast.error(e.message)
	});
	const bf = {
		...brandingQuery.data ?? {},
		...brandForm
	};
	const saveTenant = useMutation({
		mutationFn: async () => {
			const { error } = await supabase.from("tenants").update(tenantForm).eq("id", tenantId);
			if (error) throw error;
		},
		onSuccess: () => {
			toast.success("Saved");
			qc.invalidateQueries({ queryKey: ["tenant-detail"] });
		},
		onError: (e) => toast.error(e.message)
	});
	const saveSetting = useMutation({
		mutationFn: async ({ key, value }) => {
			const { error } = await supabase.from("settings").upsert({
				tenant_id: tenantId,
				key,
				value
			}, { onConflict: "tenant_id,key" });
			if (error) throw error;
		},
		onSuccess: () => {
			toast.success("Saved");
			qc.invalidateQueries({ queryKey: ["settings"] });
		},
		onError: (e) => toast.error(e.message)
	});
	const addBranch = useMutation({
		mutationFn: async () => {
			const { error } = await supabase.from("branches").insert({
				...branchForm,
				tenant_id: tenantId
			});
			if (error) throw error;
		},
		onSuccess: () => {
			toast.success("Branch added");
			qc.invalidateQueries({ queryKey: ["branches"] });
			setBranchOpen(false);
			setBranchForm({
				name: "",
				city: "",
				code: "",
				phone: "",
				address: ""
			});
		},
		onError: (e) => toast.error(e.message)
	});
	const deleteBranch = useMutation({
		mutationFn: async (id) => {
			const { error } = await supabase.from("branches").delete().eq("id", id);
			if (error) throw error;
		},
		onSuccess: () => {
			toast.success("Branch removed");
			qc.invalidateQueries({ queryKey: ["branches"] });
		},
		onError: (e) => toast.error(e.message)
	});
	const t = {
		...tenant.data ?? {},
		...tenantForm
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "space-y-6 w-full max-w-6xl px-2 sm:px-0",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
			className: "text-xl sm:text-2xl font-bold tracking-tight",
			children: "Settings"
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
			className: "text-sm text-muted-foreground mt-1",
			children: "Configure your SmartLinkNet workspace"
		})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Tabs, {
			defaultValue: "general",
			className: "flex flex-col md:flex-row gap-6",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TabsList, {
				className: "grid grid-cols-2 md:grid md:grid-cols-1 h-auto w-full md:w-52 shrink-0 bg-muted/50 p-1.5 rounded-xl gap-1",
				children: [
					{
						value: "general",
						icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Building2, { className: "h-4 w-4" }),
						label: "General"
					},
					{
						value: "branding",
						icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Palette, { className: "h-4 w-4" }),
						label: "Branding"
					},
					{
						value: "branches",
						icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Building2, { className: "h-4 w-4" }),
						label: "Branches"
					},
					{
						value: "mpesa",
						icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CreditCard, { className: "h-4 w-4" }),
						label: "M-Pesa"
					},
					{
						value: "sms",
						icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Bell, { className: "h-4 w-4" }),
						label: "SMS"
					},
					{
						value: "network",
						icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Wifi, { className: "h-4 w-4" }),
						label: "Network"
					},
					{
						value: "notifications",
						icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Bell, { className: "h-4 w-4" }),
						label: "Notifications"
					},
					{
						value: "team",
						icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Users, { className: "h-4 w-4" }),
						label: "Team"
					},
					{
						value: "security",
						icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Shield, { className: "h-4 w-4" }),
						label: "Security"
					},
					{
						value: "outages",
						icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Globe, { className: "h-4 w-4" }),
						label: "Outages"
					}
				].map(({ value, icon, label }) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(TabsTrigger, {
					value,
					className: "w-full justify-start gap-2 px-3 py-2 text-sm",
					children: [icon, /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: label })]
				}, value))
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex-1 min-w-0",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TabsContent, {
						value: "branding",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Section, {
							title: "Brand Identity",
							desc: "Logo, colors, and portal customization applied across the entire platform",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "grid grid-cols-1 sm:grid-cols-2 gap-4",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Field, {
										label: "Logo URL (link to your logo image)",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
											value: bf.logo_url ?? "",
											onChange: (e) => setBrandForm((f) => ({
												...f,
												logo_url: e.target.value
											})),
											placeholder: "https://..."
										}), bf.logo_url && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
											src: bf.logo_url,
											alt: "logo",
											className: "mt-2 h-10 w-auto object-contain rounded border border-border/60 bg-muted p-1"
										})]
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
										label: "Favicon URL",
										children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
											value: bf.favicon_url ?? "",
											onChange: (e) => setBrandForm((f) => ({
												...f,
												favicon_url: e.target.value
											})),
											placeholder: "https://..."
										})
									})]
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
									className: "grid grid-cols-2 sm:grid-cols-3 gap-4",
									children: [
										{
											key: "primary_color",
											label: "Primary",
											placeholder: "#0ea5e9"
										},
										{
											key: "secondary_color",
											label: "Secondary",
											placeholder: "#8b5cf6"
										},
										{
											key: "accent_color",
											label: "Accent",
											placeholder: "#f59e0b"
										},
										{
											key: "success_color",
											label: "Success",
											placeholder: "#22c55e"
										},
										{
											key: "warning_color",
											label: "Warning",
											placeholder: "#f59e0b"
										},
										{
											key: "error_color",
											label: "Error",
											placeholder: "#ef4444"
										}
									].map((c) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, {
										className: "mb-1 block text-xs",
										children: c.label
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "flex gap-2",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
											type: "color",
											value: bf[c.key] ?? c.placeholder,
											onChange: (e) => setBrandForm((f) => ({
												...f,
												[c.key]: e.target.value
											})),
											className: "h-9 w-11 cursor-pointer rounded border border-input bg-transparent"
										}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
											value: bf[c.key] ?? "",
											onChange: (e) => setBrandForm((f) => ({
												...f,
												[c.key]: e.target.value
											})),
											placeholder: c.placeholder,
											className: "font-mono text-xs"
										})]
									})] }, c.key))
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "grid grid-cols-1 sm:grid-cols-2 gap-4",
									children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
											label: "SMS Sender ID",
											children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
												value: bf.sms_sender_id ?? "",
												onChange: (e) => setBrandForm((f) => ({
													...f,
													sms_sender_id: e.target.value
												})),
												placeholder: "SMARTNET",
												maxLength: 11
											})
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
											label: "Support Phone",
											children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
												value: bf.support_phone ?? "",
												onChange: (e) => setBrandForm((f) => ({
													...f,
													support_phone: e.target.value
												}))
											})
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
											label: "Support Email",
											children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
												value: bf.support_email ?? "",
												onChange: (e) => setBrandForm((f) => ({
													...f,
													support_email: e.target.value
												}))
											})
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
											label: "Portal Tagline",
											children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
												value: bf.portal_tagline ?? "",
												onChange: (e) => setBrandForm((f) => ({
													...f,
													portal_tagline: e.target.value
												}))
											})
										})
									]
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
									label: "Invoice Header",
									children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Textarea, {
										value: bf.invoice_header ?? "",
										onChange: (e) => setBrandForm((f) => ({
											...f,
											invoice_header: e.target.value
										})),
										rows: 2
									})
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
									label: "Invoice Footer",
									children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Textarea, {
										value: bf.invoice_footer ?? "",
										onChange: (e) => setBrandForm((f) => ({
											...f,
											invoice_footer: e.target.value
										})),
										rows: 2
									})
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "grid grid-cols-1 sm:grid-cols-2 gap-4",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
										label: "Email From Name",
										children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
											value: bf.email_from_name ?? "",
											onChange: (e) => setBrandForm((f) => ({
												...f,
												email_from_name: e.target.value
											})),
											placeholder: "SmartLinkNet"
										})
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
										label: "Email From Address",
										children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
											value: bf.email_from_address ?? "",
											onChange: (e) => setBrandForm((f) => ({
												...f,
												email_from_address: e.target.value
											})),
											placeholder: "billing@yourisp.co.ke"
										})
									})]
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
									label: "Brand Theme JSON (light / dark / typography)",
									children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Textarea, {
										value: bf.brand_config ? JSON.stringify(bf.brand_config, null, 2) : "",
										onChange: (e) => {
											try {
												setBrandForm((f) => ({
													...f,
													brand_config: e.target.value ? JSON.parse(e.target.value) : {}
												}));
											} catch {
												setBrandForm((f) => ({
													...f,
													brand_config: e.target.value
												}));
											}
										},
										rows: 6,
										className: "font-mono text-xs",
										placeholder: "{\"light_theme_colors\":{\"primary\":\"#0f172a\"},\"dark_theme_colors\":{\"background\":\"#020617\"},\"typography\":{\"font_family\":\"Inter, sans-serif\"}}"
									})
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
									label: "Custom CSS Overrides",
									children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Textarea, {
										value: bf.css_overrides ?? "",
										onChange: (e) => setBrandForm((f) => ({
											...f,
											css_overrides: e.target.value
										})),
										rows: 4,
										className: "font-mono text-xs",
										placeholder: "/* optional */"
									})
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
									onClick: () => saveBrand.mutate(),
									disabled: saveBrand.isPending,
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Save, { className: "h-4 w-4 mr-2" }), saveBrand.isPending ? "Saving…" : "Save Branding"]
								})
							]
						})
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TabsContent, {
						value: "general",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Section, {
							title: "Company Information",
							desc: "Your ISP branding and contact details",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "grid grid-cols-1 sm:grid-cols-2 gap-4",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
										label: "Company Name",
										children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
											value: t.name ?? "",
											onChange: (e) => setTenantForm((f) => ({
												...f,
												name: e.target.value
											}))
										})
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
										label: "Slug",
										children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
											value: t.slug ?? "",
											onChange: (e) => setTenantForm((f) => ({
												...f,
												slug: e.target.value
											}))
										})
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
										label: "Contact Email",
										children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
											type: "email",
											value: t.contact_email ?? "",
											onChange: (e) => setTenantForm((f) => ({
												...f,
												contact_email: e.target.value
											}))
										})
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
										label: "Contact Phone",
										children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
											value: t.contact_phone ?? "",
											onChange: (e) => setTenantForm((f) => ({
												...f,
												contact_phone: e.target.value
											}))
										})
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
										label: "Country",
										children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
											value: t.country ?? "KE",
											onChange: (e) => setTenantForm((f) => ({
												...f,
												country: e.target.value
											}))
										})
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
										label: "Currency",
										children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
											value: t.currency ?? "KES",
											onChange: (e) => setTenantForm((f) => ({
												...f,
												currency: e.target.value
											}))
										})
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
										label: "Timezone",
										children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
											value: t.timezone ?? "Africa/Nairobi",
											onChange: (e) => setTenantForm((f) => ({
												...f,
												timezone: e.target.value
											}))
										})
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
										label: "Primary Color (hex)",
										children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
											value: t.primary_color ?? "",
											onChange: (e) => setTenantForm((f) => ({
												...f,
												primary_color: e.target.value
											})),
											placeholder: "#3B82F6"
										})
									})
								]
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
								onClick: () => saveTenant.mutate(),
								disabled: saveTenant.isPending,
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Save, { className: "h-4 w-4 mr-2" }), saveTenant.isPending ? "Saving..." : "Save Changes"]
							})]
						})
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(TabsContent, {
						value: "branches",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Section, {
								title: "Branches",
								desc: "Manage your office and service locations",
								action: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
									size: "sm",
									onClick: () => setBranchOpen(true),
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Plus, { className: "h-4 w-4 mr-2" }), "Add Branch"]
								}),
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "space-y-2",
									children: [branches.data?.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
										className: "text-sm text-muted-foreground",
										children: "No branches yet."
									}), branches.data?.map((b) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "flex items-center justify-between rounded-md border border-border/60 p-3",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
											className: "font-medium",
											children: [
												b.name,
												" ",
												/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
													className: "text-xs text-muted-foreground",
													children: [
														"(",
														b.code,
														")"
													]
												})
											]
										}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
											className: "text-xs text-muted-foreground",
											children: [
												b.city ?? "",
												" · ",
												b.phone ?? ""
											]
										})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
											onClick: () => setDeleteBranchId(b.id),
											className: "text-muted-foreground hover:text-destructive",
											children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Trash2, { className: "h-4 w-4" })
										})]
									}, b.id))]
								})
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Dialog, {
								open: !!deleteBranchId,
								onOpenChange: (o) => {
									if (!o) setDeleteBranchId(null);
								},
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DialogContent, {
									className: "max-w-sm",
									children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(DialogHeader, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DialogTitle, { children: "Remove Branch" }) }),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
											className: "text-sm text-muted-foreground",
											children: "Are you sure you want to remove this branch? This action cannot be undone."
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DialogFooter, {
											className: "gap-2",
											children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
												variant: "outline",
												onClick: () => setDeleteBranchId(null),
												children: "Cancel"
											}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
												variant: "destructive",
												onClick: () => {
													deleteBranch.mutate(deleteBranchId);
													setDeleteBranchId(null);
												},
												disabled: deleteBranch.isPending,
												children: "Remove"
											})]
										})
									]
								})
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Dialog, {
								open: branchOpen,
								onOpenChange: setBranchOpen,
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DialogContent, { children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(DialogHeader, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DialogTitle, { children: "Add Branch" }) }),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "grid grid-cols-1 sm:grid-cols-2 gap-4",
										children: [
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
												label: "Branch Name *",
												children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
													value: branchForm.name,
													onChange: (e) => setBranchForm((f) => ({
														...f,
														name: e.target.value
													}))
												})
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
												label: "Code",
												children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
													value: branchForm.code,
													onChange: (e) => setBranchForm((f) => ({
														...f,
														code: e.target.value.toUpperCase()
													})),
													placeholder: "HQ"
												})
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
												label: "City",
												children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
													value: branchForm.city,
													onChange: (e) => setBranchForm((f) => ({
														...f,
														city: e.target.value
													}))
												})
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
												label: "Phone",
												children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
													value: branchForm.phone,
													onChange: (e) => setBranchForm((f) => ({
														...f,
														phone: e.target.value
													}))
												})
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
												label: "Address",
												className: "sm:col-span-2",
												children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
													value: branchForm.address,
													onChange: (e) => setBranchForm((f) => ({
														...f,
														address: e.target.value
													}))
												})
											})
										]
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DialogFooter, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
										variant: "outline",
										onClick: () => setBranchOpen(false),
										children: "Cancel"
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
										onClick: () => addBranch.mutate(),
										disabled: !branchForm.name || addBranch.isPending,
										children: "Add Branch"
									})] })
								] })
							})
						]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TabsContent, {
						value: "mpesa",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Section, {
							title: "M-Pesa Daraja API",
							desc: "Safaricom Daraja integration for STK Push and payment callbacks",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "grid grid-cols-1 sm:grid-cols-2 gap-4",
									children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
											label: "Consumer Key",
											children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
												type: showSecrets ? "text" : "password",
												value: mpesaForm.consumer_key ?? "",
												onChange: (e) => setMpesaForm((f) => ({
													...f,
													consumer_key: e.target.value
												}))
											})
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
											label: "Consumer Secret",
											children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
												type: showSecrets ? "text" : "password",
												value: mpesaForm.consumer_secret ?? "",
												onChange: (e) => setMpesaForm((f) => ({
													...f,
													consumer_secret: e.target.value
												}))
											})
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
											label: "Paybill / Till Shortcode",
											children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
												value: mpesaForm.shortcode ?? "",
												onChange: (e) => setMpesaForm((f) => ({
													...f,
													shortcode: e.target.value
												}))
											})
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
											label: "Passkey",
											children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
												type: showSecrets ? "text" : "password",
												value: mpesaForm.passkey ?? "",
												onChange: (e) => setMpesaForm((f) => ({
													...f,
													passkey: e.target.value
												}))
											})
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
											label: "Initiator Name",
											children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
												value: mpesaForm.initiator_name ?? "",
												onChange: (e) => setMpesaForm((f) => ({
													...f,
													initiator_name: e.target.value
												}))
											})
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
											label: "Security Credential",
											children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
												type: showSecrets ? "text" : "password",
												value: mpesaForm.security_credential ?? "",
												onChange: (e) => setMpesaForm((f) => ({
													...f,
													security_credential: e.target.value
												}))
											})
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
											label: "Callback URL",
											className: "sm:col-span-2",
											children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
												value: mpesaForm.callback_url ?? "",
												onChange: (e) => setMpesaForm((f) => ({
													...f,
													callback_url: e.target.value
												})),
												placeholder: "https://your-project.supabase.co/functions/v1/mpesa-callback"
											})
										})
									]
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "flex items-center gap-4",
									children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
											onClick: () => setShowSecrets((v) => !v),
											className: "flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground",
											children: [
												showSecrets ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(EyeOff, { className: "h-4 w-4" }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Eye, { className: "h-4 w-4" }),
												showSecrets ? "Hide" : "Show",
												" secrets"
											]
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Switch, {
											checked: mpesaForm.sandbox ?? true,
											onCheckedChange: (v) => setMpesaForm((f) => ({
												...f,
												sandbox: v
											}))
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Label, {
											className: "text-sm",
											children: ["Sandbox Mode ", mpesaForm.sandbox ? "(Testing)" : "(Production)"]
										})
									]
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
									onClick: () => saveSetting.mutate({
										key: "mpesa",
										value: mpesaForm
									}),
									disabled: saveSetting.isPending,
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Save, { className: "h-4 w-4 mr-2" }), saveSetting.isPending ? "Saving..." : "Save M-Pesa Settings"]
								})
							]
						})
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TabsContent, {
						value: "sms",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Section, {
							title: "SMS Configuration",
							desc: "Africa's Talking or Twilio for automated SMS notifications",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "grid grid-cols-1 sm:grid-cols-2 gap-4",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
										label: "Provider",
										children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Select, {
											value: smsForm.provider ?? "africastalking",
											onValueChange: (v) => setSmsForm((f) => ({
												...f,
												provider: v
											})),
											children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectTrigger, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectValue, {}) }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(SelectContent, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
												value: "africastalking",
												children: "Africa's Talking"
											}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
												value: "twilio",
												children: "Twilio"
											})] })]
										})
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
										label: "API Key",
										children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
											type: showSecrets ? "text" : "password",
											value: smsForm.api_key ?? "",
											onChange: (e) => setSmsForm((f) => ({
												...f,
												api_key: e.target.value
											}))
										})
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
										label: "Username / Account SID",
										children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
											value: smsForm.username ?? "",
											onChange: (e) => setSmsForm((f) => ({
												...f,
												username: e.target.value
											}))
										})
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
										label: "Sender ID / Phone Number",
										children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
											value: smsForm.sender_id ?? "",
											onChange: (e) => setSmsForm((f) => ({
												...f,
												sender_id: e.target.value
											})),
											placeholder: "e.g. SMARTNET"
										})
									})
								]
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
								onClick: () => saveSetting.mutate({
									key: "sms",
									value: smsForm
								}),
								disabled: saveSetting.isPending,
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Save, { className: "h-4 w-4 mr-2" }), saveSetting.isPending ? "Saving..." : "Save SMS Settings"]
							})]
						})
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TabsContent, {
						value: "network",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Section, {
							title: "Network Defaults",
							desc: "Default network configuration applied to all new subscriptions",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "grid grid-cols-1 sm:grid-cols-2 gap-4",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
										label: "Default DNS Primary",
										children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
											value: networkForm.dns1 ?? "8.8.8.8",
											onChange: (e) => setNetworkForm((f) => ({
												...f,
												dns1: e.target.value
											}))
										})
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
										label: "Default DNS Secondary",
										children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
											value: networkForm.dns2 ?? "8.8.4.4",
											onChange: (e) => setNetworkForm((f) => ({
												...f,
												dns2: e.target.value
											}))
										})
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
										label: "Session Timeout (minutes)",
										children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
											type: "number",
											value: networkForm.session_timeout ?? 60,
											onChange: (e) => setNetworkForm((f) => ({
												...f,
												session_timeout: Number(e.target.value)
											}))
										})
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
										label: "Grace Period (days)",
										children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
											type: "number",
											value: networkForm.grace_period ?? 3,
											onChange: (e) => setNetworkForm((f) => ({
												...f,
												grace_period: Number(e.target.value)
											}))
										})
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
										label: "Max Failed Logins",
										children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
											type: "number",
											value: networkForm.max_failed_logins ?? 5,
											onChange: (e) => setNetworkForm((f) => ({
												...f,
												max_failed_logins: Number(e.target.value)
											}))
										})
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
										label: "Auto Suspend After (days overdue)",
										children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
											type: "number",
											value: networkForm.auto_suspend_days ?? 7,
											onChange: (e) => setNetworkForm((f) => ({
												...f,
												auto_suspend_days: Number(e.target.value)
											}))
										})
									})
								]
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
								onClick: () => saveSetting.mutate({
									key: "network",
									value: networkForm
								}),
								disabled: saveSetting.isPending,
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Save, { className: "h-4 w-4 mr-2" }), saveSetting.isPending ? "Saving..." : "Save Network Settings"]
							})]
						})
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TabsContent, {
						value: "notifications",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Section, {
							title: "Notification Triggers",
							desc: "Configure automated SMS and email notifications",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "space-y-3",
								children: [
									{
										key: "sms_payment_confirm",
										label: "SMS on payment confirmation"
									},
									{
										key: "sms_expiry_reminder",
										label: "SMS expiry reminder (3 days before)"
									},
									{
										key: "sms_suspension",
										label: "SMS on account suspension"
									},
									{
										key: "sms_activation",
										label: "SMS on account activation"
									},
									{
										key: "sms_otp",
										label: "SMS OTP for login"
									},
									{
										key: "email_invoice",
										label: "Email invoice to customer"
									},
									{
										key: "email_receipt",
										label: "Email payment receipt"
									},
									{
										key: "email_welcome",
										label: "Email welcome message"
									}
								].map((n) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "flex items-center justify-between rounded-md border border-border/60 px-4 py-3",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, {
										className: "text-sm",
										children: n.label
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Switch, {
										checked: notifForm[n.key] ?? true,
										onCheckedChange: (v) => setNotifForm((f) => ({
											...f,
											[n.key]: v
										}))
									})]
								}, n.key))
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
								onClick: () => saveSetting.mutate({
									key: "notifications",
									value: notifForm
								}),
								disabled: saveSetting.isPending,
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Save, { className: "h-4 w-4 mr-2" }), saveSetting.isPending ? "Saving..." : "Save Notifications"]
							})]
						})
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(TabsContent, {
						value: "team",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Section, {
							title: "Team Members",
							desc: "Users with access to this workspace",
							action: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
								size: "sm",
								onClick: () => setInviteOpen(true),
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Plus, { className: "h-4 w-4 mr-2" }), "Invite User"]
							}),
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "sm:hidden space-y-2",
								children: teamMembers.isLoading ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: "text-sm text-muted-foreground py-4 text-center",
									children: "Loading..."
								}) : teamMembers.data?.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: "text-sm text-muted-foreground py-4 text-center",
									children: "No team members"
								}) : teamMembers.data?.map((m) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "rounded-lg border border-border/60 p-3 space-y-1.5",
									children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
											className: "flex items-center justify-between",
											children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
												className: "font-medium text-sm",
												children: m.full_name ?? "—"
											}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
												className: `rounded-full px-2 py-0.5 text-xs ${m.is_active ? "bg-green-500/15 text-green-600" : "bg-muted text-muted-foreground"}`,
												children: m.is_active ? "Active" : "Inactive"
											})]
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
											className: "text-xs text-muted-foreground truncate",
											children: m.email
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
											className: "flex flex-wrap gap-1",
											children: (teamRoles.data?.[m.id] ?? []).map((role) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
												className: "rounded-full bg-primary/15 text-primary px-2 py-0.5 text-xs capitalize",
												children: role.replace(/_/g, " ")
											}, role))
										})
									]
								}, m.id))
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "hidden sm:block rounded-xl border border-border/60 overflow-x-auto",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("table", {
									className: "w-full text-sm",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("thead", {
										className: "bg-muted/40 text-xs uppercase text-muted-foreground",
										children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", { children: [
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
												className: "px-4 py-3 text-left",
												children: "Name"
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
												className: "px-4 py-3 text-left",
												children: "Email"
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
												className: "px-4 py-3 text-left",
												children: "Role"
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
												className: "px-4 py-3 text-left",
												children: "Status"
											})
										] })
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tbody", { children: teamMembers.isLoading ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tr", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
										colSpan: 4,
										className: "px-4 py-8 text-center text-muted-foreground",
										children: "Loading..."
									}) }) : teamMembers.data?.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tr", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
										colSpan: 4,
										className: "px-4 py-8 text-center text-muted-foreground",
										children: "No team members"
									}) }) : teamMembers.data?.map((m) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", {
										className: "border-t border-border/60",
										children: [
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
												className: "px-4 py-3 font-medium",
												children: m.full_name ?? "—"
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
												className: "px-4 py-3 text-sm text-muted-foreground",
												children: m.email
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
												className: "px-4 py-3",
												children: (teamRoles.data?.[m.id] ?? []).map((role) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
													className: "rounded-full bg-primary/15 text-primary px-2 py-0.5 text-xs mr-1 capitalize",
													children: role.replace(/_/g, " ")
												}, role))
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
												className: "px-4 py-3",
												children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
													className: `rounded-full px-2 py-0.5 text-xs ${m.is_active ? "bg-green-500/15 text-green-600" : "bg-muted text-muted-foreground"}`,
													children: m.is_active ? "Active" : "Inactive"
												})
											})
										]
									}, m.id)) })]
								})
							})]
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Dialog, {
							open: inviteOpen,
							onOpenChange: setInviteOpen,
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DialogContent, { children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(DialogHeader, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DialogTitle, { children: "Invite Team Member" }) }),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "space-y-4",
									children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
											label: "Email address",
											children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
												type: "email",
												value: inviteEmail,
												onChange: (e) => setInviteEmail(e.target.value)
											})
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
											label: "Role",
											children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Select, {
												value: inviteRole,
												onValueChange: setInviteRole,
												children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectTrigger, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectValue, {}) }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectContent, { children: [
													"isp_owner",
													"branch_manager",
													"network_engineer",
													"support_agent",
													"sales_agent",
													"accountant",
													"field_technician"
												].map((r) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
													value: r,
													className: "capitalize",
													children: r.replace(/_/g, " ")
												}, r)) })]
											})
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
											className: "text-xs text-muted-foreground",
											children: "The user will need to register with this email. Their role will be assigned automatically."
										})
									]
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DialogFooter, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
									variant: "outline",
									onClick: () => setInviteOpen(false),
									children: "Cancel"
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
									onClick: () => {
										toast.info("Invitation system requires email edge function. Configure SMTP in Supabase Auth settings.");
										setInviteOpen(false);
									},
									children: "Send Invite"
								})] })
							] })
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TabsContent, {
						value: "security",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Section, {
							title: "Security Settings",
							desc: "Control authentication and access policies",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "space-y-3",
								children: [
									{
										key: "require_mfa",
										label: "Require MFA for all admin users"
									},
									{
										key: "enforce_session_expiry",
										label: "Enforce session expiry (8 hours)"
									},
									{
										key: "ip_restriction",
										label: "IP address restrictions"
									},
									{
										key: "audit_logging",
										label: "Audit all user actions"
									},
									{
										key: "rate_limiting",
										label: "Enable rate limiting on API calls"
									}
								].map((s) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "flex items-center justify-between rounded-md border border-border/60 px-4 py-3",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, {
										className: "text-sm",
										children: s.label
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Switch, {
										checked: securityForm[s.key] ?? false,
										onCheckedChange: (v) => setSecurityForm((f) => ({
											...f,
											[s.key]: v
										}))
									})]
								}, s.key))
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
								onClick: () => saveSetting.mutate({
									key: "security",
									value: securityForm
								}),
								disabled: saveSetting.isPending,
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Save, { className: "h-4 w-4 mr-2" }), saveSetting.isPending ? "Saving..." : "Save Security Settings"]
							})]
						})
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TabsContent, {
						value: "outages",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(OutagesTab, { tenantId: tenantId ?? null })
					})
				]
			})]
		})]
	});
}
function OutagesTab({ tenantId }) {
	const qc = useQueryClient();
	const [open, setOpen] = (0, import_react.useState)(false);
	const [form, setForm] = (0, import_react.useState)({
		title: "",
		description: "",
		type: "outage",
		area: "",
		eta: ""
	});
	const outages = useQuery({
		queryKey: ["outages-settings", tenantId],
		queryFn: async () => {
			const { data } = await supabase.from("outages").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(20);
			return data ?? [];
		},
		enabled: !!tenantId
	});
	const create = useMutation({
		mutationFn: async () => {
			const { error } = await supabase.from("outages").insert({
				...form,
				tenant_id: tenantId,
				status: "active",
				eta: form.eta || null
			});
			if (error) throw error;
		},
		onSuccess: () => {
			toast.success("Outage notice posted");
			qc.invalidateQueries({ queryKey: ["outages-settings"] });
			qc.invalidateQueries({ queryKey: ["active-outages"] });
			setOpen(false);
			setForm({
				title: "",
				description: "",
				type: "outage",
				area: "",
				eta: ""
			});
		},
		onError: (e) => toast.error(e.message)
	});
	const resolve = useMutation({
		mutationFn: async (id) => {
			const { error } = await supabase.from("outages").update({
				status: "resolved",
				resolved_at: (/* @__PURE__ */ new Date()).toISOString()
			}).eq("id", id);
			if (error) throw error;
		},
		onSuccess: () => {
			toast.success("Outage marked resolved");
			qc.invalidateQueries({ queryKey: ["outages-settings"] });
			qc.invalidateQueries({ queryKey: ["active-outages"] });
		}
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Section, {
		title: "Service Outages",
		desc: "Post outage and maintenance notices — shown as a banner across the dashboard",
		action: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
			size: "sm",
			onClick: () => setOpen(true),
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Plus, { className: "h-4 w-4 mr-2" }), "Post Notice"]
		}),
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "space-y-2",
			children: [(outages.data ?? []).length === 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-sm text-muted-foreground",
				children: "No outage notices. All systems operational."
			}), (outages.data ?? []).map((o) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: `flex items-start justify-between rounded-md border p-3 ${o.status === "active" ? "border-destructive/30 bg-destructive/5" : "border-border/60 opacity-60"}`,
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "space-y-0.5",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex items-center gap-2 flex-wrap",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "font-medium text-sm",
									children: o.title
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: `rounded-full px-2 py-0.5 text-[10px] capitalize ${o.status === "active" ? "bg-destructive/15 text-destructive" : "bg-green-500/15 text-green-600"}`,
									children: o.status
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "rounded-full bg-muted px-2 py-0.5 text-[10px] capitalize",
									children: o.type
								})
							]
						}),
						o.area && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "text-xs text-muted-foreground",
							children: ["Area: ", o.area]
						}),
						o.eta && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "text-xs text-muted-foreground",
							children: ["ETA: ", new Date(o.eta).toLocaleString()]
						}),
						o.description && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "text-xs text-muted-foreground",
							children: o.description
						})
					]
				}), o.status === "active" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
					size: "sm",
					variant: "outline",
					onClick: () => resolve.mutate(o.id),
					disabled: resolve.isPending,
					className: "shrink-0 ml-3",
					children: "Resolve"
				})]
			}, o.id))]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Dialog, {
			open,
			onOpenChange: setOpen,
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DialogContent, { children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(DialogHeader, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DialogTitle, { children: "Post Outage Notice" }) }),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "space-y-4",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
							label: "Title *",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
								value: form.title,
								onChange: (e) => setForm((f) => ({
									...f,
									title: e.target.value
								})),
								placeholder: "Network maintenance tonight"
							})
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
							label: "Type",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Select, {
								value: form.type,
								onValueChange: (v) => setForm((f) => ({
									...f,
									type: v
								})),
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectTrigger, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectValue, {}) }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(SelectContent, { children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
										value: "outage",
										children: "Emergency Outage"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
										value: "maintenance",
										children: "Scheduled Maintenance"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
										value: "degraded",
										children: "Degraded Service"
									})
								] })]
							})
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
							label: "Affected Area",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
								value: form.area,
								onChange: (e) => setForm((f) => ({
									...f,
									area: e.target.value
								})),
								placeholder: "e.g. Westlands, Kilimani"
							})
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
							label: "Estimated Restoration Time",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
								type: "datetime-local",
								value: form.eta,
								onChange: (e) => setForm((f) => ({
									...f,
									eta: e.target.value
								}))
							})
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
							label: "Description",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Textarea, {
								value: form.description,
								onChange: (e) => setForm((f) => ({
									...f,
									description: e.target.value
								})),
								rows: 3,
								placeholder: "What happened and what's being done..."
							})
						})
					]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DialogFooter, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
					variant: "outline",
					onClick: () => setOpen(false),
					children: "Cancel"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
					onClick: () => create.mutate(),
					disabled: !form.title || create.isPending,
					children: "Post Notice"
				})] })
			] })
		})]
	});
}
function Section({ title, desc, children, action }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "rounded-xl border border-border/60 bg-card p-4 sm:p-6 space-y-4",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "flex flex-wrap items-start justify-between gap-2",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
				className: "font-semibold",
				children: title
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-xs text-muted-foreground mt-0.5",
				children: desc
			})] }), action && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "shrink-0",
				children: action
			})]
		}), children]
	});
}
function Field({ label, children, className }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className,
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, {
			className: "mb-1 block",
			children: label
		}), children]
	});
}
//#endregion
export { SettingsPage as component };
