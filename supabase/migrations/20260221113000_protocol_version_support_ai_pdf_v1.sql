-- Safe protocol rollout + Support AI foundation
-- Date: 2026-02-21
-- Idempotent migration

-- 1) ai_settings: protocol version + support AI switches
ALTER TABLE IF EXISTS public.ai_settings
  ADD COLUMN IF NOT EXISTS protocol_version text;

ALTER TABLE IF EXISTS public.ai_settings
  ADD COLUMN IF NOT EXISTS respondeu_flow_mode text;

ALTER TABLE IF EXISTS public.ai_settings
  ADD COLUMN IF NOT EXISTS support_ai_enabled boolean;

ALTER TABLE IF EXISTS public.ai_settings
  ADD COLUMN IF NOT EXISTS support_ai_stage_toggles jsonb;

ALTER TABLE IF EXISTS public.ai_settings
  ADD COLUMN IF NOT EXISTS support_ai_auto_disable_on_seller_message boolean;

UPDATE public.ai_settings
SET protocol_version = 'legacy'
WHERE protocol_version IS NULL OR btrim(protocol_version) = '';

UPDATE public.ai_settings
SET respondeu_flow_mode = 'with_call'
WHERE respondeu_flow_mode IS NULL OR btrim(respondeu_flow_mode) = '';

UPDATE public.ai_settings
SET support_ai_enabled = false
WHERE support_ai_enabled IS NULL;

UPDATE public.ai_settings
SET support_ai_auto_disable_on_seller_message = true
WHERE support_ai_auto_disable_on_seller_message IS NULL;

UPDATE public.ai_settings
SET support_ai_stage_toggles = '{}'::jsonb
WHERE support_ai_stage_toggles IS NULL OR jsonb_typeof(support_ai_stage_toggles) <> 'object';

ALTER TABLE IF EXISTS public.ai_settings
  ALTER COLUMN protocol_version SET DEFAULT 'legacy';

ALTER TABLE IF EXISTS public.ai_settings
  ALTER COLUMN respondeu_flow_mode SET DEFAULT 'with_call';

ALTER TABLE IF EXISTS public.ai_settings
  ALTER COLUMN support_ai_enabled SET DEFAULT false;

ALTER TABLE IF EXISTS public.ai_settings
  ALTER COLUMN support_ai_stage_toggles SET DEFAULT '{}'::jsonb;

ALTER TABLE IF EXISTS public.ai_settings
  ALTER COLUMN support_ai_auto_disable_on_seller_message SET DEFAULT true;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'ai_settings'
      AND c.conname = 'ai_settings_protocol_version_chk'
  ) THEN
    ALTER TABLE public.ai_settings
      ADD CONSTRAINT ai_settings_protocol_version_chk
      CHECK (protocol_version IN ('legacy', 'pipeline_pdf_v1'));
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'ai_settings'
      AND c.conname = 'ai_settings_respondeu_flow_mode_chk'
  ) THEN
    ALTER TABLE public.ai_settings
      ADD CONSTRAINT ai_settings_respondeu_flow_mode_chk
      CHECK (respondeu_flow_mode IN ('with_call', 'direct_visit'));
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'ai_settings'
      AND c.conname = 'ai_settings_support_ai_stage_toggles_obj_chk'
  ) THEN
    ALTER TABLE public.ai_settings
      ADD CONSTRAINT ai_settings_support_ai_stage_toggles_obj_chk
      CHECK (support_ai_stage_toggles IS NULL OR jsonb_typeof(support_ai_stage_toggles) = 'object');
  END IF;
END
$$;

-- 2) ai_stage_config: canonical prompt for pipeline_pdf_v1
ALTER TABLE IF EXISTS public.ai_stage_config
  ADD COLUMN IF NOT EXISTS pdf_v1_prompt text;

UPDATE public.ai_stage_config
SET pdf_v1_prompt =
'OBJETIVO: Fazer o lead responder e evoluir para "respondeu".
REGRAS:
- Apresente-se como assistente da empresa, com linguagem humana e curta.
- Pergunte o nome do lead de forma simpática.
- Se não responder, faça no máximo 2 a 3 tentativas leves, sem pressão.
- Ao primeiro retorno útil do lead, preparar transição para "respondeu".
- Não inventar dados; uma pergunta por mensagem.'
WHERE pipeline_stage = 'novo_lead'
  AND (pdf_v1_prompt IS NULL OR btrim(pdf_v1_prompt) = '');

UPDATE public.ai_stage_config
SET pdf_v1_prompt =
'OBJETIVO: Qualificar para chamada agendada OU visita agendada, seguindo BANT mínimo.
REGRAS:
- Conduzir fluxo por segmento (casa, empresa, agro, usina/investimento).
- Coletar contexto essencial sem virar interrogatório.
- Para mover para visita, validar BANT mínimo (Budget, Authority, Timing + necessidade/dor).
- Se processo comercial exigir chamada, priorizar chamada agendada com 2 opções de horário.
- Se lead pedir "só WhatsApp", pode seguir por BANT curto e então visita.
- Nunca pular validações mínimas antes de mover etapa.'
WHERE pipeline_stage = 'respondeu'
  AND (pdf_v1_prompt IS NULL OR btrim(pdf_v1_prompt) = '');

UPDATE public.ai_stage_config
SET pdf_v1_prompt =
'OBJETIVO: Recuperar no-show com empatia e levar para chamada agendada ou visita agendada.
CADÊNCIA OPERACIONAL:
- D0: contato imediato pós no-show (5-15 min).
- D+1: segundo follow-up.
- D+3: última tentativa.
REGRAS:
- Linguagem leve, sem culpa, uma pergunta por mensagem.
- Sempre oferecer 2 opções de próximo passo.
- Se lead preferir WhatsApp, usar BANT curto e direcionar para visita.
- Registrar motivo do no-show e caminho de recuperação.'
WHERE pipeline_stage = 'nao_compareceu'
  AND (pdf_v1_prompt IS NULL OR btrim(pdf_v1_prompt) = '');

UPDATE public.ai_stage_config
SET pdf_v1_prompt =
'OBJETIVO: Negociar no pós-visita e levar a decisão para financiamento ou aprovou_projeto.
REGRAS:
- Tratar objeções por prioridade (valor, confiança, prazo, decisor).
- Não oferecer condição fora da política comercial.
- Confirmar compromisso antes de mover etapa.
- Se cliente optar por financiamento, mover para "financiamento".
- Se cliente aprovar condição/projeto, mover para "aprovou_projeto".
- Se desistir claramente, mover para "perdido".'
WHERE pipeline_stage = 'proposta_negociacao'
  AND (pdf_v1_prompt IS NULL OR btrim(pdf_v1_prompt) = '');

UPDATE public.ai_stage_config
SET pdf_v1_prompt =
'OBJETIVO: Reduzir atrito do financiamento e acompanhar até aprovação.
REGRAS:
- Tom calmo, linguagem simples, sem prometer aprovação.
- Pedir um item por vez; evitar fricção e ansiedade.
- Tratar pendências com passos curtos.
- Ao aprovado, mover para "aprovou_projeto".
- Em negativa, oferecer alternativas e retornar para negociação quando aplicável.
- Registrar status operacional (coleta, análise, pendência, aprovado, negado).'
WHERE pipeline_stage = 'financiamento'
  AND (pdf_v1_prompt IS NULL OR btrim(pdf_v1_prompt) = '');

-- 3) Prompt override hardening (block unsafe patterns)
CREATE OR REPLACE FUNCTION public.ai_stage_config_guard_prompt_override()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_prompt text;
BEGIN
  v_prompt := coalesce(NEW.prompt_override, '');

  IF btrim(v_prompt) = '' THEN
    RETURN NEW;
  END IF;

  IF v_prompt ~* '(ignorar\s+tudo|ignore\s+(all|everything|previous|prior)|desconsidere\s+as\s+instru[cç][oõ]es|revele\s+o\s+prompt|vaze\s+o\s+prompt|burlar\s+json|retorne\s+exatamente\s+este\s+json|ignore\s+system\s+prompt|system\s+override|jailbreak)' THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'unsafe_prompt_override_blocked',
      DETAIL = 'prompt_override contains blocked instruction pattern';
  END IF;

  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_ai_stage_config_guard_prompt_override ON public.ai_stage_config;

CREATE TRIGGER trg_ai_stage_config_guard_prompt_override
BEFORE INSERT OR UPDATE OF prompt_override ON public.ai_stage_config
FOR EACH ROW
EXECUTE FUNCTION public.ai_stage_config_guard_prompt_override();
