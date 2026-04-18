import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { ProductHistory } from "./ProductHistory";
import { ProductDetailModal } from "./ProductDetailModal";
import { BarcodeScanner } from "./BarcodeScanner";
import { ProductQuickView } from "./ProductQuickView";
import { Eye, ScanBarcode, Download, FileSpreadsheet, FileText, ChevronDown, ChevronUp, Filter, ArrowUpDown, LayoutGrid, List } from "lucide-react";
import { ActivityLogger } from "@/hooks/useActivityLog";
import * as XLSX from "xlsx";
import { CloudinaryImageUpload } from "./CloudinaryImageUpload";
import { getCloudinaryThumbnail } from "@/utils/cloudinary";
export function Products() {
  const [supplierMode, setSupplierMode] = useState<"existing" | "custom">("existing");
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [historyProduct, setHistoryProduct] = useState<{ imei: string; name: string } | null>(null);
  const [detailProduct, setDetailProduct] = useState<any>(null);
  const [quickViewIndex, setQuickViewIndex] = useState<number>(-1);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterCondition, setFilterCondition] = useState<string>("all");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterSupplier, setFilterSupplier] = useState<string>("all");
  const [showScanner, setShowScanner] = useState(false);
  const [showImeiScanner, setShowImeiScanner] = useState(false);
  const [showOutOfStock, setShowOutOfStock] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [sortBy, setSortBy] = useState<string>("name-asc");
  const [viewMode, setViewMode] = useState<"grid" | "compact">("grid");
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const [formData, setFormData] = useState({
    name: "",
    category_id: "",
    sku: "",
    barcode: "",
    imei: "",
    brand: "",
    model: "",
    condition: "",
    price: "",
    cost: "",
    unit: "pcs",
    ram: "",
    storage: "",
    battery: "",
    supplier_name: "",
    supplier_mobile: "",
    supplier_nid: "",
    product_entry_date: new Date().toISOString().split('T')[0],
    warranty_status: "no_warranty",
    image_url: "",
  });

  const queryClient = useQueryClient();

  const { data: products } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*, categories(name)")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: categories } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data, error } = await supabase.from("categories").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: suppliers } = useQuery({
    queryKey: ["suppliers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("suppliers").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const addMutation = useMutation({
    mutationFn: async (data: any) => {
      const { data: inserted, error } = await supabase.from("products").insert([data]).select().single();
      if (error) throw error;
      return { ...inserted, name: data.name };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast.success("Product added successfully!");
      ActivityLogger.productAdded(result.name, result.id);
      setIsAddDialogOpen(false);
      resetForm();
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to add product");
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const { error } = await supabase.from("products").update(data).eq("id", id);
      if (error) throw error;
      return { id, name: data.name };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast.success("Product updated successfully!");
      ActivityLogger.productUpdated(result.name, result.id);
      setEditingProduct(null);
      resetForm();
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to update product");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { error } = await supabase.from("products").delete().eq("id", id);
      if (error) throw error;
      return name;
    },
    onSuccess: (name) => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast.success("Product deleted successfully!");
      ActivityLogger.productDeleted(name);
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to delete product");
    },
  });

  const resetForm = () => {
    setSupplierMode("existing");
    setSelectedSupplierId("");
    setFormData({
      name: "",
      category_id: "",
      sku: "",
      barcode: "",
      imei: "",
      brand: "",
      model: "",
      condition: "",
      price: "",
      cost: "",
      unit: "pcs",
      ram: "",
      storage: "",
      battery: "",
      supplier_name: "",
      supplier_mobile: "",
      supplier_nid: "",
      product_entry_date: new Date().toISOString().split('T')[0],
      warranty_status: "no_warranty",
      image_url: "",
    });
  };

  const generateSKU = () => {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 7);
    return `SKU-${timestamp}-${random}`.toUpperCase();
  };

  const generateBarcode = () => {
    return Math.floor(100000000000 + Math.random() * 900000000000).toString();
  };

  const extractBrand = (productName: string) => {
    return productName.split(' ')[0];
  };

  const extractModel = (productName: string) => {
    const parts = productName.split(' ');
    return parts.slice(1).join(' ');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Bengali validations
    if (!formData.name.trim()) {
      toast.error("প্রোডাক্টের নাম (মডেল) অবশ্যই দিতে হবে");
      return;
    }
    if (!formData.category_id) {
      toast.error("ক্যাটাগরি সিলেক্ট করুন");
      return;
    }
    if (!formData.condition) {
      toast.error("নতুন অথবা পুরাতন মোবাইল সিলেক্ট করুন");
      return;
    }
    if (!/^\d{15}$/.test(formData.imei || "")) {
      toast.error("IMEI অবশ্যই ১৫ ডিজিটের হতে হবে");
      return;
    }
    const priceNum = parseFloat(formData.price);
    const costNum = parseFloat(formData.cost);
    if (!formData.price || isNaN(priceNum) || priceNum <= 0) {
      toast.error("বিক্রয় মূল্য অবশ্যই ০ এর বেশি হতে হবে");
      return;
    }
    if (!formData.cost || isNaN(costNum) || costNum < 0) {
      toast.error("ক্রয় মূল্য সঠিকভাবে দিন");
      return;
    }

    // Check for duplicate IMEI (both add and edit)
    if (formData.imei) {
      let query = supabase
        .from("products")
        .select("id, name, stock_quantity")
        .eq("imei", formData.imei)
        .gt("stock_quantity", 0);

      // When editing, exclude the current product from the check
      if (editingProduct) {
        query = query.neq("id", editingProduct.id);
      }

      const { data: existingProducts, error } = await query;

      if (error) {
        toast.error("IMEI চেক করতে ব্যর্থ");
        return;
      }

      if (existingProducts && existingProducts.length > 0) {
        toast.error(`এই IMEI (${formData.imei}) দিয়ে "${existingProducts[0].name}" ইতিমধ্যে স্টকে আছে। আগে বিক্রি করুন, তারপর আবার এন্ট্রি করতে পারবেন।`);
        return;
      }
    }

    // Profit validation warning
    const price = parseFloat(formData.price) || 0;
    const cost = parseFloat(formData.cost) || 0;
    if (cost > 0 && price > cost * 3) {
      toast.warning(`⚠️ সতর্কতা: বিক্রয় মূল্য (${price}) ক্রয় মূল্যের (${cost}) ৩ গুণের বেশি। দয়া করে যাচাই করুন।`, {
        duration: 5000,
      });
    }

    const brand = formData.brand || '';
    const model = formData.model || formData.name;
    const fullName = brand ? `${brand} ${formData.name}` : formData.name;

    const submitData = {
      ...formData,
      name: fullName,
      sku: editingProduct ? formData.sku : generateSKU(),
      barcode: editingProduct ? formData.barcode : generateBarcode(),
      brand: brand,
      model: model,
      price: price,
      cost: cost,
      stock_quantity: 1,
      low_stock_threshold: 0,
      category_id: formData.category_id || null,
      image_url: formData.image_url || null,
    };

    if (editingProduct) {
      updateMutation.mutate({ id: editingProduct.id, data: submitData });
    } else {
      addMutation.mutate(submitData);
    }
  };

  const startEdit = (product: any) => {
    setEditingProduct(product);
    // Check if supplier_name matches an existing supplier
    const matchedSupplier = suppliers?.find(s => s.name === product.supplier_name);
    if (matchedSupplier) {
      setSupplierMode("existing");
      setSelectedSupplierId(matchedSupplier.id);
    } else if (product.supplier_name) {
      setSupplierMode("custom");
      setSelectedSupplierId("");
    } else {
      setSupplierMode("existing");
      setSelectedSupplierId("");
    }
    setFormData({
      name: product.name || "",
      category_id: product.category_id || "",
      sku: product.sku || "",
      barcode: product.barcode || "",
      imei: product.imei || "",
      brand: product.brand || "",
      model: product.model || "",
      condition: product.condition || "new",
      price: product.price?.toString() || "",
      cost: product.cost?.toString() || "",
      unit: product.unit || "pcs",
      ram: product.ram || "",
      storage: product.storage || "",
      battery: product.battery || "",
      supplier_name: product.supplier_name || "",
      supplier_mobile: product.supplier_mobile || "",
      supplier_nid: product.supplier_nid || "",
      product_entry_date: product.product_entry_date || new Date().toISOString().split('T')[0],
      warranty_status: product.warranty_status || "no_warranty",
      image_url: product.image_url || "",
    });
  };

  const toggleCardExpand = (id: string) => {
    setExpandedCards(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const filteredProducts = useMemo(() => {
    if (!products) return [];
    
    let filtered = products.filter((product) => {
      const matchesSearch = 
        searchTerm === "" ||
        product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        product.imei?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        product.brand?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        product.sku?.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesCondition = 
        filterCondition === "all" || 
        product.condition === filterCondition;

      const matchesCategory = 
        filterCategory === "all" || 
        product.category_id === filterCategory;

      const matchesSupplier =
        filterSupplier === "all" ||
        product.supplier_name === filterSupplier;

      const hasStock = showOutOfStock || product.stock_quantity > 0;

      return matchesSearch && matchesCondition && matchesCategory && matchesSupplier && hasStock;
    });

    // Sort
    const [field, dir] = sortBy.split("-");
    filtered.sort((a, b) => {
      let cmp = 0;
      if (field === "name") cmp = a.name.localeCompare(b.name);
      else if (field === "price") cmp = (a.price || 0) - (b.price || 0);
      else if (field === "cost") cmp = (a.cost || 0) - (b.cost || 0);
      else if (field === "date") cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      else if (field === "stock") cmp = a.stock_quantity - b.stock_quantity;
      return dir === "desc" ? -cmp : cmp;
    });

    return filtered;
  }, [products, searchTerm, filterCondition, filterCategory, filterSupplier, showOutOfStock, sortBy]);

  const handleBarcodeScanned = (barcode: string) => {
    const product = products?.find(p => 
      p.barcode === barcode || p.imei === barcode
    );

    if (product) {
      setDetailProduct(product);
      toast.success(`"${product.name}" পাওয়া গেছে`);
    } else {
      // Set search term so user can see no results
      setSearchTerm(barcode);
      toast.error("এই বারকোড/IMEI দিয়ে প্রোডাক্ট পাওয়া যায়নি");
    }
  };

  // Download products as Excel
  const downloadExcel = () => {
    if (!products || products.length === 0) {
      toast.error("কোনো প্রোডাক্ট নেই ডাউনলোড করার জন্য");
      return;
    }

    const excelData = products.map((product, index) => ({
      'ক্রমিক': index + 1,
      'প্রোডাক্ট নাম': product.name,
      'ব্র্যান্ড': product.brand || '',
      'মডেল': product.model || '',
      'IMEI': product.imei || '',
      'SKU': product.sku || '',
      'বারকোড': product.barcode || '',
      'অবস্থা': product.condition === 'new' ? 'নতুন' : 'ব্যবহৃত',
      'ক্যাটাগরি': (product as any).categories?.name || '',
      'ক্রয় মূল্য (৳)': product.cost || 0,
      'বিক্রয় মূল্য (৳)': product.price || 0,
      'স্টক': product.stock_quantity || 0,
      'RAM': product.ram || '',
      'Storage': product.storage || '',
      'Battery': product.battery || '',
      'সাপ্লায়ার নাম': product.supplier_name || '',
      'সাপ্লায়ার মোবাইল': product.supplier_mobile || '',
      'সাপ্লায়ার NID': product.supplier_nid || '',
      'ওয়ারেন্টি স্ট্যাটাস': product.warranty_status === 'active' ? 'সক্রিয়' : product.warranty_status === 'expired' ? 'মেয়াদোত্তীর্ণ' : 'নেই',
      'প্রোডাক্ট এন্ট্রি তারিখ': product.product_entry_date || '',
      'যুক্ত হয়েছে': new Date(product.created_at).toLocaleDateString('bn-BD'),
    }));

    const worksheet = XLSX.utils.json_to_sheet(excelData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Products');
    
    // Auto-size columns
    const colWidths = Object.keys(excelData[0] || {}).map(key => ({ wch: Math.max(key.length + 2, 15) }));
    worksheet['!cols'] = colWidths;

    const fileName = `Apple_Point_Products_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(workbook, fileName);
    toast.success(`${products.length}টি প্রোডাক্ট Excel এ ডাউনলোড হয়েছে`);
  };

  // Download products as PDF (using print)
  const downloadPDF = () => {
    if (!products || products.length === 0) {
      toast.error("কোনো প্রোডাক্ট নেই ডাউনলোড করার জন্য");
      return;
    }

    const totalValue = products.reduce((sum, p) => sum + (p.price || 0) * (p.stock_quantity || 0), 0);
    const totalCost = products.reduce((sum, p) => sum + (p.cost || 0) * (p.stock_quantity || 0), 0);
    const inStock = products.filter(p => (p.stock_quantity || 0) > 0).length;
    const outOfStock = products.filter(p => (p.stock_quantity || 0) <= 0).length;

    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>BIG BOSS MOBILE STATION - প্রোডাক্ট তালিকা</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 20px; font-size: 11px; }
          .header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #333; padding-bottom: 15px; }
          .header h1 { font-size: 24px; color: #1a1a1a; }
          .header p { color: #666; margin-top: 5px; }
          .summary { display: flex; justify-content: space-around; margin-bottom: 20px; background: #f5f5f5; padding: 15px; border-radius: 8px; }
          .summary-item { text-align: center; }
          .summary-item .value { font-size: 18px; font-weight: bold; color: #0066cc; }
          .summary-item .label { font-size: 10px; color: #666; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; }
          th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: left; }
          th { background: #0066cc; color: white; font-weight: 600; }
          tr:nth-child(even) { background: #f9f9f9; }
          tr:hover { background: #e8f4ff; }
          .text-right { text-align: right; }
          .text-center { text-align: center; }
          .stock-out { background: #ffe6e6 !important; color: #cc0000; }
          .footer { margin-top: 20px; text-align: center; font-size: 10px; color: #666; border-top: 1px solid #ddd; padding-top: 10px; }
          @media print { body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>👑 BIG BOSS MOBILE STATION</h1>
          <p>প্রোডাক্ট ইনভেন্টরি তালিকা</p>
          <p style="font-size: 10px; margin-top: 5px;">তারিখ: ${new Date().toLocaleDateString('bn-BD')}</p>
        </div>
        
        <div class="summary">
          <div class="summary-item">
            <div class="value">${products.length}</div>
            <div class="label">মোট প্রোডাক্ট</div>
          </div>
          <div class="summary-item">
            <div class="value">${inStock}</div>
            <div class="label">স্টকে আছে</div>
          </div>
          <div class="summary-item">
            <div class="value">${outOfStock}</div>
            <div class="label">আউট অফ স্টক</div>
          </div>
          <div class="summary-item">
            <div class="value">৳${totalCost.toLocaleString('bn-BD')}</div>
            <div class="label">মোট বিনিয়োগ</div>
          </div>
          <div class="summary-item">
            <div class="value">৳${totalValue.toLocaleString('bn-BD')}</div>
            <div class="label">মোট মূল্য</div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th class="text-center">ক্রমিক</th>
              <th>প্রোডাক্ট নাম</th>
              <th>IMEI</th>
              <th>অবস্থা</th>
              <th class="text-right">ক্রয় (৳)</th>
              <th class="text-right">বিক্রয় (৳)</th>
              <th class="text-center">স্টক</th>
              <th>সাপ্লায়ার</th>
            </tr>
          </thead>
          <tbody>
            ${products.map((product, index) => `
              <tr class="${(product.stock_quantity || 0) <= 0 ? 'stock-out' : ''}">
                <td class="text-center">${index + 1}</td>
                <td><strong>${product.name}</strong><br/><small>${product.brand || ''} ${product.model || ''}</small></td>
                <td style="font-family: monospace; font-size: 10px;">${product.imei || '-'}</td>
                <td>${product.condition === 'new' ? 'নতুন' : 'ব্যবহৃত'}</td>
                <td class="text-right">${(product.cost || 0).toLocaleString('bn-BD')}</td>
                <td class="text-right">${(product.price || 0).toLocaleString('bn-BD')}</td>
                <td class="text-center">${product.stock_quantity || 0}</td>
                <td>${product.supplier_name || '-'}<br/><small>${product.supplier_mobile || ''}</small></td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div class="footer">
          <p>BIG BOSS MOBILE STATION - Shop Management System</p>
          <p>Generated on ${new Date().toLocaleString('bn-BD')}</p>
        </div>
      </body>
      </html>
    `;

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(printContent);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => {
        printWindow.print();
        printWindow.close();
      }, 250);
      toast.success(`${products.length}টি প্রোডাক্ট PDF এ ডাউনলোড হচ্ছে`);
    } else {
      toast.error("পপআপ ব্লক করা আছে। অনুগ্রহ করে পপআপ অনুমতি দিন।");
    }
  };

  return (
    <div className="flex flex-col h-screen animate-fade-in">
      {/* Fixed Header */}
      <div className="sticky top-0 z-10 bg-white dark:bg-gray-950 border-b border-border pb-4 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground">Products</h1>
            <p className="text-sm md:text-base text-muted-foreground mt-1">Manage your inventory</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {/* Download Buttons */}
            <Button
              onClick={downloadExcel}
              variant="outline"
              className="border-green-500 text-green-600 hover:bg-green-50 text-sm md:text-base"
              title="Excel ডাউনলোড"
            >
              <FileSpreadsheet className="w-4 h-4 mr-1" />
              <span className="hidden sm:inline">Excel</span>
            </Button>
            <Button
              onClick={downloadPDF}
              variant="outline"
              className="border-red-500 text-red-600 hover:bg-red-50 text-sm md:text-base"
              title="PDF ডাউনলোড"
            >
              <FileText className="w-4 h-4 mr-1" />
              <span className="hidden sm:inline">PDF</span>
            </Button>
            <Button
              onClick={() => window.dispatchEvent(new CustomEvent('navigate-to-customers'))}
              variant="outline"
              className="border-primary text-primary hover:bg-primary/10 text-sm md:text-base"
            >
              <span className="hidden sm:inline">👥 Customers</span>
              <span className="sm:hidden">👥</span>
            </Button>
            <Button
              onClick={() => window.dispatchEvent(new CustomEvent('navigate-to-categories'))}
              variant="outline"
              className="border-primary text-primary hover:bg-primary/10 text-sm md:text-base"
            >
              <span className="hidden sm:inline">📁 Categories</span>
              <span className="sm:hidden">📁</span>
            </Button>
            <Dialog open={isAddDialogOpen || !!editingProduct} onOpenChange={(open) => {
              if (!open) {
                setIsAddDialogOpen(false);
                setEditingProduct(null);
                resetForm();
              }
            }}>
              <DialogTrigger asChild>
                <Button
                  onClick={() => setIsAddDialogOpen(true)}
                  className="bg-gradient-to-r from-primary to-accent hover:opacity-90 text-sm md:text-base"
                >
                  <span className="hidden sm:inline">➕ Add Product</span>
                  <span className="sm:hidden">➕</span>
                </Button>
              </DialogTrigger>
          <DialogContent className="w-[95vw] max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-lg md:text-xl">{editingProduct ? "Edit Product" : "Add New Product"}</DialogTitle>
              <DialogDescription className="text-sm">
                {editingProduct ? "Update product details" : "Enter product information to add to inventory"}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium mb-2">প্রোডাক্টের নাম / মডেল *</label>
                  <Input
                    value={formData.name}
                    onChange={(e) => {
                      const newName = e.target.value;
                      setFormData({ 
                        ...formData, 
                        name: newName,
                        model: newName
                      });
                    }}
                    placeholder="শুধু মডেলের তথ্য দিন (যেমন: Galaxy A15, Note 14 Pro)"
                    required
                  />
                  <p className="text-xs text-muted-foreground mt-1">ব্র্যান্ড ক্যাটাগরি থেকে স্বয়ংক্রিয়ভাবে নেওয়া হবে</p>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Category</label>
                  <Select value={formData.category_id} onValueChange={(value) => {
                    const selectedCat = categories?.find(c => c.id === value);
                    setFormData({ 
                      ...formData, 
                      category_id: value,
                      brand: selectedCat?.name || formData.brand
                    });
                  }}>
                    <SelectTrigger>
                      <SelectValue placeholder="ক্যাটাগরি / ব্র্যান্ড সিলেক্ট করুন" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories?.map((cat) => (
                        <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground mt-1">ব্র্যান্ড এখান থেকে স্বয়ংক্রিয়ভাবে সেট হবে</p>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">IMEI * (15 digits)</label>
                  <div className="flex gap-2">
                    <Input
                      value={formData.imei}
                      onChange={(e) => {
                        const value = e.target.value.replace(/\D/g, '').slice(0, 15);
                        setFormData({ ...formData, imei: value });
                      }}
                      placeholder="Enter 15-digit IMEI"
                      required
                      pattern="[0-9]{15}"
                      minLength={15}
                      maxLength={15}
                      title="IMEI must be exactly 15 digits"
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setShowImeiScanner(true)}
                      className="shrink-0"
                      title="IMEI বারকোড স্ক্যান করুন"
                    >
                      <ScanBarcode className="w-4 h-4" />
                    </Button>
                  </div>
                  {formData.imei && formData.imei.length !== 15 && (
                    <p className="text-xs text-red-500 mt-1">IMEI must be exactly 15 digits</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">ব্র্যান্ড</label>
                  <Input
                    value={formData.brand}
                    onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
                    placeholder="ক্যাটাগরি থেকে স্বয়ংক্রিয়ভাবে আসবে"
                    readOnly
                    className="bg-muted/50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">মডেল</label>
                  <Input
                    value={formData.model}
                    onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                    placeholder="প্রোডাক্টের নাম থেকে স্বয়ংক্রিয়ভাবে আসবে"
                    readOnly
                    className="bg-muted/50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">অবস্থা (Condition)</label>
                  <Select value={formData.condition || undefined} onValueChange={(value) => setFormData({ ...formData, condition: value })}>
                    <SelectTrigger>
                      <SelectValue placeholder="নতুন অথবা পুরাতন মোবাইল সিলেক্ট করো" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="new">New (নতুন)</SelectItem>
                      <SelectItem value="used">Used (পুরাতন)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Unit</label>
                  <Input
                    value={formData.unit}
                    onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Price</label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Cost</label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.cost}
                    onChange={(e) => setFormData({ ...formData, cost: e.target.value })}
                  />
                </div>
              </div>

              {/* Quick Specifications (Optional) */}
              <div className="pt-4 border-t border-border">
                <h3 className="text-sm font-semibold mb-3 text-foreground">Quick Specifications (Optional)</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">RAM</label>
                    <Input
                      value={formData.ram}
                      onChange={(e) => setFormData({ ...formData, ram: e.target.value })}
                      placeholder="e.g., 8GB"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Storage</label>
                    <Input
                      value={formData.storage}
                      onChange={(e) => setFormData({ ...formData, storage: e.target.value })}
                      placeholder="e.g., 256GB"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Battery</label>
                    <Input
                      value={formData.battery}
                      onChange={(e) => setFormData({ ...formData, battery: e.target.value })}
                      placeholder="e.g., 5000mAh"
                    />
                  </div>
                </div>
              </div>

              {/* Supplier Information (Optional) */}
              <div className="pt-4 border-t border-border">
                <h3 className="text-sm font-semibold mb-3 text-foreground">Supplier Information (Optional)</h3>
                <div className="flex gap-2 mb-3">
                  <Button type="button" size="sm" variant={supplierMode === "existing" ? "default" : "outline"} onClick={() => setSupplierMode("existing")}>
                    📋 তালিকা থেকে
                  </Button>
                  <Button type="button" size="sm" variant={supplierMode === "custom" ? "default" : "outline"} onClick={() => { setSupplierMode("custom"); setSelectedSupplierId(""); }}>
                    ✏️ কাস্টম/লোকাল
                  </Button>
                </div>

                {supplierMode === "existing" ? (
                  <div>
                    <label className="block text-sm font-medium mb-2">সাপ্লায়ার নির্বাচন করুন</label>
                    <Select value={selectedSupplierId} onValueChange={(value) => {
                      setSelectedSupplierId(value);
                      const supplier = suppliers?.find(s => s.id === value);
                      if (supplier) {
                        setFormData({ ...formData, supplier_name: supplier.name, supplier_mobile: supplier.phone || "", supplier_nid: "" });
                      }
                    }}>
                      <SelectTrigger>
                        <SelectValue placeholder="সাপ্লায়ার বাছাই করুন..." />
                      </SelectTrigger>
                      <SelectContent>
                        {suppliers?.map(s => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.name} {s.phone ? `(${s.phone})` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {selectedSupplierId && (
                      <div className="mt-2 p-2 bg-muted rounded text-xs space-y-1">
                        {(() => {
                          const s = suppliers?.find(sup => sup.id === selectedSupplierId);
                          return s ? (
                            <>
                              <p>📦 {s.name}</p>
                              {s.phone && <p>📞 {s.phone}</p>}
                              {s.email && <p>📧 {s.email}</p>}
                              {s.address && <p>📍 {s.address}</p>}
                            </>
                          ) : null;
                        })()}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-2">সাপ্লায়ার নাম</label>
                      <Input
                        value={formData.supplier_name}
                        onChange={(e) => setFormData({ ...formData, supplier_name: e.target.value })}
                        placeholder="সাপ্লায়ার নাম লিখুন"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2">সাপ্লায়ার মোবাইল</label>
                      <Input
                        value={formData.supplier_mobile}
                        onChange={(e) => setFormData({ ...formData, supplier_mobile: e.target.value })}
                        placeholder="মোবাইল নম্বর"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-sm font-medium mb-2">সাপ্লায়ার NID</label>
                      <Input
                        value={formData.supplier_nid}
                        onChange={(e) => setFormData({ ...formData, supplier_nid: e.target.value })}
                        placeholder="NID নম্বর"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Warranty Information (Optional) */}
              <div className="pt-4 border-t border-border">
                <h3 className="text-sm font-semibold mb-3 text-foreground">Warranty Information (Optional)</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Warranty Status</label>
                    <Select value={formData.warranty_status} onValueChange={(value) => setFormData({ ...formData, warranty_status: value })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="no_warranty">No Warranty</SelectItem>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="expired">Expired</SelectItem>
                        <SelectItem value="void">Void</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Product Entry Date</label>
                    <Input
                      type="date"
                      value={formData.product_entry_date}
                      onChange={(e) => setFormData({ ...formData, product_entry_date: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              {/* Product Image */}
              <div className="pt-4 border-t border-border">
                <CloudinaryImageUpload
                  currentImageUrl={formData.image_url}
                  onUpload={(url) => setFormData({ ...formData, image_url: url })}
                  folder="products"
                  label="📷 প্রোডাক্টের ছবি"
                />
              </div>


              <div className="flex gap-2 justify-end pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setIsAddDialogOpen(false);
                    setEditingProduct(null);
                    resetForm();
                  }}
                >
                  Cancel
                </Button>
                <Button type="submit" className="bg-gradient-to-r from-primary to-accent">
                  {editingProduct ? "Update" : "Add"} Product
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
          </div>
        </div>

      {/* Search and Filters */}
      <Card className="p-4">
        {/* Search + Toggle Row */}
        <div className="flex gap-2 items-center">
          <Input
            placeholder="🔍 নাম, IMEI, ব্র্যান্ড বা SKU দিয়ে খুঁজুন..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-1"
          />
          <Button variant="outline" onClick={() => setShowScanner(true)} className="shrink-0" title="বারকোড স্ক্যান">
            <ScanBarcode className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={() => setShowFilters(!showFilters)} title="ফিল্টার" className="shrink-0">
            <Filter className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={() => setViewMode(viewMode === "grid" ? "compact" : "grid")} title="ভিউ মোড" className="shrink-0">
            {viewMode === "grid" ? <List className="w-4 h-4" /> : <LayoutGrid className="w-4 h-4" />}
          </Button>
        </div>

        {/* Collapsible Filters */}
        {showFilters && (
          <div className="mt-3 space-y-3 pt-3 border-t border-border animate-fade-in">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <Select value={filterCondition} onValueChange={setFilterCondition}>
                <SelectTrigger className="text-sm">
                  <SelectValue placeholder="অবস্থা" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">সব অবস্থা</SelectItem>
                  <SelectItem value="new">নতুন</SelectItem>
                  <SelectItem value="used">ব্যবহৃত</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterCategory} onValueChange={setFilterCategory}>
                <SelectTrigger className="text-sm">
                  <SelectValue placeholder="ক্যাটাগরি" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">সব ক্যাটাগরি</SelectItem>
                  {categories?.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filterSupplier} onValueChange={setFilterSupplier}>
                <SelectTrigger className="text-sm">
                  <SelectValue placeholder="সাপ্লায়ার" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">সব সাপ্লায়ার</SelectItem>
                  {[...new Set(products?.map(p => p.supplier_name).filter(Boolean))].sort().map((name) => (
                    <SelectItem key={name} value={name!}>{name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="text-sm">
                  <SelectValue placeholder="সর্ট" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="name-asc">নাম (A-Z)</SelectItem>
                  <SelectItem value="name-desc">নাম (Z-A)</SelectItem>
                  <SelectItem value="price-asc">দাম (কম→বেশি)</SelectItem>
                  <SelectItem value="price-desc">দাম (বেশি→কম)</SelectItem>
                  <SelectItem value="cost-asc">ক্রয় (কম→বেশি)</SelectItem>
                  <SelectItem value="cost-desc">ক্রয় (বেশি→কম)</SelectItem>
                  <SelectItem value="date-desc">নতুন আগে</SelectItem>
                  <SelectItem value="date-asc">পুরাতন আগে</SelectItem>
                  <SelectItem value="stock-asc">স্টক (কম→বেশি)</SelectItem>
                </SelectContent>
              </Select>
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="showOutOfStock" 
                  checked={showOutOfStock}
                  onCheckedChange={(checked) => setShowOutOfStock(checked as boolean)}
                />
                <label htmlFor="showOutOfStock" className="text-xs font-medium cursor-pointer">
                  স্টক শেষ দেখান
                </label>
              </div>
            </div>
            {(searchTerm || filterCondition !== "all" || filterCategory !== "all" || filterSupplier !== "all") && (
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  {filteredProducts.length}টি পাওয়া গেছে
                </p>
                <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => { setSearchTerm(""); setFilterCondition("all"); setFilterCategory("all"); setFilterSupplier("all"); }}>
                  ফিল্টার মুছুন
                </Button>
              </div>
            )}
          </div>
        )}
      </Card>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto">
        <div className={viewMode === "grid" 
          ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pb-6"
          : "space-y-2 pb-6"
        }>
        {filteredProducts?.map((product) => {
          const isExpanded = expandedCards.has(product.id);
          
          if (viewMode === "compact") {
            return (
              <Card key={product.id} className="p-3 card-hover">
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-sm text-foreground truncate">{product.name}</h3>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${product.condition === 'new' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                        {product.condition === 'new' ? 'নতুন' : 'ব্যবহৃত'}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {product.imei && `IMEI: ${product.imei}`} {product.brand && `• ${product.brand}`}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold text-foreground">৳{Number(product.price).toLocaleString('bn-BD')}</p>
                    <p className="text-xs text-muted-foreground">ক্রয়: ৳{Number(product.cost).toLocaleString('bn-BD')}</p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => {
                      const index = filteredProducts.findIndex(p => p.id === product.id);
                      window.innerWidth < 1024 ? setQuickViewIndex(index) : setDetailProduct(product);
                    }}>
                      <Eye className="w-3 h-3" />
                    </Button>
                    <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => startEdit(product)}>
                      <span className="text-xs">✏️</span>
                    </Button>
                  </div>
                </div>
              </Card>
            );
          }

          return (
          <Card key={product.id} className="p-4 md:p-6 card-hover">
            <div className="space-y-3">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  {product.image_url && (
                    <img
                      src={getCloudinaryThumbnail(product.image_url, 100, 100)}
                      alt={product.name}
                      className="w-14 h-14 rounded-lg object-cover border border-border shrink-0"
                    />
                  )}
                  <div className="min-w-0">
                    <h3 className="font-semibold text-base md:text-lg text-foreground">{product.name}</h3>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {product.brand && (
                      <span className="inline-block text-xs bg-accent/10 text-accent px-2 py-0.5 rounded-full">{product.brand}</span>
                    )}
                    {product.condition && (
                      <span className={`inline-block text-xs px-2 py-0.5 rounded-full ${product.condition === 'new' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                        {product.condition === 'new' ? '✨ নতুন' : '♻️ ব্যবহৃত'}
                      </span>
                    )}
                    {product.categories && (
                      <span className="inline-block text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">{product.categories.name}</span>
                    )}
                  </div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {product.stock_quantity <= product.low_stock_threshold && <span className="text-lg" title="Low Stock">⚠️</span>}
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => toggleCardExpand(product.id)}>
                    {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </Button>
                </div>
              </div>

              {/* Always visible: price and IMEI */}
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">মূল্য: <span className="font-semibold text-foreground">৳{Number(product.price).toLocaleString('bn-BD')}</span></span>
                <span className="text-muted-foreground">ক্রয়: <span className="font-semibold text-foreground">৳{Number(product.cost).toLocaleString('bn-BD')}</span></span>
              </div>
              {product.imei && (
                <p className="text-xs text-muted-foreground font-mono">IMEI: {product.imei}</p>
              )}

              {/* Expandable details */}
              {isExpanded && (
                <div className="space-y-2 text-sm animate-fade-in pt-2 border-t border-border">
                  {(product.ram || product.storage || product.battery) && (
                    <div className="flex flex-wrap gap-2">
                      {product.ram && <span className="text-xs bg-muted px-2 py-1 rounded">🧠 {product.ram}</span>}
                      {product.storage && <span className="text-xs bg-muted px-2 py-1 rounded">💾 {product.storage}</span>}
                      {product.battery && <span className="text-xs bg-muted px-2 py-1 rounded">🔋 {product.battery}</span>}
                    </div>
                  )}
                  {(product.supplier_name || product.supplier_mobile) && (
                    <div className="pb-2 border-b border-border">
                      <p className="text-xs text-muted-foreground mb-1">সাপ্লায়ার:</p>
                      {product.supplier_name && <p className="text-xs">📦 {product.supplier_name}</p>}
                      {product.supplier_mobile && <p className="text-xs">📱 {product.supplier_mobile}</p>}
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">স্টক:</span>
                    <span className={`font-semibold ${product.stock_quantity <= product.low_stock_threshold ? 'text-amber-600' : 'text-foreground'}`}>
                      {product.stock_quantity} {product.unit}
                    </span>
                  </div>
                  {product.sku && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">SKU:</span>
                      <span className="font-mono text-xs text-foreground">{product.sku}</span>
                    </div>
                  )}
                  {product.warranty_status && product.warranty_status !== "no_warranty" && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">ওয়ারেন্টি:</span>
                      <span className="text-xs">{product.warranty_status === 'active' ? '✅ সক্রিয়' : '❌ মেয়াদোত্তীর্ণ'}</span>
                    </div>
                  )}
                </div>
              )}

              <div className="flex gap-1.5 pt-2">
                <Button variant="outline" size="sm" onClick={() => {
                  const index = filteredProducts.findIndex(p => p.id === product.id);
                  window.innerWidth < 1024 ? setQuickViewIndex(index) : setDetailProduct(product);
                }} className="flex-1">
                  <Eye className="w-4 h-4" />
                </Button>
                <Button variant="outline" size="sm" onClick={() => startEdit(product)} className="flex-1">✏️</Button>
                <Button variant="outline" size="sm" onClick={() => setHistoryProduct({ imei: product.imei || "", name: product.name })} className="flex-1" disabled={!product.imei}>📜</Button>
                <Button variant="destructive" size="sm" onClick={() => {
                  if (confirm("আপনি কি নিশ্চিত?")) deleteMutation.mutate({ id: product.id, name: product.name });
                }} className="flex-1">🗑️</Button>
              </div>
            </div>
          </Card>
          );
        })}
        </div>

        {(!filteredProducts || filteredProducts.length === 0) && (
          <Card className="p-12 text-center">
            <div className="text-6xl mb-4">📦</div>
            <h3 className="text-xl font-semibold mb-2 text-foreground">
              {products && products.length > 0 ? "No matching products" : "No products yet"}
            </h3>
            <p className="text-muted-foreground">
              {products && products.length > 0 
                ? "Try adjusting your search or filters" 
                : "Add your first product to get started!"}
            </p>
          </Card>
        )}
      </div>

      {historyProduct && (
        <ProductHistory
          imei={historyProduct.imei}
          productName={historyProduct.name}
          isOpen={!!historyProduct}
          onClose={() => setHistoryProduct(null)}
        />
      )}

      {detailProduct && (
        <ProductDetailModal
          product={detailProduct}
          isOpen={!!detailProduct}
          onClose={() => setDetailProduct(null)}
        />
      )}

      <BarcodeScanner
        isOpen={showScanner}
        onClose={() => setShowScanner(false)}
        onScan={handleBarcodeScanned}
        title="প্রোডাক্ট খুঁজুন (বারকোড/IMEI স্ক্যান)"
      />

      <BarcodeScanner
        isOpen={showImeiScanner}
        onClose={() => setShowImeiScanner(false)}
        onScan={(scannedCode) => {
          // Extract only digits for IMEI, take last 15 digits
          const digits = scannedCode.replace(/\D/g, '');
          const imei = digits.length >= 15 ? digits.slice(-15) : digits;
          setFormData(prev => ({ ...prev, imei }));
          toast.success(`IMEI স্ক্যান হয়েছে: ${imei}`);
        }}
        title="IMEI বারকোড স্ক্যান করুন"
      />

      <ProductQuickView
        products={filteredProducts || []}
        initialIndex={quickViewIndex}
        isOpen={quickViewIndex >= 0}
        onClose={() => setQuickViewIndex(-1)}
      />
    </div>
  );
}
