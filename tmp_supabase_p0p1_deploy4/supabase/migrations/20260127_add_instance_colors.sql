-- Add color column to whatsapp_instances
ALTER TABLE public.whatsapp_instances 
ADD COLUMN IF NOT EXISTS color text DEFAULT '#25D366';

-- Add instance_name column to interacoes to track source
ALTER TABLE public.interacoes 
ADD COLUMN IF NOT EXISTS instance_name text;

-- Add index for performance on filtering by instance
CREATE INDEX IF NOT EXISTS idx_interacoes_instance_name ON public.interacoes(instance_name);
