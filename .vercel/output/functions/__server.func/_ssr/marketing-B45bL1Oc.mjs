import { i as __toESM } from "../_runtime.mjs";
import { a as supabase, i as init_client } from "./client-D3kKP_Nv.mjs";
import { u as require_react } from "../_libs/@floating-ui/react-dom+[...].mjs";
import { s as require_jsx_runtime } from "../_libs/@radix-ui/react-arrow+[...].mjs";
import { i as useQueryClient, n as useQuery, t as useMutation } from "../_libs/tanstack__react-query.mjs";
import { a as useTenantId } from "./auth-z02iFWqz.mjs";
import { t as Button } from "./button-DRsC1qZi.mjs";
import { t as Input } from "./input-DicJzR9-.mjs";
import { t as Label } from "./label-B4PTMSG2.mjs";
import { D as Send, G as Megaphone, I as Plus, M as RefreshCw, W as MessageSquare, _ as Tag, g as Target, l as UserPlus, nt as Gift, s as Users, y as Star } from "../_libs/lucide-react.mjs";
import { a as DialogTitle, i as DialogHeader, n as DialogContent, r as DialogFooter, t as Dialog } from "./dialog-BpdftUtE.mjs";
import { a as SelectValue, i as SelectTrigger, n as SelectContent, r as SelectItem, t as Select } from "./select-DUy71i1r.mjs";
import { i as TabsTrigger, n as TabsContent, r as TabsList, t as Tabs } from "./tabs-WTjz7Ps0.mjs";
import { n as toast } from "../_libs/sonner.mjs";
import { t as Textarea } from "./textarea-DBn9CRiI.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/marketing-B45bL1Oc.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
/**
* Marketing & Sales Platform — leads, campaigns, referrals, coupons,
* customer retention, bulk SMS, and win-back campaigns.
*/
init_client();
function MarketingPage() {
	const qc = useQueryClient();
	const { data: tenantId } = useTenantId();
	const [leadOpen, setLeadOpen] = (0, import_react.useState)(false);
	const [leadForm, setLeadForm] = (0, import_react.useState)({
		full_name: "",
		phone: "",
		email: "",
		source: "walk-in",
		area: "",
		notes: ""
	});
	const leads = useQuery({
		queryKey: ["leads", tenantId],
		queryFn: async () => {
			const { data } = await supabase.from("leads").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(50);
			return data ?? [];
		},
		enabled: !!tenantId
	});
	const addLead = useMutation({
		mutationFn: async () => {
			const { error } = await supabase.from("leads").insert({
				...leadForm,
				tenant_id: tenantId,
				status: "new"
			});
			if (error) throw error;
		},
		onSuccess: () => {
			toast.success("Lead captured");
			qc.invalidateQueries({ queryKey: ["leads"] });
			setLeadOpen(false);
			setLeadForm({
				full_name: "",
				phone: "",
				email: "",
				source: "walk-in",
				area: "",
				notes: ""
			});
		},
		onError: (e) => toast.error(e.message)
	});
	const updateLeadStatus = useMutation({
		mutationFn: async ({ id, status }) => {
			const { error } = await supabase.from("leads").update({ status }).eq("id", id);
			if (error) throw error;
		},
		onSuccess: () => qc.invalidateQueries({ queryKey: ["leads"] })
	});
	const [smsTarget, setSmsTarget] = (0, import_react.useState)("all");
	const [smsMessage, setSmsMessage] = (0, import_react.useState)("");
	const [smsSending, setSmsSending] = (0, import_react.useState)(false);
	async function sendBulkSms() {
		setSmsSending(true);
		try {
			let q = supabase.from("customers").select("phone").eq("tenant_id", tenantId).eq("status", "active");
			if (smsTarget === "expiring") q = q.lte("subscriptions.expires_at", new Date(Date.now() + 864e5 * 3).toISOString());
			if (smsTarget === "suspended") q = q.eq("status", "suspended");
			const { data: customers } = await q;
			const phones = (customers ?? []).map((c) => c.phone).filter(Boolean);
			await supabase.functions.invoke("send-sms", { body: {
				phones,
				message: smsMessage,
				tenant_id: tenantId
			} });
			toast.success(`SMS queued for ${phones.length} customers`);
			setSmsMessage("");
		} catch (e) {
			toast.error(e.message);
		} finally {
			setSmsSending(false);
		}
	}
	const [couponOpen, setCouponOpen] = (0, import_react.useState)(false);
	const [couponForm, setCouponForm] = (0, import_react.useState)({
		code: "",
		discount_type: "percent",
		discount_value: 10,
		max_uses: 100,
		expires_at: ""
	});
	const coupons = useQuery({
		queryKey: ["coupons", tenantId],
		queryFn: async () => {
			const { data } = await supabase.from("coupons").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false });
			return data ?? [];
		},
		enabled: !!tenantId
	});
	const addCoupon = useMutation({
		mutationFn: async () => {
			const { error } = await supabase.from("coupons").insert({
				...couponForm,
				tenant_id: tenantId,
				uses: 0,
				is_active: true
			});
			if (error) throw error;
		},
		onSuccess: () => {
			toast.success("Coupon created");
			qc.invalidateQueries({ queryKey: ["coupons"] });
			setCouponOpen(false);
		},
		onError: (e) => toast.error(e.message)
	});
	const retention = useQuery({
		queryKey: ["retention-stats", tenantId],
		queryFn: async () => {
			const [expiring7, suspended, newMonth] = await Promise.all([
				supabase.from("subscriptions").select("*", {
					count: "exact",
					head: true
				}).eq("tenant_id", tenantId).eq("status", "active").lte("expires_at", new Date(Date.now() + 864e5 * 7).toISOString()).gte("expires_at", (/* @__PURE__ */ new Date()).toISOString()),
				supabase.from("customers").select("*", {
					count: "exact",
					head: true
				}).eq("tenant_id", tenantId).eq("status", "suspended"),
				supabase.from("customers").select("*", {
					count: "exact",
					head: true
				}).eq("tenant_id", tenantId).gte("created_at", new Date((/* @__PURE__ */ new Date()).getFullYear(), (/* @__PURE__ */ new Date()).getMonth(), 1).toISOString())
			]);
			return {
				expiring7: expiring7.count ?? 0,
				suspended: suspended.count ?? 0,
				newMonth: newMonth.count ?? 0
			};
		},
		enabled: !!tenantId
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "space-y-6 max-w-5xl",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
				className: "text-2xl font-bold",
				children: "Marketing & Sales"
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-sm text-muted-foreground",
				children: "Leads, campaigns, coupons, and customer retention tools."
			})] }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "grid grid-cols-2 lg:grid-cols-3 gap-4",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(KpiCard, {
						icon: Target,
						label: "Expiring in 7 Days",
						value: retention.data?.expiring7 ?? 0,
						color: "text-yellow-500",
						sub: "Send renewal reminders"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(KpiCard, {
						icon: UserPlus,
						label: "New This Month",
						value: retention.data?.newMonth ?? 0,
						color: "text-green-500",
						sub: "New acquisitions"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(KpiCard, {
						icon: Users,
						label: "Suspended",
						value: retention.data?.suspended ?? 0,
						color: "text-red-500",
						sub: "Win-back targets"
					})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Tabs, {
				defaultValue: "leads",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(TabsList, {
						className: "grid w-full grid-cols-4",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(TabsTrigger, {
								value: "leads",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Users, { className: "h-3.5 w-3.5 mr-1.5" }), "Leads"]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(TabsTrigger, {
								value: "sms",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(MessageSquare, { className: "h-3.5 w-3.5 mr-1.5" }), "Bulk SMS"]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(TabsTrigger, {
								value: "coupons",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Tag, { className: "h-3.5 w-3.5 mr-1.5" }), "Coupons"]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(TabsTrigger, {
								value: "retention",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(RefreshCw, { className: "h-3.5 w-3.5 mr-1.5" }), "Retention"]
							})
						]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(TabsContent, {
						value: "leads",
						className: "mt-4 space-y-4",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "flex items-center justify-between",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
									className: "font-semibold",
									children: "Lead Pipeline"
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
									size: "sm",
									onClick: () => setLeadOpen(true),
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Plus, { className: "h-4 w-4 mr-2" }), "Add Lead"]
								})]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "rounded-2xl border border-border/60 bg-card overflow-x-auto",
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
												children: "Phone"
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
												className: "px-4 py-3 text-left",
												children: "Source"
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
												className: "px-4 py-3 text-left",
												children: "Area"
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
												className: "px-4 py-3 text-left",
												children: "Status"
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
												className: "px-4 py-3 text-left",
												children: "Action"
											})
										] })
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tbody", { children: [
										leads.isLoading && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tr", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
											colSpan: 6,
											className: "px-4 py-8 text-center text-muted-foreground",
											children: "Loading..."
										}) }),
										!leads.isLoading && (leads.data ?? []).length === 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tr", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
											colSpan: 6,
											className: "px-4 py-8 text-center text-muted-foreground",
											children: "No leads yet. Start capturing."
										}) }),
										(leads.data ?? []).map((lead) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", {
											className: "border-t border-border/60 hover:bg-accent/30",
											children: [
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
													className: "px-4 py-3 font-medium",
													children: lead.full_name
												}),
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
													className: "px-4 py-3 text-xs font-mono",
													children: lead.phone
												}),
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
													className: "px-4 py-3 text-xs capitalize",
													children: lead.source?.replace("-", " ")
												}),
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
													className: "px-4 py-3 text-xs",
													children: lead.area ?? "—"
												}),
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
													className: "px-4 py-3",
													children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(LeadStatusBadge, { status: lead.status })
												}),
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
													className: "px-4 py-3",
													children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Select, {
														value: lead.status,
														onValueChange: (v) => updateLeadStatus.mutate({
															id: lead.id,
															status: v
														}),
														children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectTrigger, {
															className: "h-7 text-xs w-28",
															children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectValue, {})
														}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectContent, { children: [
															"new",
															"contacted",
															"site_survey",
															"installation",
															"converted",
															"lost"
														].map((s) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
															value: s,
															className: "text-xs capitalize",
															children: s.replace("_", " ")
														}, s)) })]
													})
												})
											]
										}, lead.id))
									] })]
								})
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Dialog, {
								open: leadOpen,
								onOpenChange: setLeadOpen,
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DialogContent, { children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(DialogHeader, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DialogTitle, { children: "Capture Lead" }) }),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "grid grid-cols-2 gap-4",
										children: [
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
												label: "Full Name *",
												children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
													value: leadForm.full_name,
													onChange: (e) => setLeadForm((f) => ({
														...f,
														full_name: e.target.value
													}))
												})
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
												label: "Phone *",
												children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
													value: leadForm.phone,
													onChange: (e) => setLeadForm((f) => ({
														...f,
														phone: e.target.value
													}))
												})
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
												label: "Email",
												children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
													value: leadForm.email,
													onChange: (e) => setLeadForm((f) => ({
														...f,
														email: e.target.value
													}))
												})
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
												label: "Area / Location",
												children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
													value: leadForm.area,
													onChange: (e) => setLeadForm((f) => ({
														...f,
														area: e.target.value
													}))
												})
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
												label: "Source",
												children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Select, {
													value: leadForm.source,
													onValueChange: (v) => setLeadForm((f) => ({
														...f,
														source: v
													})),
													children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectTrigger, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectValue, {}) }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectContent, { children: [
														"walk-in",
														"referral",
														"social-media",
														"google",
														"flyer",
														"agent",
														"whatsapp",
														"call",
														"other"
													].map((s) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
														value: s,
														className: "capitalize",
														children: s.replace("-", " ")
													}, s)) })]
												})
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
												label: "Notes",
												className: "col-span-2",
												children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Textarea, {
													value: leadForm.notes,
													onChange: (e) => setLeadForm((f) => ({
														...f,
														notes: e.target.value
													})),
													rows: 2
												})
											})
										]
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DialogFooter, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
										variant: "outline",
										onClick: () => setLeadOpen(false),
										children: "Cancel"
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
										onClick: () => addLead.mutate(),
										disabled: !leadForm.full_name || !leadForm.phone || addLead.isPending,
										children: "Save Lead"
									})] })
								] })
							})
						]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(TabsContent, {
						value: "sms",
						className: "mt-4 space-y-4",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "rounded-2xl border border-border/60 bg-card p-5 space-y-4",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
									className: "font-semibold",
									children: "Send Bulk SMS Campaign"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
									className: "grid grid-cols-1 sm:grid-cols-2 gap-4",
									children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
										label: "Target Audience",
										children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Select, {
											value: smsTarget,
											onValueChange: setSmsTarget,
											children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectTrigger, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectValue, {}) }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(SelectContent, { children: [
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
													value: "all",
													children: "All Active Customers"
												}),
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
													value: "expiring",
													children: "Expiring in 3 Days"
												}),
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
													value: "suspended",
													children: "Suspended Customers (Win-back)"
												})
											] })]
										})
									})
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Field, {
									label: "Message",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Textarea, {
										value: smsMessage,
										onChange: (e) => setSmsMessage(e.target.value),
										rows: 4,
										placeholder: "Dear {name}, your subscription is expiring soon. Renew at {portal_url} or call {support_phone}."
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
										className: "text-xs text-muted-foreground mt-1",
										children: [
											"Variables: ",
											"{name}",
											", ",
											"{portal_url}",
											", ",
											"{support_phone}",
											", ",
											"{expiry_date}"
										]
									})]
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "flex items-center justify-between",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
										className: "text-xs text-muted-foreground",
										children: [
											smsMessage.length,
											" / 160 chars",
											smsMessage.length > 160 ? ` (${Math.ceil(smsMessage.length / 160)} SMS)` : ""
										]
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
										onClick: sendBulkSms,
										disabled: !smsMessage || smsSending,
										children: smsSending ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Send, { className: "h-4 w-4 mr-2 animate-pulse" }), "Sending…"] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Send, { className: "h-4 w-4 mr-2" }), "Send Campaign"] })
									})]
								})
							]
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "rounded-2xl border border-border/60 bg-card p-5",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
								className: "font-semibold mb-3 text-sm",
								children: "Quick Templates"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "grid gap-2",
								children: [
									{
										label: "Renewal Reminder",
										msg: "Dear {name}, your internet subscription expires on {expiry_date}. Renew now to stay connected. Pay via M-Pesa to {paybill} or visit {portal_url}."
									},
									{
										label: "Win-back Campaign",
										msg: "Hi {name}, we miss you! Your account is suspended. Reconnect today and get 10% off. Call {support_phone} or pay {paybill}."
									},
									{
										label: "New Package Promo",
										msg: "Hi {name}! We have new internet packages starting from KES 99. Unlimited browsing, fast speeds. Reply YES or call {support_phone}."
									},
									{
										label: "Happy Hours",
										msg: "🌙 Night Bundle Alert! Get 5GB from 10PM-6AM for KES 50 tonight only. Dial {ussd_code} or pay via M-Pesa Paybill {paybill}."
									}
								].map((t) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
									onClick: () => setSmsMessage(t.msg),
									className: "flex items-start gap-3 rounded-xl border border-border/60 p-3 text-sm text-left hover:bg-accent/50 transition",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(MessageSquare, { className: "h-4 w-4 text-muted-foreground mt-0.5 shrink-0" }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
										className: "font-medium",
										children: t.label
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "text-xs text-muted-foreground truncate",
										children: [t.msg.slice(0, 80), "…"]
									})] })]
								}, t.label))
							})]
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(TabsContent, {
						value: "coupons",
						className: "mt-4 space-y-4",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "flex items-center justify-between",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
									className: "font-semibold",
									children: "Discount Coupons"
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
									size: "sm",
									onClick: () => setCouponOpen(true),
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Plus, { className: "h-4 w-4 mr-2" }), "New Coupon"]
								})]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "rounded-2xl border border-border/60 bg-card overflow-x-auto",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("table", {
									className: "w-full text-sm",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("thead", {
										className: "bg-muted/40 text-xs uppercase text-muted-foreground",
										children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", { children: [
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
												className: "px-4 py-3 text-left",
												children: "Code"
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
												className: "px-4 py-3 text-left",
												children: "Discount"
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
												className: "px-4 py-3 text-left",
												children: "Uses"
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
												className: "px-4 py-3 text-left",
												children: "Max"
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
												className: "px-4 py-3 text-left",
												children: "Expires"
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
												className: "px-4 py-3 text-left",
												children: "Status"
											})
										] })
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tbody", { children: [
										coupons.isLoading && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tr", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
											colSpan: 6,
											className: "px-4 py-8 text-center text-muted-foreground",
											children: "Loading..."
										}) }),
										!coupons.isLoading && (coupons.data ?? []).length === 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tr", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
											colSpan: 6,
											className: "px-4 py-8 text-center text-muted-foreground",
											children: "No coupons yet."
										}) }),
										(coupons.data ?? []).map((c) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", {
											className: "border-t border-border/60 hover:bg-accent/30",
											children: [
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
													className: "px-4 py-3 font-mono font-bold",
													children: c.code
												}),
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
													className: "px-4 py-3 text-sm",
													children: c.discount_type === "percent" ? `${c.discount_value}%` : `KES ${c.discount_value}`
												}),
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
													className: "px-4 py-3 text-xs",
													children: c.uses ?? 0
												}),
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
													className: "px-4 py-3 text-xs",
													children: c.max_uses
												}),
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
													className: "px-4 py-3 text-xs",
													children: c.expires_at ? new Date(c.expires_at).toLocaleDateString() : "Never"
												}),
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
													className: "px-4 py-3",
													children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
														className: `rounded-full px-2 py-0.5 text-xs ${c.is_active ? "bg-green-500/15 text-green-600" : "bg-muted text-muted-foreground"}`,
														children: c.is_active ? "Active" : "Inactive"
													})
												})
											]
										}, c.id))
									] })]
								})
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Dialog, {
								open: couponOpen,
								onOpenChange: setCouponOpen,
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DialogContent, { children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(DialogHeader, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DialogTitle, { children: "Create Coupon" }) }),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "grid grid-cols-2 gap-4",
										children: [
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
												label: "Coupon Code *",
												children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
													value: couponForm.code,
													onChange: (e) => setCouponForm((f) => ({
														...f,
														code: e.target.value.toUpperCase()
													})),
													placeholder: "SAVE20"
												})
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
												label: "Discount Type",
												children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Select, {
													value: couponForm.discount_type,
													onValueChange: (v) => setCouponForm((f) => ({
														...f,
														discount_type: v
													})),
													children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectTrigger, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectValue, {}) }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(SelectContent, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
														value: "percent",
														children: "Percentage (%)"
													}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
														value: "fixed",
														children: "Fixed Amount (KES)"
													})] })]
												})
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
												label: "Discount Value",
												children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
													type: "number",
													value: couponForm.discount_value,
													onChange: (e) => setCouponForm((f) => ({
														...f,
														discount_value: Number(e.target.value)
													}))
												})
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
												label: "Max Uses",
												children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
													type: "number",
													value: couponForm.max_uses,
													onChange: (e) => setCouponForm((f) => ({
														...f,
														max_uses: Number(e.target.value)
													}))
												})
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
												label: "Expires At",
												className: "col-span-2",
												children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
													type: "date",
													value: couponForm.expires_at,
													onChange: (e) => setCouponForm((f) => ({
														...f,
														expires_at: e.target.value
													}))
												})
											})
										]
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DialogFooter, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
										variant: "outline",
										onClick: () => setCouponOpen(false),
										children: "Cancel"
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
										onClick: () => addCoupon.mutate(),
										disabled: !couponForm.code || addCoupon.isPending,
										children: "Create Coupon"
									})] })
								] })
							})
						]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TabsContent, {
						value: "retention",
						className: "mt-4 space-y-4",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "grid gap-4 sm:grid-cols-2",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(RetentionCard, {
									icon: RefreshCw,
									title: "Expiry Reminders",
									desc: `${retention.data?.expiring7 ?? 0} subscriptions expire in 7 days. Send automated renewal SMS.`,
									action: "Send Reminders",
									color: "yellow",
									onClick: () => {
										setSmsTarget("expiring");
										toast.info("Switch to Bulk SMS tab to send reminders.");
									}
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(RetentionCard, {
									icon: Gift,
									title: "Win-Back Campaign",
									desc: `${retention.data?.suspended ?? 0} suspended customers. Target them with a special offer.`,
									action: "Start Win-Back",
									color: "red",
									onClick: () => {
										setSmsTarget("suspended");
										toast.info("Switch to Bulk SMS tab to send win-back campaign.");
									}
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(RetentionCard, {
									icon: Star,
									title: "Loyalty Rewards",
									desc: "Reward long-term customers with loyalty discounts and free days.",
									action: "Configure Rewards",
									color: "blue",
									onClick: () => toast.info("Loyalty rewards: Create a coupon code and share with long-term customers.")
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(RetentionCard, {
									icon: Megaphone,
									title: "Referral Program",
									desc: "Create referral codes and reward customers who bring new subscribers.",
									action: "Setup Referrals",
									color: "green",
									onClick: () => toast.info("Create a coupon code per customer and track via coupons tab.")
								})
							]
						})
					})
				]
			})
		]
	});
}
function KpiCard({ icon: Icon, label, value, color, sub }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "rounded-2xl border border-border/60 bg-card p-5",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex items-center justify-between mb-2",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "text-xs text-muted-foreground uppercase",
					children: label
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Icon, { className: `h-4 w-4 ${color}` })]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: `text-2xl font-bold ${color}`,
				children: value
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "text-xs text-muted-foreground mt-1",
				children: sub
			})
		]
	});
}
function RetentionCard({ icon: Icon, title, desc, action, color, onClick }) {
	const clr = {
		yellow: "text-yellow-500 bg-yellow-500/10",
		red: "text-red-500 bg-red-500/10",
		blue: "text-blue-500 bg-blue-500/10",
		green: "text-green-500 bg-green-500/10"
	}[color];
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "rounded-2xl border border-border/60 bg-card p-5 flex flex-col gap-3",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: `grid h-10 w-10 place-items-center rounded-xl ${clr}`,
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Icon, { className: "h-5 w-5" })
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
				className: "font-semibold",
				children: title
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-xs text-muted-foreground mt-1",
				children: desc
			})] }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
				variant: "outline",
				size: "sm",
				onClick,
				className: "self-start",
				children: action
			})
		]
	});
}
function LeadStatusBadge({ status }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
		className: `rounded-full px-2 py-0.5 text-xs capitalize ${{
			new: "bg-blue-500/15 text-blue-600",
			contacted: "bg-yellow-500/15 text-yellow-600",
			site_survey: "bg-orange-500/15 text-orange-600",
			installation: "bg-purple-500/15 text-purple-600",
			converted: "bg-green-500/15 text-green-600",
			lost: "bg-muted text-muted-foreground"
		}[status] ?? "bg-muted"}`,
		children: status?.replace("_", " ")
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
export { MarketingPage as component };
