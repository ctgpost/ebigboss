
CREATE OR REPLACE FUNCTION public.process_sales_return(_return_id uuid, _action text, _actor_id uuid, _reject_reason text DEFAULT NULL::text)
 RETURNS returns LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  ret public.returns;
  sale_row record;
  prod_row record;
  exchange_row record;
  net_refund numeric := 0;
  exchange_value numeric := 0;
  cash_refund numeric := 0;
  extra_due numeric := 0;
  new_total numeric := 0;
  new_paid numeric := 0;
  new_due numeric := 0;
BEGIN
  IF NOT (public.is_admin(_actor_id) OR public.has_role(_actor_id, 'manager'::app_role)) THEN
    RAISE EXCEPTION 'অনুমোদনের অনুমতি নেই';
  END IF;

  SELECT * INTO ret FROM public.returns WHERE id = _return_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'রিটার্ন পাওয়া যায়নি'; END IF;
  IF ret.status <> 'pending' THEN RETURN ret; END IF;

  IF _action = 'reject' THEN
    UPDATE public.returns SET status = 'rejected', rejected_reason = NULLIF(_reject_reason, ''),
      approved_by = _actor_id, approved_at = now(), updated_at = now()
    WHERE id = _return_id RETURNING * INTO ret;
    RETURN ret;
  END IF;

  IF _action <> 'approve' THEN RAISE EXCEPTION 'অবৈধ অ্যাকশন'; END IF;

  IF ret.is_audit_only = false AND ret.stock_applied = false THEN
    SELECT stock_quantity, imei INTO prod_row FROM public.products WHERE id = ret.product_id FOR UPDATE;
    IF FOUND THEN
      UPDATE public.products
      SET stock_quantity = CASE
            WHEN prod_row.imei IS NOT NULL AND prod_row.imei <> '' THEN LEAST(1, COALESCE(prod_row.stock_quantity, 0) + ret.quantity)
            ELSE COALESCE(prod_row.stock_quantity, 0) + ret.quantity END,
          updated_at = now()
      WHERE id = ret.product_id;
    END IF;

    IF ret.refund_method = 'exchange' AND ret.exchange_product_id IS NOT NULL AND ret.exchange_quantity > 0 THEN
      SELECT stock_quantity INTO exchange_row FROM public.products WHERE id = ret.exchange_product_id FOR UPDATE;
      IF FOUND THEN
        UPDATE public.products
        SET stock_quantity = GREATEST(0, COALESCE(exchange_row.stock_quantity, 0) - ret.exchange_quantity),
            updated_at = now()
        WHERE id = ret.exchange_product_id;
      END IF;
    END IF;

    UPDATE public.returns SET stock_applied = true, stock_applied_at = now(),
      stock_applied_by = _actor_id, updated_at = now()
    WHERE id = _return_id RETURNING * INTO ret;
  END IF;

  IF ret.is_audit_only = false AND ret.finance_applied = false THEN
    SELECT * INTO sale_row FROM public.sales WHERE id = ret.sale_id FOR UPDATE;
    IF FOUND THEN
      exchange_value := CASE WHEN ret.refund_method = 'exchange'
        THEN COALESCE(ret.exchange_unit_price, 0) * COALESCE(ret.exchange_quantity, 0) ELSE 0 END;

      IF ret.refund_method = 'exchange' AND exchange_value > COALESCE(ret.refund_amount, 0) THEN
        -- Customer owes extra (new item costs more than returned item)
        extra_due := exchange_value - COALESCE(ret.refund_amount, 0);
        net_refund := 0;
        new_total := COALESCE(sale_row.total_amount, 0) + extra_due;
        new_paid := COALESCE(sale_row.paid_amount, 0);
        new_due := GREATEST(0, new_total - new_paid);
      ELSE
        net_refund := GREATEST(0, COALESCE(ret.refund_amount, 0) - exchange_value);
        new_total := GREATEST(0, COALESCE(sale_row.total_amount, 0) - net_refund);
        new_paid := COALESCE(sale_row.paid_amount, 0);
        cash_refund := 0;
        IF ret.refund_method = 'cash' THEN
          cash_refund := LEAST(new_paid, net_refund);
          new_paid := GREATEST(0, new_paid - cash_refund);
        END IF;
        new_due := GREATEST(0, new_total - new_paid);
      END IF;

      UPDATE public.sales SET total_amount = new_total, paid_amount = new_paid, due_amount = new_due,
        status = CASE WHEN new_total = 0 THEN 'returned' ELSE 'completed' END, updated_at = now()
      WHERE id = ret.sale_id;

      IF ret.refund_method = 'cash' AND cash_refund > 0 AND ret.customer_id IS NOT NULL THEN
        INSERT INTO public.payments (sale_id, customer_id, amount, payment_method, notes, collected_by, return_id)
        VALUES (ret.sale_id, ret.customer_id, -cash_refund, 'cash',
          'সেলস রিটার্ন রিফান্ড: ' || COALESCE(ret.return_number, ret.id::text), _actor_id, ret.id)
        ON CONFLICT (return_id) WHERE return_id IS NOT NULL DO NOTHING;
      END IF;
    END IF;

    UPDATE public.returns SET finance_applied = true, finance_applied_at = now(),
      finance_applied_by = _actor_id, applied_refund_amount = ret.refund_amount, updated_at = now()
    WHERE id = _return_id RETURNING * INTO ret;
  END IF;

  UPDATE public.returns SET status = 'completed', approved_by = _actor_id,
    approved_at = now(), updated_at = now()
  WHERE id = _return_id RETURNING * INTO ret;
  RETURN ret;
END;
$function$;
