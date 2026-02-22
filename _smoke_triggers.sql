SELECT trigger_name, event_object_table FROM information_schema.triggers WHERE trigger_name LIKE 'tr_notification%' ORDER BY trigger_name;
