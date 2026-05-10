DROP TRIGGER IF EXISTS trg_generate_return_number ON public.returns;
DROP TRIGGER IF EXISTS trg_returns_updated_at ON public.returns;

DROP TRIGGER IF EXISTS set_return_number ON public.returns;
CREATE TRIGGER set_return_number
BEFORE INSERT ON public.returns
FOR EACH ROW
EXECUTE FUNCTION public.generate_return_number();

DROP TRIGGER IF EXISTS update_returns_updated_at ON public.returns;
CREATE TRIGGER update_returns_updated_at
BEFORE UPDATE ON public.returns
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS set_supplier_return_number ON public.supplier_returns;
CREATE TRIGGER set_supplier_return_number
BEFORE INSERT ON public.supplier_returns
FOR EACH ROW
EXECUTE FUNCTION public.generate_supplier_return_number();

DROP TRIGGER IF EXISTS update_supplier_returns_updated_at ON public.supplier_returns;
CREATE TRIGGER update_supplier_returns_updated_at
BEFORE UPDATE ON public.supplier_returns
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();