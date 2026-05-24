import JSZip from "jszip";
import { supabase } from "@/integrations/supabase/client";

const TABLES = [
  "products", "categories", "customers", "suppliers",
  "sales", "sale_items", "purchases", "purchase_items",
  "returns", "supplier_returns", "supplier_return_items",
  "payments", "supplier_payments",
  "shop_settings", "activity_logs", "return_audit_logs",
] as const;

export type BackupBundle = {
  version: string;
  timestamp: string;
  data: Record<string, any[]>;
  counts: Record<string, number>;
};

async function fetchAll(table: string): Promise<any[]> {
  const all: any[] = [];
  const pageSize = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await (supabase.from(table as any) as any)
      .select("*").range(from, from + pageSize - 1);
    if (error) {
      console.warn(`[backup] ${table} fetch failed:`, error.message);
      break;
    }
    if (!data?.length) break;
    all.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

export async function buildBackup(): Promise<BackupBundle> {
  const data: Record<string, any[]> = {};
  const counts: Record<string, number> = {};
  for (const t of TABLES) {
    const rows = await fetchAll(t);
    data[t] = rows;
    counts[t] = rows.length;
  }
  return {
    version: "2.0",
    timestamp: new Date().toISOString(),
    data,
    counts,
  };
}

function dateRangeFilter(rows: any[], days: number): any[] {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return rows.filter((r) => r.created_at && new Date(r.created_at).getTime() >= cutoff);
}

function summarizeSales(sales: any[], items: any[], products: any[]) {
  const productMap = new Map(products.map((p) => [p.id, p]));
  let totalRevenue = 0, totalPaid = 0, totalDue = 0, totalProfit = 0;
  let newProfit = 0, usedProfit = 0;
  for (const s of sales) {
    totalRevenue += Number(s.total_amount || 0);
    totalPaid += Number(s.paid_amount || 0);
    totalDue += Number(s.due_amount || 0);
  }
  for (const it of items) {
    if (!sales.find((s) => s.id === it.sale_id)) continue;
    const p = productMap.get(it.product_id);
    const cost = Number(p?.cost || 0);
    const profit = (Number(it.unit_price || 0) - cost) * Number(it.quantity || 1);
    totalProfit += profit;
    if (p?.condition === "new") newProfit += profit; else usedProfit += profit;
  }
  return {
    sales_count: sales.length,
    total_revenue: totalRevenue,
    total_paid: totalPaid,
    total_due: totalDue,
    total_profit: totalProfit,
    new_mobile_profit: newProfit,
    used_mobile_profit: usedProfit,
  };
}

export async function buildBackupZip(): Promise<Blob> {
  const bundle = await buildBackup();
  const zip = new JSZip();

  zip.file("database.json", JSON.stringify(bundle, null, 2));
  zip.file("metadata.json", JSON.stringify({
    version: bundle.version,
    timestamp: bundle.timestamp,
    counts: bundle.counts,
    generated_by: "BIG BOSS MOBILE STATION — Auto Backup",
  }, null, 2));

  // Per-table CSVs (lightweight)
  for (const [table, rows] of Object.entries(bundle.data)) {
    if (!rows.length) continue;
    const keys = Object.keys(rows[0]);
    const csv = [
      keys.join(","),
      ...rows.map((r) =>
        keys.map((k) => {
          const v = r[k];
          if (v == null) return "";
          const s = typeof v === "object" ? JSON.stringify(v) : String(v);
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        }).join(","),
      ),
    ].join("\n");
    zip.folder("tables")?.file(`${table}.csv`, csv);
  }

  // Reports folder
  const reports = zip.folder("reports")!;
  const sales = bundle.data.sales || [];
  const items = bundle.data.sale_items || [];
  const products = bundle.data.products || [];

  reports.file("sales-daily.json", JSON.stringify(summarizeSales(dateRangeFilter(sales, 1), items, products), null, 2));
  reports.file("sales-weekly.json", JSON.stringify(summarizeSales(dateRangeFilter(sales, 7), items, products), null, 2));
  reports.file("sales-monthly.json", JSON.stringify(summarizeSales(dateRangeFilter(sales, 30), items, products), null, 2));
  reports.file("profit-loss.json", JSON.stringify(summarizeSales(sales, items, products), null, 2));

  reports.file("stock-status.json", JSON.stringify({
    total_products: products.length,
    in_stock: products.filter((p: any) => Number(p.stock_quantity || 0) > 0).length,
    out_of_stock: products.filter((p: any) => Number(p.stock_quantity || 0) === 0).length,
    new_count: products.filter((p: any) => p.condition === "new").length,
    used_count: products.filter((p: any) => p.condition !== "new").length,
  }, null, 2));

  reports.file("returns-summary.json", JSON.stringify({
    sales_returns: (bundle.data.returns || []).length,
    supplier_returns: (bundle.data.supplier_returns || []).length,
    pending: (bundle.data.returns || []).filter((r: any) => r.status === "pending").length,
    completed: (bundle.data.returns || []).filter((r: any) => r.status === "completed").length,
  }, null, 2));

  reports.file("customer-summary.json", JSON.stringify({
    total_customers: (bundle.data.customers || []).length,
    total_purchases: (bundle.data.customers || []).reduce((s: number, c: any) => s + Number(c.total_purchases || 0), 0),
  }, null, 2));

  reports.file("supplier-summary.json", JSON.stringify({
    total_suppliers: (bundle.data.suppliers || []).length,
    total_purchases: (bundle.data.purchases || []).length,
    total_purchase_amount: (bundle.data.purchases || []).reduce((s: number, p: any) => s + Number(p.total_amount || 0), 0),
  }, null, 2));

  return zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export async function downloadFullZipBackup(): Promise<{ counts: Record<string, number>; filename: string }> {
  const bundle = await buildBackup();
  const blob = await buildBackupZip();
  const stamp = new Date().toISOString().split("T")[0];
  const filename = `bigboss-backup-${stamp}.zip`;
  downloadBlob(blob, filename);
  return { counts: bundle.counts, filename };
}

export async function downloadFullJsonBackup(): Promise<{ counts: Record<string, number>; filename: string }> {
  const bundle = await buildBackup();
  const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
  const stamp = new Date().toISOString().split("T")[0];
  const filename = `bigboss-backup-${stamp}.json`;
  downloadBlob(blob, filename);
  return { counts: bundle.counts, filename };
}
