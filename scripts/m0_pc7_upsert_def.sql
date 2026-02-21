SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = 'upsert_lead_canonical';
