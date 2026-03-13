-- Migration: 20260212_proposal_sections
-- Description: Structured proposal sections per proposal_version (premium composer output).

CREATE TABLE IF NOT EXISTS public.proposal_sections (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    proposal_version_id uuid NOT NULL,
    user_id uuid NOT NULL,
    org_id uuid,
    section_key text NOT NULL,
    section_title text,
    section_order int4 NOT NULL DEFAULT 0,
    content jsonb NOT NULL DEFAULT '{}'::jsonb,
    source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'ai', 'hybrid')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT proposal_sections_pkey PRIMARY KEY (id),
    CONSTRAINT proposal_sections_version_fkey FOREIGN KEY (proposal_version_id) REFERENCES public.proposal_versions(id) ON DELETE CASCADE,
    CONSTRAINT proposal_sections_user_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_proposal_sections_version_key
ON public.proposal_sections(proposal_version_id, section_key);

CREATE INDEX IF NOT EXISTS idx_proposal_sections_version_order
ON public.proposal_sections(proposal_version_id, section_order);

ALTER TABLE public.proposal_sections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their proposal sections" ON public.proposal_sections;
DROP POLICY IF EXISTS "Users can insert their proposal sections" ON public.proposal_sections;
DROP POLICY IF EXISTS "Users can update their proposal sections" ON public.proposal_sections;
DROP POLICY IF EXISTS "Users can delete their proposal sections" ON public.proposal_sections;

CREATE POLICY "Users can view their proposal sections"
ON public.proposal_sections FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their proposal sections"
ON public.proposal_sections FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their proposal sections"
ON public.proposal_sections FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their proposal sections"
ON public.proposal_sections FOR DELETE
USING (auth.uid() = user_id);

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_timestamp') THEN
        IF NOT EXISTS (
            SELECT 1
            FROM pg_trigger
            WHERE tgname = 'tr_proposal_sections_updated_at'
        ) THEN
            CREATE TRIGGER tr_proposal_sections_updated_at
            BEFORE UPDATE ON public.proposal_sections
            FOR EACH ROW EXECUTE FUNCTION public.update_timestamp();
        END IF;
    END IF;
END$$;

