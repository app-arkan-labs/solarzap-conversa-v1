-- Incremental prompt guardrails for pipeline qualification stages
-- Scope: respondeu + nao_compareceu
-- Policy: append-only, idempotent, do not touch prompt_override

DO $$
DECLARE
  marker_pattern text := '%INCREMENTO_CIRURGICO_V2_20260306%';
  respondeu_increment text := E'\n\nINCREMENTO_CIRURGICO_V2_20260306_RESPONDEU\nCONSUMO FUTURO / CARGA REPRIMIDA (OBRIGATORIO)\n- Se o lead disser que hoje consome pouco porque evita usar equipamentos (ex.: 2 ar-condicionados, carro eletrico), tratar como consumo reprimido.\n- Nao dimensionar apenas pela conta atual; considerar consumo-alvo desejado.\n- Coletar 1 dado por vez em linguagem simples:\n  (a) equipamento + quantidade\n  (b) horas de uso por dia\n  (c) dias de uso por mes\n  (d) potencia (W/kW) ou BTU/modelo, se souber\n- Calculo base para cada item: consumo_adicional_kwh_mes = quantidade x potencia_kw x horas_dia x dias_mes.\n- Se faltar potencia/modelo, usar faixa preliminar com hipotese explicita e pedir confirmacao.\n- So atualizar consumption_kwh_month com confidence=high quando o consumo-alvo estiver confirmado pelo lead.\n- Enquanto nao confirmar, registrar premissas em average_bill_context e need_reason.\n\nPROMOCAO / ANUNCIO (OBRIGATORIO)\n- Se o lead citar promocao/kit promocional/anuncio, reconhecer contexto.\n- So citar valor/condicao de promocao se estiver explicito no historico, comentarios CRM, KB ou mensagem do lead.\n- Se nao houver dado confiavel, nao inventar: fazer 1 pergunta objetiva para confirmar a promocao e continuar qualificacao.\n\nCONTINUIDADE DA ETAPA (OBRIGATORIO)\n- Na etapa RESPONDEU, nao dizer "ja volto com proposta", "vou montar proposta agora" ou equivalente.\n- O objetivo aqui e qualificar e conduzir para agendamento.\n- Se o lead nao quiser ligacao, seguir rota direct_visit/BANT por WhatsApp ate visita_agendada.';
  nao_compareceu_increment text := E'\n\nINCREMENTO_CIRURGICO_V2_20260306_NAO_COMPARECEU\n- Em ROTA_B, aplicar a mesma regra de consumo futuro/carga reprimida da etapa RESPONDEU.\n- Em ROTA_B, aplicar a mesma regra de promocao: reconhecer, nao inventar valor, confirmar 1 dado objetivo e seguir qualificacao.\n- Mesmo com conta/consumo em maos, nao prometer retorno com proposta; fechar reagendamento/agendamento com criterio.';
  has_pdf_v1_prompt boolean := false;
BEGIN
  -- default_prompt append (always available in current schema)
  UPDATE public.ai_stage_config
  SET default_prompt = default_prompt || respondeu_increment
  WHERE pipeline_stage = 'respondeu'
    AND COALESCE(default_prompt, '') <> ''
    AND default_prompt NOT LIKE marker_pattern;

  UPDATE public.ai_stage_config
  SET default_prompt = default_prompt || nao_compareceu_increment
  WHERE pipeline_stage = 'nao_compareceu'
    AND COALESCE(default_prompt, '') <> ''
    AND default_prompt NOT LIKE marker_pattern;

  -- pdf_v1_prompt append only when column exists
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'ai_stage_config'
      AND column_name = 'pdf_v1_prompt'
  ) INTO has_pdf_v1_prompt;

  IF has_pdf_v1_prompt THEN
    EXECUTE format(
      $sql$
      UPDATE public.ai_stage_config
      SET pdf_v1_prompt = pdf_v1_prompt || %L
      WHERE pipeline_stage = 'respondeu'
        AND COALESCE(pdf_v1_prompt, '') <> ''
        AND pdf_v1_prompt NOT LIKE %L
      $sql$,
      respondeu_increment,
      marker_pattern
    );

    EXECUTE format(
      $sql$
      UPDATE public.ai_stage_config
      SET pdf_v1_prompt = pdf_v1_prompt || %L
      WHERE pipeline_stage = 'nao_compareceu'
        AND COALESCE(pdf_v1_prompt, '') <> ''
        AND pdf_v1_prompt NOT LIKE %L
      $sql$,
      nao_compareceu_increment,
      marker_pattern
    );
  END IF;
END
$$;
