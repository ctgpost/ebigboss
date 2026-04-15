import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";

interface BarcodeScannerProps {
  isOpen: boolean;
  onClose: () => void;
  onScan: (barcode: string) => void;
  title?: string;
}

export function BarcodeScanner({ isOpen, onClose, onScan, title = "বারকোড / IMEI স্ক্যান করুন" }: BarcodeScannerProps) {
  const [isScanning, setIsScanning] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (isOpen && !isScanning) {
      startScanner();
    }

    return () => {
      stopScanner();
    };
  }, [isOpen]);

  const startScanner = async () => {
    try {
      setIsScanning(true);
      
      scannerRef.current = new Html5Qrcode("barcode-reader");

      const config = {
        fps: 15,
        qrbox: { width: 280, height: 160 },
        aspectRatio: 1.5,
        formatsToSupport: undefined, // support all formats including CODE_128, EAN_13 etc.
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
        () => {
          // Ignore scan errors
        }
      );
    } catch (error: any) {
      console.error("Scanner error:", error);
      toast.error("ক্যামেরা চালু করতে ব্যর্থ। ক্যামেরার অনুমতি দিন।");
      setIsScanning(false);
      onClose();
    }
  };

  const stopScanner = async () => {
    try {
      if (scannerRef.current) {
        const state = scannerRef.current.getState();
        if (state === 2) { // SCANNING state
          await scannerRef.current.stop();
        }
        scannerRef.current = null;
        if (mountedRef.current) {
          setIsScanning(false);
        }
      }
    } catch (error) {
      console.error("Error stopping scanner:", error);
    }
  };

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
        </DialogHeader>
        
        <Card className="p-4">
          <div className="space-y-4">
            <div 
              id="barcode-reader" 
              className="w-full rounded-lg overflow-hidden bg-black"
              style={{ minHeight: "280px" }}
            />
            
            <div className="text-center space-y-2">
              <p className="text-sm text-muted-foreground">
                📱 মোবাইলের ক্যামেরা দিয়ে বারকোড / IMEI বারকোড স্ক্যান করুন
              </p>
              {isScanning && (
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
