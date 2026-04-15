import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

interface CreatePurchaseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  suppliers: any[];
  products: any[];
}

export function CreatePurchaseDialog({ open, onOpenChange, suppliers, products }: CreatePurchaseDialogProps) {
  const queryClient = useQueryClient();
  const [supplierId, setSupplierId] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<{ product_id: string; quantity: number; unit_cost: number }[]>([
    { product_id: "", quantity: 1, unit_cost: 0 },
  ]);

  const totalAmount = items.reduce((sum, item) => sum + item.quantity * item.unit_cost, 0);

  const createPurchaseMutation = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const purchaseNumber = `PO-${Date.now()}`;
      const validItems = items.filter(i => i.product_id && i.quantity > 0);
      if (validItems.length === 0) throw new Error("কমপক্ষে একটি আইটেম যুক্ত করুন");

      const { data: purchase, error: purchaseError } = await supabase
        .from("purchases")
        .insert({
          user_id: user.id,
          supplier_id: supplierId || null,
          purchase_number: purchaseNumber,
          total_amount: totalAmount,
          due_amount: totalAmount,
          status: "pending",
          notes,
        })
        .select()
        .single();

      if (purchaseError) throw purchaseError;

      const purchaseItems = validItems.map(item => ({
        purchase_id: purchase.id,
        product_id: item.product_id,
        quantity: item.quantity,
        unit_cost: item.unit_cost,
        total_cost: item.quantity * item.unit_cost,
      }));

      const { error: itemsError } = await supabase.from("purchase_items").insert(purchaseItems);
      if (itemsError) throw itemsError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchases"] });
      toast.success("ক্রয় অর্ডার তৈরি হয়েছে!");
      onOpenChange(false);
      resetForm();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const resetForm = () => {
    setSupplierId("");
    setNotes("");
    setItems([{ product_id: "", quantity: 1, unit_cost: 0 }]);
  };

  const addItem = () => setItems([...items, { product_id: "", quantity: 1, unit_cost: 0 }]);
  const removeItem = (idx: number) => setItems(items.filter((_, i) => i !== idx));
  const updateItem = (idx: number, field: string, value: any) => {
    const updated = [...items];
    (updated[idx] as any)[field] = value;
    setItems(updated);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>নতুন ক্রয় অর্ডার</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">সাপ্লায়ার</label>
            <Select value={supplierId} onValueChange={setSupplierId}>
              <SelectTrigger><SelectValue placeholder="সাপ্লায়ার নির্বাচন করুন" /></SelectTrigger>
              <SelectContent>
                {suppliers?.map(s => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">আইটেমসমূহ</label>
            {items.map((item, idx) => (
              <div key={idx} className="flex gap-2 mb-2 items-end">
                <div className="flex-1">
                  {idx === 0 && <label className="text-xs text-muted-foreground">প্রোডাক্ট</label>}
                  <Select value={item.product_id} onValueChange={(v) => updateItem(idx, "product_id", v)}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="প্রোডাক্ট" /></SelectTrigger>
                    <SelectContent>
                      {products?.map(p => (
                        <SelectItem key={p.id} value={p.id}>{p.name} {p.imei ? `(${p.imei})` : ""}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="w-20">
                  {idx === 0 && <label className="text-xs text-muted-foreground">পরিমাণ</label>}
                  <Input type="number" min={1} value={item.quantity} onChange={(e) => updateItem(idx, "quantity", Number(e.target.value))} className="h-9" />
                </div>
                <div className="w-28">
                  {idx === 0 && <label className="text-xs text-muted-foreground">দাম (৳)</label>}
                  <Input type="number" min={0} value={item.unit_cost || ""} onChange={(e) => updateItem(idx, "unit_cost", Number(e.target.value))} className="h-9" />
                </div>
                {items.length > 1 && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => removeItem(idx)} className="h-9 px-2 text-destructive">✕</Button>
                )}
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={addItem}>➕ আইটেম যুক্ত</Button>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">নোট</label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          <div className="bg-primary/10 p-4 rounded-lg flex justify-between items-center">
            <span className="font-semibold">সর্বমোট:</span>
            <span className="text-xl font-bold text-primary">৳{totalAmount.toLocaleString('bn-BD')}</span>
          </div>

          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => onOpenChange(false)}>বাতিল</Button>
            <Button onClick={() => createPurchaseMutation.mutate()} className="bg-gradient-to-r from-primary to-accent">
              ক্রয় অর্ডার তৈরি করুন
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
