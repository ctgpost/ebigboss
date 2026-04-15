import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  // Also include product costs directly linked by supplier_name (not via purchase orders)
  const directProductCost = supplierProducts?.reduce((sum, p) => sum + Number(p.cost), 0) || 0;
  const totalOwed = Math.max(totalPurchaseAmount, directProductCost); // Use the higher value to avoid double-counting
  const totalPaid = supplierPayments?.reduce((sum, p) => sum + Number(p.amount), 0) || 0;
  const totalDue = totalOwed - totalPaid;
  const purchasesWithDue = supplierPurchases?.filter(p => Number(p.due_amount) > 0) || [];

  // Monthly summary calculation
  const monthlySummary = useMemo(() => {
    const months: Record<string, { purchases: number; payments: number; month: string }> = {};

    supplierPurchases?.forEach((p: any) => {
      const key = new Date(p.created_at).toISOString().slice(0, 7);
      if (!months[key]) months[key] = { purchases: 0, payments: 0, month: key };
      months[key].purchases += Number(p.total_amount);
    });

    supplierPayments?.forEach((p: any) => {
      const key = new Date(p.created_at).toISOString().slice(0, 7);
      if (!months[key]) months[key] = { purchases: 0, payments: 0, month: key };
      months[key].payments += Number(p.amount);
    });

    return Object.values(months).sort((a, b) => b.month.localeCompare(a.month));
  }, [supplierPurchases, supplierPayments]);

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
      queryClient.invalidateQueries({ queryKey: ["supplier-payments-all"] });
      toast.success("পেমেন্ট সফল হয়েছে!");
      setAmount(0);
      setNotes("");
      setSelectedPurchaseId("");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const handleQuickPay = (val: number) => setAmount(val);

  const handleFullDuePay = () => {
    if (selectedPurchaseId) {
      const purchase = supplierPurchases?.find(p => p.id === selectedPurchaseId);
      if (purchase) setAmount(Number(purchase.due_amount));
    } else {
      setAmount(totalDue > 0 ? totalDue : 0);
    }
  };

  const formatMonth = (key: string) => {
    const [y, m] = key.split("-");
    const monthNames = ["জানুয়ারি", "ফেব্রুয়ারি", "মার্চ", "এপ্রিল", "মে", "জুন", "জুলাই", "আগস্ট", "সেপ্টেম্বর", "অক্টোবর", "নভেম্বর", "ডিসেম্বর"];
    return `${monthNames[Number(m) - 1]} ${y}`;
  };

  if (!supplier) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <div className="flex items-center justify-between flex-wrap gap-2">
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
                  totalPaid,
                  totalDue,
                  shopName: settings.shop_name,
                  monthlySummary,
                  supplierProducts: supplierProducts || [],
                });
                toast.success("PDF রিপোর্ট ডাউনলোড হচ্ছে!");
              }}
            >
              📄 PDF রিপোর্ট
            </Button>
          </div>
        </DialogHeader>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
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
          <Card className="p-3 bg-purple-50 dark:bg-purple-950/20">
            <p className="text-xs text-muted-foreground">মোট অর্ডার</p>
            <p className="text-lg font-bold text-purple-600">{supplierPurchases?.length || 0}টি</p>
          </Card>
        </div>

        {/* Payment Section - always visible */}
        <Card className="p-4 border-primary/20">
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            💳 পেমেন্ট করুন
            {totalDue > 0 && <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full">বাকি আছে ৳{totalDue.toLocaleString('bn-BD')}</span>}
          </h3>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium">ক্রয় অর্ডার (ঐচ্ছিক)</label>
              <Select value={selectedPurchaseId} onValueChange={(v) => {
                setSelectedPurchaseId(v);
                const p = supplierPurchases?.find(p => p.id === v);
                if (p) setAmount(Number(p.due_amount));
              }}>
                <SelectTrigger className="h-9"><SelectValue placeholder="সকল — সাধারণ পেমেন্ট" /></SelectTrigger>
                <SelectContent>
                  {purchasesWithDue.map(p => (
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
                <Input type="number" value={amount || ""} onChange={(e) => setAmount(Number(e.target.value))} className="h-9" placeholder="টাকার পরিমাণ" />
              </div>
              <div className="w-32">
                <label className="text-xs font-medium">পদ্ধতি</label>
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">💵 নগদ</SelectItem>
                    <SelectItem value="bank">🏦 ব্যাংক</SelectItem>
                    <SelectItem value="mobile">📱 মোবাইল</SelectItem>
                    <SelectItem value="cheque">📝 চেক</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Quick pay buttons */}
            <div className="flex gap-1.5 flex-wrap">
              {totalDue > 0 && (
                <Button type="button" variant="outline" size="sm" onClick={handleFullDuePay} className="text-xs">
                  সম্পূর্ণ বাকি
                </Button>
              )}
              {[1000, 2000, 5000, 10000].map(v => (
                <Button key={v} type="button" variant="outline" size="sm" onClick={() => handleQuickPay(v)} className="text-xs">
                  ৳{v.toLocaleString('bn-BD')}
                </Button>
              ))}
            </div>

            <Textarea placeholder="নোট (ঐচ্ছিক)..." value={notes} onChange={(e) => setNotes(e.target.value)} className="h-14" />
            <Button
              onClick={() => payMutation.mutate()}
              disabled={amount <= 0}
              className="w-full bg-gradient-to-r from-primary to-accent"
            >
              💰 ৳{amount.toLocaleString('bn-BD')} পরিশোধ করুন
            </Button>
          </div>
        </Card>

        <Tabs defaultValue="payments" className="w-full">
          <TabsList className="grid w-full grid-cols-4 text-xs">
            <TabsTrigger value="payments">পেমেন্ট</TabsTrigger>
            <TabsTrigger value="purchases">ক্রয়</TabsTrigger>
            <TabsTrigger value="products">প্রোডাক্ট</TabsTrigger>
            <TabsTrigger value="monthly">মাসিক</TabsTrigger>
          </TabsList>

          {/* Payment History */}
          <TabsContent value="payments" className="space-y-2 max-h-60 overflow-y-auto">
            {supplierPayments && supplierPayments.length > 0 ? (
              supplierPayments.map((p: any) => (
                <div key={p.id} className="flex justify-between items-center p-2.5 bg-muted rounded text-sm">
                  <div>
                    <p className="font-medium">৳{Number(p.amount).toLocaleString('bn-BD')}</p>
                    <p className="text-xs text-muted-foreground">
                      {p.payment_method === 'cash' ? '💵 নগদ' : p.payment_method === 'bank' ? '🏦 ব্যাংক' : p.payment_method === 'cheque' ? '📝 চেক' : '📱 মোবাইল'}
                      {p.notes && ` — ${p.notes}`}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground">{new Date(p.created_at).toLocaleDateString('bn-BD')}</span>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground text-center py-6">কোনো পেমেন্ট নেই</p>
            )}
          </TabsContent>

          {/* Purchase History */}
          <TabsContent value="purchases" className="space-y-2 max-h-60 overflow-y-auto">
            {supplierPurchases && supplierPurchases.length > 0 ? (
              supplierPurchases.map((p: any) => (
                <div key={p.id} className="p-2.5 bg-muted rounded text-sm">
                  <div className="flex justify-between items-center">
                    <span className="font-medium">PO #{p.purchase_number}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      p.status === 'paid' ? 'bg-green-100 text-green-700' :
                      p.status === 'received' ? 'bg-blue-100 text-blue-700' :
                      'bg-yellow-100 text-yellow-700'
                    }`}>{p.status === 'paid' ? 'পরিশোধিত' : p.status === 'received' ? 'গৃহীত' : 'পেন্ডিং'}</span>
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground mt-1">
                    <span>মোট: ৳{Number(p.total_amount).toLocaleString('bn-BD')}</span>
                    <span className="text-green-600">পরিশোধ: ৳{Number(p.paid_amount).toLocaleString('bn-BD')}</span>
                    <span className="text-red-600">বাকি: ৳{Number(p.due_amount).toLocaleString('bn-BD')}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{new Date(p.created_at).toLocaleDateString('bn-BD')}</p>
                  {/* Items */}
                  {(p.purchase_items as any[])?.length > 0 && (
                    <div className="mt-1.5 pl-2 border-l-2 border-primary/20 space-y-0.5">
                      {(p.purchase_items as any[]).map((item: any) => (
                        <p key={item.id} className="text-xs text-muted-foreground">
                          {item.products?.name || "—"} × {item.quantity} = ৳{Number(item.total_cost).toLocaleString('bn-BD')}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground text-center py-6">কোনো ক্রয় নেই</p>
            )}
          </TabsContent>

          {/* Products */}
          <TabsContent value="products" className="space-y-2 max-h-60 overflow-y-auto">
            {(() => {
              const productMap = new Map<string, any>();
              supplierPurchases?.forEach((p: any) => {
                (p.purchase_items as any[])?.forEach((item: any) => {
                  const prod = item.products;
                  if (prod && !productMap.has(prod.name)) {
                    productMap.set(prod.name, {
                      name: prod.name, cost: item.unit_cost || prod.cost, price: prod.price,
                      imei: prod.imei, condition: prod.condition, stock: prod.stock_quantity, qty: item.quantity,
                    });
                  }
                });
              });
              supplierProducts?.forEach((prod: any) => {
                if (!productMap.has(prod.name)) {
                  productMap.set(prod.name, {
                    name: prod.name, cost: prod.cost, price: prod.price,
                    imei: prod.imei, condition: prod.condition, stock: prod.stock_quantity, qty: 1,
                  });
                }
              });
              const allProducts = Array.from(productMap.values());
              if (allProducts.length === 0) return <p className="text-sm text-muted-foreground text-center py-6">কোনো প্রোডাক্ট নেই</p>;
              const totalCost = allProducts.reduce((sum, p) => sum + Number(p.cost) * p.qty, 0);
              return (
                <>
                  <div className="flex justify-between text-xs text-muted-foreground px-1">
                    <span>মোট {allProducts.length}টি প্রোডাক্ট</span>
                    <span>মোট ক্রয়মূল্য: ৳{totalCost.toLocaleString('bn-BD')}</span>
                  </div>
                  {allProducts.map((prod, idx) => (
                    <div key={idx} className="flex justify-between items-center p-2 bg-muted rounded text-sm">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{prod.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {prod.imei && `IMEI: ${prod.imei} • `}
                          {prod.condition === 'new' ? 'নতুন' : prod.condition === 'used' ? 'সেকেন্ড হ্যান্ড' : prod.condition || ''} • স্টক: {prod.stock}
                        </p>
                      </div>
                      <div className="text-right ml-2">
                        <p className="font-medium text-primary">৳{Number(prod.cost).toLocaleString('bn-BD')}</p>
                        <p className="text-xs text-muted-foreground">×{prod.qty}</p>
                      </div>
                    </div>
                  ))}
                </>
              );
            })()}
          </TabsContent>

          {/* Monthly Summary */}
          <TabsContent value="monthly" className="space-y-2 max-h-60 overflow-y-auto">
            {monthlySummary.length > 0 ? (
              monthlySummary.map((m) => (
                <div key={m.month} className="p-3 bg-muted rounded text-sm">
                  <p className="font-semibold mb-1">{formatMonth(m.month)}</p>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <span className="text-muted-foreground">ক্রয়: </span>
                      <span className="font-medium text-blue-600">৳{m.purchases.toLocaleString('bn-BD')}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">পরিশোধ: </span>
                      <span className="font-medium text-green-600">৳{m.payments.toLocaleString('bn-BD')}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">ব্যালেন্স: </span>
                      <span className={`font-medium ${m.purchases - m.payments > 0 ? 'text-red-600' : 'text-green-600'}`}>
                        ৳{Math.abs(m.purchases - m.payments).toLocaleString('bn-BD')}
                      </span>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground text-center py-6">কোনো লেনদেন নেই</p>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
