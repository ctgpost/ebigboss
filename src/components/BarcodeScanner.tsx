import { useEffect, useRef, useState, useCallback } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Camera, Keyboard } from "lucide-react";

interface BarcodeScannerProps {
  isOpen: boolean;
  onClose: () => void;
  onScan: (barcode: string) => void;
  title?: string;
}

export function BarcodeScanner({ isOpen, onClose, onScan, title = "বারকোড / IMEI স্ক্যান করুন" }: BarcodeScannerProps) {
  const [isScanning, setIsScanning] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [manualMode, setManualMode] = useState(false);
  const [manualInput, setManualInput] = useState("");
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const mountedRef = useRef(true);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const stopScanner = useCallback(async () => {
    try {
      if (scannerRef.current) {
        try {
          const state = scannerRef.current.getState();
          if (state === 2) {
            await scannerRef.current.stop();
          }
        } catch {}
        try { scannerRef.current.clear(); } catch {}
        scannerRef.current = null;
      }
      // Also stop any lingering media stream
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
      if (mountedRef.current) setIsScanning(false);
    } catch (error) {
      console.error("Error stopping scanner:", error);
      scannerRef.current = null;
    }
  }, []);

  const requestCameraPermission = useCallback(async (): Promise<boolean> => {
    try {
      // Explicitly request camera - this triggers the browser permission popup
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: "environment" } 
      });
      // Store and immediately stop - we just needed the permission grant
      streamRef.current = stream;
      stream.getTracks().forEach(t => t.stop());
      streamRef.current = null;
      return true;
    } catch (err: any) {
      console.error("Camera permission error:", err);
      const msg = err?.name || err?.message || String(err);
      if (msg.includes("NotAllowedError") || msg.includes("Permission")) {
        setCameraError(
          "ক্যামেরার অনুমতি প্রয়োজন। আপনার ব্রাউজারে ক্যামেরা অনুমতি দিন:\n\n" +
          "📱 Chrome: অ্যাড্রেস বারে 🔒 আইকনে ট্যাপ করুন → ক্যামেরা → Allow\n" +
          "📱 Safari: Settings → Safari → Camera → Allow\n\n" +
          "অনুমতি দেওয়ার পর 'আবার চেষ্টা করুন' বাটনে ক্লিক করুন।"
        );
      } else if (msg.includes("NotFoundError") || msg.includes("DevicesNotFound")) {
        setCameraError("এই ডিভাইসে কোনো ক্যামেরা পাওয়া যায়নি।");
      } else if (msg.includes("NotReadableError") || msg.includes("TrackStartError")) {
        setCameraError("ক্যামেরা অন্য অ্যাপে ব্যবহৃত হচ্ছে। অন্য অ্যাপ বন্ধ করে আবার চেষ্টা করুন।");
      } else {
        setCameraError(`ক্যামেরা চালু করতে ব্যর্থ: ${msg}`);
      }
      return false;
    }
  }, []);

  const startScanner = useCallback(async () => {
    setCameraError(null);
    setManualMode(false);

    // Check if mediaDevices API is available
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError(
        "আপনার ব্রাউজার ক্যামেরা সাপোর্ট করে না। HTTPS কানেকশন প্রয়োজন।\n" +
        "নিচে ম্যানুয়ালি IMEI/বারকোড টাইপ করুন।"
      );
      setManualMode(true);
      return;
    }

    // Step 1: Request camera permission explicitly (triggers popup)
    const hasPermission = await requestCameraPermission();
    if (!hasPermission) return;

    // Step 2: Wait for DOM
    await new Promise(resolve => setTimeout(resolve, 600));
    if (!mountedRef.current) return;

    const element = document.getElementById("barcode-reader");
    if (!element) {
      await new Promise(resolve => setTimeout(resolve, 500));
      if (!mountedRef.current || !document.getElementById("barcode-reader")) {
        setCameraError("স্ক্যানার এলিমেন্ট পাওয়া যায়নি। আবার চেষ্টা করুন।");
        return;
      }
    }

    try {
      if (scannerRef.current) await stopScanner();

      setIsScanning(true);
      scannerRef.current = new Html5Qrcode("barcode-reader");

      const config = {
        fps: 15,
        qrbox: { width: 280, height: 160 },
        aspectRatio: 1.5,
        formatsToSupport: undefined, // scan all formats
      };

      await scannerRef.current.start(
        { facingMode: "environment" },
        config,
        (decodedText) => {
          toast.success("স্ক্যান সফল!");
          onScan(decodedText);
          stopScanner();
          onClose();
        },
        () => {} // ignore per-frame no-match
      );
    } catch (error: any) {
      console.error("Scanner start error:", error);
      const errorMsg = error?.message || String(error);

      if (errorMsg.includes("NotAllowed") || errorMsg.includes("Permission")) {
        setCameraError(
          "ক্যামেরার অনুমতি দেওয়া হয়নি।\n\n" +
          "📱 অ্যাড্রেস বারে 🔒 আইকনে ট্যাপ করুন → ক্যামেরা → Allow করুন\n" +
          "তারপর 'আবার চেষ্টা করুন' বাটনে ক্লিক করুন।"
        );
      } else {
        setCameraError(`ক্যামেরা চালু করতে ব্যর্থ: ${errorMsg}`);
      }
      setIsScanning(false);
    }
  }, [onScan, onClose, stopScanner, requestCameraPermission]);

  useEffect(() => {
    if (isOpen) {
      startScanner();
    } else {
      stopScanner();
      setCameraError(null);
      setManualMode(false);
      setManualInput("");
    }
    return () => { stopScanner(); };
  }, [isOpen, startScanner, stopScanner]);

  const handleManualSubmit = () => {
    const val = manualInput.trim();
    if (!val) {
      toast.error("IMEI বা বারকোড লিখুন");
      return;
    }
    toast.success("ম্যানুয়াল ইনপুট সফল!");
    onScan(val);
    setManualInput("");
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      if (!open) { stopScanner(); onClose(); }
    }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>ক্যামেরা দিয়ে স্ক্যান করুন অথবা ম্যানুয়ালি টাইপ করুন</DialogDescription>
        </DialogHeader>
        
        <Card className="p-4">
          <div className="space-y-4">
            {/* Camera Scanner */}
            {!manualMode && (
              <div 
                id="barcode-reader"
                className="w-full rounded-lg overflow-hidden bg-black"
                style={{ minHeight: "280px" }}
              />
            )}

            {cameraError && (
              <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3 space-y-2">
                <p className="text-sm text-destructive font-medium whitespace-pre-line">⚠️ {cameraError}</p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => { setCameraError(null); startScanner(); }}
                    className="flex-1"
                  >
                    <Camera className="w-4 h-4 mr-1" />
                    আবার চেষ্টা করুন
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => { setManualMode(true); setCameraError(null); stopScanner(); }}
                    className="flex-1"
                  >
                    <Keyboard className="w-4 h-4 mr-1" />
                    টাইপ করুন
                  </Button>
                </div>
              </div>
            )}

            {/* Manual Input - always visible as fallback */}
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground font-medium">
                {manualMode ? "📝 IMEI বা বারকোড নম্বর টাইপ করুন:" : "📝 অথবা ম্যানুয়ালি টাইপ করুন:"}
              </p>
              <div className="flex gap-2">
                <Input
                  placeholder="IMEI বা বারকোড নম্বর..."
                  value={manualInput}
                  onChange={(e) => setManualInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleManualSubmit(); }}
                  className="flex-1"
                />
                <Button onClick={handleManualSubmit} size="sm">
                  খুঁজুন
                </Button>
              </div>
            </div>
            
            {isScanning && !cameraError && !manualMode && (
              <div className="flex items-center justify-center gap-2">
                <div className="w-2 h-2 bg-primary rounded-full animate-pulse" />
                <span className="text-xs text-muted-foreground">স্ক্যান চলছে...</span>
              </div>
            )}

            <Button
              variant="outline"
              onClick={() => { stopScanner(); onClose(); }}
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
