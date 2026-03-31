-- Add interval_seconds to broadcast_campaigns for configurable timer
ALTER TABLE internal_crm.broadcast_campaigns
  ADD COLUMN IF NOT EXISTS interval_seconds integer NOT NULL DEFAULT 15;
