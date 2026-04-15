import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Customer } from "./types";

interface PaymentSectionProps {
  customers: Customer[] | undefined;
  selectedCustomer: string;
  onCustomerChange: (customerId: string) => void;
  paymentMethod: string;
  onPaymentMethodChange: (method: string) => void;
  total: number;
  cartEmpty: boolean;
  isProcessing: boolean;
  onCompleteSale: () => void;
  instantCustomerName: string;
  onInstantCustomerNameChange: (name: string) => void;
  instantCustomerPhone: string;
  onInstantCustomerPhoneChange: (phone: string) => void;
  paidAmount: number;
  onPaidAmountChange: (amount: number) => void;
}

export function PaymentSection({
  customers,
  selectedCustomer,
  onCustomerChange,
  paymentMethod,
  onPaymentMethodChange,
  total,
  cartEmpty,
  isProcessing,
  onCompleteSale,
  instantCustomerName,
  onInstantCustomerNameChange,
  instantCustomerPhone,
  onInstantCustomerPhoneChange,
  paidAmount,
  onPaidAmountChange,
}: PaymentSectionProps) {
  const [useInstantCustomer, setUseInstantCustomer] = useState(false);

  const dueAmount = Math.max(0, total - paidAmount);

  return (
    <div className="space-y-3 lg:space-y-4 pt-4 border-t border-border">
      <div>
        <label className="block text-xs lg:text-sm font-medium mb-2 text-foreground">
          কাস্টমার (ঐচ্ছিক)
        </label>
        <Select
          value={selectedCustomer}
          onValueChange={(val) => {
            onCustomerChange(val);
            if (val) setUseInstantCustomer(false);
          }}
          disabled={useInstantCustomer}
        >
          <SelectTrigger className="h-9">
            <SelectValue placeholder="কাস্টমার নির্বাচন করুন" />
          </SelectTrigger>
          <SelectContent>
            {customers?.map((customer) => (
              <SelectItem key={customer.id} value={customer.id}>
                {customer.name} {customer.phone ? `(${customer.phone})` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Instant Customer Toggle */}
      <div>
        <button
          type="button"
          className="text-xs text-primary underline mb-2"
          onClick={() => {
            setUseInstantCustomer(!useInstantCustomer);
            if (!useInstantCustomer) {
              onCustomerChange("");
            } else {
              onInstantCustomerNameChange("");
              onInstantCustomerPhoneChange("");
            }
          }}
        >
          {useInstantCustomer ? "❌ ইন্সট্যান্ট কাস্টমার বাদ দিন" : "➕ ইন্সট্যান্ট কাস্টমার যুক্ত করুন"}
        </button>

        {useInstantCustomer && (
          <div className="space-y-2 p-3 rounded-lg bg-muted/50 border border-border">
            <Input
              placeholder="কাস্টমারের নাম"
              value={instantCustomerName}
              onChange={(e) => onInstantCustomerNameChange(e.target.value)}
              className="h-8 text-sm"
            />
            <Input
              placeholder="মোবাইল নম্বর"
              value={instantCustomerPhone}
              onChange={(e) => onInstantCustomerPhoneChange(e.target.value)}
              className="h-8 text-sm"
              type="tel"
            />
          </div>
        )}
      </div>

      <div>
        <label className="block text-xs lg:text-sm font-medium mb-2 text-foreground">
          পেমেন্ট পদ্ধতি
        </label>
        <Select value={paymentMethod} onValueChange={onPaymentMethodChange}>
          <SelectTrigger className="h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="cash">💵 নগদ</SelectItem>
            <SelectItem value="card">💳 কার্ড</SelectItem>
            <SelectItem value="mobile">📱 মোবাইল</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="bg-primary/10 p-3 lg:p-4 rounded-lg space-y-2">
        <div className="flex justify-between items-center">
          <span className="text-base lg:text-lg font-semibold text-foreground">সর্বমোট:</span>
          <span className="text-xl lg:text-2xl font-bold text-primary">
            ৳{total.toLocaleString('bn-BD')}
          </span>
        </div>

        {/* Paid Amount */}
        <div className="flex items-center gap-2">
          <label className="text-xs lg:text-sm font-medium text-foreground whitespace-nowrap">পরিশোধ:</label>
          <Input
            type="number"
            value={paidAmount || ""}
            onChange={(e) => onPaidAmountChange(Math.max(0, Number(e.target.value)))}
            className="h-8 text-sm flex-1"
            placeholder="পরিশোধিত টাকা"
          />
        </div>

        {/* Due Amount */}
        {dueAmount > 0 && (
          <div className="flex justify-between items-center text-destructive">
            <span className="text-sm font-semibold">বাকি:</span>
            <span className="text-lg font-bold">৳{dueAmount.toLocaleString('bn-BD')}</span>
          </div>
        )}
      </div>

      <Button
        className="w-full bg-gradient-to-r from-primary to-accent hover:opacity-90 py-5 lg:py-6 text-base lg:text-lg font-semibold"
        onClick={onCompleteSale}
        disabled={cartEmpty || isProcessing}
      >
        {isProcessing ? "প্রক্রিয়াকরণ..." : dueAmount > 0 ? "💰 বাকিতে বিক্রয় করুন" : "💰 বিক্রয় সম্পন্ন করুন"}
      </Button>
    </div>
  );
}
