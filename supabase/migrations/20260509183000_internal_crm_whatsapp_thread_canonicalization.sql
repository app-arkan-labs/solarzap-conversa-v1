-- Internal CRM only: canonical WhatsApp thread identity and duplicate cleanup.

ALTER TABLE internal_crm.whatsapp_instances
  ADD COLUMN IF NOT EXISTS owner_user_id uuid,
  ADD COLUMN IF NOT EXISTS linked_public_org_id uuid;

ALTER TABLE internal_crm.conversations
  ADD COLUMN IF NOT EXISTS remote_jid text,
  ADD COLUMN IF NOT EXISTS contact_phone text,
  ADD COLUMN IF NOT EXISTS merged_into_conversation_id uuid REFERENCES internal_crm.conversations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS merged_at timestamptz;

ALTER TABLE internal_crm.clients
  ADD COLUMN IF NOT EXISTS merged_into_client_id uuid REFERENCES internal_crm.clients(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS merged_at timestamptz;

DROP INDEX IF EXISTS internal_crm.idx_internal_crm_conversations_active_whatsapp_unique;
DROP INDEX IF EXISTS internal_crm.idx_internal_crm_clients_org_phone_unique;
DROP INDEX IF EXISTS internal_crm.idx_internal_crm_clients_owner_phone_unique;

CREATE OR REPLACE FUNCTION internal_crm.normalize_whatsapp_phone(p_value text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_digits text;
BEGIN
  v_digits := regexp_replace(COALESCE(p_value, ''), '\D', '', 'g');
  IF v_digits = '' THEN
    RETURN NULL;
  END IF;

  IF length(v_digits) IN (10, 11) AND left(v_digits, 2) <> '55' THEN
    RETURN '55' || v_digits;
  END IF;

  RETURN v_digits;
END;
$$;

CREATE OR REPLACE FUNCTION internal_crm.normalize_whatsapp_remote_jid(p_value text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_raw text;
  v_bare text;
  v_phone text;
BEGIN
  v_raw := lower(trim(COALESCE(p_value, '')));
  IF v_raw = '' THEN
    RETURN NULL;
  END IF;

  IF v_raw = 'status@broadcast'
    OR v_raw LIKE '%@g.us'
    OR v_raw LIKE '%@broadcast'
  THEN
    RETURN NULL;
  END IF;

  v_bare := split_part(v_raw, '@', 1);
  v_bare := regexp_replace(v_bare, ':\d+$', '');
  v_phone := internal_crm.normalize_whatsapp_phone(v_bare);

  IF v_phone IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN v_phone || '@s.whatsapp.net';
END;
$$;

CREATE OR REPLACE FUNCTION internal_crm.stage_rank(p_stage_code text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE COALESCE(p_stage_code, '')
    WHEN 'fechou_contrato' THEN 100
    WHEN 'contrato_assinado' THEN 95
    WHEN 'negociacao' THEN 85
    WHEN 'proposta_pronta' THEN 75
    WHEN 'reuniao_agendada' THEN 65
    WHEN 'chamada_agendada' THEN 60
    WHEN 'respondeu' THEN 35
    WHEN 'novo_lead' THEN 10
    ELSE 0
  END;
$$;

DO $$
DECLARE
  v_owner_user_id uuid;
BEGIN
  IF to_regclass('public._admin_system_admins') IS NOT NULL THEN
    EXECUTE $sql$
      SELECT user_id
      FROM public._admin_system_admins
      WHERE crm_role = 'owner'
      ORDER BY user_id
      LIMIT 1
    $sql$ INTO v_owner_user_id;
  END IF;

  IF v_owner_user_id IS NOT NULL THEN
    UPDATE internal_crm.whatsapp_instances
    SET owner_user_id = COALESCE(owner_user_id, v_owner_user_id),
        updated_at = now()
    WHERE owner_user_id IS NULL;
  END IF;
END;
$$;

UPDATE internal_crm.clients
SET primary_phone = internal_crm.normalize_whatsapp_phone(primary_phone)
WHERE primary_phone IS NOT NULL
  AND internal_crm.normalize_whatsapp_phone(primary_phone) IS NOT NULL
  AND primary_phone IS DISTINCT FROM internal_crm.normalize_whatsapp_phone(primary_phone);

UPDATE internal_crm.client_contacts
SET phone = internal_crm.normalize_whatsapp_phone(phone)
WHERE phone IS NOT NULL
  AND internal_crm.normalize_whatsapp_phone(phone) IS NOT NULL
  AND phone IS DISTINCT FROM internal_crm.normalize_whatsapp_phone(phone);

WITH latest_message AS (
  SELECT DISTINCT ON (conversation_id)
    conversation_id,
    remote_jid
  FROM internal_crm.messages
  WHERE remote_jid IS NOT NULL
  ORDER BY conversation_id, created_at DESC, id DESC
),
conversation_identity AS (
  SELECT
    c.id AS conversation_id,
    c.remote_jid AS current_remote_jid,
    c.contact_phone AS current_contact_phone,
    latest_message.remote_jid AS latest_remote_jid,
    cl.primary_phone
  FROM internal_crm.conversations AS c
  JOIN internal_crm.clients AS cl ON cl.id = c.client_id
  LEFT JOIN latest_message ON latest_message.conversation_id = c.id
  WHERE c.merged_into_conversation_id IS NULL
)
UPDATE internal_crm.conversations AS c
SET remote_jid = COALESCE(
      internal_crm.normalize_whatsapp_remote_jid(conversation_identity.current_remote_jid),
      internal_crm.normalize_whatsapp_remote_jid(conversation_identity.latest_remote_jid),
      internal_crm.normalize_whatsapp_remote_jid(conversation_identity.primary_phone)
    ),
    contact_phone = COALESCE(
      internal_crm.normalize_whatsapp_phone(conversation_identity.current_contact_phone),
      internal_crm.normalize_whatsapp_phone(conversation_identity.primary_phone),
      internal_crm.normalize_whatsapp_phone(conversation_identity.latest_remote_jid)
    )
FROM conversation_identity
WHERE conversation_identity.conversation_id = c.id;

WITH latest_scope AS (
  SELECT DISTINCT ON (c.client_id)
    c.client_id,
    wi.owner_user_id,
    wi.linked_public_org_id
  FROM internal_crm.conversations AS c
  JOIN internal_crm.whatsapp_instances AS wi ON wi.id = c.whatsapp_instance_id
  WHERE c.client_id IS NOT NULL
    AND (wi.owner_user_id IS NOT NULL OR wi.linked_public_org_id IS NOT NULL)
  ORDER BY c.client_id, c.updated_at DESC, c.created_at DESC
)
UPDATE internal_crm.clients AS cl
SET owner_user_id = COALESCE(cl.owner_user_id, latest_scope.owner_user_id),
    linked_public_org_id = COALESCE(cl.linked_public_org_id, latest_scope.linked_public_org_id),
    updated_at = now()
FROM latest_scope
WHERE latest_scope.client_id = cl.id
  AND (cl.owner_user_id IS NULL OR cl.linked_public_org_id IS NULL);

CREATE TEMP TABLE _internal_crm_client_merge_map ON COMMIT DROP AS
WITH message_stats AS (
  SELECT
    c.client_id,
    count(m.id) AS message_count,
    max(m.created_at) AS latest_message_at
  FROM internal_crm.conversations AS c
  LEFT JOIN internal_crm.messages AS m ON m.conversation_id = c.id
  GROUP BY c.client_id
),
base AS (
  SELECT
    cl.*,
    COALESCE(cl.linked_public_org_id::text, 'owner:' || cl.owner_user_id::text) AS scope_key,
    COALESCE(message_stats.message_count, 0) AS message_count,
    message_stats.latest_message_at
  FROM internal_crm.clients AS cl
  LEFT JOIN message_stats ON message_stats.client_id = cl.id
  WHERE cl.primary_phone IS NOT NULL
    AND cl.merged_into_client_id IS NULL
    AND (cl.linked_public_org_id IS NOT NULL OR cl.owner_user_id IS NOT NULL)
),
ranked AS (
  SELECT
    base.*,
    first_value(id) OVER (
      PARTITION BY scope_key, primary_phone
      ORDER BY
        message_count DESC,
        internal_crm.stage_rank(current_stage_code) DESC,
        COALESCE(latest_message_at, updated_at, created_at) DESC,
        updated_at DESC,
        id DESC
    ) AS canonical_client_id
  FROM base
)
SELECT
  id AS duplicate_client_id,
  canonical_client_id,
  primary_phone,
  scope_key
FROM ranked
WHERE id <> canonical_client_id;

WITH grouped_clients AS (
  SELECT
    canonical_client_id,
    max(last_contact_at) AS best_last_contact_at,
    (array_agg(company_name ORDER BY
      CASE
        WHEN trim(COALESCE(company_name, '')) IN ('', '.', '-') THEN 1
        WHEN company_name = primary_phone THEN 1
        ELSE 0
      END,
      updated_at DESC
    ))[1] AS best_company_name,
    (array_agg(primary_contact_name ORDER BY
      CASE
        WHEN trim(COALESCE(primary_contact_name, '')) IN ('', '.', '-') THEN 1
        WHEN primary_contact_name = primary_phone THEN 1
        ELSE 0
      END,
      updated_at DESC
    ))[1] AS best_contact_name,
    (array_agg(current_stage_code ORDER BY internal_crm.stage_rank(current_stage_code) DESC, updated_at DESC))[1] AS best_stage_code
  FROM (
    SELECT canonical_client_id, c.*
    FROM _internal_crm_client_merge_map AS m
    JOIN internal_crm.clients AS c ON c.id = m.duplicate_client_id
    UNION ALL
    SELECT DISTINCT m.canonical_client_id, c.*
    FROM _internal_crm_client_merge_map AS m
    JOIN internal_crm.clients AS c ON c.id = m.canonical_client_id
  ) AS merged_group
  GROUP BY canonical_client_id
)
UPDATE internal_crm.clients AS c
SET company_name = CASE
      WHEN trim(COALESCE(c.company_name, '')) IN ('', '.', '-') OR c.company_name = c.primary_phone
        THEN COALESCE(NULLIF(grouped_clients.best_company_name, ''), c.company_name)
      ELSE c.company_name
    END,
    primary_contact_name = CASE
      WHEN trim(COALESCE(c.primary_contact_name, '')) IN ('', '.', '-') OR c.primary_contact_name = c.primary_phone
        THEN COALESCE(NULLIF(grouped_clients.best_contact_name, ''), c.primary_contact_name)
      ELSE c.primary_contact_name
    END,
    current_stage_code = COALESCE(grouped_clients.best_stage_code, c.current_stage_code),
    last_contact_at = COALESCE(GREATEST(c.last_contact_at, grouped_clients.best_last_contact_at), c.last_contact_at, grouped_clients.best_last_contact_at),
    updated_at = now()
FROM grouped_clients
WHERE grouped_clients.canonical_client_id = c.id;

UPDATE internal_crm.deals AS t
SET client_id = m.canonical_client_id,
    updated_at = now()
FROM _internal_crm_client_merge_map AS m
WHERE t.client_id = m.duplicate_client_id;

UPDATE internal_crm.tasks AS t
SET client_id = m.canonical_client_id,
    updated_at = now()
FROM _internal_crm_client_merge_map AS m
WHERE t.client_id = m.duplicate_client_id;

UPDATE internal_crm.appointments AS t
SET client_id = m.canonical_client_id,
    updated_at = now()
FROM _internal_crm_client_merge_map AS m
WHERE t.client_id = m.duplicate_client_id;

UPDATE internal_crm.stage_history AS t
SET client_id = m.canonical_client_id
FROM _internal_crm_client_merge_map AS m
WHERE t.client_id = m.duplicate_client_id;

UPDATE internal_crm.client_notes AS t
SET client_id = m.canonical_client_id
FROM _internal_crm_client_merge_map AS m
WHERE t.client_id = m.duplicate_client_id;

UPDATE internal_crm.broadcast_recipients AS t
SET client_id = m.canonical_client_id,
    updated_at = now()
FROM _internal_crm_client_merge_map AS m
WHERE t.client_id = m.duplicate_client_id;

UPDATE internal_crm.scheduled_agent_jobs AS t
SET client_id = m.canonical_client_id,
    updated_at = now()
FROM _internal_crm_client_merge_map AS m
WHERE t.client_id = m.duplicate_client_id;

UPDATE internal_crm.ai_action_logs AS t
SET client_id = m.canonical_client_id
FROM _internal_crm_client_merge_map AS m
WHERE t.client_id = m.duplicate_client_id;

UPDATE internal_crm.automation_runs AS t
SET client_id = m.canonical_client_id,
    updated_at = now()
FROM _internal_crm_client_merge_map AS m
WHERE t.client_id = m.duplicate_client_id;

UPDATE internal_crm.orders AS t
SET client_id = m.canonical_client_id,
    updated_at = now()
FROM _internal_crm_client_merge_map AS m
WHERE t.client_id = m.duplicate_client_id;

UPDATE internal_crm.subscriptions AS t
SET client_id = m.canonical_client_id,
    updated_at = now()
FROM _internal_crm_client_merge_map AS m
WHERE t.client_id = m.duplicate_client_id;

UPDATE internal_crm.landing_form_sessions AS t
SET internal_client_id = m.canonical_client_id,
    updated_at = now()
FROM _internal_crm_client_merge_map AS m
WHERE t.internal_client_id = m.duplicate_client_id;

UPDATE internal_crm.tracking_bridge AS t
SET internal_client_id = m.canonical_client_id,
    last_synced_at = now()
FROM _internal_crm_client_merge_map AS m
WHERE t.internal_client_id = m.duplicate_client_id
  AND NOT EXISTS (
    SELECT 1
    FROM internal_crm.tracking_bridge AS existing
    WHERE existing.internal_client_id = m.canonical_client_id
  );

UPDATE internal_crm.customer_app_links AS t
SET client_id = m.canonical_client_id,
    updated_at = now()
FROM _internal_crm_client_merge_map AS m
WHERE t.client_id = m.duplicate_client_id
  AND NOT EXISTS (
    SELECT 1
    FROM internal_crm.customer_app_links AS existing
    WHERE existing.client_id = m.canonical_client_id
  );

UPDATE internal_crm.customer_app_snapshot AS t
SET client_id = m.canonical_client_id,
    updated_at = now()
FROM _internal_crm_client_merge_map AS m
WHERE t.client_id = m.duplicate_client_id
  AND NOT EXISTS (
    SELECT 1
    FROM internal_crm.customer_app_snapshot AS existing
    WHERE existing.client_id = m.canonical_client_id
  );

UPDATE internal_crm.conversations AS c
SET client_id = m.canonical_client_id,
    updated_at = now()
FROM _internal_crm_client_merge_map AS m
WHERE c.client_id = m.duplicate_client_id;

UPDATE internal_crm.client_contacts AS cc
SET phone = NULL,
    is_primary = false,
    notes = concat_ws(E'\n', NULLIF(cc.notes, ''), 'Merged into internal CRM client ' || m.canonical_client_id::text),
    updated_at = now()
FROM _internal_crm_client_merge_map AS m
WHERE cc.client_id = m.duplicate_client_id;

INSERT INTO internal_crm.client_contacts (client_id, name, phone, email, role_label, is_primary)
SELECT
  c.id,
  COALESCE(NULLIF(c.primary_contact_name, ''), NULLIF(c.company_name, ''), 'Contato principal'),
  c.primary_phone,
  c.primary_email,
  'Contato principal',
  NOT EXISTS (
    SELECT 1
    FROM internal_crm.client_contacts AS existing_primary
    WHERE existing_primary.client_id = c.id
      AND existing_primary.is_primary = true
  )
FROM internal_crm.clients AS c
WHERE c.primary_phone IS NOT NULL
  AND c.merged_into_client_id IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM internal_crm.client_contacts AS existing_phone
    WHERE existing_phone.client_id = c.id
      AND existing_phone.phone = c.primary_phone
  );

UPDATE internal_crm.clients AS c
SET merged_into_client_id = m.canonical_client_id,
    merged_at = now(),
    primary_phone = NULL,
    primary_email = NULL,
    notes = concat_ws(E'\n', NULLIF(c.notes, ''), 'Merged into internal CRM client ' || m.canonical_client_id::text),
    updated_at = now()
FROM _internal_crm_client_merge_map AS m
WHERE c.id = m.duplicate_client_id;

CREATE TEMP TABLE _internal_crm_conversation_merge_map ON COMMIT DROP AS
WITH base AS (
  SELECT
    c.*,
    first_value(c.id) OVER (
      PARTITION BY c.whatsapp_instance_id, c.remote_jid, c.channel
      ORDER BY
        COALESCE(c.last_message_at, c.updated_at, c.created_at) DESC,
        c.updated_at DESC,
        c.id DESC
    ) AS canonical_conversation_id
  FROM internal_crm.conversations AS c
  WHERE c.whatsapp_instance_id IS NOT NULL
    AND c.remote_jid IS NOT NULL
    AND c.merged_into_conversation_id IS NULL
)
SELECT
  id AS duplicate_conversation_id,
  canonical_conversation_id
FROM base
WHERE id <> canonical_conversation_id;

UPDATE internal_crm.messages AS msg
SET conversation_id = m.canonical_conversation_id
FROM _internal_crm_conversation_merge_map AS m
WHERE msg.conversation_id = m.duplicate_conversation_id;

UPDATE internal_crm.scheduled_agent_jobs AS t
SET conversation_id = m.canonical_conversation_id,
    updated_at = now()
FROM _internal_crm_conversation_merge_map AS m
WHERE t.conversation_id = m.duplicate_conversation_id;

UPDATE internal_crm.automation_runs AS t
SET conversation_id = m.canonical_conversation_id,
    updated_at = now()
FROM _internal_crm_conversation_merge_map AS m
WHERE t.conversation_id = m.duplicate_conversation_id;

WITH latest_message AS (
  SELECT DISTINCT ON (conversation_id)
    conversation_id,
    created_at,
    body
  FROM internal_crm.messages
  ORDER BY conversation_id, created_at DESC, id DESC
),
unread_counts AS (
  SELECT
    conversation_id,
    count(*) AS unread_count
  FROM internal_crm.messages
  WHERE direction = 'inbound'
    AND read_at IS NULL
  GROUP BY conversation_id
)
UPDATE internal_crm.conversations AS c
SET last_message_at = latest_message.created_at,
    last_message_preview = COALESCE(latest_message.body, c.last_message_preview),
    status = CASE WHEN c.status = 'archived' THEN 'open' ELSE c.status END,
    updated_at = now()
FROM latest_message
LEFT JOIN unread_counts ON unread_counts.conversation_id = latest_message.conversation_id
WHERE c.id = latest_message.conversation_id
  AND c.id IN (
    SELECT canonical_conversation_id
    FROM _internal_crm_conversation_merge_map
  );

UPDATE internal_crm.conversations AS c
SET status = 'archived',
    remote_jid = NULL,
    merged_into_conversation_id = m.canonical_conversation_id,
    merged_at = now(),
    updated_at = now()
FROM _internal_crm_conversation_merge_map AS m
WHERE c.id = m.duplicate_conversation_id;

WITH primary_contacts AS (
  SELECT DISTINCT ON (client_id)
    id,
    client_id
  FROM internal_crm.client_contacts
  WHERE is_primary = true
  ORDER BY client_id, updated_at DESC, created_at DESC
)
UPDATE internal_crm.conversations AS c
SET contact_id = primary_contacts.id,
    updated_at = now()
FROM primary_contacts
WHERE primary_contacts.client_id = c.client_id
  AND c.merged_into_conversation_id IS NULL
  AND c.contact_id IS DISTINCT FROM primary_contacts.id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_internal_crm_clients_org_phone_unique
  ON internal_crm.clients (linked_public_org_id, primary_phone)
  WHERE linked_public_org_id IS NOT NULL
    AND primary_phone IS NOT NULL
    AND merged_into_client_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_internal_crm_clients_owner_phone_unique
  ON internal_crm.clients (owner_user_id, primary_phone)
  WHERE linked_public_org_id IS NULL
    AND owner_user_id IS NOT NULL
    AND primary_phone IS NOT NULL
    AND merged_into_client_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_internal_crm_conversations_whatsapp_thread_unique
  ON internal_crm.conversations (whatsapp_instance_id, remote_jid, channel)
  WHERE whatsapp_instance_id IS NOT NULL
    AND remote_jid IS NOT NULL
    AND merged_into_conversation_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_internal_crm_conversations_remote_jid
  ON internal_crm.conversations (whatsapp_instance_id, remote_jid, updated_at DESC)
  WHERE remote_jid IS NOT NULL
    AND merged_into_conversation_id IS NULL;

CREATE OR REPLACE FUNCTION internal_crm.get_or_create_whatsapp_thread(
  p_instance_id uuid,
  p_remote_jid text,
  p_phone text,
  p_display_name text DEFAULT NULL,
  p_from_me boolean DEFAULT false,
  p_allow_create boolean DEFAULT true
)
RETURNS TABLE (
  client_id uuid,
  contact_id uuid,
  conversation_id uuid,
  owner_user_id uuid,
  linked_public_org_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = internal_crm, public
AS $$
DECLARE
  v_instance internal_crm.whatsapp_instances%ROWTYPE;
  v_remote_jid text;
  v_phone text;
  v_display_name text;
  v_client internal_crm.clients%ROWTYPE;
  v_contact internal_crm.client_contacts%ROWTYPE;
  v_conversation internal_crm.conversations%ROWTYPE;
BEGIN
  SELECT *
  INTO v_instance
  FROM internal_crm.whatsapp_instances
  WHERE id = p_instance_id;

  IF v_instance.id IS NULL THEN
    RAISE EXCEPTION 'instance_not_found' USING ERRCODE = 'P0001';
  END IF;

  IF v_instance.owner_user_id IS NULL AND v_instance.linked_public_org_id IS NULL THEN
    RAISE EXCEPTION 'instance_scope_missing' USING ERRCODE = 'P0001';
  END IF;

  v_remote_jid := internal_crm.normalize_whatsapp_remote_jid(p_remote_jid);
  v_phone := COALESCE(
    internal_crm.normalize_whatsapp_phone(p_phone),
    internal_crm.normalize_whatsapp_phone(v_remote_jid)
  );

  IF v_phone IS NULL THEN
    RAISE EXCEPTION 'missing_contact_phone' USING ERRCODE = 'P0001';
  END IF;

  IF v_remote_jid IS NULL THEN
    v_remote_jid := v_phone || '@s.whatsapp.net';
  END IF;

  v_display_name := COALESCE(NULLIF(trim(p_display_name), ''), v_phone);

  PERFORM pg_advisory_xact_lock(hashtextextended(p_instance_id::text || ':' || v_remote_jid, 0));

  IF v_instance.linked_public_org_id IS NOT NULL THEN
    SELECT *
    INTO v_client
    FROM internal_crm.clients AS c
    WHERE c.linked_public_org_id = v_instance.linked_public_org_id
      AND c.primary_phone = v_phone
      AND c.merged_into_client_id IS NULL
    ORDER BY c.updated_at DESC, c.created_at DESC
    LIMIT 1;
  END IF;

  IF v_client.id IS NULL AND v_instance.owner_user_id IS NOT NULL THEN
    SELECT *
    INTO v_client
    FROM internal_crm.clients AS c
    WHERE c.linked_public_org_id IS NULL
      AND c.owner_user_id = v_instance.owner_user_id
      AND c.primary_phone = v_phone
      AND c.merged_into_client_id IS NULL
    ORDER BY c.updated_at DESC, c.created_at DESC
    LIMIT 1;
  END IF;

  IF v_client.id IS NULL THEN
    IF NOT p_allow_create THEN
      RAISE EXCEPTION 'from_me_client_not_found' USING ERRCODE = 'P0001';
    END IF;

    BEGIN
      INSERT INTO internal_crm.clients (
        company_name,
        primary_contact_name,
        primary_phone,
        source_channel,
        owner_user_id,
        linked_public_org_id,
        current_stage_code,
        lifecycle_status,
        last_contact_at
      )
      VALUES (
        v_display_name,
        v_display_name,
        v_phone,
        'whatsapp',
        v_instance.owner_user_id,
        v_instance.linked_public_org_id,
        'novo_lead',
        'lead',
        now()
      )
      RETURNING * INTO v_client;
    EXCEPTION WHEN unique_violation THEN
      SELECT *
      INTO v_client
      FROM internal_crm.clients AS c
      WHERE c.primary_phone = v_phone
        AND c.merged_into_client_id IS NULL
        AND (
          (v_instance.linked_public_org_id IS NOT NULL AND c.linked_public_org_id = v_instance.linked_public_org_id)
          OR (
            v_instance.linked_public_org_id IS NULL
            AND c.linked_public_org_id IS NULL
            AND c.owner_user_id = v_instance.owner_user_id
          )
        )
      ORDER BY c.updated_at DESC, c.created_at DESC
      LIMIT 1;
    END;
  END IF;

  IF v_client.id IS NULL THEN
    RAISE EXCEPTION 'client_not_available' USING ERRCODE = 'P0001';
  END IF;

  UPDATE internal_crm.clients AS c
  SET primary_phone = COALESCE(c.primary_phone, v_phone),
      owner_user_id = COALESCE(c.owner_user_id, v_instance.owner_user_id),
      linked_public_org_id = COALESCE(c.linked_public_org_id, v_instance.linked_public_org_id),
      last_contact_at = now(),
      updated_at = now()
  WHERE c.id = v_client.id
  RETURNING * INTO v_client;

  SELECT *
  INTO v_contact
  FROM internal_crm.client_contacts AS cc
  WHERE cc.client_id = v_client.id
    AND cc.phone = v_phone
  ORDER BY cc.updated_at DESC, cc.created_at DESC
  LIMIT 1;

  IF v_contact.id IS NULL THEN
    SELECT *
    INTO v_contact
    FROM internal_crm.client_contacts AS cc
    WHERE cc.client_id = v_client.id
      AND cc.is_primary = true
    ORDER BY cc.updated_at DESC, cc.created_at DESC
    LIMIT 1;
  END IF;

  IF v_contact.id IS NULL THEN
    INSERT INTO internal_crm.client_contacts (
      client_id,
      name,
      phone,
      email,
      role_label,
      is_primary
    )
    VALUES (
      v_client.id,
      COALESCE(NULLIF(v_client.primary_contact_name, ''), v_display_name),
      v_phone,
      v_client.primary_email,
      'Contato principal',
      true
    )
    RETURNING * INTO v_contact;
  ELSE
    UPDATE internal_crm.client_contacts AS cc
    SET phone = COALESCE(cc.phone, v_phone),
        name = CASE
          WHEN trim(COALESCE(cc.name, '')) IN ('', '.', '-') OR cc.name = cc.phone
            THEN COALESCE(NULLIF(v_client.primary_contact_name, ''), v_display_name, cc.name)
          ELSE cc.name
        END,
        updated_at = now()
    WHERE cc.id = v_contact.id
    RETURNING * INTO v_contact;
  END IF;

  SELECT *
  INTO v_conversation
  FROM internal_crm.conversations AS c
  WHERE c.whatsapp_instance_id = v_instance.id
    AND c.remote_jid = v_remote_jid
    AND c.channel = 'whatsapp'
    AND c.merged_into_conversation_id IS NULL
  ORDER BY COALESCE(c.last_message_at, c.updated_at, c.created_at) DESC
  LIMIT 1;

  IF v_conversation.id IS NULL THEN
    BEGIN
      INSERT INTO internal_crm.conversations (
        client_id,
        contact_id,
        whatsapp_instance_id,
        channel,
        status,
        subject,
        remote_jid,
        contact_phone,
        last_message_at,
        last_message_preview
      )
      VALUES (
        v_client.id,
        v_contact.id,
        v_instance.id,
        'whatsapp',
        'open',
        COALESCE(NULLIF(v_client.company_name, ''), v_display_name),
        v_remote_jid,
        v_phone,
        now(),
        ''
      )
      RETURNING * INTO v_conversation;
    EXCEPTION WHEN unique_violation THEN
      SELECT *
      INTO v_conversation
      FROM internal_crm.conversations AS c
      WHERE c.whatsapp_instance_id = v_instance.id
        AND c.remote_jid = v_remote_jid
        AND c.channel = 'whatsapp'
        AND c.merged_into_conversation_id IS NULL
      ORDER BY COALESCE(c.last_message_at, c.updated_at, c.created_at) DESC
      LIMIT 1;
    END;
  END IF;

  IF v_conversation.id IS NULL THEN
    RAISE EXCEPTION 'conversation_not_available' USING ERRCODE = 'P0001';
  END IF;

  UPDATE internal_crm.conversations AS c
  SET client_id = v_client.id,
      contact_id = v_contact.id,
      remote_jid = v_remote_jid,
      contact_phone = v_phone,
      status = CASE WHEN NOT p_from_me AND c.status <> 'open' THEN 'open' ELSE c.status END,
      subject = COALESCE(NULLIF(c.subject, ''), NULLIF(v_client.company_name, ''), v_display_name),
      updated_at = now()
  WHERE c.id = v_conversation.id
  RETURNING * INTO v_conversation;

  RETURN QUERY SELECT
    v_client.id,
    v_contact.id,
    v_conversation.id,
    v_instance.owner_user_id,
    v_instance.linked_public_org_id;
END;
$$;

REVOKE ALL ON FUNCTION internal_crm.get_or_create_whatsapp_thread(uuid, text, text, text, boolean, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION internal_crm.get_or_create_whatsapp_thread(uuid, text, text, text, boolean, boolean) TO service_role;
