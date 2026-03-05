DROP FUNCTION IF EXISTS public.upsert_lead_canonical(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text
);

DROP FUNCTION IF EXISTS public.upsert_lead_canonical(
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  text,
  text
);

CREATE OR REPLACE FUNCTION public.upsert_lead_canonical(
  p_user_id uuid,
  p_org_id uuid,
  p_instance_name text,
  p_phone_e164 text,
  p_telefone text,
  p_name text DEFAULT NULL::text,
  p_push_name text DEFAULT NULL::text,
  p_source text DEFAULT 'whatsapp'::text
)
RETURNS TABLE(
  id bigint,
  created_at timestamp with time zone,
  updated_at timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_lead_id bigint;
  v_created_at timestamp with time zone;
  v_updated_at timestamp with time zone;
  v_tombstone_exists boolean;
BEGIN
  IF auth.uid() IS NOT NULL AND p_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized: p_user_id must match auth.uid()';
  END IF;

  IF p_org_id IS NOT NULL
     AND auth.role() <> 'service_role'
     AND NOT public.user_belongs_to_org(p_org_id) THEN
    RAISE EXCEPTION 'Unauthorized for org %', p_org_id;
  END IF;

  IF p_org_id IS NOT NULL THEN
    SELECT l.id, l.created_at, l.updated_at
      INTO v_lead_id, v_created_at, v_updated_at
    FROM public.leads l
    WHERE l.org_id = p_org_id
      AND l.phone_e164 = p_phone_e164
    ORDER BY l.id ASC
    LIMIT 1;

    IF v_lead_id IS NULL AND p_telefone IS NOT NULL THEN
      SELECT l.id, l.created_at, l.updated_at
        INTO v_lead_id, v_created_at, v_updated_at
      FROM public.leads l
      WHERE l.org_id = p_org_id
        AND l.telefone = p_telefone
      ORDER BY l.id ASC
      LIMIT 1;
    END IF;
  ELSE
    SELECT l.id, l.created_at, l.updated_at
      INTO v_lead_id, v_created_at, v_updated_at
    FROM public.leads l
    WHERE l.user_id = p_user_id
      AND l.phone_e164 = p_phone_e164
    ORDER BY l.id ASC
    LIMIT 1;

    IF v_lead_id IS NULL AND p_telefone IS NOT NULL THEN
      SELECT l.id, l.created_at, l.updated_at
        INTO v_lead_id, v_created_at, v_updated_at
      FROM public.leads l
      WHERE l.user_id = p_user_id
        AND l.telefone = p_telefone
      ORDER BY l.id ASC
      LIMIT 1;
    END IF;
  END IF;

  IF v_lead_id IS NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.deleted_threads
      WHERE user_id = p_user_id
        AND phone_e164 = p_phone_e164
        AND deleted_at > now() - interval '30 days'
    )
      INTO v_tombstone_exists;

    IF v_tombstone_exists THEN
      DELETE FROM public.deleted_threads
      WHERE user_id = p_user_id
        AND phone_e164 = p_phone_e164;

      RAISE NOTICE 'Creating fresh lead for phone % after tombstone deletion', p_phone_e164;
    END IF;

    INSERT INTO public.leads (
      org_id,
      user_id,
      assigned_to_user_id,
      instance_name,
      phone_e164,
      telefone,
      nome,
      source,
      created_at,
      updated_at
    )
    VALUES (
      p_org_id,
      p_user_id,
      p_user_id,
      p_instance_name,
      p_phone_e164,
      p_telefone,
      COALESCE(p_name, p_push_name, p_telefone),
      p_source,
      now(),
      now()
    )
    RETURNING leads.id, leads.created_at, leads.updated_at
      INTO v_lead_id, v_created_at, v_updated_at;
  ELSE
    UPDATE public.leads
       SET updated_at = now(),
           instance_name = COALESCE(public.leads.instance_name, p_instance_name),
           assigned_to_user_id = COALESCE(public.leads.assigned_to_user_id, p_user_id),
           org_id = COALESCE(public.leads.org_id, p_org_id),
           nome = CASE
             WHEN public.leads.nome = public.leads.telefone AND p_push_name IS NOT NULL THEN p_push_name
             ELSE public.leads.nome
           END
     WHERE public.leads.id = v_lead_id
    RETURNING public.leads.updated_at
      INTO v_updated_at;
  END IF;

  RETURN QUERY
  SELECT v_lead_id, v_created_at, v_updated_at;
END;
$function$;

CREATE OR REPLACE FUNCTION public.upsert_lead_canonical(
  p_user_id uuid,
  p_instance_name text,
  p_phone_e164 text,
  p_telefone text,
  p_name text DEFAULT NULL::text,
  p_push_name text DEFAULT NULL::text,
  p_source text DEFAULT 'whatsapp'::text
)
RETURNS TABLE(
  id bigint,
  created_at timestamp with time zone,
  updated_at timestamp with time zone
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT *
  FROM public.upsert_lead_canonical(
    p_user_id,
    NULL::uuid,
    p_instance_name,
    p_phone_e164,
    p_telefone,
    p_name,
    p_push_name,
    p_source
  );
$function$;

GRANT EXECUTE ON FUNCTION public.upsert_lead_canonical(
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  text,
  text
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.upsert_lead_canonical(
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  text,
  text
) TO service_role;

GRANT EXECUTE ON FUNCTION public.upsert_lead_canonical(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.upsert_lead_canonical(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text
) TO service_role;
