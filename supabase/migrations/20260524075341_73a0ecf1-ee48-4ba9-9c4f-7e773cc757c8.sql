
-- 1. Activity logs: restrict UPDATE to admins
DROP POLICY IF EXISTS "Authenticated users can update logs" ON public.activity_logs;
CREATE POLICY "Admins can update logs"
ON public.activity_logs
FOR UPDATE
TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

-- 2. Branding bucket: restrict UPDATE/DELETE to admins
DROP POLICY IF EXISTS "Authenticated users can update branding" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete branding" ON storage.objects;

CREATE POLICY "Admins can update branding"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'branding' AND public.is_admin(auth.uid()))
WITH CHECK (bucket_id = 'branding' AND public.is_admin(auth.uid()));

CREATE POLICY "Admins can delete branding"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'branding' AND public.is_admin(auth.uid()));

-- 3. Return-photos: restrict UPDATE/DELETE to admin or manager
DROP POLICY IF EXISTS "Authenticated update return photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated delete return photos" ON storage.objects;

CREATE POLICY "Admins or managers can update return photos"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'return-photos' AND (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'manager'::app_role)))
WITH CHECK (bucket_id = 'return-photos' AND (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'manager'::app_role)));

CREATE POLICY "Admins or managers can delete return photos"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'return-photos' AND (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'manager'::app_role)));

-- 4. Realtime authorization: require authentication for any realtime subscription
ALTER TABLE IF EXISTS realtime.messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users can receive realtime" ON realtime.messages;
CREATE POLICY "Authenticated users can receive realtime"
ON realtime.messages
FOR SELECT
TO authenticated
USING (auth.uid() IS NOT NULL);

-- 5. Revoke anon execute on internal/search SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION public.process_sales_return(uuid, text, uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.process_supplier_return(uuid, text, uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.search_sale_ids_for_return(text, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.search_supplier_return_ids(text, text, integer, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_admin(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_user_role(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_return_number() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.payments_recalc_sale() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.supplier_payments_recalc_purchase() FROM PUBLIC, anon, authenticated;
