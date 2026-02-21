-- Hotfix: ensure upsert_lead_canonical can create new leads when leads.org_id is NOT NULL.
-- Root cause observed in production:
--   null value in column "org_id" violates not-null constraint
-- This restores lead creation for inbound WhatsApp messages.

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
    v_org_id UUID;
BEGIN
    -- Caller guard (service_role has auth.uid() = NULL and bypasses this check)
    IF auth.uid() IS NOT NULL AND p_user_id != auth.uid() THEN
      RAISE EXCEPTION 'Unauthorized: p_user_id must match auth.uid()';
    END IF;

    -- 1) Try exact E164 match
    SELECT l.id, l.created_at, l.updated_at, l.org_id
      INTO v_lead_id, v_created_at, v_updated_at, v_org_id
    FROM leads l
    WHERE l.user_id = p_user_id
      AND l.phone_e164 = p_phone_e164
    LIMIT 1;

    -- 2) Fallback by legacy telefone
    IF v_lead_id IS NULL AND p_telefone IS NOT NULL THEN
        SELECT l.id, l.created_at, l.updated_at, l.org_id
          INTO v_lead_id, v_created_at, v_updated_at, v_org_id
        FROM leads l
        WHERE l.user_id = p_user_id
          AND l.telefone = p_telefone
        LIMIT 1;
    END IF;

    -- 3) For inserts, resolve org_id before creating
    IF v_lead_id IS NULL THEN
        IF v_org_id IS NULL THEN
            SELECT wi.org_id
              INTO v_org_id
            FROM whatsapp_instances wi
            WHERE wi.user_id = p_user_id
              AND wi.instance_name = p_instance_name
            LIMIT 1;
        END IF;

        IF v_org_id IS NULL THEN
            SELECT l.org_id
              INTO v_org_id
            FROM leads l
            WHERE l.user_id = p_user_id
              AND l.org_id IS NOT NULL
            ORDER BY l.updated_at DESC NULLS LAST
            LIMIT 1;
        END IF;

        IF v_org_id IS NULL THEN
            SELECT om.org_id
              INTO v_org_id
            FROM organization_members om
            WHERE om.user_id = p_user_id
            LIMIT 1;
        END IF;

        IF v_org_id IS NULL THEN
            RAISE EXCEPTION 'upsert_lead_canonical: unable to resolve org_id for user % (instance %)', p_user_id, p_instance_name;
        END IF;
    END IF;

    -- 4) Respect tombstone, but allow recreation
    IF v_lead_id IS NULL THEN
        SELECT EXISTS (
            SELECT 1
            FROM deleted_threads
            WHERE user_id = p_user_id
              AND phone_e164 = p_phone_e164
              AND deleted_at > NOW() - INTERVAL '30 days'
        ) INTO v_tombstone_exists;

        IF v_tombstone_exists THEN
            DELETE FROM deleted_threads
            WHERE user_id = p_user_id
              AND phone_e164 = p_phone_e164;
        END IF;

        INSERT INTO leads (
            org_id,
            user_id,
            assigned_to_user_id,
            instance_name,
            phone_e164,
            telefone,
            nome,
            source,
            created_at,
            updated_at
        ) VALUES (
            v_org_id,
            p_user_id,
            p_user_id,
            p_instance_name,
            p_phone_e164,
            p_telefone,
            COALESCE(p_name, p_push_name, p_telefone),
            p_source,
            NOW(),
            NOW()
        )
        RETURNING leads.id, leads.created_at, leads.updated_at
        INTO v_lead_id, v_created_at, v_updated_at;

    ELSE
        UPDATE leads
        SET
            updated_at = NOW(),
            instance_name = COALESCE(leads.instance_name, p_instance_name),
            org_id = COALESCE(leads.org_id, v_org_id),
            assigned_to_user_id = COALESCE(leads.assigned_to_user_id, p_user_id),
            nome = CASE
                WHEN leads.nome = leads.telefone AND p_push_name IS NOT NULL THEN p_push_name
                ELSE leads.nome
            END
        WHERE leads.id = v_lead_id
        RETURNING leads.updated_at
        INTO v_updated_at;
    END IF;

    RETURN QUERY SELECT v_lead_id, v_created_at, v_updated_at;
END;
$$;
