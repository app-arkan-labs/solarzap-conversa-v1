-- Migration: 20260212_kb_items_in_rag
-- Description: Include approved kb_items documents in knowledge_search_v2 retrieval.

-- Existing deployments may have an older return signature, so replace via DROP+CREATE.
DROP FUNCTION IF EXISTS public.knowledge_search_v2(UUID, TEXT, INT);
DROP FUNCTION IF EXISTS public.knowledge_search_v2(UUID, TEXT);

CREATE FUNCTION knowledge_search_v2(
    p_org_id UUID,
    p_query_text TEXT,
    p_limit INT DEFAULT 10
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
    WITH combined_items AS (
        -- Company Profile (always included, highest priority)
        SELECT
            cp.id,
            'company_info'::TEXT as type,
            'Sobre a Empresa'::TEXT as title,
            'Elevator: ' || COALESCE(cp.elevator_pitch, '') || ' | ' ||
            'Diferenciais: ' || COALESCE(cp.differentials, '') || ' | ' ||
            'Processo: ' || COALESCE(cp.installation_process, '') || ' | ' ||
            'Garantia: ' || COALESCE(cp.warranty_info, '') || ' | ' ||
            'Pagamento: ' || COALESCE(cp.payment_options, '') as content,
            0 as priority,
            cp.org_id
        FROM company_profile cp
        WHERE cp.org_id = p_org_id

        UNION ALL

        -- Testimonials
        SELECT
            t.id,
            'testimonial'::TEXT as type,
            COALESCE(t.display_name, 'Cliente') as title,
            COALESCE(t.quote_short, '') || ' ' || COALESCE(t.story_long, '') as content,
            1 as priority,
            t.org_id
        FROM testimonials t
        WHERE t.org_id = p_org_id
          AND t.status = 'approved'
          AND t.consent_status != 'none'

        UNION ALL

        -- Objections / FAQ
        SELECT
            o.id,
            'objection'::TEXT as type,
            o.question as title,
            o.response as content,
            o.priority + 10 as priority,
            o.org_id
        FROM objection_responses o
        WHERE o.org_id = p_org_id

        UNION ALL

        -- Imported KB documents / snippets
        SELECT
            k.id,
            'kb_item'::TEXT as type,
            COALESCE(k.title, 'Documento') as title,
            COALESCE(k.body, '') as content,
            5 as priority,
            k.org_id
        FROM kb_items k
        WHERE k.org_id = p_org_id
          AND k.status::text = 'approved'
    )
    SELECT
        ci.id,
        ci.type,
        ci.title,
        ci.content,
        ci.priority
    FROM combined_items ci
    WHERE
        (ci.type = 'company_info')
        OR
        (p_query_text IS NOT NULL AND (
            ci.content ILIKE '%' || p_query_text || '%'
            OR ci.title ILIKE '%' || p_query_text || '%'
        ))
    ORDER BY ci.priority ASC, ci.title ASC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;
