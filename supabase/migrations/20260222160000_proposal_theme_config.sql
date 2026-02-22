-- Add proposal theme configuration to company_profile
ALTER TABLE company_profile
  ADD COLUMN IF NOT EXISTS proposal_theme TEXT NOT NULL DEFAULT 'verde';

COMMENT ON COLUMN company_profile.proposal_theme IS 'Color theme preset for proposal PDFs: verde, azul_marinho, azul_royal, laranja, cinza_escuro';
