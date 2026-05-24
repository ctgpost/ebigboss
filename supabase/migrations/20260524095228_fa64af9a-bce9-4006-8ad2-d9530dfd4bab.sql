CREATE OR REPLACE FUNCTION public.complete_sale_idempotent(_request_id text, _sale jsonb, _items jsonb)
 RETURNS sales
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  existing_sale public.sales;
  new_sale public.sales;
  item jsonb;
  product_row record;
  v_product_id uuid;
  v_qty integer;
  v_unit_price numeric;
  v_total_price numeric;
  v_customer_id uuid;
  v_instant_name text;
  v_instant_phone text;
  v_existing_customer record;
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

  v_customer_id := NULLIF(_sale->>'customer_id', '')::uuid;
  v_instant_name := NULLIF(btrim(_sale->>'instant_customer_name'), '');
  v_instant_phone := NULLIF(btrim(_sale->>'instant_customer_phone'), '');

  -- If instant customer info given and no customer_id selected, auto-create/find customer
  IF v_customer_id IS NULL AND v_instant_phone IS NOT NULL THEN
    SELECT id, name INTO v_existing_customer
    FROM public.customers
    WHERE btrim(phone) = v_instant_phone
    LIMIT 1;

    IF FOUND THEN
      v_customer_id := v_existing_customer.id;
      -- Update name if customer has no name but instant has one
      IF v_instant_name IS NOT NULL AND (v_existing_customer.name IS NULL OR btrim(v_existing_customer.name) = '') THEN
        UPDATE public.customers SET name = v_instant_name, updated_at = now() WHERE id = v_customer_id;
      END IF;
    ELSE
      INSERT INTO public.customers (name, phone, notes)
      VALUES (COALESCE(v_instant_name, 'ইন্সট্যান্ট কাস্টমার'), v_instant_phone, 'POS ইন্সট্যান্ট কাস্টমার থেকে স্বয়ংক্রিয় তৈরি')
      RETURNING id INTO v_customer_id;
    END IF;
  END IF;

  INSERT INTO public.sales (
    user_id, customer_id, total_amount, paid_amount, due_amount, payment_method,
    status, instant_customer_name, instant_customer_phone, sale_image_url, client_request_id
  ) VALUES (
    auth.uid(),
    v_customer_id,
    COALESCE((_sale->>'total_amount')::numeric, 0),
    COALESCE((_sale->>'paid_amount')::numeric, 0),
    COALESCE((_sale->>'due_amount')::numeric, 0),
    COALESCE(NULLIF(_sale->>'payment_method', ''), 'cash'),
    COALESCE(NULLIF(_sale->>'status', ''), 'completed'),
    v_instant_name,
    v_instant_phone,
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

  -- Update customer aggregate stats if linked
  IF v_customer_id IS NOT NULL THEN
    UPDATE public.customers
    SET total_purchases = COALESCE(total_purchases, 0) + COALESCE(new_sale.total_amount, 0),
        purchase_count = COALESCE(purchase_count, 0) + 1,
        updated_at = now()
    WHERE id = v_customer_id;
  END IF;

  RETURN new_sale;
END;
$function$;