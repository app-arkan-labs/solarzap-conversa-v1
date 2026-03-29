-- V3.3 + V3.4 maturity: AI campaign execution and Google Calendar sync for internal CRM.

CREATE TABLE IF NOT EXISTS internal_crm.google_calendar_connections (
  user_id uuid PRIMARY KEY,
  account_email text,
  account_name text,
  access_token text NOT NULL,
  refresh_token text,
  token_expires_at timestamptz,
  scope text,
  calendar_id text NOT NULL DEFAULT 'primary',
  connected_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE internal_crm.google_calendar_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS internal_crm_google_calendar_connections_service_all ON internal_crm.google_calendar_connections;
CREATE POLICY internal_crm_google_calendar_connections_service_all
  ON internal_crm.google_calendar_connections
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS internal_crm_google_calendar_connections_auth_read_own ON internal_crm.google_calendar_connections;
CREATE POLICY internal_crm_google_calendar_connections_auth_read_own
  ON internal_crm.google_calendar_connections
  FOR SELECT TO authenticated
  USING (
    internal_crm.current_user_crm_role() <> 'none'
    AND auth.uid() = user_id
  );

DROP POLICY IF EXISTS internal_crm_google_calendar_connections_auth_write_own ON internal_crm.google_calendar_connections;
CREATE POLICY internal_crm_google_calendar_connections_auth_write_own
  ON internal_crm.google_calendar_connections
  FOR ALL TO authenticated
  USING (
    internal_crm.current_user_can_write()
    AND auth.uid() = user_id
  )
  WITH CHECK (
    internal_crm.current_user_can_write()
    AND auth.uid() = user_id
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON internal_crm.google_calendar_connections TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON internal_crm.google_calendar_connections TO service_role;

DROP TRIGGER IF EXISTS trg_internal_crm_google_calendar_connections_updated_at ON internal_crm.google_calendar_connections;
CREATE TRIGGER trg_internal_crm_google_calendar_connections_updated_at
  BEFORE UPDATE ON internal_crm.google_calendar_connections
  FOR EACH ROW EXECUTE FUNCTION internal_crm.set_updated_at();

ALTER TABLE internal_crm.appointments
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'internal',
  ADD COLUMN IF NOT EXISTS google_event_id text,
  ADD COLUMN IF NOT EXISTS google_calendar_id text,
  ADD COLUMN IF NOT EXISTS google_sync_status text NOT NULL DEFAULT 'not_synced',
  ADD COLUMN IF NOT EXISTS google_last_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS google_sync_error text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'internal_crm_appointments_source_check'
  ) THEN
    ALTER TABLE internal_crm.appointments
      ADD CONSTRAINT internal_crm_appointments_source_check
      CHECK (source IN ('internal', 'google'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'internal_crm_appointments_google_sync_status_check'
  ) THEN
    ALTER TABLE internal_crm.appointments
      ADD CONSTRAINT internal_crm_appointments_google_sync_status_check
      CHECK (google_sync_status IN ('not_synced', 'synced', 'error', 'disconnected'));
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_internal_crm_appointments_google_event
  ON internal_crm.appointments (owner_user_id, google_calendar_id, google_event_id)
  WHERE google_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_internal_crm_appointments_google_sync_status
  ON internal_crm.appointments (google_sync_status, start_at);

UPDATE internal_crm.appointments
SET google_sync_status = 'not_synced'
WHERE google_sync_status IS NULL;
