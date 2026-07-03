import { i as __toESM } from "../_runtime.mjs";
import { a as supabase, i as init_client } from "./client-D3kKP_Nv.mjs";
import { u as require_react } from "../_libs/@floating-ui/react-dom+[...].mjs";
import { s as require_jsx_runtime } from "../_libs/@radix-ui/react-arrow+[...].mjs";
import { i as useQueryClient, n as useQuery, t as useMutation } from "../_libs/tanstack__react-query.mjs";
import { a as useTenantId, i as useAuth } from "./auth-z02iFWqz.mjs";
import { t as Button } from "./button-DRsC1qZi.mjs";
import { t as Input } from "./input-DicJzR9-.mjs";
import { t as Label } from "./label-B4PTMSG2.mjs";
import { I as Plus, dt as CreditCard, f as TrendingUp, o as Wallet, p as TrendingDown, rt as FileText, x as Smartphone, yt as CircleAlert } from "../_libs/lucide-react.mjs";
import { a as DialogTitle, i as DialogHeader, n as DialogContent, r as DialogFooter, t as Dialog } from "./dialog-BpdftUtE.mjs";
import { a as SelectValue, i as SelectTrigger, n as SelectContent, r as SelectItem, t as Select } from "./select-DUy71i1r.mjs";
import { i as TabsTrigger, n as TabsContent, r as TabsList, t as Tabs } from "./tabs-WTjz7Ps0.mjs";
import { n as toast } from "../_libs/sonner.mjs";
import { a as objectType, n as coerce, o as stringType } from "../_libs/zod.mjs";
import { n as useForm, t as u } from "../_libs/@hookform/resolvers+[...].mjs";
import { t as Textarea } from "./textarea-DBn9CRiI.mjs";
import { n as initiateStkPush, t as formatPhone } from "./mpesa-Daqc4JAO.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/billing-pfesDkNz.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
init_client();
var paymentSchema = objectType({
	customer_id: stringType().min(1, "Customer required"),
	amount: coerce.number().min(1, "Amount required"),
	method: stringType().min(1).default("mpesa"),
	phone: stringType().optional(),
	reference: stringType().optional(),
	notes: stringType().optional()
});
var invoiceSchema = objectType({
	customer_id: stringType().min(1),
	description: stringType().min(1),
	amount: coerce.number().min(1),
	due_date: stringType().optional(),
	notes: stringType().optional()
});
var expenseSchema = objectType({
	category: stringType().min(1),
	description: stringType().min(1),
	amount: coerce.number().min(1),
	date: stringType().min(1).default(() => (/* @__PURE__ */ new Date()).toISOString().split("T")[0])
});
var STATUS_COLORS = {
	completed: "bg-green-500/15 text-green-600",
	pending: "bg-yellow-500/15 text-yellow-600",
	failed: "bg-red-500/15 text-red-600",
	refunded: "bg-blue-500/15 text-blue-600",
	paid: "bg-green-500/15 text-green-600",
	unpaid: "bg-red-500/15 text-red-600",
	partial: "bg-yellow-500/15 text-yellow-600",
	overdue: "bg-red-500/15 text-red-600"
};
function BillingPage() {
	const { user } = useAuth();
	const qc = useQueryClient();
	const { data: tenantId } = useTenantId();
	const [payOpen, setPayOpen] = (0, import_react.useState)(false);
	const [invoiceOpen, setInvoiceOpen] = (0, import_react.useState)(false);
	const [expenseOpen, setExpenseOpen] = (0, import_react.useState)(false);
	const [stkLoading, setStkLoading] = (0, import_react.useState)(false);
	const [tab, setTab] = (0, import_react.useState)("payments");
	const payments = useQuery({
		queryKey: ["payments", tenantId],
		queryFn: async () => {
			const { data, error } = await supabase.from("payments").select("*, customers(full_name, phone)").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(200);
			if (error) throw error;
			return data ?? [];
		},
		enabled: !!tenantId
	});
	const invoices = useQuery({
		queryKey: ["invoices", tenantId],
		queryFn: async () => {
			const { data, error } = await supabase.from("invoices").select("*, customers(full_name, phone)").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(200);
			if (error) throw error;
			return data ?? [];
		},
		enabled: !!tenantId
	});
	const expenses = useQuery({
		queryKey: ["expenses", tenantId],
		queryFn: async () => {
			const { data, error } = await supabase.from("expenses").select("*").eq("tenant_id", tenantId).order("date", { ascending: false }).limit(200);
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
	const payForm = useForm({ resolver: u(paymentSchema) });
	const invForm = useForm({ resolver: u(invoiceSchema) });
	const expForm = useForm({ resolver: u(expenseSchema) });
	const savePayment = useMutation({
		mutationFn: async (data) => {
			const { error } = await supabase.from("payments").insert({
				...data,
				tenant_id: tenantId,
				status: "completed"
			});
			if (error) throw error;
		},
		onSuccess: () => {
			toast.success("Payment recorded");
			qc.invalidateQueries({ queryKey: ["payments"] });
			setPayOpen(false);
			payForm.reset();
		},
		onError: (e) => toast.error(e.message)
	});
	async function handleStkPush(data) {
		if (!data.phone) {
			toast.error("Phone number required for M-Pesa");
			return;
		}
		setStkLoading(true);
		try {
			const result = await initiateStkPush({
				tenantId,
				phone: formatPhone(data.phone),
				amount: data.amount,
				accountRef: "SMARTLINKNET",
				description: data.notes ?? "Internet payment",
				customerId: data.customer_id
			});
			await supabase.from("payments").insert({
				tenant_id: tenantId,
				customer_id: data.customer_id,
				amount: data.amount,
				method: "mpesa",
				status: "pending",
				phone: formatPhone(data.phone),
				reference: result.checkoutRequestId,
				notes: `STK Push sent. RequestID: ${result.checkoutRequestId}`
			});
			toast.success("STK Push sent to " + data.phone + ". Customer will receive a prompt.");
			qc.invalidateQueries({ queryKey: ["payments"] });
			setPayOpen(false);
			payForm.reset();
		} catch (e) {
			toast.error(e.message ?? "STK Push failed");
		} finally {
			setStkLoading(false);
		}
	}
	const saveInvoice = useMutation({
		mutationFn: async (data) => {
			const { data: inv, error } = await supabase.from("invoices").insert({
				tenant_id: tenantId,
				customer_id: data.customer_id,
				subtotal: data.amount,
				total: data.amount,
				status: "unpaid",
				due_date: data.due_date || null,
				notes: data.notes
			}).select().single();
			if (error) throw error;
			await supabase.from("invoice_items").insert({
				invoice_id: inv.id,
				description: data.description,
				quantity: 1,
				unit_price: data.amount,
				total: data.amount
			});
		},
		onSuccess: () => {
			toast.success("Invoice created");
			qc.invalidateQueries({ queryKey: ["invoices"] });
			setInvoiceOpen(false);
			invForm.reset();
		},
		onError: (e) => toast.error(e.message)
	});
	const saveExpense = useMutation({
		mutationFn: async (data) => {
			const { error } = await supabase.from("expenses").insert({
				...data,
				tenant_id: tenantId,
				created_by: user?.id
			});
			if (error) throw error;
		},
		onSuccess: () => {
			toast.success("Expense recorded");
			qc.invalidateQueries({ queryKey: ["expenses"] });
			setExpenseOpen(false);
			expForm.reset();
		},
		onError: (e) => toast.error(e.message)
	});
	const markPaid = useMutation({
		mutationFn: async (id) => {
			const inv = invoices.data?.find((i) => i.id === id);
			if (!inv) return;
			const { error } = await supabase.from("invoices").update({
				status: "paid",
				amount_paid: inv.total,
				paid_at: (/* @__PURE__ */ new Date()).toISOString()
			}).eq("id", id);
			if (error) throw error;
		},
		onSuccess: () => {
			toast.success("Marked as paid");
			qc.invalidateQueries({ queryKey: ["invoices"] });
		},
		onError: (e) => toast.error(e.message)
	});
	const totalRevenue = payments.data?.filter((p) => p.status === "completed").reduce((s, p) => s + Number(p.amount), 0) ?? 0;
	const pendingAmount = invoices.data?.filter((i) => i.status === "unpaid").reduce((s, i) => s + Number(i.total), 0) ?? 0;
	const totalExpenses = expenses.data?.reduce((s, e) => s + Number(e.amount), 0) ?? 0;
	const netProfit = totalRevenue - totalExpenses;
	const watchMethod = payForm.watch("method");
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "space-y-6 w-full",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex flex-col sm:flex-row sm:items-center justify-between gap-3",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
					className: "text-2xl font-semibold",
					children: "Billing"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "text-sm text-muted-foreground",
					children: "Payments, invoices, expenses and financial records"
				})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex flex-wrap gap-2",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
							variant: "outline",
							onClick: () => setExpenseOpen(true),
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TrendingDown, { className: "h-4 w-4 mr-2" }), "Add Expense"]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
							variant: "outline",
							onClick: () => setInvoiceOpen(true),
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(FileText, { className: "h-4 w-4 mr-2" }), "Create Invoice"]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
							onClick: () => {
								payForm.reset();
								setPayOpen(true);
							},
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Plus, { className: "h-4 w-4 mr-2" }), "Record Payment"]
						})
					]
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "grid grid-cols-2 lg:grid-cols-4 gap-4",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(StatCard, {
						icon: TrendingUp,
						label: "Total Revenue",
						value: `KES ${totalRevenue.toLocaleString()}`,
						color: "text-green-500"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(StatCard, {
						icon: CircleAlert,
						label: "Unpaid Invoices",
						value: `KES ${pendingAmount.toLocaleString()}`,
						color: "text-yellow-500"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(StatCard, {
						icon: TrendingDown,
						label: "Total Expenses",
						value: `KES ${totalExpenses.toLocaleString()}`,
						color: "text-red-500"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(StatCard, {
						icon: Wallet,
						label: "Net Profit",
						value: `KES ${netProfit.toLocaleString()}`,
						color: netProfit >= 0 ? "text-green-500" : "text-red-500"
					})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Tabs, {
				value: tab,
				onValueChange: setTab,
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(TabsList, {
						className: "w-full flex",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(TabsTrigger, {
								value: "payments",
								className: "flex-1 text-xs sm:text-sm",
								children: [
									"Payments (",
									payments.data?.length ?? 0,
									")"
								]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(TabsTrigger, {
								value: "invoices",
								className: "flex-1 text-xs sm:text-sm",
								children: [
									"Invoices (",
									invoices.data?.length ?? 0,
									")"
								]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(TabsTrigger, {
								value: "expenses",
								className: "flex-1 text-xs sm:text-sm",
								children: [
									"Expenses (",
									expenses.data?.length ?? 0,
									")"
								]
							})
						]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TabsContent, {
						value: "payments",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DataTable, {
							loading: payments.isLoading,
							cols: [
								"Customer",
								"Amount",
								"Method",
								"Reference",
								"Status",
								"Date"
							],
							empty: "No payments yet",
							children: payments.data?.map((p) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", {
								className: "border-t border-border/60 hover:bg-accent/30",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("td", {
										"data-label": "Customer",
										className: "px-4 py-3",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
											className: "font-medium",
											children: p.customers?.full_name ?? "—"
										}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
											className: "text-xs text-muted-foreground",
											children: p.customers?.phone
										})]
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("td", {
										"data-label": "Amount",
										className: "px-4 py-3 font-semibold text-green-500",
										children: ["KES ", Number(p.amount).toLocaleString()]
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("td", {
										"data-label": "Method",
										className: "px-4 py-3 capitalize text-sm flex items-center gap-1",
										children: [p.method === "mpesa" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Smartphone, { className: "h-3 w-3" }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CreditCard, { className: "h-3 w-3" }), p.method]
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
										"data-label": "Reference",
										className: "px-4 py-3 text-xs text-muted-foreground font-mono",
										children: p.mpesa_receipt ?? p.reference ?? "—"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
										"data-label": "Status",
										className: "px-4 py-3",
										children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
											className: `rounded-full px-2 py-0.5 text-xs capitalize ${STATUS_COLORS[p.status] ?? "bg-muted"}`,
											children: p.status
										})
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
										"data-label": "Date",
										className: "px-4 py-3 text-xs text-muted-foreground",
										children: new Date(p.created_at).toLocaleString()
									})
								]
							}, p.id))
						})
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TabsContent, {
						value: "invoices",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DataTable, {
							loading: invoices.isLoading,
							cols: [
								"Invoice #",
								"Customer",
								"Total",
								"Paid",
								"Status",
								"Due",
								"Actions"
							],
							empty: "No invoices yet",
							children: invoices.data?.map((i) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", {
								className: "border-t border-border/60 hover:bg-accent/30",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
										"data-label": "Invoice #",
										className: "px-4 py-3 font-mono text-xs",
										children: i.invoice_no
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
										"data-label": "Customer",
										className: "px-4 py-3",
										children: i.customers?.full_name ?? "—"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("td", {
										"data-label": "Total",
										className: "px-4 py-3 font-semibold",
										children: ["KES ", Number(i.total).toLocaleString()]
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("td", {
										"data-label": "Paid",
										className: "px-4 py-3 text-green-500",
										children: ["KES ", Number(i.amount_paid).toLocaleString()]
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
										"data-label": "Status",
										className: "px-4 py-3",
										children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
											className: `rounded-full px-2 py-0.5 text-xs capitalize ${STATUS_COLORS[i.status] ?? "bg-muted"}`,
											children: i.status
										})
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
										"data-label": "Due",
										className: "px-4 py-3 text-xs text-muted-foreground",
										children: i.due_date ? new Date(i.due_date).toLocaleDateString() : "—"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
										"data-label": "Actions",
										className: "px-4 py-3",
										children: i.status === "unpaid" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
											size: "sm",
											variant: "outline",
											onClick: () => markPaid.mutate(i.id),
											children: "Mark Paid"
										})
									})
								]
							}, i.id))
						})
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TabsContent, {
						value: "expenses",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DataTable, {
							loading: expenses.isLoading,
							cols: [
								"Description",
								"Category",
								"Amount",
								"Date"
							],
							empty: "No expenses recorded",
							children: expenses.data?.map((e) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", {
								className: "border-t border-border/60 hover:bg-accent/30",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
										"data-label": "Description",
										className: "px-4 py-3 font-medium",
										children: e.description
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
										"data-label": "Category",
										className: "px-4 py-3 capitalize text-xs",
										children: e.category
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("td", {
										"data-label": "Amount",
										className: "px-4 py-3 font-semibold text-red-500",
										children: ["KES ", Number(e.amount).toLocaleString()]
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
										"data-label": "Date",
										className: "px-4 py-3 text-xs text-muted-foreground",
										children: e.date
									})
								]
							}, e.id))
						})
					})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Dialog, {
				open: payOpen,
				onOpenChange: setPayOpen,
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DialogContent, {
					className: "max-w-lg",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(DialogHeader, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DialogTitle, { children: "Record Payment" }) }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("form", {
						onSubmit: payForm.handleSubmit((d) => d.method === "mpesa" && d.phone ? handleStkPush(d) : savePayment.mutate(d)),
						className: "space-y-4",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "Customer *" }),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Select, {
									onValueChange: (v) => payForm.setValue("customer_id", v),
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectTrigger, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectValue, { placeholder: "Select customer" }) }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectContent, { children: customers.data?.map((c) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(SelectItem, {
										value: c.id,
										children: [
											c.full_name,
											" — ",
											c.phone
										]
									}, c.id)) })]
								}),
								payForm.formState.errors.customer_id && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: "text-xs text-destructive mt-1",
									children: payForm.formState.errors.customer_id.message
								})
							] }),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "grid grid-cols-2 gap-4",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "Amount (KES) *" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
										type: "number",
										...payForm.register("amount")
									})] }),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "Method" }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Select, {
										defaultValue: "mpesa",
										onValueChange: (v) => payForm.setValue("method", v),
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectTrigger, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectValue, {}) }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(SelectContent, { children: [
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
												value: "mpesa",
												children: "M-Pesa"
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
												value: "cash",
												children: "Cash"
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
												value: "bank",
												children: "Bank Transfer"
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
												value: "airtel",
												children: "Airtel Money"
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
												value: "wallet",
												children: "Wallet"
											})
										] })]
									})] }),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: watchMethod === "mpesa" ? "M-Pesa Phone *" : "Phone" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
										...payForm.register("phone"),
										placeholder: "+254..."
									})] }),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "Reference / Receipt" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, { ...payForm.register("reference") })] }),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "col-span-2",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "Notes" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, { ...payForm.register("notes") })]
									})
								]
							}),
							watchMethod === "mpesa" && payForm.watch("phone") && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "rounded-md bg-green-500/10 border border-green-500/30 p-3 text-xs text-green-700",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Smartphone, { className: "inline h-3 w-3 mr-1" }),
									"Will send STK Push to ",
									payForm.watch("phone"),
									". Customer will enter PIN on their phone."
								]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DialogFooter, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
								type: "button",
								variant: "outline",
								onClick: () => setPayOpen(false),
								children: "Cancel"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
								type: "submit",
								disabled: savePayment.isPending || stkLoading,
								children: stkLoading ? "Sending STK Push..." : savePayment.isPending ? "Saving..." : watchMethod === "mpesa" && payForm.watch("phone") ? "Send STK Push" : "Record Payment"
							})] })
						]
					})]
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Dialog, {
				open: invoiceOpen,
				onOpenChange: setInvoiceOpen,
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DialogContent, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(DialogHeader, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DialogTitle, { children: "Create Invoice" }) }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("form", {
					onSubmit: invForm.handleSubmit((d) => saveInvoice.mutate(d)),
					className: "space-y-4",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "Customer *" }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Select, {
							onValueChange: (v) => invForm.setValue("customer_id", v),
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectTrigger, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectValue, { placeholder: "Select customer" }) }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectContent, { children: customers.data?.map((c) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
								value: c.id,
								children: c.full_name
							}, c.id)) })]
						})] }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "Description *" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
							...invForm.register("description"),
							placeholder: "e.g. Monthly internet subscription"
						})] }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "grid grid-cols-2 gap-4",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "Amount (KES) *" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
								type: "number",
								...invForm.register("amount")
							})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "Due Date" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
								type: "date",
								...invForm.register("due_date")
							})] })]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "Notes" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Textarea, {
							...invForm.register("notes"),
							rows: 2
						})] }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DialogFooter, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
							type: "button",
							variant: "outline",
							onClick: () => setInvoiceOpen(false),
							children: "Cancel"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
							type: "submit",
							disabled: saveInvoice.isPending,
							children: saveInvoice.isPending ? "Creating..." : "Create Invoice"
						})] })
					]
				})] })
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Dialog, {
				open: expenseOpen,
				onOpenChange: setExpenseOpen,
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DialogContent, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(DialogHeader, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DialogTitle, { children: "Record Expense" }) }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("form", {
					onSubmit: expForm.handleSubmit((d) => saveExpense.mutate(d)),
					className: "space-y-4",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "Category *" }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Select, {
							onValueChange: (v) => expForm.setValue("category", v),
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectTrigger, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectValue, { placeholder: "Select category" }) }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectContent, { children: [
								"rent",
								"salaries",
								"equipment",
								"maintenance",
								"bandwidth",
								"marketing",
								"utilities",
								"fuel",
								"transport",
								"other"
							].map((c) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
								value: c,
								className: "capitalize",
								children: c
							}, c)) })]
						})] }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "Description *" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, { ...expForm.register("description") })] }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "grid grid-cols-2 gap-4",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "Amount (KES) *" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
								type: "number",
								...expForm.register("amount")
							})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "Date" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
								type: "date",
								...expForm.register("date"),
								defaultValue: (/* @__PURE__ */ new Date()).toISOString().split("T")[0]
							})] })]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DialogFooter, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
							type: "button",
							variant: "outline",
							onClick: () => setExpenseOpen(false),
							children: "Cancel"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
							type: "submit",
							disabled: saveExpense.isPending,
							children: saveExpense.isPending ? "Saving..." : "Record Expense"
						})] })
					]
				})] })
			})
		]
	});
}
function StatCard({ icon: Icon, label, value, color }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "rounded-xl border border-border/60 bg-card p-4",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "flex items-center justify-between mb-2",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "text-xs text-muted-foreground uppercase",
				children: label
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Icon, { className: `h-4 w-4 ${color ?? "text-muted-foreground"}` })]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: `text-xl font-bold ${color ?? ""}`,
			children: value
		})]
	});
}
function DataTable({ loading, cols, empty, children }) {
	const hasData = children && (Array.isArray(children) ? children.length > 0 : true);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "rounded-xl border border-border/60 bg-card overflow-x-auto",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("style", { children: `
        @media (max-width: 640px) {
          .responsive-table thead { display: none; }
          .responsive-table tr { display: block; border-bottom: 1px solid hsl(var(--border) / 0.6); padding: 0.5rem 0; }
          .responsive-table td { display: flex; justify-content: space-between; align-items: center; padding: 0.35rem 1rem; font-size: 0.8rem; }
          .responsive-table td::before { content: attr(data-label); font-weight: 600; color: hsl(var(--muted-foreground)); text-transform: uppercase; font-size: 0.65rem; margin-right: 0.5rem; flex-shrink: 0; }
        }
      ` }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("table", {
			className: "responsive-table w-full text-sm min-w-0",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("thead", {
				className: "bg-muted/40 text-xs uppercase text-muted-foreground",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tr", { children: cols.map((c) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
					className: "px-4 py-3 text-left",
					children: c
				}, c)) })
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tbody", { children: loading ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tr", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
				colSpan: cols.length,
				className: "px-4 py-12 text-center text-muted-foreground",
				children: "Loading..."
			}) }) : !hasData ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tr", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
				colSpan: cols.length,
				className: "px-4 py-12 text-center text-muted-foreground",
				children: empty
			}) }) : children })]
		})]
	});
}
//#endregion
export { BillingPage as component };
