
-- Create trigger on auth.users for new user signup
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Backfill profiles for existing auth users that don't have profiles
INSERT INTO public.profiles (id, email, full_name)
SELECT 
  au.id,
  au.email,
  COALESCE(au.raw_user_meta_data ->> 'full_name', au.email)
FROM auth.users au
LEFT JOIN public.profiles p ON p.id = au.id
WHERE p.id IS NULL;
