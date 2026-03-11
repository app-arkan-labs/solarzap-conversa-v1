-- Safe backfill for pipeline-agent configs added after initial org seeding.
-- Creates missing rows for the async/special agents without re-enabling rows that may
-- have been explicitly disabled by an operator.

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
INSERT INTO public.ai_stage_config (
  org_id,
  pipeline_stage,
  is_active,
  agent_goal,
  default_prompt,
  created_at,
  updated_at
)
SELECT
  o.id,
  d.pipeline_stage,
  true,
  d.agent_goal,
  d.default_prompt,
  now(),
  now()
FROM public.organizations o
CROSS JOIN defaults d
WHERE NOT EXISTS (
  SELECT 1
  FROM public.ai_stage_config c
  WHERE c.org_id = o.id
    AND c.pipeline_stage = d.pipeline_stage
);
