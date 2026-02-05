-- Migration: 20260128_calendar_module
-- Description: Adds Appointments, Reminders, Logs and Settings for Internal Calendar

-- 1. APPOINTMENTS TABLE
CREATE TABLE IF NOT EXISTS public.appointments (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL, -- Tenant (owner)
    lead_id int8 NOT NULL, -- Link to leads table (int8)
    title text NOT NULL,
    type text NOT NULL CHECK (type IN ('call', 'visit', 'installation', 'meeting', 'other', 'chamada', 'visita', 'instalacao', 'reuniao')), -- Normalize? Accepting both sets for compatibility
    status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'confirmed', 'done', 'canceled', 'no_show')),
    start_at timestamptz NOT NULL,
    end_at timestamptz NOT NULL,
    location text,
    notes text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    
    CONSTRAINT appointments_pkey PRIMARY KEY (id),
    CONSTRAINT appointments_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE,
    CONSTRAINT appointments_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

-- RLS for appointments
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own appointments" 
ON public.appointments FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own appointments" 
ON public.appointments FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own appointments" 
ON public.appointments FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own appointments" 
ON public.appointments FOR DELETE 
USING (auth.uid() = user_id);


-- 2. APPOINTMENT SETTINGS (Defaults per user)
CREATE TABLE IF NOT EXISTS public.appointment_settings (
    user_id uuid NOT NULL,
    default_reminders jsonb NOT NULL DEFAULT '[
        {"channel": "whatsapp_lead", "offset_minutes": 1440}, 
        {"channel": "whatsapp_lead", "offset_minutes": 120},
        {"channel": "whatsapp_lead", "offset_minutes": 15}
    ]'::jsonb,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    
    CONSTRAINT appointment_settings_pkey PRIMARY KEY (user_id),
    CONSTRAINT appointment_settings_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

-- RLS for settings
ALTER TABLE public.appointment_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own settings" 
ON public.appointment_settings FOR ALL 
USING (auth.uid() = user_id);


-- 3. APPOINTMENT REMINDERS
CREATE TABLE IF NOT EXISTS public.appointment_reminders (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL, -- Denormalized for RLS efficiency
    appointment_id uuid NOT NULL,
    channel text NOT NULL DEFAULT 'whatsapp_lead', -- whatsapp_lead, whatsapp_owner
    due_at timestamptz NOT NULL,
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'sent', 'failed', 'canceled')),
    attempt_count int DEFAULT 0,
    last_error text,
    sent_at timestamptz,
    created_at timestamptz DEFAULT now(),
    
    CONSTRAINT appointment_reminders_pkey PRIMARY KEY (id),
    CONSTRAINT appointment_reminders_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES public.appointments(id) ON DELETE CASCADE,
    CONSTRAINT appointment_reminders_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Index for pending reminders job
CREATE INDEX IF NOT EXISTS idx_appointment_reminders_status_due 
ON public.appointment_reminders(status, due_at) 
WHERE status = 'pending';

-- RLS for reminders
ALTER TABLE public.appointment_reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own reminders" 
ON public.appointment_reminders FOR ALL 
USING (auth.uid() = user_id);


-- 4. LOGS
CREATE TABLE IF NOT EXISTS public.appointment_notification_logs (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    appointment_id uuid NOT NULL,
    reminder_id uuid,
    channel text NOT NULL,
    to_phone text,
    payload jsonb,
    provider_response jsonb,
    status text NOT NULL CHECK (status IN ('sent', 'failed')),
    created_at timestamptz DEFAULT now(),
    
    CONSTRAINT appointment_notification_logs_pkey PRIMARY KEY (id)
);

-- RLS for logs
ALTER TABLE public.appointment_notification_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own logs" 
ON public.appointment_notification_logs FOR SELECT 
USING (auth.uid() = user_id);


-- 5. FUNCTION & TRIGGER to Generate Reminders
CREATE OR REPLACE FUNCTION public.handle_appointment_upsert()
RETURNS TRIGGER AS $$
DECLARE
    v_settings jsonb;
    v_reminder jsonb;
    v_offset int;
    v_due_at timestamptz;
BEGIN
    -- Only regenerate on Insert or Start Time change
    IF (TG_OP = 'UPDATE' AND OLD.start_at = NEW.start_at) THEN
        RETURN NEW;
    END IF;

    -- If Update, cancel old pending reminders
    IF (TG_OP = 'UPDATE') THEN
        UPDATE public.appointment_reminders 
        SET status = 'canceled' 
        WHERE appointment_id = NEW.id AND status = 'pending';
    END IF;

    -- Get settings (or default)
    SELECT default_reminders INTO v_settings FROM public.appointment_settings WHERE user_id = NEW.user_id;
    
    IF v_settings IS NULL THEN
        v_settings := '[
            {"channel": "whatsapp_lead", "offset_minutes": 1440}, 
            {"channel": "whatsapp_lead", "offset_minutes": 120},
            {"channel": "whatsapp_lead", "offset_minutes": 15}
        ]'::jsonb;
    END IF;

    -- Create new reminders
    FOR v_reminder IN SELECT * FROM jsonb_array_elements(v_settings)
    LOOP
        v_offset := (v_reminder->>'offset_minutes')::int;
        v_due_at := NEW.start_at - (v_offset || ' minutes')::interval;

        -- Only create if due time is in the future (or very recently passed, e.g. creating a "now" meeting)
        -- Actually, we might want to skip 24h reminders if creating it 1h before.
        -- Let's create it if due_at > now() OR if it's within a small tolerance window? 
        -- Simplest: Only pending if > now().
        
        IF v_due_at > now() THEN
            INSERT INTO public.appointment_reminders (user_id, appointment_id, channel, due_at)
            VALUES (NEW.user_id, NEW.id, v_reminder->>'channel', v_due_at);
        END IF;
    END LOOP;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER tr_appointment_upsert
AFTER INSERT OR UPDATE ON public.appointments
FOR EACH ROW
EXECUTE FUNCTION public.handle_appointment_upsert();

-- Updated At Trigger
CREATE OR REPLACE FUNCTION public.update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = now(); 
   RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER tr_appointments_updated_at
BEFORE UPDATE ON public.appointments
FOR EACH ROW EXECUTE PROCEDURE public.update_timestamp();

CREATE TRIGGER tr_appointment_settings_updated_at
BEFORE UPDATE ON public.appointment_settings
FOR EACH ROW EXECUTE PROCEDURE public.update_timestamp();


-- 6. RPC for claiming reminders (Job Queue Pattern)
CREATE OR REPLACE FUNCTION public.claim_due_reminders(p_limit int)
RETURNS TABLE (
    reminder_id uuid,
    appointment_id uuid,
    user_id uuid,
    channel text,
    lead_name text,
    lead_phone text,
    appointment_type text,
    start_at timestamptz
) 
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    WITH due AS (
        SELECT r.id
        FROM public.appointment_reminders r
        WHERE r.status = 'pending' 
          AND r.due_at <= now()
        ORDER BY r.due_at ASC
        LIMIT p_limit
        FOR UPDATE SKIP LOCKED
    ),
    updated AS (
        UPDATE public.appointment_reminders r
        SET status = 'processing', updated_at = now()
        FROM due
        WHERE r.id = due.id
        RETURNING r.id, r.appointment_id, r.user_id, r.channel
    )
    SELECT 
        u.id as reminder_id,
        u.appointment_id,
        u.user_id,
        u.channel,
        l.nome as lead_name,
        l.telefone as lead_phone,
        a.type as appointment_type,
        a.start_at
    FROM updated u
    JOIN public.appointments a ON a.id = u.appointment_id
    JOIN public.leads l ON l.id = a.lead_id;
END;
$$;
