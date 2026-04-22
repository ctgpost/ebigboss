import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell, Legend } from "recharts";
import { TrendingUp, Package, Tag, Smartphone, Truck, FileText, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import { bn } from "date-fns/locale";

interface ReturnAnalyticsProps {
  returns: any[];
}

const COLORS = ["hsl(var(--primary))", "hsl(var(--accent))", "#22c55e", "#ef4444", "#8b5cf6", "#f59e0b"];

export function ReturnAnalytics({ returns }: ReturnAnalyticsProps) {
  const [selectedDimension, setSelectedDimension] = useState<"product" | "brand" | "model" | "supplier">("product");

  // All sales for rate calculation
  const { data: allSales } = useQuery({
    queryKey: ["sales-for-return-rate"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sale_items")
        .select("product_id, quantity, products(name, brand, model, supplier_name)");
      if (error) throw error;
      return data || [];
    },
  });

  // Activity logs related to returns
  const { data: returnLogs } = useQuery({
    queryKey: ["activity-logs-returns"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("activity_logs")
        .select("*")
        .eq("action_type", "return")
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data || [];
    },
  });

  // Aggregated stats per dimension
  const dimensionStats = useMemo(() => {
    const map = new Map<string, { name: string; returned: number; sold: number; refund: number }>();

    // Returned counts
    returns.forEach((r) => {
      if (r.status === "rejected") return;
      const key = (() => {
        switch (selectedDimension) {
          case "product": return r.products?.name || "Unknown";
          case "brand": return r.products?.brand || "Unknown";
          case "model": return r.products?.model || "Unknown";
          case "supplier": return r.products?.supplier_name || "Unknown";
        }
      })();
      const existing = map.get(key) || { name: key, returned: 0, sold: 0, refund: 0 };
      existing.returned += Number(r.quantity);
      existing.refund += Number(r.refund_amount);
      map.set(key, existing);
    });

    // Sold counts
    allSales?.forEach((s: any) => {
      const key = (() => {
        switch (selectedDimension) {
          case "product": return s.products?.name || "Unknown";
          case "brand": return s.products?.brand || "Unknown";
          case "model": return s.products?.model || "Unknown";
          case "supplier": return s.products?.supplier_name || "Unknown";
        }
      })();
      const existing = map.get(key) || { name: key, returned: 0, sold: 0, refund: 0 };
      existing.sold += Number(s.quantity);
      map.set(key, existing);
    });

    return Array.from(map.values())
      .filter((d) => d.returned > 0)
      .map((d) => ({ ...d, rate: d.sold > 0 ? (d.returned / d.sold) * 100 : 0 }))
      .sort((a, b) => b.returned - a.returned)
      .slice(0, 10);
  }, [returns, allSales, selectedDimension]);

  const reasonStats = useMemo(() => {
    const map = new Map<string, number>();
    returns.forEach((r) => {
      if (r.status === "rejected") return;
      map.set(r.reason_code, (map.get(r.reason_code) || 0) + 1);
    });
    const labels: Record<string, string> = {
      defective: "ত্রুটিপূর্ণ", wrong_item: "ভুল পণ্য", customer_request: "ক্রেতার অনুরোধ",
      damaged: "ক্ষতিগ্রস্ত", not_as_described: "বিবরণ অনুযায়ী নয়", other: "অন্যান্য",
    };
    return Array.from(map.entries()).map(([code, count]) => ({ name: labels[code] || code, value: count }));
  }, [returns]);

  const totalReturns = returns.filter(r => r.status !== "rejected").length;
  const totalRefund = returns.filter(r => r.status === "completed" && !r.is_audit_only).reduce((s, r) => s + Number(r.refund_amount), 0);
  const totalSoldUnits = allSales?.reduce((s, x: any) => s + Number(x.quantity), 0) || 0;
  const totalReturnedUnits = returns.filter(r => r.status !== "rejected").reduce((s, r) => s + Number(r.quantity), 0);
  const overallRate = totalSoldUnits > 0 ? (totalReturnedUnits / totalSoldUnits) * 100 : 0;

  const dimIcons = { product: Package, brand: Tag, model: Smartphone, supplier: Truck };
  const dimLabels = { product: "প্রোডাক্ট", brand: "ব্র্যান্ড", model: "মডেল", supplier: "সাপ্লায়ার" };

  return (
    <div className="space-y-4">
      {/* Top stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">মোট রিটার্ন</p>
          <p className="text-2xl font-bold text-primary">{totalReturns}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">রিটার্নকৃত ইউনিট</p>
          <p className="text-2xl font-bold text-foreground">{totalReturnedUnits}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">মোট রিটার্ন রেট</p>
          <p className="text-2xl font-bold text-destructive">{overallRate.toFixed(1)}%</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">মোট রিফান্ড</p>
          <p className="text-xl font-bold text-accent">৳{totalRefund.toLocaleString('bn-BD')}</p>
        </Card>
      </div>

      {/* Dimension switcher */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-bold">রিটার্ন অ্যানালাইসিস</h3>
          </div>
          <div className="flex gap-1 flex-wrap">
            {(Object.keys(dimLabels) as Array<keyof typeof dimLabels>).map((d) => {
              const Icon = dimIcons[d];
              return (
                <Button key={d} size="sm" variant={selectedDimension === d ? "default" : "outline"}
                  onClick={() => setSelectedDimension(d)} className="gap-1">
                  <Icon className="h-3 w-3" />{dimLabels[d]}
                </Button>
              );
            })}
          </div>
        </div>

        {dimensionStats.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">এই dimension-এ কোনো রিটার্ন ডেটা নেই</p>
        ) : (
          <>
            <div className="h-72 mb-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dimensionStats} margin={{ top: 10, right: 10, left: 0, bottom: 60 }}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" height={60} interval={0} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: number, n: string) => [
                    n === "rate" ? `${v.toFixed(1)}%` : v,
                    n === "returned" ? "রিটার্ন" : n === "sold" ? "বিক্রয়" : "রেট %"
                  ]} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="returned" fill="hsl(var(--destructive))" name="রিটার্ন" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="sold" fill="hsl(var(--primary))" name="বিক্রয়" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="space-y-2">
              {dimensionStats.map((d) => (
                <div key={d.name} className="flex items-center justify-between p-3 border border-border rounded-lg">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{d.name}</p>
                    <p className="text-xs text-muted-foreground">
                      বিক্রি: {d.sold} • রিটার্ন: {d.returned} • রিফান্ড: ৳{d.refund.toLocaleString('bn-BD')}
                    </p>
                  </div>
                  <Badge variant={d.rate > 10 ? "destructive" : d.rate > 5 ? "secondary" : "outline"} className="ml-2">
                    {d.rate.toFixed(1)}%
                  </Badge>
                </div>
              ))}
            </div>
          </>
        )}
      </Card>

      {/* Reason breakdown */}
      {reasonStats.length > 0 && (
        <Card className="p-4">
          <h3 className="text-lg font-bold mb-3">রিটার্নের কারণ</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={reasonStats} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={(e) => `${e.name}: ${e.value}`}>
                  {reasonStats.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {/* Activity logs link */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-bold">সাম্প্রতিক রিটার্ন কার্যকলাপ</h3>
          </div>
          <Badge variant="outline" className="text-xs">অ্যাক্টিভিটি লগ থেকে</Badge>
        </div>
        {returnLogs && returnLogs.length > 0 ? (
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {returnLogs.map((log) => (
              <div key={log.id} className="flex items-start gap-3 p-3 border border-border rounded-lg hover:bg-muted/30 transition-colors">
                <ChevronRight className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{log.action}</p>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(log.created_at), "dd MMM yyyy, hh:mm a", { locale: bn })}
                    {log.user_email ? ` • ${log.user_email}` : ""}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-4">কোনো লগ এন্ট্রি নেই</p>
        )}
        <p className="text-xs text-muted-foreground text-center mt-3">
          সম্পূর্ণ লগ দেখতে: সেটিংস → অ্যাক্টিভিটি লগ
        </p>
      </Card>
    </div>
  );
}
