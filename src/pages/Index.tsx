import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { User } from "@supabase/supabase-js";
import { Dashboard } from "@/components/Dashboard";
import { Products } from "@/components/Products";
import { POS } from "@/components/POS";
import { Customers } from "@/components/Customers";
import { CustomerDetails } from "@/components/CustomerDetails";
import { CustomerLedgerReport } from "@/components/CustomerLedgerReport";
import { Suppliers } from "@/components/Suppliers";
import { SupplierReturns } from "@/components/SupplierReturns";
import { SupplierLedgerReport } from "@/components/SupplierLedgerReport";
import { Reports } from "@/components/Reports";
import { Settings } from "@/components/Settings";
import { Categories } from "@/components/Categories";
import { Sales } from "@/components/Sales";
import { Returns } from "@/components/Returns";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useShopSettings } from "@/hooks/useShopSettings";
import { FloatingActionButton } from "@/components/FloatingActionButton";
import { useUserRole } from "@/hooks/useUserRole";
import { ActivityLogger } from "@/hooks/useActivityLog";
import { Skeleton } from "@/components/ui/skeleton";

import { 
  LayoutDashboard, 
  Package, 
  ShoppingCart, 
  TrendingUp, 
  RefreshCcw, 
  FileText, 
  Settings as SettingsIcon,
  Truck,
  Users,
  BookOpen
} from "lucide-react";

interface IndexProps {
  user: User | null;
}

export default function Index({ user }: IndexProps) {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const navigate = useNavigate();
  const { role, permissions, loading: roleLoading } = useUserRole();
  const { settings, logoSrc } = useShopSettings();

  useEffect(() => {
    if (!user) {
      navigate("/auth");
    }
  }, [user, navigate]);

  useEffect(() => {
    const handleNavigateToCustomers = () => {
      if (!permissions.canManageCustomers) {
        toast.error('আপনার "Customers" পেজে অ্যাক্সেস নেই');
        return;
      }
      setActiveTab("customers");
    };
    const handleNavigateToCategories = () => {
      if (!permissions.canManageCategories) {
        toast.error('আপনার "Categories" পেজে অ্যাক্সেস নেই');
        return;
      }
      setActiveTab("categories");
    };
    const handleNavigateToCustomerDetails = () => {
      setActiveTab("customer-details");
    };
    const handleNavigateToSupplierReturns = () => {
      if (!permissions.canManageSuppliers) {
        toast.error('আপনার "Supplier Returns" পেজে অ্যাক্সেস নেই');
        return;
      }
      setActiveTab("supplier-returns");
    };
    
    window.addEventListener('navigate-to-customers', handleNavigateToCustomers);
    window.addEventListener('navigate-to-categories', handleNavigateToCategories);
    window.addEventListener('navigate-to-customer-details', handleNavigateToCustomerDetails);
    window.addEventListener('navigate-to-supplier-returns', handleNavigateToSupplierReturns);
    
    return () => {
      window.removeEventListener('navigate-to-customers', handleNavigateToCustomers);
      window.removeEventListener('navigate-to-categories', handleNavigateToCategories);
      window.removeEventListener('navigate-to-customer-details', handleNavigateToCustomerDetails);
      window.removeEventListener('navigate-to-supplier-returns', handleNavigateToSupplierReturns);
    };
  }, [permissions]);

  if (!user) return null;

  // Show loading skeleton while fetching role permissions
  if (roleLoading) {
    return (
      <div className="min-h-screen bg-white flex">
        <aside className="hidden lg:block fixed left-0 top-0 h-screen w-64 bg-primary p-6">
          <div className="flex items-center gap-3 mb-8 pb-6 border-b border-white/20">
            <Skeleton className="w-20 h-20 rounded-xl bg-white/20" />
            <div className="space-y-2">
              <Skeleton className="h-5 w-24 bg-white/20" />
              <Skeleton className="h-3 w-20 bg-white/20" />
            </div>
          </div>
          <div className="space-y-3">
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-lg bg-white/20" />
            ))}
          </div>
        </aside>
        <main className="lg:pl-64 flex-1 p-8">
          <div className="space-y-6">
            <Skeleton className="h-10 w-48" />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-32 rounded-xl" />
              ))}
            </div>
            <Skeleton className="h-64 rounded-xl" />
          </div>
        </main>
      </div>
    );
  }

  // Define menu items with permission checks
  const allMenuItems = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, permission: 'canAccessDashboard' },
    { id: "products", label: "Products", icon: Package, permission: 'canManageProducts' },
    { id: "pos", label: "POS", icon: ShoppingCart, permission: 'canAccessPOS' },
    { id: "customers", label: "Customers", icon: Users, permission: 'canManageCustomers' },
    { id: "customer-ledger", label: "Customer Ledger", icon: BookOpen, permission: 'canManageCustomers' },
    { id: "sales", label: "Sales", icon: TrendingUp, permission: 'canAccessSales' },
    { id: "returns", label: "Returns", icon: RefreshCcw, permission: 'canAccessSales' },
    { id: "suppliers", label: "Suppliers", icon: Truck, permission: 'canManageSuppliers' },
    { id: "supplier-ledger", label: "Supplier Ledger", icon: BookOpen, permission: 'canManageSuppliers' },
    { id: "supplier-returns", label: "Supplier Returns", icon: RefreshCcw, permission: 'canManageSuppliers' },
    { id: "reports", label: "Reports", icon: FileText, permission: 'canAccessReports' },
    { id: "settings", label: "Settings", icon: SettingsIcon, permission: 'canAccessSettings' },
  ];

  // Filter menu items based on permissions
  const menuItems = allMenuItems.filter(item => {
    const permissionKey = item.permission as keyof typeof permissions;
    return permissions[permissionKey];
  });

  // Permission-based tab navigation handler
  const handleTabChange = (tabId: string) => {
    const menuItem = allMenuItems.find(item => item.id === tabId);
    if (menuItem) {
      const permissionKey = menuItem.permission as keyof typeof permissions;
      if (!permissions[permissionKey]) {
        toast.error(`আপনার "${menuItem.label}" পেজে অ্যাক্সেস নেই`);
        return;
      }
    }
    setActiveTab(tabId);
  };

  const renderContent = () => {
    switch (activeTab) {
      case "dashboard":
        return <Dashboard 
          onNavigateToPOS={() => handleTabChange("pos")}
          onNavigateToProducts={() => handleTabChange("products")}
        />;
      case "products":
        return <Products />;
      case "categories":
        return <Categories />;
      case "pos":
        return <POS />;
      case "sales":
        return <Sales />;
      case "returns":
        return <Returns />;
      case "customers":
        return <Customers />;
      case "customer-details":
        return <CustomerDetails />;
      case "customer-ledger":
        return <CustomerLedgerReport />;
      case "suppliers":
        return <Suppliers />;
      case "supplier-ledger":
        return <SupplierLedgerReport />;
      case "supplier-returns":
        return <SupplierReturns />;
      case "reports":
        return <Reports />;
      case "settings":
        return <Settings />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:block fixed left-0 top-0 h-screen w-64 bg-primary border-r border-border/20 shadow-xl z-40">
        <div className="flex flex-col h-full p-6">
          <div className="flex items-center justify-center gap-3 mb-8 pb-6 border-b border-white/20">
            <img src={logoSrc} alt={settings.shop_name} className="w-16 h-16" />
            <div>
              <h1 className="text-lg font-bold text-white leading-tight">{settings.shop_name.split(' ').slice(0, 2).join(' ')}</h1>
              <p className="text-xs text-white/80">{settings.shop_subtitle}</p>
            </div>
          </div>
          
          <nav className="flex-1 space-y-3 overflow-y-auto">
            {menuItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full flex items-center gap-4 px-5 py-4 rounded-lg text-left transition-all text-lg ${
                    activeTab === item.id
                      ? "bg-white/20 text-white shadow-md"
                      : "text-white/80 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  <Icon className="w-7 h-7" />
                  <span className="font-medium">{item.label}</span>
                </button>
              );
            })}
          </nav>
          
          {/* Logout Button at bottom of sidebar */}
          <div className="pt-4 border-t border-white/20">
            <Button
              variant="destructive"
              className="w-full flex items-center gap-3 px-5 py-4 text-lg"
              onClick={async () => {
                await ActivityLogger.logout();
                await supabase.auth.signOut({ scope: 'local' });
                toast.success("Signed out successfully");
                window.location.href = "/auth";
              }}
            >
              🚪 <span className="font-medium">Logout</span>
            </Button>
          </div>
        </div>
      </aside>

      {/* Mobile Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-primary border-b border-primary/20 shadow-md">
        <div className="flex items-center justify-between h-16 px-4">
          <div className="flex items-center space-x-3">
            <div className="w-14 h-14 rounded-xl flex items-center justify-center animate-fade-in">
              <img src={logoSrc} alt={settings.shop_name} className="w-12 h-12 animate-scale-in" />
            </div>
            <div>
              <span className="text-base font-bold text-white block leading-tight">{settings.shop_name.split(' ').slice(0, 2).join(' ')}</span>
              <span className="text-xs text-white/70">{settings.shop_subtitle}</span>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="text-white hover:bg-white/10"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </Button>
        </div>
      </div>

      {/* Mobile Menu */}
      {isMobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 z-40 bg-black/50" onClick={() => setIsMobileMenuOpen(false)}>
          <div className="fixed top-16 left-0 right-0 bg-primary border-b border-primary/20 shadow-lg max-h-[80vh] overflow-y-auto">
            {menuItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveTab(item.id);
                    setIsMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center space-x-3 px-6 py-4 text-left transition-colors ${
                    activeTab === item.id
                      ? "bg-accent text-white font-semibold"
                      : "text-white/80 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  <Icon className="w-6 h-6" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="lg:pl-64 xl:pl-72">
        <div className="px-3 py-6 sm:px-4 sm:py-8 lg:px-6 lg:py-8 pt-20 lg:pt-8">
          {renderContent()}
        </div>
      </main>

      {/* Floating Action Button */}
      <FloatingActionButton 
        onNewSale={() => handleTabChange("pos")}
        onAddProduct={() => {
          if (!permissions.canManageProducts) {
            toast.error('আপনার "Products" পেজে অ্যাক্সেস নেই');
            return;
          }
          setActiveTab("products");
          // Trigger add product dialog after navigation
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent('open-add-product-dialog'));
          }, 100);
        }}
      />

      {/* Mobile Bottom Navigation */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-primary border-t border-primary/20 shadow-lg z-40">
        <div className="flex justify-around items-center h-14">
          {menuItems.slice(0, 5).map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`flex flex-col items-center justify-center flex-1 h-full transition-colors ${
                  activeTab === item.id
                    ? "text-accent bg-accent/10"
                    : "text-white/70"
                }`}
              >
                <Icon className="w-5 h-5 mb-0.5" />
                <span className="text-[10px]">{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
