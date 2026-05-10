/* eslint-disable @typescript-eslint/no-explicit-any */
import { memo, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { bn } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { ActivityLogger } from "@/hooks/useActivityLog";
import { useUserRole } from "@/hooks/useUserRole";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { ReturnPhotoUpload } from "@/components/returns/ReturnPhotoUpload";
import { ZoomableImage } from "@/components/ui/zoomable-image";
import { generateSupplierReturnReceiptPdf } from "@/utils/supplierReturnReceiptPdf";
import { cacheSupplierReturnReceipt, getCachedObjectUrl } from "@/utils/offlineAssets";
import { queueIfOffline } from "@/utils/offlineQueue";
import { toast } from "sonner";
import { BarChart3, CheckCircle, Clock, Download, Edit, Eye, FileText, Image as ImageIcon, Package, Printer, RefreshCcw, Search, Truck, XCircle } from "lucide-react";

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

const ROW_ESTIMATE = 228;
const PAGE_SIZE = 150;

const statusBadge = (status: string) => {
  const cls = status === "completed" ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300" : status === "rejected" ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300" : "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300";
  const Icon = status === "completed" ? CheckCircle : status === "rejected" ? XCircle : Clock;
  return <Badge className={`${cls} gap-1`}><Icon className="h-3 w-3" />{STATUS_LABELS[status] || status}</Badge>;
};

const SupplierReturnCard = memo(({ ret, canApprove, onDetails, onEdit, onPhoto, onPdf, onPrint, onApprove, onReject }: any) => (
  <Card className="p-3 sm:p-4 space-y-3 overflow-hidden [content-visibility:auto] [contain-intrinsic-size:228px]">
    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3"><div className="flex items-start gap-3 min-w-0">{ret.suppliers?.image_url && <ZoomableImage url={ret.suppliers.image_url} alt={ret.suppliers.name} displayWidth={56} displayHeight={72} />}<div className="min-w-0"><div className="flex items-center gap-2 flex-wrap"><h3 className="font-semibold break-all">{ret.return_number}</h3>{statusBadge(ret.status)}</div><p className="text-sm text-muted-foreground break-words">{ret.suppliers?.name || "অজানা"} • PO #{ret.purchases?.purchase_number || "N/A"}</p><p className="text-xs text-muted-foreground">{format(new Date(ret.created_at), "dd MMM yyyy, hh:mm a", { locale: bn })}</p></div></div><div className="sm:text-right"><p className="text-xl font-bold text-primary">৳{Number(ret.refund_amount).toLocaleString("bn-BD")}</p><p className="text-xs text-muted-foreground">{METHOD_LABELS[ret.return_method]}</p></div></div>
    <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm">{ret.supplier_return_items?.map((it: any) => <div key={it.id} className="p-2 rounded bg-muted"><b>{it.products?.name || "পণ্য"}</b><p className="text-xs text-muted-foreground">IMEI: {it.products?.imei || "N/A"}</p><p>Qty {it.quantity} × ৳{Number(it.unit_cost).toLocaleString("bn-BD")}</p></div>)}<div className="p-2 rounded bg-muted"><b>কারণ</b><p>{REASON_LABELS[ret.reason_code] || ret.reason_code}</p>{ret.reason_notes && <p className="text-xs text-muted-foreground line-clamp-2">{ret.reason_notes}</p>}</div><div className="p-2 rounded bg-muted"><b>স্টক/ফাইন্যান্স</b><p>{ret.stock_action === "deduct_stock" ? (ret.stock_applied ? "স্টক কমানো হয়েছে" : "স্টক কমানো বাকি") : "স্টক অপরিবর্তিত"}</p><p className="text-xs text-muted-foreground">{ret.finance_action === "supplier_refund" ? "ক্যাশ রিফান্ড" : ret.finance_action === "due_adjust" ? "বাকি সমন্বয়" : "ফাইন্যান্স নেই"} {ret.finance_action !== "none" ? `• ${ret.finance_applied ? "Applied" : "Pending"}` : ""}</p></div></div>
    {ret.defect_photo_url && <button type="button" className="text-xs text-primary underline" onClick={() => onPhoto(ret.defect_photo_url)}>প্রমাণ ছবি দেখুন</button>}
    <div className="border-l-2 border-primary/30 pl-3 space-y-2 text-xs"><div><b>তৈরি:</b> {ret.processed_by_profile?.full_name || ret.processed_by_profile?.email || "সিস্টেম"} • {format(new Date(ret.created_at), "dd MMM yyyy, hh:mm a", { locale: bn })}</div><div><b>{ret.status === "rejected" ? "প্রত্যাখ্যান" : ret.status === "completed" ? "অনুমোদন" : "স্ট্যাটাস"}:</b> {ret.status === "pending" ? "অনুমোদনের অপেক্ষায়" : `${ret.approved_by_profile?.full_name || ret.approved_by_profile?.email || "সিস্টেম"} • ${ret.approved_at ? format(new Date(ret.approved_at), "dd MMM yyyy, hh:mm a", { locale: bn }) : ""}`}</div>{ret.rejected_reason && <div className="text-destructive"><b>কারণ:</b> {ret.rejected_reason}</div>}</div>
    <div className="flex gap-2 justify-end flex-wrap"><Button size="sm" variant="outline" onClick={() => onDetails(ret)}><Eye className="h-4 w-4 mr-1" />বিস্তারিত</Button>{ret.status === "pending" && <Button size="sm" variant="outline" onClick={() => onEdit(ret)}><Edit className="h-4 w-4 mr-1" />এডিট</Button>}<Button size="sm" variant="outline" onClick={() => onPdf(ret)}><Download className="h-4 w-4 mr-1" />PDF</Button>{ret.status === "completed" && <Button size="sm" variant="outline" onClick={() => onPrint(ret)}><Printer className="h-4 w-4 mr-1" />রসিদ</Button>}{ret.status === "pending" && canApprove && <><Button size="sm" onClick={() => onApprove(ret)}><CheckCircle className="h-4 w-4 mr-1" />অনুমোদন</Button><Button size="sm" variant="destructive" onClick={() => onReject(ret.id)}><XCircle className="h-4 w-4 mr-1" />প্রত্যাখ্যান</Button></>}</div>
  </Card>
));

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
  const [detailsReturn, setDetailsReturn] = useState<any | null>(null);
  const [editingReturn, setEditingReturn] = useState<any | null>(null);
  const [editReasonCode, setEditReasonCode] = useState("defective");
  const [editReasonNotes, setEditReasonNotes] = useState("");
  const [editStockAction, setEditStockAction] = useState<StockAction>("deduct_stock");
  const [editReturnMethod, setEditReturnMethod] = useState<ReturnMethod>("due_adjust");
  const [editReplacementNote, setEditReplacementNote] = useState("");
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [resolvedPhotoPreviewUrl, setResolvedPhotoPreviewUrl] = useState<string | null>(null);
  const listScrollRef = useRef<HTMLDivElement | null>(null);
  const [listScrollTop, setListScrollTop] = useState(0);
  const [renderLimit, setRenderLimit] = useState(40);
  const deferredSearchTerm = useDeferredValue(searchTerm.trim());

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
        .order("created_at", { ascending: false })
        .limit(120);
      if (selectedSupplierId !== "all") query = query.eq("supplier_id", selectedSupplierId);
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
  });

  const { data: supplierReturns, isLoading } = useQuery({
    queryKey: ["supplier-returns", filterStatus, deferredSearchTerm],
    queryFn: async () => {
      const baseSelect = `
          *,
          suppliers(name, phone, image_url),
          purchases(purchase_number, total_amount, paid_amount, due_amount),
          supplier_return_items(*, products(name, imei, brand, model, condition))
        `;
      let query = db.from("supplier_returns").select(baseSelect).order("created_at", { ascending: false }).limit(PAGE_SIZE);
      if (deferredSearchTerm) {
        const { data: ids, error: searchError } = await db.rpc("search_supplier_return_ids", { _search: deferredSearchTerm, _status: filterStatus, _limit: PAGE_SIZE, _offset: 0 });
        if (searchError) throw searchError;
        const orderedIds = (ids || []).map((x: any) => x.id);
        if (!orderedIds.length) return [];
        query = db.from("supplier_returns").select(baseSelect).in("id", orderedIds);
      } else if (filterStatus !== "all") query = query.eq("status", filterStatus);
      const { data, error } = await query;
      if (error) throw error;
      const orderedData = deferredSearchTerm
        ? (idsOrder(data || [], deferredSearchTerm) as any[])
        : (data || []);

      const ids = Array.from(new Set(orderedData.flatMap((r: any) => [r.processed_by, r.approved_by]).filter(Boolean)));
      let profiles: Record<string, any> = {};
      if (ids.length) {
        const { data: profs } = await db.from("profiles").select("id, full_name, email").in("id", ids);
        profiles = Object.fromEntries((profs || []).map((p: any) => [p.id, p]));
      }
      const rows = orderedData.map((r: any) => ({
        ...r,
        processed_by_profile: r.processed_by ? profiles[r.processed_by] : null,
        approved_by_profile: r.approved_by ? profiles[r.approved_by] : null,
      }));
      rows.forEach(cacheSupplierReturnReceipt);
      return rows;
    },
    staleTime: 5 * 60_000,
    gcTime: 24 * 60 * 60_000,
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

  const invalidateSupplierReturnData = () => {
    queryClient.invalidateQueries({ queryKey: ["supplier-returns"] });
    queryClient.invalidateQueries({ queryKey: ["purchases"] });
    queryClient.invalidateQueries({ queryKey: ["supplier-return-purchases"] });
    queryClient.invalidateQueries({ queryKey: ["products"] });
    queryClient.invalidateQueries({ queryKey: ["supplier-payments-all"] });
  };

  const processSupplierReturn = async (ret: any, action: "approve" | "reject", reason?: string) => {
    if (!userId) throw new Error("ব্যবহারকারী পাওয়া যায়নি");
    const { data, error } = await db.rpc("process_supplier_return", {
      _return_id: ret.id,
      _action: action,
      _actor_id: userId,
      _reject_reason: reason || null,
    });
    if (error) throw error;
    return data;
  };

  const createReturnMutation = useMutation({
    mutationFn: async () => {
      if (selectedPurchaseId === "all" || !selectedPurchase) throw new Error("ক্রয় অর্ডার নির্বাচন করুন");
      if (!selectedItem) throw new Error("রিটার্ন আইটেম নির্বাচন করুন");
      if (quantity < 1 || quantity > Number(selectedItem.received_quantity || selectedItem.quantity)) throw new Error("রিটার্ন পরিমাণ সঠিক নয়");

      const autoApprove = isAdmin;
      const returnPayload = {
        supplier_id: selectedPurchase.supplier_id,
        purchase_id: selectedPurchase.id,
        reason_code: reasonCode,
        reason_notes: reasonNotes || null,
        return_method: returnMethod,
        status: "pending",
        finance_action: financeAction,
        stock_action: stockAction,
        refund_amount: refundAmount,
        replacement_note: replacementNote || null,
        defect_photo_url: defectPhotoUrl,
        processed_by: userId,
        approved_by: null,
        approved_at: null,
      };

      const returnItem = {
        purchase_item_id: selectedItem.id,
        product_id: selectedItem.product_id,
        quantity,
        unit_cost: Number(selectedItem.unit_cost),
        total_cost: refundAmount,
        stock_deducted: false,
      };

      let ret: any;
      try {
        const { data, error } = await db.from("supplier_returns").insert(returnPayload).select("*").single();
        if (error) throw error;
        ret = data;
        const { error: itemError } = await db.from("supplier_return_items").insert({ ...returnItem, supplier_return_id: ret.id });
        if (itemError) throw itemError;
      } catch (error) {
        queueIfOffline("supplier_return_create", { ...returnPayload, returnItem, autoApprove, actorId: userId }, error);
        return { ...returnPayload, id: `offline-${Date.now()}`, supplier_return_items: [returnItem], status: "pending", suppliers: selectedPurchase.suppliers, purchases: selectedPurchase };
      }

      const finalReturn = autoApprove ? await processSupplierReturn(ret, "approve") : ret;

      await ActivityLogger.supplierReturnCreated?.(ret.return_number, selectedPurchase.suppliers?.name || "সাপ্লায়ার", refundAmount, finalReturn?.status || ret.status);
      return finalReturn || ret;
    },
    onSuccess: () => {
      invalidateSupplierReturnData();
      toast.success(isAdmin ? "সাপ্লায়ার রিটার্ন সম্পন্ন হয়েছে" : "সাপ্লায়ার রিটার্ন অনুমোদনের অপেক্ষায় সংরক্ষিত");
      resetForm();
    },
    onError: (e: any) => toast.error(e.message || "রিটার্ন তৈরি ব্যর্থ"),
  });

  const approveMutation = useMutation({
    mutationFn: async (ret: any) => {
      if (!canApprove) throw new Error("অনুমোদনের অনুমতি নেই");
      try {
        await processSupplierReturn(ret, "approve");
      } catch (error) {
        queueIfOffline("supplier_return_process", { returnId: ret.id, action: "approve", actorId: userId }, error);
      }
      await ActivityLogger.supplierReturnProcessed?.(ret.return_number, "completed", ret.suppliers?.name || "সাপ্লায়ার", Number(ret.refund_amount));
    },
    onSuccess: () => {
      invalidateSupplierReturnData();
      toast.success("সাপ্লায়ার রিটার্ন অনুমোদিত");
    },
    onError: (e: any) => toast.error(e.message || "অনুমোদন ব্যর্থ"),
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ ret, reason }: { ret: any; reason: string }) => {
      try {
        await processSupplierReturn(ret, "reject", reason);
      } catch (error) {
        queueIfOffline("supplier_return_process", { returnId: ret.id, action: "reject", actorId: userId, reason }, error);
      }
      await ActivityLogger.supplierReturnProcessed?.(ret.return_number, "rejected", ret.suppliers?.name || "সাপ্লায়ার", Number(ret.refund_amount));
    },
    onSuccess: () => {
      invalidateSupplierReturnData();
      toast.success("সাপ্লায়ার রিটার্ন প্রত্যাখ্যাত");
      setRejectingId(null);
      setRejectReason("");
    },
    onError: (e: any) => toast.error(e.message || "প্রত্যাখ্যান ব্যর্থ"),
  });

  const openEditDialog = (ret: any) => {
    if (ret.status !== "pending") return toast.error("শুধু অপেক্ষমাণ রিটার্ন এডিট করা যাবে");
    setEditingReturn(ret);
    setEditReasonCode(ret.reason_code || "defective");
    setEditReasonNotes(ret.reason_notes || "");
    setEditStockAction(ret.stock_action || "deduct_stock");
    setEditReturnMethod(ret.return_method || "due_adjust");
    setEditReplacementNote(ret.replacement_note || "");
  };

  const editMutation = useMutation({
    mutationFn: async () => {
      if (!editingReturn || editingReturn.status !== "pending") throw new Error("শুধু অপেক্ষমাণ রিটার্ন এডিট করা যাবে");
      const nextFinanceAction: FinanceAction = editReturnMethod === "cash_refund" ? "supplier_refund" : editReturnMethod === "due_adjust" ? "due_adjust" : "none";
      const updates = {
        reason_code: editReasonCode,
        reason_notes: editReasonNotes || null,
        stock_action: editStockAction,
        return_method: editReturnMethod,
        finance_action: nextFinanceAction,
        replacement_note: editReplacementNote || null,
      };
      try {
        const { error } = await db.from("supplier_returns").update(updates).eq("id", editingReturn.id).eq("status", "pending");
        if (error) throw error;
      } catch (error) {
        queueIfOffline("supplier_return_edit", { id: editingReturn.id, updates }, error);
      }
    },
    onSuccess: () => {
      invalidateSupplierReturnData();
      toast.success("সাপ্লায়ার রিটার্ন আপডেট হয়েছে");
      setEditingReturn(null);
    },
    onError: (e: any) => toast.error(e.message || "আপডেট ব্যর্থ"),
  });

  const filteredReturns = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return (supplierReturns || []).filter((r: any) => {
      const matchesStatus = filterStatus === "all" || r.status === filterStatus;
      const needle = `${r.return_number} ${r.suppliers?.name || ""} ${r.suppliers?.phone || ""} ${r.purchases?.purchase_number || ""}`.toLowerCase();
      return matchesStatus && (!q || needle.includes(q));
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

  useEffect(() => {
    setRenderLimit(40);
    setListScrollTop(0);
    listScrollRef.current?.scrollTo({ top: 0 });
  }, [filterStatus, searchTerm]);

  useEffect(() => {
    let alive = true;
    if (!photoPreviewUrl) {
      setResolvedPhotoPreviewUrl(null);
      return;
    }
    getCachedObjectUrl(photoPreviewUrl).then((url) => alive && setResolvedPhotoPreviewUrl(url));
    return () => { alive = false; };
  }, [photoPreviewUrl]);

  const openPdf = (ret: any, format: "a4" | "letter" = "a4") => {
    cacheSupplierReturnReceipt(ret);
    generateSupplierReturnReceiptPdf(ret, format);
  };

  const viewportHeight = listScrollRef.current?.clientHeight || 720;
  const virtualStart = Math.max(0, Math.floor(listScrollTop / ROW_ESTIMATE) - 6);
  const virtualEnd = Math.min(
    filteredReturns.length,
    Math.max(renderLimit, Math.ceil((listScrollTop + viewportHeight) / ROW_ESTIMATE) + 8),
  );
  const virtualReturns = filteredReturns.slice(virtualStart, virtualEnd);
  const topSpacer = virtualStart * ROW_ESTIMATE;
  const bottomSpacer = Math.max(0, (filteredReturns.length - virtualEnd) * ROW_ESTIMATE);

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

  if (isLoading) return <div className="p-8 text-center text-muted-foreground">লোড হচ্ছে...</div>;

  return (
    <div className="flex flex-col h-screen animate-fade-in overflow-hidden">
      <div className="sticky top-0 z-10 bg-background border-b border-border pb-3 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2"><Truck className="h-7 w-7 text-primary" />সাপ্লায়ার রিটার্ন</h1>
            <p className="text-sm text-muted-foreground">ক্রয় ফেরত, সাপ্লায়ার রিফান্ড, স্টক ও অডিট একসাথে</p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild><Button className="bg-gradient-to-r from-primary to-accent gap-2"><RefreshCcw className="h-4 w-4" />নতুন সাপ্লায়ার রিটার্ন</Button></DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" onPointerDownOutside={(e) => e.preventDefault()}>
              <DialogHeader><DialogTitle>সাপ্লায়ার রিটার্ন তৈরি করুন</DialogTitle><DialogDescription>ক্রয় অর্ডারের আইটেম, স্টক অ্যাকশন, ফাইন্যান্স অ্যাকশন ও প্রমাণসহ রিটার্ন রেকর্ড করুন।</DialogDescription></DialogHeader>
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

        <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
          <Card className="p-3"><p className="text-xs text-muted-foreground">মোট রিটার্ন</p><p className="text-xl font-bold">{analytics.total}</p></Card>
          <Card className="p-3"><p className="text-xs text-muted-foreground">অপেক্ষমাণ</p><p className="text-xl font-bold text-yellow-600">{analytics.pending}</p></Card>
          <Card className="p-3"><p className="text-xs text-muted-foreground">সম্পন্ন</p><p className="text-xl font-bold text-green-600">{analytics.completed}</p></Card>
          <Card className="p-3"><p className="text-xs text-muted-foreground">প্রত্যাখ্যাত</p><p className="text-xl font-bold text-red-600">{analytics.rejected}</p></Card>
          <Card className="p-3"><p className="text-xs text-muted-foreground">রিফান্ড/সমন্বয়</p><p className="text-xl font-bold text-primary">৳{analytics.amount.toLocaleString("bn-BD")}</p></Card>
        </div>
      </div>

      <Tabs defaultValue="returns" className="flex-1 min-h-0 pt-4 flex flex-col">
        <TabsList className="grid w-full grid-cols-2"><TabsTrigger value="returns">রিটার্ন তালিকা</TabsTrigger><TabsTrigger value="analytics">এনালিটিক্স</TabsTrigger></TabsList>
        <TabsContent value="returns" ref={listScrollRef} onScroll={(e) => { const el = e.currentTarget; setListScrollTop(el.scrollTop); if (el.scrollTop + el.clientHeight > el.scrollHeight - 900) setRenderLimit((n) => Math.min(filteredReturns.length, n + 30)); }} className="flex-1 min-h-0 overflow-y-auto space-y-3 pb-6">
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_9rem] gap-2"><div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input className="pl-9" placeholder="রিটার্ন নম্বর, সাপ্লায়ার, মোবাইল, PO..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} /></div><Select value={filterStatus} onValueChange={setFilterStatus}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">সব</SelectItem><SelectItem value="pending">অপেক্ষমাণ</SelectItem><SelectItem value="completed">সম্পন্ন</SelectItem><SelectItem value="rejected">প্রত্যাখ্যাত</SelectItem></SelectContent></Select></div>

          {topSpacer > 0 && <div style={{ height: topSpacer }} aria-hidden="true" />}
          {virtualReturns.map((ret: any) => <SupplierReturnCard key={ret.id} ret={ret} canApprove={canApprove} onDetails={setDetailsReturn} onEdit={openEditDialog} onPhoto={setPhotoPreviewUrl} onPdf={openPdf} onPrint={printReceipt} onApprove={(r: any) => approveMutation.mutate(r)} onReject={setRejectingId} />)}
          {bottomSpacer > 0 && <div style={{ height: bottomSpacer }} aria-hidden="true" />}
          {filteredReturns.length > renderLimit && <div className="flex justify-center"><Button variant="outline" size="sm" onClick={() => setRenderLimit((n) => Math.min(filteredReturns.length, n + 80))}>আরও দেখুন ({Math.max(0, filteredReturns.length - renderLimit)})</Button></div>}
          {filteredReturns.length === 0 && <Card className="p-12 text-center"><Package className="h-12 w-12 mx-auto text-muted-foreground mb-3" /><h3 className="font-semibold">কোনো সাপ্লায়ার রিটার্ন নেই</h3><p className="text-sm text-muted-foreground">নতুন রিটার্ন তৈরি করুন</p></Card>}
        </TabsContent>
        <TabsContent value="analytics" className="flex-1 overflow-y-auto space-y-3 pb-6"><Card className="p-4"><h3 className="font-semibold flex items-center gap-2 mb-3"><BarChart3 className="h-5 w-5 text-primary" />সাপ্লায়ার ভিত্তিক রিটার্ন</h3><div className="space-y-2">{analytics.bySupplier.map((s) => <div key={s.name} className="flex items-center justify-between p-2 rounded bg-muted"><span>{s.name}</span><span className="font-semibold">{s.count} বার • ৳{s.amount.toLocaleString("bn-BD")}</span></div>)}{analytics.bySupplier.length === 0 && <p className="text-sm text-muted-foreground">এখনো সম্পন্ন রিটার্ন নেই</p>}</div></Card><Card className="p-4"><h3 className="font-semibold flex items-center gap-2 mb-2"><FileText className="h-5 w-5 text-primary" />অডিট সংযোগ</h3><p className="text-sm text-muted-foreground">প্রতিটি তৈরি, অনুমোদন ও প্রত্যাখ্যান Activity Logs-এ সাপ্লায়ার অ্যাকশন হিসেবে সংরক্ষিত হচ্ছে।</p></Card></TabsContent>
      </Tabs>

      <Dialog open={!!rejectingId} onOpenChange={(open) => { if (!open) setRejectingId(null); }}><DialogContent><DialogHeader><DialogTitle>রিটার্ন প্রত্যাখ্যান</DialogTitle><DialogDescription>অডিট ইতিহাসের জন্য প্রত্যাখ্যানের কারণ সংরক্ষণ হবে।</DialogDescription></DialogHeader><div className="space-y-3"><Label>প্রত্যাখ্যানের কারণ</Label><Textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} /><div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setRejectingId(null)}>বাতিল</Button><Button variant="destructive" disabled={rejectMutation.isPending} onClick={() => { const ret = supplierReturns?.find((r: any) => r.id === rejectingId); if (!rejectReason.trim()) return toast.error("কারণ লিখুন"); if (ret) rejectMutation.mutate({ ret, reason: rejectReason }); }}>প্রত্যাখ্যান করুন</Button></div></div></DialogContent></Dialog>

      <Dialog open={!!editingReturn} onOpenChange={(open) => { if (!open) setEditingReturn(null); }}><DialogContent><DialogHeader><DialogTitle>সাপ্লায়ার রিটার্ন এডিট</DialogTitle><DialogDescription>শুধু pending রিটার্নের কারণ, পদ্ধতি ও স্টক অ্যাকশন পরিবর্তন করা যাবে।</DialogDescription></DialogHeader><div className="space-y-3"><div className="grid grid-cols-1 md:grid-cols-2 gap-3"><div><Label className="mb-2 block">কারণ</Label><Select value={editReasonCode} onValueChange={setEditReasonCode}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(REASON_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select></div><div><Label className="mb-2 block">রিটার্ন পদ্ধতি</Label><Select value={editReturnMethod} onValueChange={(v) => setEditReturnMethod(v as ReturnMethod)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="due_adjust">📒 বাকি সমন্বয়</SelectItem><SelectItem value="cash_refund">💵 সাপ্লায়ার নগদ ফেরত</SelectItem><SelectItem value="replacement">🔄 রিপ্লেসমেন্ট</SelectItem></SelectContent></Select></div></div><Card className="p-4 bg-muted/30"><div className="flex items-center justify-between gap-3"><div><Label className="font-semibold">অনুমোদনের সময় স্টক কমবে</Label><p className="text-xs text-muted-foreground">Completed হলে আর পরিবর্তন করা যাবে না</p></div><Switch checked={editStockAction === "deduct_stock"} onCheckedChange={(v) => setEditStockAction(v ? "deduct_stock" : "no_stock_change")} /></div></Card>{editReturnMethod === "replacement" && <div><Label className="mb-2 block">রিপ্লেসমেন্ট নোট</Label><Textarea value={editReplacementNote} onChange={(e) => setEditReplacementNote(e.target.value)} /></div>}<div><Label className="mb-2 block">বিস্তারিত মন্তব্য</Label><Textarea value={editReasonNotes} onChange={(e) => setEditReasonNotes(e.target.value)} /></div><div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setEditingReturn(null)}>বাতিল</Button><Button onClick={() => editMutation.mutate()} disabled={editMutation.isPending}>আপডেট করুন</Button></div></div></DialogContent></Dialog>

      <Dialog open={!!detailsReturn} onOpenChange={(open) => { if (!open) setDetailsReturn(null); }}><DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>রিটার্ন বিস্তারিত — {detailsReturn?.return_number}</DialogTitle><DialogDescription>আইটেম, স্টক/ফাইন্যান্স প্রসেসিং, প্রমাণ ছবি ও approval timeline দেখুন।</DialogDescription></DialogHeader>{detailsReturn && <div className="space-y-4"><div className="flex justify-end gap-2 flex-wrap">{detailsReturn.defect_photo_url && <Button size="sm" variant="outline" onClick={() => setPhotoPreviewUrl(detailsReturn.defect_photo_url)}><ImageIcon className="h-4 w-4 mr-1" />ছবি প্রিভিউ</Button>}<Button size="sm" variant="outline" onClick={() => openPdf(detailsReturn)}><Download className="h-4 w-4 mr-1" />A4 PDF</Button><Button size="sm" variant="outline" onClick={() => openPdf(detailsReturn, "letter")}><Download className="h-4 w-4 mr-1" />Letter PDF</Button></div><div className="grid grid-cols-2 gap-3 text-sm"><Card className="p-3"><p className="text-muted-foreground">সাপ্লায়ার</p><b>{detailsReturn.suppliers?.name || "অজানা"}</b></Card><Card className="p-3"><p className="text-muted-foreground">PO</p><b>{detailsReturn.purchases?.purchase_number || "N/A"}</b></Card><Card className="p-3"><p className="text-muted-foreground">স্টক প্রসেসিং</p><b>{detailsReturn.stock_action === "deduct_stock" ? (detailsReturn.stock_applied ? "Applied" : "Pending") : "No change"}</b></Card><Card className="p-3"><p className="text-muted-foreground">ফাইন্যান্স প্রসেসিং</p><b>{detailsReturn.finance_action === "none" ? "No change" : detailsReturn.finance_applied ? `Applied ৳${Number(detailsReturn.applied_refund_amount || detailsReturn.refund_amount).toLocaleString("bn-BD")}` : "Pending"}</b></Card></div><div className="space-y-2">{detailsReturn.supplier_return_items?.map((it: any) => <Card key={it.id} className="p-3 text-sm"><b>{it.products?.name || "পণ্য"}</b><p className="text-muted-foreground">IMEI: {it.products?.imei || "N/A"} • Brand: {it.products?.brand || "N/A"} • Model: {it.products?.model || "N/A"}</p><p>Qty {it.quantity} × ৳{Number(it.unit_cost).toLocaleString("bn-BD")} = ৳{Number(it.total_cost).toLocaleString("bn-BD")}</p></Card>)}</div><Card className="p-3 text-sm"><b>অডিট টাইমলাইন</b><div className="mt-2 border-l-2 border-primary/30 pl-3 space-y-2"><div>তৈরি: {detailsReturn.processed_by_profile?.full_name || detailsReturn.processed_by_profile?.email || "সিস্টেম"} • {format(new Date(detailsReturn.created_at), "dd MMM yyyy, hh:mm a", { locale: bn })}</div>{detailsReturn.status !== "pending" ? <div>{detailsReturn.status === "completed" ? "অনুমোদন" : "প্রত্যাখ্যান"}: {detailsReturn.approved_by_profile?.full_name || detailsReturn.approved_by_profile?.email || "সিস্টেম"} • {detailsReturn.approved_at ? format(new Date(detailsReturn.approved_at), "dd MMM yyyy, hh:mm a", { locale: bn }) : ""}</div> : <div>স্ট্যাটাস: অনুমোদনের অপেক্ষায়</div>}{detailsReturn.rejected_reason && <div className="text-destructive">কারণ: {detailsReturn.rejected_reason}</div>}</div></Card>{detailsReturn.defect_photo_url && <div className="space-y-2"><ZoomableImage url={detailsReturn.defect_photo_url} alt="সাপ্লায়ার রিটার্ন প্রমাণ" displayWidth={120} displayHeight={120} /><button type="button" className="text-xs text-primary underline break-all text-left" onClick={() => setPhotoPreviewUrl(detailsReturn.defect_photo_url)}>প্রমাণ ছবির লিংক প্রিভিউ করুন</button></div>}</div>}</DialogContent></Dialog>

      <Dialog open={!!photoPreviewUrl} onOpenChange={(open) => { if (!open) setPhotoPreviewUrl(null); }}><DialogContent className="max-w-3xl"><DialogHeader><DialogTitle>ত্রুটির ছবি প্রিভিউ</DialogTitle><DialogDescription>PDF-এর defect photo link যাচাই করার জন্য ছবি দেখুন।</DialogDescription></DialogHeader>{photoPreviewUrl && <div className="space-y-3"><img src={resolvedPhotoPreviewUrl || photoPreviewUrl} alt="সাপ্লায়ার রিটার্ন ত্রুটির ছবি" className="max-h-[70vh] w-full object-contain rounded-md border" /><a href={photoPreviewUrl} target="_blank" rel="noreferrer" className="text-xs text-primary underline break-all">{photoPreviewUrl}</a></div>}</DialogContent></Dialog>
    </div>
  );
}
