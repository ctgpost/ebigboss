import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { categorySchema, validateInline } from "@/utils/validation";
import { FieldError } from "@/components/ui/field-error";

export function Categories() {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const queryClient = useQueryClient();

  const { data: categories } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data, error } = await supabase.from("categories").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const addMutation = useMutation({
    mutationFn: async (data: any) => {
      const { error } = await supabase.from("categories").insert([data]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      toast.success("Category added successfully!");
      setIsAddDialogOpen(false);
      resetForm();
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to add category");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("categories").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      toast.success("Category deleted successfully!");
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to delete category");
    },
  });

  const resetForm = () => {
    setFormData({
      name: "",
      description: "",
    });
    setFormErrors({});
  };

  const clearError = (key: string) =>
    setFormErrors((p) => {
      if (!p[key]) return p;
      const next = { ...p };
      delete next[key];
      return next;
    });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const result = validateInline(categorySchema, formData);
    setFormErrors(result.errors);
    if (!result.success) {
      toast.error("ফর্মে ভুল আছে — লাল চিহ্নিত ফিল্ডগুলো ঠিক করুন");
      return;
    }
    addMutation.mutate(formData);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold text-foreground">Categories</h2>
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-gradient-to-r from-primary to-accent">
              ➕ Add Category
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Category</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Name *</label>
                <Input
                  value={formData.name}
                  onChange={(e) => { setFormData({ ...formData, name: e.target.value }); clearError("name"); }}
                  aria-invalid={!!formErrors.name}
                />
                <FieldError message={formErrors.name} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Description</label>
                <Input
                  value={formData.description}
                  onChange={(e) => { setFormData({ ...formData, description: e.target.value }); clearError("description"); }}
                  aria-invalid={!!formErrors.description}
                />
                <FieldError message={formErrors.description} />
              </div>
              <div className="flex gap-2 justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setIsAddDialogOpen(false);
                    resetForm();
                  }}
                >
                  Cancel
                </Button>
                <Button type="submit" className="bg-gradient-to-r from-primary to-accent">
                  Add Category
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {categories?.map((category) => (
          <Card key={category.id} className="p-4 card-hover">
            <div className="space-y-2">
              <h3 className="font-semibold text-foreground">{category.name}</h3>
              {category.description && (
                <p className="text-sm text-muted-foreground">{category.description}</p>
              )}
              <Button
                variant="destructive"
                size="sm"
                className="w-full"
                onClick={() => {
                  if (confirm("Delete this category?")) {
                    deleteMutation.mutate(category.id);
                  }
                }}
              >
                Delete
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
