-- Migration: 20260213_knowledge_search_v3_fix_lexeme_order
-- Description: Fix ORDER BY with DISTINCT in lexeme selection for knowledge_search_v3.

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
        ELSE (
          SELECT
            CASE
              WHEN COUNT(*) = 0 THEN NULL
              ELSE to_tsquery('portuguese', string_agg(lexeme || ':*', ' | '))
            END
          FROM (
            SELECT lexeme
            FROM (
              SELECT DISTINCT lexeme
              FROM unnest(tsvector_to_array(to_tsvector('portuguese', p_query_text))) AS lexeme
              WHERE length(lexeme) >= 3
            ) d
            ORDER BY length(lexeme) DESC, lexeme ASC
            LIMIT 14
          ) t
        )
      END AS tsq
  ),
  combined_items AS (
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

    SELECT
      k.id,
      'kb_item'::TEXT AS type,
      COALESCE(k.title, 'Documento') AS title,
      COALESCE(k.body, '') AS content,
      6 AS priority,
      ts_rank(to_tsvector('portuguese', COALESCE(k.title, '') || ' ' || COALESCE(k.body, '')), q.tsq) AS rank
    FROM public.kb_items k
    CROSS JOIN q
    WHERE k.org_id = p_org_id
      AND k.status = 'approved'
      AND q.tsq IS NOT NULL
      AND to_tsvector('portuguese', COALESCE(k.title, '') || ' ' || COALESCE(k.body, '')) @@ q.tsq
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

