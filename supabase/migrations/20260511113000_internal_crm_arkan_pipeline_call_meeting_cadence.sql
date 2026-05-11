-- ARKAN internal CRM: simplified sales pipeline, call/meeting agenda split and contact cadence.

INSERT INTO internal_crm.pipeline_stages (
  stage_code,
  name,
  sort_order,
  is_active,
  is_terminal,
  win_probability,
  color_token
)
VALUES
  ('novo_lead', 'Novo Lead', 10, true, false, 5, '#2196F3'),
  ('tentando_contato', 'Tentando Contato', 20, true, false, 10, '#F59E0B'),
  ('mql', 'MQL', 30, true, false, 35, '#0EA5E9'),
  ('reuniao_marcada', 'Reuniao Marcada', 40, true, false, 50, '#6366F1'),
  ('reuniao_realizada', 'Reuniao Realizada', 50, true, false, 70, '#14B8A6'),
  ('contrato_fechado', 'Contrato Fechado', 60, true, false, 90, '#22C55E'),
  ('venda_finalizada', 'Venda Finalizada', 70, true, true, 100, '#15803D')
ON CONFLICT (stage_code) DO UPDATE
SET
  name = EXCLUDED.name,
  sort_order = EXCLUDED.sort_order,
  is_active = EXCLUDED.is_active,
  is_terminal = EXCLUDED.is_terminal,
  win_probability = EXCLUDED.win_probability,
  color_token = EXCLUDED.color_token,
  updated_at = now();

WITH mapped AS (
  SELECT
    d.id,
    d.client_id,
    d.stage_code AS old_stage_code,
    CASE
      WHEN d.stage_code IN ('lead_entrante', 'novo_lead') THEN 'novo_lead'
      WHEN d.stage_code IN ('respondeu', 'contato_iniciado', 'nao_compareceu') THEN 'tentando_contato'
      WHEN d.stage_code = 'qualificado' THEN 'mql'
      WHEN d.stage_code = 'chamada_agendada' THEN
        CASE
          WHEN EXISTS (
            SELECT 1
            FROM internal_crm.appointments a
            WHERE a.deal_id = d.id
              AND a.appointment_type IN ('meeting', 'demo')
              AND a.status IN ('scheduled', 'confirmed')
          )
          THEN 'reuniao_marcada'
          ELSE 'tentando_contato'
        END
      WHEN d.stage_code IN ('demo_agendada', 'agendou_reuniao', 'reuniao_agendada') THEN 'reuniao_marcada'
      WHEN d.stage_code IN ('chamada_realizada', 'reuniao_realizada', 'negociacao', 'proposta_enviada') THEN 'reuniao_realizada'
      WHEN d.stage_code IN ('aguardando_pagamento', 'contrato_fechado') THEN 'contrato_fechado'
      WHEN d.stage_code IN ('fechou', 'ganho') THEN
        CASE
          WHEN d.payment_status = 'paid' OR d.paid_at IS NOT NULL THEN 'venda_finalizada'
          ELSE 'contrato_fechado'
        END
      ELSE d.stage_code
    END AS new_stage_code
  FROM internal_crm.deals d
)
INSERT INTO internal_crm.stage_history (
  client_id,
  deal_id,
  from_stage_code,
  to_stage_code,
  changed_by_user_id,
  notes
)
SELECT
  client_id,
  id,
  old_stage_code,
  new_stage_code,
  NULL,
  'migration:arkan_pipeline_call_meeting_cadence'
FROM mapped
WHERE old_stage_code IS DISTINCT FROM new_stage_code;

WITH mapped AS (
  SELECT
    d.id,
    CASE
      WHEN d.stage_code IN ('lead_entrante', 'novo_lead') THEN 'novo_lead'
      WHEN d.stage_code IN ('respondeu', 'contato_iniciado', 'nao_compareceu') THEN 'tentando_contato'
      WHEN d.stage_code = 'qualificado' THEN 'mql'
      WHEN d.stage_code = 'chamada_agendada' THEN
        CASE
          WHEN EXISTS (
            SELECT 1
            FROM internal_crm.appointments a
            WHERE a.deal_id = d.id
              AND a.appointment_type IN ('meeting', 'demo')
              AND a.status IN ('scheduled', 'confirmed')
          )
          THEN 'reuniao_marcada'
          ELSE 'tentando_contato'
        END
      WHEN d.stage_code IN ('demo_agendada', 'agendou_reuniao', 'reuniao_agendada') THEN 'reuniao_marcada'
      WHEN d.stage_code IN ('chamada_realizada', 'reuniao_realizada', 'negociacao', 'proposta_enviada') THEN 'reuniao_realizada'
      WHEN d.stage_code IN ('aguardando_pagamento', 'contrato_fechado') THEN 'contrato_fechado'
      WHEN d.stage_code IN ('fechou', 'ganho') THEN
        CASE
          WHEN d.payment_status = 'paid' OR d.paid_at IS NOT NULL THEN 'venda_finalizada'
          ELSE 'contrato_fechado'
        END
      ELSE d.stage_code
    END AS new_stage_code
  FROM internal_crm.deals d
)
UPDATE internal_crm.deals d
SET
  stage_code = m.new_stage_code,
  status = CASE
    WHEN m.new_stage_code = 'venda_finalizada' THEN 'won'
    WHEN m.new_stage_code = 'nao_fechou' THEN 'lost'
    ELSE 'open'
  END,
  probability = CASE
    WHEN m.new_stage_code = 'novo_lead' THEN 5
    WHEN m.new_stage_code = 'tentando_contato' THEN 10
    WHEN m.new_stage_code = 'mql' THEN 35
    WHEN m.new_stage_code = 'reuniao_marcada' THEN 50
    WHEN m.new_stage_code = 'reuniao_realizada' THEN 70
    WHEN m.new_stage_code = 'contrato_fechado' THEN 90
    WHEN m.new_stage_code = 'venda_finalizada' THEN 100
    ELSE d.probability
  END,
  won_at = CASE WHEN m.new_stage_code = 'venda_finalizada' THEN COALESCE(d.won_at, now()) ELSE d.won_at END,
  closed_at = CASE
    WHEN m.new_stage_code = 'venda_finalizada' OR m.new_stage_code = 'nao_fechou' THEN COALESCE(d.closed_at, now())
    ELSE NULL
  END,
  payment_status = CASE
    WHEN m.new_stage_code = 'venda_finalizada' AND d.payment_method = 'manual' THEN 'paid'
    ELSE d.payment_status
  END,
  paid_at = CASE
    WHEN m.new_stage_code = 'venda_finalizada' AND d.payment_method = 'manual' THEN COALESCE(d.paid_at, now())
    ELSE d.paid_at
  END,
  updated_at = now()
FROM mapped m
WHERE d.id = m.id
  AND d.stage_code IS DISTINCT FROM m.new_stage_code;

WITH latest_deal AS (
  SELECT DISTINCT ON (client_id)
    client_id,
    stage_code
  FROM internal_crm.deals
  ORDER BY client_id, updated_at DESC
)
UPDATE internal_crm.clients c
SET
  current_stage_code = ld.stage_code,
  lifecycle_status = CASE WHEN ld.stage_code = 'venda_finalizada' THEN 'customer_onboarding' ELSE c.lifecycle_status END,
  updated_at = now()
FROM latest_deal ld
WHERE c.id = ld.client_id
  AND c.current_stage_code IS DISTINCT FROM ld.stage_code;

UPDATE internal_crm.pipeline_stages
SET is_active = false, updated_at = now()
WHERE stage_code IN (
  'lead_entrante',
  'respondeu',
  'contato_iniciado',
  'qualificado',
  'chamada_agendada',
  'chamada_realizada',
  'nao_compareceu',
  'negociacao',
  'demo_agendada',
  'agendou_reuniao',
  'reuniao_agendada',
  'reuniao_realizada_old',
  'proposta_enviada',
  'aguardando_pagamento',
  'fechou',
  'ganho',
  'perdido'
);

CREATE OR REPLACE FUNCTION internal_crm.stage_rank(p_stage_code text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE COALESCE(p_stage_code, '')
    WHEN 'venda_finalizada' THEN 100
    WHEN 'contrato_fechado' THEN 90
    WHEN 'reuniao_realizada' THEN 70
    WHEN 'reuniao_marcada' THEN 55
    WHEN 'mql' THEN 40
    WHEN 'tentando_contato' THEN 20
    WHEN 'novo_lead' THEN 10
    ELSE 0
  END;
$$;

CREATE OR REPLACE FUNCTION public.tracking_default_stage_event_map()
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    '{
      "novo_lead": {"event_key":"novo_lead","meta":"Lead","google_ads":null,"ga4":"generate_lead"},
      "mql": {"event_key":"mql","meta":"CompleteRegistration","google_ads":"qualified_lead","ga4":"generate_lead"},
      "reuniao_marcada": {"event_key":"reuniao_marcada","meta":"Schedule","google_ads":"schedule","ga4":"schedule_appointment"},
      "reuniao_realizada": {"event_key":"reuniao_realizada","meta":null,"google_ads":null,"ga4":null},
      "contrato_fechado": {"event_key":"contrato_fechado","meta":null,"google_ads":null,"ga4":null},
      "venda_finalizada": {"event_key":"venda_finalizada","meta":"Purchase","google_ads":"purchase","ga4":"purchase"},
      "agendou_reuniao": {"event_key":"agendou_reuniao","meta":null,"google_ads":null,"ga4":null},
      "chamada_agendada": {"event_key":"chamada_agendada","meta":null,"google_ads":null,"ga4":null},
      "chamada_realizada": {"event_key":"chamada_realizada","meta":"Schedule","google_ads":"schedule","ga4":"schedule_appointment"},
      "fechou": {"event_key":"fechou","meta":"Purchase","google_ads":"purchase","ga4":"purchase"}
    }'::jsonb;
$$;

UPDATE public.org_tracking_settings
SET
  stage_event_map = COALESCE(stage_event_map, '{}'::jsonb) || public.tracking_default_stage_event_map(),
  updated_at = now()
WHERE to_regclass('public.org_tracking_settings') IS NOT NULL;

UPDATE internal_crm.automation_rules
SET
  is_active = false,
  updated_at = now()
WHERE automation_key = 'lp_form_without_schedule_reengage_5m';

UPDATE internal_crm.automation_rules
SET
  trigger_event = 'appointment_scheduled',
  condition = '{"appointment_type":["meeting","demo"]}'::jsonb,
  updated_at = now()
WHERE automation_key IN (
  'lp_form_with_schedule_confirmation',
  'call_reminder_24h',
  'call_reminder_2h',
  'call_reminder_15m'
);

INSERT INTO internal_crm.automation_rules (
  automation_key,
  name,
  description,
  trigger_event,
  condition,
  channel,
  delay_minutes,
  template,
  is_active,
  is_system,
  sort_order,
  cancel_on_event_types,
  metadata
)
VALUES
  (
    'arkan_contact_message_1',
    'ARKAN contato - mensagem imediata',
    'Mensagem enviada quando o vendedor registra a primeira chamada sem atendimento.',
    'call_no_answer',
    '{"cadence_message_key":"arkan_contact_message_1"}'::jsonb,
    'whatsapp_lead',
    0,
    'Boa tarde {{nome}}. Falo em nome da ARKAN, Assessoria de Marketing e vendas que acelera empresas de energia solar em todo Brasil. Recebi o seu interesse para uma consultoria gratuita com nossos especialistas afim de escalar as vendas da sua integradora! Qual o melhor horario para falarmos?',
    true,
    true,
    200,
    ARRAY['call_answered','appointment_scheduled','deal_closed','deal_not_closed'],
    '{}'::jsonb
  ),
  (
    'arkan_contact_message_24h',
    'ARKAN contato - 24h',
    'Mensagem enviada na etapa de 24h da cadencia de contato.',
    'call_no_answer',
    '{"cadence_message_key":"arkan_contact_message_24h"}'::jsonb,
    'whatsapp_lead',
    0,
    'Boa tarde {{nome}}! Entao, tentei contato contigo ontem pra conversarmos sobre como acelerar o seu negocio, mas nao tive sucesso. Me retorna aqui {{nome}} caso tenha interesse em implementar um processo de vendas forte atraves da internet.',
    true,
    true,
    210,
    ARRAY['call_answered','appointment_scheduled','deal_closed','deal_not_closed'],
    '{}'::jsonb
  ),
  (
    'arkan_contact_message_48h',
    'ARKAN contato - 48h',
    'Mensagem enviada na etapa de 48h da cadencia de contato.',
    'call_no_answer',
    '{"cadence_message_key":"arkan_contact_message_48h"}'::jsonb,
    'whatsapp_lead',
    0,
    '{{nome}}, devo considerar a tua falta de resposta como desinteresse na nossa solucao?',
    true,
    true,
    220,
    ARRAY['call_answered','appointment_scheduled','deal_closed','deal_not_closed'],
    '{}'::jsonb
  ),
  (
    'arkan_contact_message_72h',
    'ARKAN contato - 72h',
    'Mensagem enviada na etapa de 72h da cadencia de contato.',
    'call_no_answer',
    '{"cadence_message_key":"arkan_contact_message_72h"}'::jsonb,
    'whatsapp_lead',
    0,
    'Bom dia {{nome}}, temos 2 possibilidades: ou a correria nao esta deixando a gente conversar ou entao voce nao tem mais prioridade em aumentar as vendas no seu negocio com a ajuda da ARKAN. Se for a segunda opcao, pra nao ficar enviando varias mensagens, esse sera meu ultimo contato.',
    true,
    true,
    230,
    ARRAY['call_answered','appointment_scheduled','deal_closed','deal_not_closed'],
    '{}'::jsonb
  )
ON CONFLICT (automation_key) DO UPDATE
SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  trigger_event = EXCLUDED.trigger_event,
  condition = EXCLUDED.condition,
  channel = EXCLUDED.channel,
  delay_minutes = EXCLUDED.delay_minutes,
  template = EXCLUDED.template,
  is_active = EXCLUDED.is_active,
  is_system = EXCLUDED.is_system,
  sort_order = EXCLUDED.sort_order,
  cancel_on_event_types = EXCLUDED.cancel_on_event_types,
  metadata = EXCLUDED.metadata,
  updated_at = now();

UPDATE internal_crm.automation_runs r
SET
  status = 'canceled',
  processed_at = COALESCE(processed_at, now()),
  last_error = 'CANCELED_BY_ARKAN_PIPELINE_RESTRUCTURE'
WHERE r.status = 'pending'
  AND r.automation_key = 'lp_form_without_schedule_reengage_5m';
