import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { format } from "date-fns";
import { bn } from "date-fns/locale";
import {
  RotateCcw, Search, Package, Calendar, CheckCircle, XCircle, Clock,
  BarChart3, FileText, Printer, Image as ImageIcon, MessageSquare, History, Banknote,
} from "lucide-react";
import { ActivityLogger } from "@/hooks/useActivityLog";
import { useUserRole } from "@/hooks/useUserRole";
import { ReturnAnalytics } from "./ReturnAnalytics";
import { ReturnReceipt } from "./returns/ReturnReceipt";
import { ReturnPhotoUpload } from "./returns/ReturnPhotoUpload";
import { ZoomableImage } from "@/components/ui/zoomable-image";
import { queueIfOffline } from "@/utils/offlineQueue";

const db = supabase as any;

const REASON_LABELS: Record<string, string> = {
  defective: "ত্রুটিপূর্ণ পণ্য",
  wrong_item: "ভুল পণ্য",
  customer_request: "ক্রেতার অনুরোধ",
  damaged: "ক্ষতিগ্রস্ত",
  not_as_described: "বিবরণ অনুযায়ী নয়",
  other: "অন্যান্য",
};

const METHOD_LABELS: Record<string, string> = {
  cash: "নগদ ফেরত",
  due_adjust: "বাকি সমন্বয়",
  exchange: "পণ্য বিনিময়",
};

type RefundMethod = "cash" | "due_adjust" | "exchange";

export function Returns() {
  const { isAdmin, isManager, userId } = useUserRole();
  const canApprove = isAdmin || isManager;

  // ─── Form state ──────────────────────────────────────────────
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [searchSaleId, setSearchSaleId] = useState("");
  const [selectedSale, setSelectedSale] = useState<any>(null);
  const [saleSearchResults, setSaleSearchResults] = useState<any[]>([]);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [returnQuantity, setReturnQuantity] = useState(1);
  const [reasonCode, setReasonCode] = useState("defective");
  const [reasonNotes, setReasonNotes] = useState("");
  const [isAuditOnly, setIsAuditOnly] = useState(false);
  const [refundMethod, setRefundMethod] = useState<RefundMethod>("cash");
  const [defectPhotoUrl, setDefectPhotoUrl] = useState<string | null>(null);

  // Exchange-specific state
  const [exchangeProductId, setExchangeProductId] = useState<string>("");
  const [exchangeQty, setExchangeQty] = useState<number>(1);
  const [exchangeUnitPrice, setExchangeUnitPrice] = useState<number>(0);

  // Reject dialog
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  // Filters & view
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [receiptRecord, setReceiptRecord] = useState<any>(null);
  const [expandedHistoryItemId, setExpandedHistoryItemId] = useState<string | null>(null);

  const queryClient = useQueryClient();

  // ─── Queries ─────────────────────────────────────────────────
  const { data: returns, isLoading } = useQuery({
    queryKey: ["returns"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("returns")
        .select(`
          *,
          sales (id, total_amount, created_at, customer_id, instant_customer_name, instant_customer_phone, customers (name, phone)),
          sale_items (quantity, unit_price, total_price),
          products (name, imei, brand, model, condition, supplier_name)
        `)
        .order("created_at", { ascending: false });
      if (error) throw error;
      // Hydrate processor/approver names from profiles (separate query — no FK)
      const ids = Array.from(new Set(
        (data || []).flatMap((r: any) => [r.processed_by, r.approved_by]).filter(Boolean),
      ));
      let profileMap: Record<string, { full_name: string | null; email: string | null }> = {};
      if (ids.length) {
        const { data: profs } = await supabase
          .from("profiles").select("id, full_name, email").in("id", ids);
        profileMap = Object.fromEntries((profs || []).map(p => [p.id, { full_name: p.full_name, email: p.email }]));
      }
      return (data || []).map((r: any) => ({
        ...r,
        processed_by_profile: r.processed_by ? profileMap[r.processed_by] : null,
        approved_by_profile: r.approved_by ? profileMap[r.approved_by] : null,
      }));
    },
  });

  const { data: stockProducts } = useQuery({
    queryKey: ["return-exchange-products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, brand, model, imei, price, stock_quantity")
        .gt("stock_quantity", 0)
        .order("name");
      if (error) throw error;
      return data || [];
    },
    enabled: refundMethod === "exchange",
  });

  // ─── Helpers ─────────────────────────────────────────────────
  const sendCustomerSms = async (phone: string | null | undefined, body: string) => {
    if (!phone) return;
    try {
      await supabase.functions.invoke("send-return-sms", { body: { to: phone, body } });
    } catch (e) {
      // Non-blocking — SMS may not be configured yet.
      console.warn("SMS skipped:", e);
    }
  };

  // ─── Search ──────────────────────────────────────────────────
  const hydrateSaleForReturn = async (saleId: string) => {
    const { data, error } = await supabase
      .from("sales")
      .select(`*, customers (name, phone),
        sale_items (*, products (name, imei, sku, barcode, brand, model, condition))`)
      .eq("id", saleId)
      .single();
    if (error || !data) throw new Error("বিক্রয় পাওয়া যায়নি");
    if (!data.sale_items?.length) throw new Error("এই বিক্রয়ের কোনো আইটেম পাওয়া যায়নি");

    const { data: existingReturns } = await supabase
      .from("returns")
      .select("id, return_number, sale_item_id, quantity, status, refund_amount, refund_method, reason_code, created_at, approved_at")
      .eq("sale_id", data.id)
      .in("status", ["pending", "completed"]);
    const returnedByItem = new Map<string, number>();
    const historyByItem = new Map<string, any[]>();
    (existingReturns || []).forEach((r: any) => returnedByItem.set(r.sale_item_id, (returnedByItem.get(r.sale_item_id) || 0) + Number(r.quantity || 0)));
    (existingReturns || []).forEach((r: any) => historyByItem.set(r.sale_item_id, [...(historyByItem.get(r.sale_item_id) || []), r]));

    return {
      ...data,
      sale_items: (data.sale_items || []).map((it: any) => ({
        ...it,
        already_returned_quantity: returnedByItem.get(it.id) || 0,
        returnable_quantity: Math.max(0, Number(it.quantity || 0) - (returnedByItem.get(it.id) || 0)),
        return_history: historyByItem.get(it.id) || [],
      })),
    };
  };

  const selectSaleForReturn = async (saleId: string) => {
    try {
      const saleWithAvailability = await hydrateSaleForReturn(saleId);
      setSelectedSale(saleWithAvailability);
      setSaleSearchResults([]);
      setSelectedItem(null);
      setExpandedHistoryItemId(null);
      toast.success(`বিক্রয় পাওয়া গেছে: #${saleWithAvailability.id.slice(0, 8)}`);
    } catch (error: any) {
      toast.error(error.message || "বিক্রয় লোড করতে সমস্যা হয়েছে");
    }
  };

  const searchSale = async () => {
    if (!searchSaleId.trim()) {
      toast.error("বিক্রয় আইডি, ইনভয়েস নম্বর, IMEI, বারকোড বা ক্রেতার মোবাইল লিখুন"); return;
    }
    const term = searchSaleId.trim().replace(/^#/, "");
    let saleIds: string[] = [];
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(term)) {
      const { data: matches, error: searchError } = await db.rpc("search_sale_ids_for_return", { _search: term, _limit: 12 });
      if (searchError) { toast.error(searchError.message || "বিক্রয় খুঁজতে সমস্যা হয়েছে"); return; }
      if (!matches?.length) { toast.error("বিক্রয় পাওয়া যায়নি"); return; }
      saleIds = matches.map((m: any) => m.id);
    } else {
      saleIds = [term];
    }

    const { data: resultRows, error: resultError } = await supabase
      .from("sales")
      .select(`*, customers (name, phone), sale_items (*, products (name, imei, sku, barcode, brand, model, condition))`)
      .in("id", saleIds);
    if (resultError || !resultRows?.length) { toast.error("বিক্রয় পাওয়া যায়নি"); return; }
    const orderedRows = saleIds.map((id) => resultRows.find((s: any) => s.id === id)).filter(Boolean);
    if (orderedRows.length === 1) {
      await selectSaleForReturn(orderedRows[0].id);
      return;
    }
    setSaleSearchResults(orderedRows);
    toast.info("একাধিক মিল পাওয়া গেছে — সঠিক বিক্রয়টি নির্বাচন করুন");
  };

  // ─── Create return ──────────────────────────────────────────
  const createReturnMutation = useMutation({
    mutationFn: async () => {
      if (!selectedItem || !selectedSale) throw new Error("আইটেম নির্বাচন করুন");
      const refundAmount = Number(selectedItem.unit_price) * returnQuantity;
      const exchangeValue = refundMethod === "exchange" ? exchangeUnitPrice * exchangeQty : 0;

      const autoApprove = isAdmin && !isAuditOnly;

      const returnPayload = {
        sale_id: selectedSale.id,
        sale_item_id: selectedItem.id,
        product_id: selectedItem.product_id,
        quantity: returnQuantity,
        refund_amount: refundAmount,
        reason_code: reasonCode,
        reason_notes: reasonNotes || null,
        is_audit_only: isAuditOnly,
        customer_id: selectedSale.customer_id,
        status: isAuditOnly ? "completed" : "pending",
        processed_by: userId,
        approved_by: isAuditOnly ? userId : null,
        approved_at: isAuditOnly ? new Date().toISOString() : null,
        refund_method: refundMethod,
        defect_photo_url: defectPhotoUrl,
        exchange_product_id: refundMethod === "exchange" ? exchangeProductId || null : null,
        exchange_quantity: refundMethod === "exchange" ? exchangeQty : 0,
        exchange_unit_price: refundMethod === "exchange" ? exchangeUnitPrice : 0,
      };

      let returnRow: any;
      try {
        const { data, error: retErr } = await supabase
        .from("returns")
        .insert([returnPayload])
        .select("*, products(name)")
        .single();
        if (retErr) throw retErr;
        returnRow = data;
      } catch (error) {
        queueIfOffline("sales_return_create", { ...returnPayload, autoApprove, actorId: userId }, error);
        return { ...returnPayload, id: `offline-${Date.now()}`, status: "pending" };
      }

      if (!autoApprove || isAuditOnly) {
        await ActivityLogger.returnCreated(
          selectedItem.products?.name || "পণ্য",
          returnQuantity, refundAmount, isAuditOnly,
          REASON_LABELS[reasonCode] || reasonCode, returnRow.id,
        );
        return returnRow;
      }

      const { data: processedReturn, error: processError } = await db.rpc("process_sales_return", {
        _return_id: returnRow.id,
        _action: "approve",
        _actor_id: userId,
        _reject_reason: null,
      });
      if (processError) throw processError;

      await ActivityLogger.returnCreated(
        selectedItem.products?.name || "পণ্য",
        returnQuantity, refundAmount, false,
        REASON_LABELS[reasonCode] || reasonCode, returnRow.id,
      );

      // SMS notification (graceful no-op if Twilio not configured)
      const phone = selectedSale.customers?.phone || selectedSale.instant_customer_phone;
      await sendCustomerSms(phone,
        `প্রিয় গ্রাহক, আপনার রিটার্ন (${returnRow.return_number}) সম্পন্ন হয়েছে। ` +
        `${METHOD_LABELS[refundMethod]}: ৳${refundAmount.toLocaleString("bn-BD")}। ধন্যবাদ — ${"" }`);

      return processedReturn || returnRow;
    },
    onSuccess: (row: any) => {
      queryClient.invalidateQueries({ queryKey: ["returns"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      queryClient.invalidateQueries({ queryKey: ["customer-sales"] });
      queryClient.invalidateQueries({ queryKey: ["customer-payments"] });
      toast.success(
        isAuditOnly ? "রিটার্ন নোট সংরক্ষিত!" :
        (isAdmin ? "রিটার্ন সফলভাবে সম্পন্ন হয়েছে!" : "রিটার্ন তৈরি হয়েছে — অনুমোদনের অপেক্ষায়"),
      );
      // Auto-show receipt for completed (non-audit) returns
      if (row?.status === "completed" && !row.is_audit_only) {
        setReceiptRecord({ ...row, status: "completed", sales: selectedSale, products: { name: selectedItem.products?.name, imei: selectedItem.products?.imei, brand: selectedItem.products?.brand } });
      }
      resetForm();
    },
    onError: (err: any) => toast.error(err.message || "রিটার্ন তৈরি করতে ব্যর্থ"),
  });

  // ─── Approve / reject pending ───────────────────────────────
  const approveReturnMutation = useMutation({
    mutationFn: async (returnId: string) => {
      const { data: ret } = await supabase
        .from("returns").select("*, products(name), sales(customer_id, customers(phone), instant_customer_phone)").eq("id", returnId).single();
      if (!ret) throw new Error("রিটার্ন পাওয়া যায়নি");

      try {
        const { error } = await db.rpc("process_sales_return", { _return_id: returnId, _action: "approve", _actor_id: userId, _reject_reason: null });
        if (error) throw error;
      } catch (error) {
        queueIfOffline("sales_return_process", { returnId, action: "approve", actorId: userId }, error);
      }
      await ActivityLogger.returnProcessed(returnId, "completed", ret.products?.name || "পণ্য", Number(ret.refund_amount));
      const phone = ret.sales?.customers?.phone || ret.sales?.instant_customer_phone;
      await sendCustomerSms(phone,
        `আপনার রিটার্ন (${ret.return_number}) অনুমোদিত হয়েছে। ` +
        `${METHOD_LABELS[ret.refund_method]}: ৳${Number(ret.refund_amount).toLocaleString("bn-BD")}।`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["returns"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      queryClient.invalidateQueries({ queryKey: ["customer-sales"] });
      queryClient.invalidateQueries({ queryKey: ["customer-payments"] });
      toast.success("রিটার্ন অনুমোদিত");
    },
    onError: (e: any) => toast.error(e.message || "অনুমোদন ব্যর্থ"),
  });

  const rejectReturnMutation = useMutation({
    mutationFn: async ({ returnId, reason }: { returnId: string; reason: string }) => {
      const { data: ret } = await supabase
        .from("returns").select("*, products(name), sales(customers(phone), instant_customer_phone)").eq("id", returnId).single();
      try {
        const { error } = await db.rpc("process_sales_return", { _return_id: returnId, _action: "reject", _actor_id: userId, _reject_reason: reason });
        if (error) throw error;
      } catch (error) {
        queueIfOffline("sales_return_process", { returnId, action: "reject", actorId: userId, reason }, error);
      }
      await ActivityLogger.returnProcessed(returnId, "rejected", ret?.products?.name || "পণ্য", Number(ret?.refund_amount || 0));
      const phone = ret?.sales?.customers?.phone || ret?.sales?.instant_customer_phone;
      await sendCustomerSms(phone,
        `দুঃখিত, আপনার রিটার্ন (${ret?.return_number}) প্রত্যাখ্যাত হয়েছে। কারণ: ${reason}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["returns"] });
      toast.success("রিটার্ন প্রত্যাখ্যাত");
      setRejectingId(null); setRejectReason("");
    },
    onError: (e: any) => toast.error(e.message || "প্রত্যাখ্যান ব্যর্থ"),
  });

  // ─── UI helpers ─────────────────────────────────────────────
  const resetForm = () => {
    setSearchSaleId(""); setSelectedSale(null); setSelectedItem(null);
    setSaleSearchResults([]);
    setReturnQuantity(1); setReasonCode("defective"); setReasonNotes("");
    setIsAuditOnly(false); setRefundMethod("cash"); setDefectPhotoUrl(null);
    setExchangeProductId(""); setExchangeQty(1); setExchangeUnitPrice(0);
    setIsAddDialogOpen(false);
  };

  const handleSubmit = () => {
    if (!selectedItem) { toast.error("আইটেম নির্বাচন করুন"); return; }
    const maxQty = Number(selectedItem.returnable_quantity ?? selectedItem.quantity);
    if (returnQuantity < 1 || returnQuantity > maxQty) {
      toast.error(`পরিমাণ ১ থেকে ${maxQty}`); return;
    }
    if (refundMethod === "exchange") {
      if (!exchangeProductId) { toast.error("বিনিময়ের জন্য পণ্য নির্বাচন করুন"); return; }
      if (exchangeQty < 1 || exchangeUnitPrice <= 0) { toast.error("বিনিময় পরিমাণ ও মূল্য সঠিক দিন"); return; }
    }
    createReturnMutation.mutate();
  };

  const getStatusBadge = (status: string) => {
    const map: Record<string, { cls: string; icon: any; label: string }> = {
      pending: { cls: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400", icon: Clock, label: "অপেক্ষমাণ" },
      completed: { cls: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400", icon: CheckCircle, label: "সম্পন্ন" },
      rejected: { cls: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400", icon: XCircle, label: "প্রত্যাখ্যাত" },
    };
    const m = map[status] || { cls: "", icon: Clock, label: status };
    const Icon = m.icon;
    return <Badge className={`${m.cls} gap-1`}><Icon className="h-3 w-3" />{m.label}</Badge>;
  };

  const filteredReturns = returns?.filter(r => filterStatus === "all" || r.status === filterStatus) || [];
  const pendingCount = returns?.filter(r => r.status === "pending").length || 0;
  const completedCount = returns?.filter(r => r.status === "completed").length || 0;
  const auditOnlyCount = returns?.filter(r => r.is_audit_only).length || 0;
  const totalRefund = returns?.filter(r => r.status === "completed" && !r.is_audit_only)
    .reduce((s, r) => s + Number(r.refund_amount), 0) || 0;

  if (isLoading) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground">লোড হচ্ছে...</div>;
  }

  const refundTotal = selectedItem ? selectedItem.unit_price * returnQuantity : 0;
  const exchangeValue = refundMethod === "exchange" ? exchangeUnitPrice * exchangeQty : 0;
  const netRefund = Math.max(0, refundTotal - exchangeValue);

  return (
    <div className="flex flex-col h-screen animate-fade-in">
      <Tabs defaultValue="list" className="flex-1 flex flex-col">
        <div className="sticky top-0 z-10 bg-white dark:bg-gray-950 border-b border-border pb-4 space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
                <RotateCcw className="h-7 w-7 text-primary" />রিটার্ন ও রিফান্ড
              </h1>
              <p className="text-sm text-muted-foreground">পূর্ণ অনুমোদন-চালিত রিটার্ন ব্যবস্থাপনা</p>
            </div>
            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
              <DialogTrigger asChild>
                <Button className="bg-gradient-to-r from-primary to-accent gap-2">
                  <RotateCcw className="h-4 w-4" />নতুন রিটার্ন
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>রিটার্ন তৈরি করুন</DialogTitle>
                  <DialogDescription>বিক্রয় আইডি দিয়ে আইটেম খুঁজে রিটার্ন, রিফান্ড, এক্সচেঞ্জ বা অডিট নোট তৈরি করুন।</DialogDescription>
                </DialogHeader>
                {!selectedSale ? (
                  <div className="space-y-4 py-4">
                    <Label className="block">বিক্রয়/ইনভয়েস/IMEI/বারকোড/ক্রেতা দিয়ে খুঁজুন</Label>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input value={searchSaleId} onChange={(e) => setSearchSaleId(e.target.value)}
                          placeholder="Invoice #, Sale ID, IMEI, barcode, mobile..." className="pl-9"
                          onKeyDown={(e) => e.key === "Enter" && searchSale()} />
                      </div>
                      <Button onClick={searchSale}><Search className="h-4 w-4 mr-1" />খুঁজুন</Button>
                    </div>
                    {saleSearchResults.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-sm font-medium">মিল পাওয়া বিক্রয়</p>
                        {saleSearchResults.map((sale: any) => (
                          <Card key={sale.id} className="p-3 bg-muted/30">
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                              <div className="min-w-0 text-sm">
                                <p className="font-semibold">Invoice #{sale.id.slice(0, 8)} • {format(new Date(sale.created_at), "dd MMM yyyy", { locale: bn })}</p>
                                <p className="text-muted-foreground break-words">{sale.customers?.name || sale.instant_customer_name || "সাধারণ ক্রেতা"} {sale.customers?.phone || sale.instant_customer_phone ? `• ${sale.customers?.phone || sale.instant_customer_phone}` : ""}</p>
                                <p className="text-xs text-muted-foreground break-all">{sale.sale_items?.map((it: any) => `${it.products?.name || "পণ্য"}${it.products?.imei ? ` (${it.products.imei})` : ""}`).join(" • ")}</p>
                              </div>
                              <Button size="sm" onClick={() => selectSaleForReturn(sale.id)}>নির্বাচন</Button>
                            </div>
                          </Card>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4 py-4">
                    <Card className="p-4 bg-muted/50 border-primary/20">
                      <h3 className="font-semibold mb-3 flex items-center gap-2">
                        <Package className="h-4 w-4 text-primary" />বিক্রয় তথ্য
                      </h3>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div><p className="text-muted-foreground">ইনভয়েস</p><p className="font-mono">#{selectedSale.id.slice(0, 8)}</p></div>
                        <div><p className="text-muted-foreground">তারিখ</p><p>{format(new Date(selectedSale.created_at), "dd MMM yyyy", { locale: bn })}</p></div>
                        <div><p className="text-muted-foreground">ক্রেতা</p><p>{selectedSale.customers?.name || selectedSale.instant_customer_name || "সাধারণ"}</p></div>
                        <div><p className="text-muted-foreground">মোট</p><p className="text-primary font-semibold">৳{selectedSale.total_amount?.toLocaleString("bn-BD")}</p></div>
                      </div>
                    </Card>

                    <div>
                      <Label className="mb-2 block">আইটেম নির্বাচন করুন</Label>
                      <Select value={selectedItem?.id} onValueChange={(v) => {
                        setSelectedItem(selectedSale.sale_items.find((i: any) => i.id === v));
                        setReturnQuantity(1);
                      }}>
                        <SelectTrigger><SelectValue placeholder="আইটেম..." /></SelectTrigger>
                        <SelectContent>
                          {selectedSale.sale_items?.map((it: any) => (
                            <SelectItem key={it.id} value={it.id} disabled={it.returnable_quantity <= 0}>
                              {it.products?.name} — রিটার্নযোগ্য: {it.returnable_quantity}/{it.quantity} — ৳{it.unit_price?.toLocaleString("bn-BD")}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <div className="mt-3 grid grid-cols-1 gap-2">
                        {selectedSale.sale_items?.map((it: any) => (
                          <Card key={it.id} className="p-3 bg-muted/30">
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                              <div className="min-w-0">
                                <p className="font-semibold break-words">{it.products?.name}</p>
                                <p className="text-xs text-muted-foreground break-all">IMEI: {it.products?.imei || "N/A"} • রিটার্নযোগ্য {it.returnable_quantity}/{it.quantity}</p>
                              </div>
                              <div className="flex gap-2 flex-wrap">
                                <Button size="sm" variant="outline" disabled={it.returnable_quantity <= 0} onClick={() => { setSelectedItem(it); setRefundMethod("cash"); setReturnQuantity(1); }}>
                                  <RotateCcw className="h-4 w-4 mr-1" />রিটার্ন
                                </Button>
                                <Button size="sm" variant="outline" disabled={it.returnable_quantity <= 0} onClick={() => { setSelectedItem(it); setRefundMethod("cash"); setReturnQuantity(1); }}>
                                  <Banknote className="h-4 w-4 mr-1" />রিফান্ড
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => setExpandedHistoryItemId(expandedHistoryItemId === it.id ? null : it.id)}>
                                  <History className="h-4 w-4 mr-1" />হিস্টোরি ({it.return_history?.length || 0})
                                </Button>
                              </div>
                            </div>
                            {expandedHistoryItemId === it.id && (
                              <div className="mt-3 border-l-2 border-primary/30 pl-3 space-y-2 text-xs">
                                {it.return_history?.length ? it.return_history.map((h: any) => (
                                  <div key={h.id} className="break-words">
                                    <b>{h.return_number || h.id.slice(0, 8)}</b> • {h.status} • Qty {h.quantity} • ৳{Number(h.refund_amount || 0).toLocaleString("bn-BD")} • {format(new Date(h.created_at), "dd MMM yyyy, hh:mm a", { locale: bn })}
                                  </div>
                                )) : <div className="text-muted-foreground">এই আইটেমে কোনো রিটার্ন/রিফান্ড ইতিহাস নেই</div>}
                              </div>
                            )}
                          </Card>
                        ))}
                      </div>
                    </div>

                    {selectedItem && (
                      <>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <Label className="mb-2 block">পরিমাণ (সর্বোচ্চ {selectedItem.returnable_quantity ?? selectedItem.quantity})</Label>
                            <Input type="number" min={1} max={selectedItem.returnable_quantity ?? selectedItem.quantity}
                              value={returnQuantity}
                              onChange={(e) => setReturnQuantity(parseInt(e.target.value) || 1)} />
                          </div>
                          <div>
                            <Label className="mb-2 block">কারণ</Label>
                            <Select value={reasonCode} onValueChange={setReasonCode}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {Object.entries(REASON_LABELS).map(([k, v]) => (
                                  <SelectItem key={k} value={k}>{v}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        <div>
                          <Label className="mb-2 block">অতিরিক্ত মন্তব্য</Label>
                          <Textarea value={reasonNotes} onChange={(e) => setReasonNotes(e.target.value)} rows={2}
                            placeholder="রিটার্নের বিস্তারিত..." />
                        </div>

                        <div>
                          <Label className="mb-2 flex items-center gap-1"><ImageIcon className="h-4 w-4" />ত্রুটির ছবি (প্রমাণ)</Label>
                          <ReturnPhotoUpload currentUrl={defectPhotoUrl} onChange={setDefectPhotoUrl} />
                        </div>

                        {/* Audit-only toggle */}
                        <Card className={`p-4 ${isAuditOnly ? "bg-blue-50 dark:bg-blue-950/20 border-blue-300" : "bg-muted/30"}`}>
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <FileText className="h-4 w-4 text-blue-600" />
                                <Label htmlFor="audit-only" className="font-semibold cursor-pointer">শুধু রিটার্ন নোট (অডিট-অনলি)</Label>
                              </div>
                              <p className="text-xs text-muted-foreground mt-1">
                                {isAuditOnly
                                  ? "✓ স্টক/ফাইন্যান্স অপরিবর্তিত থাকবে — শুধু রেকর্ড"
                                  : "অফ থাকলে: স্টক, সেইলস টোটাল ও কাস্টমার লেজার আপডেট হবে"}
                              </p>
                            </div>
                            <Switch id="audit-only" checked={isAuditOnly} onCheckedChange={setIsAuditOnly} />
                          </div>
                        </Card>

                        {/* Refund method (hidden in audit-only) */}
                        {!isAuditOnly && (
                          <div>
                            <Label className="mb-2 block">রিফান্ড পদ্ধতি</Label>
                            <Select value={refundMethod} onValueChange={(v) => setRefundMethod(v as RefundMethod)}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="cash">💵 নগদ ফেরত</SelectItem>
                                <SelectItem value="due_adjust">📒 কাস্টমারের বাকি সমন্বয়</SelectItem>
                                <SelectItem value="exchange">🔄 অন্য পণ্যের সাথে বিনিময়</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        )}

                        {/* Exchange product picker */}
                        {!isAuditOnly && refundMethod === "exchange" && (
                          <Card className="p-3 bg-amber-50 dark:bg-amber-950/20 border-amber-300 space-y-3">
                            <div className="text-sm font-semibold flex items-center gap-1">🔄 বিনিময় পণ্য</div>
                            <Select value={exchangeProductId} onValueChange={(v) => {
                              setExchangeProductId(v);
                              const p = stockProducts?.find(x => x.id === v);
                              if (p) setExchangeUnitPrice(Number(p.price));
                            }}>
                              <SelectTrigger><SelectValue placeholder="পণ্য নির্বাচন..." /></SelectTrigger>
                              <SelectContent>
                                {stockProducts?.map(p => (
                                  <SelectItem key={p.id} value={p.id}>
                                    {p.name} {p.imei ? `(IMEI: ${p.imei})` : ""} — ৳{Number(p.price).toLocaleString("bn-BD")}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <Label className="text-xs">পরিমাণ</Label>
                                <Input type="number" min={1} value={exchangeQty}
                                  onChange={(e) => setExchangeQty(parseInt(e.target.value) || 1)} />
                              </div>
                              <div>
                                <Label className="text-xs">প্রতি ইউনিট মূল্য</Label>
                                <Input type="number" min={0} value={exchangeUnitPrice}
                                  onChange={(e) => setExchangeUnitPrice(parseFloat(e.target.value) || 0)} />
                              </div>
                            </div>
                          </Card>
                        )}

                        {/* Summary */}
                        <Card className="p-4 bg-primary/5 border-primary/20 space-y-1">
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">রিটার্ন মূল্য</span>
                            <span className="font-semibold">৳{refundTotal.toLocaleString("bn-BD")}</span>
                          </div>
                          {refundMethod === "exchange" && (
                            <div className="flex justify-between text-sm">
                              <span className="text-muted-foreground">বিনিময় মূল্য</span>
                              <span className="font-semibold">− ৳{exchangeValue.toLocaleString("bn-BD")}</span>
                            </div>
                          )}
                          <div className="border-t pt-1 mt-1 flex justify-between">
                            <span className="font-semibold">{isAuditOnly ? "নোট পরিমাণ" : refundMethod === "exchange" ? "নিট সমন্বয়" : "নিট রিফান্ড"}</span>
                            <span className="text-2xl font-bold text-primary">৳{(isAuditOnly ? refundTotal : netRefund).toLocaleString("bn-BD")}</span>
                          </div>
                          {!isAdmin && !isAuditOnly && (
                            <p className="text-xs text-amber-700 dark:text-amber-400 pt-1">
                              ⚠️ এই রিটার্নটি Admin/Manager-এর অনুমোদন ছাড়া কার্যকর হবে না
                            </p>
                          )}
                        </Card>
                      </>
                    )}

                    <div className="flex gap-2 justify-end pt-4 border-t">
                      <Button variant="outline" onClick={resetForm}>বাতিল</Button>
                      <Button onClick={handleSubmit} disabled={!selectedItem || createReturnMutation.isPending}>
                        {createReturnMutation.isPending ? "তৈরি হচ্ছে..."
                          : (isAuditOnly ? "নোট সংরক্ষণ" : (isAdmin ? "রিটার্ন সম্পন্ন" : "অনুমোদনের জন্য পাঠান"))}
                      </Button>
                    </div>
                  </div>
                )}
              </DialogContent>
            </Dialog>
          </div>

          <TabsList className="grid w-full grid-cols-2 max-w-md">
            <TabsTrigger value="list" className="gap-2"><RotateCcw className="h-4 w-4" />রিটার্ন তালিকা</TabsTrigger>
            <TabsTrigger value="analytics" className="gap-2"><BarChart3 className="h-4 w-4" />অ্যানালিটিক্স</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="list" className="flex-1 overflow-y-auto pb-6 space-y-4 mt-4">
          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="p-3"><p className="text-xs text-muted-foreground">অপেক্ষমাণ</p><p className="text-2xl font-bold text-yellow-600">{pendingCount}</p></Card>
            <Card className="p-3"><p className="text-xs text-muted-foreground">সম্পন্ন</p><p className="text-2xl font-bold text-green-600">{completedCount}</p></Card>
            <Card className="p-3"><p className="text-xs text-muted-foreground">অডিট-অনলি নোট</p><p className="text-2xl font-bold text-blue-600">{auditOnlyCount}</p></Card>
            <Card className="p-3"><p className="text-xs text-muted-foreground">মোট রিফান্ড</p><p className="text-lg font-bold text-primary">৳{totalRefund.toLocaleString("bn-BD")}</p></Card>
          </div>

          <Card className="p-3">
            <div className="flex items-center gap-3 flex-wrap">
              <Label className="text-sm">স্ট্যাটাস:</Label>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">সকল</SelectItem>
                  <SelectItem value="pending">অপেক্ষমাণ</SelectItem>
                  <SelectItem value="completed">সম্পন্ন</SelectItem>
                  <SelectItem value="rejected">প্রত্যাখ্যাত</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </Card>

          {filteredReturns.length > 0 ? (
            <div className="grid gap-3">
              {filteredReturns.map((ret: any) => (
                <Card key={ret.id} className="p-4 card-hover">
                  <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <Package className="h-5 w-5 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-semibold break-words">{ret.products?.name}</h3>
                        <p className="text-xs text-muted-foreground font-mono">{ret.return_number || `#${ret.id.slice(0, 8)}`}</p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          {ret.products?.imei && <Badge variant="outline" className="text-[10px]">IMEI: {ret.products.imei}</Badge>}
                          {ret.products?.brand && <Badge variant="secondary" className="text-[10px]">{ret.products.brand}</Badge>}
                          {ret.is_audit_only && <Badge className="bg-blue-100 text-blue-800 text-[10px]">📋 অডিট-অনলি</Badge>}
                          {ret.refund_method && !ret.is_audit_only && (
                            <Badge variant="outline" className="text-[10px]">{METHOD_LABELS[ret.refund_method]}</Badge>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      {getStatusBadge(ret.status)}
                      {ret.status === "completed" ? (
                        <Button size="sm" variant="default" onClick={() => setReceiptRecord(ret)} className="h-7 px-2 gap-1">
                          <Printer className="h-3 w-3" />রসিদ পুনঃপ্রিন্ট
                        </Button>
                      ) : (
                        <Button size="sm" variant="ghost" onClick={() => setReceiptRecord(ret)} className="h-7 px-2 gap-1">
                          <Printer className="h-3 w-3" />রসিদ
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm p-3 bg-muted/30 rounded mb-3">
                    <div><p className="text-xs text-muted-foreground">ইনভয়েস</p><p className="font-mono">#{ret.sale_id.slice(0, 8)}</p></div>
                    <div><p className="text-xs text-muted-foreground">পরিমাণ</p><p>{ret.quantity}টি</p></div>
                    <div><p className="text-xs text-muted-foreground">{ret.is_audit_only ? "নোট মূল্য" : "রিফান্ড"}</p><p className="text-primary font-semibold">৳{Number(ret.refund_amount).toLocaleString("bn-BD")}</p></div>
                    <div><p className="text-xs text-muted-foreground flex items-center gap-1"><Calendar className="h-3 w-3" />তারিখ</p><p>{format(new Date(ret.created_at), "dd MMM yy", { locale: bn })}</p></div>
                  </div>

                  <div className="text-sm">
                    <span className="text-muted-foreground">কারণ: </span>
                    <span className="font-medium">{REASON_LABELS[ret.reason_code] || ret.reason_code}</span>
                    {ret.reason_notes && <p className="text-xs italic text-muted-foreground mt-1">"{ret.reason_notes}"</p>}
                    {ret.rejected_reason && (
                      <p className="text-xs text-red-600 mt-1">প্রত্যাখ্যানের কারণ: {ret.rejected_reason}</p>
                    )}
                  </div>

                  {ret.defect_photo_url && (
                    <div className="mt-3">
                      <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><ImageIcon className="h-3 w-3" />ত্রুটির প্রমাণ</p>
                      <ZoomableImage url={ret.defect_photo_url} alt="ত্রুটির প্রমাণ" displayWidth={80} displayHeight={80} />
                    </div>
                  )}

                  {/* Approval Timeline */}
                  <div className="mt-3 pt-3 border-t">
                    <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1">
                      <Clock className="h-3 w-3" />অনুমোদন টাইমলাইন
                    </p>
                    <div className="space-y-1.5 text-xs">
                      <div className="flex items-start gap-2">
                        <div className="w-2 h-2 rounded-full bg-blue-500 mt-1 shrink-0" />
                        <div className="flex-1">
                          <span className="font-medium">তৈরি</span>
                          <span className="text-muted-foreground"> — {ret.processed_by_profile?.full_name || ret.processed_by_profile?.email || "সিস্টেম"}</span>
                          <span className="text-muted-foreground"> · {format(new Date(ret.created_at), "dd MMM yyyy, hh:mm a", { locale: bn })}</span>
                        </div>
                      </div>
                      {ret.approved_at && ret.status === "completed" && (
                        <div className="flex items-start gap-2">
                          <div className="w-2 h-2 rounded-full bg-green-500 mt-1 shrink-0" />
                          <div className="flex-1">
                            <span className="font-medium text-green-700 dark:text-green-400">অনুমোদিত</span>
                            <span className="text-muted-foreground"> — {ret.approved_by_profile?.full_name || ret.approved_by_profile?.email || "—"}</span>
                            <span className="text-muted-foreground"> · {format(new Date(ret.approved_at), "dd MMM yyyy, hh:mm a", { locale: bn })}</span>
                          </div>
                        </div>
                      )}
                      {ret.approved_at && ret.status === "rejected" && (
                        <div className="flex items-start gap-2">
                          <div className="w-2 h-2 rounded-full bg-red-500 mt-1 shrink-0" />
                          <div className="flex-1">
                            <span className="font-medium text-red-700 dark:text-red-400">প্রত্যাখ্যাত</span>
                            <span className="text-muted-foreground"> — {ret.approved_by_profile?.full_name || ret.approved_by_profile?.email || "—"}</span>
                            <span className="text-muted-foreground"> · {format(new Date(ret.approved_at), "dd MMM yyyy, hh:mm a", { locale: bn })}</span>
                          </div>
                        </div>
                      )}
                      {ret.status === "pending" && (
                        <div className="flex items-start gap-2">
                          <div className="w-2 h-2 rounded-full bg-yellow-500 mt-1 shrink-0 animate-pulse" />
                          <div className="flex-1">
                            <span className="font-medium text-yellow-700 dark:text-yellow-400">অনুমোদনের অপেক্ষায়</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {ret.status === "pending" && !ret.is_audit_only && canApprove && (
                    <div className="flex gap-2 pt-3 mt-3 border-t">
                      <Button size="sm" onClick={() => approveReturnMutation.mutate(ret.id)}
                        disabled={approveReturnMutation.isPending}>
                        <CheckCircle className="h-4 w-4 mr-1" />অনুমোদন
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => setRejectingId(ret.id)}>
                        <XCircle className="h-4 w-4 mr-1" />প্রত্যাখ্যান
                      </Button>
                    </div>
                  )}
                  {ret.status === "pending" && !canApprove && (
                    <div className="pt-3 mt-3 border-t text-xs text-amber-600 flex items-center gap-1">
                      <Clock className="h-3 w-3" />Admin/Manager-এর অনুমোদনের অপেক্ষায়
                    </div>
                  )}
                </Card>
              ))}
            </div>
          ) : (
            <Card className="p-12 text-center">
              <div className="text-5xl mb-3">📦</div>
              <p className="text-muted-foreground">কোনো রিটার্ন নেই</p>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="analytics" className="flex-1 overflow-y-auto pb-6 mt-4">
          <ReturnAnalytics returns={returns || []} />
        </TabsContent>
      </Tabs>

      {/* Receipt modal */}
      <ReturnReceipt open={!!receiptRecord} onClose={() => setReceiptRecord(null)} returnRecord={receiptRecord} />

      {/* Reject reason dialog */}
      <Dialog open={!!rejectingId} onOpenChange={(o) => !o && setRejectingId(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-red-600" />প্রত্যাখ্যানের কারণ
            </DialogTitle>
            <DialogDescription>অডিট টাইমলাইনে সংরক্ষণের জন্য প্রত্যাখ্যানের কারণ লিখুন।</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)}
              placeholder="কেন এই রিটার্ন প্রত্যাখ্যান করা হচ্ছে?" rows={3} />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setRejectingId(null)}>বাতিল</Button>
              <Button variant="destructive"
                disabled={!rejectReason.trim() || rejectReturnMutation.isPending}
                onClick={() => rejectingId && rejectReturnMutation.mutate({ returnId: rejectingId, reason: rejectReason.trim() })}>
                প্রত্যাখ্যান নিশ্চিত
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
