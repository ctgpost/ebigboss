-- Idempotency keys for critical business records
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS client_request_id text;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS client_request_id text;
ALTER TABLE public.supplier_payments ADD COLUMN IF NOT EXISTS client_request_id text;
ALTER TABLE public.purchases ADD COLUMN IF NOT EXISTS client_request_id text;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS client_request_id text;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS client_request_id text;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS client_request_id text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_client_request_id ON public.sales (client_request_id) WHERE client_request_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_client_request_id ON public.payments (client_request_id) WHERE client_request_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_supplier_payments_client_request_id ON public.supplier_payments (client_request_id) WHERE client_request_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_purchases_client_request_id ON public.purchases (client_request_id) WHERE client_request_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_client_request_id ON public.products (client_request_id) WHERE client_request_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_client_request_id ON public.customers (client_request_id) WHERE client_request_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_suppliers_client_request_id ON public.suppliers (client_request_id) WHERE client_request_id IS NOT NULL;

-- Prevent active duplicate IMEI while still allowing re-entry after stock becomes 0
CREATE OR REPLACE FUNCTION public.prevent_active_duplicate_imei()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_existing text;
BEGIN
  IF NEW.imei IS NULL OR btrim(NEW.imei) = '' OR COALESCE(NEW.stock_quantity, 0) <= 0 THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(lower(btrim(NEW.imei))));

  SELECT name INTO v_existing
  FROM public.products
  WHERE lower(btrim(imei)) = lower(btrim(NEW.imei))
    AND COALESCE(stock_quantity, 0) > 0
    AND id <> NEW.id
  LIMIT 1;

  IF v_existing IS NOT NULL THEN
    RAISE EXCEPTION 'এই IMEI দিয়ে "%" ইতোমধ্যে স্টকে আছে। আগে বিক্রি করুন।', v_existing;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_active_duplicate_imei ON public.products;
CREATE TRIGGER trg_prevent_active_duplicate_imei
BEFORE INSERT OR UPDATE OF imei, stock_quantity ON public.products
FOR EACH ROW
EXECUTE FUNCTION public.prevent_active_duplicate_imei();

-- Atomic, idempotent POS sale: creates sale + items + stock deduction exactly once per request id
CREATE OR REPLACE FUNCTION public.complete_sale_idempotent(_request_id text, _sale jsonb, _items jsonb)
RETURNS public.sales
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  existing_sale public.sales;
  new_sale public.sales;
  item jsonb;
  product_row record;
  v_product_id uuid;
  v_qty integer;
  v_unit_price numeric;
  v_total_price numeric;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'লগইন প্রয়োজন';
  END IF;
  IF _request_id IS NULL OR btrim(_request_id) = '' THEN
    RAISE EXCEPTION 'নিরাপদ request id নেই';
  END IF;
  IF jsonb_typeof(_items) <> 'array' OR jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'কমপক্ষে একটি পণ্য প্রয়োজন';
  END IF;

  SELECT * INTO existing_sale FROM public.sales WHERE client_request_id = _request_id LIMIT 1;
  IF FOUND THEN
    RETURN existing_sale;
  END IF;

  INSERT INTO public.sales (
    user_id, customer_id, total_amount, paid_amount, due_amount, payment_method,
    status, instant_customer_name, instant_customer_phone, sale_image_url, client_request_id
  ) VALUES (
    auth.uid(),
    NULLIF(_sale->>'customer_id', '')::uuid,
    COALESCE((_sale->>'total_amount')::numeric, 0),
    COALESCE((_sale->>'paid_amount')::numeric, 0),
    COALESCE((_sale->>'due_amount')::numeric, 0),
    COALESCE(NULLIF(_sale->>'payment_method', ''), 'cash'),
    COALESCE(NULLIF(_sale->>'status', ''), 'completed'),
    NULLIF(_sale->>'instant_customer_name', ''),
    NULLIF(_sale->>'instant_customer_phone', ''),
    NULLIF(_sale->>'sale_image_url', ''),
    _request_id
  ) RETURNING * INTO new_sale;

  FOR item IN SELECT * FROM jsonb_array_elements(_items)
  LOOP
    v_product_id := (item->>'product_id')::uuid;
    v_qty := COALESCE((item->>'quantity')::integer, 0);
    v_unit_price := COALESCE((item->>'unit_price')::numeric, 0);
    v_total_price := COALESCE((item->>'total_price')::numeric, v_qty * v_unit_price);

    IF v_qty <= 0 OR v_unit_price <= 0 THEN
      RAISE EXCEPTION 'পণ্যের পরিমাণ/মূল্য সঠিক নয়';
    END IF;

    SELECT id, name, stock_quantity, condition INTO product_row
    FROM public.products
    WHERE id = v_product_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'পণ্য পাওয়া যায়নি';
    END IF;
    IF COALESCE(product_row.stock_quantity, 0) < v_qty THEN
      RAISE EXCEPTION '"%" পণ্যের পর্যাপ্ত স্টক নেই', product_row.name;
    END IF;

    INSERT INTO public.sale_items (sale_id, product_id, quantity, unit_price, total_price, condition)
    VALUES (new_sale.id, v_product_id, v_qty, v_unit_price, v_total_price, COALESCE(product_row.condition, 'new'));

    UPDATE public.products
    SET stock_quantity = GREATEST(0, COALESCE(stock_quantity, 0) - v_qty),
        updated_at = now()
    WHERE id = v_product_id;
  END LOOP;

  RETURN new_sale;
END;
$$;

-- Atomic, idempotent customer due collection
CREATE OR REPLACE FUNCTION public.collect_customer_payment_idempotent(
  _request_id text,
  _sale_id uuid,
  _customer_id uuid,
  _amount numeric,
  _payment_method text,
  _notes text
)
RETURNS public.payments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  existing_payment public.payments;
  new_payment public.payments;
  sale_row public.sales;
  new_paid numeric;
  new_due numeric;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'লগইন প্রয়োজন';
  END IF;
  IF _request_id IS NULL OR btrim(_request_id) = '' THEN
    RAISE EXCEPTION 'নিরাপদ request id নেই';
  END IF;
  IF COALESCE(_amount, 0) <= 0 THEN
    RAISE EXCEPTION 'পরিমাণ সঠিক নয়';
  END IF;

  SELECT * INTO existing_payment FROM public.payments WHERE client_request_id = _request_id LIMIT 1;
  IF FOUND THEN
    RETURN existing_payment;
  END IF;

  SELECT * INTO sale_row FROM public.sales WHERE id = _sale_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'বিক্রয় পাওয়া যায়নি';
  END IF;
  IF _amount > COALESCE(sale_row.due_amount, 0) THEN
    RAISE EXCEPTION 'বাকির চেয়ে বেশি আদায় করা যাবে না';
  END IF;

  INSERT INTO public.payments (sale_id, customer_id, amount, payment_method, notes, collected_by, client_request_id)
  VALUES (_sale_id, _customer_id, _amount, COALESCE(NULLIF(_payment_method, ''), 'cash'), NULLIF(_notes, ''), auth.uid(), _request_id)
  RETURNING * INTO new_payment;

  new_paid := LEAST(COALESCE(sale_row.total_amount, 0), COALESCE(sale_row.paid_amount, 0) + _amount);
  new_due := GREATEST(0, COALESCE(sale_row.total_amount, 0) - new_paid);

  UPDATE public.sales
  SET paid_amount = new_paid,
      due_amount = new_due,
      updated_at = now()
  WHERE id = _sale_id;

  RETURN new_payment;
END;
$$;

-- Atomic, idempotent supplier payment
CREATE OR REPLACE FUNCTION public.collect_supplier_payment_idempotent(
  _request_id text,
  _supplier_id uuid,
  _purchase_id uuid,
  _amount numeric,
  _payment_method text,
  _notes text
)
RETURNS public.supplier_payments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  existing_payment public.supplier_payments;
  new_payment public.supplier_payments;
  purchase_row public.purchases;
  new_paid numeric;
  new_due numeric;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'লগইন প্রয়োজন';
  END IF;
  IF _request_id IS NULL OR btrim(_request_id) = '' THEN
    RAISE EXCEPTION 'নিরাপদ request id নেই';
  END IF;
  IF COALESCE(_amount, 0) <= 0 THEN
    RAISE EXCEPTION 'পরিমাণ সঠিক নয়';
  END IF;

  SELECT * INTO existing_payment FROM public.supplier_payments WHERE client_request_id = _request_id LIMIT 1;
  IF FOUND THEN
    RETURN existing_payment;
  END IF;

  IF _purchase_id IS NOT NULL THEN
    SELECT * INTO purchase_row FROM public.purchases WHERE id = _purchase_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'ক্রয় অর্ডার পাওয়া যায়নি';
    END IF;
    IF _amount > COALESCE(purchase_row.due_amount, 0) THEN
      RAISE EXCEPTION 'বাকির চেয়ে বেশি পেমেন্ট করা যাবে না';
    END IF;
  END IF;

  INSERT INTO public.supplier_payments (supplier_id, purchase_id, amount, payment_method, notes, paid_by, client_request_id)
  VALUES (_supplier_id, _purchase_id, _amount, COALESCE(NULLIF(_payment_method, ''), 'cash'), NULLIF(_notes, ''), auth.uid(), _request_id)
  RETURNING * INTO new_payment;

  IF _purchase_id IS NOT NULL THEN
    new_paid := LEAST(COALESCE(purchase_row.total_amount, 0), COALESCE(purchase_row.paid_amount, 0) + _amount);
    new_due := GREATEST(0, COALESCE(purchase_row.total_amount, 0) - new_paid);

    UPDATE public.purchases
    SET paid_amount = new_paid,
        due_amount = new_due,
        status = CASE WHEN new_due <= 0 THEN 'paid' ELSE status END,
        updated_at = now()
    WHERE id = _purchase_id;
  END IF;

  RETURN new_payment;
END;
$$;

-- Atomic, idempotent purchase order creation
CREATE OR REPLACE FUNCTION public.create_purchase_idempotent(_request_id text, _purchase jsonb, _items jsonb)
RETURNS public.purchases
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  existing_purchase public.purchases;
  new_purchase public.purchases;
  item jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'লগইন প্রয়োজন';
  END IF;
  IF _request_id IS NULL OR btrim(_request_id) = '' THEN
    RAISE EXCEPTION 'নিরাপদ request id নেই';
  END IF;
  IF jsonb_typeof(_items) <> 'array' OR jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'কমপক্ষে একটি আইটেম যুক্ত করুন';
  END IF;

  SELECT * INTO existing_purchase FROM public.purchases WHERE client_request_id = _request_id LIMIT 1;
  IF FOUND THEN
    RETURN existing_purchase;
  END IF;

  INSERT INTO public.purchases (user_id, supplier_id, purchase_number, total_amount, paid_amount, due_amount, status, notes, client_request_id)
  VALUES (
    auth.uid(),
    NULLIF(_purchase->>'supplier_id', '')::uuid,
    COALESCE(NULLIF(_purchase->>'purchase_number', ''), 'PO-' || extract(epoch from clock_timestamp())::bigint::text),
    COALESCE((_purchase->>'total_amount')::numeric, 0),
    COALESCE((_purchase->>'paid_amount')::numeric, 0),
    COALESCE((_purchase->>'due_amount')::numeric, COALESCE((_purchase->>'total_amount')::numeric, 0)),
    COALESCE(NULLIF(_purchase->>'status', ''), 'pending'),
    NULLIF(_purchase->>'notes', ''),
    _request_id
  ) RETURNING * INTO new_purchase;

  FOR item IN SELECT * FROM jsonb_array_elements(_items)
  LOOP
    INSERT INTO public.purchase_items (purchase_id, product_id, quantity, unit_cost, total_cost, received_quantity)
    VALUES (
      new_purchase.id,
      (item->>'product_id')::uuid,
      COALESCE((item->>'quantity')::integer, 0),
      COALESCE((item->>'unit_cost')::numeric, 0),
      COALESCE((item->>'total_cost')::numeric, COALESCE((item->>'quantity')::integer, 0) * COALESCE((item->>'unit_cost')::numeric, 0)),
      COALESCE((item->>'received_quantity')::integer, 0)
    );
  END LOOP;

  RETURN new_purchase;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.prevent_active_duplicate_imei() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_sale_idempotent(text, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.collect_customer_payment_idempotent(text, uuid, uuid, numeric, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.collect_supplier_payment_idempotent(text, uuid, uuid, numeric, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_purchase_idempotent(text, jsonb, jsonb) TO authenticated;