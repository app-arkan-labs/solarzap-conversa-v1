-- Migration: Knowledge Base Module V2 - Simplified for Question-Guided UX
-- This replaces the previous complex schema with a simpler approach

-- =============================================
-- 1. NEW TABLES 
-- =============================================

-- Company Profile: Core business info for AI context
CREATE TABLE IF NOT EXISTS company_profile (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL UNIQUE,
    elevator_pitch TEXT,
    differentials TEXT,
    installation_process TEXT,
    warranty_info TEXT,
    payment_options TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Objection Responses: Q&A format for handling objections
CREATE TABLE IF NOT EXISTS objection_responses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL,
    question TEXT NOT NULL,
    response TEXT NOT NULL,
    is_preset BOOLEAN DEFAULT false,
    priority INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- 2. RLS POLICIES
-- =============================================

ALTER TABLE company_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE objection_responses ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to manage their org's data
CREATE POLICY "Users can manage company_profile" ON company_profile
    FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Users can manage objection_responses" ON objection_responses
    FOR ALL USING (auth.role() = 'authenticated');

-- =============================================
-- 3. INDEXES
-- =============================================

CREATE INDEX IF NOT EXISTS idx_company_profile_org ON company_profile(org_id);
CREATE INDEX IF NOT EXISTS idx_objection_responses_org ON objection_responses(org_id);
CREATE INDEX IF NOT EXISTS idx_objection_responses_priority ON objection_responses(org_id, priority);

-- =============================================
-- 4. UPDATED SEARCH FUNCTION (for AI retrieval)
-- =============================================

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
        -- Company Profile (always high priority)
        SELECT 
            cp.id,
            'company_info'::TEXT as type,
            'Sobre a Empresa'::TEXT as title,
            COALESCE(cp.elevator_pitch, '') || ' ' || COALESCE(cp.differentials, '') as content,
            0 as priority,
            cp.org_id
        FROM company_profile cp
        
        UNION ALL
        
        -- Testimonials
        SELECT 
            t.id,
            'testimonial'::TEXT as type,
            COALESCE(t.display_name, 'Cliente') as title,
            t.quote_short as content,
            1 as priority,
            t.org_id
        FROM testimonials t
        WHERE t.status = 'approved'
          AND t.consent_status != 'none'
        
        UNION ALL
        
        -- Objection Responses
        SELECT 
            o.id,
            'objection'::TEXT as type,
            o.question as title,
            o.response as content,
            o.priority + 10 as priority,
            o.org_id
        FROM objection_responses o
    )
    SELECT
        ci.id,
        ci.type,
        ci.title,
        ci.content,
        ci.priority
    FROM combined_items ci
    WHERE ci.org_id = p_org_id
    AND (p_query_text IS NULL 
         OR ci.content ILIKE '%' || p_query_text || '%' 
         OR ci.title ILIKE '%' || p_query_text || '%')
    ORDER BY ci.priority ASC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;
