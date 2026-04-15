import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useShopSettings } from "@/hooks/useShopSettings";
import { MobileDashboardWidget } from "./MobileDashboardWidget";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid, Legend, PieChart, Pie, Cell } from "recharts";

interface DashboardProps {
  onNavigateToPOS?: () => void;
  onNavigateToProducts?: () => void;
}

export function Dashboard({ onNavigateToPOS, onNavigateToProducts }: DashboardProps = {}) {
  const { settings, logoSrc } = useShopSettings();

  const { data: products, isLoading: productsLoading } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("*");
      if (error) throw error;
      return data;
    },
  });

  const { data: sales, isLoading: salesLoading } = useQuery({
    queryKey: ["sales"],
    queryFn: async () => {
      const { data, error } = await supabase.from("sales").select("*, sale_items(*, products(condition, cost, name))");
      if (error) throw error;
      return data;
    },
  });

  const { data: customers } = useQuery({
    queryKey: ["customers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("customers").select("*");
      if (error) throw error;
      return data;
    },
  });

  const totalProducts = products?.length || 0;
  const inStockProducts = products?.filter(p => p.stock_quantity > 0).length || 0;
  const outOfStockProducts = products?.filter(p => p.stock_quantity <= 0).length || 0;
  const lowStockProducts = products?.filter(p => p.stock_quantity > 0 && p.stock_quantity <= p.low_stock_threshold) || [];
  const totalSales = sales?.reduce((sum, sale) => sum + Number(sale.total_amount), 0) || 0;

  const today = new Date().toDateString();
  const todaySalesList = sales?.filter(s => new Date(s.created_at).toDateString() === today) || [];
  const todaySalesCount = todaySalesList.length;
  const todaySalesRevenue = todaySalesList.reduce((sum, s) => sum + Number(s.total_amount), 0);
  const todayDueAmount = todaySalesList.reduce((sum, s) => sum + Number(s.due_amount), 0);

  let todayProfit = 0;
  todaySalesList.forEach(sale => {
    sale.sale_items?.forEach((item: any) => {
      const cost = Number(item.products?.cost || 0);
      const revenue = Number(item.unit_price);
      todayProfit += (revenue - cost) * item.quantity;
    });
  });

  const totalDue = sales?.reduce((sum, s) => sum + Number(s.due_amount), 0) || 0;
  const totalPaid = sales?.reduce((sum, s) => sum + Number(s.paid_amount), 0) || 0;

  const { data: purchases } = useQuery({
    queryKey: ["purchases"],
    queryFn: async () => {
      const { data, error } = await supabase.from("purchases").select("*");
      if (error) throw error;
      return data;
    },
  });

  const { data: supplierPayments } = useQuery({
    queryKey: ["supplier-payments-all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("supplier_payments").select("*");
      if (error) throw error;
      return data;
    },
  });

  const totalPurchaseAmount = purchases?.reduce((sum, p) => sum + Number(p.total_amount), 0) || 0;
  const totalSupplierPaid = supplierPayments?.reduce((sum, p) => sum + Number(p.amount), 0) || 0;
  const totalSupplierDue = totalPurchaseAmount - totalSupplierPaid;

  const newProductsInvestment = products?.filter(p => p.condition === 'new').reduce((sum, p) => sum + (Number(p.cost) * p.stock_quantity), 0) || 0;
  const usedProductsInvestment = products?.filter(p => p.condition === 'used').reduce((sum, p) => sum + (Number(p.cost) * p.stock_quantity), 0) || 0;
  const totalInvestment = newProductsInvestment + usedProductsInvestment;

  // Weekly sales chart data
  const weeklySalesData = useMemo(() => {
    if (!sales) return [];
    const now = new Date();
    const days: { date: string; label: string; revenue: number; profit: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateStr = d.toDateString();
      const label = d.toLocaleDateString('bn-BD', { weekday: 'short', day: 'numeric' });
      const daySales = sales.filter(s => new Date(s.created_at).toDateString() === dateStr);
      const revenue = daySales.reduce((sum, s) => sum + Number(s.total_amount), 0);
      let profit = 0;
      daySales.forEach(s => s.sale_items?.forEach((item: any) => {
        profit += (Number(item.unit_price) - Number(item.products?.cost || 0)) * item.quantity;
      }));
      days.push({ date: dateStr, label, revenue, profit });
    }
    return days;
  }, [sales]);

  // Monthly comparison chart data
  const monthlyData = useMemo(() => {
    if (!sales) return [];
    const now = new Date();
    const months: { label: string; revenue: number; profit: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const month = d.getMonth();
      const year = d.getFullYear();
      const label = d.toLocaleDateString('bn-BD', { month: 'short', year: '2-digit' });
      const monthSales = sales.filter(s => {
        const sd = new Date(s.created_at);
        return sd.getMonth() === month && sd.getFullYear() === year;
      });
      const revenue = monthSales.reduce((sum, s) => sum + Number(s.total_amount), 0);
      let profit = 0;
      monthSales.forEach(s => s.sale_items?.forEach((item: any) => {
        profit += (Number(item.unit_price) - Number(item.products?.cost || 0)) * item.quantity;
      }));
      months.push({ label, revenue, profit });
    }
    return months;
  }, [sales]);

  // Top sold products
  const topProducts = useMemo(() => {
    if (!sales) return [];
    const productMap: Record<string, { name: string; count: number; revenue: number }> = {};
    sales.forEach(sale => {
      sale.sale_items?.forEach((item: any) => {
        const name = item.products?.name || "Unknown";
        if (!productMap[item.product_id]) productMap[item.product_id] = { name, count: 0, revenue: 0 };
        productMap[item.product_id].count += item.quantity;
        productMap[item.product_id].revenue += Number(item.total_price);
      });
    });
    return Object.values(productMap).sort((a, b) => b.count - a.count).slice(0, 5);
  }, [sales]);

  // Top customers
  const topCustomers = useMemo(() => {
    if (!sales || !customers) return [];
    const customerMap: Record<string, { name: string; count: number; total: number; due: number }> = {};
    sales.forEach(sale => {
      const cid = sale.customer_id;
      if (!cid) return;
      const customer = customers.find(c => c.id === cid);
      if (!customer) return;
      if (!customerMap[cid]) customerMap[cid] = { name: customer.name, count: 0, total: 0, due: 0 };
      customerMap[cid].count++;
      customerMap[cid].total += Number(sale.total_amount);
      customerMap[cid].due += Number(sale.due_amount);
    });
    return Object.values(customerMap).sort((a, b) => b.total - a.total).slice(0, 5);
  }, [sales, customers]);

  const stats = [
    { label: "মোট প্রোডাক্ট", value: totalProducts, icon: "📦", color: "from-teal-500 to-teal-600" },
    { label: "স্টকে আছে", value: inStockProducts, icon: "✅", color: "from-emerald-500 to-emerald-600" },
    { label: "মোট বিক্রয়", value: `৳${totalSales.toLocaleString('bn-BD')}`, icon: "💰", color: "from-green-500 to-green-600" },
    { label: "মোট বাকি", value: `৳${totalDue.toLocaleString('bn-BD')}`, icon: "⏳", color: "from-orange-500 to-orange-600" },
  ];

  const isLoading = productsLoading || salesLoading;

  if (isLoading) {
    return (
      <div className="flex flex-col h-screen animate-fade-in">
        <div className="sticky top-0 z-10 bg-white dark:bg-gray-950 border-b border-border pb-4">
          <Skeleton className="h-9 w-48 mb-2" />
          <Skeleton className="h-5 w-72" />
        </div>
        <div className="flex-1 overflow-y-auto pb-6 space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
            {[1,2,3,4].map(i => <Card key={i} className="p-6"><Skeleton className="h-16 w-full" /></Card>)}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen animate-fade-in">
      <div className="sticky top-0 z-10 bg-white dark:bg-gray-950 border-b border-border pb-4">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">ড্যাশবোর্ড</h1>
            <p className="text-muted-foreground mt-1">আপনার ব্যবসার সারসংক্ষেপ</p>
          </div>
          <img src={logoSrc} alt={settings.shop_name} className="w-20 h-20" />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pb-6 space-y-6">
        <MobileDashboardWidget onNavigateToPOS={onNavigateToPOS} onNavigateToProducts={onNavigateToProducts} />

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map((stat, i) => (
            <Card key={i} className="p-4 card-hover">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">{stat.label}</p>
                  <p className="text-2xl font-bold text-foreground mt-1">{stat.value}</p>
                </div>
                <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${stat.color} flex items-center justify-center text-xl`}>{stat.icon}</div>
              </div>
            </Card>
          ))}
        </div>

        {/* Today's Summary */}
        <Card className="p-5 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20 border-blue-200">
          <h2 className="text-lg font-semibold mb-3 text-foreground">📊 আজকের বিক্রয় সামারি</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="p-3 bg-white/80 dark:bg-gray-800/80">
              <p className="text-xs text-muted-foreground">বিক্রয়</p>
              <p className="text-xl font-bold text-blue-600">{todaySalesCount.toLocaleString('bn-BD')}</p>
            </Card>
            <Card className="p-3 bg-white/80 dark:bg-gray-800/80">
              <p className="text-xs text-muted-foreground">আয়</p>
              <p className="text-xl font-bold text-green-600">৳{todaySalesRevenue.toLocaleString('bn-BD')}</p>
            </Card>
            <Card className="p-3 bg-white/80 dark:bg-gray-800/80">
              <p className="text-xs text-muted-foreground">লাভ</p>
              <p className={`text-xl font-bold ${todayProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>৳{todayProfit.toLocaleString('bn-BD')}</p>
            </Card>
            <Card className="p-3 bg-white/80 dark:bg-gray-800/80">
              <p className="text-xs text-muted-foreground">বাকি</p>
              <p className="text-xl font-bold text-orange-600">৳{todayDueAmount.toLocaleString('bn-BD')}</p>
            </Card>
          </div>
        </Card>

        {/* Stock Alerts */}
        {outOfStockProducts > 0 && (
          <Card className="p-4 border-red-200 bg-red-50 dark:bg-red-950/20">
            <div className="flex items-center space-x-3">
              <span className="text-2xl">🚫</span>
              <div>
                <h3 className="font-semibold text-red-900 dark:text-red-100">আউট অফ স্টক</h3>
                <p className="text-sm text-red-700 dark:text-red-300">{outOfStockProducts}টি প্রোডাক্ট আউট অফ স্টক।</p>
              </div>
            </div>
          </Card>
        )}
        {lowStockProducts.length > 0 && (
          <Card className="p-4 border-amber-200 bg-amber-50 dark:bg-amber-950/20">
            <div className="flex items-center space-x-3 mb-3">
              <span className="text-2xl">⚠️</span>
              <h3 className="font-semibold text-amber-900 dark:text-amber-100">লো স্টক ({lowStockProducts.length}টি)</h3>
            </div>
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {lowStockProducts.slice(0, 10).map(p => (
                <div key={p.id} className="flex justify-between text-sm bg-white/60 dark:bg-gray-800/60 rounded px-3 py-1.5">
                  <span>{p.name}</span>
                  <span className="text-amber-700 font-semibold">স্টক: {p.stock_quantity}</span>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Weekly Sales Chart */}
        <Card className="p-5">
          <h2 className="text-lg font-semibold mb-4 text-foreground">📈 এই সপ্তাহের বিক্রয়</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weeklySalesData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" fontSize={11} />
                <YAxis fontSize={11} />
                <Tooltip formatter={(value: number) => `৳${value.toLocaleString('bn-BD')}`} />
                <Legend />
                <Bar dataKey="revenue" name="আয়" fill="hsl(var(--primary))" radius={[4,4,0,0]} />
                <Bar dataKey="profit" name="লাভ" fill="#10b981" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Monthly Comparison */}
        <Card className="p-5">
          <h2 className="text-lg font-semibold mb-4 text-foreground">📊 মাসিক তুলনামূলক বিশ্লেষণ</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" fontSize={11} />
                <YAxis fontSize={11} />
                <Tooltip formatter={(value: number) => `৳${value.toLocaleString('bn-BD')}`} />
                <Legend />
                <Line type="monotone" dataKey="revenue" name="আয়" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 4 }} />
                <Line type="monotone" dataKey="profit" name="লাভ" stroke="#10b981" strokeWidth={2} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Top Products & Top Customers side by side */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="p-5">
            <h2 className="text-lg font-semibold mb-3 text-foreground">🏆 টপ বিক্রিত প্রোডাক্ট</h2>
            {topProducts.length > 0 ? (
              <div className="space-y-2">
                {topProducts.map((p, i) => (
                  <div key={i} className="flex justify-between items-center p-2 bg-muted rounded text-sm">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i+1}.`}</span>
                      <span className="font-medium">{p.name}</span>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-primary">{p.count}টি</p>
                      <p className="text-xs text-muted-foreground">৳{p.revenue.toLocaleString('bn-BD')}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-6">ডেটা নেই</p>
            )}
          </Card>

          <Card className="p-5">
            <h2 className="text-lg font-semibold mb-3 text-foreground">👑 টপ কাস্টমার</h2>
            {topCustomers.length > 0 ? (
              <div className="space-y-2">
                {topCustomers.map((c, i) => (
                  <div key={i} className="flex justify-between items-center p-2 bg-muted rounded text-sm">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i+1}.`}</span>
                      <div>
                        <span className="font-medium">{c.name}</span>
                        <p className="text-xs text-muted-foreground">{c.count}টি অর্ডার</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-primary">৳{c.total.toLocaleString('bn-BD')}</p>
                      {c.due > 0 && <p className="text-xs text-red-500">বাকি: ৳{c.due.toLocaleString('bn-BD')}</p>}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-6">ডেটা নেই</p>
            )}
          </Card>
        </div>

        {/* Investment Analysis */}
        <Card className="p-5">
          <h2 className="text-lg font-semibold mb-4 text-foreground">💰 বিনিয়োগ বিশ্লেষণ</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="p-4 bg-green-50 dark:bg-green-950/20 border-green-200">
              <p className="text-sm text-muted-foreground">নতুন প্রোডাক্ট</p>
              <p className="text-2xl font-bold text-green-600">৳{newProductsInvestment.toLocaleString('bn-BD')}</p>
            </Card>
            <Card className="p-4 bg-blue-50 dark:bg-blue-950/20 border-blue-200">
              <p className="text-sm text-muted-foreground">ব্যবহৃত প্রোডাক্ট</p>
              <p className="text-2xl font-bold text-blue-600">৳{usedProductsInvestment.toLocaleString('bn-BD')}</p>
            </Card>
            <Card className="p-4 bg-purple-50 dark:bg-purple-950/20 border-purple-200">
              <p className="text-sm text-muted-foreground">সর্বমোট বিনিয়োগ</p>
              <p className="text-2xl font-bold text-purple-600">৳{totalInvestment.toLocaleString('bn-BD')}</p>
            </Card>
          </div>
        </Card>

        {/* Recent Sales */}
        <Card className="p-5">
          <h2 className="text-lg font-semibold mb-3 text-foreground">সাম্প্রতিক কার্যক্রম</h2>
          <div className="space-y-3">
            {sales?.slice(0, 5).map(sale => (
              <div key={sale.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                <div>
                  <p className="font-medium text-foreground text-sm">বিক্রয় #{sale.id.slice(0, 8)}</p>
                  <p className="text-xs text-muted-foreground">{new Date(sale.created_at).toLocaleDateString('bn-BD')}</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-foreground text-sm">৳{Number(sale.total_amount).toLocaleString('bn-BD')}</p>
                  <p className="text-xs text-muted-foreground">
                    {sale.payment_method === 'cash' ? 'নগদ' : sale.payment_method === 'card' ? 'কার্ড' : 'মোবাইল'}
                  </p>
                </div>
              </div>
            ))}
            {(!sales || sales.length === 0) && (
              <p className="text-center text-muted-foreground py-6">এখনো কোনো বিক্রয় নেই।</p>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
