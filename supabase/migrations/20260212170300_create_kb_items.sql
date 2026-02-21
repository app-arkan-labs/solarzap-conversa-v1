-- Migration: 20260212_create_kb_items
-- Description: Ensure kb_items exists for Knowledge Base imports and RAG retrieval.

CREATE TABLE IF NOT EXISTS public.kb_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL,
    type text NOT NULL,
    title text NOT NULL,
    body text NOT NULL,
    tags text[] DEFAULT '{}'::text[],
    status text NOT NULL DEFAULT 'draft',
    created_by uuid REFERENCES auth.users(id),
    approved_by uuid REFERENCES auth.users(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kb_items_org_status
ON public.kb_items(org_id, status);

CREATE INDEX IF NOT EXISTS idx_kb_items_org_type
ON public.kb_items(org_id, type);

ALTER TABLE public.kb_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable all for authenticated" ON public.kb_items;
CREATE POLICY "Enable all for authenticated"
ON public.kb_items FOR ALL
USING (auth.role() = 'authenticated');

-- Updated_at trigger (reuse existing function if available).
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_timestamp') THEN
        IF NOT EXISTS (
            SELECT 1
            FROM pg_trigger
            WHERE tgname = 'tr_kb_items_updated_at'
        ) THEN
            CREATE TRIGGER tr_kb_items_updated_at
            BEFORE UPDATE ON public.kb_items
            FOR EACH ROW EXECUTE FUNCTION public.update_timestamp();
        END IF;
    END IF;
END$$;

