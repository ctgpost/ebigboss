import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import defaultLogo from "@/assets/77aa0cdb-3fb5-4fa9-8c46-5898ea6d7306.png";

export interface ShopSettings {
  id: string;
  shop_name: string;
  shop_subtitle: string;
  shop_address: string;
  shop_phone: string;
  logo_url: string;
  favicon_url: string;
}

const DEFAULT_SETTINGS: ShopSettings = {
  id: "",
  shop_name: "BIG BOSS MOBILE SHOP",
  shop_subtitle: "Sales & Inventory Management System",
  shop_address: "৫ নং গলি, Shop No-13, New Market, Karanihat, Satkania, Chittagong",
  shop_phone: "",
  logo_url: "",
  favicon_url: "",
};

export function useShopSettings() {
  const queryClient = useQueryClient();

  const { data: settings, isLoading } = useQuery({
    queryKey: ["shop-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shop_settings")
        .select("*")
        .limit(1)
        .maybeSingle();
      if (error) {
        console.error("Error fetching shop settings:", error);
        return DEFAULT_SETTINGS;
      }
      return (data as ShopSettings) || DEFAULT_SETTINGS;
    },
    staleTime: 1000 * 60 * 5,
  });

  const resolvedSettings = settings || DEFAULT_SETTINGS;
  const logoSrc = resolvedSettings.logo_url || defaultLogo;

  const refetch = () => queryClient.invalidateQueries({ queryKey: ["shop-settings"] });

  return { settings: resolvedSettings, logoSrc, isLoading, refetch };
}
