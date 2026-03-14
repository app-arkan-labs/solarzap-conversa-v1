-- Create updated_at column if it fails
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'leads' AND column_name = 'updated_at') THEN 
        ALTER TABLE leads ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(); 
    END IF; 
END $$;

-- Drop function if exists to recreate it with correct parameters
DROP FUNCTION IF EXISTS public.upsert_lead_canonical;

-- Create or replace the function
CREATE OR REPLACE FUNCTION public.upsert_lead_canonical(
    p_user_id UUID,
    p_instance_name TEXT,
    p_phone_e164 TEXT,
    p_telefone TEXT,
    p_name TEXT DEFAULT NULL,
    p_push_name TEXT DEFAULT NULL,
    p_source TEXT DEFAULT 'whatsapp'
)
RETURNS TABLE (
    id BIGINT,
    created_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_lead_id BIGINT;
    v_created_at TIMESTAMP WITH TIME ZONE;
    v_updated_at TIMESTAMP WITH TIME ZONE;
BEGIN
    -- 1. Try to find existing lead by E164 (exact match)
    SELECT l.id, l.created_at, l.updated_at INTO v_lead_id, v_created_at, v_updated_at
    FROM leads l
    WHERE l.user_id = p_user_id
      AND l.phone_e164 = p_phone_e164
    LIMIT 1;

    -- 2. If not found, try by legacy telefone column (looser match)
    IF v_lead_id IS NULL AND p_telefone IS NOT NULL THEN
        SELECT l.id, l.created_at, l.updated_at INTO v_lead_id, v_created_at, v_updated_at
        FROM leads l
        WHERE l.user_id = p_user_id
          AND l.telefone = p_telefone
        LIMIT 1;
    END IF;

    -- 3. If still not found, INSERT
    IF v_lead_id IS NULL THEN
        INSERT INTO leads (
            user_id,
            instance_name,
            phone_e164,
            telefone,
            nome,
            source,
            created_at,
            updated_at
        ) VALUES (
            p_user_id,
            p_instance_name,
            p_phone_e164,
            p_telefone,
            COALESCE(p_name, p_push_name, p_telefone), -- Use push_name or phone if name is missing
            p_source,
            NOW(),
            NOW()
        )
        RETURNING leads.id, leads.created_at, leads.updated_at INTO v_lead_id, v_created_at, v_updated_at;
    
    ELSE
        -- 4. If found, UPDATE metadata (optional, but good for activity tracking)
        UPDATE leads
        SET 
            updated_at = NOW(),
            instance_name = COALESCE(leads.instance_name, p_instance_name),
            -- Only update name if it was just a phone number before
            nome = CASE 
                WHEN leads.nome = leads.telefone AND p_push_name IS NOT NULL THEN p_push_name 
                ELSE leads.nome 
            END
        WHERE leads.id = v_lead_id
        RETURNING leads.updated_at INTO v_updated_at;
    END IF;

    RETURN QUERY SELECT v_lead_id, v_created_at, v_updated_at;
END;
$$;
