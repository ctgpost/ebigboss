CREATE OR REPLACE FUNCTION public.search_sale_ids_for_return(_search text, _limit integer DEFAULT 20)
RETURNS TABLE(id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT s.id
  FROM public.sales s
  WHERE auth.uid() IS NOT NULL
    AND s.id::text ILIKE '%' || trim(_search) || '%'
  ORDER BY s.created_at DESC
  LIMIT LEAST(GREATEST(COALESCE(_limit, 20), 1), 50)
$$;

REVOKE ALL ON FUNCTION public.search_sale_ids_for_return(text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_sale_ids_for_return(text, integer) TO authenticated;