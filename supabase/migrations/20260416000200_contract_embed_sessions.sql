CREATE TABLE IF NOT EXISTS public.contract_embed_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_draft_id uuid NOT NULL REFERENCES public.contract_drafts(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  seller_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'revoked')),
  allowed_origin text NOT NULL,
  prefill_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  CONSTRAINT contract_embed_sessions_token_hash_unique UNIQUE (token_hash)
);

CREATE INDEX IF NOT EXISTS idx_contract_embed_sessions_draft
ON public.contract_embed_sessions (contract_draft_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_contract_embed_sessions_org_status
ON public.contract_embed_sessions (org_id, status, expires_at DESC);

ALTER TABLE public.contract_embed_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS contract_embed_sessions_service_role_all ON public.contract_embed_sessions;
CREATE POLICY contract_embed_sessions_service_role_all
ON public.contract_embed_sessions
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);
