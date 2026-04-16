import { useEffect, useRef, useState, useCallback } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";

interface BarcodeScannerProps {
  isOpen: boolean;
  onClose: () => void;
  onScan: (barcode: string) => void;
  title?: string;
}

export function BarcodeScanner({ isOpen, onClose, onScan, title = "বারকোড / IMEI স্ক্যান করুন" }: BarcodeScannerProps) {
  const [isScanning, setIsScanning] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const mountedRef = useRef(true);
  const readerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const stopScanner = useCallback(async () => {
    try {
      if (scannerRef.current) {
        const state = scannerRef.current.getState();
        if (state === 2) {
          await scannerRef.current.stop();
        }
        scannerRef.current.clear();
        scannerRef.current = null;
        if (mountedRef.current) {
          setIsScanning(false);
        }
      }
    } catch (error) {
      console.error("Error stopping scanner:", error);
      scannerRef.current = null;
    }
  }, []);

  const startScanner = useCallback(async () => {
    setCameraError(null);

    // Wait for DOM element to be ready
    await new Promise(resolve => setTimeout(resolve, 500));

    if (!mountedRef.current) return;

    const element = document.getElementById("barcode-reader");
    if (!element) {
      console.error("barcode-reader element not found, retrying...");
      await new Promise(resolve => setTimeout(resolve, 500));
      if (!mountedRef.current || !document.getElementById("barcode-reader")) {
        setCameraError("স্ক্যানার এলিমেন্ট পাওয়া যায়নি। আবার চেষ্টা করুন।");
        return;
      }
    }

    try {
      // Clean up any previous instance
      if (scannerRef.current) {
        await stopScanner();
      }

      setIsScanning(true);
      scannerRef.current = new Html5Qrcode("barcode-reader");

      const config = {
        fps: 15,
        qrbox: { width: 280, height: 160 },
        aspectRatio: 1.5,
      };

      // First try to get camera permission
      const devices = await Html5Qrcode.getCameras();
      if (!devices || devices.length === 0) {
        setCameraError("কোনো ক্যামেরা পাওয়া যায়নি। আপনার ডিভাইসে ক্যামেরা আছে কিনা নিশ্চিত করুন।");
        setIsScanning(false);
        return;
      }

      await scannerRef.current.start(
        { facingMode: "environment" },
        config,
        (decodedText) => {
          toast.success("স্ক্যান সফল!");
          onScan(decodedText);
          stopScanner();
          onClose();
        },
        () => {
          // Ignore scan errors (no barcode found in frame)
        }
      );
    } catch (error: any) {
      console.error("Scanner error:", error);
      const errorMsg = error?.message || String(error);

      if (errorMsg.includes("NotAllowedError") || errorMsg.includes("Permission")) {
        setCameraError("ক্যামেরার অনুমতি দেওয়া হয়নি। ব্রাউজারের সেটিংস থেকে ক্যামেরার অনুমতি দিন এবং পেজ রিফ্রেশ করুন।");
      } else if (errorMsg.includes("NotFoundError") || errorMsg.includes("Requested device not found")) {
        setCameraError("ক্যামেরা পাওয়া যায়নি। পিছনের ক্যামেরা আছে কিনা নিশ্চিত করুন।");
      } else if (errorMsg.includes("NotReadableError") || errorMsg.includes("Could not start")) {
        setCameraError("ক্যামেরা অন্য অ্যাপ দ্বারা ব্যবহৃত হচ্ছে। অন্য অ্যাপ বন্ধ করে আবার চেষ্টা করুন।");
      } else {
        setCameraError(`ক্যামেরা চালু করতে ব্যর্থ: ${errorMsg}`);
      }
      setIsScanning(false);
    }
  }, [onScan, onClose, stopScanner]);

  // Start scanner when dialog opens (with delay for DOM)
  useEffect(() => {
    if (isOpen) {
      startScanner();
    } else {
      stopScanner();
      setCameraError(null);
    }

    return () => {
      stopScanner();
    };
  }, [isOpen, startScanner, stopScanner]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      if (!open) {
        stopScanner();
        onClose();
      }
    }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>মোবাইলের ক্যামেরা দিয়ে বারকোড বা IMEI স্ক্যান করুন</DialogDescription>
        </DialogHeader>
        
        <Card className="p-4">
          <div className="space-y-4">
            <div 
              id="barcode-reader"
              ref={readerRef}
              className="w-full rounded-lg overflow-hidden bg-black"
              style={{ minHeight: "280px" }}
            />

            {cameraError && (
              <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3 space-y-2">
                <p className="text-sm text-destructive font-medium">⚠️ {cameraError}</p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setCameraError(null);
                    startScanner();
                  }}
                  className="w-full"
                >
                  🔄 আবার চেষ্টা করুন
                </Button>
              </div>
            )}
            
            <div className="text-center space-y-2">
              <p className="text-sm text-muted-foreground">
                📱 মোবাইলের ক্যামেরা দিয়ে বারকোড / IMEI বারকোড স্ক্যান করুন
              </p>
              {isScanning && !cameraError && (
                <div className="flex items-center justify-center gap-2">
                  <div className="w-2 h-2 bg-primary rounded-full animate-pulse" />
                  <span className="text-xs text-muted-foreground">স্ক্যান চলছে...</span>
                </div>
              )}
            </div>

            <Button
              variant="outline"
              onClick={() => {
                stopScanner();
                onClose();
              }}
              className="w-full"
            >
              বাতিল
            </Button>
          </div>
        </Card>
      </DialogContent>
    </Dialog>
  );
}
