-- Add new columns for name source of truth
ALTER TABLE leads ADD COLUMN IF NOT EXISTS whatsapp_name text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS name_source text DEFAULT 'whatsapp'; -- 'manual' or 'whatsapp'
ALTER TABLE leads ADD COLUMN IF NOT EXISTS name_updated_at timestamptz DEFAULT now();

-- Create index for faster lookups (optional but requested)
CREATE INDEX IF NOT EXISTS idx_leads_user_phone ON leads(user_id, telefone);

-- Backfill existing data
-- Assume existing leads with names are from WhatsApp unless we had a way to know. 
-- For now, if we don't have name_manually_changed (which seems to be the case), we default to 'whatsapp'.
-- However, the user said: "se você tem flag name_manually_changed". 
-- If that flag doesn't exist, we must assume 'whatsapp' for safety, or 'manual' if we want to protect all existing names?
-- The user instructions say:
-- "Para leads com nome preenchido manualmente (se você tem flag name_manually_changed): set name_source='manual'"
-- "Para leads sem flag: set name_source='whatsapp'"
-- Since I don't recall seeing name_manually_changed, I will check the schema first. 
-- BUT, for this migration file, I will write the logic safely.

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'leads' AND column_name = 'name_manually_changed') THEN
        UPDATE leads 
        SET name_source = CASE 
            WHEN name_manually_changed = true THEN 'manual' 
            ELSE 'whatsapp' 
        END;
    ELSE
        -- If no flag exists, we assume 'whatsapp' for now as per instructions "Para leads sem flag: set name_source='whatsapp'"
        UPDATE leads SET name_source = 'whatsapp' WHERE name_source IS NULL;
    END IF;
END $$;
