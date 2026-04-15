
-- Add paid_amount and due_amount columns to sales table
ALTER TABLE public.sales ADD COLUMN paid_amount numeric NOT NULL DEFAULT 0;
ALTER TABLE public.sales ADD COLUMN due_amount numeric NOT NULL DEFAULT 0;

-- Create payments table for tracking due collections
CREATE TABLE public.payments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sale_id uuid NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.customers(id),
  amount numeric NOT NULL,
  payment_method text NOT NULL DEFAULT 'cash',
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  collected_by uuid
);

-- Enable RLS
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- RLS policy for payments
CREATE POLICY "Authenticated users can manage payments"
ON public.payments
FOR ALL
TO authenticated
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

-- Rename warranty_expiry_date to product_entry_date
ALTER TABLE public.products RENAME COLUMN warranty_expiry_date TO product_entry_date;

-- Set default to current date for product_entry_date
ALTER TABLE public.products ALTER COLUMN product_entry_date SET DEFAULT CURRENT_DATE;
