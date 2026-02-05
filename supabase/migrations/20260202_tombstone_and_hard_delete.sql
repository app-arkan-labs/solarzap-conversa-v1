-- =============================================
-- TOMBSTONE TABLE AND HARD DELETE FOR THREAD-BASED DELETION
-- This migration fixes the "zombie lead" issue where deleted leads reappear
-- =============================================

-- 1. Tombstone table for deleted threads
CREATE TABLE IF NOT EXISTS deleted_threads (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  instance_name TEXT,
  phone_e164 TEXT NOT NULL,
  deleted_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, instance_name, phone_e164)
);

-- Enable RLS on tombstone table
ALTER TABLE deleted_threads ENABLE ROW LEVEL SECURITY;

-- RLS policy for tombstone table
CREATE POLICY "Users can manage their own tombstones"
  ON deleted_threads
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 2. Hard delete function by thread key (user_id, instance_name, phone_e164)
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
  
  -- 3. Delete lead(s) by phone
  DELETE FROM leads
  WHERE user_id = p_user_id
    AND phone_e164 = p_phone_e164;
END;
$$;

-- 3. Unique constraint on wa_message_id for idempotency (prevents duplicate messages)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'interacoes_instance_wa_message_unique'
  ) THEN
    CREATE UNIQUE INDEX interacoes_instance_wa_message_unique 
    ON interacoes(instance_name, wa_message_id) 
    WHERE wa_message_id IS NOT NULL;
  END IF;
END $$;

-- 4. Grant execute on the new function
GRANT EXECUTE ON FUNCTION hard_delete_thread(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION hard_delete_thread(UUID, TEXT, TEXT) TO service_role;
