DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM internal_crm.clients
    WHERE linked_public_org_id IS NOT NULL
      AND primary_phone IS NOT NULL
    GROUP BY linked_public_org_id, primary_phone
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'duplicate internal_crm.clients primary_phone within linked_public_org_id';
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM internal_crm.clients
    WHERE linked_public_org_id IS NULL
      AND owner_user_id IS NOT NULL
      AND primary_phone IS NOT NULL
    GROUP BY owner_user_id, primary_phone
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'duplicate internal_crm.clients primary_phone within owner_user_id fallback scope';
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_internal_crm_client_contacts_phone_updated
  ON internal_crm.client_contacts (phone, updated_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_internal_crm_clients_org_phone_unique
  ON internal_crm.clients (linked_public_org_id, primary_phone)
  WHERE linked_public_org_id IS NOT NULL
    AND primary_phone IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_internal_crm_clients_owner_phone_unique
  ON internal_crm.clients (owner_user_id, primary_phone)
  WHERE linked_public_org_id IS NULL
    AND owner_user_id IS NOT NULL
    AND primary_phone IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_internal_crm_clients_org_email_lookup
  ON internal_crm.clients (linked_public_org_id, primary_email, updated_at DESC)
  WHERE linked_public_org_id IS NOT NULL
    AND primary_email IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_internal_crm_clients_owner_email_lookup
  ON internal_crm.clients (owner_user_id, primary_email, updated_at DESC)
  WHERE linked_public_org_id IS NULL
    AND owner_user_id IS NOT NULL
    AND primary_email IS NOT NULL;