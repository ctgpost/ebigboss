CREATE OR REPLACE FUNCTION public.generate_supplier_return_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.return_number IS NULL THEN
    NEW.return_number := 'SRET-' || to_char(now(), 'YYYYMMDD') || '-' ||
      lpad(((floor(random() * 999999))::int)::text, 6, '0');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TABLE public.supplier_returns (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  return_number text UNIQUE,
  supplier_id uuid NOT NULL,
  purchase_id uuid,
  return_date date NOT NULL DEFAULT CURRENT_DATE,
  reason_code text NOT NULL,
  reason_notes text,
  return_method text NOT NULL DEFAULT 'cash_refund',
  status text NOT NULL DEFAULT 'pending',
  finance_action text NOT NULL DEFAULT 'none',
  stock_action text NOT NULL DEFAULT 'deduct_stock',
  refund_amount numeric NOT NULL DEFAULT 0,
  replacement_note text,
  defect_photo_url text,
  processed_by uuid,
  approved_by uuid,
  approved_at timestamp with time zone,
  rejected_reason text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.supplier_return_items (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  supplier_return_id uuid NOT NULL,
  purchase_item_id uuid,
  product_id uuid NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  unit_cost numeric NOT NULL DEFAULT 0,
  total_cost numeric NOT NULL DEFAULT 0,
  stock_deducted boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.supplier_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_return_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view supplier returns"
ON public.supplier_returns
FOR SELECT
TO authenticated
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can create supplier returns"
ON public.supplier_returns
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Admins and managers can update supplier returns"
ON public.supplier_returns
FOR UPDATE
TO authenticated
USING (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'manager'))
WITH CHECK (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'manager'));

CREATE POLICY "Admins can delete supplier returns"
ON public.supplier_returns
FOR DELETE
TO authenticated
USING (public.is_admin(auth.uid()));

CREATE POLICY "Authenticated users can view supplier return items"
ON public.supplier_return_items
FOR SELECT
TO authenticated
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can create supplier return items"
ON public.supplier_return_items
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Admins and managers can update supplier return items"
ON public.supplier_return_items
FOR UPDATE
TO authenticated
USING (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'manager'))
WITH CHECK (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'manager'));

CREATE POLICY "Admins can delete supplier return items"
ON public.supplier_return_items
FOR DELETE
TO authenticated
USING (public.is_admin(auth.uid()));

CREATE INDEX idx_supplier_returns_supplier_id ON public.supplier_returns(supplier_id);
CREATE INDEX idx_supplier_returns_purchase_id ON public.supplier_returns(purchase_id);
CREATE INDEX idx_supplier_returns_status ON public.supplier_returns(status);
CREATE INDEX idx_supplier_return_items_return_id ON public.supplier_return_items(supplier_return_id);
CREATE INDEX idx_supplier_return_items_product_id ON public.supplier_return_items(product_id);

CREATE TRIGGER set_supplier_return_number
BEFORE INSERT ON public.supplier_returns
FOR EACH ROW
EXECUTE FUNCTION public.generate_supplier_return_number();

CREATE TRIGGER update_supplier_returns_updated_at
BEFORE UPDATE ON public.supplier_returns
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.supplier_payments
ADD COLUMN IF NOT EXISTS supplier_return_id uuid;

CREATE INDEX IF NOT EXISTS idx_supplier_payments_supplier_return_id ON public.supplier_payments(supplier_return_id);