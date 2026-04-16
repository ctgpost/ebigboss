import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { uploadToCloudinary, getCloudinaryThumbnail } from "@/utils/cloudinary";
import { toast } from "sonner";
import { Camera, Upload, X, Loader2 } from "lucide-react";

interface CloudinaryImageUploadProps {
  currentImageUrl?: string | null;
  onUpload: (url: string) => void;
  folder?: string;
  label?: string;
}

export function CloudinaryImageUpload({ currentImageUrl, onUpload, folder = "general", label = "ছবি" }: CloudinaryImageUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(currentImageUrl || null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("শুধুমাত্র ছবি ফাইল আপলোড করুন");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("ছবি ১০MB এর বেশি হতে পারবে না");
      return;
    }

    setUploading(true);
    try {
      const url = await uploadToCloudinary(file, folder);
      setPreview(url);
      onUpload(url);
      toast.success("ছবি আপলোড সফল!");
    } catch (err) {
      toast.error("ছবি আপলোড ব্যর্থ");
      console.error(err);
    } finally {
      setUploading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleUpload(file);
    e.target.value = "";
  };

  const clearImage = () => {
    setPreview(null);
    onUpload("");
  };

  const displayUrl = preview ? getCloudinaryThumbnail(preview, 300, 300) : null;

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium">{label}</label>
      
      {displayUrl && (
        <div className="relative inline-block">
          <img src={displayUrl} alt="Preview" className="w-24 h-24 object-cover rounded-lg border border-border" />
          <button
            type="button"
            onClick={clearImage}
            className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full w-5 h-5 flex items-center justify-center text-xs"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      <div className="flex gap-2">
        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
        <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" onChange={handleFileChange} className="hidden" />
        
        <Button type="button" variant="outline" size="sm" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
          {uploading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Upload className="w-4 h-4 mr-1" />}
          গ্যালারি
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={uploading} onClick={() => cameraInputRef.current?.click()}>
          <Camera className="w-4 h-4 mr-1" />
          ক্যামেরা
        </Button>
      </div>
    </div>
  );
}
