-- Migration: 20260212_lead_tasks
-- Description: Creates lead_tasks table for AI-generated follow-ups and user tasks

CREATE TABLE IF NOT EXISTS public.lead_tasks (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL,
    user_id uuid NOT NULL,
    lead_id int8 NOT NULL,
    title text NOT NULL,
    notes text,
    due_at timestamptz,
    status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done', 'canceled')),
    priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
    channel text CHECK (channel IN ('whatsapp', 'call', 'email', 'other') OR channel IS NULL),
    created_by text NOT NULL DEFAULT 'ai',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT lead_tasks_pkey PRIMARY KEY (id),
    CONSTRAINT lead_tasks_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE,
    CONSTRAINT lead_tasks_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_lead_tasks_lead_status ON public.lead_tasks(lead_id, status);
CREATE INDEX IF NOT EXISTS idx_lead_tasks_org_due ON public.lead_tasks(org_id, due_at);

-- RLS
ALTER TABLE public.lead_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view tasks they own or belong to" ON public.lead_tasks;
DROP POLICY IF EXISTS "Users can insert tasks they own" ON public.lead_tasks;
DROP POLICY IF EXISTS "Users can update their own tasks" ON public.lead_tasks;
DROP POLICY IF EXISTS "Users can delete their own tasks" ON public.lead_tasks;

CREATE POLICY "Users can view tasks they own or belong to"
ON public.lead_tasks FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert tasks they own"
ON public.lead_tasks FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own tasks"
ON public.lead_tasks FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own tasks"
ON public.lead_tasks FOR DELETE
USING (auth.uid() = user_id);

-- Updated_at trigger (reuse existing function if available)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_timestamp') THEN
        IF NOT EXISTS (
            SELECT 1
            FROM pg_trigger
            WHERE tgname = 'tr_lead_tasks_updated_at'
        ) THEN
            CREATE TRIGGER tr_lead_tasks_updated_at
            BEFORE UPDATE ON public.lead_tasks
            FOR EACH ROW EXECUTE FUNCTION public.update_timestamp();
        END IF;
    END IF;
END$$;
