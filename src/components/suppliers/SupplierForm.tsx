import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CloudinaryImageUpload } from "../CloudinaryImageUpload";
import { FieldError } from "@/components/ui/field-error";

interface SupplierFormData {
  name: string;
  email: string;
  phone: string;
  address: string;
  notes: string;
  image_url: string;
}

interface SupplierFormProps {
  formData: SupplierFormData;
  onChange: (data: SupplierFormData) => void;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
  isEditing: boolean;
  errors?: Record<string, string>;
  onClearError?: (key: string) => void;
  isSubmitting?: boolean;
}

export function SupplierForm({ formData, onChange, onSubmit, onCancel, isEditing, errors = {}, onClearError, isSubmitting = false }: SupplierFormProps) {
  const clear = (k: string) => onClearError?.(k);
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-2">নাম *</label>
        <Input
          value={formData.name}
          onChange={(e) => { onChange({ ...formData, name: e.target.value }); clear("name"); }}
          aria-invalid={!!errors.name}
        />
        <FieldError message={errors.name} />
      </div>
      <div>
        <label className="block text-sm font-medium mb-2">ইমেইল</label>
        <Input
          type="email"
          value={formData.email}
          onChange={(e) => { onChange({ ...formData, email: e.target.value }); clear("email"); }}
          aria-invalid={!!errors.email}
        />
        <FieldError message={errors.email} />
      </div>
      <div>
        <label className="block text-sm font-medium mb-2">ফোন</label>
        <Input
          value={formData.phone}
          onChange={(e) => { onChange({ ...formData, phone: e.target.value }); clear("phone"); }}
          type="tel"
          inputMode="numeric"
          maxLength={11}
          placeholder="01XXXXXXXXX"
          aria-invalid={!!errors.phone}
        />
        <FieldError message={errors.phone} />
      </div>
      <div>
        <label className="block text-sm font-medium mb-2">ঠিকানা</label>
        <Input
          value={formData.address}
          onChange={(e) => { onChange({ ...formData, address: e.target.value }); clear("address"); }}
          aria-invalid={!!errors.address}
        />
        <FieldError message={errors.address} />
      </div>
      <div>
        <label className="block text-sm font-medium mb-2">নোট</label>
        <Textarea
          value={formData.notes}
          onChange={(e) => { onChange({ ...formData, notes: e.target.value }); clear("notes"); }}
          aria-invalid={!!errors.notes}
        />
        <FieldError message={errors.notes} />
      </div>
      <div>
        <CloudinaryImageUpload
          currentImageUrl={formData.image_url}
          onUpload={(url) => onChange({ ...formData, image_url: url })}
          folder="suppliers"
          label="📷 সাপ্লায়ারের ছবি"
        />
      </div>
      <div className="flex gap-2 justify-end">
        <Button type="button" variant="outline" onClick={onCancel}>বাতিল</Button>
        <Button type="submit" disabled={isSubmitting} className="bg-gradient-to-r from-primary to-accent">
          {isSubmitting ? "প্রক্রিয়াকরণ..." : `${isEditing ? "আপডেট" : "যুক্ত"} করুন`}
        </Button>
      </div>
    </form>
  );
}
