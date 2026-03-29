-- Add fiscal document fields to company_profile for signup-collected data
ALTER TABLE public.company_profile
  ADD COLUMN IF NOT EXISTS cnpj TEXT,
  ADD COLUMN IF NOT EXISTS owner_cpf TEXT;

COMMENT ON COLUMN public.company_profile.cnpj IS 'CNPJ da empresa (14 dígitos, sem formatação)';
COMMENT ON COLUMN public.company_profile.owner_cpf IS 'CPF do proprietário/responsável (11 dígitos, sem formatação)';
