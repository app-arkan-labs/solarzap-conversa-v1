-- Add proposal_logo_url column to company_profile (for custom logo in proposal PDFs)
ALTER TABLE public.company_profile
  ADD COLUMN IF NOT EXISTS proposal_logo_url TEXT DEFAULT NULL;

COMMENT ON COLUMN public.company_profile.proposal_logo_url
  IS 'Public URL of the company logo for proposal PDFs (stored in proposal-assets bucket)';
