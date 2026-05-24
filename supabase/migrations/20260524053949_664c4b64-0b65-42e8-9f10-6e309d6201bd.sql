REVOKE EXECUTE ON FUNCTION public.complete_sale_idempotent(text, jsonb, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.collect_customer_payment_idempotent(text, uuid, uuid, numeric, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.collect_supplier_payment_idempotent(text, uuid, uuid, numeric, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.create_purchase_idempotent(text, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_sale_idempotent(text, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.collect_customer_payment_idempotent(text, uuid, uuid, numeric, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.collect_supplier_payment_idempotent(text, uuid, uuid, numeric, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_purchase_idempotent(text, jsonb, jsonb) TO authenticated;