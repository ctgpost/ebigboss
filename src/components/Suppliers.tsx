import { useState, useMemo, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { SupplierForm } from "./suppliers/SupplierForm";
import { CreatePurchaseDialog } from "./suppliers/CreatePurchaseDialog";
import { SupplierPaymentDialog } from "./suppliers/SupplierPaymentDialog";
import { AlertTriangle, ChevronDown, ChevronUp, RefreshCcw, Search } from "lucide-react";
import { CloudinaryImageUpload } from "./CloudinaryImageUpload";
import { getCloudinaryThumbnail } from "@/utils/cloudinary";
import { supplierSchema, validateInline } from "@/utils/validation";
import { createClientRequestId } from "@/utils/requestKeys";
import { computeSupplierTotals } from "@/utils/supplierBalance";

export function Suppliers() {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isPurchaseDialogOpen, setIsPurchaseDialogOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<any>(null);
  const [paymentSupplier, setPaymentSupplier] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<string>("name-asc");
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const [showSummary, setShowSummary] = useState(true);
  const [mismatchSupplier, setMismatchSupplier] = useState<any>(null);
  const [reconciling, setReconciling] = useState(false);
  const [formData, setFormData] = useState({ name: "", email: "", phone: "", address: "", notes: "", image_url: "" });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const supplierRequestIdRef = useRef<string | null>(null);
  const clearFormError = (key: string) =>
    setFormErrors((p) => {
      if (!p[key]) return p;
      const next = { ...p };
      delete next[key];
      return next;
    });

  const queryClient = useQueryClient();

  const { data: suppliers } = useQuery({
    queryKey: ["suppliers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("suppliers").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: purchases } = useQuery({
    queryKey: ["purchases"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchases")
        .select("*, suppliers(name), purchase_items(*, products(name))")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: products } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: allSupplierPayments } = useQuery({
    queryKey: ["supplier-payments-all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("supplier_payments").select("*");
      if (error) throw error;
      return data;
    },
  });

  const addSupplierMutation = useMutation({
    mutationFn: async (data: any) => {
      const { error } = await supabase.from("suppliers").insert([data]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      toast.success("সাপ্লায়ার যুক্ত হয়েছে!");
      supplierRequestIdRef.current = null;
      setIsAddDialogOpen(false);
      resetForm();
    },
    onError: (error: any) => {
      supplierRequestIdRef.current = null;
      toast.error(error.message || "সাপ্লায়ার যুক্ত করতে ব্যর্থ");
    },
  });

  const updateSupplierMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const { error } = await supabase.from("suppliers").update(data).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      toast.success("সাপ্লায়ার আপডেট হয়েছে!");
      setEditingSupplier(null);
      resetForm();
    },
  });

  const deleteSupplierMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("suppliers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      toast.success("সাপ্লায়ার মুছে ফেলা হয়েছে!");
    },
  });

  const receiveItemsMutation = useMutation({
    mutationFn: async ({ purchaseId, items }: { purchaseId: string; items: any[] }) => {
      const { error: purchaseError } = await supabase
        .from("purchases")
        .update({ status: "received" })
        .eq("id", purchaseId);
      if (purchaseError) throw purchaseError;

      for (const item of items) {
        const { data: product } = await supabase
          .from("products")
          .select("stock_quantity")
          .eq("id", item.product_id)
          .single();
        if (product) {
          await supabase
            .from("products")
            .update({ stock_quantity: product.stock_quantity + item.received_quantity })
            .eq("id", item.product_id);
        }
        await supabase
          .from("purchase_items")
          .update({ received_quantity: item.received_quantity })
          .eq("purchase_id", purchaseId)
          .eq("product_id", item.product_id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchases"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast.success("মালামাল গ্রহণ সম্পন্ন!");
    },
  });

  const resetForm = () => setFormData({ name: "", email: "", phone: "", address: "", notes: "", image_url: "" });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const result = validateInline(supplierSchema, formData);
    setFormErrors(result.errors);
    if (!result.success) {
      toast.error("ফর্মে ভুল আছে — লাল চিহ্নিত ফিল্ডগুলো ঠিক করুন");
      return;
    }
    if (editingSupplier) {
      updateSupplierMutation.mutate({ id: editingSupplier.id, data: formData });
    } else {
      supplierRequestIdRef.current ||= createClientRequestId("supplier");
      addSupplierMutation.mutate({ ...formData, client_request_id: supplierRequestIdRef.current });
    }
  };

  const startEdit = (supplier: any) => {
    setEditingSupplier(supplier);
    setFormData({
      name: supplier.name || "", email: supplier.email || "", phone: supplier.phone || "",
      address: supplier.address || "", notes: supplier.notes || "", image_url: supplier.image_url || "",
    });
  };

  const getSupplierTotals = (supplierId: string) => {
    const sup = suppliers?.find(s => s.id === supplierId);
    if (!sup) return { totalPur: 0, totalPaid: 0, totalDue: 0, mismatch: false } as any;
    const cardT = computeSupplierTotals(sup, purchases as any, allSupplierPayments as any, products as any);
    // Reconciliation: re-derive due directly from purchases.due_amount + standalone payments
    // so we can flag any drift between the card view and what the DB stores per-purchase.
    const sumDueOnPurchases = (purchases || [])
      .filter(p => p.supplier_id === supplierId)
      .reduce((a, x) => a + Number(x.due_amount || 0), 0);
    const ledgerDue = cardT.totalDue;
    const purchaseRowDue = sumDueOnPurchases;
    // Only meaningful when formal POs exist for this supplier.
    const mismatch = cardT.purchasesTotal > 0 && Math.abs(purchaseRowDue - ledgerDue) > 0.5;
    return { ...cardT, mismatch };
  };
  const getSupplierDue = (supplierId: string) => getSupplierTotals(supplierId).totalDue;

  const toggleCardExpand = (id: string) => {
    setExpandedCards(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const filteredSuppliers = useMemo(() => {
    if (!suppliers) return [];
    let filtered = suppliers.filter(s =>
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.phone?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const [field, dir] = sortBy.split("-");
    filtered.sort((a, b) => {
      let cmp = 0;
      if (field === "name") cmp = a.name.localeCompare(b.name);
      else if (field === "due") cmp = getSupplierDue(a.id) - getSupplierDue(b.id);
      return dir === "desc" ? -cmp : cmp;
    });
    return filtered;
  }, [suppliers, searchQuery, sortBy, purchases, allSupplierPayments]);

  // Sum totals via the shared util so the summary cards exactly match each card.
  const grandTotals = useMemo(() => {
    if (!suppliers) return { pur: 0, paid: 0, due: 0 };
    return suppliers.reduce((acc, s) => {
      const t = computeSupplierTotals(s as any, purchases as any, allSupplierPayments as any, products as any);
      return { pur: acc.pur + t.totalPur, paid: acc.paid + t.totalPaid, due: acc.due + t.totalDue };
    }, { pur: 0, paid: 0, due: 0 });
  }, [suppliers, purchases, allSupplierPayments, products]);
  const totalPurchaseAmount = grandTotals.pur;
  const totalPaid = grandTotals.paid;
  const totalDue = grandTotals.due;

  return (
    <div className="flex flex-col h-screen animate-fade-in">
      <div className="sticky top-0 z-10 bg-white dark:bg-gray-950 border-b border-border pb-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-3xl font-bold text-foreground">সাপ্লায়ার ম্যানেজমেন্ট</h1>
            <p className="text-muted-foreground mt-1">সাপ্লায়ার, ক্রয় অর্ডার ও হিসাব নিকাশ</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => window.dispatchEvent(new CustomEvent('navigate-to-supplier-returns'))}>
              <RefreshCcw className="h-4 w-4 mr-1" /> সাপ্লায়ার রিটার্ন
            </Button>
            <Button onClick={() => setIsPurchaseDialogOpen(true)} variant="outline">📋 নতুন ক্রয় অর্ডার</Button>
            <Dialog open={isAddDialogOpen || !!editingSupplier} onOpenChange={(open) => {
              if (!open) { setIsAddDialogOpen(false); setEditingSupplier(null); resetForm(); }
            }}>
              <DialogTrigger asChild>
                <Button onClick={() => setIsAddDialogOpen(true)} className="bg-gradient-to-r from-primary to-accent">➕ সাপ্লায়ার যুক্ত</Button>
              </DialogTrigger>
              <DialogContent onPointerDownOutside={(e) => e.preventDefault()}>
                <DialogHeader>
                  <DialogTitle>{editingSupplier ? "সাপ্লায়ার সম্পাদনা" : "নতুন সাপ্লায়ার"}</DialogTitle>
                </DialogHeader>
                <SupplierForm
                  formData={formData}
                  onChange={setFormData}
                  onSubmit={handleSubmit}
                  onCancel={() => { setIsAddDialogOpen(false); setEditingSupplier(null); resetForm(); setFormErrors({}); }}
                  isEditing={!!editingSupplier}
                  errors={formErrors}
                  onClearError={clearFormError}
                  isSubmitting={addSupplierMutation.isPending || updateSupplierMutation.isPending}
                />
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto space-y-4 pb-6">
        {/* Collapsible Summary Cards */}
        <Card className="p-4 mt-4">
          <button onClick={() => setShowSummary(!showSummary)} className="flex items-center justify-between w-full">
            <h3 className="text-sm font-semibold text-foreground">📊 সামারি</h3>
            {showSummary ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          {showSummary && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
              <div className="p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg">
                <p className="text-xs text-muted-foreground">মোট সাপ্লায়ার</p>
                <p className="text-xl font-bold text-blue-600">{suppliers?.length || 0}</p>
              </div>
              <div className="p-3 bg-purple-50 dark:bg-purple-950/20 rounded-lg">
                <p className="text-xs text-muted-foreground">মোট ক্রয়</p>
                <p className="text-xl font-bold text-purple-600">৳{totalPurchaseAmount.toLocaleString('bn-BD')}</p>
              </div>
              <div className="p-3 bg-green-50 dark:bg-green-950/20 rounded-lg">
                <p className="text-xs text-muted-foreground">পরিশোধিত</p>
                <p className="text-xl font-bold text-green-600">৳{totalPaid.toLocaleString('bn-BD')}</p>
              </div>
              <div className="p-3 bg-red-50 dark:bg-red-950/20 rounded-lg">
                <p className="text-xs text-muted-foreground">মোট বাকি</p>
                <p className="text-xl font-bold text-red-600">৳{totalDue.toLocaleString('bn-BD')}</p>
              </div>
            </div>
          )}
        </Card>

        <Tabs defaultValue="suppliers" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="suppliers">সাপ্লায়ার ({suppliers?.length || 0})</TabsTrigger>
            <TabsTrigger value="purchases">ক্রয় অর্ডার ({purchases?.length || 0})</TabsTrigger>
          </TabsList>

          <TabsContent value="suppliers" className="space-y-4">
            {/* Search + Sort */}
            <div className="flex gap-2">
              <Input
                placeholder="🔍 সাপ্লায়ার খুঁজুন..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1"
              />
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="w-36 md:w-44 text-sm">
                  <SelectValue placeholder="সর্ট" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="name-asc">নাম (A-Z)</SelectItem>
                  <SelectItem value="name-desc">নাম (Z-A)</SelectItem>
                  <SelectItem value="due-desc">বাকি (বেশি→কম)</SelectItem>
                  <SelectItem value="due-asc">বাকি (কম→বেশি)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {searchQuery && (
              <p className="text-xs text-muted-foreground">{filteredSuppliers.length}টি সাপ্লায়ার পাওয়া গেছে</p>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredSuppliers?.map((supplier) => {
                const t = getSupplierTotals(supplier.id);
                const due = t.totalDue;
                const isExpanded = expandedCards.has(supplier.id);
                return (
                  <Card key={supplier.id} className={`p-4 card-hover ${t.mismatch ? 'border-amber-500 border-2' : ''}`}>
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-base text-foreground flex items-center gap-1">
                          {supplier.name}
                          {t.mismatch && (
                            <AlertTriangle
                              className="w-4 h-4 text-amber-500"
                              aria-label="ব্যালেন্স অসামঞ্জস্য — লেজার ও ক্রয় অর্ডারের বাকি মিলছে না"
                            />
                          )}
                        </h3>
                        {supplier.phone && <p className="text-sm text-muted-foreground">📞 {supplier.phone}</p>}
                      </div>
                      <div className="flex items-center gap-1">
                        {due > 0 && (
                          <span className="text-xs font-semibold text-red-600 bg-red-50 dark:bg-red-950/20 px-2 py-0.5 rounded-full">
                            ৳{due.toLocaleString('bn-BD')}
                          </span>
                        )}
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => toggleCardExpand(supplier.id)}>
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </Button>
                      </div>
                    </div>

                    {/* Per-supplier mini totals */}
                    <div className="grid grid-cols-3 gap-2 text-[11px] mb-2">
                      <div><span className="text-muted-foreground">ক্রয়:</span> <span className="font-semibold text-primary">৳{t.totalPur.toLocaleString('bn-BD')}</span></div>
                      <div><span className="text-muted-foreground">পরিশোধ:</span> <span className="font-semibold text-green-600">৳{t.totalPaid.toLocaleString('bn-BD')}</span></div>
                      <div><span className="text-muted-foreground">বাকি:</span> <span className={`font-semibold ${due > 0 ? 'text-red-600' : 'text-green-600'}`}>৳{due.toLocaleString('bn-BD')}</span></div>
                    </div>

                    {/* Expandable Details */}
                    {isExpanded && (
                      <div className="space-y-1 mb-3 pt-2 border-t border-border animate-fade-in">
                        {supplier.email && <p className="text-sm text-muted-foreground">📧 {supplier.email}</p>}
                        {supplier.address && <p className="text-sm text-muted-foreground">📍 {supplier.address}</p>}
                        {supplier.notes && <p className="text-sm text-muted-foreground">📝 {supplier.notes}</p>}
                        {t.mismatch && (
                          <p className="text-xs text-amber-600 dark:text-amber-400 font-medium pt-1">
                            ⚠️ অসামঞ্জস্য: ক্রয় অর্ডারের বাকির যোগফল লেজার ব্যালেন্সের সাথে মিলছে না — অনুগ্রহ করে অ্যাডমিনকে জানান।
                          </p>
                        )}
                      </div>
                    )}


                    <div className="flex gap-1.5 flex-wrap">
                      <Button variant="outline" size="sm" onClick={() => setPaymentSupplier(supplier)}>💰 হিসাব</Button>
                      <Button variant="outline" size="sm" onClick={() => startEdit(supplier)}>✏️</Button>
                      <Button variant="destructive" size="sm" onClick={() => {
                        if (confirm("মুছে ফেলবেন?")) deleteSupplierMutation.mutate(supplier.id);
                      }}>🗑️</Button>
                    </div>
                  </Card>
                );
              })}
            </div>
            {(!filteredSuppliers || filteredSuppliers.length === 0) && (
              <Card className="p-12 text-center">
                <div className="text-6xl mb-4">🏭</div>
                <h3 className="text-xl font-semibold mb-2 text-foreground">কোনো সাপ্লায়ার নেই</h3>
                <p className="text-muted-foreground">প্রথম সাপ্লায়ার যুক্ত করুন!</p>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="purchases" className="space-y-4">
            {purchases?.map((purchase) => (
              <Card key={purchase.id} className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-semibold text-foreground">PO #{purchase.purchase_number}</h3>
                    <p className="text-sm text-muted-foreground">সাপ্লায়ার: {purchase.suppliers?.name || "অজানা"}</p>
                    <p className="text-sm text-muted-foreground">{new Date(purchase.created_at).toLocaleDateString('bn-BD')}</p>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                    purchase.status === 'paid' ? 'bg-green-100 text-green-700' :
                    purchase.status === 'received' ? 'bg-blue-100 text-blue-700' :
                    purchase.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                    'bg-red-100 text-red-700'
                  }`}>{purchase.status?.toUpperCase()}</span>
                </div>

                <div className="space-y-1 mb-3">
                  {purchase.purchase_items?.map((item: any) => (
                    <div key={item.id} className="flex justify-between text-sm p-2 bg-muted rounded">
                      <span>{item.products?.name || "প্রোডাক্ট"}</span>
                      <span>পরিমাণ: {item.quantity} | ৳{Number(item.unit_cost).toLocaleString('bn-BD')}</span>
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-between pt-3 border-t text-sm">
                  <div className="space-x-4">
                    <span className="font-semibold">মোট: ৳{Number(purchase.total_amount).toLocaleString('bn-BD')}</span>
                    <span className="text-green-600">পরিশোধ: ৳{Number(purchase.paid_amount || 0).toLocaleString('bn-BD')}</span>
                    <span className="text-red-600">বাকি: ৳{Number(purchase.due_amount || 0).toLocaleString('bn-BD')}</span>
                  </div>
                  {purchase.status === 'pending' && (
                    <Button size="sm" onClick={() => {
                      const items = purchase.purchase_items.map((item: any) => ({
                        ...item, received_quantity: item.quantity,
                      }));
                      receiveItemsMutation.mutate({ purchaseId: purchase.id, items });
                    }} className="bg-gradient-to-r from-primary to-accent">📦 গ্রহণ</Button>
                  )}
                </div>
              </Card>
            ))}
            {(!purchases || purchases.length === 0) && (
              <Card className="p-12 text-center">
                <div className="text-6xl mb-4">📋</div>
                <h3 className="text-xl font-semibold mb-2 text-foreground">কোনো ক্রয় অর্ডার নেই</h3>
                <p className="text-muted-foreground">নতুন ক্রয় অর্ডার তৈরি করুন</p>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>

      <CreatePurchaseDialog
        open={isPurchaseDialogOpen}
        onOpenChange={setIsPurchaseDialogOpen}
        suppliers={suppliers || []}
        products={products || []}
        purchases={purchases || []}
      />

      <SupplierPaymentDialog
        open={!!paymentSupplier}
        onOpenChange={(open) => { if (!open) setPaymentSupplier(null); }}
        supplier={paymentSupplier}
      />
    </div>
  );
}
