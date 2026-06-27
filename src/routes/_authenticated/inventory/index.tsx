import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useTenantId } from "@/lib/auth";
import { toast } from "sonner";
import { Plus, Package, AlertTriangle, Edit, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

export const Route = createFileRoute("/_authenticated/inventory/")({
  component: InventoryPage,
});

const schema = z.object({
  name: z.string().min(1),
  category: z.string().min(1).default("router"),
  sku: z.string().optional(),
  serial_number: z.string().optional(),
  quantity: z.coerce.number().min(0).default(0),
  unit_cost: z.coerce.number().min(0).default(0),
  reorder_level: z.coerce.number().min(0).default(5),
  location: z.string().optional(),
  status: z.string().min(1).default("available"),
});

type FormData = z.infer<typeof schema>;

const STATUS_COLORS: Record<string, string> = {
  available: "bg-green-500/15 text-green-600",
  assigned: "bg-blue-500/15 text-blue-600",
  faulty: "bg-red-500/15 text-red-600",
  disposed: "bg-muted text-muted-foreground",
};

function InventoryPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [search, setSearch] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: tenantId } = useTenantId();

  const items = useQuery({
    queryKey: ["inventory", tenantId, search],
    queryFn: async () => {
      let q = supabase.from("inventory").select("*").eq("tenant_id", tenantId!).order("name");
      if (search) q = q.ilike("name", `%${search}%`);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!tenantId,
  });

  const { register, handleSubmit, reset, setValue, formState: { errors } } = useForm<FormData>({ resolver: zodResolver(schema) as any });

  const save = useMutation({
    mutationFn: async (data: FormData) => {
      if (editing) {
        const { error } = await supabase.from("inventory").update(data).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("inventory").insert({ ...data, tenant_id: tenantId });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Item updated" : "Item added");
      qc.invalidateQueries({ queryKey: ["inventory"] });
      setOpen(false); reset(); setEditing(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("inventory").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Item deleted"); qc.invalidateQueries({ queryKey: ["inventory"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  function openEdit(item: any) {
    setEditing(item);
    Object.keys(schema.shape).forEach((k) => setValue(k as any, item[k] ?? ""));
    setOpen(true);
  }

  const lowStock = items.data?.filter((i) => i.quantity <= i.reorder_level) ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Inventory</h1>
          <p className="text-sm text-muted-foreground">Equipment, assets and stock management</p>
        </div>
        <Button onClick={() => { setEditing(null); reset(); setOpen(true); }}><Plus className="h-4 w-4 mr-2" />Add Item</Button>
      </div>

      {lowStock.length > 0 && (
        <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-4 flex items-center gap-3">
          <AlertTriangle className="h-4 w-4 text-yellow-500 shrink-0" />
          <div className="text-sm"><span className="font-medium">{lowStock.length} item(s) below reorder level:</span> {lowStock.map((i) => i.name).join(", ")}</div>
        </div>
      )}

      <div className="flex gap-3">
        <Input className="max-w-sm" placeholder="Search items..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3 text-left">Item</th>
              <th className="px-4 py-3 text-left">Category</th>
              <th className="px-4 py-3 text-left">SKU / Serial</th>
              <th className="px-4 py-3 text-left">Qty</th>
              <th className="px-4 py-3 text-left">Unit Cost</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.isLoading ? (
              <tr><td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">Loading...</td></tr>
            ) : items.data?.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">No items in inventory</td></tr>
            ) : items.data?.map((item) => (
              <tr key={item.id} className={`border-t border-border/60 hover:bg-accent/30 ${item.quantity <= item.reorder_level ? "bg-yellow-500/5" : ""}`}>
                <td className="px-4 py-3">
                  <div className="font-medium">{item.name}</div>
                  {item.location && <div className="text-xs text-muted-foreground">{item.location}</div>}
                </td>
                <td className="px-4 py-3 capitalize text-xs">{item.category}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground">
                  <div>{item.sku}</div>
                  <div>{item.serial_number}</div>
                </td>
                <td className={`px-4 py-3 font-semibold ${item.quantity <= item.reorder_level ? "text-yellow-500" : ""}`}>
                  {item.quantity}
                  {item.quantity <= item.reorder_level && <AlertTriangle className="h-3 w-3 inline ml-1" />}
                </td>
                <td className="px-4 py-3">KES {Number(item.unit_cost).toLocaleString()}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs capitalize ${STATUS_COLORS[item.status] ?? "bg-muted"}`}>{item.status}</span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <button onClick={() => openEdit(item)} className="text-muted-foreground hover:text-foreground"><Edit className="h-4 w-4" /></button>
                    <button onClick={() => setDeleteId(item.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={!!deleteId} onOpenChange={(o) => { if (!o) setDeleteId(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Delete Item</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Are you sure you want to delete this item from inventory? This cannot be undone.</p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => { remove.mutate(deleteId!); setDeleteId(null); }} disabled={remove.isPending}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Edit Item" : "Add Item"}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit((d) => save.mutate(d))} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2"><Label>Name *</Label><Input {...register("name")} /></div>
              <div>
                <Label>Category</Label>
                <Select defaultValue="router" onValueChange={(v) => setValue("category", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="router">Router</SelectItem>
                    <SelectItem value="switch">Switch</SelectItem>
                    <SelectItem value="access_point">Access Point</SelectItem>
                    <SelectItem value="fiber">Fiber Equipment</SelectItem>
                    <SelectItem value="cable">Cable</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Status</Label>
                <Select defaultValue="available" onValueChange={(v) => setValue("status", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="available">Available</SelectItem>
                    <SelectItem value="assigned">Assigned</SelectItem>
                    <SelectItem value="faulty">Faulty</SelectItem>
                    <SelectItem value="disposed">Disposed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>SKU</Label><Input {...register("sku")} /></div>
              <div><Label>Serial Number</Label><Input {...register("serial_number")} /></div>
              <div><Label>Quantity</Label><Input type="number" {...register("quantity")} /></div>
              <div><Label>Unit Cost (KES)</Label><Input type="number" {...register("unit_cost")} /></div>
              <div><Label>Reorder Level</Label><Input type="number" {...register("reorder_level")} /></div>
              <div><Label>Location</Label><Input {...register("location")} /></div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={save.isPending}>{save.isPending ? "Saving..." : "Save"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
