import { useState, useRef, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { uploadToCloudinary } from "@/utils/cloudinary";
import { toast } from "sonner";
import { useShopSettings } from "@/hooks/useShopSettings";
import { FieldError } from "@/components/ui/field-error";
import { shopSettingsSchema, validateInline } from "@/utils/validation";

export function BrandingSettings() {
  const { settings, logoSrc, refetch } = useShopSettings();
  const [shopName, setShopName] = useState("");
  const [shopSubtitle, setShopSubtitle] = useState("");
  const [shopAddress, setShopAddress] = useState("");
  const [shopPhone, setShopPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const faviconInputRef = useRef<HTMLInputElement>(null);

  // Initialize form values from settings using useEffect
  useEffect(() => {
    if (settings && settings.id) {
      setShopName(settings.shop_name || "");
      setShopSubtitle(settings.shop_subtitle || "");
      setShopAddress(settings.shop_address || "");
      setShopPhone(settings.shop_phone || "");
    }
  }, [settings?.id]);

  const handleSave = async () => {
    if (!settings.id) {
      toast.error("সেটিংস লোড হয়নি, অনুগ্রহ করে পেজ রিফ্রেশ করুন।");
      return;
    }

    const result = validateInline(shopSettingsSchema, {
      shop_name: shopName,
      shop_subtitle: shopSubtitle,
      shop_address: shopAddress,
      shop_phone: shopPhone,
    });
    setErrors(result.errors);
    if (!result.success) {
      toast.error("ফর্মে ভুল আছে — লাল চিহ্নিত ফিল্ডগুলো ঠিক করুন");
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from("shop_settings")
        .update({
          shop_name: shopName,
          shop_subtitle: shopSubtitle,
          shop_address: shopAddress,
          shop_phone: shopPhone,
        })
        .eq("id", settings.id);

      if (error) throw error;
      toast.success("ব্র্যান্ডিং সেটিংস সংরক্ষিত হয়েছে!");
      refetch();
    } catch (error: any) {
      toast.error("সংরক্ষণ ব্যর্থ: " + error.message);
    } finally {
      setSaving(false);
    }
  };

  const clearError = (key: string) =>
    setErrors((p) => {
      if (!p[key]) return p;
      const next = { ...p };
      delete next[key];
      return next;
    });

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!settings.id) {
      toast.error("সেটিংস লোড হয়নি।");
      return;
    }

    setUploading(true);
    try {
      const url = await uploadToCloudinary(file, "branding/logos");

      const { error: updateError } = await supabase
        .from("shop_settings")
        .update({ logo_url: url })
        .eq("id", settings.id);

      if (updateError) throw updateError;

      toast.success("লোগো আপলোড সম্পন্ন!");
      refetch();
    } catch (error: any) {
      toast.error("লোগো আপলোড ব্যর্থ: " + error.message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleFaviconUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!settings.id) {
      toast.error("সেটিংস লোড হয়নি।");
      return;
    }

    setUploading(true);
    try {
      const url = await uploadToCloudinary(file, "branding/favicons");

      const { error: updateError } = await supabase
        .from("shop_settings")
        .update({ favicon_url: url })
        .eq("id", settings.id);

      if (updateError) throw updateError;

      // Update favicon in real-time
      const link = document.querySelector("link[rel='icon']") as HTMLLinkElement;
      if (link) link.href = url;

      toast.success("ফেভিকন আপলোড সম্পন্ন!");
      refetch();
    } catch (error: any) {
      toast.error("ফেভিকন আপলোড ব্যর্থ: " + error.message);
    } finally {
      setUploading(false);
      if (faviconInputRef.current) faviconInputRef.current.value = "";
    }
  };

  return (
    <Card className="p-6 border-2 border-amber-400/50 bg-amber-50/30 dark:bg-amber-950/10">
      <h2 className="text-xl font-semibold mb-4 text-foreground">🔐 ব্র্যান্ডিং সেটিংস</h2>
      <p className="text-sm text-muted-foreground mb-6">
        দোকানের নাম, লোগো, ফেভিকন এবং ঠিকানা পরিবর্তন করুন। পরিবর্তনগুলো সব পেজে প্রতিফলিত হবে।
      </p>

      <div className="space-y-6">
        {/* Logo Preview & Upload */}
        <div className="flex items-center gap-6">
          <div className="w-24 h-24 rounded-xl border-2 border-dashed border-border flex items-center justify-center overflow-hidden bg-white">
            <img src={logoSrc} alt="Shop Logo" className="w-20 h-20 object-cover" />
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">দোকানের লোগো</p>
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
            <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
              {uploading ? "⏳ আপলোড হচ্ছে..." : "📤 লোগো আপলোড"}
            </Button>
          </div>
        </div>

        {/* Favicon Upload */}
        <div className="flex items-center gap-6">
          <div className="w-16 h-16 rounded-lg border-2 border-dashed border-border flex items-center justify-center overflow-hidden bg-white">
            {settings.favicon_url ? (
              <img src={settings.favicon_url} alt="Favicon" className="w-12 h-12 object-cover" />
            ) : (
              <span className="text-2xl">🌐</span>
            )}
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">ফেভিকন আইকন</p>
            <input ref={faviconInputRef} type="file" accept="image/*" onChange={handleFaviconUpload} className="hidden" />
            <Button size="sm" variant="outline" onClick={() => faviconInputRef.current?.click()} disabled={uploading}>
              {uploading ? "⏳ আপলোড হচ্ছে..." : "📤 ফেভিকন আপলোড"}
            </Button>
          </div>
        </div>

        {/* Text Fields */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">দোকানের নাম</label>
            <Input value={shopName} onChange={(e) => setShopName(e.target.value)} placeholder="BIG BOSS MOBILE SHOP" />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">সাবটাইটেল</label>
            <Input value={shopSubtitle} onChange={(e) => setShopSubtitle(e.target.value)} placeholder="Sales & Inventory Management System" />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-foreground mb-1">ঠিকানা</label>
            <Input value={shopAddress} onChange={(e) => setShopAddress(e.target.value)} placeholder="আপনার দোকানের ঠিকানা" />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">ফোন নম্বর</label>
            <Input value={shopPhone} onChange={(e) => setShopPhone(e.target.value)} placeholder="01XXXXXXXXX" />
          </div>
        </div>

        <Button onClick={handleSave} disabled={saving} className="w-full md:w-auto">
          {saving ? "⏳ সংরক্ষণ হচ্ছে..." : "💾 সংরক্ষণ করুন"}
        </Button>
      </div>
    </Card>
  );
}
