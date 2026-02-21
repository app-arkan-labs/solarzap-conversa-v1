-- Backfill orphan interactions (lead_id IS NULL) by recreating/attaching canonical lead.
-- Safe to run multiple times.

DO $$
DECLARE
    r RECORD;
    v_lead_id BIGINT;
BEGIN
    FOR r IN
        SELECT DISTINCT
            i.user_id,
            COALESCE(i.instance_name, '') AS instance_name,
            i.phone_e164
        FROM interacoes i
        WHERE i.lead_id IS NULL
          AND i.user_id IS NOT NULL
          AND i.phone_e164 IS NOT NULL
    LOOP
        BEGIN
            SELECT x.id
              INTO v_lead_id
            FROM upsert_lead_canonical(
                r.user_id,
                r.instance_name,
                r.phone_e164,
                r.phone_e164,
                NULL,
                NULL,
                'whatsapp'
            ) x
            LIMIT 1;

            IF v_lead_id IS NOT NULL THEN
                UPDATE interacoes
                SET lead_id = v_lead_id
                WHERE lead_id IS NULL
                  AND user_id = r.user_id
                  AND COALESCE(instance_name, '') = r.instance_name
                  AND phone_e164 = r.phone_e164;
            END IF;
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'backfill_interacoes_lead_id skipped (user %, instance %, phone %): %',
                r.user_id, r.instance_name, r.phone_e164, SQLERRM;
        END;
    END LOOP;
END $$;

-- Quick post-check
SELECT
    COUNT(*) FILTER (WHERE lead_id IS NULL) AS interacoes_sem_lead,
    COUNT(*) FILTER (WHERE lead_id IS NOT NULL) AS interacoes_com_lead
FROM interacoes;
