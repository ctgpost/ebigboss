REVOKE ALL ON FUNCTION public.process_supplier_return(uuid, text, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.process_supplier_return(uuid, text, uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.process_supplier_return(uuid, text, uuid, text) TO authenticated;