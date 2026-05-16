import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { useShopSettings } from "@/hooks/useShopSettings";
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { UserManagement } from "@/components/UserManagement";
import { ActivityLog } from "@/components/ActivityLog";
import { StockSyncCheck } from "@/components/StockSyncCheck";
import { StaffPerformanceReport } from "@/components/StaffPerformanceReport";
import { useUserRole } from "@/hooks/useUserRole";
import { ActivityLogger } from "@/hooks/useActivityLog";
import { BrandingSettings } from "@/components/BrandingSettings";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { downloadFullZipBackup } from "@/utils/backupZip";
import { dryRunBackup, validateAfterRestore, type DryRunReport, type ValidationReport } from "@/utils/restoreValidator";
import { runManualScheduledBackup } from "@/hooks/useScheduledBackup";

export function Settings() {
  const navigate = useNavigate();
  const { settings, logoSrc } = useShopSettings();
  const { isAdmin } = useUserRole();
  const [showBranding, setShowBranding] = useState(false);
  const [secretBuffer, setSecretBuffer] = useState("");

  // Secret code listener to unlock branding settings
  useEffect(() => {
    const SECRET_CODE = "331548";
    let buffer = "";
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input/textarea
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      
      buffer += e.key;
      if (buffer.length > SECRET_CODE.length) {
        buffer = buffer.slice(-SECRET_CODE.length);
      }
      if (buffer === SECRET_CODE) {
        setShowBranding(true);
        toast.success("🔐 ব্র্যান্ডিং সেটিংস আনলক হয়েছে!");
        buffer = "";
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [isClearingSales, setIsClearingSales] = useState(false);

  // Restore preview & report state
  const [previewBackup, setPreviewBackup] = useState<any | null>(null);
  const [showPreviewDialog, setShowPreviewDialog] = useState(false);
  const [restoreReport, setRestoreReport] = useState<
    | {
        results: { table: string; label: string; total: number; inserted: number; failed: number; errors: { message: string; row?: any }[] }[];
      }
    | null
  >(null);
  const [showReportDialog, setShowReportDialog] = useState(false);
  const [isZipBackingUp, setIsZipBackingUp] = useState(false);
  const [dryRunResult, setDryRunResult] = useState<DryRunReport | null>(null);
  const [showDryRunDialog, setShowDryRunDialog] = useState(false);
  const [validationReport, setValidationReport] = useState<ValidationReport | null>(null);
  const [showValidationDialog, setShowValidationDialog] = useState(false);

  const [resetStats, setResetStats] = useState<{
    sales: number;
    saleItems: number;
    returns: number;
    purchases: number;
    purchaseItems: number;
    products: number;
    customers: number;
    suppliers: number;
    categories: number;
    totalRevenue: number;
  } | null>(null);
  const [salesStats, setSalesStats] = useState<{
    sales: number;
    saleItems: number;
    returns: number;
    totalRevenue: number;
  } | null>(null);
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [showClearSalesDialog, setShowClearSalesDialog] = useState(false);
  const [profitDateFrom, setProfitDateFrom] = useState<Date | undefined>(undefined);
  const [profitDateTo, setProfitDateTo] = useState<Date | undefined>(undefined);
  const [activePeriod, setActivePeriod] = useState<string>("all");

  // Get database stats (counts only)
  const { data: stats } = useQuery({
    queryKey: ["database-stats"],
    queryFn: async () => {
      const [products, categories, customers, suppliers, sales, purchases, saleItems, purchaseItems, returns] = await Promise.all([
        supabase.from("products").select("*", { count: "exact", head: true }),
        supabase.from("categories").select("*", { count: "exact", head: true }),
        supabase.from("customers").select("*", { count: "exact", head: true }),
        supabase.from("suppliers").select("*", { count: "exact", head: true }),
        supabase.from("sales").select("*", { count: "exact", head: true }),
        supabase.from("purchases").select("*", { count: "exact", head: true }),
        supabase.from("sale_items").select("*", { count: "exact", head: true }),
        supabase.from("purchase_items").select("*", { count: "exact", head: true }),
        supabase.from("returns").select("*", { count: "exact", head: true }),
      ]);

      return {
        products: products.count || 0,
        categories: categories.count || 0,
        customers: customers.count || 0,
        suppliers: suppliers.count || 0,
        sales: sales.count || 0,
        purchases: purchases.count || 0,
        saleItems: saleItems.count || 0,
        purchaseItems: purchaseItems.count || 0,
        returns: returns.count || 0,
      };
    },
  });

  // Get profit stats with date filtering
  const { data: profitStats } = useQuery({
    queryKey: ["profit-stats", profitDateFrom?.toISOString(), profitDateTo?.toISOString()],
    queryFn: async () => {
      let query = supabase.from("sale_items").select("unit_price, quantity, created_at, products(cost, condition)");
      
      if (profitDateFrom) {
        query = query.gte("created_at", startOfDay(profitDateFrom).toISOString());
      }
      if (profitDateTo) {
        query = query.lte("created_at", endOfDay(profitDateTo).toISOString());
      }
      
      const { data } = await query;

      let newMobileProfit = 0;
      let usedMobileProfit = 0;

      data?.forEach((item: any) => {
        const salePrice = Number(item.unit_price || 0);
        const costPrice = Number(item.products?.cost || 0);
        const quantity = Number(item.quantity || 1);
        const profit = (salePrice - costPrice) * quantity;
        // Use product condition instead of sale_items condition
        const productCondition = item.products?.condition || 'new';

        if (productCondition === 'new') {
          newMobileProfit += profit;
        } else {
          usedMobileProfit += profit;
        }
      });

      return {
        newMobileProfit,
        usedMobileProfit,
        totalProfit: newMobileProfit + usedMobileProfit,
      };
    },
  });

  const setPeriod = (period: string) => {
    setActivePeriod(period);
    const today = new Date();
    
    switch (period) {
      case "today":
        setProfitDateFrom(startOfDay(today));
        setProfitDateTo(endOfDay(today));
        break;
      case "week":
        setProfitDateFrom(startOfWeek(today, { weekStartsOn: 0 }));
        setProfitDateTo(endOfWeek(today, { weekStartsOn: 0 }));
        break;
      case "month":
        setProfitDateFrom(startOfMonth(today));
        setProfitDateTo(endOfMonth(today));
        break;
      case "all":
      default:
        setProfitDateFrom(undefined);
        setProfitDateTo(undefined);
        break;
    }
  };

  const handleSignOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast.error("Failed to sign out");
    } else {
      toast.success("Signed out successfully");
      navigate("/auth");
    }
  };

  const handleBackup = async () => {
    setIsBackingUp(true);
    try {
      toast.info("Starting backup...");

      // Fetch all data from all tables
      const [products, categories, customers, suppliers, sales, saleItems, purchases, purchaseItems, returns] = await Promise.all([
        supabase.from("products").select("*"),
        supabase.from("categories").select("*"),
        supabase.from("customers").select("*"),
        supabase.from("suppliers").select("*"),
        supabase.from("sales").select("*"),
        supabase.from("sale_items").select("*"),
        supabase.from("purchases").select("*"),
        supabase.from("purchase_items").select("*"),
        supabase.from("returns").select("*"),
      ]);

      const backup = {
        version: "1.0",
        timestamp: new Date().toISOString(),
        data: {
          products: products.data || [],
          categories: categories.data || [],
          customers: customers.data || [],
          suppliers: suppliers.data || [],
          sales: sales.data || [],
          sale_items: saleItems.data || [],
          purchases: purchases.data || [],
          purchase_items: purchaseItems.data || [],
          returns: returns.data || [],
        },
      };

      // Create and download JSON file
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `stockpro-backup-${new Date().toISOString().split("T")[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success("Backup completed successfully!");
      await ActivityLogger.dataBackup();
    } catch (error: any) {
      toast.error("Backup failed: " + error.message);
    } finally {
      setIsBackingUp(false);
    }
  };

  // Allowed columns per table — keeps restore working even if backup has legacy/unknown fields
  const TABLE_COLUMNS: Record<string, string[]> = {
    categories: ["id", "name", "description", "created_at", "updated_at"],
    suppliers: ["id", "name", "email", "phone", "address", "notes", "image_url", "created_at", "updated_at"],
    customers: ["id", "name", "email", "phone", "address", "notes", "image_url", "purchase_count", "total_purchases", "created_at", "updated_at"],
    products: [
      "id", "name", "description", "category_id", "sku", "barcode", "price", "cost",
      "stock_quantity", "low_stock_threshold", "unit", "image_url", "brand", "condition",
      "imei", "model", "ram", "storage", "battery", "supplier_name", "supplier_mobile",
      "supplier_nid", "product_entry_date", "warranty_status", "created_at", "updated_at",
    ],
    sales: [
      "id", "user_id", "customer_id", "total_amount", "paid_amount", "due_amount",
      "payment_method", "status", "notes", "instant_customer_name", "instant_customer_phone",
      "sale_image_url", "created_at", "updated_at",
    ],
    sale_items: ["id", "sale_id", "product_id", "quantity", "unit_price", "total_price", "condition", "created_at"],
    purchases: [
      "id", "user_id", "supplier_id", "purchase_number", "total_amount", "paid_amount",
      "due_amount", "status", "notes", "expected_date", "created_at", "updated_at",
    ],
    purchase_items: ["id", "purchase_id", "product_id", "quantity", "received_quantity", "unit_cost", "total_cost", "created_at"],
    returns: [
      "id", "sale_id", "sale_item_id", "product_id", "quantity", "reason_code",
      "reason_notes", "refund_amount", "status", "processed_by", "created_at", "updated_at",
    ],
  };

  const sanitizeRows = (table: string, rows: any[]): any[] => {
    if (!Array.isArray(rows)) return [];
    const allowed = TABLE_COLUMNS[table];
    return rows.map((row) => {
      // Legacy field migration for products: warranty_expiry_date -> product_entry_date
      if (table === "products" && row.warranty_expiry_date && !row.product_entry_date) {
        row.product_entry_date = row.warranty_expiry_date;
      }
      const cleaned: Record<string, any> = {};
      for (const key of allowed) {
        if (row[key] !== undefined) cleaned[key] = row[key];
      }
      return cleaned;
    });
  };

  const safeInsert = async (
    table: string,
    rows: any[],
    label: string,
  ): Promise<{ table: string; label: string; total: number; inserted: number; failed: number; errors: { message: string; row?: any }[] }> => {
    const result = { table, label, total: rows?.length || 0, inserted: 0, failed: 0, errors: [] as { message: string; row?: any }[] };
    if (!rows?.length) return result;
    const cleaned = sanitizeRows(table, rows);
    const CHUNK = 100;
    for (let i = 0; i < cleaned.length; i += CHUNK) {
      const chunk = cleaned.slice(i, i + CHUNK);
      const { error } = await (supabase.from(table as any) as any).insert(chunk);
      if (error) {
        for (const row of chunk) {
          const { error: rowErr } = await (supabase.from(table as any) as any).insert(row);
          if (rowErr) {
            result.failed++;
            result.errors.push({ message: rowErr.message, row });
            console.warn(`[restore] ${label} row failed:`, rowErr.message, row);
          } else {
            result.inserted++;
          }
        }
      } else {
        result.inserted += chunk.length;
      }
    }
    return result;
  };

  // ZIP backup (full, with reports)
  const handleZipBackup = async () => {
    if (!isAdmin) { toast.error("শুধুমাত্র অ্যাডমিন এই কাজ করতে পারবেন"); return; }
    setIsZipBackingUp(true);
    try {
      const { counts, filename } = await downloadFullZipBackup();
      const total = Object.values(counts).reduce((a, b) => a + b, 0);
      toast.success(`✅ ZIP ব্যাকআপ ডাউনলোড: ${filename} (${total.toLocaleString("bn-BD")} রেকর্ড)`);
      await ActivityLogger.dataBackup();
    } catch (e: any) {
      toast.error("ZIP ব্যাকআপ ব্যর্থ: " + e.message);
    } finally {
      setIsZipBackingUp(false);
    }
  };

  // Step 1: file selected → parse + run dry-run first
  const handleRestoreFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!isAdmin) { toast.error("শুধুমাত্র অ্যাডমিন রিস্টোর করতে পারবেন"); return; }
    try {
      const text = await file.text();
      const backup = JSON.parse(text);
      if (!backup.version || !backup.data) {
        throw new Error("ব্যাকআপ ফাইলের ফরম্যাট সঠিক নয়");
      }
      setPreviewBackup(backup);
      // Run dry-run validation BEFORE preview
      const dr = dryRunBackup(backup);
      setDryRunResult(dr);
      setShowDryRunDialog(true);
    } catch (error: any) {
      toast.error("ফাইল পড়তে ব্যর্থ: " + error.message);
    }
  };

  const proceedFromDryRun = () => {
    if (!dryRunResult?.ok) {
      toast.error("ত্রুটি আছে — আগে ঠিক করুন");
      return;
    }
    setShowDryRunDialog(false);
    setShowPreviewDialog(true);
  };

  // Step 2: user confirms → actually run the restore
  const runRestore = async () => {
    if (!previewBackup) return;
    setShowPreviewDialog(false);
    setIsRestoring(true);
    try {
      toast.info("রিস্টোর শুরু হচ্ছে...");

      const backup = previewBackup;

      // Clear existing data first (in correct order respecting foreign keys)
      await supabase.from("returns").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      await Promise.all([
        supabase.from("sale_items").delete().neq("id", "00000000-0000-0000-0000-000000000000"),
        supabase.from("purchase_items").delete().neq("id", "00000000-0000-0000-0000-000000000000"),
      ]);
      await Promise.all([
        supabase.from("sales").delete().neq("id", "00000000-0000-0000-0000-000000000000"),
        supabase.from("purchases").delete().neq("id", "00000000-0000-0000-0000-000000000000"),
      ]);
      await supabase.from("products").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      await Promise.all([
        supabase.from("customers").delete().neq("id", "00000000-0000-0000-0000-000000000000"),
        supabase.from("suppliers").delete().neq("id", "00000000-0000-0000-0000-000000000000"),
        supabase.from("categories").delete().neq("id", "00000000-0000-0000-0000-000000000000"),
      ]);

      const results = [] as { table: string; label: string; total: number; inserted: number; failed: number; errors: { message: string; row?: any }[] }[];
      results.push(await safeInsert("categories", backup.data.categories, "ক্যাটাগরি"));
      results.push(await safeInsert("suppliers", backup.data.suppliers, "সরবরাহকারী"));
      results.push(await safeInsert("customers", backup.data.customers, "কাস্টমার"));
      results.push(await safeInsert("products", backup.data.products, "প্রোডাক্ট"));
      results.push(await safeInsert("sales", backup.data.sales, "বিক্রয়"));
      results.push(await safeInsert("purchases", backup.data.purchases, "ক্রয়"));
      results.push(await safeInsert("sale_items", backup.data.sale_items, "বিক্রয় আইটেম"));
      results.push(await safeInsert("purchase_items", backup.data.purchase_items, "ক্রয় আইটেম"));
      results.push(await safeInsert("returns", backup.data.returns, "রিটার্ন"));

      const totalFailed = results.reduce((s, r) => s + r.failed, 0);
      const totalInserted = results.reduce((s, r) => s + r.inserted, 0);

      setRestoreReport({ results });
      setShowReportDialog(true);

      // Post-restore validation: compare backup counts vs DB counts
      try {
        const vr = await validateAfterRestore(backup);
        setValidationReport(vr);
        if (vr.allMatch) {
          toast.success(`✅ ভ্যালিডেশন: সব টেবিলের রেকর্ড কাউন্ট মিলে গেছে`);
        } else {
          toast.warning(`⚠️ ভ্যালিডেশন: কিছু টেবিলে কাউন্ট মিলছে না — রিপোর্ট দেখুন`);
        }
      } catch (e) {
        console.error("Validation failed", e);
      }

      if (totalFailed === 0) {
        toast.success(`সফলভাবে রিস্টোর হয়েছে! মোট ${totalInserted} সারি যুক্ত হয়েছে`);
      } else {
        toast.warning(`রিস্টোর সম্পন্ন: ${totalInserted} সফল, ${totalFailed} ব্যর্থ`);
      }

      await ActivityLogger.dataRestore();
    } catch (error: any) {
      toast.error("রিস্টোর ব্যর্থ: " + error.message);
    } finally {
      setIsRestoring(false);
      setPreviewBackup(null);
    }
  };

  const fetchResetStats = async () => {
    try {
      const [salesRes, saleItemsRes, returnsRes, purchasesRes, purchaseItemsRes, productsRes, customersRes, suppliersRes, categoriesRes] = await Promise.all([
        supabase.from("sales").select("total_amount", { count: "exact" }),
        supabase.from("sale_items").select("*", { count: "exact", head: true }),
        supabase.from("returns").select("*", { count: "exact", head: true }),
        supabase.from("purchases").select("*", { count: "exact", head: true }),
        supabase.from("purchase_items").select("*", { count: "exact", head: true }),
        supabase.from("products").select("*", { count: "exact", head: true }),
        supabase.from("customers").select("*", { count: "exact", head: true }),
        supabase.from("suppliers").select("*", { count: "exact", head: true }),
        supabase.from("categories").select("*", { count: "exact", head: true }),
      ]);

      const totalRevenue = salesRes.data?.reduce((sum, sale) => sum + Number(sale.total_amount || 0), 0) || 0;

      setResetStats({
        sales: salesRes.count || 0,
        saleItems: saleItemsRes.count || 0,
        returns: returnsRes.count || 0,
        purchases: purchasesRes.count || 0,
        purchaseItems: purchaseItemsRes.count || 0,
        products: productsRes.count || 0,
        customers: customersRes.count || 0,
        suppliers: suppliersRes.count || 0,
        categories: categoriesRes.count || 0,
        totalRevenue,
      });
      setShowResetDialog(true);
    } catch (error: any) {
      toast.error("Failed to fetch statistics: " + error.message);
    }
  };

  const fetchSalesStats = async () => {
    try {
      const [salesRes, saleItemsRes, returnsRes] = await Promise.all([
        supabase.from("sales").select("total_amount", { count: "exact" }),
        supabase.from("sale_items").select("*", { count: "exact", head: true }),
        supabase.from("returns").select("*", { count: "exact", head: true }),
      ]);

      const totalRevenue = salesRes.data?.reduce((sum, sale) => sum + Number(sale.total_amount || 0), 0) || 0;

      setSalesStats({
        sales: salesRes.count || 0,
        saleItems: saleItemsRes.count || 0,
        returns: returnsRes.count || 0,
        totalRevenue,
      });
      setShowClearSalesDialog(true);
    } catch (error: any) {
      toast.error("Failed to fetch sales statistics: " + error.message);
    }
  };

  const handleClearSalesData = async () => {
    setIsClearingSales(true);
    setShowClearSalesDialog(false);
    try {
      toast.info("Clearing sales data...");

      // Delete in correct order respecting foreign keys
      // 1. Delete returns first (references sale_items)
      toast.info("Clearing returns...");
      const returnsResult = await supabase.from("returns").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      if (returnsResult.error) throw returnsResult.error;
      
      // 2. Delete sale_items
      toast.info("Clearing sale items...");
      const saleItemsResult = await supabase.from("sale_items").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      if (saleItemsResult.error) throw saleItemsResult.error;
      
      // 3. Delete sales
      toast.info("Clearing sales records...");
      const salesResult = await supabase.from("sales").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      if (salesResult.error) throw salesResult.error;

      toast.success("Sales data cleared successfully! Refreshing...");
      await ActivityLogger.dataReset();
      setTimeout(() => window.location.reload(), 1500);
    } catch (error: any) {
      toast.error("Clear sales failed: " + error.message);
      console.error("Clear sales error:", error);
    } finally {
      setIsClearingSales(false);
      setSalesStats(null);
    }
  };

  const handleReset = async () => {
    setIsResetting(true);
    setShowResetDialog(false);
    try {
      toast.info("Resetting database...");

      // Delete in correct order respecting foreign keys
      // 1. Delete returns first (references sale_items)
      toast.info("Clearing returns...");
      const returnsResult = await supabase.from("returns").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      if (returnsResult.error) throw returnsResult.error;
      
      // 2. Delete sale_items and purchase_items (all transaction details)
      toast.info("Clearing sale items and purchase items...");
      const [saleItemsResult, purchaseItemsResult] = await Promise.all([
        supabase.from("sale_items").delete().neq("id", "00000000-0000-0000-0000-000000000000"),
        supabase.from("purchase_items").delete().neq("id", "00000000-0000-0000-0000-000000000000"),
      ]);
      if (saleItemsResult.error) throw saleItemsResult.error;
      if (purchaseItemsResult.error) throw purchaseItemsResult.error;
      
      // 3. Delete sales and purchases (all sales reports data)
      toast.info("Clearing all sales and purchase records...");
      const [salesResult, purchasesResult] = await Promise.all([
        supabase.from("sales").delete().neq("id", "00000000-0000-0000-0000-000000000000"),
        supabase.from("purchases").delete().neq("id", "00000000-0000-0000-0000-000000000000"),
      ]);
      if (salesResult.error) throw salesResult.error;
      if (purchasesResult.error) throw purchasesResult.error;

      // 4. Delete products (references categories)
      toast.info("Clearing products...");
      const productsResult = await supabase.from("products").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      if (productsResult.error) throw productsResult.error;

      // 5. Delete base tables (customers, suppliers, categories)
      toast.info("Clearing customers, suppliers, and categories...");
      const [customersResult, suppliersResult, categoriesResult] = await Promise.all([
        supabase.from("customers").delete().neq("id", "00000000-0000-0000-0000-000000000000"),
        supabase.from("suppliers").delete().neq("id", "00000000-0000-0000-0000-000000000000"),
        supabase.from("categories").delete().neq("id", "00000000-0000-0000-0000-000000000000"),
      ]);
      if (customersResult.error) throw customersResult.error;
      if (suppliersResult.error) throw suppliersResult.error;
      if (categoriesResult.error) throw categoriesResult.error;

      toast.success("All data including sales reports completely reset! Refreshing...");
      await ActivityLogger.dataReset();
      setTimeout(() => window.location.reload(), 1500);
    } catch (error: any) {
      toast.error("Reset failed: " + error.message);
      console.error("Reset error:", error);
    } finally {
      setIsResetting(false);
      setResetStats(null);
    }
  };

  const totalRecords = stats
    ? stats.products + stats.categories + stats.customers + stats.suppliers + stats.sales + stats.purchases + stats.saleItems + stats.purchaseItems + stats.returns
    : 0;

  return (
    <div className="flex flex-col h-screen animate-fade-in">
      {/* Fixed Header */}
      <div className="sticky top-0 z-10 bg-white dark:bg-gray-950 border-b border-border pb-4">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Settings</h1>
            <p className="text-muted-foreground mt-1">Manage your account and system data</p>
          </div>
          <img src={logoSrc} alt={settings.shop_name} className="w-20 h-20" />
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto pb-6 space-y-6">
        {/* Database Statistics */}
        <Card className="p-6">
        <h2 className="text-xl font-semibold mb-4 text-foreground">📊 Database Statistics</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-primary/5 rounded-lg p-4">
            <p className="text-sm text-muted-foreground">Products</p>
            <p className="text-2xl font-bold text-primary">{stats?.products || 0}</p>
          </div>
          <div className="bg-accent/5 rounded-lg p-4">
            <p className="text-sm text-muted-foreground">Categories</p>
            <p className="text-2xl font-bold text-accent">{stats?.categories || 0}</p>
          </div>
          <div className="bg-primary/5 rounded-lg p-4">
            <p className="text-sm text-muted-foreground">Customers</p>
            <p className="text-2xl font-bold text-primary">{stats?.customers || 0}</p>
          </div>
          <div className="bg-accent/5 rounded-lg p-4">
            <p className="text-sm text-muted-foreground">Suppliers</p>
            <p className="text-2xl font-bold text-accent">{stats?.suppliers || 0}</p>
          </div>
          <div className="bg-primary/5 rounded-lg p-4">
            <p className="text-sm text-muted-foreground">Sales</p>
            <p className="text-2xl font-bold text-primary">{stats?.sales || 0}</p>
          </div>
          <div className="bg-accent/5 rounded-lg p-4">
            <p className="text-sm text-muted-foreground">Purchases</p>
            <p className="text-2xl font-bold text-accent">{stats?.purchases || 0}</p>
          </div>
        </div>

        {/* Profit Statistics with Date Filter */}
        <div className="mt-6 pt-6 border-t border-border">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
            <h3 className="text-lg font-semibold text-foreground">💰 Profit Statistics</h3>
            <div className="flex flex-wrap gap-2">
              <Button
                variant={activePeriod === "all" ? "default" : "outline"}
                size="sm"
                onClick={() => setPeriod("all")}
              >
                All Time
              </Button>
              <Button
                variant={activePeriod === "today" ? "default" : "outline"}
                size="sm"
                onClick={() => setPeriod("today")}
              >
                Today
              </Button>
              <Button
                variant={activePeriod === "week" ? "default" : "outline"}
                size="sm"
                onClick={() => setPeriod("week")}
              >
                This Week
              </Button>
              <Button
                variant={activePeriod === "month" ? "default" : "outline"}
                size="sm"
                onClick={() => setPeriod("month")}
              >
                This Month
              </Button>
            </div>
          </div>
          
          <div className="flex flex-wrap gap-2 mb-4">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className={cn("justify-start text-left font-normal", !profitDateFrom && "text-muted-foreground")}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {profitDateFrom ? format(profitDateFrom, "PPP") : "From date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={profitDateFrom}
                  onSelect={(date) => { setProfitDateFrom(date); setActivePeriod("custom"); }}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className={cn("justify-start text-left font-normal", !profitDateTo && "text-muted-foreground")}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {profitDateTo ? format(profitDateTo, "PPP") : "To date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={profitDateTo}
                  onSelect={(date) => { setProfitDateTo(date); setActivePeriod("custom"); }}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
            {(profitDateFrom || profitDateTo) && (
              <Button variant="ghost" size="sm" onClick={() => setPeriod("all")}>
                Clear
              </Button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-green-500/10 rounded-lg p-4">
              <p className="text-sm text-muted-foreground">নতুন মোবাইল লাভ</p>
              <p className="text-2xl font-bold text-green-600">৳{(profitStats?.newMobileProfit || 0).toLocaleString('bn-BD')}</p>
            </div>
            <div className="bg-blue-500/10 rounded-lg p-4">
              <p className="text-sm text-muted-foreground">ব্যবহৃত মোবাইল লাভ</p>
              <p className="text-2xl font-bold text-blue-600">৳{(profitStats?.usedMobileProfit || 0).toLocaleString('bn-BD')}</p>
            </div>
            <div className="bg-emerald-500/10 rounded-lg p-4">
              <p className="text-sm text-muted-foreground">মোট লাভ</p>
              <p className="text-2xl font-bold text-emerald-600">৳{(profitStats?.totalProfit || 0).toLocaleString('bn-BD')}</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
          <div className="bg-primary/5 rounded-lg p-4">
            <p className="text-sm text-muted-foreground">বিক্রয় আইটেম</p>
            <p className="text-2xl font-bold text-primary">{stats?.saleItems || 0}</p>
          </div>
          <div className="bg-accent/5 rounded-lg p-4">
            <p className="text-sm text-muted-foreground">ক্রয় আইটেম</p>
            <p className="text-2xl font-bold text-accent">{stats?.purchaseItems || 0}</p>
          </div>
          <div className="bg-primary/5 rounded-lg p-4">
            <p className="text-sm text-muted-foreground">রিটার্ন</p>
            <p className="text-2xl font-bold text-primary">{stats?.returns || 0}</p>
          </div>
        </div>
        <div className="mt-4 pt-4 border-t border-border flex flex-wrap items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            মোট রেকর্ড: <span className="font-bold text-foreground">{totalRecords}</span>
          </p>
          <StockSyncCheck />
        </div>
        </Card>

        {/* Staff Performance Report */}
        <StaffPerformanceReport />

        {/* User Management */}
        <UserManagement />

        {/* Activity Log */}
        <ActivityLog />

      {/* Backup & Restore */}
      <Card className="p-6">
        <h2 className="text-xl font-semibold mb-4 text-foreground">💾 Backup & Restore</h2>
        <div className="space-y-4">
          <div>
            <h3 className="font-medium mb-2">Backup Database</h3>
            <p className="text-sm text-muted-foreground mb-3">
              Export all your data to a JSON file. This includes products, categories, customers, suppliers, sales, purchases, returns, and all transaction details.
            </p>
            <Button
              onClick={handleBackup}
              disabled={isBackingUp}
              className="w-full md:w-auto"
            >
              {isBackingUp ? "⏳ Creating Backup..." : "📥 Download Backup"}
            </Button>
          </div>

          <div className="pt-4 border-t border-border">
            <h3 className="font-medium mb-2">Restore Database</h3>
            <p className="text-sm text-muted-foreground mb-3">
              ব্যাকআপ ফাইল আপলোড করুন। প্রথমে preview দেখানো হবে — আপনি নিশ্চিত করার পরই ডেটা প্রতিস্থাপিত হবে। ⚠️ সতর্কতা: এটি বিদ্যমান সব ডেটা মুছে দেবে!
            </p>
            <div>
              <input
                type="file"
                accept=".json"
                onChange={handleRestoreFileSelect}
                disabled={isRestoring}
                className="hidden"
                id="restore-file"
              />
              <Button
                onClick={() => document.getElementById("restore-file")?.click()}
                disabled={isRestoring}
                variant="outline"
                className="w-full md:w-auto"
              >
                {isRestoring ? "⏳ Restoring..." : "📤 ব্যাকআপ ফাইল আপলোড করুন"}
              </Button>
            </div>
          </div>

          {/* Preview dialog — shown before restore actually runs */}
          <Dialog open={showPreviewDialog} onOpenChange={setShowPreviewDialog}>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>📋 ব্যাকআপ Preview</DialogTitle>
                <DialogDescription>
                  নিচের ডেটা আপনার বর্তমান ডেটাবেজে প্রতিস্থাপিত হবে। নিশ্চিত হলে "রিস্টোর শুরু করুন" চাপুন।
                </DialogDescription>
              </DialogHeader>
              {previewBackup && (
                <div className="space-y-3">
                  <div className="text-xs text-muted-foreground">
                    <div>ভার্সন: <span className="font-mono">{previewBackup.version}</span></div>
                    <div>তৈরির সময়: <span className="font-mono">{previewBackup.timestamp ? new Date(previewBackup.timestamp).toLocaleString("bn-BD") : "—"}</span></div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    {[
                      { key: "products", label: "📱 প্রোডাক্ট" },
                      { key: "categories", label: "🏷️ ক্যাটাগরি" },
                      { key: "customers", label: "👥 কাস্টমার" },
                      { key: "suppliers", label: "🚚 সরবরাহকারী" },
                      { key: "sales", label: "💰 বিক্রয়" },
                      { key: "sale_items", label: "🧾 বিক্রয় আইটেম" },
                      { key: "purchases", label: "🛒 ক্রয়" },
                      { key: "purchase_items", label: "📦 ক্রয় আইটেম" },
                      { key: "returns", label: "↩️ রিটার্ন" },
                    ].map((row) => (
                      <div key={row.key} className="flex justify-between rounded border border-border bg-muted/40 px-3 py-2">
                        <span>{row.label}</span>
                        <span className="font-semibold">{(previewBackup.data?.[row.key] || []).length}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => { setShowPreviewDialog(false); setPreviewBackup(null); }}>
                  বাতিল
                </Button>
                <Button onClick={runRestore} disabled={isRestoring}>
                  {isRestoring ? "⏳ চলছে..." : "রিস্টোর শুরু করুন"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Report dialog — shown after restore finishes */}
          <Dialog open={showReportDialog} onOpenChange={(open) => {
            setShowReportDialog(open);
            if (!open) setTimeout(() => window.location.reload(), 300);
          }}>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>📊 রিস্টোর রিপোর্ট</DialogTitle>
                <DialogDescription>
                  প্রতিটি টেবিলের জন্য সফল ও ব্যর্থ সারির বিস্তারিত নিচে দেখানো হলো।
                </DialogDescription>
              </DialogHeader>
              {restoreReport && (
                <ScrollArea className="max-h-[60vh] pr-3">
                  <div className="space-y-3">
                    {restoreReport.results.map((r) => (
                      <div key={r.table} className="rounded border border-border p-3">
                        <div className="flex items-center justify-between">
                          <div className="font-medium">{r.label}</div>
                          <div className="text-sm">
                            <span className="text-foreground">মোট {r.total}</span>
                            <span className="mx-2">·</span>
                            <span className="text-primary">সফল {r.inserted}</span>
                            {r.failed > 0 && (
                              <>
                                <span className="mx-2">·</span>
                                <span className="text-destructive">ব্যর্থ {r.failed}</span>
                              </>
                            )}
                          </div>
                        </div>
                        {r.errors.length > 0 && (
                          <details className="mt-2">
                            <summary className="cursor-pointer text-sm text-destructive">ব্যর্থ সারির বিবরণ দেখুন ({r.errors.length})</summary>
                            <div className="mt-2 space-y-2">
                              {r.errors.slice(0, 20).map((e, idx) => (
                                <div key={idx} className="rounded bg-muted/50 p-2 text-xs">
                                  <div className="font-medium text-destructive">{e.message}</div>
                                  {e.row?.id && <div className="mt-1 font-mono text-muted-foreground">id: {e.row.id}</div>}
                                  {(e.row?.name || e.row?.imei) && (
                                    <div className="mt-1 text-muted-foreground">
                                      {e.row?.name && <>name: {e.row.name} </>}
                                      {e.row?.imei && <>· imei: {e.row.imei}</>}
                                    </div>
                                  )}
                                </div>
                              ))}
                              {r.errors.length > 20 && (
                                <div className="text-xs text-muted-foreground">+ আরও {r.errors.length - 20}টি ব্যর্থ সারি (কনসোলে দেখুন)</div>
                              )}
                            </div>
                          </details>
                        )}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
              <DialogFooter>
                <Button onClick={() => { setShowReportDialog(false); setTimeout(() => window.location.reload(), 300); }}>
                  বন্ধ করুন ও রিফ্রেশ করুন
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </Card>

      {/* Reset Database */}
      <Card className="p-6 border-destructive/50">
        <h2 className="text-xl font-semibold mb-4 text-destructive">⚠️ Danger Zone</h2>
        <div className="space-y-4">
          {/* Clear Sales Data Only */}
          <div>
            <h3 className="font-medium mb-2">Clear Sales Data Only</h3>
            <p className="text-sm text-muted-foreground mb-3">
              Delete only sales records, sale items, and returns. Products, customers, suppliers, and categories will be kept intact.
            </p>
            <Button 
              variant="outline" 
              disabled={isClearingSales} 
              className="w-full md:w-auto border-orange-500 text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-950"
              onClick={fetchSalesStats}
            >
              {isClearingSales ? "⏳ Clearing..." : "🧹 Clear Sales Data"}
            </Button>
            
            <AlertDialog open={showClearSalesDialog} onOpenChange={setShowClearSalesDialog}>
              <AlertDialogContent className="max-w-xl">
                <AlertDialogHeader>
                  <AlertDialogTitle className="text-2xl">⚠️ Clear Sales Data</AlertDialogTitle>
                  <AlertDialogDescription className="space-y-4">
                    <p className="text-base font-semibold">
                      The following sales data will be permanently deleted:
                    </p>
                    
                    {salesStats && (
                      <div className="space-y-3 bg-muted p-4 rounded-lg">
                        <div className="space-y-2">
                          <h4 className="font-semibold text-foreground">Sales & Transactions</h4>
                          <div className="space-y-1 text-sm">
                            <p className="flex justify-between">
                              <span>Sales Records:</span>
                              <span className="font-semibold text-destructive">{salesStats.sales}</span>
                            </p>
                            <p className="flex justify-between">
                              <span>Sale Items:</span>
                              <span className="font-semibold text-destructive">{salesStats.saleItems}</span>
                            </p>
                            <p className="flex justify-between">
                              <span>Total Revenue:</span>
                              <span className="font-semibold text-destructive">৳{salesStats.totalRevenue.toLocaleString()}</span>
                            </p>
                            <p className="flex justify-between">
                              <span>Returns:</span>
                              <span className="font-semibold text-destructive">{salesStats.returns}</span>
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 p-3 rounded-lg">
                      <p className="text-sm text-green-700 dark:text-green-400 font-semibold">
                        ✅ Products, Customers, Suppliers, and Categories will remain unchanged
                      </p>
                    </div>

                    <div className="bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-800 p-3 rounded-lg">
                      <p className="text-sm text-orange-700 dark:text-orange-400 font-semibold">
                        ⚠️ This action cannot be undone. Make sure you have a backup if needed.
                      </p>
                    </div>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleClearSalesData} className="bg-orange-600 text-white hover:bg-orange-700">
                    Clear Sales Data
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>

          <div className="border-t border-border pt-4">
            <h3 className="font-medium mb-2">Reset Database</h3>
            <p className="text-sm text-muted-foreground mb-3">
              Permanently delete ALL data from the database. This action cannot be undone!
            </p>
            <Button 
              variant="destructive" 
              disabled={isResetting} 
              className="w-full md:w-auto"
              onClick={fetchResetStats}
            >
              {isResetting ? "⏳ Resetting..." : "🗑️ Reset All Data"}
            </Button>
            
            <AlertDialog open={showResetDialog} onOpenChange={setShowResetDialog}>
              <AlertDialogContent className="max-w-2xl">
                <AlertDialogHeader>
                  <AlertDialogTitle className="text-2xl">⚠️ Confirm Database Reset</AlertDialogTitle>
                  <AlertDialogDescription className="space-y-4">
                    <p className="text-base font-semibold">
                      The following data will be permanently deleted:
                    </p>
                    
                    {resetStats && (
                      <div className="space-y-3 bg-muted p-4 rounded-lg">
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-2">
                            <h4 className="font-semibold text-foreground">Sales & Transactions</h4>
                            <div className="space-y-1 text-sm">
                              <p className="flex justify-between">
                                <span>Sales Records:</span>
                                <span className="font-semibold text-destructive">{resetStats.sales}</span>
                              </p>
                              <p className="flex justify-between">
                                <span>Sale Items:</span>
                                <span className="font-semibold text-destructive">{resetStats.saleItems}</span>
                              </p>
                              <p className="flex justify-between">
                                <span>Total Revenue:</span>
                                <span className="font-semibold text-destructive">৳{resetStats.totalRevenue.toLocaleString()}</span>
                              </p>
                              <p className="flex justify-between">
                                <span>Returns:</span>
                                <span className="font-semibold text-destructive">{resetStats.returns}</span>
                              </p>
                            </div>
                          </div>

                          <div className="space-y-2">
                            <h4 className="font-semibold text-foreground">Inventory & Data</h4>
                            <div className="space-y-1 text-sm">
                              <p className="flex justify-between">
                                <span>Products:</span>
                                <span className="font-semibold text-destructive">{resetStats.products}</span>
                              </p>
                              <p className="flex justify-between">
                                <span>Customers:</span>
                                <span className="font-semibold text-destructive">{resetStats.customers}</span>
                              </p>
                              <p className="flex justify-between">
                                <span>Suppliers:</span>
                                <span className="font-semibold text-destructive">{resetStats.suppliers}</span>
                              </p>
                              <p className="flex justify-between">
                                <span>Categories:</span>
                                <span className="font-semibold text-destructive">{resetStats.categories}</span>
                              </p>
                            </div>
                          </div>
                        </div>

                        <div className="pt-3 border-t border-border">
                          <div className="space-y-1 text-sm">
                            <p className="flex justify-between">
                              <span>Purchases:</span>
                              <span className="font-semibold text-destructive">{resetStats.purchases}</span>
                            </p>
                            <p className="flex justify-between">
                              <span>Purchase Items:</span>
                              <span className="font-semibold text-destructive">{resetStats.purchaseItems}</span>
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="bg-destructive/10 border border-destructive/30 p-3 rounded-lg">
                      <p className="text-sm text-destructive font-semibold">
                        ⚠️ This action cannot be undone! Make sure you have a backup before proceeding.
                      </p>
                    </div>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleReset} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    Yes, Delete Everything
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </Card>

      {/* Account */}
      <Card className="p-6">
        <h2 className="text-xl font-semibold mb-4 text-foreground">👤 Account</h2>
        <div className="space-y-4">
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-2">You are currently signed in</p>
            <Button
              variant="destructive"
              onClick={handleSignOut}
              className="w-full md:w-auto"
            >
              🚪 Sign Out
            </Button>
          </div>
        </div>
      </Card>

      {/* About */}
      <Card className="p-6">
        <h2 className="text-xl font-semibold mb-4 text-foreground">ℹ️ About</h2>
        <div className="space-y-2 text-sm text-muted-foreground">
          <p className="font-semibold text-lg text-foreground">{settings.shop_name}</p>
          <p>Shop Management System v1.0</p>
          <p>A comprehensive shop management solution for mobile phone businesses</p>
          <p className="pt-2 text-xs">
            Features: Products, Categories, POS, Customers, Suppliers, Purchase Orders, Reports, Backup & Restore
          </p>
        </div>
      </Card>

      {/* Hidden Branding Settings - unlocked by typing 331548 */}
      {showBranding && isAdmin && <BrandingSettings />}
      </div>
    </div>
  );
}
