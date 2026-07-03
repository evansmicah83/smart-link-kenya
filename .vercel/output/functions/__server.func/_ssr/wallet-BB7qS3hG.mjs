import { i as __toESM } from "../_runtime.mjs";
import { a as supabase, i as init_client } from "./client-D3kKP_Nv.mjs";
import { u as require_react } from "../_libs/@floating-ui/react-dom+[...].mjs";
import { s as require_jsx_runtime } from "../_libs/@radix-ui/react-arrow+[...].mjs";
import { i as useQueryClient, n as useQuery, t as useMutation } from "../_libs/tanstack__react-query.mjs";
import { a as useTenantId, i as useAuth } from "./auth-z02iFWqz.mjs";
import { t as Button } from "./button-DRsC1qZi.mjs";
import { t as Input } from "./input-DicJzR9-.mjs";
import { t as Label } from "./label-B4PTMSG2.mjs";
import { I as Plus, M as RefreshCw, O as Search, f as TrendingUp, o as Wallet, p as TrendingDown } from "../_libs/lucide-react.mjs";
import { a as DialogTitle, i as DialogHeader, n as DialogContent, r as DialogFooter, t as Dialog } from "./dialog-BpdftUtE.mjs";
import { a as SelectValue, i as SelectTrigger, n as SelectContent, r as SelectItem, t as Select } from "./select-DUy71i1r.mjs";
import { n as toast } from "../_libs/sonner.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/wallet-BB7qS3hG.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
init_client();
function WalletPage() {
	const { user } = useAuth();
	const qc = useQueryClient();
	const [open, setOpen] = (0, import_react.useState)(false);
	const [search, setSearch] = (0, import_react.useState)("");
	const [form, setForm] = (0, import_react.useState)({
		customer_id: "",
		amount: "",
		description: "Manual top-up"
	});
	const { data: tenantId } = useTenantId();
	const wallets = useQuery({
		queryKey: [
			"wallets",
			tenantId,
			search
		],
		queryFn: async () => {
			const { data, error } = await supabase.from("wallets").select("*, customers(full_name, phone)").eq("tenant_id", tenantId).order("balance", { ascending: false });
			if (error) throw error;
			const all = data ?? [];
			if (!search) return all;
			return all.filter((w) => w.customers?.full_name?.toLowerCase().includes(search.toLowerCase()) || w.customers?.phone?.includes(search));
		},
		enabled: !!tenantId
	});
	const transactions = useQuery({
		queryKey: ["wallet-txns", tenantId],
		queryFn: async () => {
			const { data, error } = await supabase.from("wallet_transactions").select("*, customers(full_name, phone)").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(100);
			if (error) throw error;
			return data ?? [];
		},
		enabled: !!tenantId
	});
	const customers = useQuery({
		queryKey: ["customers-list", tenantId],
		queryFn: async () => {
			const { data } = await supabase.from("customers").select("id,full_name,phone").eq("tenant_id", tenantId).order("full_name");
			return data ?? [];
		},
		enabled: !!tenantId
	});
	const topUp = useMutation({
		mutationFn: async () => {
			const { error } = await supabase.rpc("fn_wallet_credit", {
				_customer_id: form.customer_id,
				_tenant_id: tenantId,
				_amount: Number(form.amount),
				_description: form.description
			});
			if (error) throw error;
		},
		onSuccess: () => {
			toast.success("Wallet topped up");
			qc.invalidateQueries({ queryKey: ["wallets"] });
			qc.invalidateQueries({ queryKey: ["wallet-txns"] });
			setOpen(false);
			setForm({
				customer_id: "",
				amount: "",
				description: "Manual top-up"
			});
		},
		onError: (e) => toast.error(e.message)
	});
	const totalBalance = wallets.data?.reduce((s, w) => s + Number(w.balance), 0) ?? 0;
	const totalCredits = transactions.data?.filter((t) => t.type === "credit").reduce((s, t) => s + Number(t.amount), 0) ?? 0;
	const totalDebits = transactions.data?.filter((t) => t.type === "debit").reduce((s, t) => s + Number(t.amount), 0) ?? 0;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "space-y-6",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex items-center justify-between",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
					className: "text-2xl font-semibold",
					children: "Wallet Management"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "text-sm text-muted-foreground",
					children: "Customer wallet balances and transactions"
				})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex gap-2",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
						variant: "outline",
						onClick: () => qc.invalidateQueries({ queryKey: ["wallets"] }),
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(RefreshCw, { className: "h-4 w-4" })
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
						onClick: () => setOpen(true),
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Plus, { className: "h-4 w-4 mr-2" }), "Top Up Wallet"]
					})]
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "grid grid-cols-3 gap-4",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "rounded-xl border border-border/60 bg-card p-4",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex items-center justify-between mb-2",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "text-xs text-muted-foreground uppercase",
								children: "Total Balances"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Wallet, { className: "h-4 w-4 text-primary" })]
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "text-2xl font-bold",
							children: ["KES ", totalBalance.toLocaleString()]
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "rounded-xl border border-border/60 bg-card p-4",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex items-center justify-between mb-2",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "text-xs text-muted-foreground uppercase",
								children: "Total Credits"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TrendingUp, { className: "h-4 w-4 text-green-500" })]
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "text-2xl font-bold text-green-500",
							children: ["KES ", totalCredits.toLocaleString()]
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "rounded-xl border border-border/60 bg-card p-4",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex items-center justify-between mb-2",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "text-xs text-muted-foreground uppercase",
								children: "Total Debits"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TrendingDown, { className: "h-4 w-4 text-red-500" })]
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "text-2xl font-bold text-red-500",
							children: ["KES ", totalDebits.toLocaleString()]
						})]
					})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "grid lg:grid-cols-2 gap-6",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "rounded-xl border border-border/60 bg-card overflow-x-auto",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex items-center justify-between px-4 py-3 border-b border-border/60",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
							className: "font-semibold text-sm",
							children: "Customer Wallets"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "relative",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Search, { className: "absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
								className: "pl-8 h-8 text-xs w-48",
								placeholder: "Search...",
								value: search,
								onChange: (e) => setSearch(e.target.value)
							})]
						})]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("table", {
						className: "w-full text-sm min-w-[280px]",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("thead", {
							className: "bg-muted/40 text-xs uppercase text-muted-foreground",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
								className: "px-4 py-2 text-left",
								children: "Customer"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
								className: "px-4 py-2 text-right",
								children: "Balance"
							})] })
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tbody", { children: wallets.isLoading ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tr", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
							colSpan: 2,
							className: "px-4 py-8 text-center text-muted-foreground",
							children: "Loading..."
						}) }) : wallets.data?.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tr", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
							colSpan: 2,
							className: "px-4 py-8 text-center text-muted-foreground",
							children: "No wallets yet"
						}) }) : wallets.data?.map((w) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", {
							className: "border-t border-border/60 hover:bg-accent/30",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("td", {
								className: "px-4 py-2.5",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
									className: "font-medium text-sm",
									children: w.customers?.full_name ?? "—"
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
									className: "text-xs text-muted-foreground",
									children: w.customers?.phone
								})]
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("td", {
								className: `px-4 py-2.5 text-right font-semibold ${Number(w.balance) > 0 ? "text-green-500" : "text-muted-foreground"}`,
								children: ["KES ", Number(w.balance).toLocaleString()]
							})]
						}, w.id)) })]
					})]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "rounded-xl border border-border/60 bg-card overflow-x-auto",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "px-4 py-3 border-b border-border/60",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
							className: "font-semibold text-sm",
							children: "Recent Transactions"
						})
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("table", {
						className: "w-full text-sm min-w-[380px]",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("thead", {
							className: "bg-muted/40 text-xs uppercase text-muted-foreground",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", { children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
									className: "px-4 py-2 text-left",
									children: "Customer"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
									className: "px-4 py-2 text-left",
									children: "Type"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
									className: "px-4 py-2 text-right",
									children: "Amount"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
									className: "px-4 py-2 text-right",
									children: "Balance After"
								})
							] })
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tbody", { children: transactions.isLoading ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tr", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
							colSpan: 4,
							className: "px-4 py-8 text-center text-muted-foreground",
							children: "Loading..."
						}) }) : transactions.data?.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tr", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
							colSpan: 4,
							className: "px-4 py-8 text-center text-muted-foreground",
							children: "No transactions"
						}) }) : transactions.data?.map((t) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", {
							className: "border-t border-border/60 hover:bg-accent/30",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("td", {
									className: "px-4 py-2",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
										className: "text-sm font-medium",
										children: t.customers?.full_name ?? "—"
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
										className: "text-xs text-muted-foreground",
										children: new Date(t.created_at).toLocaleDateString()
									})]
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
									className: "px-4 py-2",
									children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: `rounded-full px-2 py-0.5 text-xs capitalize ${t.type === "credit" ? "bg-green-500/15 text-green-600" : "bg-red-500/15 text-red-600"}`,
										children: t.type
									})
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("td", {
									className: `px-4 py-2 text-right font-semibold ${t.type === "credit" ? "text-green-500" : "text-red-500"}`,
									children: [
										t.type === "credit" ? "+" : "-",
										"KES ",
										Number(t.amount).toLocaleString()
									]
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("td", {
									className: "px-4 py-2 text-right text-sm",
									children: ["KES ", Number(t.balance_after).toLocaleString()]
								})
							]
						}, t.id)) })]
					})]
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Dialog, {
				open,
				onOpenChange: setOpen,
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DialogContent, { children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(DialogHeader, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DialogTitle, { children: "Top Up Customer Wallet" }) }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "space-y-4",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "Customer *" }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Select, {
								onValueChange: (v) => setForm((f) => ({
									...f,
									customer_id: v
								})),
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectTrigger, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectValue, { placeholder: "Select customer" }) }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectContent, { children: customers.data?.map((c) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(SelectItem, {
									value: c.id,
									children: [
										c.full_name,
										" — ",
										c.phone
									]
								}, c.id)) })]
							})] }),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "Amount (KES) *" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
								type: "number",
								value: form.amount,
								onChange: (e) => setForm((f) => ({
									...f,
									amount: e.target.value
								}))
							})] }),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "Description" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
								value: form.description,
								onChange: (e) => setForm((f) => ({
									...f,
									description: e.target.value
								}))
							})] })
						]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DialogFooter, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
						variant: "outline",
						onClick: () => setOpen(false),
						children: "Cancel"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
						onClick: () => topUp.mutate(),
						disabled: !form.customer_id || !form.amount || topUp.isPending,
						children: topUp.isPending ? "Processing..." : "Top Up"
					})] })
				] })
			})
		]
	});
}
//#endregion
export { WalletPage as component };
