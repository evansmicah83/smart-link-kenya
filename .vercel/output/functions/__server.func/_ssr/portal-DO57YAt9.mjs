import { i as __toESM } from "../_runtime.mjs";
import { a as supabase, i as init_client } from "./client-D3kKP_Nv.mjs";
import { u as require_react } from "../_libs/@floating-ui/react-dom+[...].mjs";
import { s as require_jsx_runtime } from "../_libs/@radix-ui/react-arrow+[...].mjs";
import { Nt as ArrowLeft, P as QrCode, X as LoaderCircle, i as Wifi, mt as Clock, t as Zap, vt as CircleCheckBig, y as Star, yt as CircleAlert, z as PhoneCall } from "../_libs/lucide-react.mjs";
import { v as useSearch } from "../_libs/@tanstack/react-router+[...].mjs";
import { n as initiateStkPush, t as formatPhone } from "./mpesa-Daqc4JAO.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/portal-DO57YAt9.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
/**
* Public Captive Portal — /portal?isp=<slug>
* Supports: voucher login, OTP/phone login, package purchase + M-Pesa STK push.
* Works for MikroTik Hotspot, Apartment WiFi, Hotel, School, Estate, WISP.
*/
init_client();
function CaptivePortal() {
	const { isp, mac, ip, url } = useSearch({ from: "/portal/" });
	const [page, setPage] = (0, import_react.useState)("landing");
	const [brand, setBrand] = (0, import_react.useState)({});
	const [tenantId, setTenantId] = (0, import_react.useState)(null);
	const [packages, setPackages] = (0, import_react.useState)([]);
	const [loginMode, setLoginMode] = (0, import_react.useState)("phone");
	const [phone, setPhone] = (0, import_react.useState)("");
	const [otp, setOtp] = (0, import_react.useState)("");
	const [otpSent, setOtpSent] = (0, import_react.useState)(false);
	const [voucher, setVoucher] = (0, import_react.useState)("");
	const [selectedPkg, setSelectedPkg] = (0, import_react.useState)(null);
	const [loading, setLoading] = (0, import_react.useState)(false);
	const [checkoutId, setCheckoutId] = (0, import_react.useState)(null);
	const [pollInterval, setPollInterval] = (0, import_react.useState)(null);
	const [error, setError] = (0, import_react.useState)("");
	const [successMsg, setSuccessMsg] = (0, import_react.useState)("");
	(0, import_react.useEffect)(() => {
		if (!isp) return;
		(async () => {
			const { data: tenant } = await supabase.from("tenants").select("id, name").eq("slug", isp).maybeSingle();
			if (!tenant) return;
			setTenantId(tenant.id);
			const [brandRes, pkgRes] = await Promise.all([supabase.from("tenant_branding").select("*").eq("tenant_id", tenant.id).maybeSingle(), supabase.from("packages").select("*").eq("tenant_id", tenant.id).eq("is_active", true).in("type", ["hotspot", "voucher"]).order("price")]);
			if (brandRes.data) setBrand({
				...brandRes.data,
				company_name: tenant.name
			});
			else setBrand({ company_name: tenant.name });
			setPackages(pkgRes.data ?? []);
			if (brandRes.data?.primary_color) {
				document.documentElement.style.setProperty("--primary", brandRes.data.primary_color);
				document.documentElement.style.setProperty("--sidebar-primary", brandRes.data.primary_color);
			}
		})();
	}, [isp]);
	(0, import_react.useEffect)(() => {
		if (!checkoutId) return;
		const id = setInterval(async () => {
			const { data } = await supabase.from("payments").select("status, id").eq("checkout_request_id", checkoutId).maybeSingle();
			if (data?.status === "completed") {
				clearInterval(id);
				setSuccessMsg("Payment confirmed! Connecting you to the internet…");
				setPage("success");
				if (url) setTimeout(() => {
					window.location.href = url;
				}, 3e3);
			} else if (data?.status === "failed") {
				clearInterval(id);
				setError("Payment failed. Please try again.");
				setPage("error");
			}
		}, 3e3);
		setPollInterval(id);
		return () => clearInterval(id);
	}, [checkoutId]);
	async function handleVoucherLogin() {
		setLoading(true);
		setError("");
		try {
			const { data } = await supabase.from("vouchers").select("id, status, packages(name)").eq("tenant_id", tenantId).eq("code", voucher.trim().toUpperCase()).eq("status", "unused").maybeSingle();
			if (!data) throw new Error("Invalid or already used voucher code.");
			await supabase.from("vouchers").update({
				status: "active",
				used_at: (/* @__PURE__ */ new Date()).toISOString(),
				mac_address: mac ?? null,
				ip_address: ip ?? null
			}).eq("id", data.id);
			setSuccessMsg(`Voucher accepted! You're connected with ${data.packages?.name ?? "internet access"}.`);
			setPage("success");
			if (url) setTimeout(() => {
				window.location.href = url;
			}, 2500);
		} catch (e) {
			setError(e.message);
		} finally {
			setLoading(false);
		}
	}
	async function handleStkPush() {
		if (!selectedPkg || !tenantId) return;
		setLoading(true);
		setError("");
		try {
			const fmtPhone = formatPhone(phone);
			let { data: customer } = await supabase.from("customers").select("id").eq("tenant_id", tenantId).eq("phone", fmtPhone).maybeSingle();
			if (!customer) {
				const { data: nc } = await supabase.from("customers").insert({
					tenant_id: tenantId,
					phone: fmtPhone,
					full_name: `WiFi User ${fmtPhone.slice(-4)}`,
					category: "residential",
					status: "active"
				}).select("id").single();
				customer = nc;
			}
			setCheckoutId((await initiateStkPush({
				tenantId,
				phone: fmtPhone,
				amount: selectedPkg.price,
				accountRef: `WIFI-${fmtPhone.slice(-4)}`,
				description: selectedPkg.name,
				customerId: customer.id
			})).checkoutRequestId);
			setPage("payment");
		} catch (e) {
			setError(e.message ?? "Payment initiation failed.");
		} finally {
			setLoading(false);
		}
	}
	brand.primary_color;
	const featuredPackages = packages.filter((pkg) => pkg.is_popular || pkg.price <= 500);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center px-4 py-8",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "w-full max-w-md",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "text-center mb-6",
					children: [brand.logo_url ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
						src: brand.logo_url,
						alt: "Logo",
						className: "h-12 w-auto mx-auto object-contain"
					}) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex items-center justify-center gap-2",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "grid h-10 w-10 place-items-center rounded-xl bg-primary text-primary-foreground",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Wifi, { className: "h-5 w-5" })
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "text-xl font-bold text-white",
							children: brand.company_name ?? "WiFi"
						})]
					}), brand.portal_tagline && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-2 text-sm text-slate-400",
						children: brand.portal_tagline
					})]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 overflow-hidden shadow-2xl",
					children: [
						page === "landing" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "p-6 space-y-4",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
									className: "text-lg font-bold text-white text-center",
									children: "Get Connected"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: "text-sm text-slate-400 text-center",
									children: "Fast, reliable internet for homes, apartments, hotels, schools, and events."
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "space-y-2",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(PortalBtn, {
										icon: PhoneCall,
										label: "Buy with M-Pesa",
										sub: "Instant STK push and activation",
										onClick: () => {
											setLoginMode("phone");
											setPage("packages");
										},
										primary: true
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PortalBtn, {
										icon: QrCode,
										label: "Enter Voucher Code",
										sub: "Activate with a prepaid code",
										onClick: () => {
											setLoginMode("voucher");
											setPage("login");
										}
									})]
								}),
								featuredPackages.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "rounded-xl border border-white/10 bg-white/5 p-3",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
										className: "text-xs font-semibold uppercase tracking-wide text-slate-400",
										children: "Popular today"
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
										className: "mt-2 space-y-2",
										children: featuredPackages.slice(0, 2).map((pkg) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
											className: "flex items-center justify-between rounded-lg bg-black/20 px-3 py-2",
											children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
												className: "text-sm font-medium text-white",
												children: pkg.name
											}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
												className: "text-xs text-slate-400",
												children: pkg.duration_days > 0 ? `${pkg.duration_days} day access` : "Flexible access"
											})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
												className: "text-sm font-semibold text-primary",
												children: ["KES ", Number(pkg.price).toLocaleString()]
											})]
										}, pkg.id))
									})]
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "flex justify-center gap-3 text-xs text-slate-500",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
										className: "hover:text-primary",
										onClick: () => setPage("terms"),
										children: "Terms"
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
										className: "hover:text-primary",
										onClick: () => setPage("support"),
										children: "Support"
									})]
								}),
								brand.support_phone && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
									className: "text-center text-xs text-slate-500 pt-2",
									children: ["Need help? ", /* @__PURE__ */ (0, import_jsx_runtime.jsx)("a", {
										href: `tel:${brand.support_phone}`,
										className: "text-primary hover:underline",
										children: brand.support_phone
									})]
								})
							]
						}),
						page === "login" && loginMode === "voucher" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "p-6 space-y-4",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(BackBtn, { onClick: () => setPage("landing") }),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
									className: "text-lg font-bold text-white",
									children: "Enter Voucher"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: "text-sm text-slate-400",
									children: "Enter the code printed on your voucher card"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
									className: "w-full rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-white text-center text-lg font-mono tracking-widest placeholder:text-slate-500 focus:outline-none focus:border-primary uppercase",
									placeholder: "XXXXXXXX",
									value: voucher,
									onChange: (e) => setVoucher(e.target.value.toUpperCase()),
									maxLength: 12
								}),
								error && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ErrorMsg, { msg: error }),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
									onClick: handleVoucherLogin,
									disabled: loading || voucher.length < 6,
									className: "w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2",
									children: [loading ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(LoaderCircle, { className: "h-4 w-4 animate-spin" }) : null, "Connect Now"]
								})
							]
						}),
						page === "terms" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "p-6 space-y-4",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(BackBtn, { onClick: () => setPage("landing") }),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
									className: "text-lg font-bold text-white",
									children: "Terms & Fair Usage"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "space-y-2 text-sm text-slate-400",
									children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "Access is subject to availability and package terms." }),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "Fair usage policies may apply during peak periods." }),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "Payments are non-refundable once service has been activated." })
									]
								})
							]
						}),
						page === "support" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "p-6 space-y-4",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(BackBtn, { onClick: () => setPage("landing") }),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
									className: "text-lg font-bold text-white",
									children: "Contact Support"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "space-y-2 text-sm text-slate-400",
									children: [
										brand.support_phone && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { children: ["Call: ", /* @__PURE__ */ (0, import_jsx_runtime.jsx)("a", {
											href: `tel:${brand.support_phone}`,
											className: "text-primary hover:underline",
											children: brand.support_phone
										})] }),
										brand.support_email && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { children: ["Email: ", /* @__PURE__ */ (0, import_jsx_runtime.jsx)("a", {
											href: `mailto:${brand.support_email}`,
											className: "text-primary hover:underline",
											children: brand.support_email
										})] }),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "Our team can assist with activation, payments, and service issues." })
									]
								})
							]
						}),
						page === "packages" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "p-6 space-y-4",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(BackBtn, { onClick: () => setPage("landing") }),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
									className: "text-lg font-bold text-white",
									children: "Choose a Package"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: "text-sm text-slate-400",
									children: "Select a plan that fits your usage and budget."
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "space-y-2 max-h-72 overflow-y-auto pr-1",
									children: [packages.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
										className: "text-sm text-slate-400 text-center py-4",
										children: "No packages available."
									}), packages.map((pkg) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
										onClick: () => setSelectedPkg(pkg),
										className: `w-full rounded-xl border px-4 py-3 text-left transition ${selectedPkg?.id === pkg.id ? "border-primary bg-primary/20" : "border-white/10 bg-white/5 hover:bg-white/10"}`,
										children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
											className: "flex items-center justify-between",
											children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
												className: "flex items-center gap-2",
												children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
													className: "font-semibold text-white text-sm",
													children: pkg.name
												}), pkg.is_popular && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
													className: "rounded-full bg-primary/30 text-primary px-1.5 py-0.5 text-[10px] font-bold flex items-center gap-0.5",
													children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Star, { className: "h-2.5 w-2.5" }), "Popular"]
												})]
											}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
												className: "text-xs text-slate-400 mt-0.5 flex gap-2",
												children: [
													pkg.duration_days > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
														/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Clock, { className: "h-3 w-3 inline" }),
														" ",
														pkg.duration_days === 1 ? "1 Day" : pkg.duration_days < 7 ? `${pkg.duration_days} Days` : pkg.duration_days === 7 ? "1 Week" : pkg.duration_days === 30 ? "1 Month" : `${pkg.duration_days}d`
													] }),
													pkg.speed_limit && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
														/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Zap, { className: "h-3 w-3 inline" }),
														" ",
														pkg.speed_limit
													] }),
													pkg.data_limit && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: pkg.data_limit })
												]
											})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
												className: "font-bold text-primary",
												children: ["KES ", Number(pkg.price).toLocaleString()]
											})]
										})
									}, pkg.id))]
								}),
								selectedPkg && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "space-y-3 pt-2 border-t border-white/10",
									children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
											className: "text-sm text-slate-300",
											children: "Enter your M-Pesa phone number"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
											className: "w-full rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-white placeholder:text-slate-500 focus:outline-none focus:border-primary",
											placeholder: "07XX XXX XXX",
											value: phone,
											onChange: (e) => setPhone(e.target.value),
											type: "tel"
										}),
										error && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ErrorMsg, { msg: error }),
										/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
											onClick: handleStkPush,
											disabled: loading || phone.length < 9,
											className: "w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2",
											children: [
												loading ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(LoaderCircle, { className: "h-4 w-4 animate-spin" }) : null,
												"Pay KES ",
												Number(selectedPkg.price).toLocaleString(),
												" via M-Pesa"
											]
										})
									]
								})
							]
						}),
						page === "payment" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "p-6 text-center space-y-4",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
									className: "grid h-16 w-16 mx-auto place-items-center rounded-full bg-primary/20 animate-pulse",
									children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PhoneCall, { className: "h-7 w-7 text-primary" })
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
									className: "text-lg font-bold text-white",
									children: "Check Your Phone"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
									className: "text-sm text-slate-400",
									children: [
										"An M-Pesa STK push has been sent to ",
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
											className: "text-white font-medium",
											children: phone
										}),
										". Enter your PIN to complete payment."
									]
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "flex items-center justify-center gap-2 text-xs text-slate-500",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(LoaderCircle, { className: "h-3.5 w-3.5 animate-spin" }), "Waiting for payment confirmation…"]
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
									onClick: () => {
										setPage("packages");
										clearInterval(pollInterval);
									},
									className: "text-xs text-slate-500 hover:text-white underline",
									children: "Cancel"
								})
							]
						}),
						page === "success" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "p-6 text-center space-y-4",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
									className: "grid h-16 w-16 mx-auto place-items-center rounded-full bg-green-500/20",
									children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CircleCheckBig, { className: "h-8 w-8 text-green-400" })
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
									className: "text-xl font-bold text-white",
									children: "You're Connected! 🎉"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: "text-sm text-slate-400",
									children: successMsg || "Enjoy your internet access."
								}),
								url && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: "text-xs text-slate-500",
									children: "Redirecting you automatically…"
								})
							]
						}),
						page === "error" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "p-6 text-center space-y-4",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
									className: "grid h-16 w-16 mx-auto place-items-center rounded-full bg-red-500/20",
									children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CircleAlert, { className: "h-8 w-8 text-red-400" })
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
									className: "text-lg font-bold text-white",
									children: "Something went wrong"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: "text-sm text-slate-400",
									children: error || "An unexpected error occurred."
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
									onClick: () => {
										setPage("landing");
										setError("");
									},
									className: "w-full rounded-xl bg-primary py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90",
									children: "Try Again"
								})
							]
						})
					]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
					className: "mt-4 text-center text-xs text-slate-600",
					children: [
						"By connecting you agree to our ",
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("a", {
							href: "#",
							className: "underline",
							children: "Terms of Use"
						}),
						" & ",
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("a", {
							href: "#",
							className: "underline",
							children: "Fair Usage Policy"
						}),
						"."
					]
				})
			]
		})
	});
}
function PortalBtn({ icon: Icon, label, sub, onClick, primary }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
		onClick,
		className: `w-full flex items-center gap-3 rounded-xl px-4 py-3 text-left transition ${primary ? "bg-primary text-primary-foreground hover:opacity-90" : "border border-white/10 bg-white/5 text-white hover:bg-white/10"}`,
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: `grid h-9 w-9 shrink-0 place-items-center rounded-lg ${primary ? "bg-primary-foreground/20" : "bg-white/10"}`,
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Icon, { className: "h-4 w-4" })
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "font-semibold text-sm",
			children: label
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: `text-xs ${primary ? "opacity-80" : "text-slate-400"}`,
			children: sub
		})] })]
	});
}
function BackBtn({ onClick }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
		onClick,
		className: "flex items-center gap-1 text-xs text-slate-400 hover:text-white mb-2",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ArrowLeft, { className: "h-3.5 w-3.5" }), " Back"]
	});
}
function ErrorMsg({ msg }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flex items-center gap-2 rounded-lg bg-red-500/15 border border-red-500/30 px-3 py-2 text-xs text-red-400",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(CircleAlert, { className: "h-3.5 w-3.5 shrink-0" }),
			" ",
			msg
		]
	});
}
//#endregion
export { CaptivePortal as component };
