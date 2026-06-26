import { useState, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { format } from "date-fns";
import { Search, Calendar, User, CreditCard, Package, Filter, X, FileDown, FileSpreadsheet, Image, TrendingUp, TrendingDown, DollarSign, ChevronDown, ChevronUp } from "lucide-react";
import { useReactToPrint } from "react-to-print";
import * as XLSX from "xlsx";
import { getCloudinaryThumbnail } from "@/utils/cloudinary";

interface SaleDetail {
  id: string;
  created_at: string;
  total_amount: number;
  paid_amount: number;
  due_amount: number;
  payment_method: string;
  status: string;
  notes: string | null;
  customer_id: string | null;
  instant_customer_name: string | null;
  instant_customer_phone: string | null;
  sale_image_url: string | null;
  customers: {
    name: string;
    phone: string | null;
    email: string | null;
    address: string | null;
    image_url: string | null;
  } | null;
  sale_items: Array<{
    quantity: number;
    unit_price: number;
    total_price: number;
    condition: string;
    products: {
      name: string;
      sku: string | null;
      imei: string | null;
      barcode: string | null;
      brand: string | null;
      model: string | null;
      image_url: string | null;
    };
  }>;
}

export function Sales() {
  const [searchTerm, setSearchTerm] = useState("");
  const [imeiSearch, setImeiSearch] = useState("");
  const [filterPaymentMethod, setFilterPaymentMethod] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterDueOnly, setFilterDueOnly] = useState(false);
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [filterCustomer, setFilterCustomer] = useState<string>("all");
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");
  const [selectedSale, setSelectedSale] = useState<SaleDetail | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [showFilters, setShowFilters] = useState(false);
  const [headerCollapsed, setHeaderCollapsed] = useState(false);
  const itemsPerPage = 10;
  const printRef = useRef<HTMLDivElement>(null);

  // Fetch sales data
  const { data: sales = [], isLoading } = useQuery({
    queryKey: ["sales"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select(`
          *,
          customers (name, phone, email, address, image_url),
          sale_items (
            quantity,
            unit_price,
            total_price,
            condition,
            products (name, sku, imei, barcode, brand, model, image_url)
          )
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;
      
      // Ensure sale_items is always an array
      return (data || []).map(sale => ({
        ...sale,
        sale_items: sale.sale_items || []
      })) as SaleDetail[];
    },
  });

  // Fetch customers for filter
  const { data: customers = [] } = useQuery({
    queryKey: ["customers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("id, name")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  // Filter and search logic
  const filteredSales = useMemo(() => {
    return sales.filter((sale) => {
      // Search filter (general)
      const searchLower = searchTerm.trim().toLowerCase();
      const matchesSearch =
        !searchLower ||
        sale.id.toLowerCase().includes(searchLower) ||
        sale.customers?.name?.toLowerCase().includes(searchLower) ||
        sale.customers?.phone?.toLowerCase().includes(searchLower) ||
        sale.instant_customer_name?.toLowerCase().includes(searchLower) ||
        sale.instant_customer_phone?.toLowerCase().includes(searchLower) ||
        (sale.sale_items || []).some(
          (item) =>
            item?.products?.name?.toLowerCase().includes(searchLower) ||
            item?.products?.imei?.toLowerCase().includes(searchLower) ||
            item?.products?.sku?.toLowerCase().includes(searchLower) ||
            item?.products?.barcode?.toLowerCase().includes(searchLower) ||
            item?.products?.brand?.toLowerCase().includes(searchLower) ||
            item?.products?.model?.toLowerCase().includes(searchLower)
        );

      // Dedicated IMEI search
      const imeiLower = imeiSearch.trim().toLowerCase();
      const matchesImei =
        !imeiLower ||
        (sale.sale_items || []).some((item) =>
          item?.products?.imei?.toLowerCase().includes(imeiLower)
        );

      // Payment method filter
      const matchesPaymentMethod =
        filterPaymentMethod === "all" || sale.payment_method === filterPaymentMethod;

      // Status filter
      const matchesStatus = filterStatus === "all" || sale.status === filterStatus;

      // Due-only filter
      const matchesDue = !filterDueOnly || Number(sale.due_amount) > 0;

      // Customer filter
      const matchesCustomer =
        filterCustomer === "all" || sale.customer_id === filterCustomer;

      // Amount range
      const total = Number(sale.total_amount) || 0;
      const matchesMin = !minAmount || total >= Number(minAmount);
      const matchesMax = !maxAmount || total <= Number(maxAmount);

      // Date filters
      const saleDate = new Date(sale.created_at);
      const matchesDateFrom =
        !filterDateFrom || saleDate >= new Date(filterDateFrom);
      const matchesDateTo =
        !filterDateTo || saleDate <= new Date(filterDateTo + "T23:59:59");

      return (
        matchesSearch &&
        matchesImei &&
        matchesPaymentMethod &&
        matchesStatus &&
        matchesDue &&
        matchesCustomer &&
        matchesMin &&
        matchesMax &&
        matchesDateFrom &&
        matchesDateTo
      );
    });
  }, [sales, searchTerm, imeiSearch, filterPaymentMethod, filterStatus, filterDueOnly, filterCustomer, minAmount, maxAmount, filterDateFrom, filterDateTo]);

  // Pagination
  const totalPages = Math.ceil(filteredSales.length / itemsPerPage);
  const paginatedSales = filteredSales.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // Stats
  const totalSales = filteredSales.length;
  const totalRevenue = filteredSales.reduce((sum, sale) => sum + Number(sale.total_amount), 0);
  const averageSale = totalSales > 0 ? totalRevenue / totalSales : 0;

  const clearFilters = () => {
    setSearchTerm("");
    setImeiSearch("");
    setFilterPaymentMethod("all");
    setFilterStatus("all");
    setFilterDueOnly(false);
    setFilterCustomer("all");
    setMinAmount("");
    setMaxAmount("");
    setFilterDateFrom("");
    setFilterDateTo("");
    setCurrentPage(1);
  };

  const hasActiveFilters =
    !!searchTerm ||
    !!imeiSearch ||
    filterPaymentMethod !== "all" ||
    filterStatus !== "all" ||
    filterDueOnly ||
    filterCustomer !== "all" ||
    !!minAmount ||
    !!maxAmount ||
    !!filterDateFrom ||
    !!filterDateTo;

  // PDF Export
  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `Sales_Report_${format(new Date(), "yyyy-MM-dd")}`,
  });

  // Excel Export
  const handleExportExcel = () => {
    const exportData = filteredSales.map((sale) => {
      const items = (sale.sale_items || []).map((item) => ({
        "Sale ID": sale.id.slice(0, 8),
        "Date": format(new Date(sale.created_at), "dd MMM yyyy"),
        "Time": format(new Date(sale.created_at), "hh:mm a"),
        "Customer": sale.customers?.name || "Walk-in",
        "Product": item?.products?.name || "N/A",
        "Brand": item?.products?.brand || "N/A",
        "Model": item?.products?.model || "N/A",
        "IMEI": item?.products?.imei || "N/A",
        "Condition": item?.condition || "N/A",
        "Quantity": item?.quantity || 0,
        "Unit Price": item?.unit_price || 0,
        "Total Price": item?.total_price || 0,
        "Payment Method": sale.payment_method,
        "Sale Total": sale.total_amount,
      }));
      return items;
    }).flat();

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Sales");

    // Auto-size columns
    const maxWidth = 20;
    const columns = Object.keys(exportData[0] || {});
    worksheet["!cols"] = columns.map(() => ({ wch: maxWidth }));

    XLSX.writeFile(workbook, `Sales_Report_${format(new Date(), "yyyy-MM-dd")}.xlsx`);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading sales data...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen animate-fade-in overflow-x-hidden">
      {/* Fixed Header */}
      <div className="sticky top-0 z-10 bg-white dark:bg-gray-950 border-b border-border pb-3 md:pb-4 space-y-3 md:space-y-4">
        <div className="flex items-start justify-between gap-2">
          <button
            type="button"
            onClick={() => setHeaderCollapsed((c) => !c)}
            className="flex items-start gap-2 flex-1 min-w-0 text-left lg:cursor-default"
            aria-expanded={!headerCollapsed}
          >
            <div className="min-w-0 flex-1">
              <h1 className="text-lg sm:text-2xl md:text-3xl font-bold text-foreground truncate">📋 বিক্রয় ইতিহাস</h1>
              {!headerCollapsed && (
                <p className="text-xs sm:text-sm md:text-base text-muted-foreground mt-1">সকল বিক্রয় লেনদেন দেখুন ও পরিচালনা করুন</p>
              )}
            </div>
            <span className="lg:hidden mt-1 text-muted-foreground shrink-0">
              {headerCollapsed ? <ChevronDown className="w-5 h-5" /> : <ChevronUp className="w-5 h-5" />}
            </span>
          </button>
          <div className="hidden lg:flex flex-wrap gap-2">
            <Button onClick={handlePrint} variant="outline" className="gap-2 text-sm md:text-base" disabled={filteredSales.length === 0}>
              <FileDown className="h-4 w-4" />
              <span className="hidden sm:inline">Export PDF</span>
              <span className="sm:hidden">PDF</span>
            </Button>
            <Button onClick={handleExportExcel} variant="outline" className="gap-2 text-sm md:text-base" disabled={filteredSales.length === 0}>
              <FileSpreadsheet className="h-4 w-4" />
              <span className="hidden sm:inline">Export Excel</span>
              <span className="sm:hidden">Excel</span>
            </Button>
          </div>
        </div>

        {/* Collapsible content on mobile */}
        <div className={`${headerCollapsed ? "hidden lg:block" : "block"} space-y-3 md:space-y-4`}>
          <div className="flex flex-wrap gap-2 lg:hidden">
            <Button onClick={handlePrint} variant="outline" size="sm" className="gap-2 text-xs flex-1" disabled={filteredSales.length === 0}>
              <FileDown className="h-4 w-4" /> PDF
            </Button>
            <Button onClick={handleExportExcel} variant="outline" size="sm" className="gap-2 text-xs flex-1" disabled={filteredSales.length === 0}>
              <FileSpreadsheet className="h-4 w-4" /> Excel
            </Button>
          </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <Card className="card-hover">
          <CardHeader className="pb-3 p-4 md:p-6">
            <CardDescription className="text-xs md:text-sm">মোট বিক্রয়</CardDescription>
            <CardTitle className="text-2xl md:text-3xl text-primary">{totalSales}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="card-hover">
          <CardHeader className="pb-3 p-4 md:p-6">
            <CardDescription className="text-xs md:text-sm">মোট আয়</CardDescription>
            <CardTitle className="text-xl md:text-2xl text-accent">৳{totalRevenue.toLocaleString('bn-BD')}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="card-hover hidden lg:block">
          <CardHeader className="pb-3 p-4 md:p-6">
            <CardDescription className="text-xs md:text-sm">গড় বিক্রয়</CardDescription>
            <CardTitle className="text-xl md:text-2xl text-secondary">৳{averageSale.toFixed(0)}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="card-hover hidden lg:block">
          <CardHeader className="pb-3 p-4 md:p-6">
            <CardDescription className="text-xs md:text-sm">মোট বাকি</CardDescription>
            <CardTitle className="text-xl md:text-2xl text-destructive">
              ৳{filteredSales.reduce((sum, s) => sum + Number(s.due_amount), 0).toLocaleString('bn-BD')}
            </CardTitle>
          </CardHeader>
        </Card>
        </div>

        {/* Filters */}
        <Card>
        <CardHeader className="p-4 md:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <button 
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center gap-2 text-left"
            >
              <Filter className="h-4 w-4 md:h-5 md:w-5 text-primary" />
              <CardTitle className="text-base md:text-lg">ফিল্টার ও সার্চ</CardTitle>
              <span className="text-sm text-muted-foreground ml-2">
                {showFilters ? "▼" : "▶"}
              </span>
            </button>
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className="text-destructive hover:text-destructive text-sm self-start sm:self-auto"
              >
               <X className="h-4 w-4 mr-1" />
                <span className="hidden sm:inline">ফিল্টার মুছুন</span>
                <span className="sm:hidden">মুছুন</span>
              </Button>
            )}
          </div>
        </CardHeader>
        {showFilters && (
        <CardContent className="p-4 md:p-6 pt-0">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 md:gap-4">
            {/* Search */}
            <div className="sm:col-span-2 lg:col-span-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by ID, customer, product..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 text-sm md:text-base"
                />
              </div>
            </div>

            {/* Date From */}
            <div>
              <Input
                type="date"
                value={filterDateFrom}
                onChange={(e) => setFilterDateFrom(e.target.value)}
                placeholder="From Date"
                className="text-sm md:text-base"
              />
            </div>

            {/* Date To */}
            <div>
              <Input
                type="date"
                value={filterDateTo}
                onChange={(e) => setFilterDateTo(e.target.value)}
                placeholder="To Date"
                className="text-sm md:text-base"
              />
            </div>

            {/* Customer Filter */}
            <div>
              <Select value={filterCustomer} onValueChange={setFilterCustomer}>
                <SelectTrigger className="text-sm md:text-base">
                  <SelectValue placeholder="All Customers" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">সকল কাস্টমার</SelectItem>
                  {customers.map((customer) => (
                    <SelectItem key={customer.id} value={customer.id}>
                      {customer.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Payment Method Filter */}
            <div>
              <Select value={filterPaymentMethod} onValueChange={setFilterPaymentMethod}>
                <SelectTrigger className="text-sm md:text-base">
                  <SelectValue placeholder="All Payment Methods" />
                </SelectTrigger>
                 <SelectContent>
                  <SelectItem value="all">সকল পদ্ধতি</SelectItem>
                  <SelectItem value="cash">💵 নগদ</SelectItem>
                  <SelectItem value="card">💳 কার্ড</SelectItem>
                  <SelectItem value="mobile">📱 মোবাইল</SelectItem>
                  <SelectItem value="other">অন্যান্য</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* IMEI Dedicated Search */}
            <div className="sm:col-span-2 lg:col-span-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="📱 IMEI দিয়ে সার্চ করুন..."
                  value={imeiSearch}
                  onChange={(e) => setImeiSearch(e.target.value)}
                  inputMode="numeric"
                  className="pl-9 text-sm md:text-base font-mono"
                />
              </div>
            </div>

            {/* Status Filter */}
            <div>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="text-sm md:text-base">
                  <SelectValue placeholder="স্ট্যাটাস" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">সকল স্ট্যাটাস</SelectItem>
                  <SelectItem value="completed">সম্পন্ন</SelectItem>
                  <SelectItem value="pending">পেন্ডিং</SelectItem>
                  <SelectItem value="returned">রিটার্ন</SelectItem>
                  <SelectItem value="cancelled">বাতিল</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Min Amount */}
            <div>
              <Input
                type="number"
                placeholder="সর্বনিম্ন ৳"
                value={minAmount}
                onChange={(e) => setMinAmount(e.target.value)}
                className="text-sm md:text-base"
              />
            </div>

            {/* Max Amount */}
            <div>
              <Input
                type="number"
                placeholder="সর্বোচ্চ ৳"
                value={maxAmount}
                onChange={(e) => setMaxAmount(e.target.value)}
                className="text-sm md:text-base"
              />
            </div>

            {/* Due Only */}
            <div className="flex items-center gap-2 px-2">
              <input
                id="due-only"
                type="checkbox"
                checked={filterDueOnly}
                onChange={(e) => setFilterDueOnly(e.target.checked)}
                className="h-4 w-4 accent-primary"
              />
              <label htmlFor="due-only" className="text-sm cursor-pointer select-none">
                শুধু বাকি আছে এমন বিক্রয়
              </label>
            </div>
          </div>
        </CardContent>
        )}
        </Card>
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto pb-6 space-y-4 md:space-y-6">
        {/* Sales List */}
        <Card>
        <CardHeader className="p-4 md:p-6">
          <CardTitle className="text-base md:text-lg">
            বিক্রয় তালিকা ({filteredSales.length}টি)
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 md:p-6 pt-0">
          {paginatedSales.length === 0 ? (
            <div className="text-center py-8 md:py-12 text-muted-foreground">
              <Package className="h-10 w-10 md:h-12 md:w-12 mx-auto mb-3 md:mb-4 opacity-50" />
              <p className="text-sm md:text-base">কোন বিক্রয় পাওয়া যায়নি</p>
              {hasActiveFilters && (
                <Button variant="link" onClick={clearFilters} className="mt-2 text-sm md:text-base">
                  ফিল্টার মুছে সব দেখুন
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-2 md:space-y-3">
              {paginatedSales.map((sale) => {
                const firstProductImage = (sale.sale_items || []).find(i => i?.products?.image_url)?.products?.image_url;
                const customerImage = sale.customers?.image_url;
                const displayImage = sale.sale_image_url || customerImage || firstProductImage;
                const imeiList = (sale.sale_items || [])
                  .map(i => i?.products?.imei)
                  .filter(Boolean) as string[];
                const modelList = (sale.sale_items || [])
                  .map(i => [i?.products?.brand, i?.products?.model].filter(Boolean).join(' '))
                  .filter(Boolean);
                const customerPhone = sale.customers?.phone || sale.instant_customer_phone;
                
                return (
                <div
                  key={sale.id}
                  onClick={() => setSelectedSale(sale)}
                  className="border border-border rounded-lg p-3 md:p-4 hover:border-primary hover:bg-accent/5 cursor-pointer transition-all card-hover"
                >
                  <div className="flex gap-3">
                    {/* Thumbnail */}
                    {displayImage && (
                      <img
                        src={getCloudinaryThumbnail(displayImage, 80, 80)}
                        alt="বিক্রয়"
                        className="w-14 h-14 md:w-16 md:h-16 rounded-lg object-cover border border-border shrink-0"
                      />
                    )}
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 md:gap-3 flex-wrap">
                        <span className="font-mono text-xs md:text-sm font-semibold text-primary">
                          #{sale.id.slice(0, 8)}
                        </span>
                        <Badge variant={sale.status === "completed" ? "default" : "secondary"} className="text-xs">
                          {sale.status === "completed" ? "সম্পন্ন" : sale.status}
                        </Badge>
                        <Badge variant="outline" className="capitalize text-xs">
                          {sale.payment_method === "cash" ? "💵 নগদ" : sale.payment_method === "card" ? "💳 কার্ড" : sale.payment_method === "mobile" ? "📱 মোবাইল" : sale.payment_method}
                        </Badge>
                        {displayImage && <Image className="h-3 w-3 text-muted-foreground" />}
                      </div>

                      <div className="flex items-center gap-3 md:gap-4 text-xs md:text-sm text-muted-foreground flex-wrap mt-1">
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          <span className="hidden sm:inline">{format(new Date(sale.created_at), "dd MMM yyyy, hh:mm a")}</span>
                          <span className="sm:hidden">{format(new Date(sale.created_at), "dd MMM yyyy")}</span>
                        </div>
                        {(sale.customers || sale.instant_customer_name) && (
                          <div className="flex items-center gap-1">
                            <User className="h-3 w-3" />
                            <span className="truncate max-w-[120px]">{sale.customers?.name || sale.instant_customer_name}</span>
                          </div>
                        )}
                        {customerPhone && (
                          <div className="flex items-center gap-1">
                            <span>📞</span>
                            <span className="truncate">{customerPhone}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-1">
                          <Package className="h-3 w-3" />
                          {(sale.sale_items || []).length}টি পণ্য
                        </div>
                      </div>
                      
                      {/* Product names preview */}
                      <div className="text-xs text-muted-foreground mt-1 truncate">
                        {(sale.sale_items || []).map(i => i?.products?.name).filter(Boolean).join(', ')}
                      </div>
                      {modelList.length > 0 && (
                        <div className="text-xs text-muted-foreground mt-0.5 truncate">
                          📱 {modelList.join(', ')}
                        </div>
                      )}
                      {imeiList.length > 0 && (
                        <div className="text-[11px] font-mono text-primary/80 mt-0.5 break-all line-clamp-1">
                          IMEI: {imeiList.join(', ')}
                        </div>
                      )}
                    </div>


                    <div className="text-right shrink-0">
                      <div className="text-lg md:text-xl font-bold text-accent">
                        ৳{Number(sale.total_amount).toLocaleString('bn-BD')}
                      </div>
                      {Number(sale.paid_amount) > 0 && Number(sale.paid_amount) < Number(sale.total_amount) && (
                        <div className="text-xs text-muted-foreground">
                          পরিশোধ: ৳{Number(sale.paid_amount).toLocaleString('bn-BD')}
                        </div>
                      )}
                      {Number(sale.due_amount) > 0 && (
                        <div className="text-xs font-semibold text-destructive">
                          বাকি: ৳{Number(sale.due_amount).toLocaleString('bn-BD')}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                );
              })}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-4 md:mt-6 pt-4 md:pt-6 border-t">
              <div className="text-xs md:text-sm text-muted-foreground">
                পৃষ্ঠা {currentPage} / {totalPages}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="text-xs md:text-sm"
                >
                  পূর্ববর্তী
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="text-xs md:text-sm"
                >
                  পরবর্তী
                </Button>
              </div>
            </div>
          )}
        </CardContent>
        </Card>
      </div>

      {/* Sale Detail Dialog */}
      <Dialog open={!!selectedSale} onOpenChange={() => setSelectedSale(null)}>
        <DialogContent className="w-[95vw] max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg md:text-2xl">📋 বিক্রয় বিবরণ</DialogTitle>
            <DialogDescription className="text-sm">এই লেনদেনের সম্পূর্ণ তথ্য</DialogDescription>
          </DialogHeader>

          {selectedSale && (
            <div className="space-y-4 md:space-y-6">
              {/* Sale Image */}
              {selectedSale.sale_image_url && (
                <div className="rounded-lg overflow-hidden border border-border">
                  <img
                    src={getCloudinaryThumbnail(selectedSale.sale_image_url, 600, 400)}
                    alt="বিক্রয়ের ছবি"
                    className="w-full max-h-64 object-cover"
                  />
                </div>
              )}

              {/* Sale Info */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Card>
                  <CardHeader className="pb-2 p-3">
                    <CardDescription className="text-xs">সেল আইডি</CardDescription>
                    <CardTitle className="text-xs font-mono break-all">#{selectedSale.id.slice(0, 8)}</CardTitle>
                  </CardHeader>
                </Card>
                <Card>
                  <CardHeader className="pb-2 p-3">
                    <CardDescription className="text-xs">তারিখ</CardDescription>
                    <CardTitle className="text-xs">{format(new Date(selectedSale.created_at), "dd MMM yyyy, hh:mm a")}</CardTitle>
                  </CardHeader>
                </Card>
                <Card>
                  <CardHeader className="pb-2 p-3">
                    <CardDescription className="text-xs">পেমেন্ট</CardDescription>
                    <CardTitle className="text-xs capitalize">
                      {selectedSale.payment_method === "cash" ? "💵 নগদ" : selectedSale.payment_method === "card" ? "💳 কার্ড" : selectedSale.payment_method === "mobile" ? "📱 মোবাইল" : selectedSale.payment_method}
                    </CardTitle>
                  </CardHeader>
                </Card>
                <Card>
                  <CardHeader className="pb-2 p-3">
                    <CardDescription className="text-xs">স্ট্যাটাস</CardDescription>
                    <CardTitle className="text-xs">
                      <Badge variant={selectedSale.status === "completed" ? "default" : "secondary"} className="text-xs">
                        {selectedSale.status === "completed" ? "সম্পন্ন" : selectedSale.status}
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                </Card>
              </div>

              {/* Payment Summary */}
              <Card className="bg-primary/5">
                <CardContent className="p-4 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">মোট মূল্য:</span>
                    <span className="text-xl font-bold text-accent">৳{Number(selectedSale.total_amount).toLocaleString('bn-BD')}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">পরিশোধ:</span>
                    <span className="text-base font-semibold text-primary">৳{Number(selectedSale.paid_amount).toLocaleString('bn-BD')}</span>
                  </div>
                  {Number(selectedSale.due_amount) > 0 && (
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium text-destructive">বাকি:</span>
                      <span className="text-base font-bold text-destructive">৳{Number(selectedSale.due_amount).toLocaleString('bn-BD')}</span>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Customer Info */}
              {(selectedSale.customers || selectedSale.instant_customer_name) && (
                <Card>
                  <CardHeader className="p-3 md:p-4">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <User className="h-4 w-4" /> কাস্টমার তথ্য
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-3 md:p-4 pt-0">
                    <div className="flex gap-3">
                      {selectedSale.customers?.image_url && (
                        <img
                          src={getCloudinaryThumbnail(selectedSale.customers.image_url, 96, 96)}
                          alt={selectedSale.customers?.name || 'customer'}
                          className="w-20 h-20 rounded-lg object-cover border border-border shrink-0"
                        />
                      )}
                      <div className="flex-1 min-w-0 space-y-1.5">
                        <div className="flex justify-between gap-2">
                          <span className="text-xs text-muted-foreground">নাম:</span>
                          <span className="text-sm font-semibold text-right">{selectedSale.customers?.name || selectedSale.instant_customer_name}</span>
                        </div>
                        {(selectedSale.customers?.phone || selectedSale.instant_customer_phone) && (
                          <div className="flex justify-between gap-2">
                            <span className="text-xs text-muted-foreground">ফোন:</span>
                            <a
                              href={`tel:${selectedSale.customers?.phone || selectedSale.instant_customer_phone}`}
                              className="text-sm text-primary hover:underline text-right"
                            >
                              {selectedSale.customers?.phone || selectedSale.instant_customer_phone}
                            </a>
                          </div>
                        )}
                        {selectedSale.customers?.email && (
                          <div className="flex justify-between gap-2">
                            <span className="text-xs text-muted-foreground">ইমেইল:</span>
                            <span className="text-sm text-right break-all">{selectedSale.customers.email}</span>
                          </div>
                        )}
                        {selectedSale.customers?.address && (
                          <div className="flex justify-between gap-2">
                            <span className="text-xs text-muted-foreground">ঠিকানা:</span>
                            <span className="text-sm text-right">📍 {selectedSale.customers.address}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Products */}
              <Card>
                <CardHeader className="p-3 md:p-4">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Package className="h-4 w-4" /> বিক্রিত পণ্য
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-3 md:p-4 pt-0">
                  <div className="space-y-3">
                    {(selectedSale.sale_items || []).map((item, index) => (
                      <div key={index}>
                        <div className="flex gap-3">
                          {item.products.image_url && (
                            <img
                              src={getCloudinaryThumbnail(item.products.image_url, 80, 80)}
                              alt={item.products.name}
                              className="w-12 h-12 rounded-lg object-cover border border-border shrink-0"
                            />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-semibold">{item.products.name}</div>
                            <div className="text-xs text-muted-foreground space-y-0.5">
                              {item.products.brand && <span>ব্র্যান্ড: {item.products.brand} </span>}
                              {item.products.model && <span>| মডেল: {item.products.model}</span>}
                              {item.products.imei && <div className="break-all">IMEI: {item.products.imei}</div>}
                              <div>কন্ডিশন: <Badge variant="outline" className="capitalize text-xs">{item.condition}</Badge></div>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="text-xs text-muted-foreground">{item.quantity} × ৳{Number(item.unit_price).toLocaleString('bn-BD')}</div>
                            <div className="text-sm font-semibold text-accent">৳{Number(item.total_price).toLocaleString('bn-BD')}</div>
                          </div>
                        </div>
                        {index < (selectedSale.sale_items || []).length - 1 && <Separator className="mt-3" />}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Notes */}
              {selectedSale.notes && (
                <Card>
                  <CardHeader className="p-3"><CardTitle className="text-sm">📝 নোট</CardTitle></CardHeader>
                  <CardContent className="p-3 pt-0">
                    <p className="text-xs text-muted-foreground">{selectedSale.notes}</p>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Hidden Print Component */}
      <div className="hidden">
        <div ref={printRef} className="p-8 bg-white text-black">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold mb-2">বিক্রয় রিপোর্ট</h1>
            <p className="text-gray-600">তারিখ: {format(new Date(), "dd MMMM yyyy, hh:mm a")}</p>
            {hasActiveFilters && (
              <div className="mt-4 text-sm text-gray-600">
                <p className="font-semibold">প্রয়োগকৃত ফিল্টার:</p>
                {searchTerm && <p>সার্চ: {searchTerm}</p>}
                {filterPaymentMethod !== "all" && <p>পেমেন্ট: {filterPaymentMethod}</p>}
                {filterCustomer !== "all" && <p>কাস্টমার: {customers.find(c => c.id === filterCustomer)?.name}</p>}
                {filterDateFrom && <p>থেকে: {format(new Date(filterDateFrom), "dd MMM yyyy")}</p>}
                {filterDateTo && <p>পর্যন্ত: {format(new Date(filterDateTo), "dd MMM yyyy")}</p>}
              </div>
            )}
          </div>

          <div className="grid grid-cols-4 gap-4 mb-8 pb-4 border-b-2 border-gray-300">
            <div className="text-center">
              <p className="text-gray-600 text-sm">মোট বিক্রয়</p>
              <p className="text-2xl font-bold">{totalSales}</p>
            </div>
            <div className="text-center">
              <p className="text-gray-600 text-sm">মোট আয়</p>
              <p className="text-2xl font-bold">৳{totalRevenue.toLocaleString()}</p>
            </div>
            <div className="text-center">
              <p className="text-gray-600 text-sm">গড় বিক্রয়</p>
              <p className="text-2xl font-bold">৳{averageSale.toFixed(0)}</p>
            </div>
            <div className="text-center">
              <p className="text-gray-600 text-sm">মোট বাকি</p>
              <p className="text-2xl font-bold">৳{filteredSales.reduce((sum, s) => sum + Number(s.due_amount), 0).toLocaleString()}</p>
            </div>
          </div>

          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b-2 border-gray-300">
                <th className="text-left p-2 text-sm font-semibold">তারিখ</th>
                <th className="text-left p-2 text-sm font-semibold">আইডি</th>
                <th className="text-left p-2 text-sm font-semibold">কাস্টমার</th>
                <th className="text-left p-2 text-sm font-semibold">পণ্য</th>
                <th className="text-left p-2 text-sm font-semibold">পেমেন্ট</th>
                <th className="text-right p-2 text-sm font-semibold">মোট</th>
                <th className="text-right p-2 text-sm font-semibold">বাকি</th>
              </tr>
            </thead>
            <tbody>
              {filteredSales.map((sale) => (
                <tr key={sale.id} className="border-b border-gray-200">
                  <td className="p-2 text-xs">{format(new Date(sale.created_at), "dd MMM yyyy")}</td>
                  <td className="p-2 text-xs font-mono">#{sale.id.slice(0, 8)}</td>
                  <td className="p-2 text-xs">{sale.customers?.name || sale.instant_customer_name || "ওয়াক-ইন"}</td>
                  <td className="p-2 text-xs">
                    {(sale.sale_items || []).map((item, idx) => (
                      <div key={idx}>
                        {item?.products?.name} ({item?.quantity}x)
                        {item?.products?.imei && <span className="text-gray-500"> - {item.products.imei}</span>}
                      </div>
                    ))}
                  </td>
                  <td className="p-2 text-xs capitalize">{sale.payment_method}</td>
                  <td className="p-2 text-xs text-right font-semibold">৳{Number(sale.total_amount).toLocaleString()}</td>
                  <td className="p-2 text-xs text-right font-semibold text-red-600">{Number(sale.due_amount) > 0 ? `৳${Number(sale.due_amount).toLocaleString()}` : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-8 pt-4 border-t-2 border-gray-300 text-right">
            <p className="text-lg font-bold">মোট: ৳{totalRevenue.toLocaleString()}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
