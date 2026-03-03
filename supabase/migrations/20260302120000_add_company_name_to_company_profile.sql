ALTER TABLE public.company_profile
  ADD COLUMN IF NOT EXISTS company_name TEXT;

COMMENT ON COLUMN public.company_profile.company_name IS
  'Nome da empresa utilizado pela IA para personalizar apresentação e contexto comercial.';