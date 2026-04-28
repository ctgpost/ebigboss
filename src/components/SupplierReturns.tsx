import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { bn } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { ActivityLogger } from "@/hooks/useActivityLog";
import { useUserRole } from "@/hooks/useUserRole";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { ReturnPhotoUpload } from "@/components/returns/ReturnPhotoUpload";
import { ZoomableImage } from "@/components/ui/zoomable-image";
import { toast } from "sonner";
import { BarChart3, CheckCircle, Clock, FileText, Package, Printer, RefreshCcw, Search, Truck, XCircle } from "lucide-react";

type ReturnMethod = "cash_refund" | "due_adjust" | "replacement";
type FinanceAction = "none" | "supplier_refund" | "due_adjust";
type StockAction = "deduct_stock" | "no_stock_change";

const db = supabase as any;

const REASON_LABELS: Record<string, string> = {
  defective: "ত্রুটিপূর্ণ পণ্য",
  damaged: "ক্ষতিগ্রস্ত",
  wrong_item: "ভুল পণ্য এসেছে",
  warranty_claim: "ওয়ারেন্টি/সার্ভিস ক্লেইম",
  supplier_request: "সাপ্লায়ারের অনুরোধ",
  other: "অন্যান্য",
};

const METHOD_LABELS: Record<string, string> = {
  cash_refund: "সাপ্লায়ার নগদ ফেরত",
  due_adjust: "সাপ্লায়ারের বাকি সমন্বয়",
  replacement: "রিপ্লেসমেন্ট/বদলি পণ্য",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "অপেক্ষমাণ",
  completed: "সম্পন্ন",
  rejected: "প্রত্যাখ্যাত",
};

export function SupplierReturns() {
  const { isAdmin, isManager, userId } = useUserRole();
  const canApprove = isAdmin || isManager;
  const queryClient = useQueryClient();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedSupplierId, setSelectedSupplierId] = useState("all");
  const [selectedPurchaseId, setSelectedPurchaseId] = useState("all");
  const [selectedItemId, setSelectedItemId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [reasonCode, setReasonCode] = useState("defective");
  const [reasonNotes, setReasonNotes] = useState("");
  const [returnMethod, setReturnMethod] = useState<ReturnMethod>("due_adjust");
  const [stockAction, setStockAction] = useState<StockAction>("deduct_stock");
  const [defectPhotoUrl, setDefectPhotoUrl] = useState<string | null>(null);
  const [replacementNote, setReplacementNote] = useState("");
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");

  const { data: suppliers } = useQuery({
    queryKey: ["supplier-return-suppliers"],
    queryFn: async () => {
      const { data, error } = await db.from("suppliers").select("*").order("name");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: purchases } = useQuery({
    queryKey: ["supplier-return-purchases", selectedSupplierId],
    queryFn: async () => {
      let query = db
        .from("purchases")
        .select("*, suppliers(name, phone), purchase_items(*, products(id, name, imei, brand, model, condition, stock_quantity, cost))")
        .order("created_at", { ascending: false });
      if (selectedSupplierId !== "all") query = query.eq("supplier_id", selectedSupplierId);
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
  });

  const { data: supplierReturns, isLoading } = useQuery({
    queryKey: ["supplier-returns"],
    queryFn: async () => {
      const { data, error } = await db
        .from("supplier_returns")
        .select(`
          *,
          suppliers(name, phone, image_url),
          purchases(purchase_number, total_amount, paid_amount, due_amount),
          supplier_return_items(*, products(name, imei, brand, model, condition))
        `)
        .order("created_at", { ascending: false });
      if (error) throw error;

      const ids = Array.from(new Set((data || []).flatMap((r: any) => [r.processed_by, r.approved_by]).filter(Boolean)));
      let profiles: Record<string, any> = {};
      if (ids.length) {
        const { data: profs } = await db.from("profiles").select("id, full_name, email").in("id", ids);
        profiles = Object.fromEntries((profs || []).map((p: any) => [p.id, p]));
      }
      return (data || []).map((r: any) => ({
        ...r,
        processed_by_profile: r.processed_by ? profiles[r.processed_by] : null,
        approved_by_profile: r.approved_by ? profiles[r.approved_by] : null,
      }));
    },
  });

  const selectedPurchase = purchases?.find((p: any) => p.id === selectedPurchaseId);
  const selectedItem = selectedPurchase?.purchase_items?.find((i: any) => i.id === selectedItemId);
  const refundAmount = selectedItem ? Number(selectedItem.unit_cost) * quantity : 0;
  const financeAction: FinanceAction = returnMethod === "cash_refund" ? "supplier_refund" : returnMethod === "due_adjust" ? "due_adjust" : "none";

  const resetForm = () => {
    setSelectedPurchaseId("all");
    setSelectedItemId("");
    setQuantity(1);
    setReasonCode("defective");
    setReasonNotes("");
    setReturnMethod("due_adjust");
    setStockAction("deduct_stock");
    setDefectPhotoUrl(null);
    setReplacementNote("");
    setIsDialogOpen(false);
  };

  const deductStock = async (productId: string, qty: number) => {
    const { data: product } = await db.from("products").select("stock_quantity").eq("id", productId).single();
    if (!product) return;
    await db.from("products").update({ stock_quantity: Math.max(0, Number(product.stock_quantity || 0) - qty) }).eq("id", productId);
  };

  const applyFinance = async (ret: any, items: any[]) => {
    if (!ret.purchase_id || ret.finance_action === "none") return;
    const { data: purchase } = await db.from("purchases").select("total_amount, paid_amount, due_amount, status").eq("id", ret.purchase_id).single();
    if (!purchase) return;

    const newTotal = Math.max(0, Number(purchase.total_amount) - Number(ret.refund_amount));
    let newPaid = Number(purchase.paid_amount || 0);

    if (ret.finance_action === "supplier_refund" && Number(ret.refund_amount) > 0) {
      newPaid = Math.max(0, newPaid - Number(ret.refund_amount));
      await db.from("supplier_payments").insert({
        supplier_id: ret.supplier_id,
        purchase_id: ret.purchase_id,
        supplier_return_id: ret.id,
        amount: -Number(ret.refund_amount),
        payment_method: "supplier_refund",
        notes: `সাপ্লায়ার রিটার্ন রিফান্ড: ${ret.return_number}`,
        paid_by: userId,
      });
    }

    const newDue = Math.max(0, newTotal - newPaid);
    await db.from("purchases").update({
      total_amount: newTotal,
      paid_amount: newPaid,
      due_amount: newDue,
      status: newTotal === 0 ? "returned" : newDue <= 0 ? "paid" : purchase.status,
    }).eq("id", ret.purchase_id);
  };

  const createReturnMutation = useMutation({
    mutationFn: async () => {
      if (selectedPurchaseId === "all" || !selectedPurchase) throw new Error("ক্রয় অর্ডার নির্বাচন করুন");
      if (!selectedItem) throw new Error("রিটার্ন আইটেম নির্বাচন করুন");
      if (quantity < 1 || quantity > Number(selectedItem.received_quantity || selectedItem.quantity)) throw new Error("রিটার্ন পরিমাণ সঠিক নয়");

      const autoApprove = isAdmin;
      const { data: ret, error } = await db.from("supplier_returns").insert({
        supplier_id: selectedPurchase.supplier_id,
        purchase_id: selectedPurchase.id,
        reason_code: reasonCode,
        reason_notes: reasonNotes || null,
        return_method: returnMethod,
        status: autoApprove ? "completed" : "pending",
        finance_action: financeAction,
        stock_action: stockAction,
        refund_amount: refundAmount,
        replacement_note: replacementNote || null,
        defect_photo_url: defectPhotoUrl,
        processed_by: userId,
        approved_by: autoApprove ? userId : null,
        approved_at: autoApprove ? new Date().toISOString() : null,
      }).select("*").single();
      if (error) throw error;

      const returnItem = {
        supplier_return_id: ret.id,
        purchase_item_id: selectedItem.id,
        product_id: selectedItem.product_id,
        quantity,
        unit_cost: Number(selectedItem.unit_cost),
        total_cost: refundAmount,
        stock_deducted: autoApprove && stockAction === "deduct_stock",
      };
      const { error: itemError } = await db.from("supplier_return_items").insert(returnItem);
      if (itemError) throw itemError;

      if (autoApprove) {
        if (stockAction === "deduct_stock") await deductStock(selectedItem.product_id, quantity);
        await applyFinance(ret, [returnItem]);
      }

      await ActivityLogger.supplierReturnCreated?.(ret.return_number, selectedPurchase.suppliers?.name || "সাপ্লায়ার", refundAmount, ret.status);
      return ret;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["supplier-returns"] });
      queryClient.invalidateQueries({ queryKey: ["purchases"] });
      queryClient.invalidateQueries({ queryKey: ["supplier-return-purchases"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["supplier-payments-all"] });
      toast.success(isAdmin ? "সাপ্লায়ার রিটার্ন সম্পন্ন হয়েছে" : "সাপ্লায়ার রিটার্ন অনুমোদনের অপেক্ষায় সংরক্ষিত");
      resetForm();
    },
    onError: (e: any) => toast.error(e.message || "রিটার্ন তৈরি ব্যর্থ"),
  });

  const approveMutation = useMutation({
    mutationFn: async (ret: any) => {
      if (!canApprove) throw new Error("অনুমোদনের অনুমতি নেই");
      const { data: items } = await db.from("supplier_return_items").select("*").eq("supplier_return_id", ret.id);
      const returnItems = items || [];
      for (const item of returnItems) {
        if (ret.stock_action === "deduct_stock" && !item.stock_deducted) {
          await deductStock(item.product_id, item.quantity);
          await db.from("supplier_return_items").update({ stock_deducted: true }).eq("id", item.id);
        }
      }
      await applyFinance(ret, returnItems);
      const { error } = await db.from("supplier_returns").update({
        status: "completed",
        approved_by: userId,
        approved_at: new Date().toISOString(),
      }).eq("id", ret.id);
      if (error) throw error;
      await ActivityLogger.supplierReturnProcessed?.(ret.return_number, "completed", ret.suppliers?.name || "সাপ্লায়ার", Number(ret.refund_amount));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["supplier-returns"] });
      queryClient.invalidateQueries({ queryKey: ["supplier-return-purchases"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["supplier-payments-all"] });
      toast.success("সাপ্লায়ার রিটার্ন অনুমোদিত");
    },
    onError: (e: any) => toast.error(e.message || "অনুমোদন ব্যর্থ"),
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ ret, reason }: { ret: any; reason: string }) => {
      const { error } = await db.from("supplier_returns").update({
        status: "rejected",
        rejected_reason: reason,
        approved_by: userId,
        approved_at: new Date().toISOString(),
      }).eq("id", ret.id);
      if (error) throw error;
      await ActivityLogger.supplierReturnProcessed?.(ret.return_number, "rejected", ret.suppliers?.name || "সাপ্লায়ার", Number(ret.refund_amount));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["supplier-returns"] });
      toast.success("সাপ্লায়ার রিটার্ন প্রত্যাখ্যাত");
      setRejectingId(null);
      setRejectReason("");
    },
    onError: (e: any) => toast.error(e.message || "প্রত্যাখ্যান ব্যর্থ"),
  });

  const filteredReturns = useMemo(() => {
    return (supplierReturns || []).filter((r: any) => {
      const matchesStatus = filterStatus === "all" || r.status === filterStatus;
      const needle = `${r.return_number} ${r.suppliers?.name || ""} ${r.purchases?.purchase_number || ""}`.toLowerCase();
      return matchesStatus && needle.includes(searchTerm.toLowerCase());
    });
  }, [supplierReturns, filterStatus, searchTerm]);

  const analytics = useMemo(() => {
    const completed = (supplierReturns || []).filter((r: any) => r.status === "completed");
    const bySupplier = new Map<string, { name: string; count: number; amount: number }>();
    completed.forEach((r: any) => {
      const key = r.supplier_id;
      const prev = bySupplier.get(key) || { name: r.suppliers?.name || "অজানা", count: 0, amount: 0 };
      prev.count += 1;
      prev.amount += Number(r.refund_amount || 0);
      bySupplier.set(key, prev);
    });
    return {
      total: supplierReturns?.length || 0,
      pending: supplierReturns?.filter((r: any) => r.status === "pending").length || 0,
      completed: completed.length,
      rejected: supplierReturns?.filter((r: any) => r.status === "rejected").length || 0,
      amount: completed.reduce((s: number, r: any) => s + Number(r.refund_amount || 0), 0),
      bySupplier: Array.from(bySupplier.values()).sort((a, b) => b.amount - a.amount).slice(0, 5),
    };
  }, [supplierReturns]);

  const printReceipt = (ret: any) => {
    const items = ret.supplier_return_items || [];
    const html = `
      <html><head><title>${ret.return_number}</title><style>
      body{font-family:Arial,sans-serif;width:80mm;padding:8px;color:#111}h2,h3{text-align:center;margin:4px 0}.row{display:flex;justify-content:space-between;border-bottom:1px dashed #999;padding:4px 0}.small{font-size:12px}.center{text-align:center}.mt{margin-top:10px}
      </style></head><body>
      <h2>BIG BOSS MOBILE SHOP</h2><h3>সাপ্লায়ার রিটার্ন মেমো</h3>
      <div class="small center">${ret.return_number} | ${format(new Date(ret.created_at), "dd MMM yyyy, hh:mm a", { locale: bn })}</div>
      <div class="row"><span>সাপ্লায়ার</span><b>${ret.suppliers?.name || "অজানা"}</b></div>
      <div class="row"><span>PO</span><b>${ret.purchases?.purchase_number || "N/A"}</b></div>
      ${items.map((it: any) => `<div class="row"><span>${it.products?.name || "পণ্য"}<br/><small>${it.products?.imei || ""}</small></span><b>${it.quantity} × ৳${Number(it.unit_cost).toLocaleString("bn-BD")}</b></div>`).join("")}
      <div class="row"><span>কারণ</span><b>${REASON_LABELS[ret.reason_code] || ret.reason_code}</b></div>
      <div class="row"><span>পদ্ধতি</span><b>${METHOD_LABELS[ret.return_method]}</b></div>
      <div class="row"><span>স্টক</span><b>${ret.stock_action === "deduct_stock" ? "স্টক কমানো" : "স্টক অপরিবর্তিত"}</b></div>
      <div class="row"><span>মোট</span><b>৳${Number(ret.refund_amount).toLocaleString("bn-BD")}</b></div>
      <div class="row"><span>স্ট্যাটাস</span><b>${STATUS_LABELS[ret.status]}</b></div>
      <div class="small mt">তৈরি: ${ret.processed_by_profile?.full_name || ret.processed_by_profile?.email || "সিস্টেম"}</div>
      <div class="small">অনুমোদন: ${ret.approved_by_profile?.full_name || ret.approved_by_profile?.email || "-"}</div>
      <p class="center small mt">ধন্যবাদ</p><script>window.print();window.close();</script></body></html>`;
    const win = window.open("", "_blank", "width=380,height=650");
    if (win) {
      win.document.write(html);
      win.document.close();
    }
  };

  const statusBadge = (status: string) => {
    const cls = status === "completed" ? "bg-green-100 text-green-700" : status === "rejected" ? "bg-red-100 text-red-700" : "bg-yellow-100 text-yellow-700";
    const Icon = status === "completed" ? CheckCircle : status === "rejected" ? XCircle : Clock;
    return <Badge className={`${cls} gap-1`}><Icon className="h-3 w-3" />{STATUS_LABELS[status] || status}</Badge>;
  };

  if (isLoading) return <div className="p-8 text-center text-muted-foreground">লোড হচ্ছে...</div>;

  return (
    <div className="flex flex-col h-screen animate-fade-in">
      <div className="sticky top-0 z-10 bg-white dark:bg-gray-950 border-b border-border pb-4 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2"><Truck className="h-7 w-7 text-primary" />সাপ্লায়ার রিটার্ন</h1>
            <p className="text-sm text-muted-foreground">ক্রয় ফেরত, সাপ্লায়ার রিফান্ড, স্টক ও অডিট একসাথে</p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild><Button className="bg-gradient-to-r from-primary to-accent gap-2"><RefreshCcw className="h-4 w-4" />নতুন সাপ্লায়ার রিটার্ন</Button></DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" onPointerDownOutside={(e) => e.preventDefault()}>
              <DialogHeader><DialogTitle>সাপ্লায়ার রিটার্ন তৈরি করুন</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div><Label className="mb-2 block">সাপ্লায়ার</Label><Select value={selectedSupplierId} onValueChange={(v) => { setSelectedSupplierId(v); setSelectedPurchaseId("all"); setSelectedItemId(""); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">সব সাপ্লায়ার</SelectItem>{suppliers?.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent></Select></div>
                  <div><Label className="mb-2 block">ক্রয় অর্ডার</Label><Select value={selectedPurchaseId} onValueChange={(v) => { setSelectedPurchaseId(v); setSelectedItemId(""); }}><SelectTrigger><SelectValue placeholder="PO নির্বাচন" /></SelectTrigger><SelectContent><SelectItem value="all">PO নির্বাচন করুন</SelectItem>{purchases?.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.purchase_number} — {p.suppliers?.name}</SelectItem>)}</SelectContent></Select></div>
                </div>

                {selectedPurchase && <Card className="p-3 bg-muted/40"><div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm"><div><p className="text-muted-foreground">মোট</p><b>৳{Number(selectedPurchase.total_amount).toLocaleString("bn-BD")}</b></div><div><p className="text-muted-foreground">পরিশোধ</p><b>৳{Number(selectedPurchase.paid_amount || 0).toLocaleString("bn-BD")}</b></div><div><p className="text-muted-foreground">বাকি</p><b>৳{Number(selectedPurchase.due_amount || 0).toLocaleString("bn-BD")}</b></div><div><p className="text-muted-foreground">তারিখ</p><b>{format(new Date(selectedPurchase.created_at), "dd MMM yyyy", { locale: bn })}</b></div></div></Card>}

                <div><Label className="mb-2 block">রিটার্ন আইটেম</Label><Select value={selectedItemId} onValueChange={(v) => { setSelectedItemId(v); setQuantity(1); }} disabled={!selectedPurchase}><SelectTrigger><SelectValue placeholder="আইটেম নির্বাচন" /></SelectTrigger><SelectContent>{selectedPurchase?.purchase_items?.map((it: any) => <SelectItem key={it.id} value={it.id}>{it.products?.name} {it.products?.imei ? `(${it.products.imei})` : ""} — Qty {it.received_quantity || it.quantity}</SelectItem>)}</SelectContent></Select></div>

                {selectedItem && <>
                  <div className="grid grid-cols-2 gap-3"><div><Label className="mb-2 block">পরিমাণ</Label><Input type="number" min={1} max={selectedItem.received_quantity || selectedItem.quantity} value={quantity} onChange={(e) => setQuantity(Number(e.target.value) || 1)} /></div><div><Label className="mb-2 block">রিটার্ন মূল্য</Label><Input value={`৳${refundAmount.toLocaleString("bn-BD")}`} readOnly /></div></div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3"><div><Label className="mb-2 block">কারণ</Label><Select value={reasonCode} onValueChange={setReasonCode}>{<SelectTrigger><SelectValue /></SelectTrigger>}<SelectContent>{Object.entries(REASON_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select></div><div><Label className="mb-2 block">রিটার্ন পদ্ধতি</Label><Select value={returnMethod} onValueChange={(v) => setReturnMethod(v as ReturnMethod)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="due_adjust">📒 বাকি সমন্বয়</SelectItem><SelectItem value="cash_refund">💵 সাপ্লায়ার নগদ ফেরত</SelectItem><SelectItem value="replacement">🔄 রিপ্লেসমেন্ট</SelectItem></SelectContent></Select></div></div>
                  <Card className="p-4 bg-muted/30"><div className="flex items-center justify-between gap-3"><div><Label className="font-semibold">স্টক থেকে কমানো হবে</Label><p className="text-xs text-muted-foreground">অফ করলে শুধু অডিট/ফাইন্যান্স থাকবে, স্টক অপরিবর্তিত থাকবে</p></div><Switch checked={stockAction === "deduct_stock"} onCheckedChange={(v) => setStockAction(v ? "deduct_stock" : "no_stock_change")} /></div></Card>
                  {returnMethod === "replacement" && <div><Label className="mb-2 block">রিপ্লেসমেন্ট নোট</Label><Textarea value={replacementNote} onChange={(e) => setReplacementNote(e.target.value)} placeholder="কবে/কোন পণ্য বদলি আসবে..." /></div>}
                  <div><Label className="mb-2 block">ত্রুটির ছবি/প্রমাণ</Label><ReturnPhotoUpload currentUrl={defectPhotoUrl} onChange={setDefectPhotoUrl} /></div>
                  <div><Label className="mb-2 block">বিস্তারিত মন্তব্য</Label><Textarea value={reasonNotes} onChange={(e) => setReasonNotes(e.target.value)} placeholder="সাপ্লায়ারের সাথে কথা, শর্ত, সমস্যা ইত্যাদি" /></div>
                  <Card className="p-3 border-primary/20"><div className="flex justify-between text-sm"><span>ফাইন্যান্স ইমপ্যাক্ট</span><b>{financeAction === "supplier_refund" ? "ক্যাশ রিফান্ড লেজার" : financeAction === "due_adjust" ? "PO টোটাল/বাকি কমবে" : "ফাইন্যান্স অপরিবর্তিত"}</b></div><div className="flex justify-between text-lg mt-2"><span>মোট রিটার্ন</span><b className="text-primary">৳{refundAmount.toLocaleString("bn-BD")}</b></div></Card>
                </>}

                <div className="flex justify-end gap-2"><Button variant="outline" onClick={resetForm}>বাতিল</Button><Button onClick={() => createReturnMutation.mutate()} disabled={createReturnMutation.isPending}>সংরক্ষণ করুন</Button></div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          <Card className="p-3"><p className="text-xs text-muted-foreground">মোট রিটার্ন</p><p className="text-xl font-bold">{analytics.total}</p></Card>
          <Card className="p-3"><p className="text-xs text-muted-foreground">অপেক্ষমাণ</p><p className="text-xl font-bold text-yellow-600">{analytics.pending}</p></Card>
          <Card className="p-3"><p className="text-xs text-muted-foreground">সম্পন্ন</p><p className="text-xl font-bold text-green-600">{analytics.completed}</p></Card>
          <Card className="p-3"><p className="text-xs text-muted-foreground">প্রত্যাখ্যাত</p><p className="text-xl font-bold text-red-600">{analytics.rejected}</p></Card>
          <Card className="p-3"><p className="text-xs text-muted-foreground">রিফান্ড/সমন্বয়</p><p className="text-xl font-bold text-primary">৳{analytics.amount.toLocaleString("bn-BD")}</p></Card>
        </div>
      </div>

      <Tabs defaultValue="returns" className="flex-1 overflow-y-auto pt-4">
        <TabsList className="grid w-full grid-cols-2"><TabsTrigger value="returns">রিটার্ন তালিকা</TabsTrigger><TabsTrigger value="analytics">এনালিটিক্স</TabsTrigger></TabsList>
        <TabsContent value="returns" className="space-y-3 pb-6">
          <div className="flex gap-2"><div className="relative flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input className="pl-9" placeholder="রিটার্ন নম্বর, সাপ্লায়ার, PO খুঁজুন..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} /></div><Select value={filterStatus} onValueChange={setFilterStatus}><SelectTrigger className="w-36"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">সব</SelectItem><SelectItem value="pending">অপেক্ষমাণ</SelectItem><SelectItem value="completed">সম্পন্ন</SelectItem><SelectItem value="rejected">প্রত্যাখ্যাত</SelectItem></SelectContent></Select></div>

          {filteredReturns.map((ret: any) => (
            <Card key={ret.id} className="p-4 space-y-3">
              <div className="flex items-start justify-between gap-3 flex-wrap"><div className="flex items-start gap-3">{ret.suppliers?.image_url && <ZoomableImage url={ret.suppliers.image_url} alt={ret.suppliers.name} displayWidth={56} displayHeight={72} />}<div><div className="flex items-center gap-2 flex-wrap"><h3 className="font-semibold">{ret.return_number}</h3>{statusBadge(ret.status)}</div><p className="text-sm text-muted-foreground">{ret.suppliers?.name || "অজানা"} • PO #{ret.purchases?.purchase_number || "N/A"}</p><p className="text-xs text-muted-foreground">{format(new Date(ret.created_at), "dd MMM yyyy, hh:mm a", { locale: bn })}</p></div></div><div className="text-right"><p className="text-xl font-bold text-primary">৳{Number(ret.refund_amount).toLocaleString("bn-BD")}</p><p className="text-xs text-muted-foreground">{METHOD_LABELS[ret.return_method]}</p></div></div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm">{ret.supplier_return_items?.map((it: any) => <div key={it.id} className="p-2 rounded bg-muted"><b>{it.products?.name || "পণ্য"}</b><p className="text-xs text-muted-foreground">IMEI: {it.products?.imei || "N/A"}</p><p>Qty {it.quantity} × ৳{Number(it.unit_cost).toLocaleString("bn-BD")}</p></div>)}<div className="p-2 rounded bg-muted"><b>কারণ</b><p>{REASON_LABELS[ret.reason_code] || ret.reason_code}</p>{ret.reason_notes && <p className="text-xs text-muted-foreground">{ret.reason_notes}</p>}</div><div className="p-2 rounded bg-muted"><b>স্টক/ফাইন্যান্স</b><p>{ret.stock_action === "deduct_stock" ? "স্টক কমেছে" : "স্টক অপরিবর্তিত"}</p><p className="text-xs text-muted-foreground">{ret.finance_action === "supplier_refund" ? "ক্যাশ রিফান্ড" : ret.finance_action === "due_adjust" ? "বাকি সমন্বয়" : "ফাইন্যান্স নেই"}</p></div></div>

              {ret.defect_photo_url && <div><p className="text-xs text-muted-foreground mb-1">প্রমাণ ছবি</p><ZoomableImage url={ret.defect_photo_url} alt="সাপ্লায়ার রিটার্ন প্রমাণ" displayWidth={96} displayHeight={96} /></div>}

              <div className="border-l-2 border-primary/30 pl-3 space-y-2 text-xs"><div><b>তৈরি:</b> {ret.processed_by_profile?.full_name || ret.processed_by_profile?.email || "সিস্টেম"} • {format(new Date(ret.created_at), "dd MMM yyyy, hh:mm a", { locale: bn })}</div><div><b>{ret.status === "rejected" ? "প্রত্যাখ্যান" : ret.status === "completed" ? "অনুমোদন" : "স্ট্যাটাস"}:</b> {ret.status === "pending" ? "অনুমোদনের অপেক্ষায়" : `${ret.approved_by_profile?.full_name || ret.approved_by_profile?.email || "সিস্টেম"} • ${ret.approved_at ? format(new Date(ret.approved_at), "dd MMM yyyy, hh:mm a", { locale: bn }) : ""}`}</div>{ret.rejected_reason && <div className="text-destructive"><b>কারণ:</b> {ret.rejected_reason}</div>}</div>

              <div className="flex gap-2 justify-end flex-wrap">{ret.status === "completed" && <Button size="sm" variant="outline" onClick={() => printReceipt(ret)}><Printer className="h-4 w-4 mr-1" />রসিদ পুনঃপ্রিন্ট</Button>}{ret.status === "pending" && canApprove && <><Button size="sm" onClick={() => approveMutation.mutate(ret)}><CheckCircle className="h-4 w-4 mr-1" />অনুমোদন</Button><Button size="sm" variant="destructive" onClick={() => setRejectingId(ret.id)}><XCircle className="h-4 w-4 mr-1" />প্রত্যাখ্যান</Button></>}</div>
            </Card>
          ))}
          {filteredReturns.length === 0 && <Card className="p-12 text-center"><Package className="h-12 w-12 mx-auto text-muted-foreground mb-3" /><h3 className="font-semibold">কোনো সাপ্লায়ার রিটার্ন নেই</h3><p className="text-sm text-muted-foreground">নতুন রিটার্ন তৈরি করুন</p></Card>}
        </TabsContent>
        <TabsContent value="analytics" className="space-y-3 pb-6"><Card className="p-4"><h3 className="font-semibold flex items-center gap-2 mb-3"><BarChart3 className="h-5 w-5 text-primary" />সাপ্লায়ার ভিত্তিক রিটার্ন</h3><div className="space-y-2">{analytics.bySupplier.map((s) => <div key={s.name} className="flex items-center justify-between p-2 rounded bg-muted"><span>{s.name}</span><span className="font-semibold">{s.count} বার • ৳{s.amount.toLocaleString("bn-BD")}</span></div>)}{analytics.bySupplier.length === 0 && <p className="text-sm text-muted-foreground">এখনো সম্পন্ন রিটার্ন নেই</p>}</div></Card><Card className="p-4"><h3 className="font-semibold flex items-center gap-2 mb-2"><FileText className="h-5 w-5 text-primary" />অডিট সংযোগ</h3><p className="text-sm text-muted-foreground">প্রতিটি তৈরি, অনুমোদন ও প্রত্যাখ্যান Activity Logs-এ সাপ্লায়ার অ্যাকশন হিসেবে সংরক্ষিত হচ্ছে।</p></Card></TabsContent>
      </Tabs>

      <Dialog open={!!rejectingId} onOpenChange={(open) => { if (!open) setRejectingId(null); }}><DialogContent><DialogHeader><DialogTitle>রিটার্ন প্রত্যাখ্যান</DialogTitle></DialogHeader><div className="space-y-3"><Label>প্রত্যাখ্যানের কারণ</Label><Textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} /><div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setRejectingId(null)}>বাতিল</Button><Button variant="destructive" onClick={() => { const ret = supplierReturns?.find((r: any) => r.id === rejectingId); if (!rejectReason.trim()) return toast.error("কারণ লিখুন"); if (ret) rejectMutation.mutate({ ret, reason: rejectReason }); }}>প্রত্যাখ্যান করুন</Button></div></div></DialogContent></Dialog>
    </div>
  );
}
