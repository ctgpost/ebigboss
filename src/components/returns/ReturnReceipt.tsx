import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer, X } from "lucide-react";
import { format } from "date-fns";
import { bn } from "date-fns/locale";
import { useShopSettings } from "@/hooks/useShopSettings";

interface Props {
  open: boolean;
  onClose: () => void;
  returnRecord: any;
}

const REASON_LABELS: Record<string, string> = {
  defective: "ত্রুটিপূর্ণ পণ্য",
  wrong_item: "ভুল পণ্য",
  customer_request: "ক্রেতার অনুরোধ",
  damaged: "ক্ষতিগ্রস্ত",
  not_as_described: "বিবরণ অনুযায়ী নয়",
  other: "অন্যান্য",
};

const METHOD_LABELS: Record<string, string> = {
  cash: "নগদ ফেরত",
  due_adjust: "বাকি সমন্বয়",
  exchange: "পণ্য বিনিময়",
};

export function ReturnReceipt({ open, onClose, returnRecord }: Props) {
  const { settings } = useShopSettings();

  if (!returnRecord) return null;

  const print = () => {
    const printContent = document.getElementById("return-receipt-print")?.innerHTML;
    if (!printContent) return;
    const w = window.open("", "_blank", "width=600,height=800");
    if (!w) return;
    w.document.write(`<!doctype html><html><head><title>রিটার্ন রসিদ — ${returnRecord.return_number}</title>
      <style>
        @page { size: 80mm auto; margin: 4mm; }
        body { font-family: 'Noto Sans Bengali', system-ui, sans-serif; color: #000; padding: 8px; font-size: 12px; }
        .center { text-align: center; }
        .right { text-align: right; }
        .bold { font-weight: 700; }
        hr { border: none; border-top: 1px dashed #000; margin: 6px 0; }
        .row { display: flex; justify-content: space-between; gap: 8px; margin: 2px 0; }
        h2 { margin: 4px 0; font-size: 14px; }
        h3 { margin: 4px 0; font-size: 13px; }
        .badge { border: 1px solid #000; padding: 1px 4px; border-radius: 3px; font-size: 10px; }
      </style></head><body>${printContent}</body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => { w.print(); w.close(); }, 300);
  };

  const product = returnRecord.products;
  const sale = returnRecord.sales;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            রিটার্ন রসিদ
            <div className="flex gap-2">
              <Button size="sm" onClick={print} className="gap-1"><Printer className="h-4 w-4" />প্রিন্ট</Button>
              <Button size="sm" variant="ghost" onClick={onClose}><X className="h-4 w-4" /></Button>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div id="return-receipt-print" className="bg-white text-black p-3 text-sm rounded">
          <div className="center">
            {settings?.logo_url && (
              <img src={settings.logo_url} alt="logo" style={{ maxHeight: 50, margin: "0 auto 4px" }} />
            )}
            <h2 className="bold">{settings?.shop_name || "BIG BOSS MOBILE STATION"}</h2>
            {settings?.shop_address && <div style={{ fontSize: 10 }}>{settings.shop_address}</div>}
            {settings?.shop_phone && <div style={{ fontSize: 10 }}>📞 {settings.shop_phone}</div>}
          </div>
          <hr />
          <h3 className="center bold">রিটার্ন রসিদ / RETURN RECEIPT</h3>
          {returnRecord.is_audit_only && (
            <div className="center"><span className="badge">📋 অডিট-অনলি (স্টক/ফাইন্যান্স অপরিবর্তিত)</span></div>
          )}
          <hr />

          <div className="row"><span>রসিদ নং:</span><span className="bold">{returnRecord.return_number}</span></div>
          <div className="row"><span>তারিখ:</span><span>{format(new Date(returnRecord.created_at), "dd MMM yyyy, hh:mm a", { locale: bn })}</span></div>
          <div className="row"><span>মূল বিক্রয়:</span><span style={{ fontFamily: "monospace" }}>#{returnRecord.sale_id?.slice(0, 8)}</span></div>
          {sale?.customers?.name && <div className="row"><span>ক্রেতা:</span><span>{sale.customers.name}</span></div>}
          {sale?.customers?.phone && <div className="row"><span>মোবাইল:</span><span>{sale.customers.phone}</span></div>}
          <hr />

          <div className="bold">পণ্যের বিবরণ:</div>
          <div className="row"><span>নাম:</span><span>{product?.name}</span></div>
          {product?.brand && <div className="row"><span>ব্র্যান্ড:</span><span>{product.brand} {product.model || ""}</span></div>}
          {product?.imei && <div className="row"><span>IMEI:</span><span style={{ fontFamily: "monospace", fontSize: 10 }}>{product.imei}</span></div>}
          <div className="row"><span>পরিমাণ:</span><span>{returnRecord.quantity}</span></div>
          <hr />

          <div className="bold">কারণ ও পদ্ধতি:</div>
          <div className="row"><span>কারণ:</span><span>{REASON_LABELS[returnRecord.reason_code] || returnRecord.reason_code}</span></div>
          {returnRecord.reason_notes && <div style={{ fontSize: 10, fontStyle: "italic" }}>"{returnRecord.reason_notes}"</div>}
          <div className="row"><span>পদ্ধতি:</span><span className="bold">{METHOD_LABELS[returnRecord.refund_method] || returnRecord.refund_method}</span></div>
          <hr />

          <div className="row" style={{ fontSize: 14 }}>
            <span className="bold">{returnRecord.refund_method === "exchange" ? "বিনিময় মূল্য:" : "রিফান্ড পরিমাণ:"}</span>
            <span className="bold">৳{Number(returnRecord.refund_amount).toLocaleString("bn-BD")}</span>
          </div>
          <hr />

          <hr />

          <div className="bold">অনুমোদন টাইমলাইন:</div>
          <div className="row">
            <span>তৈরি:</span>
            <span>{format(new Date(returnRecord.created_at), "dd MMM yyyy, hh:mm a", { locale: bn })}</span>
          </div>
          {returnRecord.approved_at && (
            <div className="row">
              <span>{returnRecord.status === "rejected" ? "প্রত্যাখ্যাত:" : "অনুমোদিত:"}</span>
              <span>{format(new Date(returnRecord.approved_at), "dd MMM yyyy, hh:mm a", { locale: bn })}</span>
            </div>
          )}
          {(returnRecord.approved_by_profile?.full_name || returnRecord.approved_by_profile?.email) && (
            <div className="row">
              <span>অনুমোদনকারী:</span>
              <span>{returnRecord.approved_by_profile?.full_name || returnRecord.approved_by_profile?.email}</span>
            </div>
          )}
          <hr />

          <div className="center" style={{ fontSize: 10, marginTop: 8 }}>
            স্ট্যাটাস: <span className="bold">{returnRecord.status === "completed" ? "✓ অনুমোদিত" : returnRecord.status === "rejected" ? "✗ প্রত্যাখ্যাত" : "⏳ অপেক্ষমাণ"}</span>
          </div>
          <div className="center" style={{ fontSize: 10, marginTop: 6 }}>
            ধন্যবাদ! / Thank you for your visit.
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
