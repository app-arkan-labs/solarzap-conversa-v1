-- Atomic upsert for Conversas action sheet:
-- keeps appointment + next_action task + link in one transaction.

CREATE OR REPLACE FUNCTION public.upsert_lead_next_action_appointment(
  p_org_id uuid,
  p_lead_id bigint,
  p_title text,
  p_type text,
  p_start_at timestamptz,
  p_end_at timestamptz,
  p_location text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_user_id uuid DEFAULT NULL,
  p_appointment_id bigint DEFAULT NULL,
  p_task_id uuid DEFAULT NULL
)
RETURNS TABLE (
  appointment_id bigint,
  task_id uuid,
  appointment_user_id uuid,
  appointment_title text,
  appointment_type text,
  appointment_start_at timestamptz,
  appointment_end_at timestamptz,
  appointment_location text,
  appointment_notes text,
  task_due_at timestamptz,
  task_updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_responsible_user_id uuid;
  v_resolved_task_id uuid;
  v_resolved_appointment_id bigint;
  v_safe_type text;
BEGIN
  IF p_org_id IS NULL THEN
    RAISE EXCEPTION 'org_id_required';
  END IF;

  IF auth.role() <> 'service_role' AND NOT public.user_belongs_to_org(p_org_id) THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  IF p_lead_id IS NULL OR p_lead_id <= 0 THEN
    RAISE EXCEPTION 'lead_id_invalid';
  END IF;

  PERFORM 1
  FROM public.leads l
  WHERE l.id = p_lead_id
    AND l.org_id = p_org_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'lead_not_found_in_org';
  END IF;

  IF COALESCE(btrim(p_title), '') = '' THEN
    RAISE EXCEPTION 'title_required';
  END IF;

  IF p_start_at IS NULL OR p_end_at IS NULL OR p_end_at <= p_start_at THEN
    RAISE EXCEPTION 'invalid_schedule_window';
  END IF;

  v_responsible_user_id := COALESCE(p_user_id, v_actor_id);
  IF v_responsible_user_id IS NULL THEN
    RAISE EXCEPTION 'responsible_user_required';
  END IF;

  v_safe_type := lower(COALESCE(p_type, 'other'));
  IF v_safe_type IN ('call', 'chamada') THEN
    v_safe_type := 'chamada';
  ELSIF v_safe_type IN ('meeting', 'reuniao') THEN
    v_safe_type := 'reuniao';
  ELSIF v_safe_type IN ('visit', 'visita') THEN
    v_safe_type := 'visita';
  ELSIF v_safe_type IN ('installation', 'instalacao') THEN
    v_safe_type := 'instalacao';
  ELSE
    v_safe_type := 'other';
  END IF;

  IF p_appointment_id IS NOT NULL THEN
    UPDATE public.appointments
    SET
      org_id = p_org_id,
      user_id = v_responsible_user_id,
      lead_id = p_lead_id,
      title = btrim(p_title),
      type = v_safe_type,
      start_at = p_start_at,
      end_at = p_end_at,
      location = COALESCE(p_location, ''),
      notes = COALESCE(p_notes, ''),
      updated_at = now()
    WHERE id = p_appointment_id
      AND org_id = p_org_id
    RETURNING id INTO v_resolved_appointment_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'appointment_not_found';
    END IF;
  ELSE
    INSERT INTO public.appointments (
      org_id,
      user_id,
      lead_id,
      title,
      type,
      status,
      start_at,
      end_at,
      location,
      notes
    ) VALUES (
      p_org_id,
      v_responsible_user_id,
      p_lead_id,
      btrim(p_title),
      v_safe_type,
      'scheduled',
      p_start_at,
      p_end_at,
      COALESCE(p_location, ''),
      COALESCE(p_notes, '')
    )
    RETURNING id INTO v_resolved_appointment_id;
  END IF;

  v_resolved_task_id := p_task_id;
  IF v_resolved_task_id IS NOT NULL THEN
    PERFORM 1
    FROM public.lead_tasks lt
    WHERE lt.id = v_resolved_task_id
      AND lt.org_id = p_org_id;

    IF NOT FOUND THEN
      v_resolved_task_id := NULL;
    END IF;
  END IF;

  IF v_resolved_task_id IS NULL THEN
    SELECT lt.id
    INTO v_resolved_task_id
    FROM public.lead_tasks lt
    WHERE lt.org_id = p_org_id
      AND lt.lead_id = p_lead_id
      AND lt.status = 'open'
      AND lt.task_kind = 'next_action'
    ORDER BY lt.updated_at DESC
    LIMIT 1;
  END IF;

  IF v_resolved_task_id IS NULL THEN
    BEGIN
      INSERT INTO public.lead_tasks (
        org_id,
        user_id,
        lead_id,
        title,
        notes,
        due_at,
        status,
        priority,
        channel,
        created_by,
        task_kind,
        linked_appointment_id,
        metadata
      ) VALUES (
        p_org_id,
        v_responsible_user_id,
        p_lead_id,
        btrim(p_title),
        NULLIF(COALESCE(p_notes, ''), ''),
        p_start_at,
        'open',
        'medium',
        'other',
        'manual',
        'next_action',
        v_resolved_appointment_id,
        '{}'::jsonb
      )
      RETURNING id INTO v_resolved_task_id;
    EXCEPTION
      WHEN unique_violation THEN
        SELECT lt.id
        INTO v_resolved_task_id
        FROM public.lead_tasks lt
        WHERE lt.org_id = p_org_id
          AND lt.lead_id = p_lead_id
          AND lt.status = 'open'
          AND lt.task_kind = 'next_action'
        ORDER BY lt.updated_at DESC
        LIMIT 1;

        IF v_resolved_task_id IS NULL THEN
          RAISE;
        END IF;
    END;
  END IF;

  UPDATE public.lead_tasks
  SET
    user_id = v_responsible_user_id,
    title = btrim(p_title),
    notes = NULLIF(COALESCE(p_notes, ''), ''),
    due_at = p_start_at,
    status = 'open',
    priority = COALESCE(priority, 'medium'),
    channel = 'other',
    task_kind = 'next_action',
    linked_appointment_id = v_resolved_appointment_id,
    updated_at = now()
  WHERE id = v_resolved_task_id
    AND org_id = p_org_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'task_not_found';
  END IF;

  RETURN QUERY
  SELECT
    a.id AS appointment_id,
    lt.id AS task_id,
    a.user_id AS appointment_user_id,
    a.title AS appointment_title,
    a.type AS appointment_type,
    a.start_at AS appointment_start_at,
    a.end_at AS appointment_end_at,
    COALESCE(a.location, '') AS appointment_location,
    COALESCE(a.notes, '') AS appointment_notes,
    lt.due_at AS task_due_at,
    lt.updated_at AS task_updated_at
  FROM public.appointments a
  JOIN public.lead_tasks lt
    ON lt.id = v_resolved_task_id
   AND lt.org_id = p_org_id
  WHERE a.id = v_resolved_appointment_id
    AND a.org_id = p_org_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_lead_next_action_appointment(
  uuid,
  bigint,
  text,
  text,
  timestamptz,
  timestamptz,
  text,
  text,
  uuid,
  bigint,
  uuid
) TO authenticated, service_role;
