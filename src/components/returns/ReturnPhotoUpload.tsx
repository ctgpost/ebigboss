import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Camera, Upload, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { ZoomableImage } from "@/components/ui/zoomable-image";

interface Props {
  currentUrl?: string | null;
  onChange: (url: string | null) => void;
}

/** Uploads a defect-proof photo to the Supabase `return-photos` bucket. */
export function ReturnPhotoUpload({ currentUrl, onChange }: Props) {
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);

  const upload = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("শুধু ছবি ফাইল আপলোড করুন");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("ছবি ১০MB এর বেশি হতে পারবে না");
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `defects/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error } = await supabase.storage.from("return-photos").upload(path, file, {
        cacheControl: "3600",
        upsert: false,
      });
      if (error) throw error;
      const { data } = supabase.storage.from("return-photos").getPublicUrl(path);
      onChange(data.publicUrl);
      toast.success("ছবি আপলোড সফল");
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || "আপলোড ব্যর্থ");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-2">
      <input ref={fileRef} type="file" accept="image/*" hidden
        onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
      <input ref={camRef} type="file" accept="image/*" capture="environment" hidden
        onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />

      {currentUrl ? (
        <div className="relative inline-block">
          <ZoomableImage src={currentUrl} alt="ত্রুটিপূর্ণ পণ্যের ছবি"
            className="w-32 h-32 object-cover rounded-lg border-2 border-border" />
          <Button size="icon" variant="destructive" type="button"
            className="absolute -top-2 -right-2 h-6 w-6 rounded-full"
            onClick={() => onChange(null)}>
            <X className="h-3 w-3" />
          </Button>
        </div>
      ) : (
        <div className="flex gap-2 flex-wrap">
          <Button type="button" variant="outline" size="sm" disabled={uploading}
            onClick={() => fileRef.current?.click()}>
            {uploading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Upload className="h-4 w-4 mr-1" />}
            গ্যালারি
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={uploading}
            onClick={() => camRef.current?.click()}>
            <Camera className="h-4 w-4 mr-1" />ক্যামেরা
          </Button>
        </div>
      )}
      <p className="text-xs text-muted-foreground">ত্রুটিপূর্ণ পণ্যের প্রমাণ হিসেবে ছবি যোগ করুন (ঐচ্ছিক)</p>
    </div>
  );
}
