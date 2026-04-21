import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { format } from "date-fns";
import { bn } from "date-fns/locale";
import { generateCustomerReport } from "@/utils/customerPdfReport";
import { useShopSettings } from "@/hooks/useShopSettings";
import { ChevronDown, ChevronUp, FileText, User, Wallet, CreditCard, ArrowDownLeft, BarChart3 } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ZoomableImage } from "@/components/ui/zoomable-image";

export function CustomerDetails() {
  const { settings } = useShopSettings();
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [selectedSale, setSelectedSale] = useState<any>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [paymentNotes, setPaymentNotes] = useState("");
  const [showTransactions, setShowTransactions] = useState(true);
  const [showDueSales, setShowDueSales] = useState(true);
  const [showPaymentHistory, setShowPaymentHistory] = useState(true);

  const queryClient = useQueryClient();

  const { data: customers } = useQuery({
    queryKey: ["customers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("customers").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const selectedCustomer = customers?.find(c => c.id === selectedCustomerId);

  // All sales for selected customer
  const { data: customerSales } = useQuery({
    queryKey: ["customer-sales", selectedCustomerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select("*, sale_items(quantity, unit_price, total_price, products(name, imei, condition))")
        .eq("customer_id", selectedCustomerId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!selectedCustomerId,
  });

  // Payments for selected customer
  const { data: customerPayments } = useQuery({
    queryKey: ["customer-payments", selectedCustomerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select("*")
        .eq("customer_id", selectedCustomerId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!selectedCustomerId,
  });

  const collectPaymentMutation = useMutation({
    mutationFn: async ({ saleId, customerId, amount, method, notes }: any) => {
      const { data: { user } } = await supabase.auth.getUser();

      const { error: paymentError } = await supabase.from("payments").insert([{
        sale_id: saleId,
        customer_id: customerId,
        amount,
        payment_method: method,
        notes,
        collected_by: user?.id,
      }]);
      if (paymentError) throw paymentError;

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
      queryClient.invalidateQueries({ queryKey: ["customer-sales", selectedCustomerId] });
      queryClient.invalidateQueries({ queryKey: ["customer-payments", selectedCustomerId] });
      queryClient.invalidateQueries({ queryKey: ["sales-with-dues"] });
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      queryClient.invalidateQueries({ queryKey: ["payments"] });
      toast.success("বাকি আদায় সফল হয়েছে!");
      setPaymentDialogOpen(false);
      setSelectedSale(null);
      setPaymentAmount("");
      setPaymentNotes("");
    },
    onError: (error: any) => {
      toast.error(error.message || "বাকি আদায় করতে ব্যর্থ");
    },
  });

  const handleCollectPayment = () => {
    const amount = parseFloat(paymentAmount);
    if (!amount || amount <= 0) {
      toast.error("সঠিক পরিমাণ লিখুন");
      return;
    }
    if (amount > Number(selectedSale.due_amount)) {
      toast.error("বাকির চেয়ে বেশি আদায় করা যাবে না");
      return;
    }
    collectPaymentMutation.mutate({
      saleId: selectedSale.id,
      customerId: selectedCustomerId,
      amount,
      method: paymentMethod,
      notes: paymentNotes,
    });
  };

  // Summary calculations
  const summary = useMemo(() => {
    if (!customerSales) return { totalSales: 0, totalPaid: 0, totalDue: 0, saleCount: 0, dueSales: [] };
    const totalSales = customerSales.reduce((s, sale) => s + Number(sale.total_amount), 0);
    const totalPaid = customerSales.reduce((s, sale) => s + Number(sale.paid_amount), 0);
    const totalDue = customerSales.reduce((s, sale) => s + Number(sale.due_amount), 0);
    const dueSales = customerSales.filter(s => Number(s.due_amount) > 0);
    return { totalSales, totalPaid, totalDue, saleCount: customerSales.length, dueSales };
  }, [customerSales]);

  const totalPaymentsCollected = useMemo(() => {
    return customerPayments?.reduce((s, p) => s + Number(p.amount), 0) || 0;
  }, [customerPayments]);

  // Monthly chart data
  const monthlyChartData = useMemo(() => {
    if (!customerSales) return [];
    const monthMap: Record<string, { month: string, sales: number, paid: number, due: number }> = {};
    customerSales.forEach(sale => {
      const monthKey = format(new Date(sale.created_at), "yyyy-MM");
      const monthLabel = format(new Date(sale.created_at), "MMM yy", { locale: bn });
      if (!monthMap[monthKey]) {
        monthMap[monthKey] = { month: monthLabel, sales: 0, paid: 0, due: 0 };
      }
      monthMap[monthKey].sales += Number(sale.total_amount);
      monthMap[monthKey].paid += Number(sale.paid_amount);
      monthMap[monthKey].due += Number(sale.due_amount);
    });
    return Object.entries(monthMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, v]) => v);
  }, [customerSales]);

  return (
    <div className="flex flex-col h-screen animate-fade-in">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white dark:bg-gray-950 border-b border-border pb-4">
        <h1 className="text-2xl md:text-3xl font-bold text-foreground">📋 কাস্টমার ডিটেইলস</h1>
        <p className="text-sm text-muted-foreground mt-1">কাস্টমার নির্বাচন করে সম্পূর্ণ লেনদেন ও বাকি হিসাব দেখুন</p>
        
        {/* Customer Dropdown */}
        <div className="mt-3 flex gap-2 items-end">
          <div className="flex-1">
            <label className="block text-sm font-medium mb-1">কাস্টমার নির্বাচন করুন</label>
            <Select value={selectedCustomerId} onValueChange={setSelectedCustomerId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="🔽 কাস্টমার বেছে নিন..." />
              </SelectTrigger>
              <SelectContent>
                {customers?.map(c => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name} {c.phone ? `(${c.phone})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {selectedCustomer && (
            <Button
              variant="outline"
              onClick={() => {
                const custSales = customerSales || [];
                const custPayments = customerPayments || [];
                generateCustomerReport({
                  customer: selectedCustomer,
                  sales: custSales,
                  payments: custPayments,
                  totalSales: summary.totalSales,
                  totalPaid: summary.totalPaid,
                  totalDue: summary.totalDue,
                  shopName: settings.shop_name,
                });
                toast.success("PDF রিপোর্ট ডাউনলোড হচ্ছে!");
              }}
              className="shrink-0"
            >
              <FileText className="w-4 h-4 mr-1" /> PDF
            </Button>
          )}
        </div>
      </div>

      {!selectedCustomerId ? (
        <div className="flex-1 flex items-center justify-center">
          <Card className="p-12 text-center max-w-md">
            <User className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-xl font-semibold mb-2">কাস্টমার নির্বাচন করুন</h3>
            <p className="text-muted-foreground">উপরের ড্রপডাউন থেকে একজন কাস্টমার বেছে নিন</p>
          </Card>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto pb-6 space-y-4 mt-4">
          {/* Customer Info */}
          <Card className="p-4 md:p-5">
            <div className="flex items-start gap-4 flex-wrap">
              {/* Customer photo with zoom */}
              {(selectedCustomer as any)?.image_url && (
                <ZoomableImage
                  url={(selectedCustomer as any).image_url}
                  alt={selectedCustomer?.name || "Customer"}
                  displayWidth={100}
                  displayHeight={130}
                />
              )}
              <div className="flex-1 min-w-0">
                <h2 className="text-xl font-bold text-foreground">{selectedCustomer?.name}</h2>
                {selectedCustomer?.phone && <p className="text-sm text-muted-foreground">📞 {selectedCustomer.phone}</p>}
                {selectedCustomer?.email && <p className="text-sm text-muted-foreground">📧 {selectedCustomer.email}</p>}
                {selectedCustomer?.address && <p className="text-sm text-muted-foreground">📍 {selectedCustomer.address}</p>}
              </div>
              {summary.totalDue > 0 && (
                <Badge variant="destructive" className="text-lg px-3 py-1 self-start">
                  বাকি: ৳{summary.totalDue.toLocaleString('bn-BD')}
                </Badge>
              )}
            </div>
          </Card>

          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="p-3 text-center">
              <Wallet className="w-5 h-5 mx-auto mb-1 text-primary" />
              <p className="text-lg font-bold text-primary">৳{summary.totalSales.toLocaleString('bn-BD')}</p>
              <p className="text-xs text-muted-foreground">মোট লেনদেন</p>
            </Card>
            <Card className="p-3 text-center">
              <CreditCard className="w-5 h-5 mx-auto mb-1 text-green-600" />
              <p className="text-lg font-bold text-green-600">৳{summary.totalPaid.toLocaleString('bn-BD')}</p>
              <p className="text-xs text-muted-foreground">পরিশোধিত</p>
            </Card>
            <Card className="p-3 text-center">
              <ArrowDownLeft className="w-5 h-5 mx-auto mb-1 text-destructive" />
              <p className="text-lg font-bold text-destructive">৳{summary.totalDue.toLocaleString('bn-BD')}</p>
              <p className="text-xs text-muted-foreground">মোট বাকি</p>
            </Card>
            <Card className="p-3 text-center">
              <p className="text-lg font-bold text-foreground">{summary.saleCount}</p>
              <p className="text-xs text-muted-foreground">মোট বিক্রয়</p>
            </Card>
          </div>

          {/* Monthly Chart */}
          {monthlyChartData.length > 0 && (
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <BarChart3 className="w-5 h-5 text-primary" />
                <h3 className="text-lg font-bold text-foreground">📊 মাসিক লেনদেন চার্ট</h3>
              </div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlyChartData}>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `৳${(v/1000).toFixed(0)}k`} />
                    <Tooltip
                      formatter={(value: number, name: string) => [
                        `৳${value.toLocaleString('bn-BD')}`,
                        name === 'sales' ? 'মোট বিক্রয়' : name === 'paid' ? 'পরিশোধিত' : 'বাকি'
                      ]}
                    />
                    <Bar dataKey="sales" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="sales" />
                    <Bar dataKey="paid" fill="#22c55e" radius={[4, 4, 0, 0]} name="paid" />
                    <Bar dataKey="due" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} name="due" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="flex justify-center gap-4 mt-2 text-xs">
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-primary inline-block"></span> বিক্রয়</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-green-500 inline-block"></span> পরিশোধিত</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-destructive inline-block"></span> বাকি</span>
              </div>
            </Card>
          )}


          {/* Tabs: Ledger (combined timeline) + Per-Sale Due */}
          <Tabs defaultValue="ledger" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="ledger">📒 সম্পূর্ণ লেজার</TabsTrigger>
              <TabsTrigger value="due">💰 বাকি বিক্রয় ({summary.dueSales.length})</TabsTrigger>
            </TabsList>

            {/* LEDGER TAB — combined chronological timeline with running balance */}
            <TabsContent value="ledger" className="space-y-2 mt-3">
              <Card className="p-4">
                <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                  <h3 className="text-lg font-bold text-foreground">📒 লেনদেন টাইমলাইন</h3>
                  <Button
                    size="sm"
                    className="bg-green-600 hover:bg-green-700"
                    onClick={() => {
                      // General payment — pick first due sale, else latest sale
                      const target = summary.dueSales[0] || customerSales?.[0];
                      if (!target) {
                        toast.error("কোনো বিক্রয় নেই");
                        return;
                      }
                      setSelectedSale(target);
                      setPaymentAmount("");
                      setPaymentDialogOpen(true);
                    }}
                    disabled={!customerSales?.length}
                  >
                    ➕ নতুন পেমেন্ট নিন
                  </Button>
                </div>
                {(() => {
                  // Build combined timeline
                  type LedgerRow = { date: string; type: 'sale' | 'payment'; label: string; amount: number; sign: 1 | -1; balance?: number; method?: string };
                  const rows: LedgerRow[] = [];
                  customerSales?.forEach(s => {
                    rows.push({
                      date: s.created_at,
                      type: 'sale',
                      label: `বিক্রয় #${s.id.slice(0, 8)}`,
                      amount: Number(s.total_amount),
                      sign: 1, // increases due
                    });
                    // Initial paid amount at sale time
                    if (Number(s.paid_amount) > 0) {
                      rows.push({
                        date: s.created_at,
                        type: 'payment',
                        label: `প্রাথমিক পরিশোধ #${s.id.slice(0, 8)}`,
                        amount: Number(s.paid_amount),
                        sign: -1,
                        method: s.payment_method,
                      });
                    }
                  });
                  customerPayments?.forEach(p => {
                    rows.push({
                      date: p.created_at,
                      type: 'payment',
                      label: `বাকি আদায় #${p.sale_id.slice(0, 8)}`,
                      amount: Number(p.amount),
                      sign: -1,
                      method: p.payment_method,
                    });
                  });
                  rows.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
                  let bal = 0;
                  rows.forEach(r => { bal += r.sign * r.amount; r.balance = bal; });

                  if (rows.length === 0) {
                    return <p className="text-sm text-muted-foreground text-center py-4">কোনো লেনদেন নেই</p>;
                  }

                  return (
                    <div className="space-y-2">
                      {rows.slice().reverse().map((r, idx) => (
                        <div key={idx} className="flex items-center justify-between border border-border rounded-lg p-3 gap-2">
                          <div className="flex items-center gap-3 min-w-0">
                            <Badge variant={r.type === 'sale' ? 'destructive' : 'default'} className="text-[10px] shrink-0">
                              {r.type === 'sale' ? '🛒 বিক্রয়' : '💵 পরিশোধ'}
                            </Badge>
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">{r.label}</p>
                              <p className="text-xs text-muted-foreground">
                                {format(new Date(r.date), "dd MMM yyyy, hh:mm a")}
                                {r.method ? ` • ${r.method === 'cash' ? 'নগদ' : r.method === 'card' ? 'কার্ড' : 'মোবাইল'}` : ''}
                              </p>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <p className={`text-sm font-bold ${r.sign === 1 ? 'text-destructive' : 'text-green-600'}`}>
                              {r.sign === 1 ? '+' : '−'}৳{r.amount.toLocaleString('bn-BD')}
                            </p>
                            <p className="text-[10px] text-muted-foreground">
                              বাকি: ৳{(r.balance || 0).toLocaleString('bn-BD')}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </Card>
            </TabsContent>

            {/* DUE TAB — per-sale outstanding with payment intake */}
            <TabsContent value="due" className="space-y-2 mt-3">
              {summary.dueSales.length === 0 ? (
                <Card className="p-8 text-center">
                  <p className="text-sm text-muted-foreground">🎉 কোনো বাকি বিক্রয় নেই</p>
                </Card>
              ) : (
                <Card className="p-4 border-destructive/30 bg-destructive/5">
                  <div className="space-y-3">
                    {summary.dueSales.map(sale => (
                      <div key={sale.id} className="bg-background rounded-lg p-3 border border-border">
                        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                          <div className="flex-1 space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge variant="outline" className="text-xs">#{sale.id.slice(0, 8)}</Badge>
                              <span className="text-xs text-muted-foreground">{format(new Date(sale.created_at), "dd MMM yyyy")}</span>
                            </div>
                            <div className="text-sm">
                              {(sale.sale_items as any[])?.map((item: any, idx: number) => (
                                <span key={idx} className="text-muted-foreground">
                                  {item.products?.name} (×{item.quantity}){idx < (sale.sale_items as any[]).length - 1 ? ", " : ""}
                                </span>
                              ))}
                            </div>
                            <p className="text-xs text-muted-foreground">
                              মোট: ৳{Number(sale.total_amount).toLocaleString('bn-BD')} | পরিশোধিত: ৳{Number(sale.paid_amount).toLocaleString('bn-BD')}
                            </p>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="text-right">
                              <p className="text-lg font-bold text-destructive">৳{Number(sale.due_amount).toLocaleString('bn-BD')}</p>
                              <p className="text-xs text-muted-foreground">বাকি</p>
                            </div>
                            <Button
                              size="sm"
                              className="bg-green-600 hover:bg-green-700 whitespace-nowrap"
                              onClick={() => {
                                setSelectedSale(sale);
                                setPaymentAmount("");
                                setPaymentDialogOpen(true);
                              }}
                            >
                              💵 আদায়
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              )}

              {/* Payment History */}
              <Card className="p-4">
                <h3 className="text-base font-bold text-foreground mb-2">💳 পেমেন্ট ইতিহাস ({customerPayments?.length || 0}টি)</h3>
                {customerPayments && customerPayments.length > 0 ? (
                  <div className="space-y-2">
                    {customerPayments.map(payment => (
                      <div key={payment.id} className="flex items-center justify-between border border-border rounded-lg p-3">
                        <div>
                          <p className="text-sm font-medium text-green-600">+৳{Number(payment.amount).toLocaleString('bn-BD')}</p>
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(payment.created_at), "dd MMM yyyy, hh:mm a")} •
                            {payment.payment_method === "cash" ? " নগদ" : payment.payment_method === "card" ? " কার্ড" : " মোবাইল"}
                          </p>
                          {payment.notes && <p className="text-xs text-muted-foreground">📝 {payment.notes}</p>}
                        </div>
                        <Badge variant="outline" className="text-[10px]">#{payment.sale_id.slice(0, 8)}</Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">কোনো আলাদা পেমেন্ট রেকর্ড নেই</p>
                )}
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      )}

      {/* Collect Payment Dialog */}
      <Dialog open={paymentDialogOpen} onOpenChange={(open) => {
        if (!open) {
          setPaymentDialogOpen(false);
          setSelectedSale(null);
          setPaymentAmount("");
          setPaymentNotes("");
        }
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>💰 বাকি আদায়</DialogTitle>
          </DialogHeader>
          {selectedSale && (
            <div className="space-y-4">
              <div className="bg-muted/50 p-3 rounded-lg space-y-1">
                <p className="text-sm"><span className="font-semibold">কাস্টমার:</span> {selectedCustomer?.name}</p>
                <p className="text-sm"><span className="font-semibold">ইনভয়েস:</span> #{selectedSale.id.slice(0, 8)}</p>
                <p className="text-sm"><span className="font-semibold">মোট:</span> ৳{Number(selectedSale.total_amount).toLocaleString('bn-BD')}</p>
                <p className="text-sm"><span className="font-semibold">পূর্বে পরিশোধিত:</span> ৳{Number(selectedSale.paid_amount).toLocaleString('bn-BD')}</p>
                <p className="text-sm font-bold text-destructive">বাকি: ৳{Number(selectedSale.due_amount).toLocaleString('bn-BD')}</p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">আদায়ের পরিমাণ *</label>
                <Input
                  type="number"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  placeholder="টাকার পরিমাণ"
                  max={Number(selectedSale.due_amount)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">পেমেন্ট পদ্ধতি</label>
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
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
                <Input value={paymentNotes} onChange={(e) => setPaymentNotes(e.target.value)} placeholder="আদায়ের নোট" />
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setPaymentDialogOpen(false)}>বাতিল</Button>
                <Button
                  onClick={handleCollectPayment}
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
    </div>
  );
}
