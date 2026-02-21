SELECT instance_name, COUNT(*) AS cnt FROM public.whatsapp_instances GROUP BY instance_name HAVING COUNT(*) > 1;
