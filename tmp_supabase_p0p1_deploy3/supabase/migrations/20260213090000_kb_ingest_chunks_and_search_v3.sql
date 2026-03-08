-- Migration: 20260213_kb_ingest_chunks_and_search_v3
-- Description:
-- 1) Add storage metadata + ingestion tracking to kb_items
-- 2) Create kb_item_chunks for real document ingestion (FTS)
-- 3) Add knowledge_search_v3 for retrieving relevant chunks alongside KB primitives

-- 1) kb_items metadata
ALTER TABLE public.kb_items
  ADD COLUMN IF NOT EXISTS storage_bucket text,
  ADD COLUMN IF NOT EXISTS storage_path text,
  ADD COLUMN IF NOT EXISTS mime_type text,
  ADD COLUMN IF NOT EXISTS ingested_at timestamptz,
  ADD COLUMN IF NOT EXISTS ingestion_error text;

CREATE INDEX IF NOT EXISTS idx_kb_items_org_ingested_at
ON public.kb_items(org_id, ingested_at);

-- 2) Chunks table (FTS)
CREATE TABLE IF NOT EXISTS public.kb_item_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  kb_item_id uuid NOT NULL REFERENCES public.kb_items(id) ON DELETE CASCADE,
  chunk_index int4 NOT NULL,
  chunk_text text NOT NULL,
  tsv tsvector GENERATED ALWAYS AS (
    to_tsvector('portuguese', COALESCE(chunk_text, ''))
  ) STORED,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_kb_item_chunks_item_index
ON public.kb_item_chunks(kb_item_id, chunk_index);

CREATE INDEX IF NOT EXISTS idx_kb_item_chunks_org
ON public.kb_item_chunks(org_id);

CREATE INDEX IF NOT EXISTS idx_kb_item_chunks_tsv
ON public.kb_item_chunks USING gin(tsv);

ALTER TABLE public.kb_item_chunks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable all for authenticated" ON public.kb_item_chunks;
CREATE POLICY "Enable all for authenticated"
ON public.kb_item_chunks FOR ALL
USING (auth.role() = 'authenticated');

-- 3) Search v3 (chunks + existing KB)
DROP FUNCTION IF EXISTS public.knowledge_search_v3(UUID, TEXT, INT);

CREATE FUNCTION public.knowledge_search_v3(
  p_org_id UUID,
  p_query_text TEXT,
  p_limit INT DEFAULT 12
)
RETURNS TABLE (
  item_id UUID,
  item_type TEXT,
  title_or_name TEXT,
  content_snippet TEXT,
  priority INT
) AS $$
BEGIN
  RETURN QUERY
  WITH q AS (
    SELECT
      NULLIF(TRIM(COALESCE(p_query_text, '')), '') AS query_text,
      CASE
        WHEN NULLIF(TRIM(COALESCE(p_query_text, '')), '') IS NULL THEN NULL
        ELSE plainto_tsquery('portuguese', p_query_text)
      END AS tsq
  ),
  combined_items AS (
    -- Company Profile (always included, highest priority)
    SELECT
      cp.id AS id,
      'company_info'::TEXT AS type,
      'Sobre a Empresa'::TEXT AS title,
      'Elevator: ' || COALESCE(cp.elevator_pitch, '') || ' | ' ||
      'Diferenciais: ' || COALESCE(cp.differentials, '') || ' | ' ||
      'Processo: ' || COALESCE(cp.installation_process, '') || ' | ' ||
      'Garantia: ' || COALESCE(cp.warranty_info, '') || ' | ' ||
      'Pagamento: ' || COALESCE(cp.payment_options, '') AS content,
      0 AS priority,
      NULL::FLOAT AS rank
    FROM public.company_profile cp
    WHERE cp.org_id = p_org_id

    UNION ALL

    -- Testimonials
    SELECT
      t.id,
      'testimonial'::TEXT AS type,
      COALESCE(t.display_name, 'Cliente') AS title,
      COALESCE(t.quote_short, '') || ' ' || COALESCE(t.story_long, '') AS content,
      1 AS priority,
      NULL::FLOAT AS rank
    FROM public.testimonials t
    WHERE t.org_id = p_org_id
      AND t.status = 'approved'
      AND t.consent_status != 'none'

    UNION ALL

    -- Objections / FAQ
    SELECT
      o.id,
      'objection'::TEXT AS type,
      o.question AS title,
      o.response AS content,
      o.priority + 10 AS priority,
      NULL::FLOAT AS rank
    FROM public.objection_responses o
    WHERE o.org_id = p_org_id

    UNION ALL

    -- Chunked documents (FTS)
    SELECT
      c.id,
      'kb_chunk'::TEXT AS type,
      COALESCE(k.title, 'Documento') AS title,
      c.chunk_text AS content,
      5 AS priority,
      ts_rank(c.tsv, q.tsq) AS rank
    FROM public.kb_item_chunks c
    JOIN public.kb_items k ON k.id = c.kb_item_id
    CROSS JOIN q
    WHERE c.org_id = p_org_id
      AND k.org_id = p_org_id
      AND k.status = 'approved'
      AND q.tsq IS NOT NULL
      AND c.tsv @@ q.tsq

    UNION ALL

    -- Fallback: raw kb_items body (substring match) for items not ingested yet
    SELECT
      k.id,
      'kb_item'::TEXT AS type,
      COALESCE(k.title, 'Documento') AS title,
      COALESCE(k.body, '') AS content,
      6 AS priority,
      NULL::FLOAT AS rank
    FROM public.kb_items k
    CROSS JOIN q
    WHERE k.org_id = p_org_id
      AND k.status = 'approved'
      AND q.query_text IS NOT NULL
      AND (k.body ILIKE '%' || q.query_text || '%' OR k.title ILIKE '%' || q.query_text || '%')
  )
  SELECT
    ci.id,
    ci.type,
    ci.title,
    LEFT(ci.content, 2800) AS content_snippet,
    ci.priority
  FROM combined_items ci
  ORDER BY ci.priority ASC, ci.rank DESC NULLS LAST, ci.title ASC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

