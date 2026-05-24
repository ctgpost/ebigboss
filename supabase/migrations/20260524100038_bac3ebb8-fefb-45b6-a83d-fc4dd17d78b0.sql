CREATE OR REPLACE FUNCTION public.recalculate_supplier_balances(_supplier_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r record;
  v_paid numeric;
  v_due numeric;
  v_updated int := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'লগইন প্রয়োজন';
  END IF;

  FOR r IN
    SELECT p.id, p.total_amount, p.status, p.supplier_id
    FROM public.purchases p
    WHERE _supplier_id IS NULL OR p.supplier_id = _supplier_id
    FOR UPDATE
  LOOP
    SELECT COALESCE(SUM(amount), 0) INTO v_paid
    FROM public.supplier_payments
    WHERE purchase_id = r.id;

    v_paid := GREATEST(0, LEAST(COALESCE(r.total_amount, 0), v_paid));
    v_due := GREATEST(0, COALESCE(r.total_amount, 0) - v_paid);

    UPDATE public.purchases
    SET paid_amount = v_paid,
        due_amount = v_due,
        status = CASE
          WHEN v_due <= 0 AND COALESCE(r.total_amount, 0) > 0 THEN 'paid'
          WHEN r.status = 'paid' AND v_due > 0 THEN 'pending'
          ELSE r.status
        END,
        updated_at = now()
    WHERE id = r.id;
    v_updated := v_updated + 1;
  END LOOP;

  RETURN jsonb_build_object('updated_purchases', v_updated);
END;
$$;