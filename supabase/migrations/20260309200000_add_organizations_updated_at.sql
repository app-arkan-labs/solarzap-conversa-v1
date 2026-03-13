-- Adds missing updated_at column to organizations table.
-- Required by: sync_org_access_state(), migrate_legacy_org_to_trial(), billing crons.
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
