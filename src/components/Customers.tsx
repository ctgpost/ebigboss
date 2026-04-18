import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { format } from "date-fns";
import { generateCustomerReport } from "@/utils/customerPdfReport";
import { useShopSettings } from "@/hooks/useShopSettings";
import { ChevronDown, ChevronUp, Filter, Search, CheckSquare } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { CloudinaryImageUpload } from "./CloudinaryImageUpload";
import { getCloudinaryThumbnail } from "@/utils/cloudinary";
import { customerSchema, validateInline } from "@/utils/validation";
import { FieldError } from "@/components/ui/field-error";

export function Customers() {
  const { settings } = useShopSettings();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<any>(null);
  const [selectedCustomerDue, setSelectedCustomerDue] = useState<any>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [paymentNotes, setPaymentNotes] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<string>("name-asc");
  const [showDueOnly, setShowDueOnly] = useState(false);
  const [showDueSection, setShowDueSection] = useState(true);
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const [selectedDueSales, setSelectedDueSales] = useState<Set<string>>(new Set());
  const [showBulkPayment, setShowBulkPayment] = useState(false);
  const [bulkPaymentMethod, setBulkPaymentMethod] = useState("cash");
  const [bulkPaymentNotes, setBulkPaymentNotes] = useState("");
  const [paymentErrors, setPaymentErrors] = useState<{ amount?: string; method?: string }>({});
  const [bulkPaymentErrors, setBulkPaymentErrors] = useState<{ method?: string; selection?: string }>({});
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    address: "",
    notes: "",
    image_url: "",
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const clearError = (key: string) =>
    setFormErrors((p) => {
      if (!p[key]) return p;
      const next = { ...p };
      delete next[key];
      return next;
    });

  const queryClient = useQueryClient();

  const { data: customers } = useQuery({
    queryKey: ["customers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("customers").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  // Fetch ALL sales for customers (for PDF reports)
  const { data: allCustomerSales } = useQuery({
    queryKey: ["all-customer-sales"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select("id, customer_id, total_amount, paid_amount, due_amount, created_at, instant_customer_name, instant_customer_phone, sale_items(quantity, unit_price, products(name))")
        .not("customer_id", "is", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Fetch sales with dues for all customers
  const { data: salesWithDues } = useQuery({
    queryKey: ["sales-with-dues"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select("id, customer_id, total_amount, paid_amount, due_amount, created_at, instant_customer_name, instant_customer_phone, sale_items(quantity, unit_price, products(name))")
        .gt("due_amount", 0)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Fetch payment history
  const { data: payments } = useQuery({
    queryKey: ["payments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const addMutation = useMutation({
    mutationFn: async (data: any) => {
      const { error } = await supabase.from("customers").insert([data]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      toast.success("কাস্টমার সফলভাবে যুক্ত হয়েছে!");
      setIsAddDialogOpen(false);
      resetForm();
    },
    onError: (error: any) => {
      toast.error(error.message || "কাস্টমার যুক্ত করতে ব্যর্থ");
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const { error } = await supabase.from("customers").update(data).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      toast.success("কাস্টমার আপডেট হয়েছে!");
      setEditingCustomer(null);
      resetForm();
    },
    onError: (error: any) => {
      toast.error(error.message || "আপডেট করতে ব্যর্থ");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("customers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      toast.success("কাস্টমার মুছে ফেলা হয়েছে!");
    },
    onError: (error: any) => {
      toast.error(error.message || "মুছতে ব্যর্থ");
    },
  });

  // Collect due payment
  const collectPaymentMutation = useMutation({
    mutationFn: async ({ saleId, customerId, amount, method, notes }: any) => {
      const { data: { user } } = await supabase.auth.getUser();

      // Insert payment record
      const { error: paymentError } = await supabase.from("payments").insert([{
        sale_id: saleId,
        customer_id: customerId,
        amount,
        payment_method: method,
        notes,
        collected_by: user?.id,
      }]);
      if (paymentError) throw paymentError;

      // Update sale paid_amount and due_amount
      const { data: sale, error: fetchError } = await supabase
        .from("sales")
        .select("paid_amount, due_amount, total_amount")
        .eq("id", saleId)
        .single();
      if (fetchError) throw fetchError;

      const newPaid = Number(sale.paid_amount) + amount;
      const newDue = Math.max(0, Number(sale.total_amount) - newPaid);

      const { error: updateError } = await supabase
        .from("sales")
        .update({ paid_amount: newPaid, due_amount: newDue })
        .eq("id", saleId);
      if (updateError) throw updateError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales-with-dues"] });
      queryClient.invalidateQueries({ queryKey: ["payments"] });
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      toast.success("বাকি আদায় সফল হয়েছে!");
      setPaymentAmount("");
      setPaymentNotes("");
      setSelectedCustomerDue(null);
    },
    onError: (error: any) => {
      toast.error(error.message || "বাকি আদায় করতে ব্যর্থ");
    },
  });

  // Bulk payment mutation
  const bulkCollectMutation = useMutation({
    mutationFn: async ({ saleIds, method, notes }: { saleIds: string[], method: string, notes: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      for (const saleId of saleIds) {
        const sale = salesWithDues?.find(s => s.id === saleId);
        if (!sale) continue;
        const amount = Number(sale.due_amount);

        await supabase.from("payments").insert([{
          sale_id: saleId,
          customer_id: sale.customer_id,
          amount,
          payment_method: method,
          notes,
          collected_by: user?.id,
        }]);

        await supabase.from("sales").update({
          paid_amount: Number(sale.total_amount),
          due_amount: 0,
        }).eq("id", saleId);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales-with-dues"] });
      queryClient.invalidateQueries({ queryKey: ["payments"] });
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      toast.success(`${selectedDueSales.size}টি বিক্রয়ের বাকি সম্পূর্ণ আদায় হয়েছে!`);
      setSelectedDueSales(new Set());
      setShowBulkPayment(false);
      setBulkPaymentNotes("");
    },
    onError: (error: any) => {
      toast.error(error.message || "বাল্ক আদায় করতে ব্যর্থ");
    },
  });

  const resetForm = () => {
    setFormData({ name: "", email: "", phone: "", address: "", notes: "", image_url: "" });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const result = validateInline(customerSchema, formData);
    setFormErrors(result.errors);
    if (!result.success) {
      toast.error("ফর্মে ভুল আছে — লাল চিহ্নিত ফিল্ডগুলো ঠিক করুন");
      return;
    }
    if (editingCustomer) {
      updateMutation.mutate({ id: editingCustomer.id, data: formData });
    } else {
      addMutation.mutate(formData);
    }
  };

  const startEdit = (customer: any) => {
    setEditingCustomer(customer);
    setFormData({
      name: customer.name || "",
      email: customer.email || "",
      phone: customer.phone || "",
      address: customer.address || "",
      notes: customer.notes || "",
      image_url: customer.image_url || "",
    });
  };

  const handleCollectPayment = (sale: any) => {
    const amount = parseFloat(paymentAmount);
    const errs: typeof paymentErrors = {};
    if (!paymentAmount || isNaN(amount) || amount <= 0) {
      errs.amount = "সঠিক টাকার পরিমাণ দিন (০ এর বেশি)";
    } else if (amount > Number(sale.due_amount)) {
      errs.amount = `বাকির (৳${Number(sale.due_amount).toLocaleString('bn-BD')}) চেয়ে বেশি আদায় করা যাবে না`;
    }
    if (!paymentMethod) {
      errs.method = "পেমেন্ট পদ্ধতি সিলেক্ট করুন";
    }
    setPaymentErrors(errs);
    if (Object.keys(errs).length > 0) return;
    collectPaymentMutation.mutate({
      saleId: sale.id,
      customerId: sale.customer_id,
      amount,
      method: paymentMethod,
      notes: paymentNotes,
    });
  };

  // Calculate customer-level dues
  const getCustomerDues = (customerId: string) => {
    const customerSales = salesWithDues?.filter(s => s.customer_id === customerId) || [];
    return customerSales.reduce((sum, s) => sum + Number(s.due_amount), 0);
  };

  const toggleCardExpand = (id: string) => {
    setExpandedCards(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const filteredCustomers = useMemo(() => {
    if (!customers) return [];
    let filtered = customers.filter(c => {
      const matchesSearch = !searchQuery ||
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.phone?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.email?.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesDue = !showDueOnly || getCustomerDues(c.id) > 0;
      return matchesSearch && matchesDue;
    });

    const [field, dir] = sortBy.split("-");
    filtered.sort((a, b) => {
      let cmp = 0;
      if (field === "name") cmp = a.name.localeCompare(b.name);
      else if (field === "due") cmp = getCustomerDues(a.id) - getCustomerDues(b.id);
      else if (field === "purchases") cmp = Number(a.total_purchases || 0) - Number(b.total_purchases || 0);
    return dir === "desc" ? -cmp : cmp;
    });
    return filtered;
  }, [customers, searchQuery, sortBy, salesWithDues, showDueOnly]);

  // Get total transactions for a customer
  const getCustomerTotalTransactions = (customerId: string) => {
    return Number(customers?.find(c => c.id === customerId)?.total_purchases || 0);
  };

  return (
    <div className="flex flex-col h-screen animate-fade-in">
      {/* Fixed Header */}
      <div className="sticky top-0 z-10 bg-white dark:bg-gray-950 border-b border-border pb-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground">কাস্টমার</h1>
            <p className="text-sm text-muted-foreground mt-1">কাস্টমার ও বাকি হিসাব ব্যবস্থাপনা</p>
          </div>
          <Dialog open={isAddDialogOpen || !!editingCustomer} onOpenChange={(open) => {
            if (!open) {
              setIsAddDialogOpen(false);
              setEditingCustomer(null);
              resetForm();
            }
          }}>
            <DialogTrigger asChild>
              <Button onClick={() => setIsAddDialogOpen(true)} className="bg-gradient-to-r from-primary to-accent">
                ➕ কাস্টমার যুক্ত
              </Button>
            </DialogTrigger>
            <Button
              variant="outline"
              onClick={() => window.dispatchEvent(new CustomEvent('navigate-to-customer-details'))}
              className="border-primary text-primary"
            >
              📋 ডিটেইলস
            </Button>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingCustomer ? "কাস্টমার সম্পাদনা" : "নতুন কাস্টমার যুক্ত"}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">নাম *</label>
                  <Input
                    value={formData.name}
                    onChange={(e) => { setFormData({ ...formData, name: e.target.value }); clearError("name"); }}
                    aria-invalid={!!formErrors.name}
                  />
                  <FieldError message={formErrors.name} />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">ইমেইল</label>
                  <Input
                    type="email"
                    value={formData.email}
                    onChange={(e) => { setFormData({ ...formData, email: e.target.value }); clearError("email"); }}
                    aria-invalid={!!formErrors.email}
                  />
                  <FieldError message={formErrors.email} />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">ফোন</label>
                  <Input
                    value={formData.phone}
                    onChange={(e) => { setFormData({ ...formData, phone: e.target.value }); clearError("phone"); }}
                    type="tel"
                    inputMode="numeric"
                    maxLength={11}
                    placeholder="01XXXXXXXXX"
                    aria-invalid={!!formErrors.phone}
                  />
                  <FieldError message={formErrors.phone} />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">ঠিকানা</label>
                  <Input
                    value={formData.address}
                    onChange={(e) => { setFormData({ ...formData, address: e.target.value }); clearError("address"); }}
                    aria-invalid={!!formErrors.address}
                  />
                  <FieldError message={formErrors.address} />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">নোট</label>
                  <Input
                    value={formData.notes}
                    onChange={(e) => { setFormData({ ...formData, notes: e.target.value }); clearError("notes"); }}
                    aria-invalid={!!formErrors.notes}
                  />
                  <FieldError message={formErrors.notes} />
                </div>
                <div>
                  <CloudinaryImageUpload
                    currentImageUrl={formData.image_url}
                    onUpload={(url) => setFormData({ ...formData, image_url: url })}
                    folder="customers"
                    label="📷 কাস্টমারের ছবি"
                  />
                </div>
                <div className="flex gap-2 justify-end">
                  <Button type="button" variant="outline" onClick={() => { setIsAddDialogOpen(false); setEditingCustomer(null); resetForm(); }}>
                    বাতিল
                  </Button>
                  <Button type="submit" className="bg-gradient-to-r from-primary to-accent">
                    {editingCustomer ? "আপডেট" : "যুক্ত"} করুন
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
        {/* Search and Sort */}
        <div className="flex gap-2 mt-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="🔍 কাস্টমার খুঁজুন (নাম, ফোন, ইমেইল)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Button
            variant={showDueOnly ? "default" : "outline"}
            size="sm"
            onClick={() => setShowDueOnly(!showDueOnly)}
            className={`shrink-0 text-xs ${showDueOnly ? "bg-destructive hover:bg-destructive/90" : ""}`}
          >
            💰 বাকিদার
          </Button>
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-32 md:w-40 text-sm">
              <SelectValue placeholder="সর্ট" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="name-asc">নাম (A-Z)</SelectItem>
              <SelectItem value="name-desc">নাম (Z-A)</SelectItem>
              <SelectItem value="due-desc">বাকি (বেশি→কম)</SelectItem>
              <SelectItem value="due-asc">বাকি (কম→বেশি)</SelectItem>
              <SelectItem value="purchases-desc">ক্রয় (বেশি→কম)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {searchQuery && (
          <p className="text-xs text-muted-foreground mt-2">{filteredCustomers.length}টি কাস্টমার পাওয়া গেছে</p>
        )}
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto pb-6 space-y-6">
        {/* Due Summary */}
        {salesWithDues && salesWithDues.length > 0 && (
          <Card className="p-4 md:p-6 border-destructive/30 bg-destructive/5">
            <button onClick={() => setShowDueSection(!showDueSection)} className="flex items-center justify-between w-full">
              <h2 className="text-lg font-bold text-foreground">📋 বাকি হিসাব সারাংশ</h2>
              {showDueSection ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
            </button>
            {showDueSection && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-4">
              <div className="text-center p-3 bg-background rounded-lg">
                <p className="text-2xl font-bold text-destructive">
                  ৳{salesWithDues.reduce((sum, s) => sum + Number(s.due_amount), 0).toLocaleString('bn-BD')}
                </p>
                <p className="text-xs text-muted-foreground">মোট বাকি</p>
              </div>
              <div className="text-center p-3 bg-background rounded-lg">
                <p className="text-2xl font-bold text-primary">{salesWithDues.length}</p>
                <p className="text-xs text-muted-foreground">বাকি বিক্রয়</p>
              </div>
            </div>
            )}
          </Card>
        )}

        {/* Due Sales List */}
        {salesWithDues && salesWithDues.length > 0 && (
          <Card className="p-4 md:p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-foreground">💰 বাকি আদায়</h2>
              <div className="flex items-center gap-2">
                {selectedDueSales.size > 0 && (
                  <Button
                    size="sm"
                    className="bg-green-600 hover:bg-green-700"
                    onClick={() => setShowBulkPayment(true)}
                  >
                    <CheckSquare className="w-4 h-4 mr-1" />
                    {selectedDueSales.size}টি একসাথে আদায়
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (selectedDueSales.size === salesWithDues.length) {
                      setSelectedDueSales(new Set());
                    } else {
                      setSelectedDueSales(new Set(salesWithDues.map(s => s.id)));
                    }
                  }}
                  className="text-xs"
                >
                  {selectedDueSales.size === salesWithDues.length ? "সব বাদ দিন" : "সব নির্বাচন"}
                </Button>
              </div>
            </div>
            <div className="space-y-3">
              {salesWithDues.map((sale) => {
                const customerName = customers?.find(c => c.id === sale.customer_id)?.name || sale.instant_customer_name || "অজানা";
                const customerPhone = customers?.find(c => c.id === sale.customer_id)?.phone || sale.instant_customer_phone || "";
                const isSelected = selectedDueSales.has(sale.id);

                return (
                  <div key={sale.id} className={`border rounded-lg p-3 md:p-4 ${isSelected ? 'border-green-500 bg-green-50 dark:bg-green-950/20' : 'border-border'}`}>
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                      <div className="flex gap-3 flex-1">
                        <div className="pt-1">
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={(checked) => {
                              setSelectedDueSales(prev => {
                                const next = new Set(prev);
                                if (checked) next.add(sale.id); else next.delete(sale.id);
                                return next;
                              });
                            }}
                          />
                        </div>
                        <div className="flex-1 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-foreground">{customerName}</span>
                            {customerPhone && <span className="text-xs text-muted-foreground">📞 {customerPhone}</span>}
                            <Badge variant="outline" className="text-xs">#{sale.id.slice(0, 8)}</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(sale.created_at), "dd MMM yyyy")} •
                            মোট: ৳{Number(sale.total_amount).toLocaleString('bn-BD')} •
                            পরিশোধিত: ৳{Number(sale.paid_amount).toLocaleString('bn-BD')}
                          </p>
                          <div className="text-sm">
                            {(sale.sale_items as any[])?.map((item: any, idx: number) => (
                              <span key={idx} className="text-muted-foreground">
                                {item.products?.name}{idx < (sale.sale_items as any[]).length - 1 ? ", " : ""}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <p className="text-lg font-bold text-destructive">৳{Number(sale.due_amount).toLocaleString('bn-BD')}</p>
                          <p className="text-xs text-muted-foreground">বাকি</p>
                        </div>
                        <Button
                          size="sm"
                          onClick={() => {
                            setSelectedCustomerDue(sale);
                            setPaymentAmount(String(sale.due_amount));
                          }}
                          className="bg-green-600 hover:bg-green-700 whitespace-nowrap"
                        >
                          💵 আদায়
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {/* Customer Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
          {filteredCustomers?.map((customer) => {
            const totalDue = getCustomerDues(customer.id);
            const isExpanded = expandedCards.has(customer.id);
            return (
              <Card key={customer.id} className="p-4 md:p-5 card-hover">
                <div className="space-y-2">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-base text-foreground">{customer.name}</h3>
                      {customer.phone && <p className="text-sm text-muted-foreground">📞 {customer.phone}</p>}
                    </div>
                    <div className="flex items-center gap-1">
                      {totalDue > 0 && (
                        <Badge variant="destructive" className="text-xs">
                          ৳{totalDue.toLocaleString('bn-BD')}
                        </Badge>
                      )}
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => toggleCardExpand(customer.id)}>
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </Button>
                    </div>
                  </div>

                  {/* Badges */}
                  <div className="flex gap-1.5 flex-wrap">
                    {Number(customer.total_purchases || 0) > 0 && (
                      <Badge variant="secondary" className="text-[10px]">
                        লেনদেন: ৳{Number(customer.total_purchases).toLocaleString('bn-BD')}
                      </Badge>
                    )}
                    {Number(customer.purchase_count || 0) > 0 && (
                      <Badge variant="outline" className="text-[10px]">
                        {customer.purchase_count} বার ক্রয়
                      </Badge>
                    )}
                  </div>

                  {/* Expandable Details */}
                  {isExpanded && (
                    <div className="space-y-2 pt-2 border-t border-border animate-fade-in">
                      {customer.email && <p className="text-sm text-muted-foreground">📧 {customer.email}</p>}
                      {customer.address && <p className="text-sm text-muted-foreground">📍 {customer.address}</p>}
                      {customer.notes && <p className="text-sm text-muted-foreground">📝 {customer.notes}</p>}
                    </div>
                  )}

                  <div className="flex gap-1.5 pt-2">
                    <Button variant="outline" size="sm" onClick={() => startEdit(customer)} className="flex-1 text-xs">
                      ✏️ সম্পাদনা
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => {
                      const custSales = allCustomerSales?.filter(s => s.customer_id === customer.id) || [];
                      const custPayments = payments?.filter(p => p.customer_id === customer.id) || [];
                      const totalSalesAmt = custSales.reduce((sum, s) => sum + Number(s.total_amount), 0);
                      const totalPaidAmt = custPayments.reduce((sum, p) => sum + Number(p.amount), 0);
                      const totalDueAmt = custSales.reduce((sum, s) => sum + Number(s.due_amount), 0);
                      generateCustomerReport({
                        customer,
                        sales: custSales,
                        payments: custPayments,
                        totalSales: totalSalesAmt,
                        totalPaid: totalPaidAmt,
                        totalDue: totalDueAmt,
                        shopName: settings.shop_name,
                      });
                      toast.success("PDF রিপোর্ট ডাউনলোড হচ্ছে!");
                    }} className="flex-1 text-xs">
                      📄 PDF
                    </Button>
                    <Button variant="destructive" size="sm" onClick={() => {
                      if (confirm("আপনি কি নিশ্চিত?")) deleteMutation.mutate(customer.id);
                    }} className="text-xs">
                      🗑️
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}

          {filteredCustomers.length === 0 && (
            <Card className="p-12 text-center col-span-full">
              <div className="text-6xl mb-4">👥</div>
              <h3 className="text-xl font-semibold mb-2 text-foreground">{searchQuery ? "কোনো কাস্টমার পাওয়া যায়নি" : "কোনো কাস্টমার নেই"}</h3>
              <p className="text-muted-foreground">{searchQuery ? "অন্য শব্দ দিয়ে খুঁজুন" : "প্রথম কাস্টমার যুক্ত করুন!"}</p>
            </Card>
          )}
        </div>
      </div>

      {/* Collect Payment Dialog */}
      <Dialog open={!!selectedCustomerDue} onOpenChange={(open) => {
        if (!open) {
          setSelectedCustomerDue(null);
          setPaymentAmount("");
          setPaymentNotes("");
        }
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>💰 বাকি আদায়</DialogTitle>
          </DialogHeader>
          {selectedCustomerDue && (
            <div className="space-y-4">
              <div className="bg-muted/50 p-3 rounded-lg space-y-1">
                <p className="text-sm">
                  <span className="font-semibold">ইনভয়েস:</span> #{selectedCustomerDue.id.slice(0, 8)}
                </p>
                <p className="text-sm">
                  <span className="font-semibold">মোট:</span> ৳{Number(selectedCustomerDue.total_amount).toLocaleString('bn-BD')}
                </p>
                <p className="text-sm">
                  <span className="font-semibold">পূর্বে পরিশোধিত:</span> ৳{Number(selectedCustomerDue.paid_amount).toLocaleString('bn-BD')}
                </p>
                <p className="text-sm font-bold text-destructive">
                  বাকি: ৳{Number(selectedCustomerDue.due_amount).toLocaleString('bn-BD')}
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">আদায়ের পরিমাণ *</label>
                <Input
                  type="number"
                  value={paymentAmount}
                  onChange={(e) => {
                    setPaymentAmount(e.target.value);
                    if (paymentErrors.amount) setPaymentErrors(p => ({ ...p, amount: undefined }));
                  }}
                  placeholder="টাকার পরিমাণ"
                  max={Number(selectedCustomerDue.due_amount)}
                  aria-invalid={!!paymentErrors.amount}
                />
                <FieldError message={paymentErrors.amount} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">পেমেন্ট পদ্ধতি</label>
                <Select value={paymentMethod} onValueChange={(v) => {
                  setPaymentMethod(v);
                  if (paymentErrors.method) setPaymentErrors(p => ({ ...p, method: undefined }));
                }}>
                  <SelectTrigger aria-invalid={!!paymentErrors.method}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">💵 নগদ</SelectItem>
                    <SelectItem value="card">💳 কার্ড</SelectItem>
                    <SelectItem value="mobile">📱 মোবাইল</SelectItem>
                  </SelectContent>
                </Select>
                <FieldError message={paymentErrors.method} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">নোট (ঐচ্ছিক)</label>
                <Input
                  value={paymentNotes}
                  onChange={(e) => setPaymentNotes(e.target.value)}
                  placeholder="আদায়ের নোট"
                />
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setSelectedCustomerDue(null)}>বাতিল</Button>
                <Button
                  onClick={() => handleCollectPayment(selectedCustomerDue)}
                  className="bg-green-600 hover:bg-green-700"
                  disabled={collectPaymentMutation.isPending}
                >
                  {collectPaymentMutation.isPending ? "প্রক্রিয়াকরণ..." : "✓ আদায় করুন"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Bulk Payment Dialog */}
      <Dialog open={showBulkPayment} onOpenChange={setShowBulkPayment}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>💰 একসাথে বাকি আদায় ({selectedDueSales.size}টি বিক্রয়)</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-muted/50 p-3 rounded-lg space-y-1">
              <p className="text-sm font-bold text-destructive">
                মোট আদায়যোগ্য: ৳{salesWithDues?.filter(s => selectedDueSales.has(s.id)).reduce((sum, s) => sum + Number(s.due_amount), 0).toLocaleString('bn-BD')}
              </p>
              <p className="text-xs text-muted-foreground">{selectedDueSales.size}টি বিক্রয়ের সম্পূর্ণ বাকি আদায় হবে</p>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">পেমেন্ট পদ্ধতি</label>
              <Select value={bulkPaymentMethod} onValueChange={setBulkPaymentMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">💵 নগদ</SelectItem>
                  <SelectItem value="card">💳 কার্ড</SelectItem>
                  <SelectItem value="mobile">📱 মোবাইল</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">নোট (ঐচ্ছিক)</label>
              <Input value={bulkPaymentNotes} onChange={(e) => setBulkPaymentNotes(e.target.value)} placeholder="বাল্ক আদায়ের নোট" />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowBulkPayment(false)}>বাতিল</Button>
              <Button
                onClick={() => bulkCollectMutation.mutate({
                  saleIds: Array.from(selectedDueSales),
                  method: bulkPaymentMethod,
                  notes: bulkPaymentNotes,
                })}
                className="bg-green-600 hover:bg-green-700"
                disabled={bulkCollectMutation.isPending}
              >
                {bulkCollectMutation.isPending ? "প্রক্রিয়াকরণ..." : `✓ ${selectedDueSales.size}টি আদায় করুন`}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
