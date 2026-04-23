-- Add approval workflow and extra fields to returns
ALTER TABLE public.returns
  ADD COLUMN IF NOT EXISTS approved_by uuid,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejected_reason text,
  ADD COLUMN IF NOT EXISTS refund_method text NOT NULL DEFAULT 'cash',
  ADD COLUMN IF NOT EXISTS defect_photo_url text,
  ADD COLUMN IF NOT EXISTS exchange_product_id uuid,
  ADD COLUMN IF NOT EXISTS exchange_unit_price numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS exchange_quantity integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS return_number text,
  ADD COLUMN IF NOT EXISTS notification_sent boolean NOT NULL DEFAULT false;

-- Generate return number for existing rows
UPDATE public.returns
SET return_number = 'RET-' || to_char(created_at, 'YYYYMMDD') || '-' || substr(id::text, 1, 6)
WHERE return_number IS NULL;

-- Add unique index on return_number
CREATE UNIQUE INDEX IF NOT EXISTS returns_return_number_key ON public.returns(return_number);

-- Auto-generate return_number on insert
CREATE OR REPLACE FUNCTION public.generate_return_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.return_number IS NULL THEN
    NEW.return_number := 'RET-' || to_char(now(), 'YYYYMMDD') || '-' ||
      lpad(((floor(random() * 999999))::int)::text, 6, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_generate_return_number ON public.returns;
CREATE TRIGGER trg_generate_return_number
  BEFORE INSERT ON public.returns
  FOR EACH ROW
  EXECUTE FUNCTION public.generate_return_number();

-- Auto-update updated_at on returns
DROP TRIGGER IF EXISTS trg_returns_updated_at ON public.returns;
CREATE TRIGGER trg_returns_updated_at
  BEFORE UPDATE ON public.returns
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Index for analytics queries
CREATE INDEX IF NOT EXISTS idx_returns_status ON public.returns(status);
CREATE INDEX IF NOT EXISTS idx_returns_created_at ON public.returns(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_returns_product_id ON public.returns(product_id);
CREATE INDEX IF NOT EXISTS idx_returns_customer_id ON public.returns(customer_id);

-- Storage bucket for return defect photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('return-photos', 'return-photos', true)
ON CONFLICT (id) DO NOTHING;

-- Public read policy for return-photos
DROP POLICY IF EXISTS "Public read return photos" ON storage.objects;
CREATE POLICY "Public read return photos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'return-photos');

DROP POLICY IF EXISTS "Authenticated upload return photos" ON storage.objects;
CREATE POLICY "Authenticated upload return photos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'return-photos');

DROP POLICY IF EXISTS "Authenticated update return photos" ON storage.objects;
CREATE POLICY "Authenticated update return photos"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'return-photos');

DROP POLICY IF EXISTS "Authenticated delete return photos" ON storage.objects;
CREATE POLICY "Authenticated delete return photos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'return-photos');