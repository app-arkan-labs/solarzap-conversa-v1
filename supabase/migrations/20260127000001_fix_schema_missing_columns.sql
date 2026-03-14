-- Add name_manually_changed to leads if it doesn't exist
ALTER TABLE public.leads 
ADD COLUMN IF NOT EXISTS name_manually_changed boolean DEFAULT false;

-- Add instance_name to interacoes if it doesn't exist (safety check)
ALTER TABLE public.interacoes 
ADD COLUMN IF NOT EXISTS instance_name text;

-- Add color to whatsapp_instances if it doesn't exist (safety check)
ALTER TABLE public.whatsapp_instances 
ADD COLUMN IF NOT EXISTS color text DEFAULT '#25D366';
