import { i as __toESM } from "../_runtime.mjs";
import { a as supabase, i as init_client } from "./client-D3kKP_Nv.mjs";
import { u as require_react } from "../_libs/@floating-ui/react-dom+[...].mjs";
import { s as require_jsx_runtime } from "../_libs/@radix-ui/react-arrow+[...].mjs";
import { i as useQueryClient, n as useQuery, t as useMutation } from "../_libs/tanstack__react-query.mjs";
import { a as useTenantId } from "./auth-z02iFWqz.mjs";
import { t as Button } from "./button-DRsC1qZi.mjs";
import { t as Input } from "./input-DicJzR9-.mjs";
import { t as Label } from "./label-B4PTMSG2.mjs";
import { B as Palette, Ct as Check, V as Package, Z as Link, i as Wifi, it as Eye, k as Save, ot as ExternalLink, pt as Copy, tt as Globe } from "../_libs/lucide-react.mjs";
import { i as TabsTrigger, n as TabsContent, r as TabsList, t as Tabs } from "./tabs-WTjz7Ps0.mjs";
import { n as toast } from "../_libs/sonner.mjs";
import { t as Textarea } from "./textarea-DBn9CRiI.mjs";
import { n as saveBranding } from "./branding-Bl6WKHXJ.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/portal-manager-0n-qJWkn.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
/**
* Portal Manager — ISP admin view to configure captive portal branding,
* packages, and generate the portal URL for MikroTik / RADIUS.
*/
init_client();
function PortalManagerPage() {
	const qc = useQueryClient();
	const { data: tenantId } = useTenantId();
	const [copied, setCopied] = (0, import_react.useState)(false);
	const tenant = useQuery({
		queryKey: ["tenant-detail", tenantId],
		queryFn: async () => {
			const { data } = await supabase.from("tenants").select("*").eq("id", tenantId).single();
			return data;
		},
		enabled: !!tenantId
	});
	const branding = useQuery({
		queryKey: ["tenant-branding", tenantId],
		queryFn: async () => {
			const { data } = await supabase.from("tenant_branding").select("*").eq("tenant_id", tenantId).maybeSingle();
			return data ?? {};
		},
		enabled: !!tenantId
	});
	const packages = useQuery({
		queryKey: ["packages-portal", tenantId],
		queryFn: async () => {
			const { data } = await supabase.from("packages").select("*").eq("tenant_id", tenantId).eq("is_active", true).order("price");
			return data ?? [];
		},
		enabled: !!tenantId
	});
	const [form, setForm] = (0, import_react.useState)({});
	const f = {
		...branding.data ?? {},
		...form
	};
	const saveB = useMutation({
		mutationFn: async () => saveBranding(tenantId, {
			...f,
			tenant_id: tenantId
		}),
		onSuccess: () => {
			toast.success("Portal branding saved");
			qc.invalidateQueries({ queryKey: ["tenant-branding"] });
		},
		onError: (e) => toast.error(e.message)
	});
	const portalUrl = `${window.location.origin}/portal?isp=${tenant.data?.slug ?? ""}`;
	const mikrotikRedirect = `http://$(dst-ip)/portal?isp=${tenant.data?.slug ?? ""}&mac=$(mac)&ip=$(ip)&url=$(link-orig)`;
	function copyUrl(text) {
		navigator.clipboard.writeText(text);
		setCopied(true);
		setTimeout(() => setCopied(false), 2e3);
	}
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "space-y-6 max-w-4xl",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "flex items-center justify-between",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
				className: "text-2xl font-bold",
				children: "Captive Portal"
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-sm text-muted-foreground",
				children: "Configure your WiFi login portal for MikroTik, hotel, school, apartment, and event WiFi."
			})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex gap-2",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
					variant: "outline",
					size: "sm",
					asChild: true,
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("a", {
						href: portalUrl,
						target: "_blank",
						rel: "noopener noreferrer",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Eye, { className: "h-4 w-4 mr-2" }), "Preview"]
					})
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
					onClick: () => saveB.mutate(),
					disabled: saveB.isPending,
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Save, { className: "h-4 w-4 mr-2" }), "Save"]
				})]
			})]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Tabs, {
			defaultValue: "portal-url",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(TabsList, {
					className: "grid w-full grid-cols-4",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(TabsTrigger, {
							value: "portal-url",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, { className: "h-3.5 w-3.5 mr-1.5" }), "Portal URL"]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(TabsTrigger, {
							value: "branding",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Palette, { className: "h-3.5 w-3.5 mr-1.5" }), "Branding"]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(TabsTrigger, {
							value: "content",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Globe, { className: "h-3.5 w-3.5 mr-1.5" }), "Content"]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(TabsTrigger, {
							value: "packages",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Package, { className: "h-3.5 w-3.5 mr-1.5" }), "Packages"]
						})
					]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(TabsContent, {
					value: "portal-url",
					className: "space-y-4 mt-4",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Card, {
							title: "Your Portal URL",
							desc: "Share this URL or embed it in your router configuration",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "flex gap-2",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
										readOnly: true,
										value: portalUrl,
										className: "font-mono text-xs"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
										variant: "outline",
										size: "sm",
										onClick: () => copyUrl(portalUrl),
										children: copied ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Check, { className: "h-4 w-4" }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Copy, { className: "h-4 w-4" })
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
										variant: "outline",
										size: "sm",
										asChild: true,
										children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("a", {
											href: portalUrl,
											target: "_blank",
											rel: "noopener noreferrer",
											children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ExternalLink, { className: "h-4 w-4" })
										})
									})
								]
							})
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Card, {
							title: "MikroTik Hotspot Setup",
							desc: "Use this redirect URL in your MikroTik hotspot profile → Login Page",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "space-y-3",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, {
										className: "text-xs font-medium text-muted-foreground",
										children: "Hotspot Login Page Redirect URL"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "flex gap-2",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
											readOnly: true,
											value: mikrotikRedirect,
											className: "font-mono text-xs"
										}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
											variant: "outline",
											size: "sm",
											onClick: () => copyUrl(mikrotikRedirect),
											children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Copy, { className: "h-4 w-4" })
										})]
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground space-y-1",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
											className: "font-medium text-foreground",
											children: "MikroTik Configuration Steps:"
										}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("ol", {
											className: "list-decimal list-inside space-y-1",
											children: [
												/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", { children: ["Go to ", /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
													className: "font-mono",
													children: "IP → Hotspot → Server Profiles"
												})] }),
												/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", { children: [
													"Set ",
													/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
														className: "font-mono",
														children: "Login Page"
													}),
													" to the URL above"
												] }),
												/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", { children: [
													"Enable ",
													/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
														className: "font-mono",
														children: "Use RADIUS"
													}),
													" or use built-in auth"
												] }),
												/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", { children: [
													"Set ",
													/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
														className: "font-mono",
														children: "Walled Garden"
													}),
													" to allow your portal domain"
												] })
											]
										})]
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "grid grid-cols-2 gap-3 text-xs",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
											className: "rounded-lg border border-border/60 p-3",
											children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
												className: "font-medium mb-1",
												children: "RADIUS Setup"
											}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
												className: "text-muted-foreground",
												children: "Point RADIUS auth to your Supabase edge function endpoint for automated session management."
											})]
										}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
											className: "rounded-lg border border-border/60 p-3",
											children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
												className: "font-medium mb-1",
												children: "Walled Garden"
											}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
												className: "text-muted-foreground",
												children: [
													"Allow: ",
													/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
														className: "font-mono",
														children: window.location.hostname
													}),
													", safaricom.com, mpesa.safaricom.co.ke"
												]
											})]
										})]
									})
								]
							})
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Card, {
							title: "Portal QR Code",
							desc: "Print this QR code at your hotspot location",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "flex items-center gap-6",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
									className: "grid h-24 w-24 place-items-center rounded-xl border-2 border-dashed border-border bg-muted/30",
									children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Wifi, { className: "h-8 w-8 text-muted-foreground" })
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "text-sm text-muted-foreground",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "QR code generation requires a QR library." }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
										className: "mt-1",
										children: [
											"Use ",
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("a", {
												href: `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(portalUrl)}`,
												className: "text-primary hover:underline",
												target: "_blank",
												children: "this free QR service"
											}),
											" with your portal URL."
										]
									})]
								})]
							})
						})
					]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(TabsContent, {
					value: "branding",
					className: "space-y-4 mt-4",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Card, {
							title: "Logo & Favicon",
							desc: "Upload your ISP logo and browser favicon",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "grid grid-cols-1 sm:grid-cols-2 gap-4",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, {
										className: "mb-1.5 block",
										children: "Logo URL"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
										value: f.logo_url ?? "",
										onChange: (e) => setForm((p) => ({
											...p,
											logo_url: e.target.value
										})),
										placeholder: "https://..."
									}),
									f.logo_url && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
										src: f.logo_url,
										alt: "logo preview",
										className: "mt-2 h-10 w-auto object-contain rounded border border-border/60 bg-muted p-1"
									})
								] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, {
									className: "mb-1.5 block",
									children: "Favicon URL"
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
									value: f.favicon_url ?? "",
									onChange: (e) => setForm((p) => ({
										...p,
										favicon_url: e.target.value
									})),
									placeholder: "https://..."
								})] })]
							})
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Card, {
							title: "Brand Colors",
							desc: "Set your ISP's color palette — applied across the entire platform",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "grid grid-cols-1 sm:grid-cols-2 gap-4",
								children: [
									{
										key: "primary_color",
										label: "Primary Color",
										placeholder: "#0ea5e9",
										desc: "Main brand color — buttons, links"
									},
									{
										key: "secondary_color",
										label: "Secondary Color",
										placeholder: "#8b5cf6",
										desc: "Accent highlights"
									},
									{
										key: "accent_color",
										label: "Accent Color",
										placeholder: "#f59e0b",
										desc: "Badges, tags"
									},
									{
										key: "success_color",
										label: "Success Color",
										placeholder: "#22c55e",
										desc: "Positive states"
									},
									{
										key: "warning_color",
										label: "Warning Color",
										placeholder: "#f59e0b",
										desc: "Warnings"
									},
									{
										key: "error_color",
										label: "Error Color",
										placeholder: "#ef4444",
										desc: "Error states"
									}
								].map((cf) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, {
										className: "mb-1 block",
										children: cf.label
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "flex gap-2 items-center",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
											type: "color",
											value: f[cf.key] ?? cf.placeholder,
											onChange: (e) => setForm((p) => ({
												...p,
												[cf.key]: e.target.value
											})),
											className: "h-9 w-12 rounded border border-input cursor-pointer bg-transparent"
										}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
											value: f[cf.key] ?? "",
											onChange: (e) => setForm((p) => ({
												...p,
												[cf.key]: e.target.value
											})),
											placeholder: cf.placeholder,
											className: "font-mono text-xs"
										})]
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
										className: "text-[10px] text-muted-foreground mt-0.5",
										children: cf.desc
									})
								] }, cf.key))
							})
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Card, {
							title: "Typography & Custom CSS",
							desc: "Advanced styling overrides",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, {
								className: "mb-1.5 block",
								children: "Custom CSS overrides (injected into the platform)"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Textarea, {
								value: f.css_overrides ?? "",
								onChange: (e) => setForm((p) => ({
									...p,
									css_overrides: e.target.value
								})),
								placeholder: "/* Custom CSS */\\n:root { --radius: 0.5rem; }",
								rows: 5,
								className: "font-mono text-xs"
							})] })
						})
					]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TabsContent, {
					value: "content",
					className: "space-y-4 mt-4",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Card, {
						title: "Portal Content",
						desc: "Text shown to customers on the captive portal",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "space-y-4",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, {
									className: "mb-1.5 block",
									children: "Portal Tagline"
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
									value: f.portal_tagline ?? "",
									onChange: (e) => setForm((p) => ({
										...p,
										portal_tagline: e.target.value
									})),
									placeholder: "Fast, Reliable Internet — Powered by..."
								})] }),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, {
									className: "mb-1.5 block",
									children: "Welcome Message"
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Textarea, {
									value: f.welcome_message ?? "",
									onChange: (e) => setForm((p) => ({
										...p,
										welcome_message: e.target.value
									})),
									rows: 3,
									placeholder: "Welcome! Select a package to get started."
								})] }),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "grid grid-cols-1 sm:grid-cols-2 gap-4",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, {
										className: "mb-1.5 block",
										children: "Support Phone"
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
										value: f.support_phone ?? "",
										onChange: (e) => setForm((p) => ({
											...p,
											support_phone: e.target.value
										})),
										placeholder: "0712345678"
									})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, {
										className: "mb-1.5 block",
										children: "Support Email"
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
										value: f.support_email ?? "",
										onChange: (e) => setForm((p) => ({
											...p,
											support_email: e.target.value
										})),
										placeholder: "support@yourisp.co.ke"
									})] })]
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, {
										className: "mb-1.5 block",
										children: "SMS Sender ID"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
										value: f.sms_sender_id ?? "",
										onChange: (e) => setForm((p) => ({
											...p,
											sms_sender_id: e.target.value
										})),
										placeholder: "SMARTNET",
										maxLength: 11
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
										className: "text-xs text-muted-foreground mt-0.5",
										children: "Max 11 characters. Used as SMS sender name."
									})
								] }),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, {
									className: "mb-1.5 block",
									children: "Invoice Header"
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Textarea, {
									value: f.invoice_header ?? "",
									onChange: (e) => setForm((p) => ({
										...p,
										invoice_header: e.target.value
									})),
									rows: 2,
									placeholder: "Your ISP Ltd | P.O Box 123, Nairobi | support@yourisp.co.ke"
								})] }),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, {
									className: "mb-1.5 block",
									children: "Invoice Footer"
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Textarea, {
									value: f.invoice_footer ?? "",
									onChange: (e) => setForm((p) => ({
										...p,
										invoice_footer: e.target.value
									})),
									rows: 2,
									placeholder: "Thank you for choosing us. Terms apply."
								})] })
							]
						})
					})
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TabsContent, {
					value: "packages",
					className: "mt-4",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Card, {
						title: "Packages on Portal",
						desc: "These packages appear on your captive portal for customers to purchase",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "space-y-2",
							children: [
								packages.isLoading && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: "text-sm text-muted-foreground",
									children: "Loading..."
								}),
								(packages.data ?? []).length === 0 && !packages.isLoading && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
									className: "text-sm text-muted-foreground",
									children: ["No active packages. ", /* @__PURE__ */ (0, import_jsx_runtime.jsx)("a", {
										href: "/packages",
										className: "text-primary hover:underline",
										children: "Add packages →"
									})]
								}),
								(packages.data ?? []).map((pkg) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "flex items-center justify-between rounded-xl border border-border/60 bg-card px-4 py-3",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
										className: "font-medium text-sm",
										children: pkg.name
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "text-xs text-muted-foreground",
										children: [
											pkg.duration_days,
											"d · ",
											pkg.speed_limit ?? "Shared",
											" · ",
											pkg.type
										]
									})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "flex items-center gap-3",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
											className: "font-bold text-primary",
											children: ["KES ", Number(pkg.price).toLocaleString()]
										}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
											className: `rounded-full px-2 py-0.5 text-xs ${pkg.is_active ? "bg-green-500/15 text-green-600" : "bg-muted text-muted-foreground"}`,
											children: pkg.is_active ? "Active" : "Inactive"
										})]
									})]
								}, pkg.id))
							]
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
							className: "text-xs text-muted-foreground mt-2",
							children: ["Manage packages from the ", /* @__PURE__ */ (0, import_jsx_runtime.jsx)("a", {
								href: "/packages",
								className: "text-primary hover:underline",
								children: "Plans page →"
							})]
						})]
					})
				})
			]
		})]
	});
}
function Card({ title, desc, children }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "rounded-2xl border border-border/60 bg-card p-5 space-y-4",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
			className: "font-semibold",
			children: title
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
			className: "text-xs text-muted-foreground mt-0.5",
			children: desc
		})] }), children]
	});
}
//#endregion
export { PortalManagerPage as component };
