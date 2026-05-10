CREATE OR REPLACE FUNCTION public.search_sale_ids_for_return(_search text, _limit integer DEFAULT 20)
RETURNS TABLE(id uuid)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $$
  WITH term AS (
    SELECT lower(regexp_replace(trim(coalesce(_search, '')), '^(#|inv-|invoice-|bbms-|sale-|ret-)\s*', '', 'i')) AS q
  )
  SELECT DISTINCT s.id
  FROM public.sales s
  LEFT JOIN public.customers c ON c.id = s.customer_id
  LEFT JOIN public.sale_items si ON si.sale_id = s.id
  LEFT JOIN public.products p ON p.id = si.product_id
  LEFT JOIN public.returns r ON r.sale_id = s.id
  CROSS JOIN term t
  WHERE auth.uid() IS NOT NULL
    AND t.q <> ''
    AND (
      lower(s.id::text) LIKE '%' || t.q || '%'
      OR lower(substr(s.id::text, 1, 8)) = t.q
      OR lower(to_char(s.created_at, 'YYYYMMDD') || '-' || substr(s.id::text, 1, 8)) LIKE '%' || t.q || '%'
      OR lower(coalesce(s.instant_customer_name, '')) LIKE '%' || t.q || '%'
      OR lower(coalesce(s.instant_customer_phone, '')) LIKE '%' || t.q || '%'
      OR lower(coalesce(c.name, '')) LIKE '%' || t.q || '%'
      OR lower(coalesce(c.phone, '')) LIKE '%' || t.q || '%'
      OR lower(coalesce(p.imei, '')) LIKE '%' || t.q || '%'
      OR lower(coalesce(p.sku, '')) LIKE '%' || t.q || '%'
      OR lower(coalesce(p.barcode, '')) LIKE '%' || t.q || '%'
      OR lower(coalesce(p.name, '')) LIKE '%' || t.q || '%'
      OR lower(coalesce(p.brand, '')) LIKE '%' || t.q || '%'
      OR lower(coalesce(p.model, '')) LIKE '%' || t.q || '%'
      OR lower(coalesce(r.return_number, '')) LIKE '%' || t.q || '%'
      OR lower(r.id::text) LIKE '%' || t.q || '%'
    )
  ORDER BY s.id DESC
  LIMIT LEAST(GREATEST(COALESCE(_limit, 20), 1), 50)
$$;

REVOKE ALL ON FUNCTION public.search_sale_ids_for_return(text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_sale_ids_for_return(text, integer) TO authenticated;

DROP TRIGGER IF EXISTS set_return_number ON public.returns;
CREATE TRIGGER set_return_number
BEFORE INSERT ON public.returns
FOR EACH ROW
EXECUTE FUNCTION public.generate_return_number();

DROP TRIGGER IF EXISTS set_supplier_return_number ON public.supplier_returns;
CREATE TRIGGER set_supplier_return_number
BEFORE INSERT ON public.supplier_returns
FOR EACH ROW
EXECUTE FUNCTION public.generate_supplier_return_number();

DROP TRIGGER IF EXISTS update_returns_updated_at ON public.returns;
CREATE TRIGGER update_returns_updated_at
BEFORE UPDATE ON public.returns
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_supplier_returns_updated_at ON public.supplier_returns;
CREATE TRIGGER update_supplier_returns_updated_at
BEFORE UPDATE ON public.supplier_returns
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_sales_created_id ON public.sales(created_at DESC, id);
CREATE INDEX IF NOT EXISTS idx_sales_instant_customer_phone ON public.sales(lower(coalesce(instant_customer_phone, '')));
CREATE INDEX IF NOT EXISTS idx_sales_instant_customer_name ON public.sales(lower(coalesce(instant_customer_name, '')));
CREATE INDEX IF NOT EXISTS idx_customers_phone_lower ON public.customers(lower(coalesce(phone, '')));
CREATE INDEX IF NOT EXISTS idx_customers_name_lower ON public.customers(lower(coalesce(name, '')));
CREATE INDEX IF NOT EXISTS idx_products_imei_lower ON public.products(lower(coalesce(imei, '')));
CREATE INDEX IF NOT EXISTS idx_products_sku_lower ON public.products(lower(coalesce(sku, '')));
CREATE INDEX IF NOT EXISTS idx_products_barcode_lower ON public.products(lower(coalesce(barcode, '')));
CREATE INDEX IF NOT EXISTS idx_products_name_lower ON public.products(lower(coalesce(name, '')));
CREATE INDEX IF NOT EXISTS idx_sale_items_sale_product ON public.sale_items(sale_id, product_id);
CREATE INDEX IF NOT EXISTS idx_returns_sale_item_status ON public.returns(sale_id, sale_item_id, status);
CREATE INDEX IF NOT EXISTS idx_returns_return_number_lower ON public.returns(lower(coalesce(return_number, '')));
CREATE INDEX IF NOT EXISTS idx_supplier_returns_return_number_lower ON public.supplier_returns(lower(coalesce(return_number, '')));
CREATE INDEX IF NOT EXISTS idx_supplier_returns_created_status ON public.supplier_returns(created_at DESC, status);
CREATE INDEX IF NOT EXISTS idx_supplier_return_items_return_product ON public.supplier_return_items(supplier_return_id, product_id);