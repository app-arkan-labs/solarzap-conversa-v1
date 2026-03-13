CREATE OR REPLACE FUNCTION public.import_leads_batch(
  p_org_id uuid,
  p_rows jsonb
)
RETURNS TABLE (
  row_index integer,
  action text,
  lead_id bigint,
  error text
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_row jsonb;
  v_idx integer;
  v_actor_user_id uuid;
  v_has_tipo_cliente boolean := false;
  v_existing_id bigint;
  v_target_id bigint;
  v_nome text;
  v_telefone_raw text;
  v_telefone_digits text;
  v_telefone_alt text;
  v_email text;
  v_empresa text;
  v_canal text;
  v_stage_code text;
  v_stage_label text;
  v_stage text;
  v_tipo_cliente text;
  v_tipo_cliente_default text;
  v_observacoes text;
  v_consumo_text text;
  v_valor_text text;
  v_consumo integer;
  v_valor numeric;
  v_assigned_to_user_id uuid;
  v_valid_assignee uuid;
BEGIN
  IF p_org_id IS NULL THEN
    RAISE EXCEPTION 'p_org_id is required';
  END IF;

  IF jsonb_typeof(coalesce(p_rows, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'p_rows must be a JSON array';
  END IF;

  IF auth.role() <> 'service_role' AND NOT public.user_belongs_to_org(p_org_id) THEN
    RAISE EXCEPTION 'Unauthorized for org %', p_org_id;
  END IF;

  v_actor_user_id := auth.uid();
  IF v_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'Authenticated user is required';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'leads'
      AND column_name = 'tipo_cliente'
  )
  INTO v_has_tipo_cliente;

  FOR v_row, v_idx IN
    SELECT value, ordinality::int
    FROM jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) WITH ORDINALITY
  LOOP
    BEGIN
      v_existing_id := NULL;
      v_target_id := NULL;
      v_consumo := NULL;
      v_valor := NULL;
      v_valid_assignee := NULL;

      v_nome := nullif(btrim(coalesce(v_row->>'nome', '')), '');
      v_telefone_raw := coalesce(v_row->>'telefone', '');
      v_telefone_digits := regexp_replace(v_telefone_raw, '\D', '', 'g');

      IF length(v_telefone_digits) IN (10, 11) AND left(v_telefone_digits, 2) <> '55' THEN
        v_telefone_digits := '55' || v_telefone_digits;
      END IF;

      IF left(v_telefone_digits, 2) = '55' THEN
        v_telefone_alt := substr(v_telefone_digits, 3);
      ELSE
        v_telefone_alt := '55' || v_telefone_digits;
      END IF;

      IF v_nome IS NULL THEN
        row_index := v_idx;
        action := 'failed';
        lead_id := NULL;
        error := 'Nome obrigatorio';
        RETURN NEXT;
        CONTINUE;
      END IF;

      IF coalesce(v_telefone_digits, '') = '' THEN
        row_index := v_idx;
        action := 'failed';
        lead_id := NULL;
        error := 'Telefone obrigatorio';
        RETURN NEXT;
        CONTINUE;
      END IF;

      v_email := nullif(btrim(coalesce(v_row->>'email', '')), '');
      v_empresa := nullif(btrim(coalesce(v_row->>'empresa', '')), '');
      v_canal := nullif(btrim(coalesce(v_row->>'canal', '')), '');
      IF v_canal IS NULL THEN
        v_canal := 'whatsapp';
      END IF;

      v_stage_code := nullif(btrim(coalesce(v_row->>'status_pipeline_code', '')), '');
      v_stage_label := nullif(btrim(coalesce(v_row->>'status_pipeline', '')), '');
      v_stage := public.normalize_lead_stage(coalesce(v_stage_code, v_stage_label, 'novo_lead'));

      v_tipo_cliente := lower(nullif(btrim(coalesce(v_row->>'tipo_cliente', '')), ''));
      IF v_tipo_cliente IS NOT NULL
         AND v_tipo_cliente NOT IN ('residencial', 'comercial', 'industrial', 'rural', 'usina') THEN
        v_tipo_cliente := NULL;
      END IF;

      v_tipo_cliente_default := lower(nullif(btrim(coalesce(v_row->>'tipo_cliente_default', '')), ''));
      IF v_tipo_cliente_default IS NOT NULL
         AND v_tipo_cliente_default NOT IN ('residencial', 'comercial', 'industrial', 'rural', 'usina') THEN
        v_tipo_cliente_default := NULL;
      END IF;

      BEGIN
        v_assigned_to_user_id := nullif(btrim(coalesce(v_row->>'assigned_to_user_id', '')), '')::uuid;
      EXCEPTION WHEN others THEN
        v_assigned_to_user_id := NULL;
      END;

      IF v_assigned_to_user_id IS NOT NULL THEN
        SELECT om.user_id
        INTO v_valid_assignee
        FROM public.organization_members om
        WHERE om.org_id = p_org_id
          AND om.user_id = v_assigned_to_user_id
        LIMIT 1;
      END IF;

      v_assigned_to_user_id := coalesce(v_valid_assignee, v_actor_user_id);

      v_observacoes := nullif(btrim(coalesce(v_row->>'observacoes', '')), '');

      v_consumo_text := nullif(btrim(coalesce(v_row->>'consumo_kwh', '')), '');
      IF v_consumo_text IS NOT NULL THEN
        v_consumo_text := replace(regexp_replace(v_consumo_text, '[^0-9,.-]', '', 'g'), ',', '.');
        IF v_consumo_text ~ '^-?[0-9]+(\.[0-9]+)?$' THEN
          v_consumo := greatest(round(v_consumo_text::numeric)::integer, 0);
        END IF;
      END IF;

      v_valor_text := nullif(btrim(coalesce(v_row->>'valor_estimado', '')), '');
      IF v_valor_text IS NOT NULL THEN
        v_valor_text := replace(regexp_replace(v_valor_text, '[^0-9,.-]', '', 'g'), ',', '.');
        IF v_valor_text ~ '^-?[0-9]+(\.[0-9]+)?$' THEN
          v_valor := v_valor_text::numeric;
        END IF;
      END IF;

      SELECT l.id
      INTO v_existing_id
      FROM public.leads l
      WHERE l.org_id = p_org_id
        AND (
          regexp_replace(coalesce(l.telefone, ''), '\D', '', 'g') = v_telefone_digits
          OR regexp_replace(coalesce(l.telefone, ''), '\D', '', 'g') = v_telefone_alt
        )
      ORDER BY l.updated_at DESC NULLS LAST, l.created_at DESC NULLS LAST, l.id DESC
      LIMIT 1;

      IF v_existing_id IS NOT NULL THEN
        IF v_has_tipo_cliente THEN
          UPDATE public.leads l
          SET
            nome = coalesce(v_nome, l.nome),
            telefone = v_telefone_digits,
            email = coalesce(v_email, l.email),
            empresa = coalesce(v_empresa, l.empresa),
            canal = coalesce(v_canal, l.canal),
            status_pipeline = v_stage,
            tipo_cliente = CASE
              WHEN v_tipo_cliente IS NOT NULL THEN v_tipo_cliente
              WHEN v_tipo_cliente_default IS NOT NULL AND nullif(btrim(coalesce(l.tipo_cliente, '')), '') IS NULL THEN v_tipo_cliente_default
              ELSE l.tipo_cliente
            END,
            observacoes = coalesce(v_observacoes, l.observacoes),
            consumo_kwh = coalesce(v_consumo, l.consumo_kwh),
            valor_estimado = coalesce(v_valor, l.valor_estimado),
            assigned_to_user_id = v_assigned_to_user_id
          WHERE l.id = v_existing_id
            AND l.org_id = p_org_id
          RETURNING l.id INTO v_target_id;
        ELSE
          UPDATE public.leads l
          SET
            nome = coalesce(v_nome, l.nome),
            telefone = v_telefone_digits,
            email = coalesce(v_email, l.email),
            empresa = coalesce(v_empresa, l.empresa),
            canal = coalesce(v_canal, l.canal),
            status_pipeline = v_stage,
            observacoes = coalesce(v_observacoes, l.observacoes),
            consumo_kwh = coalesce(v_consumo, l.consumo_kwh),
            valor_estimado = coalesce(v_valor, l.valor_estimado),
            assigned_to_user_id = v_assigned_to_user_id
          WHERE l.id = v_existing_id
            AND l.org_id = p_org_id
          RETURNING l.id INTO v_target_id;
        END IF;

        row_index := v_idx;
        action := 'updated';
        lead_id := v_target_id;
        error := NULL;
        RETURN NEXT;
      ELSE
        IF v_has_tipo_cliente THEN
          INSERT INTO public.leads (
            org_id,
            user_id,
            assigned_to_user_id,
            nome,
            telefone,
            email,
            empresa,
            canal,
            status_pipeline,
            tipo_cliente,
            observacoes,
            consumo_kwh,
            valor_estimado
          ) VALUES (
            p_org_id,
            v_actor_user_id,
            v_assigned_to_user_id,
            v_nome,
            v_telefone_digits,
            v_email,
            v_empresa,
            v_canal,
            v_stage,
            coalesce(v_tipo_cliente, v_tipo_cliente_default, 'residencial'),
            coalesce(v_observacoes, ''),
            coalesce(v_consumo, 0),
            coalesce(v_valor, 0)
          )
          RETURNING id INTO v_target_id;
        ELSE
          INSERT INTO public.leads (
            org_id,
            user_id,
            assigned_to_user_id,
            nome,
            telefone,
            email,
            empresa,
            canal,
            status_pipeline,
            observacoes,
            consumo_kwh,
            valor_estimado
          ) VALUES (
            p_org_id,
            v_actor_user_id,
            v_assigned_to_user_id,
            v_nome,
            v_telefone_digits,
            v_email,
            v_empresa,
            v_canal,
            v_stage,
            coalesce(v_observacoes, ''),
            coalesce(v_consumo, 0),
            coalesce(v_valor, 0)
          )
          RETURNING id INTO v_target_id;
        END IF;

        row_index := v_idx;
        action := 'inserted';
        lead_id := v_target_id;
        error := NULL;
        RETURN NEXT;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      row_index := v_idx;
      action := 'failed';
      lead_id := NULL;
      error := left(coalesce(SQLERRM, 'Erro desconhecido'), 500);
      RETURN NEXT;
    END;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.import_leads_batch(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.import_leads_batch(uuid, jsonb) TO service_role;
