import { i as __toESM } from "../_runtime.mjs";
import { a as supabase, i as init_client } from "./client-D3kKP_Nv.mjs";
import { u as require_react } from "../_libs/@floating-ui/react-dom+[...].mjs";
import { s as require_jsx_runtime } from "../_libs/@radix-ui/react-arrow+[...].mjs";
import { X as LoaderCircle, i as Wifi } from "../_libs/lucide-react.mjs";
import { n as toast } from "../_libs/sonner.mjs";
import { _ as useNavigate, g as Link } from "../_libs/@tanstack/react-router+[...].mjs";
import { t as Route } from "./auth-DjMDBomL.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/auth-dV0y1-8R.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
init_client();
var lovable = { auth: { signInWithOAuth: async (provider, opts) => {
	const { error } = await supabase.auth.signInWithOAuth({
		provider: provider === "microsoft" ? "azure" : provider,
		options: { redirectTo: opts?.redirect_uri }
	});
	if (error) return {
		error,
		redirected: false
	};
	return {
		error: null,
		redirected: true
	};
} } };
init_client();
function AuthPage() {
	const navigate = useNavigate();
	const search = Route.useSearch();
	const [mounted, setMounted] = (0, import_react.useState)(false);
	const [mode, setMode] = (0, import_react.useState)(search.mode ?? "signin");
	const [email, setEmail] = (0, import_react.useState)("");
	const [password, setPassword] = (0, import_react.useState)("");
	const [fullName, setFullName] = (0, import_react.useState)("");
	const [companyName, setCompanyName] = (0, import_react.useState)("");
	const [loading, setLoading] = (0, import_react.useState)(false);
	const [oauthLoading, setOauthLoading] = (0, import_react.useState)(false);
	(0, import_react.useEffect)(() => {
		setMounted(true);
	}, []);
	(0, import_react.useEffect)(() => {
		if (!mounted) return;
		supabase.auth.getSession().then(({ data }) => {
			if (data.session) navigate({ to: "/dashboard" });
		});
	}, [mounted, navigate]);
	if (!mounted) return null;
	async function handleSubmit(e) {
		e.preventDefault();
		setLoading(true);
		try {
			if (mode === "signup") {
				const { data, error } = await supabase.auth.signUp({
					email,
					password,
					options: {
						emailRedirectTo: `${window.location.origin}/dashboard`,
						data: {
							full_name: fullName,
							company_name: companyName
						}
					}
				});
				if (error) throw error;
				if (data.session) {
					toast.success("Welcome to SmartLinkNet");
					navigate({ to: "/dashboard" });
				} else toast.success("Check your email to confirm your account.");
			} else {
				const { error } = await supabase.auth.signInWithPassword({
					email,
					password
				});
				if (error) throw error;
				toast.success("Signed in");
				navigate({ to: "/dashboard" });
			}
		} catch (err) {
			const msg = err instanceof Error ? err.message : "Authentication failed";
			toast.error(msg);
		} finally {
			setLoading(false);
		}
	}
	async function handleGoogle() {
		setOauthLoading(true);
		try {
			const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: `${window.location.origin}/dashboard` });
			if (result.error) {
				toast.error(result.error.message ?? "Google sign-in failed");
				return;
			}
			if (result.redirected) return;
			navigate({ to: "/dashboard" });
		} finally {
			setOauthLoading(false);
		}
	}
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "min-h-screen gradient-hero flex items-center justify-center px-4",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "w-full max-w-md",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Link, {
				to: "/",
				className: "mb-8 flex items-center justify-center gap-2",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "grid h-9 w-9 place-items-center rounded-md bg-primary text-primary-foreground",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Wifi, { className: "h-4 w-4" })
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
					className: "text-xl font-semibold",
					children: ["SmartLink", /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "text-primary",
						children: "Net"
					})]
				})]
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "rounded-2xl border border-border/60 bg-card/80 p-8 backdrop-blur-xl",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
						className: "text-2xl font-semibold",
						children: mode === "signin" ? "Welcome back" : "Create your account"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-1 text-sm text-muted-foreground",
						children: mode === "signin" ? "Sign in to your ISP dashboard" : "Start your 14-day SmartLinkNet trial"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
						onClick: handleGoogle,
						disabled: oauthLoading,
						className: "mt-6 flex w-full items-center justify-center gap-2 rounded-md border border-input bg-background/50 px-4 py-2.5 text-sm font-medium hover:bg-accent disabled:opacity-50",
						children: [oauthLoading ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(LoaderCircle, { className: "h-4 w-4 animate-spin" }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(GoogleIcon, {}), "Continue with Google"]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "my-6 flex items-center gap-3 text-xs text-muted-foreground",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "h-px flex-1 bg-border" }),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "or with email" }),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "h-px flex-1 bg-border" })
						]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("form", {
						onSubmit: handleSubmit,
						className: "space-y-4",
						children: [
							mode === "signup" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
								label: "Full name",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
									required: true,
									value: fullName,
									onChange: (e) => setFullName(e.target.value),
									className: "w-full rounded-md border border-input bg-background/50 px-3 py-2 text-sm outline-none focus:border-primary",
									placeholder: "Jane Wanjiru"
								})
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
								label: "Company / ISP name",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
									required: true,
									value: companyName,
									onChange: (e) => setCompanyName(e.target.value),
									className: "w-full rounded-md border border-input bg-background/50 px-3 py-2 text-sm outline-none focus:border-primary",
									placeholder: "SwiftNet Limited"
								})
							})] }),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
								label: "Email",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
									type: "email",
									required: true,
									value: email,
									onChange: (e) => setEmail(e.target.value),
									className: "w-full rounded-md border border-input bg-background/50 px-3 py-2 text-sm outline-none focus:border-primary",
									placeholder: "Email"
								})
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
								label: "Password",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
									type: "password",
									required: true,
									minLength: 8,
									value: password,
									onChange: (e) => setPassword(e.target.value),
									className: "w-full rounded-md border border-input bg-background/50 px-3 py-2 text-sm outline-none focus:border-primary",
									placeholder: "Password"
								})
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
								disabled: loading,
								className: "mt-2 flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50",
								children: [loading && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(LoaderCircle, { className: "h-4 w-4 animate-spin" }), mode === "signin" ? "Sign in" : "Create account"]
							})
						]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
						className: "mt-6 text-center text-sm text-muted-foreground",
						children: [mode === "signin" ? "No account yet? " : "Already have an account? ", /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							onClick: () => setMode(mode === "signin" ? "signup" : "signin"),
							className: "font-medium text-primary hover:underline",
							children: mode === "signin" ? "Create one" : "Sign in"
						})]
					})
				]
			})]
		})
	});
}
function Field({ label, children }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
		className: "block",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
			className: "mb-1 block text-xs font-medium text-muted-foreground",
			children: label
		}), children]
	});
}
function GoogleIcon() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("svg", {
		width: "16",
		height: "16",
		viewBox: "0 0 48 48",
		"aria-hidden": true,
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", {
				fill: "#FFC107",
				d: "M43.6 20.5H42V20H24v8h11.3C33.7 32.4 29.3 35.5 24 35.5c-6.4 0-11.5-5.1-11.5-11.5S17.6 12.5 24 12.5c2.9 0 5.6 1.1 7.6 2.9l5.7-5.7C33.6 6.4 29 4.5 24 4.5 13.2 4.5 4.5 13.2 4.5 24S13.2 43.5 24 43.5 43.5 34.8 43.5 24c0-1.2-.1-2.4-.3-3.5z"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", {
				fill: "#FF3D00",
				d: "M6.3 14.7l6.6 4.8C14.6 16 18.9 12.5 24 12.5c2.9 0 5.6 1.1 7.6 2.9l5.7-5.7C33.6 6.4 29 4.5 24 4.5 16.3 4.5 9.7 8.9 6.3 14.7z"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", {
				fill: "#4CAF50",
				d: "M24 43.5c5.2 0 9.8-1.8 13.3-4.8l-6.1-5c-2 1.4-4.4 2.3-7.2 2.3-5.3 0-9.7-3.4-11.3-8.1l-6.5 5C9.5 39 16.2 43.5 24 43.5z"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", {
				fill: "#1976D2",
				d: "M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.5l6.1 5C40.7 35.4 43.5 30.1 43.5 24c0-1.2-.1-2.4-.3-3.5z"
			})
		]
	});
}
//#endregion
export { AuthPage as component };
