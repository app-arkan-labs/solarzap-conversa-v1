-- ============================================================
-- M0 HARDENING — SolarZap
-- Generated: 2026-02-18
-- Pre-check results:
--   PC1: zero duplicate instance_names → UNIQUE safe
--   PC2: created_by exists in: kb_items, testimonials
--        NOT in: kb_assets, asset_annotations, company_profile, objection_responses
--   PC3: AI tables have USING(true); KB tables have auth.role()='authenticated'
--   PC4: claim_due_reminders has no explicit authenticated GRANT
-- ============================================================

-- ============================================================
-- STEP 1: whatsapp_webhook_events — RLS + REVOKE anon/authenticated
-- ============================================================
ALTER TABLE public.whatsapp_webhook_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.whatsapp_webhook_events FROM anon;
REVOKE ALL ON public.whatsapp_webhook_events FROM authenticated;

DROP POLICY IF EXISTS "service_role_only" ON public.whatsapp_webhook_events;
CREATE POLICY "service_role_only"
  ON public.whatsapp_webhook_events
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ============================================================
-- STEP 2: UNIQUE(instance_name) global on whatsapp_instances
-- (existing constraint is UNIQUE(user_id, instance_name) — not global)
-- ============================================================
ALTER TABLE public.whatsapp_instances
  ADD CONSTRAINT uq_instance_name_global UNIQUE (instance_name);

-- ============================================================
-- STEP 3: AI tables — drop permissive USING(true), restrict write to service_role
-- ============================================================

-- 3.1 ai_settings
DROP POLICY IF EXISTS "Allow full access to ai_settings" ON public.ai_settings;
CREATE POLICY "ai_settings_auth_read"
  ON public.ai_settings FOR SELECT
  USING (auth.role() IN ('authenticated', 'service_role'));
CREATE POLICY "ai_settings_svc_write"
  ON public.ai_settings FOR INSERT
  WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "ai_settings_svc_update"
  ON public.ai_settings FOR UPDATE
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "ai_settings_svc_delete"
  ON public.ai_settings FOR DELETE
  USING (auth.role() = 'service_role');

-- 3.2 ai_stage_config
DROP POLICY IF EXISTS "Allow full access to ai_stage_config" ON public.ai_stage_config;
CREATE POLICY "ai_stage_config_auth_read"
  ON public.ai_stage_config FOR SELECT
  USING (auth.role() IN ('authenticated', 'service_role'));
CREATE POLICY "ai_stage_config_svc_write"
  ON public.ai_stage_config FOR INSERT
  WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "ai_stage_config_svc_update"
  ON public.ai_stage_config FOR UPDATE
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "ai_stage_config_svc_delete"
  ON public.ai_stage_config FOR DELETE
  USING (auth.role() = 'service_role');

-- 3.3 ai_action_logs
DROP POLICY IF EXISTS "Allow full access to ai_action_logs" ON public.ai_action_logs;
CREATE POLICY "ai_action_logs_auth_read"
  ON public.ai_action_logs FOR SELECT
  USING (auth.role() IN ('authenticated', 'service_role'));
CREATE POLICY "ai_action_logs_svc_write"
  ON public.ai_action_logs FOR INSERT
  WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "ai_action_logs_svc_update"
  ON public.ai_action_logs FOR UPDATE
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "ai_action_logs_svc_delete"
  ON public.ai_action_logs FOR DELETE
  USING (auth.role() = 'service_role');

-- 3.4 ai_agent_runs
DROP POLICY IF EXISTS "Allow full access to ai_agent_runs" ON public.ai_agent_runs;
CREATE POLICY "ai_agent_runs_auth_read"
  ON public.ai_agent_runs FOR SELECT
  USING (auth.role() IN ('authenticated', 'service_role'));
CREATE POLICY "ai_agent_runs_svc_write"
  ON public.ai_agent_runs FOR INSERT
  WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "ai_agent_runs_svc_update"
  ON public.ai_agent_runs FOR UPDATE
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "ai_agent_runs_svc_delete"
  ON public.ai_agent_runs FOR DELETE
  USING (auth.role() = 'service_role');

-- 3.5 ai_summaries
DROP POLICY IF EXISTS "Allow full access to ai_summaries" ON public.ai_summaries;
CREATE POLICY "ai_summaries_auth_read"
  ON public.ai_summaries FOR SELECT
  USING (auth.role() IN ('authenticated', 'service_role'));
CREATE POLICY "ai_summaries_svc_write"
  ON public.ai_summaries FOR INSERT
  WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "ai_summaries_svc_update"
  ON public.ai_summaries FOR UPDATE
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "ai_summaries_svc_delete"
  ON public.ai_summaries FOR DELETE
  USING (auth.role() = 'service_role');

-- ============================================================
-- STEP 4: KB tables — hardening temporário (pré-org)
-- PC2 result: created_by EXISTS in: kb_items, testimonials
--             DOES NOT EXIST in: kb_assets, asset_annotations, company_profile, objection_responses
-- ============================================================

-- 4.1 kb_items (HAS created_by)
DROP POLICY IF EXISTS "Enable all for authenticated" ON public.kb_items;
CREATE POLICY "kb_items_owner"
  ON public.kb_items FOR ALL
  USING (auth.uid() = created_by)
  WITH CHECK (auth.uid() = created_by);
CREATE POLICY "kb_items_svc"
  ON public.kb_items FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- 4.2 testimonials (HAS created_by)
DROP POLICY IF EXISTS "Enable all for authenticated" ON public.testimonials;
CREATE POLICY "testimonials_owner"
  ON public.testimonials FOR ALL
  USING (auth.uid() = created_by)
  WITH CHECK (auth.uid() = created_by);
CREATE POLICY "testimonials_svc"
  ON public.testimonials FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- 4.3 kb_assets / asset_annotations removed (tables do not exist)


-- 4.5 company_profile (NO created_by — existing policy: auth.role()='authenticated' ALL → restrict write)
DROP POLICY IF EXISTS "Users can manage company_profile" ON public.company_profile;
CREATE POLICY "company_profile_auth_read"
  ON public.company_profile FOR SELECT
  USING (auth.role() = 'authenticated');
CREATE POLICY "company_profile_svc"
  ON public.company_profile FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- 4.6 objection_responses (NO created_by — existing policy: auth.role()='authenticated' ALL → restrict write)
DROP POLICY IF EXISTS "Users can manage objection_responses" ON public.objection_responses;
CREATE POLICY "objection_responses_auth_read"
  ON public.objection_responses FOR SELECT
  USING (auth.role() = 'authenticated');
CREATE POLICY "objection_responses_svc"
  ON public.objection_responses FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ============================================================
-- STEP 5: RPCs SECURITY DEFINER
-- hard_delete_thread IS used in frontend (useLeads.ts:416) → app-facing → patch body
-- find_lead_by_phone → app-facing → patch body
-- upsert_lead_canonical → app-facing → patch body
-- claim_due_reminders → backend-only → REVOKE (defensive)
-- ============================================================

-- 5.1 REVOKE claim_due_reminders from authenticated (defensive — no-op if not granted)
DO $$
BEGIN
  REVOKE EXECUTE ON FUNCTION public.claim_due_reminders(int) FROM authenticated;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'claim_due_reminders REVOKE: %', SQLERRM;
END $$;

-- 5.2 find_lead_by_phone — add auth.uid() check at top
CREATE OR REPLACE FUNCTION public.find_lead_by_phone(p_user_id uuid, p_phone text)
RETURNS TABLE(id bigint, nome text)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- M0 SECURITY: caller must match p_user_id (service_role has auth.uid()=NULL → skip)
  IF auth.uid() IS NOT NULL AND p_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized: p_user_id must match auth.uid()';
  END IF;

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

-- 5.3 hard_delete_thread — ACTUAL SIGNATURE: (p_user_id uuid, p_instance_name text, p_phone_e164 text)
-- Verified via pg_get_functiondef. Adding auth.uid() check at top; body preserved exactly.
CREATE OR REPLACE FUNCTION public.hard_delete_thread(
  p_user_id uuid,
  p_instance_name text,
  p_phone_e164 text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- M0 SECURITY: caller must match p_user_id (service_role has auth.uid()=NULL → skip)
  IF auth.uid() IS NOT NULL AND p_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized: p_user_id must match auth.uid()';
  END IF;

  -- Original body preserved exactly:
  INSERT INTO deleted_threads (user_id, instance_name, phone_e164)
  VALUES (p_user_id, COALESCE(p_instance_name, ''), p_phone_e164)
  ON CONFLICT (user_id, instance_name, phone_e164) DO UPDATE
    SET deleted_at = NOW();

  DELETE FROM interacoes
  WHERE user_id = p_user_id
    AND phone_e164 = p_phone_e164;

  DELETE FROM interacoes i
  USING leads l
  WHERE i.lead_id = l.id
    AND l.user_id = p_user_id
    AND l.phone_e164 = p_phone_e164;

  DELETE FROM public.appointments a
  USING leads l
  WHERE a.lead_id = l.id
    AND l.user_id = p_user_id
    AND l.phone_e164 = p_phone_e164;

  DELETE FROM leads
  WHERE user_id = p_user_id
    AND phone_e164 = p_phone_e164;
END;
$$;

-- 5.4 upsert_lead_canonical — add auth.uid() check at top
CREATE OR REPLACE FUNCTION public.upsert_lead_canonical(
    p_user_id uuid,
    p_instance_name text,
    p_phone_e164 text,
    p_telefone text,
    p_name text DEFAULT NULL::text,
    p_push_name text DEFAULT NULL::text,
    p_source text DEFAULT 'whatsapp'::text
) RETURNS TABLE(id bigint, created_at timestamp with time zone, updated_at timestamp with time zone)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_lead_id BIGINT;
    v_created_at TIMESTAMP WITH TIME ZONE;
    v_updated_at TIMESTAMP WITH TIME ZONE;
    v_tombstone_exists BOOLEAN;
BEGIN
    -- M0 SECURITY: caller must match p_user_id (service_role has auth.uid()=NULL → skip)
    IF auth.uid() IS NOT NULL AND p_user_id != auth.uid() THEN
      RAISE EXCEPTION 'Unauthorized: p_user_id must match auth.uid()';
    END IF;

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

    -- 3. If still not found, check tombstone before creating
    IF v_lead_id IS NULL THEN
        -- Check if this thread was deleted (tombstone exists)
        SELECT EXISTS (
            SELECT 1 FROM deleted_threads
            WHERE user_id = p_user_id
              AND phone_e164 = p_phone_e164
              AND deleted_at > NOW() - INTERVAL '30 days'  -- Tombstone valid for 30 days
        ) INTO v_tombstone_exists;
        
        IF v_tombstone_exists THEN
            -- Delete the tombstone to allow fresh start
            DELETE FROM deleted_threads
            WHERE user_id = p_user_id
              AND phone_e164 = p_phone_e164;
            
            -- Log that we're creating fresh lead after tombstone
            RAISE NOTICE 'Creating fresh lead for phone % after tombstone deletion', p_phone_e164;
        END IF;
        
        -- INSERT new lead (whether tombstone existed or not)
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

-- ============================================================
-- END OF M0 HARDENING
-- Run verification gates after applying this file.
-- ============================================================
