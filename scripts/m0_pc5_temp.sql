HTTP 201
[
  {
    "pg_get_functiondef": "CREATE OR REPLACE FUNCTION public.hard_delete_thread(p_user_id uuid, p_instance_name text, p_phone_e164 text)\n RETURNS void\n LANGUAGE plpgsql\n SECURITY DEFINER\nAS $function$\nBEGIN\n  INSERT INTO deleted_threads (user_id, instance_name, phone_e164)\n  VALUES (p_user_id, COALESCE(p_instance_name, ''), p_phone_e164)\n  ON CONFLICT (user_id, instance_name, phone_e164) DO UPDATE\n    SET deleted_at = NOW();\n  \n  DELETE FROM interacoes\n  WHERE user_id = p_user_id\n    AND phone_e164 = p_phone_e164;\n  \n  DELETE FROM interacoes i\n  USING leads l\n  WHERE i.lead_id = l.id\n    AND l.user_id = p_user_id\n    AND l.phone_e164 = p_phone_e164;\n  \n  DELETE FROM public.appointments a\n  USING leads l\n  WHERE a.lead_id = l.id\n    AND l.user_id = p_user_id\n    AND l.phone_e164 = p_phone_e164;\n  \n  DELETE FROM leads\n  WHERE user_id = p_user_id\n    AND phone_e164 = p_phone_e164;\nEND;\n$function$\n"
  }
]
