-- Phase 1: Source of Truth Columns

-- Add new columns
ALTER TABLE leads ADD COLUMN IF NOT EXISTS whatsapp_name text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS name_source text DEFAULT 'whatsapp'; 
ALTER TABLE leads ADD COLUMN IF NOT EXISTS name_updated_at timestamptz DEFAULT now();

-- Create index for performance on hook lookups
CREATE INDEX IF NOT EXISTS idx_leads_user_phone ON leads(user_id, telefone);

-- Migrate existing data
-- If name_manually_changed is TRUE, set source to 'manual'
UPDATE leads 
SET name_source = 'manual' 
WHERE name_manually_changed = true;

-- If name_manually_changed is FALSE or NULL, keep default 'whatsapp'
-- (No action needed as default is 'whatsapp')

-- Optional: Populate whatsapp_name with current name if source is whatsapp?
-- We can't know for sure if current name is from whatsapp, but it's a safe bet for legacy data 
-- if we assume unedited names came from whatsapp.
UPDATE leads
SET whatsapp_name = nome
WHERE name_source = 'whatsapp' AND whatsapp_name IS NULL;
