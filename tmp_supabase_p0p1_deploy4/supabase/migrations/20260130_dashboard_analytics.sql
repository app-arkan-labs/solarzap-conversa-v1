-- Migration: 20260130_dashboard_analytics
-- Description: Adds underlying tables for Dashboard Analytics, RLS, and Triggers.

-- 1. DEALS Table (Sales/Contracts)
-- Tracks the financial outcome of leads (Won/Lost)
CREATE TABLE IF NOT EXISTS public.deals (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL, -- Workspace/Tenant Owner
    lead_id int8 NOT NULL, -- FK to leads
    title text,            -- Optional title, e.g. "Projeto 5kWp"
    amount numeric NOT NULL DEFAULT 0,
    status text NOT NULL CHECK (status IN ('open', 'won', 'lost')),
    closed_at timestamptz, -- Date when it was won/lost
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    
    CONSTRAINT deals_pkey PRIMARY KEY (id),
    CONSTRAINT deals_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE,
    CONSTRAINT deals_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

-- RLS for Deals
ALTER TABLE public.deals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own deals" 
ON public.deals FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own deals" 
ON public.deals FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own deals" 
ON public.deals FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own deals" 
ON public.deals FOR DELETE 
USING (auth.uid() = user_id);


-- 2. LEAD STAGE HISTORY
-- Tracks movement between pipeline stages for "Aging" and Funnel reports.
CREATE TABLE IF NOT EXISTS public.lead_stage_history (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL, -- Workspace/Tenant Owner
    lead_id int8 NOT NULL,
    from_stage text, -- stored as text to avoid issues if enum changes
    to_stage text NOT NULL,
    changed_at timestamptz DEFAULT now(),
    source text DEFAULT 'manual', -- manual, automation, system
    
    CONSTRAINT lead_stage_history_pkey PRIMARY KEY (id),
    CONSTRAINT lead_stage_history_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE,
    CONSTRAINT lead_stage_history_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

-- RLS for History
ALTER TABLE public.lead_stage_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own lead history" 
ON public.lead_stage_history FOR SELECT 
USING (auth.uid() = user_id);

-- 3. UPDATES TO LEADS TABLE
-- Add 'source' if not exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'leads' AND column_name = 'source') THEN
        ALTER TABLE public.leads ADD COLUMN source text DEFAULT 'whatsapp';
        UPDATE public.leads SET source = 'whatsapp' WHERE source IS NULL;
    END IF;
END $$;

-- Add 'stage_changed_at' if not exists (for quick aging calculation)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'leads' AND column_name = 'stage_changed_at') THEN
        ALTER TABLE public.leads ADD COLUMN stage_changed_at timestamptz DEFAULT now();
    END IF;
END $$;


-- 4. TRIGGER FOR STAGE HISTORY
-- Automatically log stage changes
CREATE OR REPLACE FUNCTION public.handle_lead_stage_change()
RETURNS TRIGGER AS $$
BEGIN
    -- Only trigger if stage changed
    IF (TG_OP = 'UPDATE' AND OLD.status_pipeline IS DISTINCT FROM NEW.status_pipeline) THEN
        -- Insert history
        INSERT INTO public.lead_stage_history (user_id, lead_id, from_stage, to_stage, changed_at, source)
        VALUES (NEW.user_id, NEW.id, OLD.status_pipeline, NEW.status_pipeline, now(), 'manual'); -- 'manual' is default, can be passed via session var if needed, but extensive for now.
        
        -- Update leads.stage_changed_at
        UPDATE public.leads 
        SET stage_changed_at = now() 
        WHERE id = NEW.id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_lead_stage_change ON public.leads;

CREATE TRIGGER tr_lead_stage_change
AFTER UPDATE ON public.leads
FOR EACH ROW
EXECUTE FUNCTION public.handle_lead_stage_change();


-- 5. INDEXES FOR ANALYTICS PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_leads_user_created ON public.leads(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_leads_user_stage ON public.leads(user_id, status_pipeline);
CREATE INDEX IF NOT EXISTS idx_leads_user_source ON public.leads(user_id, source);
CREATE INDEX IF NOT EXISTS idx_deals_user_closed ON public.deals(user_id, closed_at, status);
CREATE INDEX IF NOT EXISTS idx_lead_history_user_date ON public.lead_stage_history(user_id, changed_at);

