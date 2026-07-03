import { i as __toESM } from "../_runtime.mjs";
import { a as supabase, i as init_client } from "./client-D3kKP_Nv.mjs";
import { u as require_react } from "../_libs/@floating-ui/react-dom+[...].mjs";
import { s as require_jsx_runtime } from "../_libs/@radix-ui/react-arrow+[...].mjs";
import { i as useQueryClient, n as useQuery, t as useMutation } from "../_libs/tanstack__react-query.mjs";
import { a as useTenantId, i as useAuth } from "./auth-z02iFWqz.mjs";
import { t as Button } from "./button-DRsC1qZi.mjs";
import { t as Input } from "./input-DicJzR9-.mjs";
import { t as Label } from "./label-B4PTMSG2.mjs";
import { I as Plus, J as Mail, O as Search, R as Phone, b as SquarePen, ct as Download, it as Eye, m as Trash2, q as MapPin, s as Users } from "../_libs/lucide-react.mjs";
import { a as DialogTitle, i as DialogHeader, n as DialogContent, r as DialogFooter, t as Dialog } from "./dialog-BpdftUtE.mjs";
import { a as SelectValue, i as SelectTrigger, n as SelectContent, r as SelectItem, t as Select } from "./select-DUy71i1r.mjs";
import { i as TabsTrigger, n as TabsContent, r as TabsList, t as Tabs } from "./tabs-WTjz7Ps0.mjs";
import { n as toast } from "../_libs/sonner.mjs";
import { a as objectType, i as literalType, o as stringType } from "../_libs/zod.mjs";
import { n as useForm, t as u } from "../_libs/@hookform/resolvers+[...].mjs";
import { t as Textarea } from "./textarea-DBn9CRiI.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/customers-Bt11gOXv.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
init_client();
var schema = objectType({
	full_name: stringType().min(2),
	phone: stringType().min(9),
	email: stringType().email().optional().or(literalType("")),
	national_id: stringType().optional(),
	kra_pin: stringType().optional(),
	address: stringType().optional(),
	city: stringType().optional(),
	county: stringType().optional(),
	category: stringType().default("residential"),
	status: stringType().default("active"),
	notes: stringType().optional()
});
var STATUS_COLORS = {
	active: "bg-green-500/15 text-green-600",
	suspended: "bg-yellow-500/15 text-yellow-600",
	disconnected: "bg-red-500/15 text-red-600",
	prospect: "bg-blue-500/15 text-blue-600"
};
function CustomersPage() {
	const { user } = useAuth();
	const qc = useQueryClient();
	const { data: tenantId } = useTenantId();
	const [search, setSearch] = (0, import_react.useState)("");
	const [statusFilter, setStatusFilter] = (0, import_react.useState)("all");
	const [categoryFilter, setCategoryFilter] = (0, import_react.useState)("all");
	const [open, setOpen] = (0, import_react.useState)(false);
	const [editing, setEditing] = (0, import_react.useState)(null);
	const [detailId, setDetailId] = (0, import_react.useState)(null);
	const [deleteId, setDeleteId] = (0, import_react.useState)(null);
	const customers = useQuery({
		queryKey: [
			"customers",
			tenantId,
			search,
			statusFilter,
			categoryFilter
		],
		queryFn: async () => {
			let q = supabase.from("customers").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false });
			if (search) q = q.or(`full_name.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%,national_id.ilike.%${search}%`);
			if (statusFilter !== "all") q = q.eq("status", statusFilter);
			if (categoryFilter !== "all") q = q.eq("category", categoryFilter);
			const { data, error } = await q;
			if (error) throw error;
			return data ?? [];
		},
		enabled: !!tenantId
	});
	const detail = useQuery({
		queryKey: ["customer-detail", detailId],
		queryFn: async () => {
			const [cust, subs, payments, notes] = await Promise.all([
				supabase.from("customers").select("*").eq("id", detailId).single(),
				supabase.from("subscriptions").select("*, packages(name, type, price)").eq("customer_id", detailId).order("created_at", { ascending: false }),
				supabase.from("payments").select("*").eq("customer_id", detailId).order("created_at", { ascending: false }).limit(10),
				supabase.from("customer_notes").select("*, profiles(full_name)").eq("customer_id", detailId).order("created_at", { ascending: false })
			]);
			return {
				customer: cust.data,
				subscriptions: subs.data ?? [],
				payments: payments.data ?? [],
				notes: notes.data ?? []
			};
		},
		enabled: !!detailId
	});
	const [newNote, setNewNote] = (0, import_react.useState)("");
	const { register, handleSubmit, reset, setValue, formState: { errors } } = useForm({ resolver: u(schema) });
	const save = useMutation({
		mutationFn: async (data) => {
			if (editing) {
				const { error } = await supabase.from("customers").update(data).eq("id", editing.id);
				if (error) throw error;
			} else {
				const { error } = await supabase.from("customers").insert({
					...data,
					tenant_id: tenantId
				});
				if (error) throw error;
			}
		},
		onSuccess: () => {
			toast.success(editing ? "Customer updated" : "Customer added");
			qc.invalidateQueries({ queryKey: ["customers"] });
			setOpen(false);
			reset();
			setEditing(null);
		},
		onError: (e) => toast.error(e.message)
	});
	const remove = useMutation({
		mutationFn: async (id) => {
			const { error } = await supabase.from("customers").delete().eq("id", id);
			if (error) throw error;
		},
		onSuccess: () => {
			toast.success("Customer deleted");
			qc.invalidateQueries({ queryKey: ["customers"] });
		},
		onError: (e) => toast.error(e.message)
	});
	const addNote = useMutation({
		mutationFn: async () => {
			const { error } = await supabase.from("customer_notes").insert({
				customer_id: detailId,
				tenant_id: tenantId,
				note: newNote,
				created_by: user?.id
			});
			if (error) throw error;
		},
		onSuccess: () => {
			toast.success("Note added");
			setNewNote("");
			qc.invalidateQueries({ queryKey: ["customer-detail", detailId] });
		},
		onError: (e) => toast.error(e.message)
	});
	const updateStatus = useMutation({
		mutationFn: async ({ id, status }) => {
			const { error } = await supabase.from("customers").update({ status }).eq("id", id);
			if (error) throw error;
		},
		onSuccess: () => {
			toast.success("Status updated");
			qc.invalidateQueries({ queryKey: ["customers"] });
		},
		onError: (e) => toast.error(e.message)
	});
	function openEdit(c) {
		setEditing(c);
		Object.keys(schema.shape).forEach((k) => setValue(k, c[k] ?? ""));
		setOpen(true);
	}
	function exportCSV() {
		const csv = [[
			"Name",
			"Phone",
			"Email",
			"National ID",
			"City",
			"County",
			"Category",
			"Status",
			"Joined"
		], ...(customers.data ?? []).map((c) => [
			c.full_name,
			c.phone,
			c.email ?? "",
			c.national_id ?? "",
			c.city ?? "",
			c.county ?? "",
			c.category,
			c.status,
			new Date(c.created_at).toLocaleDateString()
		])].map((r) => r.join(",")).join("\n");
		const a = document.createElement("a");
		a.href = "data:text/csv," + encodeURIComponent(csv);
		a.download = "customers.csv";
		a.click();
	}
	const stats = {
		total: customers.data?.length ?? 0,
		active: customers.data?.filter((c) => c.status === "active").length ?? 0,
		suspended: customers.data?.filter((c) => c.status === "suspended").length ?? 0,
		prospects: customers.data?.filter((c) => c.status === "prospect").length ?? 0
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "space-y-4 w-full",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex items-start justify-between gap-2",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
					className: "text-xl font-semibold",
					children: "Customers"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "text-xs text-muted-foreground",
					children: "Manage your customer base and CRM"
				})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex gap-2 shrink-0",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
						variant: "outline",
						size: "sm",
						onClick: exportCSV,
						className: "px-2",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Download, { className: "h-4 w-4" })
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
						size: "sm",
						onClick: () => {
							setEditing(null);
							reset();
							setOpen(true);
						},
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Plus, { className: "h-4 w-4 mr-1" }), "Add"]
					})]
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "grid grid-cols-2 gap-3",
				children: [
					{
						label: "Total",
						value: stats.total
					},
					{
						label: "Active",
						value: stats.active,
						color: "text-green-500"
					},
					{
						label: "Suspended",
						value: stats.suspended,
						color: "text-yellow-500"
					},
					{
						label: "Prospects",
						value: stats.prospects,
						color: "text-blue-500"
					}
				].map((s) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "rounded-xl border border-border/60 bg-card p-3",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "text-xs text-muted-foreground uppercase",
						children: s.label
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: `text-xl font-bold mt-1 ${s.color ?? ""}`,
						children: s.value
					})]
				}, s.label))
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "space-y-2",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "relative",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Search, { className: "absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
						className: "pl-9 w-full",
						placeholder: "Search name, phone, email, ID...",
						value: search,
						onChange: (e) => setSearch(e.target.value)
					})]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "grid grid-cols-2 gap-2",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Select, {
						value: statusFilter,
						onValueChange: setStatusFilter,
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectTrigger, {
							className: "w-full",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectValue, {})
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(SelectContent, { children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
								value: "all",
								children: "All Status"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
								value: "active",
								children: "Active"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
								value: "suspended",
								children: "Suspended"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
								value: "disconnected",
								children: "Disconnected"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
								value: "prospect",
								children: "Prospect"
							})
						] })]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Select, {
						value: categoryFilter,
						onValueChange: setCategoryFilter,
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectTrigger, {
							className: "w-full",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectValue, {})
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(SelectContent, { children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
								value: "all",
								children: "All Categories"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
								value: "residential",
								children: "Residential"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
								value: "business",
								children: "Business"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
								value: "hotel",
								children: "Hotel"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
								value: "school",
								children: "School"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
								value: "estate",
								children: "Estate"
							})
						] })]
					})]
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "rounded-xl border border-border/60 bg-card overflow-x-auto w-full",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("table", {
					className: "w-full text-sm min-w-[600px]",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("thead", {
						className: "bg-muted/40 text-xs uppercase text-muted-foreground",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", { children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
								className: "px-4 py-3 text-left",
								children: "Customer"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
								className: "px-4 py-3 text-left",
								children: "Contact"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
								className: "px-4 py-3 text-left",
								children: "Location"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
								className: "px-4 py-3 text-left",
								children: "Category"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
								className: "px-4 py-3 text-left",
								children: "Status"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
								className: "px-4 py-3 text-left",
								children: "Joined"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
								className: "px-4 py-3 text-left",
								children: "Actions"
							})
						] })
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tbody", { children: customers.isLoading ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tr", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
						colSpan: 7,
						className: "px-4 py-12 text-center text-muted-foreground",
						children: "Loading..."
					}) }) : customers.data?.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tr", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("td", {
						colSpan: 7,
						className: "px-4 py-12 text-center text-muted-foreground",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Users, { className: "h-8 w-8 mx-auto mb-2 opacity-30" }), "No customers found"]
					}) }) : customers.data?.map((c) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", {
						className: "border-t border-border/60 hover:bg-accent/30",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("td", {
								className: "px-4 py-3",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
									className: "font-medium",
									children: c.full_name
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
									className: "text-xs text-muted-foreground font-mono",
									children: c.customer_no ?? c.id.slice(0, 8)
								})]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("td", {
								className: "px-4 py-3",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "flex items-center gap-1 text-xs",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Phone, { className: "h-3 w-3" }), c.phone]
								}), c.email && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "flex items-center gap-1 text-xs text-muted-foreground",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Mail, { className: "h-3 w-3" }), c.email]
								})]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
								className: "px-4 py-3",
								children: c.city && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "flex items-center gap-1 text-xs",
									children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(MapPin, { className: "h-3 w-3" }),
										c.city,
										c.county ? `, ${c.county}` : ""
									]
								})
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
								className: "px-4 py-3 capitalize text-xs",
								children: c.category
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
								className: "px-4 py-3",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: `rounded-full px-2 py-0.5 text-xs capitalize ${STATUS_COLORS[c.status] ?? "bg-muted"}`,
									children: c.status
								})
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
								className: "px-4 py-3 text-xs text-muted-foreground",
								children: new Date(c.created_at).toLocaleDateString()
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
								className: "px-4 py-3",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "flex gap-1",
									children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
											onClick: () => setDetailId(c.id),
											className: "text-muted-foreground hover:text-primary p-1",
											children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Eye, { className: "h-4 w-4" })
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
											onClick: () => openEdit(c),
											className: "text-muted-foreground hover:text-foreground p-1",
											children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SquarePen, { className: "h-4 w-4" })
										}),
										c.status === "active" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
											onClick: () => updateStatus.mutate({
												id: c.id,
												status: "suspended"
											}),
											className: "text-xs rounded px-1.5 py-0.5 bg-yellow-500/15 text-yellow-600 hover:bg-yellow-500/30",
											children: "Suspend"
										}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
											onClick: () => updateStatus.mutate({
												id: c.id,
												status: "active"
											}),
											className: "text-xs rounded px-1.5 py-0.5 bg-green-500/15 text-green-600 hover:bg-green-500/30",
											children: "Activate"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
											onClick: () => setDeleteId(c.id),
											className: "text-muted-foreground hover:text-destructive p-1",
											children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Trash2, { className: "h-4 w-4" })
										})
									]
								})
							})
						]
					}, c.id)) })]
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Dialog, {
				open: !!deleteId,
				onOpenChange: (o) => {
					if (!o) setDeleteId(null);
				},
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DialogContent, {
					className: "max-w-sm",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(DialogHeader, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DialogTitle, { children: "Delete Customer" }) }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "text-sm text-muted-foreground",
							children: "Are you sure you want to delete this customer? All their data will be permanently removed."
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DialogFooter, {
							className: "gap-2",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
								variant: "outline",
								onClick: () => setDeleteId(null),
								children: "Cancel"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
								variant: "destructive",
								onClick: () => {
									remove.mutate(deleteId);
									setDeleteId(null);
								},
								disabled: remove.isPending,
								children: "Delete"
							})]
						})
					]
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Dialog, {
				open: !!detailId,
				onOpenChange: (o) => !o && setDetailId(null),
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DialogContent, {
					className: "max-w-3xl max-h-[85vh] overflow-y-auto",
					children: detail.isLoading ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "py-12 text-center text-muted-foreground",
						children: "Loading..."
					}) : detail.data ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(DialogHeader, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DialogTitle, {
						className: "flex items-center gap-2",
						children: [detail.data.customer?.full_name, /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: `rounded-full px-2 py-0.5 text-xs ${STATUS_COLORS[detail.data.customer?.status] ?? "bg-muted"}`,
							children: detail.data.customer?.status
						})]
					}) }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Tabs, {
						defaultValue: "info",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(TabsList, { children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TabsTrigger, {
									value: "info",
									children: "Info"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(TabsTrigger, {
									value: "subscriptions",
									children: [
										"Subscriptions (",
										detail.data.subscriptions.length,
										")"
									]
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(TabsTrigger, {
									value: "payments",
									children: [
										"Payments (",
										detail.data.payments.length,
										")"
									]
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(TabsTrigger, {
									value: "notes",
									children: [
										"Notes (",
										detail.data.notes.length,
										")"
									]
								})
							] }),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(TabsContent, {
								value: "info",
								className: "space-y-3 mt-3",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
									className: "grid grid-cols-2 gap-3 text-sm",
									children: [
										["Phone", detail.data.customer?.phone],
										["Email", detail.data.customer?.email],
										["National ID", detail.data.customer?.national_id],
										["KRA PIN", detail.data.customer?.kra_pin],
										["City", detail.data.customer?.city],
										["County", detail.data.customer?.county],
										["Category", detail.data.customer?.category],
										["Customer No", detail.data.customer?.customer_no]
									].map(([label, val]) => val ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "rounded-md bg-muted/30 p-2",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
											className: "text-xs text-muted-foreground",
											children: label
										}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
											className: "font-medium mt-0.5",
											children: val
										})]
									}, label) : null)
								}), detail.data.customer?.address && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "rounded-md bg-muted/30 p-2 text-sm",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
										className: "text-xs text-muted-foreground",
										children: "Address"
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
										className: "mt-0.5",
										children: detail.data.customer.address
									})]
								})]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TabsContent, {
								value: "subscriptions",
								className: "mt-3",
								children: detail.data.subscriptions.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
									className: "text-sm text-muted-foreground text-center py-6",
									children: "No subscriptions"
								}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
									className: "space-y-2",
									children: detail.data.subscriptions.map((s) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "rounded-md border border-border/60 p-3 text-sm flex items-center justify-between",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
											className: "font-medium",
											children: [
												s.packages?.name,
												" ",
												/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
													className: "text-xs text-muted-foreground capitalize",
													children: [
														"(",
														s.type,
														")"
													]
												})
											]
										}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
											className: "text-xs text-muted-foreground",
											children: [
												"KES ",
												Number(s.packages?.price ?? 0).toLocaleString(),
												" · Expires: ",
												s.expires_at ? new Date(s.expires_at).toLocaleDateString() : "—"
											]
										})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
											className: `rounded-full px-2 py-0.5 text-xs capitalize ${s.status === "active" ? "bg-green-500/15 text-green-600" : "bg-yellow-500/15 text-yellow-600"}`,
											children: s.status
										})]
									}, s.id))
								})
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TabsContent, {
								value: "payments",
								className: "mt-3",
								children: detail.data.payments.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
									className: "text-sm text-muted-foreground text-center py-6",
									children: "No payments"
								}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
									className: "space-y-2",
									children: detail.data.payments.map((p) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "rounded-md border border-border/60 p-3 text-sm flex items-center justify-between",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
											className: "font-medium",
											children: [
												"KES ",
												Number(p.amount).toLocaleString(),
												" ",
												/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
													className: "text-xs text-muted-foreground capitalize",
													children: ["via ", p.method]
												})
											]
										}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
											className: "text-xs text-muted-foreground",
											children: new Date(p.created_at).toLocaleString()
										})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
											className: `rounded-full px-2 py-0.5 text-xs capitalize ${p.status === "completed" ? "bg-green-500/15 text-green-600" : "bg-yellow-500/15 text-yellow-600"}`,
											children: p.status
										})]
									}, p.id))
								})
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(TabsContent, {
								value: "notes",
								className: "mt-3 space-y-3",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "flex gap-2",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Textarea, {
										placeholder: "Add a note...",
										value: newNote,
										onChange: (e) => setNewNote(e.target.value),
										rows: 2,
										className: "flex-1"
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
										onClick: () => addNote.mutate(),
										disabled: !newNote || addNote.isPending,
										className: "self-end",
										children: "Add"
									})]
								}), detail.data.notes.map((n) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "rounded-md border border-border/60 p-3 text-sm",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "flex items-center justify-between text-xs text-muted-foreground mb-1",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: n.profiles?.full_name ?? "Agent" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: new Date(n.created_at).toLocaleString() })]
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { children: n.note })]
								}, n.id))]
							})
						]
					})] }) : null
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Dialog, {
				open,
				onOpenChange: setOpen,
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DialogContent, {
					className: "max-w-2xl",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(DialogHeader, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DialogTitle, { children: editing ? "Edit Customer" : "Add Customer" }) }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("form", {
						onSubmit: handleSubmit((d) => save.mutate(d)),
						className: "grid grid-cols-2 gap-4",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "Full Name *" }),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, { ...register("full_name") }),
								errors.full_name && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: "text-xs text-destructive mt-1",
									children: errors.full_name.message
								})
							] }),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "Phone *" }),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, { ...register("phone") }),
								errors.phone && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: "text-xs text-destructive mt-1",
									children: errors.phone.message
								})
							] }),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "Email" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, { ...register("email") })] }),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "National ID" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, { ...register("national_id") })] }),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "KRA PIN" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, { ...register("kra_pin") })] }),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "City" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, { ...register("city") })] }),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "County" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, { ...register("county") })] }),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "Address" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, { ...register("address") })] }),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "Category" }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Select, {
								defaultValue: editing?.category ?? "residential",
								onValueChange: (v) => setValue("category", v),
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectTrigger, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectValue, {}) }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectContent, { children: [
									"residential",
									"business",
									"hotel",
									"school",
									"university",
									"estate",
									"cyber_cafe",
									"corporate"
								].map((c) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
									value: c,
									className: "capitalize",
									children: c.replace("_", " ")
								}, c)) })]
							})] }),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "Status" }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Select, {
								defaultValue: editing?.status ?? "active",
								onValueChange: (v) => setValue("status", v),
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectTrigger, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectValue, {}) }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(SelectContent, { children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
										value: "active",
										children: "Active"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
										value: "suspended",
										children: "Suspended"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
										value: "disconnected",
										children: "Disconnected"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
										value: "prospect",
										children: "Prospect"
									})
								] })]
							})] }),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "col-span-2",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "Notes" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Textarea, {
									...register("notes"),
									rows: 2
								})]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "col-span-2 flex justify-end gap-2",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
									type: "button",
									variant: "outline",
									onClick: () => setOpen(false),
									children: "Cancel"
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
									type: "submit",
									disabled: save.isPending,
									children: save.isPending ? "Saving..." : "Save"
								})]
							})
						]
					})]
				})
			})
		]
	});
}
//#endregion
export { CustomersPage as component };
