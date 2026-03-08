-- Migration: 20260212_proposal_premium_foundation
-- Description: Foundation tables for premium/persuasive proposal generation + delivery tracking

CREATE TABLE IF NOT EXISTS public.proposal_versions (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    proposta_id int8 NOT NULL,
    lead_id int8 NOT NULL,
    user_id uuid NOT NULL,
    org_id uuid,
    version_no int4 NOT NULL DEFAULT 1,
    status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'ready', 'sent', 'accepted', 'rejected', 'archived')),
    segment text NOT NULL DEFAULT 'indefinido' CHECK (segment IN ('residencial', 'empresarial', 'agronegocio', 'usina', 'indefinido')),
    source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'ai', 'hybrid')),
    premium_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    context_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
    generated_prompt jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT proposal_versions_pkey PRIMARY KEY (id),
    CONSTRAINT proposal_versions_proposta_id_fkey FOREIGN KEY (proposta_id) REFERENCES public.propostas(id) ON DELETE CASCADE,
    CONSTRAINT proposal_versions_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE,
    CONSTRAINT proposal_versions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_proposal_versions_proposta_version
ON public.proposal_versions(proposta_id, version_no);

CREATE INDEX IF NOT EXISTS idx_proposal_versions_lead_created
ON public.proposal_versions(lead_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_proposal_versions_user_created
ON public.proposal_versions(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_proposal_versions_status
ON public.proposal_versions(status);

CREATE TABLE IF NOT EXISTS public.proposal_delivery_events (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    proposal_version_id uuid NOT NULL,
    proposta_id int8 NOT NULL,
    lead_id int8 NOT NULL,
    user_id uuid NOT NULL,
    channel text NOT NULL DEFAULT 'crm' CHECK (channel IN ('crm', 'whatsapp', 'email', 'pdf_download', 'web')),
    event_type text NOT NULL CHECK (event_type IN ('generated', 'downloaded', 'shared', 'opened', 'viewed', 'signed', 'accepted', 'rejected', 'expired')),
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT proposal_delivery_events_pkey PRIMARY KEY (id),
    CONSTRAINT proposal_delivery_events_version_fkey FOREIGN KEY (proposal_version_id) REFERENCES public.proposal_versions(id) ON DELETE CASCADE,
    CONSTRAINT proposal_delivery_events_proposta_id_fkey FOREIGN KEY (proposta_id) REFERENCES public.propostas(id) ON DELETE CASCADE,
    CONSTRAINT proposal_delivery_events_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE,
    CONSTRAINT proposal_delivery_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_proposal_delivery_events_version_created
ON public.proposal_delivery_events(proposal_version_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_proposal_delivery_events_lead_created
ON public.proposal_delivery_events(lead_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_proposal_delivery_events_event_type
ON public.proposal_delivery_events(event_type);

ALTER TABLE public.proposal_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proposal_delivery_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their proposal versions" ON public.proposal_versions;
DROP POLICY IF EXISTS "Users can insert their proposal versions" ON public.proposal_versions;
DROP POLICY IF EXISTS "Users can update their proposal versions" ON public.proposal_versions;
DROP POLICY IF EXISTS "Users can delete their proposal versions" ON public.proposal_versions;

CREATE POLICY "Users can view their proposal versions"
ON public.proposal_versions FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their proposal versions"
ON public.proposal_versions FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their proposal versions"
ON public.proposal_versions FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their proposal versions"
ON public.proposal_versions FOR DELETE
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view their proposal delivery events" ON public.proposal_delivery_events;
DROP POLICY IF EXISTS "Users can insert their proposal delivery events" ON public.proposal_delivery_events;
DROP POLICY IF EXISTS "Users can update their proposal delivery events" ON public.proposal_delivery_events;
DROP POLICY IF EXISTS "Users can delete their proposal delivery events" ON public.proposal_delivery_events;

CREATE POLICY "Users can view their proposal delivery events"
ON public.proposal_delivery_events FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their proposal delivery events"
ON public.proposal_delivery_events FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their proposal delivery events"
ON public.proposal_delivery_events FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their proposal delivery events"
ON public.proposal_delivery_events FOR DELETE
USING (auth.uid() = user_id);

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_timestamp') THEN
        IF NOT EXISTS (
            SELECT 1
            FROM pg_trigger
            WHERE tgname = 'tr_proposal_versions_updated_at'
        ) THEN
            CREATE TRIGGER tr_proposal_versions_updated_at
            BEFORE UPDATE ON public.proposal_versions
            FOR EACH ROW EXECUTE FUNCTION public.update_timestamp();
        END IF;
    END IF;
END$$;

