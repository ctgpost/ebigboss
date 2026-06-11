CREATE OR REPLACE FUNCTION public.process_supplier_return(_return_id uuid, _action text, _actor_id uuid, _reject_reason text DEFAULT NULL::text)
 RETURNS supplier_returns
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  ret public.supplier_returns;
  item record;
  purchase_row record;
  sup_name text;
  adjustment numeric := 0;
  new_total numeric := 0;
  new_paid numeric := 0;
  new_due numeric := 0;
BEGIN
  IF NOT (public.is_admin(_actor_id) OR public.has_role(_actor_id, 'manager'::app_role)) THEN
    RAISE EXCEPTION 'অনুমোদনের অনুমতি নেই';
  END IF;

  SELECT * INTO ret FROM public.supplier_returns WHERE id = _return_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'সাপ্লায়ার রিটার্ন পাওয়া যায়নি'; END IF;
  IF ret.status <> 'pending' THEN RETURN ret; END IF;

  IF _action = 'reject' THEN
    UPDATE public.supplier_returns
    SET status = 'rejected', rejected_reason = NULLIF(_reject_reason, ''),
        approved_by = _actor_id, approved_at = now(), updated_at = now()
    WHERE id = _return_id RETURNING * INTO ret;
    RETURN ret;
  END IF;

  IF _action <> 'approve' THEN RAISE EXCEPTION 'অবৈধ অ্যাকশন'; END IF;

  -- Stock deduction (works for PO-linked AND direct/unsold-product returns)
  IF ret.stock_action = 'deduct_stock' AND ret.stock_applied = false THEN
    FOR item IN
      SELECT * FROM public.supplier_return_items WHERE supplier_return_id = _return_id FOR UPDATE
    LOOP
      IF item.stock_deducted = false THEN
        UPDATE public.products
        SET stock_quantity = GREATEST(0, stock_quantity - item.quantity), updated_at = now()
        WHERE id = item.product_id;
        UPDATE public.supplier_return_items
        SET stock_deducted = true, stock_deducted_at = now()
        WHERE id = item.id;
      END IF;
    END LOOP;
    UPDATE public.supplier_returns
    SET stock_applied = true, stock_applied_at = now(),
        stock_applied_by = _actor_id, updated_at = now()
    WHERE id = _return_id RETURNING * INTO ret;
  END IF;

  -- Finance: PO-linked path (original behaviour)
  IF ret.finance_action <> 'none' AND ret.finance_applied = false AND ret.purchase_id IS NOT NULL AND ret.refund_amount > 0 THEN
    SELECT * INTO purchase_row FROM public.purchases WHERE id = ret.purchase_id FOR UPDATE;
    IF FOUND THEN
      new_total := GREATEST(0, COALESCE(purchase_row.total_amount, 0) - ret.refund_amount);
      new_paid := COALESCE(purchase_row.paid_amount, 0);
      adjustment := LEAST(new_paid, ret.refund_amount);
      new_paid := GREATEST(0, new_paid - adjustment);
      new_due := GREATEST(0, new_total - new_paid);

      IF adjustment > 0 THEN
        INSERT INTO public.supplier_payments (supplier_id, purchase_id, supplier_return_id, amount, payment_method, notes, paid_by)
        VALUES (ret.supplier_id, ret.purchase_id, ret.id, -adjustment,
          CASE WHEN ret.finance_action = 'supplier_refund' THEN 'supplier_refund' ELSE 'supplier_due_adjust' END,
          'সাপ্লায়ার রিটার্ন ' || CASE WHEN ret.finance_action = 'supplier_refund' THEN 'রিফান্ড' ELSE 'বাকি সমন্বয়' END || ': ' || COALESCE(ret.return_number, ret.id::text),
          _actor_id)
        ON CONFLICT (supplier_return_id) WHERE supplier_return_id IS NOT NULL DO NOTHING;
      END IF;

      UPDATE public.purchases
      SET total_amount = new_total, paid_amount = new_paid, due_amount = new_due,
          status = CASE WHEN new_total = 0 THEN 'returned' WHEN new_due <= 0 THEN 'paid' ELSE status END,
          updated_at = now()
      WHERE id = ret.purchase_id;
    END IF;

    UPDATE public.supplier_returns
    SET finance_applied = true, finance_applied_at = now(),
        finance_applied_by = _actor_id, applied_refund_amount = ret.refund_amount, updated_at = now()
    WHERE id = _return_id RETURNING * INTO ret;

  -- Finance: Direct (no-PO) path for unsold products
  ELSIF ret.finance_action <> 'none' AND ret.finance_applied = false AND ret.purchase_id IS NULL AND ret.refund_amount > 0 THEN
    SELECT name INTO sup_name FROM public.suppliers WHERE id = ret.supplier_id;
    -- Clear supplier_name on returned direct products so they stop counting in supplier's directCost
    FOR item IN SELECT * FROM public.supplier_return_items WHERE supplier_return_id = _return_id LOOP
      UPDATE public.products
      SET supplier_name = NULL, updated_at = now()
      WHERE id = item.product_id
        AND sup_name IS NOT NULL
        AND lower(btrim(coalesce(supplier_name, ''))) = lower(btrim(sup_name));
    END LOOP;

    -- Record a standalone negative supplier_payment so cash-back / due-adjust shows in the ledger
    INSERT INTO public.supplier_payments (supplier_id, purchase_id, supplier_return_id, amount, payment_method, notes, paid_by)
    VALUES (ret.supplier_id, NULL, ret.id, -ret.refund_amount,
      CASE WHEN ret.finance_action = 'supplier_refund' THEN 'supplier_refund' ELSE 'supplier_due_adjust' END,
      'সরাসরি অবিক্রিত পণ্য রিটার্ন: ' || COALESCE(ret.return_number, ret.id::text),
      _actor_id)
    ON CONFLICT (supplier_return_id) WHERE supplier_return_id IS NOT NULL DO NOTHING;

    UPDATE public.supplier_returns
    SET finance_applied = true, finance_applied_at = now(),
        finance_applied_by = _actor_id, applied_refund_amount = ret.refund_amount, updated_at = now()
    WHERE id = _return_id RETURNING * INTO ret;
  END IF;

  UPDATE public.supplier_returns
  SET status = 'completed', approved_by = _actor_id, approved_at = now(),
      stock_applied = CASE WHEN stock_action = 'deduct_stock' THEN true ELSE stock_applied END,
      updated_at = now()
  WHERE id = _return_id RETURNING * INTO ret;

  RETURN ret;
END;
$function$;