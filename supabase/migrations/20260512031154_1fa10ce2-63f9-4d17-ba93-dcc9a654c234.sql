
CREATE OR REPLACE FUNCTION public.log_sales_return_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_action text; v_actor uuid := auth.uid(); v_email text;
  v_stock jsonb; v_ledger jsonb;
  v_before jsonb := NULL; v_after jsonb := NULL;
  v_rid uuid; v_rnum text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := CASE WHEN NEW.is_audit_only THEN 'created_audit_only' ELSE 'created' END;
    v_after := to_jsonb(NEW); v_rid := NEW.id; v_rnum := NEW.return_number;
  ELSIF TG_OP = 'UPDATE' THEN
    v_before := to_jsonb(OLD); v_after := to_jsonb(NEW);
    v_rid := NEW.id; v_rnum := NEW.return_number;
    IF OLD.status = 'pending' AND NEW.status = 'completed' THEN v_action := 'approved';
    ELSIF OLD.status = 'pending' AND NEW.status = 'rejected' THEN v_action := 'rejected';
    ELSIF OLD.stock_applied = false AND NEW.stock_applied = true THEN v_action := 'stock_applied';
    ELSIF OLD.finance_applied = false AND NEW.finance_applied = true THEN v_action := 'finance_applied';
    ELSE v_action := 'updated'; END IF;
  ELSE
    v_action := 'deleted'; v_before := to_jsonb(OLD);
    v_rid := OLD.id; v_rnum := OLD.return_number;
  END IF;
  IF v_actor IS NOT NULL THEN SELECT email INTO v_email FROM public.profiles WHERE id = v_actor; END IF;
  IF TG_OP <> 'DELETE' AND NEW.stock_applied = true AND (TG_OP = 'INSERT' OR OLD.stock_applied = false) THEN
    v_stock := jsonb_build_object('product_id', NEW.product_id, 'qty_returned', NEW.quantity, 'exchange_product_id', NEW.exchange_product_id, 'exchange_qty', NEW.exchange_quantity);
  END IF;
  IF TG_OP <> 'DELETE' AND NEW.finance_applied = true AND (TG_OP = 'INSERT' OR OLD.finance_applied = false) THEN
    v_ledger := jsonb_build_object('sale_id', NEW.sale_id, 'refund_amount', NEW.refund_amount, 'refund_method', NEW.refund_method, 'applied_refund_amount', NEW.applied_refund_amount);
  END IF;
  INSERT INTO public.return_audit_logs (return_type, return_id, return_number, action, actor_id, actor_email, before_state, after_state, stock_impact, ledger_impact)
  VALUES ('sales', v_rid, v_rnum, v_action, v_actor, v_email, v_before, v_after, v_stock, v_ledger);
  RETURN COALESCE(NEW, OLD);
END; $$;

DROP TRIGGER IF EXISTS trg_log_sales_return ON public.returns;
CREATE TRIGGER trg_log_sales_return AFTER INSERT OR UPDATE OR DELETE ON public.returns
FOR EACH ROW EXECUTE FUNCTION public.log_sales_return_change();
