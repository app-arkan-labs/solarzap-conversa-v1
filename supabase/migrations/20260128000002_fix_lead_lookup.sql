-- FUNCTION: find_lead_by_phone (IMPROVED)
-- Description: Finds a lead by phone number, robustly handling '55' country code prefix.
-- Usage: SELECT * FROM find_lead_by_phone('user_uuid', '5511999999999');

CREATE OR REPLACE FUNCTION find_lead_by_phone(p_user_id uuid, p_phone text)
RETURNS TABLE (id int8, nome text)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_phone_digits text;
  v_phone_suffix text;
BEGIN
  -- Strip all non-digits from input
  v_phone_digits := regexp_replace(p_phone, '\D', '', 'g');
  
  -- If empty, return nothing
  IF v_phone_digits IS NULL OR length(v_phone_digits) < 8 THEN
    RETURN;
  END IF;

  -- Logic: Match if existing phone (digits only) ends with input digits OR input number ends with existing phone digits
  -- We specifically handle the common case where one has '55' and the other doesn't.
  
  RETURN QUERY
  SELECT l.id, l.nome
  FROM leads l
  WHERE l.user_id = p_user_id
  AND (
      -- Exact match of digits
      regexp_replace(l.telefone, '\D', '', 'g') = v_phone_digits
      OR
      -- Existing has 55, Input doesn't (Input is substring of Existing)
      (length(regexp_replace(l.telefone, '\D', '', 'g')) > length(v_phone_digits) 
       AND regexp_replace(l.telefone, '\D', '', 'g') LIKE '%' || v_phone_digits)
      OR
      -- Input has 55, Existing doesn't (Existing is substring of Input)
      (length(v_phone_digits) > length(regexp_replace(l.telefone, '\D', '', 'g')) 
       AND v_phone_digits LIKE '%' || regexp_replace(l.telefone, '\D', '', 'g'))
  )
  -- If multiple matches (rare), take the one with the most similar length or just the most recent
  ORDER BY l.created_at DESC
  LIMIT 1;
END;
$$;
