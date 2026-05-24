-- Recalculate a sale's paid/due based on a delta applied to paid_amount
CREATE OR REPLACE FUNCTION public.apply_sale_payment_delta(_sale_id uuid, _delta numeric)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  s public.sales;
  new_paid numeric;
  new_due numeric;
BEGIN
  IF _sale_id IS NULL OR COALESCE(_delta, 0) = 0 THEN
    RETURN;
  END IF;
  SELECT * INTO s FROM public.sales WHERE id = _sale_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  new_paid := GREATEST(0, LEAST(COALESCE(s.total_amount, 0), COALESCE(s.paid_amount, 0) + _delta));
  new_due  := GREATEST(0, COALESCE(s.total_amount, 0) - new_paid);
  UPDATE public.sales
  SET paid_amount = new_paid,
      due_amount = new_due,
      updated_at = now()
  WHERE id = _sale_id;
END;
$$;

-- Recalculate a purchase's paid/due based on a delta applied to paid_amount
CREATE OR REPLACE FUNCTION public.apply_purchase_payment_delta(_purchase_id uuid, _delta numeric)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  p public.purchases;
  new_paid numeric;
  new_due numeric;
BEGIN
  IF _purchase_id IS NULL OR COALESCE(_delta, 0) = 0 THEN
    RETURN;
  END IF;
  SELECT * INTO p FROM public.purchases WHERE id = _purchase_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  new_paid := GREATEST(0, LEAST(COALESCE(p.total_amount, 0), COALESCE(p.paid_amount, 0) + _delta));
  new_due  := GREATEST(0, COALESCE(p.total_amount, 0) - new_paid);
  UPDATE public.purchases
  SET paid_amount = new_paid,
      due_amount = new_due,
      status = CASE
                  WHEN new_due <= 0 AND COALESCE(p.total_amount, 0) > 0 THEN 'paid'
                  WHEN p.status = 'paid' AND new_due > 0 THEN 'pending'
                  ELSE p.status
               END,
      updated_at = now()
  WHERE id = _purchase_id;
END;
$$;

-- Trigger: customer payments edit/delete -> recalc sale ledger
CREATE OR REPLACE FUNCTION public.payments_recalc_sale()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.sale_id IS DISTINCT FROM OLD.sale_id THEN
      PERFORM public.apply_sale_payment_delta(OLD.sale_id, -COALESCE(OLD.amount, 0));
      PERFORM public.apply_sale_payment_delta(NEW.sale_id,  COALESCE(NEW.amount, 0));
    ELSE
      PERFORM public.apply_sale_payment_delta(NEW.sale_id, COALESCE(NEW.amount, 0) - COALESCE(OLD.amount, 0));
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.apply_sale_payment_delta(OLD.sale_id, -COALESCE(OLD.amount, 0));
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_payments_recalc_sale ON public.payments;
CREATE TRIGGER trg_payments_recalc_sale
AFTER UPDATE OR DELETE ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.payments_recalc_sale();

-- Trigger: supplier payments edit/delete -> recalc purchase ledger
CREATE OR REPLACE FUNCTION public.supplier_payments_recalc_purchase()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.purchase_id IS DISTINCT FROM OLD.purchase_id THEN
      PERFORM public.apply_purchase_payment_delta(OLD.purchase_id, -COALESCE(OLD.amount, 0));
      PERFORM public.apply_purchase_payment_delta(NEW.purchase_id,  COALESCE(NEW.amount, 0));
    ELSE
      PERFORM public.apply_purchase_payment_delta(NEW.purchase_id, COALESCE(NEW.amount, 0) - COALESCE(OLD.amount, 0));
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.apply_purchase_payment_delta(OLD.purchase_id, -COALESCE(OLD.amount, 0));
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_supplier_payments_recalc_purchase ON public.supplier_payments;
CREATE TRIGGER trg_supplier_payments_recalc_purchase
AFTER UPDATE OR DELETE ON public.supplier_payments
FOR EACH ROW EXECUTE FUNCTION public.supplier_payments_recalc_purchase();

REVOKE EXECUTE ON FUNCTION public.apply_sale_payment_delta(uuid, numeric) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.apply_purchase_payment_delta(uuid, numeric) FROM PUBLIC, anon, authenticated;