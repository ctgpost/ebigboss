import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScanBarcode, ChevronDown, ChevronUp } from "lucide-react";
import { useShopSettings } from "@/hooks/useShopSettings";

interface POSHeaderProps {
  searchTerm: string;
  onSearchChange: (value: string) => void;
  imeiSearch: string;
  onImeiSearchChange: (value: string) => void;
  showOutOfStock: boolean;
  onShowOutOfStockChange: (checked: boolean) => void;
  onOpenScanner: () => void;
}

export function POSHeader({
  searchTerm,
  onSearchChange,
  imeiSearch,
  onImeiSearchChange,
  showOutOfStock,
  onShowOutOfStockChange,
  onOpenScanner,
}: POSHeaderProps) {
  const { settings, logoSrc } = useShopSettings();
  // Collapsed by default on mobile (≤lg) to save scroll space
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="sticky top-0 z-10 bg-white dark:bg-gray-950 border-b border-border p-3 lg:p-4 space-y-3 lg:space-y-4">
      <div className="flex items-start justify-between gap-2">
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="flex items-start gap-2 flex-1 min-w-0 text-left lg:cursor-default"
          aria-expanded={!collapsed}
          aria-label={collapsed ? "হেডার দেখান" : "হেডার লুকান"}
        >
          <div className="min-w-0 flex-1">
            <h1 className="text-lg sm:text-xl lg:text-3xl font-bold text-foreground truncate">পয়েন্ট অব সেল</h1>
            {!collapsed && (
              <p className="text-muted-foreground mt-1 text-xs sm:text-sm lg:text-base">
                বিক্রয় প্রক্রিয়া ও লেনদেন ব্যবস্থাপনা
              </p>
            )}
          </div>
          <span className="lg:hidden mt-1 text-muted-foreground shrink-0">
            {collapsed ? <ChevronDown className="w-5 h-5" /> : <ChevronUp className="w-5 h-5" />}
          </span>
        </button>
        {!collapsed && (
          <img src={logoSrc} alt={settings.shop_name} className="w-12 h-12 lg:w-20 lg:h-20 shrink-0" />
        )}
      </div>

      {/* Hidden on mobile when collapsed; always visible on lg+ */}
      <div className={`${collapsed ? "hidden lg:block" : "block"} space-y-3 lg:space-y-4`}>
        <div className="flex gap-2">
          <Input
            placeholder="🔍 নাম, ব্র্যান্ড বা SKU..."
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            className="flex-1 min-w-0"
          />
          <Input
            placeholder="📱 IMEI"
            value={imeiSearch}
            onChange={(e) => onImeiSearchChange(e.target.value)}
            className="w-24 lg:w-40 shrink-0"
          />
          <Button variant="outline" onClick={onOpenScanner} className="shrink-0">
            <ScanBarcode className="w-4 h-4 lg:mr-2" />
            <span className="hidden lg:inline">স্ক্যান</span>
          </Button>
        </div>

        <div className="flex items-center space-x-2">
          <Checkbox
            id="showOutOfStockPOS"
            checked={showOutOfStock}
            onCheckedChange={(checked) => onShowOutOfStockChange(checked as boolean)}
          />
          <label
            htmlFor="showOutOfStockPOS"
            className="text-xs lg:text-sm font-medium leading-none cursor-pointer"
          >
            স্টক শেষ পণ্যগুলি দেখান (০ স্টক)
          </label>
        </div>
      </div>
    </div>
  );
}
