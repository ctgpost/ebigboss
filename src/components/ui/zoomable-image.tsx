import { useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { getCloudinaryThumbnail } from "@/utils/cloudinary";
import { ZoomIn, X } from "lucide-react";

interface ZoomableImageProps {
  url?: string | null;
  alt?: string;
  /** Display size in detail card (passport-like) */
  displayWidth?: number;
  displayHeight?: number;
  className?: string;
  label?: string;
}

/**
 * Passport-size product/customer/supplier image with click-to-zoom (full-screen lightbox).
 * - Shows nothing if no URL.
 * - Uses Cloudinary thumbnail for display, original URL on zoom.
 */
export function ZoomableImage({
  url,
  alt = "Image",
  displayWidth = 140,
  displayHeight = 180,
  className = "",
  label,
}: ZoomableImageProps) {
  const [open, setOpen] = useState(false);
  if (!url) return null;

  const thumb = getCloudinaryThumbnail(url, displayWidth * 2, displayHeight * 2);

  return (
    <>
      <div className={`flex flex-col items-center gap-1 ${className}`}>
        {label && <span className="text-xs text-muted-foreground">{label}</span>}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="relative group rounded-lg overflow-hidden border-2 border-border hover:border-primary transition-all shadow-sm"
          style={{ width: displayWidth, height: displayHeight }}
          title="বড় করে দেখুন"
        >
          <img
            src={thumb}
            alt={alt}
            className="w-full h-full object-cover"
            loading="lazy"
          />
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all flex items-center justify-center">
            <ZoomIn className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        </button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl p-2 bg-background/95 backdrop-blur-sm">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="absolute top-2 right-2 z-10 bg-background/80 hover:bg-background rounded-full p-2 shadow-md"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
          <div className="flex items-center justify-center w-full">
            <img
              src={url}
              alt={alt}
              className="max-w-full max-h-[85vh] object-contain rounded-md"
            />
          </div>
          {alt && <p className="text-center text-sm text-muted-foreground pt-2">{alt}</p>}
        </DialogContent>
      </Dialog>
    </>
  );
}
