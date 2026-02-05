-- FUNCTION: find_lead_by_phone (IMPROVED)
CREATE OR REPLACE FUNCTION find_lead_by_phone(p_user_id uuid, p_phone text)
RETURNS TABLE (id int8, nome text, whatsapp_name text, name_source text)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_phone_digits text;
BEGIN
  -- Strip all non-digits from input
  v_phone_digits := regexp_replace(p_phone, '\D', '', 'g');
  
  -- If empty, return nothing
  IF v_phone_digits IS NULL OR length(v_phone_digits) < 8 THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT l.id, l.nome, l.whatsapp_name, l.name_source
  FROM leads l
  WHERE l.user_id = p_user_id
  AND (
      regexp_replace(l.telefone, '\D', '', 'g') = v_phone_digits
      OR
      (length(regexp_replace(l.telefone, '\D', '', 'g')) > length(v_phone_digits) 
       AND regexp_replace(l.telefone, '\D', '', 'g') LIKE '%' || v_phone_digits)
      OR
      (length(v_phone_digits) > length(regexp_replace(l.telefone, '\D', '', 'g')) 
       AND v_phone_digits LIKE '%' || regexp_replace(l.telefone, '\D', '', 'g'))
  )
  ORDER BY l.created_at DESC
  LIMIT 1;
END;
$$;

-- Schema Updates for Name Source
ALTER TABLE leads ADD COLUMN IF NOT EXISTS whatsapp_name text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS name_source text DEFAULT 'whatsapp'; 
ALTER TABLE leads ADD COLUMN IF NOT EXISTS name_updated_at timestamptz DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_leads_user_phone ON leads(user_id, telefone);

-- Migrate legacy data
UPDATE leads 
SET name_source = 'manual' 
WHERE name_manually_changed = true 
  AND (name_source IS NULL OR name_source = 'whatsapp');
