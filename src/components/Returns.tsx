import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { format } from "date-fns";
import { bn } from "date-fns/locale";
import { RotateCcw, Search, Package, Calendar, CheckCircle, XCircle, Clock, BarChart3, FileText } from "lucide-react";
import { ActivityLogger } from "@/hooks/useActivityLog";
import { ReturnAnalytics } from "./ReturnAnalytics";

const REASON_LABELS: Record<string, string> = {
  defective: "ত্রুটিপূর্ণ পণ্য",
  wrong_item: "ভুল পণ্য",
  customer_request: "ক্রেতার অনুরোধ",
  damaged: "ক্ষতিগ্রস্ত",
  not_as_described: "বিবরণ অনুযায়ী নয়",
  other: "অন্যান্য",
};

export function Returns() {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [searchSaleId, setSearchSaleId] = useState("");
  const [selectedSale, setSelectedSale] = useState<any>(null);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [returnQuantity, setReturnQuantity] = useState(1);
  const [reasonCode, setReasonCode] = useState("defective");
  const [reasonNotes, setReasonNotes] = useState("");
  const [isAuditOnly, setIsAuditOnly] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>("all");

  const queryClient = useQueryClient();

  const { data: returns, isLoading } = useQuery({
    queryKey: ["returns"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("returns")
        .select(`
          *,
          sales (id, total_amount, created_at, customer_id, customers (name, phone)),
          sale_items (quantity, unit_price, total_price),
          products (name, imei, brand, model, condition, supplier_name)
        `)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const searchSale = async () => {
    if (!searchSaleId.trim()) {
      toast.error("বিক্রয় আইডি লিখুন");
      return;
    }
    const { data, error } = await supabase
      .from("sales")
      .select(`*, customers (name, phone), sale_items (*, products (name, imei, brand, condition))`)
      .ilike("id", `%${searchSaleId}%`)
      .maybeSingle();
    if (error || !data) { toast.error("বিক্রয় পাওয়া যায়নি"); return; }
    setSelectedSale(data);
  };

  // Create + auto-process if NOT audit-only
  const createReturnMutation = useMutation({
    mutationFn: async () => {
      if (!selectedItem || !selectedSale) throw new Error("আইটেম নির্বাচন করুন");
      const { data: { user } } = await supabase.auth.getUser();
      const refundAmount = Number(selectedItem.unit_price) * returnQuantity;

      // 1. Insert return record
      const { data: returnRow, error: retErr } = await supabase
        .from("returns")
        .insert([{
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
          processed_by: user?.id,
        }])
        .select()
        .single();
      if (retErr) throw retErr;

      // If audit-only: log and stop. No stock/finance impact.
      if (isAuditOnly) {
        await ActivityLogger.returnCreated(
          selectedItem.products?.name || "পণ্য",
          returnQuantity,
          refundAmount,
          true,
          REASON_LABELS[reasonCode] || reasonCode,
          returnRow.id
        );
        return returnRow;
      }

      // Full return: stock + finance + ledger
      // 2. Restore stock (with IMEI conflict guard: never exceed 1 if IMEI is set)
      const { data: prod } = await supabase
        .from("products")
        .select("stock_quantity, imei, name")
        .eq("id", selectedItem.product_id)
        .single();
      if (prod) {
        let newStock = (prod.stock_quantity || 0) + returnQuantity;
        if (prod.imei && newStock > 1) {
          // IMEI-tracked: cap at 1 to honor unique-IMEI rule
          newStock = 1;
        }
        await supabase.from("products").update({ stock_quantity: newStock }).eq("id", selectedItem.product_id);
      }

      // 3. Adjust sale totals — reduce total_amount and due_amount; refund any over-paid
      const { data: sale } = await supabase
        .from("sales")
        .select("total_amount, paid_amount, due_amount, status")
        .eq("id", selectedSale.id)
        .single();
      if (sale) {
        const newTotal = Math.max(0, Number(sale.total_amount) - refundAmount);
        const newDue = Math.max(0, newTotal - Number(sale.paid_amount));
        const cashRefund = Math.max(0, Number(sale.paid_amount) - newTotal);
        const newPaid = Number(sale.paid_amount) - cashRefund;

        // Determine status: if everything is returned (newTotal===0) mark 'returned'
        const newStatus = newTotal === 0 ? "returned" : "completed";
        await supabase.from("sales").update({
          total_amount: newTotal,
          due_amount: newDue,
          paid_amount: newPaid,
          status: newStatus,
        }).eq("id", selectedSale.id);

        // 4. If customer had paid more than the new total, record a negative payment (refund) to the customer ledger
        if (cashRefund > 0 && selectedSale.customer_id) {
          await supabase.from("payments").insert([{
            sale_id: selectedSale.id,
            customer_id: selectedSale.customer_id,
            amount: -cashRefund, // negative = refund out
            payment_method: "cash",
            notes: `রিটার্ন রিফান্ড: ${selectedItem.products?.name} (×${returnQuantity}) — ${REASON_LABELS[reasonCode]}`,
            collected_by: user?.id,
            return_id: returnRow.id,
          }]);
        }
      }

      await ActivityLogger.returnCreated(
        selectedItem.products?.name || "পণ্য",
        returnQuantity,
        refundAmount,
        false,
        REASON_LABELS[reasonCode] || reasonCode,
        returnRow.id
      );
      return returnRow;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["returns"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      queryClient.invalidateQueries({ queryKey: ["customer-sales"] });
      queryClient.invalidateQueries({ queryKey: ["customer-payments"] });
      toast.success(isAuditOnly ? "রিটার্ন নোট সংরক্ষিত (অডিট-অনলি)!" : "রিটার্ন সফলভাবে সম্পন্ন হয়েছে!");
      resetForm();
    },
    onError: (err: any) => toast.error(err.message || "রিটার্ন তৈরি করতে ব্যর্থ"),
  });

  // For pending returns: approve (apply effects) or reject
  const processReturnMutation = useMutation({
    mutationFn: async ({ returnId, status }: { returnId: string; status: string }) => {
      const { data: ret } = await supabase
        .from("returns")
        .select("*, products(name, stock_quantity, imei), sales(customer_id, total_amount, paid_amount)")
        .eq("id", returnId)
        .single();
      if (!ret) throw new Error("রিটার্ন পাওয়া যায়নি");

      await supabase.from("returns").update({ status, updated_at: new Date().toISOString() }).eq("id", returnId);

      if (status === "completed" && !ret.is_audit_only) {
        // Restore stock
        if (ret.products) {
          let newStock = (ret.products.stock_quantity || 0) + ret.quantity;
          if (ret.products.imei && newStock > 1) newStock = 1;
          await supabase.from("products").update({ stock_quantity: newStock }).eq("id", ret.product_id);
        }
        // Adjust sale + ledger refund
        if (ret.sales) {
          const newTotal = Math.max(0, Number(ret.sales.total_amount) - Number(ret.refund_amount));
          const cashRefund = Math.max(0, Number(ret.sales.paid_amount) - newTotal);
          const newPaid = Number(ret.sales.paid_amount) - cashRefund;
          const newDue = Math.max(0, newTotal - newPaid);
          await supabase.from("sales").update({
            total_amount: newTotal, paid_amount: newPaid, due_amount: newDue,
            status: newTotal === 0 ? "returned" : "completed",
          }).eq("id", ret.sale_id);
          if (cashRefund > 0 && ret.sales.customer_id) {
            const { data: { user } } = await supabase.auth.getUser();
            await supabase.from("payments").insert([{
              sale_id: ret.sale_id, customer_id: ret.sales.customer_id,
              amount: -cashRefund, payment_method: "cash",
              notes: `রিটার্ন রিফান্ড: ${ret.products?.name}`,
              collected_by: user?.id, return_id: returnId,
            }]);
          }
        }
      }
      await ActivityLogger.returnProcessed(returnId, status, ret.products?.name || "পণ্য", Number(ret.refund_amount));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["returns"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      queryClient.invalidateQueries({ queryKey: ["customer-sales"] });
      queryClient.invalidateQueries({ queryKey: ["customer-payments"] });
      toast.success("রিটার্ন প্রসেস সম্পন্ন!");
    },
    onError: (e: any) => toast.error(e.message || "প্রসেস করতে ব্যর্থ"),
  });

  const resetForm = () => {
    setSearchSaleId(""); setSelectedSale(null); setSelectedItem(null);
    setReturnQuantity(1); setReasonCode("defective"); setReasonNotes("");
    setIsAuditOnly(false); setIsAddDialogOpen(false);
  };

  const handleSubmit = () => {
    if (!selectedItem) { toast.error("আইটেম নির্বাচন করুন"); return; }
    if (returnQuantity < 1 || returnQuantity > selectedItem.quantity) {
      toast.error(`পরিমাণ ১ থেকে ${selectedItem.quantity}`); return;
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

  return (
    <div className="flex flex-col h-screen animate-fade-in">
      <Tabs defaultValue="list" className="flex-1 flex flex-col">
        <div className="sticky top-0 z-10 bg-white dark:bg-gray-950 border-b border-border pb-4 space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
                <RotateCcw className="h-7 w-7 text-primary" />রিটার্ন ও রিফান্ড
              </h1>
              <p className="text-sm text-muted-foreground">পূর্ণ রিটার্ন বা অডিট-অনলি রিটার্ন নোট</p>
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
                </DialogHeader>
                {!selectedSale ? (
                  <div className="space-y-4 py-4">
                    <label className="block text-sm font-medium">বিক্রয় আইডি দিয়ে খুঁজুন</label>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input value={searchSaleId} onChange={(e) => setSearchSaleId(e.target.value)}
                          placeholder="বিক্রয় আইডি..." className="pl-9"
                          onKeyDown={(e) => e.key === "Enter" && searchSale()} />
                      </div>
                      <Button onClick={searchSale}><Search className="h-4 w-4 mr-1" />খুঁজুন</Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4 py-4">
                    <Card className="p-4 bg-muted/50 border-primary/20">
                      <h3 className="font-semibold mb-3 flex items-center gap-2"><Package className="h-4 w-4 text-primary" />বিক্রয় তথ্য</h3>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div><p className="text-muted-foreground">আইডি</p><p className="font-mono">{selectedSale.id.slice(0, 8)}</p></div>
                        <div><p className="text-muted-foreground">তারিখ</p><p>{format(new Date(selectedSale.created_at), "dd MMM yyyy", { locale: bn })}</p></div>
                        <div><p className="text-muted-foreground">ক্রেতা</p><p>{selectedSale.customers?.name || "সাধারণ"}</p></div>
                        <div><p className="text-muted-foreground">মোট</p><p className="text-primary font-semibold">৳{selectedSale.total_amount?.toLocaleString('bn-BD')}</p></div>
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
                            <SelectItem key={it.id} value={it.id}>
                              {it.products?.name} — পরিমাণ: {it.quantity} — ৳{it.unit_price?.toLocaleString('bn-BD')}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {selectedItem && (
                      <>
                        <div>
                          <Label className="mb-2 block">পরিমাণ (সর্বোচ্চ {selectedItem.quantity})</Label>
                          <Input type="number" min={1} max={selectedItem.quantity}
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
                        <div>
                          <Label className="mb-2 block">অতিরিক্ত মন্তব্য</Label>
                          <Textarea value={reasonNotes} onChange={(e) => setReasonNotes(e.target.value)} rows={2} />
                        </div>

                        {/* Audit-only toggle */}
                        <Card className={`p-4 ${isAuditOnly ? 'bg-blue-50 dark:bg-blue-950/20 border-blue-300' : 'bg-muted/30'}`}>
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <FileText className="h-4 w-4 text-blue-600" />
                                <Label htmlFor="audit-only" className="font-semibold cursor-pointer">শুধু রিটার্ন নোট (অডিট-অনলি)</Label>
                              </div>
                              <p className="text-xs text-muted-foreground mt-1">
                                {isAuditOnly
                                  ? "✓ স্টক, বাকি, ও ফাইন্যান্সে কোনো প্রভাব পড়বে না — শুধু রেকর্ড থাকবে"
                                  : "অফ থাকলে: স্টক বাড়বে, সেইলস টোটাল কমবে, এবং কাস্টমার লেজারে রিফান্ড এন্ট্রি যাবে"}
                              </p>
                            </div>
                            <Switch id="audit-only" checked={isAuditOnly} onCheckedChange={setIsAuditOnly} />
                          </div>
                        </Card>

                        <Card className="p-4 bg-primary/5 border-primary/20">
                          <p className="text-sm text-muted-foreground">
                            {isAuditOnly ? "নোট পরিমাণ (রেকর্ডের জন্য)" : "রিফান্ড পরিমাণ"}
                          </p>
                          <p className="text-3xl font-bold text-primary">
                            ৳{(selectedItem.unit_price * returnQuantity).toLocaleString('bn-BD')}
                          </p>
                        </Card>
                      </>
                    )}

                    <div className="flex gap-2 justify-end pt-4 border-t">
                      <Button variant="outline" onClick={resetForm}>বাতিল</Button>
                      <Button onClick={handleSubmit} disabled={!selectedItem || createReturnMutation.isPending}>
                        {createReturnMutation.isPending ? "তৈরি হচ্ছে..." : (isAuditOnly ? "নোট সংরক্ষণ" : "রিটার্ন সম্পন্ন")}
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
            <Card className="p-3"><p className="text-xs text-muted-foreground">মোট রিফান্ড</p><p className="text-lg font-bold text-primary">৳{totalRefund.toLocaleString('bn-BD')}</p></Card>
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
                        <h3 className="font-semibold truncate">{ret.products?.name}</h3>
                        <p className="text-xs text-muted-foreground font-mono">#{ret.id.slice(0, 8)}</p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          {ret.products?.imei && <Badge variant="outline" className="text-[10px]">IMEI: {ret.products.imei}</Badge>}
                          {ret.products?.brand && <Badge variant="secondary" className="text-[10px]">{ret.products.brand}</Badge>}
                          {ret.is_audit_only && <Badge className="bg-blue-100 text-blue-800 text-[10px]">📋 অডিট-অনলি</Badge>}
                        </div>
                      </div>
                    </div>
                    {getStatusBadge(ret.status)}
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm p-3 bg-muted/30 rounded mb-3">
                    <div><p className="text-xs text-muted-foreground">বিক্রয়</p><p className="font-mono">{ret.sale_id.slice(0, 8)}</p></div>
                    <div><p className="text-xs text-muted-foreground">পরিমাণ</p><p>{ret.quantity}টি</p></div>
                    <div><p className="text-xs text-muted-foreground">{ret.is_audit_only ? "নোট মূল্য" : "রিফান্ড"}</p><p className="text-primary font-semibold">৳{Number(ret.refund_amount).toLocaleString('bn-BD')}</p></div>
                    <div><p className="text-xs text-muted-foreground flex items-center gap-1"><Calendar className="h-3 w-3" />তারিখ</p><p>{format(new Date(ret.created_at), "dd MMM yy", { locale: bn })}</p></div>
                  </div>

                  <div className="text-sm">
                    <span className="text-muted-foreground">কারণ: </span>
                    <span className="font-medium">{REASON_LABELS[ret.reason_code] || ret.reason_code}</span>
                    {ret.reason_notes && <p className="text-xs italic text-muted-foreground mt-1">"{ret.reason_notes}"</p>}
                  </div>

                  {ret.status === "pending" && !ret.is_audit_only && (
                    <div className="flex gap-2 pt-3 mt-3 border-t">
                      <Button size="sm" onClick={() => processReturnMutation.mutate({ returnId: ret.id, status: "completed" })}
                        disabled={processReturnMutation.isPending}>
                        <CheckCircle className="h-4 w-4 mr-1" />অনুমোদন
                      </Button>
                      <Button size="sm" variant="destructive"
                        onClick={() => processReturnMutation.mutate({ returnId: ret.id, status: "rejected" })}
                        disabled={processReturnMutation.isPending}>
                        <XCircle className="h-4 w-4 mr-1" />প্রত্যাখ্যান
                      </Button>
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
    </div>
  );
}
