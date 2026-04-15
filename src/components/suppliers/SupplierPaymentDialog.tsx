import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { generateSupplierReport } from "@/utils/supplierPdfReport";
import { useShopSettings } from "@/hooks/useShopSettings";

interface SupplierPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  supplier: any;
}

export function SupplierPaymentDialog({ open, onOpenChange, supplier }: SupplierPaymentDialogProps) {
  const queryClient = useQueryClient();
  const { settings } = useShopSettings();
  const [amount, setAmount] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [notes, setNotes] = useState("");
  const [selectedPurchaseId, setSelectedPurchaseId] = useState("");

  const { data: supplierPurchases } = useQuery({
    queryKey: ["supplier-purchases", supplier?.id],
    queryFn: async () => {
      if (!supplier?.id) return [];
      const { data, error } = await supabase
        .from("purchases")
        .select("*, purchase_items(*, products(name, cost, price, imei, condition, stock_quantity))")
        .eq("supplier_id", supplier.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!supplier?.id,
  });

  // Products directly linked to this supplier by name
  const { data: supplierProducts } = useQuery({
    queryKey: ["supplier-products-direct", supplier?.name],
    queryFn: async () => {
      if (!supplier?.name) return [];
      const { data, error } = await supabase
        .from("products")
        .select("id, name, cost, price, imei, condition, stock_quantity")
        .eq("supplier_name", supplier.name)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!supplier?.name,
  });

  const { data: supplierPayments } = useQuery({
    queryKey: ["supplier-payments", supplier?.id],
    queryFn: async () => {
      if (!supplier?.id) return [];
      const { data, error } = await supabase
        .from("supplier_payments")
        .select("*")
        .eq("supplier_id", supplier.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!supplier?.id,
  });

  const totalPurchaseAmount = supplierPurchases?.reduce((sum, p) => sum + Number(p.total_amount), 0) || 0;
  const totalPaid = supplierPayments?.reduce((sum, p) => sum + Number(p.amount), 0) || 0;
  const totalDue = totalPurchaseAmount - totalPaid;

  const payMutation = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      if (amount <= 0) throw new Error("পরিমাণ সঠিক নয়");

      const { error } = await supabase.from("supplier_payments").insert({
        supplier_id: supplier.id,
        purchase_id: selectedPurchaseId || null,
        amount,
        payment_method: paymentMethod,
        notes,
        paid_by: user.id,
      });
      if (error) throw error;

      // Update purchase due if linked
      if (selectedPurchaseId) {
        const purchase = supplierPurchases?.find(p => p.id === selectedPurchaseId);
        if (purchase) {
          const newPaid = Number(purchase.paid_amount) + amount;
          const newDue = Math.max(0, Number(purchase.total_amount) - newPaid);
          await supabase.from("purchases").update({
            paid_amount: newPaid,
            due_amount: newDue,
            status: newDue <= 0 ? "paid" : purchase.status,
          }).eq("id", selectedPurchaseId);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["supplier-payments"] });
      queryClient.invalidateQueries({ queryKey: ["supplier-purchases"] });
      queryClient.invalidateQueries({ queryKey: ["purchases"] });
      toast.success("পেমেন্ট সফল হয়েছে!");
      setAmount(0);
      setNotes("");
      setSelectedPurchaseId("");
    },
    onError: (err: any) => toast.error(err.message),
  });

  if (!supplier) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>💰 {supplier.name} — হিসাব নিকাশ</DialogTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                generateSupplierReport({
                  supplier,
                  purchases: supplierPurchases || [],
                  payments: supplierPayments || [],
                  totalPurchase: totalPurchaseAmount,
                  totalPaid: totalPaid,
                  totalDue,
                  shopName: settings.shop_name,
                });
                toast.success("PDF রিপোর্ট ডাউনলোড হচ্ছে!");
              }}
            >
              📄 PDF রিপোর্ট
            </Button>
          </div>
        </DialogHeader>

        {/* Summary */}
        <div className="grid grid-cols-3 gap-3">
          <Card className="p-3 bg-blue-50 dark:bg-blue-950/20">
            <p className="text-xs text-muted-foreground">মোট ক্রয়</p>
            <p className="text-lg font-bold text-blue-600">৳{totalPurchaseAmount.toLocaleString('bn-BD')}</p>
          </Card>
          <Card className="p-3 bg-green-50 dark:bg-green-950/20">
            <p className="text-xs text-muted-foreground">পরিশোধিত</p>
            <p className="text-lg font-bold text-green-600">৳{totalPaid.toLocaleString('bn-BD')}</p>
          </Card>
          <Card className="p-3 bg-red-50 dark:bg-red-950/20">
            <p className="text-xs text-muted-foreground">বাকি</p>
            <p className="text-lg font-bold text-red-600">৳{totalDue.toLocaleString('bn-BD')}</p>
          </Card>
        </div>

        {/* Make Payment */}
        {totalDue > 0 && (
          <Card className="p-4 border-primary/20">
            <h3 className="font-semibold mb-3">পেমেন্ট করুন</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium">ক্রয় অর্ডার (ঐচ্ছিক)</label>
                <Select value={selectedPurchaseId} onValueChange={setSelectedPurchaseId}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="অর্ডার নির্বাচন করুন" /></SelectTrigger>
                  <SelectContent>
                    {supplierPurchases?.filter(p => Number(p.due_amount) > 0).map(p => (
                      <SelectItem key={p.id} value={p.id}>
                        PO #{p.purchase_number} — বাকি ৳{Number(p.due_amount).toLocaleString('bn-BD')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-xs font-medium">পরিমাণ (৳)</label>
                  <Input type="number" value={amount || ""} onChange={(e) => setAmount(Number(e.target.value))} className="h-9" />
                </div>
                <div className="w-32">
                  <label className="text-xs font-medium">পদ্ধতি</label>
                  <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">💵 নগদ</SelectItem>
                      <SelectItem value="bank">🏦 ব্যাংক</SelectItem>
                      <SelectItem value="mobile">📱 মোবাইল</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Textarea placeholder="নোট..." value={notes} onChange={(e) => setNotes(e.target.value)} className="h-16" />
              <Button onClick={() => payMutation.mutate()} className="w-full bg-gradient-to-r from-primary to-accent">
                💰 পেমেন্ট করুন
              </Button>
            </div>
          </Card>
        )}

        {/* Payment History */}
        <div>
          <h3 className="font-semibold mb-2">পেমেন্ট ইতিহাস</h3>
          {supplierPayments && supplierPayments.length > 0 ? (
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {supplierPayments.map((p: any) => (
                <div key={p.id} className="flex justify-between items-center p-2 bg-muted rounded text-sm">
                  <div>
                    <p className="font-medium">৳{Number(p.amount).toLocaleString('bn-BD')}</p>
                    <p className="text-xs text-muted-foreground">
                      {p.payment_method === 'cash' ? '💵 নগদ' : p.payment_method === 'bank' ? '🏦 ব্যাংক' : '📱 মোবাইল'}
                      {p.notes && ` — ${p.notes}`}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {new Date(p.created_at).toLocaleDateString('bn-BD')}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">কোনো পেমেন্ট নেই</p>
          )}
        </div>

        {/* Purchase History */}
        <div>
          <h3 className="font-semibold mb-2">ক্রয় ইতিহাস</h3>
          {supplierPurchases && supplierPurchases.length > 0 ? (
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {supplierPurchases.map((p: any) => (
                <div key={p.id} className="p-2 bg-muted rounded text-sm">
                  <div className="flex justify-between items-center">
                    <span className="font-medium">PO #{p.purchase_number}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      p.status === 'paid' ? 'bg-green-100 text-green-700' :
                      p.status === 'received' ? 'bg-blue-100 text-blue-700' :
                      'bg-yellow-100 text-yellow-700'
                    }`}>{p.status}</span>
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground mt-1">
                    <span>মোট: ৳{Number(p.total_amount).toLocaleString('bn-BD')}</span>
                    <span>বাকি: ৳{Number(p.due_amount).toLocaleString('bn-BD')}</span>
                    <span>{new Date(p.created_at).toLocaleDateString('bn-BD')}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">কোনো ক্রয় নেই</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
