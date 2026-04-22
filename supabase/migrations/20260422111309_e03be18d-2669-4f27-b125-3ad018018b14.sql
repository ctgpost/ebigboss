-- Add columns to returns table
ALTER TABLE public.returns
  ADD COLUMN IF NOT EXISTS is_audit_only boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS customer_id uuid;

-- Add return reference + allow negative refund amounts on payments
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS return_id uuid;

-- Indexes for analytics performance
CREATE INDEX IF NOT EXISTS idx_returns_product_id ON public.returns(product_id);
CREATE INDEX IF NOT EXISTS idx_returns_status ON public.returns(status);
CREATE INDEX IF NOT EXISTS idx_returns_created_at ON public.returns(created_at);
CREATE INDEX IF NOT EXISTS idx_payments_return_id ON public.payments(return_id);