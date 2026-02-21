SELECT conname, contype FROM pg_constraint WHERE conrelid = 'public.whatsapp_instances'::regclass AND conname = 'uq_instance_name_global';
