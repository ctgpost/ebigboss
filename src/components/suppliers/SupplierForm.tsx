import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

interface SupplierFormData {
  name: string;
  email: string;
  phone: string;
  address: string;
  notes: string;
}

interface SupplierFormProps {
  formData: SupplierFormData;
  onChange: (data: SupplierFormData) => void;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
  isEditing: boolean;
}

export function SupplierForm({ formData, onChange, onSubmit, onCancel, isEditing }: SupplierFormProps) {
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-2">নাম *</label>
        <Input value={formData.name} onChange={(e) => onChange({ ...formData, name: e.target.value })} required />
      </div>
      <div>
        <label className="block text-sm font-medium mb-2">ইমেইল</label>
        <Input type="email" value={formData.email} onChange={(e) => onChange({ ...formData, email: e.target.value })} />
      </div>
      <div>
        <label className="block text-sm font-medium mb-2">ফোন</label>
        <Input value={formData.phone} onChange={(e) => onChange({ ...formData, phone: e.target.value })} />
      </div>
      <div>
        <label className="block text-sm font-medium mb-2">ঠিকানা</label>
        <Input value={formData.address} onChange={(e) => onChange({ ...formData, address: e.target.value })} />
      </div>
      <div>
        <label className="block text-sm font-medium mb-2">নোট</label>
        <Textarea value={formData.notes} onChange={(e) => onChange({ ...formData, notes: e.target.value })} />
      </div>
      <div className="flex gap-2 justify-end">
        <Button type="button" variant="outline" onClick={onCancel}>বাতিল</Button>
        <Button type="submit" className="bg-gradient-to-r from-primary to-accent">
          {isEditing ? "আপডেট" : "যুক্ত"} করুন
        </Button>
      </div>
    </form>
  );
}
