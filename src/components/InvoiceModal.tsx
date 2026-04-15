import { useRef } from "react";
import { useReactToPrint } from "react-to-print";
import { Button } from "@/components/ui/button";
import { useShopSettings } from "@/hooks/useShopSettings";

interface InvoiceModalProps {
  isOpen: boolean;
  sale: any;
  onClose: () => void;
}

export function InvoiceModal({ isOpen, sale, onClose }: InvoiceModalProps) {
  const { settings } = useShopSettings();
  const componentRef = useRef<HTMLDivElement>(null);

  const handlePrint = useReactToPrint({
    contentRef: componentRef,
  });

  if (!isOpen || !sale) return null;

  const formatDate = (timestamp: string) => {
    return new Date(timestamp).toLocaleDateString('bn-BD', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getPaymentMethodBn = (method: string) => {
    switch(method) {
      case 'cash': return 'নগদ';
      case 'card': return 'কার্ড';
      case 'mobile': return 'মোবাইল ব্যাংকিং';
      default: return method;
    }
  };

  const totalAmount = Number(sale.total_amount);
  const paidAmount = Number(sale.paid_amount || totalAmount);
  const dueAmount = Number(sale.due_amount || 0);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center p-4 border-b">
          <h2 className="text-xl font-bold">ইনভয়েস</h2>
          <div className="flex gap-2">
            <Button onClick={() => handlePrint()}>🖨️ প্রিন্ট</Button>
            <Button variant="outline" onClick={onClose}>বন্ধ করুন</Button>
          </div>
        </div>

        <div ref={componentRef} className="p-8">
          {/* Company Header */}
          <div className="text-center mb-8 border-b pb-4">
            <h1 className="text-3xl font-bold text-primary mb-2">👑 {settings.shop_name}</h1>
            <p className="text-sm text-muted-foreground">{settings.shop_subtitle || "মোবাইল শপ ম্যানেজমেন্ট সিস্টেম"}</p>
            <p className="text-xs text-muted-foreground mt-1">ঠিকানা: {settings.shop_address || "আপনার দোকানের ঠিকানা"}</p>
            {settings.shop_phone && <p className="text-xs text-muted-foreground">ফোন: {settings.shop_phone}</p>}
          </div>

          {/* Invoice Details */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div>
              <h3 className="font-semibold text-sm text-muted-foreground mb-2">ক্রেতা:</h3>
              <p className="font-medium">
                {sale.customers?.name || sale.instant_customer_name || "সাধারণ ক্রেতা"}
              </p>
              {(sale.customers?.phone || sale.instant_customer_phone) && (
                <p className="text-sm">📞 {sale.customers?.phone || sale.instant_customer_phone}</p>
              )}
              {sale.customers?.email && <p className="text-sm">📧 {sale.customers.email}</p>}
            </div>
            <div className="text-right">
              <p className="text-sm"><span className="font-semibold">ইনভয়েস #:</span> {sale.id.slice(0, 8)}</p>
              <p className="text-sm"><span className="font-semibold">তারিখ:</span> {formatDate(sale.created_at)}</p>
              <p className="text-sm"><span className="font-semibold">পেমেন্ট:</span> {getPaymentMethodBn(sale.payment_method)}</p>
            </div>
          </div>

          {/* Items Table */}
          <table className="w-full mb-6">
            <thead>
              <tr className="border-b-2 border-gray-300">
                <th className="text-left py-2 text-sm">পণ্য</th>
                <th className="text-center py-2 text-sm">পরিমাণ</th>
                <th className="text-right py-2 text-sm">মূল্য</th>
                <th className="text-right py-2 text-sm">মোট</th>
              </tr>
            </thead>
            <tbody>
              {sale.sale_items?.map((item: any, index: number) => (
                <tr key={index} className="border-b">
                  <td className="py-3">
                    <p className="font-medium">{item.products?.name || "পণ্য"}</p>
                    {item.products?.imei && (
                      <p className="text-xs text-muted-foreground">IMEI: {item.products.imei}</p>
                    )}
                    {item.products?.brand && (
                      <p className="text-xs text-muted-foreground">ব্র্যান্ড: {item.products.brand}</p>
                    )}
                  </td>
                  <td className="text-center py-3">{item.quantity}</td>
                  <td className="text-right py-3">৳{Number(item.unit_price).toLocaleString('bn-BD')}</td>
                  <td className="text-right py-3 font-semibold">৳{Number(item.total_price).toLocaleString('bn-BD')}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Totals */}
          <div className="flex justify-end mb-8">
            <div className="w-64">
              <div className="flex justify-between py-2 border-t">
                <span className="font-semibold">সাবটোটাল:</span>
                <span>৳{totalAmount.toLocaleString('bn-BD')}</span>
              </div>
              <div className="flex justify-between py-2">
                <span className="font-semibold">পরিশোধিত:</span>
                <span className="text-green-700">৳{paidAmount.toLocaleString('bn-BD')}</span>
              </div>
              {dueAmount > 0 && (
                <div className="flex justify-between py-2 bg-red-50 px-2 rounded">
                  <span className="font-bold text-red-600">বাকি:</span>
                  <span className="font-bold text-red-600">৳{dueAmount.toLocaleString('bn-BD')}</span>
                </div>
              )}
              <div className="flex justify-between py-2 border-t-2 border-gray-800">
                <span className="font-bold text-lg">সর্বমোট:</span>
                <span className="font-bold text-lg">৳{totalAmount.toLocaleString('bn-BD')}</span>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="text-center border-t pt-4 text-sm text-muted-foreground">
            <p>ধন্যবাদ আপনার ক্রয়ের জন্য!</p>
            <p className="mt-2">{settings.shop_name} - আপনার বিশ্বস্ত মোবাইল শপ</p>
          </div>
        </div>
      </div>
    </div>
  );
}
