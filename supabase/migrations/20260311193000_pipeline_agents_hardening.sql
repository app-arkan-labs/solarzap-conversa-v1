-- Hardening migration:
-- 1) remove any legacy/hardcoded cron worker entries for process-agent-jobs
-- 2) safely activate seeded special agents by prompt fingerprint (not by updated_at)

DO $$
DECLARE
  v_job record;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') THEN
    FOR v_job IN
      SELECT jobid
      FROM cron.job
      WHERE jobname = 'process-agent-jobs-worker'
         OR command ILIKE '%/functions/v1/process-agent-jobs%'
    LOOP
      PERFORM cron.unschedule(v_job.jobid);
    END LOOP;
  END IF;
END
$$;

WITH defaults(pipeline_stage, agent_goal, default_prompt) AS (
  VALUES
    (
      'chamada_realizada'::text,
      'Enviar mensagem pos-ligacao conduzindo ao proximo passo'::text,
      'PROTOCOLO_BASE: PIPELINE_PDF_V1
ETAPA: CHAMADA_REALIZADA
OBJETIVO: enviar mensagem pos-ligacao em ate 2 frases, referenciando o feedback salvo e conduzindo ao proximo passo.
REGRAS: usar apenas o comentario da ligacao como verdade; nao inventar informacoes; nao repetir perguntas respondidas; finalizar com CTA unico para proposta, visita ou dado faltante.'::text
    ),
    (
      'follow_up'::text,
      'Reengajar lead que parou de responder'::text,
      'PROTOCOLO_BASE: PIPELINE_PDF_V1
ETAPA: FOLLOW_UP
OBJETIVO: reengajar lead sem resposta em ate 5 tentativas.
REGRAS: 1-2 frases, uma pergunta por mensagem, variacao obrigatoria entre tentativas, referenciar historico real, sem pressao agressiva.
STEPS: 1 toque leve; 2 beneficio novo; 3 micro-urgencia; 4 empatia; 5 despedida leve.'::text
    ),
    (
      'agente_disparos'::text,
      'Qualificar lead outbound oriundo de disparo'::text,
      'PROTOCOLO_BASE: PIPELINE_PDF_V1
ETAPA: RESPONDEU_DISPAROS
OBJETIVO: qualificar lead vindo de campanha outbound e levar para chamada_agendada ou visita_agendada.
REGRAS: reconhecer contexto da campanha, validar interesse em energia solar, coletar dados minimos sem formulario longo, conduzir para agendamento com duas opcoes de horario.'::text
    )
)
UPDATE public.ai_stage_config c
SET is_active = true,
    updated_at = now()
FROM defaults d
WHERE c.pipeline_stage = d.pipeline_stage
  AND c.is_active = false
  AND COALESCE(c.prompt_override, '') = ''
  AND COALESCE(c.agent_goal, '') = d.agent_goal
  AND regexp_replace(COALESCE(c.default_prompt, ''), '\s+', ' ', 'g')
      = regexp_replace(d.default_prompt, '\s+', ' ', 'g');
