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
  SELECT s.id
  FROM public.sales s
  CROSS JOIN term t
  WHERE auth.uid() IS NOT NULL
    AND t.q <> ''
    AND (
      lower(s.id::text) LIKE '%' || t.q || '%'
      OR lower(substr(s.id::text, 1, 8)) = t.q
      OR lower(to_char(s.created_at, 'YYYYMMDD') || '-' || substr(s.id::text, 1, 8)) LIKE '%' || t.q || '%'
      OR lower(coalesce(s.instant_customer_name, '')) LIKE '%' || t.q || '%'
      OR lower(coalesce(s.instant_customer_phone, '')) LIKE '%' || t.q || '%'
      OR EXISTS (
        SELECT 1 FROM public.customers c
        WHERE c.id = s.customer_id
          AND (lower(coalesce(c.name, '')) LIKE '%' || t.q || '%' OR lower(coalesce(c.phone, '')) LIKE '%' || t.q || '%')
      )
      OR EXISTS (
        SELECT 1
        FROM public.sale_items si
        JOIN public.products p ON p.id = si.product_id
        WHERE si.sale_id = s.id
          AND (
            lower(coalesce(p.imei, '')) LIKE '%' || t.q || '%'
            OR lower(coalesce(p.sku, '')) LIKE '%' || t.q || '%'
            OR lower(coalesce(p.barcode, '')) LIKE '%' || t.q || '%'
            OR lower(coalesce(p.name, '')) LIKE '%' || t.q || '%'
            OR lower(coalesce(p.brand, '')) LIKE '%' || t.q || '%'
            OR lower(coalesce(p.model, '')) LIKE '%' || t.q || '%'
          )
      )
      OR EXISTS (
        SELECT 1 FROM public.returns r
        WHERE r.sale_id = s.id
          AND (lower(coalesce(r.return_number, '')) LIKE '%' || t.q || '%' OR lower(r.id::text) LIKE '%' || t.q || '%')
      )
    )
  ORDER BY s.created_at DESC
  LIMIT LEAST(GREATEST(COALESCE(_limit, 20), 1), 50)
$$;

REVOKE ALL ON FUNCTION public.search_sale_ids_for_return(text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_sale_ids_for_return(text, integer) TO authenticated;