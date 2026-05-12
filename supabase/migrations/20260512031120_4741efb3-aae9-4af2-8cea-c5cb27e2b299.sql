
CREATE TABLE IF NOT EXISTS public.return_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_type text NOT NULL CHECK (return_type IN ('sales','supplier')),
  return_id uuid NOT NULL,
  return_number text,
  action text NOT NULL,
  actor_id uuid,
  actor_email text,
  before_state jsonb,
  after_state jsonb,
  stock_impact jsonb,
  ledger_impact jsonb,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ral_return ON public.return_audit_logs (return_type, return_id, created_at DESC);

ALTER TABLE public.return_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can view return audit" ON public.return_audit_logs;
CREATE POLICY "Authenticated can view return audit" ON public.return_audit_logs
  FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated can insert return audit" ON public.return_audit_logs;
CREATE POLICY "Authenticated can insert return audit" ON public.return_audit_logs
  FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Admins can delete return audit" ON public.return_audit_logs;
CREATE POLICY "Admins can delete return audit" ON public.return_audit_logs
  FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));
