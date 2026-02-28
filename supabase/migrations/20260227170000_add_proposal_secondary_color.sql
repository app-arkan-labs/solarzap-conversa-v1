-- Add secondary color configuration for proposal PDFs
ALTER TABLE public.company_profile
  ADD COLUMN IF NOT EXISTS proposal_secondary_color TEXT;

COMMENT ON COLUMN public.company_profile.proposal_secondary_color IS
'Optional secondary/accent color for proposal PDFs. HEX format: #RRGGBB. NULL = automatic complementary color.';
