-- Migration: KB & RAG Hardening (Increment 5)
-- 1. Fix Testimonials Schema (Add media_url to match UI)
-- 2. Update knowledge_search_v2 to include FULL company info and ensure it's not filtered out

-- 1. Schema Fix
-- Ensure Testimonials table exists (Missing in previous migrations)
CREATE TABLE IF NOT EXISTS testimonials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL,
    display_name TEXT,
    quote_short TEXT,
    story_long TEXT,
    type TEXT DEFAULT 'text', -- text, video, image, audio, etc.
    media_url TEXT,           -- Added in this migration logic (if exists, good)
    status TEXT DEFAULT 'pending', -- approved, pending, rejected
    consent_status TEXT DEFAULT 'none', -- internal_only, public, none
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add media_url if table existed but column didn't (Safe double-check)
ALTER TABLE testimonials ADD COLUMN IF NOT EXISTS media_url TEXT;

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_testimonials_org ON testimonials(org_id);

-- 2. Updated Search Function (Robust RAG)
CREATE OR REPLACE FUNCTION knowledge_search_v2(
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
        -- Company Profile (ALWAYS INCLUDED, PRIORITY 0)
        -- NOW INCLUDES ALL FIELDS: Elevator, Differentials, Process, Warranty, Payment
        SELECT 
            cp.id,
            'company_info'::TEXT as type,
            'Sobre a Empresa'::TEXT as title,
            
            -- Concatenate all fields with labels for clear AI context
            'Elevator: ' || COALESCE(cp.elevator_pitch, '') || ' | ' ||
            'Diferenciais: ' || COALESCE(cp.differentials, '') || ' | ' ||
            'Processo: ' || COALESCE(cp.installation_process, '') || ' | ' ||
            'Garantia: ' || COALESCE(cp.warranty_info, '') || ' | ' ||
            'Pagamento: ' || COALESCE(cp.payment_options, '') 
            as content,
            
            0 as priority,
            cp.org_id
        FROM company_profile cp
        WHERE cp.org_id = p_org_id
        
        UNION ALL
        
        -- Testimonials (Priority 1)
        SELECT 
            t.id,
            'testimonial'::TEXT as type,
            COALESCE(t.display_name, 'Cliente') as title,
            -- Combine quote and story
            COALESCE(t.quote_short, '') || ' ' || COALESCE(t.story_long, '') as content,
            1 as priority,
            t.org_id
        FROM testimonials t
        WHERE t.org_id = p_org_id
          AND t.status = 'approved'
          AND t.consent_status != 'none'
        
        UNION ALL
        
        -- Objection Responses (Priority 2)
        SELECT 
            o.id,
            'objection'::TEXT as type,
            o.question as title,
            o.response as content,
            -- Presets have lower priority (higher number) than custom ones if we wanted, 
            -- but mostly relying on semantic match. Let's keep priority simple.
            o.priority + 10 as priority,
            o.org_id
        FROM objection_responses o
        WHERE o.org_id = p_org_id
    )
    SELECT
        ci.id,
        ci.type,
        ci.title,
        ci.content,
        ci.priority
    FROM combined_items ci
    WHERE 
        -- LOGIC:
        -- 1. Always include 'company_info' (type check)
        -- 2. OR match query text (case insensitive)
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
