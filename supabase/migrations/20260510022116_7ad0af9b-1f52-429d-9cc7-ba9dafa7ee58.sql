CREATE OR REPLACE FUNCTION public.search_supplier_return_ids(_search text, _status text DEFAULT 'all', _limit integer DEFAULT 200, _offset integer DEFAULT 0)
RETURNS TABLE(id uuid)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $$
  WITH term AS (
    SELECT lower(regexp_replace(trim(coalesce(_search, '')), '^(#|sret-|return-|po-)\s*', '', 'i')) AS q
  )
  SELECT sr.id
  FROM public.supplier_returns sr
  CROSS JOIN term t
  WHERE auth.uid() IS NOT NULL
    AND (_status = 'all' OR sr.status = _status)
    AND (
      t.q = ''
      OR lower(sr.id::text) LIKE '%' || t.q || '%'
      OR lower(coalesce(sr.return_number, '')) LIKE '%' || t.q || '%'
      OR lower(coalesce(sr.reason_code, '')) LIKE '%' || t.q || '%'
      OR lower(coalesce(sr.reason_notes, '')) LIKE '%' || t.q || '%'
      OR lower(coalesce(sr.return_method, '')) LIKE '%' || t.q || '%'
      OR lower(coalesce(sr.defect_photo_url, '')) LIKE '%' || t.q || '%'
      OR EXISTS (
        SELECT 1 FROM public.suppliers sp
        WHERE sp.id = sr.supplier_id
          AND (lower(coalesce(sp.name, '')) LIKE '%' || t.q || '%' OR lower(coalesce(sp.phone, '')) LIKE '%' || t.q || '%')
      )
      OR EXISTS (
        SELECT 1 FROM public.purchases pu
        WHERE pu.id = sr.purchase_id
          AND lower(coalesce(pu.purchase_number, '')) LIKE '%' || t.q || '%'
      )
      OR EXISTS (
        SELECT 1
        FROM public.supplier_return_items sri
        JOIN public.products p ON p.id = sri.product_id
        WHERE sri.supplier_return_id = sr.id
          AND (
            lower(coalesce(p.name, '')) LIKE '%' || t.q || '%'
            OR lower(coalesce(p.imei, '')) LIKE '%' || t.q || '%'
            OR lower(coalesce(p.brand, '')) LIKE '%' || t.q || '%'
            OR lower(coalesce(p.model, '')) LIKE '%' || t.q || '%'
            OR lower(coalesce(p.sku, '')) LIKE '%' || t.q || '%'
            OR lower(coalesce(p.barcode, '')) LIKE '%' || t.q || '%'
          )
      )
    )
  ORDER BY sr.created_at DESC
  LIMIT LEAST(GREATEST(COALESCE(_limit, 200), 1), 500)
  OFFSET GREATEST(COALESCE(_offset, 0), 0)
$$;

REVOKE ALL ON FUNCTION public.search_supplier_return_ids(text, text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_supplier_return_ids(text, text, integer, integer) TO authenticated;

CREATE INDEX IF NOT EXISTS idx_suppliers_name_lower ON public.suppliers(lower(coalesce(name, '')));
CREATE INDEX IF NOT EXISTS idx_suppliers_phone_lower ON public.suppliers(lower(coalesce(phone, '')));
CREATE INDEX IF NOT EXISTS idx_purchases_number_lower ON public.purchases(lower(coalesce(purchase_number, '')));
CREATE INDEX IF NOT EXISTS idx_supplier_returns_reason_lower ON public.supplier_returns(lower(coalesce(reason_code, '')), lower(coalesce(reason_notes, '')));