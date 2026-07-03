import { i as __toESM } from "../_runtime.mjs";
import { a as supabase, i as init_client } from "./client-D3kKP_Nv.mjs";
import { u as require_react } from "../_libs/@floating-ui/react-dom+[...].mjs";
import { s as require_jsx_runtime } from "../_libs/@radix-ui/react-arrow+[...].mjs";
import { i as useQueryClient, n as useQuery, t as useMutation } from "../_libs/tanstack__react-query.mjs";
import { a as useTenantId, i as useAuth } from "./auth-z02iFWqz.mjs";
import { t as Button } from "./button-DRsC1qZi.mjs";
import { t as Input } from "./input-DicJzR9-.mjs";
import { t as Label } from "./label-B4PTMSG2.mjs";
import { I as Plus, b as SquarePen, d as TriangleAlert, m as Trash2 } from "../_libs/lucide-react.mjs";
import { a as DialogTitle, i as DialogHeader, n as DialogContent, r as DialogFooter, t as Dialog } from "./dialog-BpdftUtE.mjs";
import { a as SelectValue, i as SelectTrigger, n as SelectContent, r as SelectItem, t as Select } from "./select-DUy71i1r.mjs";
import { n as toast } from "../_libs/sonner.mjs";
import { a as objectType, n as coerce, o as stringType } from "../_libs/zod.mjs";
import { n as useForm, t as u } from "../_libs/@hookform/resolvers+[...].mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/inventory-CUKZImZJ.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
init_client();
var schema = objectType({
	name: stringType().min(1),
	category: stringType().min(1).default("router"),
	sku: stringType().optional(),
	serial_number: stringType().optional(),
	quantity: coerce.number().min(0).default(0),
	unit_cost: coerce.number().min(0).default(0),
	reorder_level: coerce.number().min(0).default(5),
	location: stringType().optional(),
	status: stringType().min(1).default("available")
});
var STATUS_COLORS = {
	available: "bg-green-500/15 text-green-600",
	assigned: "bg-blue-500/15 text-blue-600",
	faulty: "bg-red-500/15 text-red-600",
	disposed: "bg-muted text-muted-foreground"
};
function InventoryPage() {
	const { user } = useAuth();
	const qc = useQueryClient();
	const [open, setOpen] = (0, import_react.useState)(false);
	const [editing, setEditing] = (0, import_react.useState)(null);
	const [search, setSearch] = (0, import_react.useState)("");
	const [deleteId, setDeleteId] = (0, import_react.useState)(null);
	const { data: tenantId } = useTenantId();
	const items = useQuery({
		queryKey: [
			"inventory",
			tenantId,
			search
		],
		queryFn: async () => {
			let q = supabase.from("inventory").select("*").eq("tenant_id", tenantId).order("name");
			if (search) q = q.ilike("name", `%${search}%`);
			const { data, error } = await q;
			if (error) throw error;
			return data ?? [];
		},
		enabled: !!tenantId
	});
	const { register, handleSubmit, reset, setValue, formState: { errors } } = useForm({ resolver: u(schema) });
	const save = useMutation({
		mutationFn: async (data) => {
			if (editing) {
				const { error } = await supabase.from("inventory").update(data).eq("id", editing.id);
				if (error) throw error;
			} else {
				const { error } = await supabase.from("inventory").insert({
					...data,
					tenant_id: tenantId
				});
				if (error) throw error;
			}
		},
		onSuccess: () => {
			toast.success(editing ? "Item updated" : "Item added");
			qc.invalidateQueries({ queryKey: ["inventory"] });
			setOpen(false);
			reset();
			setEditing(null);
		},
		onError: (e) => toast.error(e.message)
	});
	const remove = useMutation({
		mutationFn: async (id) => {
			const { error } = await supabase.from("inventory").delete().eq("id", id);
			if (error) throw error;
		},
		onSuccess: () => {
			toast.success("Item deleted");
			qc.invalidateQueries({ queryKey: ["inventory"] });
		},
		onError: (e) => toast.error(e.message)
	});
	function openEdit(item) {
		setEditing(item);
		Object.keys(schema.shape).forEach((k) => setValue(k, item[k] ?? ""));
		setOpen(true);
	}
	const lowStock = items.data?.filter((i) => i.quantity <= i.reorder_level) ?? [];
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "space-y-6",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex flex-col sm:flex-row sm:items-center justify-between gap-3",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
					className: "text-2xl font-semibold",
					children: "Inventory"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "text-sm text-muted-foreground",
					children: "Equipment, assets and stock management"
				})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
					onClick: () => {
						setEditing(null);
						reset();
						setOpen(true);
					},
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Plus, { className: "h-4 w-4 mr-2" }), "Add Item"]
				})]
			}),
			lowStock.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-4 flex items-center gap-3",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TriangleAlert, { className: "h-4 w-4 text-yellow-500 shrink-0" }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "text-sm",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
							className: "font-medium",
							children: [lowStock.length, " item(s) below reorder level:"]
						}),
						" ",
						lowStock.map((i) => i.name).join(", ")
					]
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "flex gap-3",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
					className: "max-w-sm",
					placeholder: "Search items...",
					value: search,
					onChange: (e) => setSearch(e.target.value)
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "rounded-xl border border-border/60 bg-card overflow-x-auto",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("table", {
					className: "w-full text-sm min-w-[600px]",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("thead", {
						className: "bg-muted/40 text-xs uppercase text-muted-foreground",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", { children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
								className: "px-4 py-3 text-left",
								children: "Item"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
								className: "px-4 py-3 text-left",
								children: "Category"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
								className: "px-4 py-3 text-left",
								children: "SKU / Serial"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
								className: "px-4 py-3 text-left",
								children: "Qty"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
								className: "px-4 py-3 text-left",
								children: "Unit Cost"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
								className: "px-4 py-3 text-left",
								children: "Status"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
								className: "px-4 py-3 text-left",
								children: "Actions"
							})
						] })
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tbody", { children: items.isLoading ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tr", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
						colSpan: 7,
						className: "px-4 py-12 text-center text-muted-foreground",
						children: "Loading..."
					}) }) : items.data?.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tr", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
						colSpan: 7,
						className: "px-4 py-12 text-center text-muted-foreground",
						children: "No items in inventory"
					}) }) : items.data?.map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", {
						className: `border-t border-border/60 hover:bg-accent/30 ${item.quantity <= item.reorder_level ? "bg-yellow-500/5" : ""}`,
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("td", {
								className: "px-4 py-3",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
									className: "font-medium",
									children: item.name
								}), item.location && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
									className: "text-xs text-muted-foreground",
									children: item.location
								})]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
								className: "px-4 py-3 capitalize text-xs",
								children: item.category
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("td", {
								className: "px-4 py-3 text-xs text-muted-foreground",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { children: item.sku }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { children: item.serial_number })]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("td", {
								className: `px-4 py-3 font-semibold ${item.quantity <= item.reorder_level ? "text-yellow-500" : ""}`,
								children: [item.quantity, item.quantity <= item.reorder_level && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TriangleAlert, { className: "h-3 w-3 inline ml-1" })]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("td", {
								className: "px-4 py-3",
								children: ["KES ", Number(item.unit_cost).toLocaleString()]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
								className: "px-4 py-3",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: `rounded-full px-2 py-0.5 text-xs capitalize ${STATUS_COLORS[item.status] ?? "bg-muted"}`,
									children: item.status
								})
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
								className: "px-4 py-3",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "flex gap-2",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
										onClick: () => openEdit(item),
										className: "text-muted-foreground hover:text-foreground",
										children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SquarePen, { className: "h-4 w-4" })
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
										onClick: () => setDeleteId(item.id),
										className: "text-muted-foreground hover:text-destructive",
										children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Trash2, { className: "h-4 w-4" })
									})]
								})
							})
						]
					}, item.id)) })]
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
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(DialogHeader, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DialogTitle, { children: "Delete Item" }) }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "text-sm text-muted-foreground",
							children: "Are you sure you want to delete this item from inventory? This cannot be undone."
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
				open,
				onOpenChange: setOpen,
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DialogContent, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(DialogHeader, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DialogTitle, { children: editing ? "Edit Item" : "Add Item" }) }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("form", {
					onSubmit: handleSubmit((d) => save.mutate(d)),
					className: "space-y-4",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "grid grid-cols-2 gap-4",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "col-span-2",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "Name *" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, { ...register("name") })]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "Category" }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Select, {
								defaultValue: "router",
								onValueChange: (v) => setValue("category", v),
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectTrigger, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectValue, {}) }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(SelectContent, { children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
										value: "router",
										children: "Router"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
										value: "switch",
										children: "Switch"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
										value: "access_point",
										children: "Access Point"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
										value: "fiber",
										children: "Fiber Equipment"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
										value: "cable",
										children: "Cable"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
										value: "other",
										children: "Other"
									})
								] })]
							})] }),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "Status" }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Select, {
								defaultValue: "available",
								onValueChange: (v) => setValue("status", v),
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectTrigger, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectValue, {}) }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(SelectContent, { children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
										value: "available",
										children: "Available"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
										value: "assigned",
										children: "Assigned"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
										value: "faulty",
										children: "Faulty"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
										value: "disposed",
										children: "Disposed"
									})
								] })]
							})] }),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "SKU" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, { ...register("sku") })] }),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "Serial Number" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, { ...register("serial_number") })] }),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "Quantity" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
								type: "number",
								...register("quantity")
							})] }),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "Unit Cost (KES)" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
								type: "number",
								...register("unit_cost")
							})] }),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "Reorder Level" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
								type: "number",
								...register("reorder_level")
							})] }),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "Location" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, { ...register("location") })] })
						]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DialogFooter, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
						type: "button",
						variant: "outline",
						onClick: () => setOpen(false),
						children: "Cancel"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
						type: "submit",
						disabled: save.isPending,
						children: save.isPending ? "Saving..." : "Save"
					})] })]
				})] })
			})
		]
	});
}
//#endregion
export { InventoryPage as component };
