CREATE OR REPLACE FUNCTION public.generate_contract_number()
RETURNS text
LANGUAGE sql
AS $$
  SELECT
    'CTR-' ||
    to_char(timezone('America/Sao_Paulo', now()), 'YYYYMMDD') ||
    '-' ||
    upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
$$;

CREATE TABLE IF NOT EXISTS public.contract_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  lead_id int8 REFERENCES public.leads(id) ON DELETE SET NULL,
  opportunity_id int8,
  contract_number text NOT NULL DEFAULT public.generate_contract_number(),
  contract_version int4 NOT NULL DEFAULT 1 CHECK (contract_version > 0),
  template_version text NOT NULL,
  contract_status text NOT NULL DEFAULT 'draft' CHECK (
    contract_status IN (
      'draft',
      'review_ready',
      'preview_generated',
      'pdf_generated',
      'sent_for_signature',
      'signed',
      'cancelled',
      'expired',
      'failed'
    )
  ),
  signature_status text NOT NULL DEFAULT 'not_requested' CHECK (
    signature_status IN (
      'not_requested',
      'ready',
      'pending',
      'signed',
      'declined',
      'cancelled',
      'failed'
    )
  ),
  generated_from text NOT NULL DEFAULT 'internal_app',
  source_context jsonb NOT NULL DEFAULT '{}'::jsonb,
  embed_origin text,
  embed_source text,
  sales_session_id text,
  seller_user_id uuid,
  created_by_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  last_updated_by_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  signature_provider text,
  signature_envelope_id text,
  signature_reference jsonb NOT NULL DEFAULT '{}'::jsonb,
  preview_storage_bucket text,
  preview_storage_path text,
  pdf_storage_bucket text,
  pdf_storage_path text,
  legal_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  internal_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  commercial_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  plan_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  special_condition_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  payment_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  recurrence_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  placeholder_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  rendered_html text,
  rendered_text text,
  checksum_hash text,
  last_error jsonb NOT NULL DEFAULT '{}'::jsonb,
  preview_generated_at timestamptz,
  pdf_generated_at timestamptz,
  sent_to_signature_at timestamptz,
  signed_at timestamptz,
  cancelled_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT contract_drafts_org_number_unique UNIQUE (org_id, contract_number)
);

CREATE TABLE IF NOT EXISTS public.contract_artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_draft_id uuid NOT NULL REFERENCES public.contract_drafts(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_by_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  artifact_kind text NOT NULL CHECK (
    artifact_kind IN (
      'preview_html',
      'pdf',
      'signature_receipt',
      'summary_snapshot'
    )
  ),
  version_no int4 NOT NULL DEFAULT 1 CHECK (version_no > 0),
  template_version text NOT NULL,
  storage_bucket text,
  storage_path text,
  mime_type text NOT NULL,
  html_snapshot text,
  text_snapshot text,
  checksum_hash text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.contract_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_draft_id uuid NOT NULL REFERENCES public.contract_drafts(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (
    event_type IN (
      'contract_created',
      'contract_draft_saved',
      'summary_confirmed',
      'preview_generated',
      'pdf_generated',
      'sent_for_signature',
      'signed',
      'cancelled',
      'expired',
      'failed',
      'special_condition_applied',
      'state_transition'
    )
  ),
  previous_status text,
  next_status text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contract_drafts_org_updated
ON public.contract_drafts (org_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_contract_drafts_status
ON public.contract_drafts (org_id, contract_status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_contract_drafts_lead
ON public.contract_drafts (org_id, lead_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_contract_artifacts_draft_kind
ON public.contract_artifacts (contract_draft_id, artifact_kind, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_contract_events_draft_created
ON public.contract_events (contract_draft_id, created_at DESC);

ALTER TABLE public.contract_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contract_artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contract_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS contract_drafts_service_role_all ON public.contract_drafts;
CREATE POLICY contract_drafts_service_role_all
ON public.contract_drafts
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS contract_drafts_auth_select_org ON public.contract_drafts;
CREATE POLICY contract_drafts_auth_select_org
ON public.contract_drafts
FOR SELECT
TO authenticated
USING (public.user_belongs_to_org(org_id));

DROP POLICY IF EXISTS contract_drafts_auth_insert_org ON public.contract_drafts;
CREATE POLICY contract_drafts_auth_insert_org
ON public.contract_drafts
FOR INSERT
TO authenticated
WITH CHECK (public.user_belongs_to_org(org_id));

DROP POLICY IF EXISTS contract_drafts_auth_update_org ON public.contract_drafts;
CREATE POLICY contract_drafts_auth_update_org
ON public.contract_drafts
FOR UPDATE
TO authenticated
USING (public.user_belongs_to_org(org_id))
WITH CHECK (public.user_belongs_to_org(org_id));

DROP POLICY IF EXISTS contract_drafts_auth_delete_org ON public.contract_drafts;
CREATE POLICY contract_drafts_auth_delete_org
ON public.contract_drafts
FOR DELETE
TO authenticated
USING (public.user_belongs_to_org(org_id));

DROP POLICY IF EXISTS contract_artifacts_service_role_all ON public.contract_artifacts;
CREATE POLICY contract_artifacts_service_role_all
ON public.contract_artifacts
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS contract_artifacts_auth_select_org ON public.contract_artifacts;
CREATE POLICY contract_artifacts_auth_select_org
ON public.contract_artifacts
FOR SELECT
TO authenticated
USING (public.user_belongs_to_org(org_id));

DROP POLICY IF EXISTS contract_artifacts_auth_insert_org ON public.contract_artifacts;
CREATE POLICY contract_artifacts_auth_insert_org
ON public.contract_artifacts
FOR INSERT
TO authenticated
WITH CHECK (public.user_belongs_to_org(org_id));

DROP POLICY IF EXISTS contract_artifacts_auth_update_org ON public.contract_artifacts;
CREATE POLICY contract_artifacts_auth_update_org
ON public.contract_artifacts
FOR UPDATE
TO authenticated
USING (public.user_belongs_to_org(org_id))
WITH CHECK (public.user_belongs_to_org(org_id));

DROP POLICY IF EXISTS contract_artifacts_auth_delete_org ON public.contract_artifacts;
CREATE POLICY contract_artifacts_auth_delete_org
ON public.contract_artifacts
FOR DELETE
TO authenticated
USING (public.user_belongs_to_org(org_id));

DROP POLICY IF EXISTS contract_events_service_role_all ON public.contract_events;
CREATE POLICY contract_events_service_role_all
ON public.contract_events
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS contract_events_auth_select_org ON public.contract_events;
CREATE POLICY contract_events_auth_select_org
ON public.contract_events
FOR SELECT
TO authenticated
USING (public.user_belongs_to_org(org_id));

DROP POLICY IF EXISTS contract_events_auth_insert_org ON public.contract_events;
CREATE POLICY contract_events_auth_insert_org
ON public.contract_events
FOR INSERT
TO authenticated
WITH CHECK (public.user_belongs_to_org(org_id));

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_timestamp') THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_trigger
      WHERE tgname = 'tr_contract_drafts_updated_at'
    ) THEN
      CREATE TRIGGER tr_contract_drafts_updated_at
      BEFORE UPDATE ON public.contract_drafts
      FOR EACH ROW EXECUTE FUNCTION public.update_timestamp();
    END IF;
  END IF;
END$$;
