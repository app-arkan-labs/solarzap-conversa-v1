-- =============================================
-- FIX: Add outcome column and completed status to appointments
-- Also update hard_delete_thread to handle appointments
-- =============================================

-- 1. Add outcome column to appointments table
ALTER TABLE public.appointments 
ADD COLUMN IF NOT EXISTS outcome TEXT;

-- 2. Drop the old status constraint and add a new one that includes 'completed'
ALTER TABLE public.appointments 
DROP CONSTRAINT IF EXISTS appointments_status_check;

ALTER TABLE public.appointments 
ADD CONSTRAINT appointments_status_check 
CHECK (status IN ('scheduled', 'confirmed', 'done', 'canceled', 'no_show', 'completed'));

-- 3. Update hard_delete_thread to explicitly delete appointments before leads
-- This ensures appointments are properly cleaned up even if CASCADE has issues
CREATE OR REPLACE FUNCTION hard_delete_thread(
  p_user_id UUID,
  p_instance_name TEXT,
  p_phone_e164 TEXT
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- 1. Insert tombstone to prevent resurrection
  INSERT INTO deleted_threads (user_id, instance_name, phone_e164)
  VALUES (p_user_id, COALESCE(p_instance_name, ''), p_phone_e164)
  ON CONFLICT (user_id, instance_name, phone_e164) DO UPDATE
    SET deleted_at = NOW();
  
  -- 2. Delete all interacoes by thread key (not just lead_id)
  DELETE FROM interacoes
  WHERE user_id = p_user_id
    AND phone_e164 = p_phone_e164;
  
  -- Also delete by telefone for legacy data
  DELETE FROM interacoes i
  USING leads l
  WHERE i.lead_id = l.id
    AND l.user_id = p_user_id
    AND l.phone_e164 = p_phone_e164;
  
  -- 3. Delete appointments related to leads with this phone (NEW!)
  DELETE FROM public.appointments a
  USING leads l
  WHERE a.lead_id = l.id
    AND l.user_id = p_user_id
    AND l.phone_e164 = p_phone_e164;
  
  -- 4. Delete lead(s) by phone
  DELETE FROM leads
  WHERE user_id = p_user_id
    AND phone_e164 = p_phone_e164;
END;
$$;

-- Grant execute on updated function
GRANT EXECUTE ON FUNCTION hard_delete_thread(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION hard_delete_thread(UUID, TEXT, TEXT) TO service_role;
