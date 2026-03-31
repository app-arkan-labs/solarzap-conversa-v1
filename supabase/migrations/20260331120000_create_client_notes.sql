-- Migration: create client_notes table in internal_crm schema
CREATE TABLE IF NOT EXISTS internal_crm.client_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES internal_crm.clients(id) ON DELETE CASCADE,
  author_name text NOT NULL DEFAULT '',
  author_user_id uuid,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_notes_client_id ON internal_crm.client_notes(client_id);
CREATE INDEX IF NOT EXISTS idx_client_notes_created_at ON internal_crm.client_notes(created_at DESC);
