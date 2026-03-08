-- Normalize lead stages globally + resilient batch import for contacts
CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA public;

CREATE OR REPLACE FUNCTION public.normalize_lead_stage(p_raw text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_norm text;
BEGIN
  v_norm := lower(coalesce(trim(p_raw), ''));
  IF v_norm = '' THEN
    RETURN 'novo_lead';
  END IF;

  v_norm := public.unaccent(v_norm);
  v_norm := regexp_replace(v_norm, '[^a-z0-9]+', '_', 'g');
  v_norm := regexp_replace(v_norm, '^_+|_+$', '', 'g');

  CASE v_norm
    WHEN 'novo_lead' THEN RETURN 'novo_lead';
    WHEN 'respondeu' THEN RETURN 'respondeu';
    WHEN 'chamada_agendada' THEN RETURN 'chamada_agendada';
    WHEN 'chamada_realizada' THEN RETURN 'chamada_realizada';
    WHEN 'nao_compareceu' THEN RETURN 'nao_compareceu';
    WHEN 'aguardando_proposta' THEN RETURN 'aguardando_proposta';
    WHEN 'proposta_pronta' THEN RETURN 'proposta_pronta';
    WHEN 'visita_agendada' THEN RETURN 'visita_agendada';
    WHEN 'visita_realizada' THEN RETURN 'visita_realizada';
    WHEN 'proposta_negociacao' THEN RETURN 'proposta_negociacao';
    WHEN 'financiamento' THEN RETURN 'financiamento';
    WHEN 'aprovou_projeto' THEN RETURN 'aprovou_projeto';
    WHEN 'contrato_assinado' THEN RETURN 'contrato_assinado';
    WHEN 'projeto_pago' THEN RETURN 'projeto_pago';
    WHEN 'aguardando_instalacao' THEN RETURN 'aguardando_instalacao';
    WHEN 'projeto_instalado' THEN RETURN 'projeto_instalado';
    WHEN 'coletar_avaliacao' THEN RETURN 'coletar_avaliacao';
    WHEN 'contato_futuro' THEN RETURN 'contato_futuro';
    WHEN 'perdido' THEN RETURN 'perdido';
    WHEN 'novo' THEN RETURN 'novo_lead';
    WHEN 'lead' THEN RETURN 'novo_lead';
    WHEN 'proposta_em_negociacao' THEN RETURN 'proposta_negociacao';
    WHEN 'coletar_avaliacao_90_dias' THEN RETURN 'coletar_avaliacao';
    WHEN 'perdido_desqualificado' THEN RETURN 'perdido';
    ELSE RETURN 'novo_lead';
  END CASE;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_leads_normalize_stage()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.status_pipeline := public.normalize_lead_stage(NEW.status_pipeline);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_leads_normalize_stage ON public.leads;
CREATE TRIGGER tr_leads_normalize_stage
BEFORE INSERT OR UPDATE OF status_pipeline ON public.leads
FOR EACH ROW
EXECUTE FUNCTION public.trg_leads_normalize_stage();

UPDATE public.leads
SET status_pipeline = public.normalize_lead_stage(status_pipeline)
WHERE status_pipeline IS DISTINCT FROM public.normalize_lead_stage(status_pipeline);

CREATE INDEX IF NOT EXISTS idx_leads_org_phone_digits
  ON public.leads (org_id, (regexp_replace(coalesce(telefone, ''), '\D', '', 'g')));

DROP FUNCTION IF EXISTS public.import_leads_batch(uuid, jsonb);
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
  v_observacoes text;
  v_consumo_text text;
  v_valor_text text;
  v_consumo integer;
  v_valor numeric;
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
        error := 'Nome obrigatório';
        RETURN NEXT;
        CONTINUE;
      END IF;

      IF coalesce(v_telefone_digits, '') = '' THEN
        row_index := v_idx;
        action := 'failed';
        lead_id := NULL;
        error := 'Telefone obrigatório';
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
            tipo_cliente = coalesce(v_tipo_cliente, l.tipo_cliente),
            observacoes = coalesce(v_observacoes, l.observacoes),
            consumo_kwh = coalesce(v_consumo, l.consumo_kwh),
            valor_estimado = coalesce(v_valor, l.valor_estimado),
            assigned_to_user_id = coalesce(l.assigned_to_user_id, v_actor_user_id)
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
            assigned_to_user_id = coalesce(l.assigned_to_user_id, v_actor_user_id)
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
            v_actor_user_id,
            v_nome,
            v_telefone_digits,
            v_email,
            v_empresa,
            v_canal,
            v_stage,
            coalesce(v_tipo_cliente, 'residencial'),
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
            v_actor_user_id,
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
