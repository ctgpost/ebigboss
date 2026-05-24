import { useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { BarcodeScanner } from "@/components/BarcodeScanner";
import { filterCacheKey, getPurchaseFilterResult, savePurchaseFilterResult } from "@/utils/offlineAssets";
import { queueIfOffline } from "@/utils/offlineQueue";
import { createClientRequestId } from "@/utils/requestKeys";
import { Filter, ScanLine, Search } from "lucide-react";

interface CreatePurchaseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  suppliers: any[];
  products: any[];
  purchases?: any[];
}

export function CreatePurchaseDialog({ open, onOpenChange, suppliers, products, purchases = [] }: CreatePurchaseDialogProps) {
  const queryClient = useQueryClient();
  const [supplierId, setSupplierId] = useState("");
  const [notes, setNotes] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [brandFilter, setBrandFilter] = useState("all");
  const [conditionFilter, setConditionFilter] = useState("all");
  const [poFilter, setPoFilter] = useState("all");
  const [stockFilter, setStockFilter] = useState("all");
  const [scannerIndex, setScannerIndex] = useState<number | null>(null);
  const [items, setItems] = useState<{ product_id: string; quantity: number; unit_cost: number }[]>([
    { product_id: "", quantity: 1, unit_cost: 0 },
  ]);
  const purchaseRequestIdRef = useRef<string | null>(null);

  const validItems = useMemo(
    () => items.filter((item) => item.product_id && Number(item.quantity) > 0),
    [items],
  );
  const totalAmount = validItems.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unit_cost || 0), 0);
  const brands = useMemo(() => Array.from(new Set((products || []).map(p => p.brand).filter(Boolean))).sort(), [products]);
  const poProductIds = useMemo(() => {
    const map = new Map<string, Set<string>>();
    (purchases || []).forEach((po) => map.set(po.id, new Set((po.purchase_items || []).map((it: any) => it.product_id).filter(Boolean))));
    return map;
  }, [purchases]);
  const selectedProductIds = useMemo(() => new Set(items.map((item) => item.product_id).filter(Boolean)), [items]);
  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    const selectedPoProducts = poFilter === "all" ? null : poProductIds.get(poFilter);
    const key = filterCacheKey([q, brandFilter, conditionFilter, poFilter, stockFilter]);
    const cachedIds = !navigator.onLine ? getPurchaseFilterResult(key) : null;
    const result = (products || []).filter((p) => {
      if (cachedIds && !cachedIds.includes(p.id)) return false;
      const matchesText = !q || `${p.name || ""} ${p.imei || ""} ${p.barcode || ""} ${p.sku || ""} ${p.model || ""}`.toLowerCase().includes(q);
      const matchesBrand = brandFilter === "all" || p.brand === brandFilter;
      const matchesCondition = conditionFilter === "all" || p.condition === conditionFilter;
      const matchesPo = !selectedPoProducts || selectedPoProducts.has(p.id);
      const stock = Number(p.stock_quantity || 0);
      const matchesStock = stockFilter === "all" || (stockFilter === "available" ? stock > 0 : stock <= 0);
      return matchesText && matchesBrand && matchesCondition && matchesPo && matchesStock;
    }).slice(0, 80);
    if (!cachedIds) savePurchaseFilterResult(key, result.map((p: any) => p.id));
    return result;
  }, [products, productSearch, brandFilter, conditionFilter, poFilter, poProductIds, stockFilter]);

  const createPurchaseMutation = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      purchaseRequestIdRef.current ||= createClientRequestId("purchase");
      const requestId = purchaseRequestIdRef.current;
      const purchaseNumber = `PO-${Date.now()}`;
      if (validItems.length === 0) throw new Error("কমপক্ষে একটি আইটেম যুক্ত করুন");
      if (!supplierId) throw new Error("সাপ্লায়ার নির্বাচন করুন");

      const purchasePayload = {
        user_id: user.id,
        supplier_id: supplierId,
        purchase_number: purchaseNumber,
        total_amount: totalAmount,
        due_amount: totalAmount,
        status: "pending",
        notes,
        client_request_id: requestId,
      };
      const purchaseItems = validItems.map(item => ({
        product_id: item.product_id,
        quantity: item.quantity,
        unit_cost: item.unit_cost,
        total_cost: item.quantity * item.unit_cost,
      }));

      let purchase: any;
      try {
        const { data, error: purchaseError } = await (supabase as any)
          .rpc("create_purchase_idempotent", {
            _request_id: requestId,
            _purchase: purchasePayload,
            _items: purchaseItems,
          });

        if (purchaseError) throw purchaseError;
        purchase = data;
      } catch (error) {
        queueIfOffline("purchase_create", { purchase: purchasePayload, items: purchaseItems, client_request_id: requestId }, error);
        return;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchases"] });
      toast.success("ক্রয় অর্ডার তৈরি হয়েছে!");
      purchaseRequestIdRef.current = null;
      onOpenChange(false);
      resetForm();
    },
    onError: (err: any) => {
      purchaseRequestIdRef.current = null;
      toast.error(err.message);
    },
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

  const selectProduct = (idx: number, productId: string) => {
    const product = products?.find(p => p.id === productId);
    const updated = [...items];
    updated[idx] = { ...updated[idx], product_id: productId, unit_cost: Number(product?.cost || updated[idx].unit_cost || 0) };
    setItems(updated);
  };

  const handleBarcodeScan = (code: string) => {
    const normalized = code.trim().toLowerCase();
    const product = products?.find(p => [p.barcode, p.imei, p.sku].filter(Boolean).some((v: string) => v.toLowerCase() === normalized));
    if (!product || scannerIndex === null) {
      toast.error("এই বারকোড/IMEI দিয়ে প্রোডাক্ট পাওয়া যায়নি");
      return;
    }
    if (selectedProductIds.has(product.id) && items[scannerIndex]?.product_id !== product.id) {
      toast.error("এই প্রোডাক্টটি ইতোমধ্যে অর্ডারে আছে");
      setScannerIndex(null);
      return;
    }
    selectProduct(scannerIndex, product.id);
    toast.success(`${product.name} নির্বাচিত হয়েছে`);
    setScannerIndex(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>নতুন ক্রয় অর্ডার</DialogTitle>
          <DialogDescription>প্রোডাক্ট সার্চ, ফিল্টার বা বারকোড/IMEI স্ক্যান করে দ্রুত আইটেম যোগ করুন।</DialogDescription>
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
            <div className="grid grid-cols-1 md:grid-cols-5 gap-2 mb-3 rounded-lg border bg-muted/30 p-3">
              <div className="relative md:col-span-2">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input value={productSearch} onChange={(e) => setProductSearch(e.target.value)} placeholder="নাম, IMEI, SKU, বারকোড..." className="pl-9" />
              </div>
              <Select value={brandFilter} onValueChange={setBrandFilter}>
                <SelectTrigger><Filter className="h-4 w-4 mr-2" /><SelectValue placeholder="ব্র্যান্ড" /></SelectTrigger>
                <SelectContent><SelectItem value="all">সব ব্র্যান্ড</SelectItem>{brands.map((b: string) => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={conditionFilter} onValueChange={setConditionFilter}>
                <SelectTrigger><SelectValue placeholder="কন্ডিশন" /></SelectTrigger>
                <SelectContent><SelectItem value="all">সব কন্ডিশন</SelectItem><SelectItem value="new">নতুন</SelectItem><SelectItem value="used">ব্যবহৃত</SelectItem></SelectContent>
              </Select>
              <Select value={poFilter} onValueChange={setPoFilter}>
                <SelectTrigger><SelectValue placeholder="PO" /></SelectTrigger>
                <SelectContent><SelectItem value="all">সব PO</SelectItem>{purchases.map((po: any) => <SelectItem key={po.id} value={po.id}>{po.purchase_number}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={stockFilter} onValueChange={setStockFilter}>
                <SelectTrigger><SelectValue placeholder="স্টক" /></SelectTrigger>
                <SelectContent><SelectItem value="all">সব স্টক</SelectItem><SelectItem value="available">স্টকে আছে</SelectItem><SelectItem value="out">স্টক নেই</SelectItem></SelectContent>
              </Select>
            </div>
            {items.map((item, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 mb-2 items-end">
                <div className="col-span-10 md:col-span-6">
                  {idx === 0 && <label className="text-xs text-muted-foreground">প্রোডাক্ট</label>}
                  <Select value={item.product_id} onValueChange={(v) => selectProduct(idx, v)}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="প্রোডাক্ট" /></SelectTrigger>
                    <SelectContent>
                      {filteredProducts?.map(p => (
                        <SelectItem key={p.id} value={p.id} disabled={selectedProductIds.has(p.id) && item.product_id !== p.id}>{p.name} {p.imei ? `(${p.imei})` : ""} {p.brand ? `• ${p.brand}` : ""}</SelectItem>
                      ))}
                      {filteredProducts.length === 0 && <SelectItem value="no-products" disabled>কোনো প্রোডাক্ট পাওয়া যায়নি</SelectItem>}
                    </SelectContent>
                  </Select>
                </div>
                <Button type="button" variant="outline" size="icon" className="h-9 col-span-2 md:col-span-1" onClick={() => setScannerIndex(idx)} title="বারকোড/IMEI স্ক্যান">
                  <ScanLine className="h-4 w-4" />
                </Button>
                <div className="col-span-5 md:col-span-2">
                  {idx === 0 && <label className="text-xs text-muted-foreground">পরিমাণ</label>}
                  <Input type="number" min={1} value={item.quantity} onChange={(e) => updateItem(idx, "quantity", Number(e.target.value))} className="h-9" />
                </div>
                <div className="col-span-5 md:col-span-3">
                  {idx === 0 && <label className="text-xs text-muted-foreground">দাম (৳)</label>}
                  <Input type="number" min={0} value={item.unit_cost || ""} onChange={(e) => updateItem(idx, "unit_cost", Number(e.target.value))} className="h-9" />
                </div>
                {items.length > 1 && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => removeItem(idx)} className="h-9 px-2 text-destructive col-span-2 md:col-span-1">✕</Button>
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
            <Button onClick={() => createPurchaseMutation.mutate()} disabled={!supplierId || validItems.length === 0 || createPurchaseMutation.isPending} className="bg-gradient-to-r from-primary to-accent">
              {createPurchaseMutation.isPending ? "তৈরি হচ্ছে..." : "ক্রয় অর্ডার তৈরি করুন"}
            </Button>
          </div>
        </div>
      </DialogContent>
      <BarcodeScanner isOpen={scannerIndex !== null} onClose={() => setScannerIndex(null)} onScan={handleBarcodeScan} title="ক্রয় অর্ডারের প্রোডাক্ট স্ক্যান" />
    </Dialog>
  );
}
