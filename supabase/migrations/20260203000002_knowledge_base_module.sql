-- Migration: Knowledge Base Module (IA) - REFACTORED MVP

-- 1. Enums
CREATE TYPE kb_status AS ENUM ('draft', 'approval_pending', 'approved', 'archived');
CREATE TYPE kb_type AS ENUM ('offer', 'process', 'objection', 'faq', 'policy', 'script');
CREATE TYPE evidence_level AS ENUM ('claimed', 'verified');
CREATE TYPE consent_status AS ENUM ('none', 'internal_only', 'marketing_ok');
CREATE TYPE asset_type AS ENUM ('image', 'video', 'audio', 'pdf', 'other');
CREATE TYPE proof_level AS ENUM ('none', 'print', 'audio', 'video', 'document');

-- 2. Tables

-- KB Items (General Content: Offers, Objections, Policies...)
CREATE TABLE kb_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL, 
    type kb_type NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL, -- Main content
    tags TEXT[],
    status kb_status NOT NULL DEFAULT 'draft',
    created_by UUID REFERENCES auth.users(id),
    approved_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Testimonials (Simplified)
CREATE TABLE testimonials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL,
    contact_id UUID REFERENCES public.leads(id), -- Nullable link to CRM contact
    display_name TEXT, -- Fallback if not linked or for privacy
    
    quote_short TEXT NOT NULL, -- Used as "Description/Proof Justification"
    story_long TEXT, -- Optional details
    
    type asset_type DEFAULT 'other', -- Main type icon
    consent_status consent_status NOT NULL DEFAULT 'internal_only',
    status kb_status NOT NULL DEFAULT 'draft',
    
    created_by UUID REFERENCES auth.users(id),
    approved_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Assets Library (Storage Metadata)
CREATE TABLE kb_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL,
    type asset_type NOT NULL,
    file_name TEXT NOT NULL,
    mime_type TEXT,
    storage_path TEXT NOT NULL,
    size_bytes BIGINT,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Asset Annotations (Linking table with Captions for IA)
CREATE TABLE asset_annotations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL,
    object_type TEXT CHECK (object_type IN ('testimonial', 'kb_item')),
    object_id UUID NOT NULL,
    asset_id UUID REFERENCES kb_assets(id) ON DELETE CASCADE,
    
    caption TEXT NOT NULL, -- Essential for IA context ("O que é isso?")
    
    -- Future IA fields
    transcript_text TEXT,
    alt_text TEXT,
    extracted_text TEXT,
    
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_asset_annotations_object ON asset_annotations(object_type, object_id);

-- Logs
CREATE TABLE kb_approval_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL,
    object_type TEXT CHECK (object_type IN ('testimonial', 'kb_item')),
    object_id UUID NOT NULL,
    action TEXT NOT NULL, -- submit, approve, reject, archive
    notes TEXT,
    actor_id UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Search Function (RAG Ready - Simplified)
CREATE OR REPLACE FUNCTION knowledge_search(
    p_org_id UUID,
    p_query_text TEXT,
    p_limit INT DEFAULT 10
)
RETURNS TABLE (
    item_id UUID,
    item_type TEXT, 
    title_or_name TEXT,
    content_snippet TEXT,
    status kb_status,
    assets JSONB
) AS $$
BEGIN
    RETURN QUERY
    WITH combined_items AS (
        -- KB Items
        SELECT 
            k.id,
            'kb_item'::TEXT as type,
            k.title as title,
            k.body as content,
            k.status,
            k.org_id
        FROM kb_items k
        WHERE k.status = 'approved' 
        
        UNION ALL
        
        -- Testimonials
        SELECT 
            t.id,
            'testimonial'::TEXT as type,
            COALESCE(t.display_name, 'Cliente') as title,
            t.quote_short as content,
            t.status,
            t.org_id
        FROM testimonials t
        WHERE t.status = 'approved'
          AND t.consent_status != 'none'
    )
    SELECT
        ci.id,
        ci.type,
        ci.title,
        ci.content,
        ci.status,
        (
            SELECT jsonb_agg(jsonb_build_object(
                'asset_id', aa.asset_id,
                'caption', aa.caption,
                'path', ka.storage_path
            ))
            FROM asset_annotations aa
            JOIN kb_assets ka ON aa.asset_id = ka.id
            WHERE aa.object_id = ci.id AND aa.object_type = ci.type
        ) as assets
    FROM combined_items ci
    WHERE ci.org_id = p_org_id
    AND (p_query_text IS NULL OR ci.content ILIKE '%' || p_query_text || '%' OR ci.title ILIKE '%' || p_query_text || '%')
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- 4. RLS
ALTER TABLE kb_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE testimonials ENABLE ROW LEVEL SECURITY;
ALTER TABLE kb_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE asset_annotations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable all for authenticated" ON kb_items FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Enable all for authenticated" ON testimonials FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Enable all for authenticated" ON kb_assets FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Enable all for authenticated" ON asset_annotations FOR ALL USING (auth.role() = 'authenticated');
