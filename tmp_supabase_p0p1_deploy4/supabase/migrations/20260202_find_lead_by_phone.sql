-- Function to find a lead by phone number, normalizing inputs
CREATE OR REPLACE FUNCTION public.find_lead_by_phone(p_user_id UUID, p_phone TEXT)
RETURNS TABLE (id BIGINT, nome TEXT) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT l.id, l.nome
  FROM leads l
  WHERE l.user_id = p_user_id
    AND (
      l.telefone = p_phone
      OR l.telefone LIKE '%' || p_phone
      OR p_phone LIKE '%' || l.telefone
    )
  LIMIT 1;
END;
$$;
