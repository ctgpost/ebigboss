ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS image_url text;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS image_url text;