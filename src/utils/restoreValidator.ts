import { supabase } from "@/integrations/supabase/client";

export type DryRunIssue = {
  table: string;
  label: string;
  severity: "error" | "warning" | "info";
  message: string;
  row_hint?: string;
};

export type DryRunReport = {
  perTable: { table: string; label: string; count: number }[];
  issues: DryRunIssue[];
  ok: boolean;
};

const LABELS: Record<string, string> = {
  categories: "ক্যাটাগরি", suppliers: "সরবরাহকারী", customers: "কাস্টমার",
  products: "প্রোডাক্ট", sales: "বিক্রয়", sale_items: "বিক্রয় আইটেম",
  purchases: "ক্রয়", purchase_items: "ক্রয় আইটেম", returns: "রিটার্ন",
};

export function dryRunBackup(backup: any): DryRunReport {
  const issues: DryRunIssue[] = [];
  const perTable: { table: string; label: string; count: number }[] = [];
  const data = backup?.data || {};

  const tables = ["categories", "suppliers", "customers", "products", "sales", "sale_items", "purchases", "purchase_items", "returns"];
  const idSets: Record<string, Set<string>> = {};
  for (const t of tables) {
    const rows = Array.isArray(data[t]) ? data[t] : [];
    perTable.push({ table: t, label: LABELS[t] || t, count: rows.length });
    idSets[t] = new Set(rows.map((r: any) => r.id).filter(Boolean));

    // Duplicate PK check
    const seen = new Set<string>();
    for (const r of rows) {
      if (!r.id) continue;
      if (seen.has(r.id)) {
        issues.push({ table: t, label: LABELS[t] || t, severity: "error", message: `ডুপ্লিকেট ID: ${r.id}` });
      }
      seen.add(r.id);
    }
  }

  // Required field checks
  for (const r of data.products || []) {
    if (!r.name) issues.push({ table: "products", label: "প্রোডাক্ট", severity: "error", message: "নাম খালি", row_hint: r.id });
  }
  for (const r of data.customers || []) {
    if (!r.name) issues.push({ table: "customers", label: "কাস্টমার", severity: "error", message: "নাম খালি", row_hint: r.id });
  }
  for (const r of data.suppliers || []) {
    if (!r.name) issues.push({ table: "suppliers", label: "সরবরাহকারী", severity: "error", message: "নাম খালি", row_hint: r.id });
  }

  // FK conflicts
  for (const r of data.sale_items || []) {
    if (r.sale_id && !idSets.sales.has(r.sale_id)) {
      issues.push({ table: "sale_items", label: "বিক্রয় আইটেম", severity: "error", message: `অজানা sale_id: ${r.sale_id}`, row_hint: r.id });
    }
    if (r.product_id && !idSets.products.has(r.product_id)) {
      issues.push({ table: "sale_items", label: "বিক্রয় আইটেম", severity: "warning", message: `অজানা product_id: ${r.product_id}`, row_hint: r.id });
    }
  }
  for (const r of data.purchase_items || []) {
    if (r.purchase_id && !idSets.purchases.has(r.purchase_id)) {
      issues.push({ table: "purchase_items", label: "ক্রয় আইটেম", severity: "error", message: `অজানা purchase_id: ${r.purchase_id}`, row_hint: r.id });
    }
  }
  for (const r of data.returns || []) {
    if (r.sale_id && !idSets.sales.has(r.sale_id)) {
      issues.push({ table: "returns", label: "রিটার্ন", severity: "error", message: `অজানা sale_id: ${r.sale_id}`, row_hint: r.id });
    }
    if (r.product_id && !idSets.products.has(r.product_id)) {
      issues.push({ table: "returns", label: "রিটার্ন", severity: "warning", message: `অজানা product_id: ${r.product_id}`, row_hint: r.id });
    }
  }
  for (const r of data.products || []) {
    if (r.category_id && !idSets.categories.has(r.category_id)) {
      issues.push({ table: "products", label: "প্রোডাক্ট", severity: "warning", message: `অজানা category_id: ${r.category_id}`, row_hint: r.id });
    }
  }

  return {
    perTable,
    issues,
    ok: issues.filter((i) => i.severity === "error").length === 0,
  };
}

export type ValidationReport = {
  rows: { table: string; label: string; backupCount: number; dbCount: number; match: boolean }[];
  allMatch: boolean;
};

export async function validateAfterRestore(backup: any): Promise<ValidationReport> {
  const tables = ["categories", "suppliers", "customers", "products", "sales", "sale_items", "purchases", "purchase_items", "returns"];
  const rows: ValidationReport["rows"] = [];
  for (const t of tables) {
    const backupCount = (backup?.data?.[t] || []).length;
    const { count } = await (supabase.from(t as any) as any).select("*", { count: "exact", head: true });
    const dbCount = count || 0;
    rows.push({ table: t, label: LABELS[t] || t, backupCount, dbCount, match: backupCount === dbCount });
  }
  return { rows, allMatch: rows.every((r) => r.match) };
}
