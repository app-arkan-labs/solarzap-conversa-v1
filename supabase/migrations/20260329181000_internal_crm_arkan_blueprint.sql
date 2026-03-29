ALTER TABLE internal_crm.deals
  ADD COLUMN IF NOT EXISTS primary_offer_code text,
  ADD COLUMN IF NOT EXISTS closed_product_code text,
  ADD COLUMN IF NOT EXISTS mentorship_variant text,
  ADD COLUMN IF NOT EXISTS software_status text NOT NULL DEFAULT 'not_offered' CHECK (
    software_status IN (
      'not_offered',
      'offered',
      'accepted',
      'declined',
      'trial_offered',
      'trial_active',
      'trial_declined',
      'signed'
    )
  ),
  ADD COLUMN IF NOT EXISTS landing_page_status text NOT NULL DEFAULT 'not_offered' CHECK (
    landing_page_status IN (
      'not_offered',
      'offered',
      'accepted',
      'declined',
      'in_delivery',
      'delivered'
    )
  ),
  ADD COLUMN IF NOT EXISTS traffic_status text NOT NULL DEFAULT 'not_offered' CHECK (
    traffic_status IN (
      'not_offered',
      'offered',
      'accepted',
      'declined',
      'active'
    )
  ),
  ADD COLUMN IF NOT EXISTS trial_status text NOT NULL DEFAULT 'not_offered' CHECK (
    trial_status IN (
      'not_offered',
      'offered',
      'accepted',
      'expired',
      'converted',
      'declined'
    )
  ),
  ADD COLUMN IF NOT EXISTS next_offer_code text,
  ADD COLUMN IF NOT EXISTS next_offer_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_automation_key text,
  ADD COLUMN IF NOT EXISTS commercial_context jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD CONSTRAINT internal_crm_deals_commercial_context_is_object_chk CHECK (jsonb_typeof(commercial_context) = 'object');

CREATE INDEX IF NOT EXISTS idx_internal_crm_deals_next_offer_at
  ON internal_crm.deals (next_offer_at)
  WHERE next_offer_at IS NOT NULL;

UPDATE internal_crm.products
SET is_active = false,
    updated_at = now()
WHERE product_code IN (
  'mentoria_aceleracao_1',
  'mentoria_aceleracao_2',
  'mentoria_aceleracao_3'
);

INSERT INTO internal_crm.products (
  product_code,
  name,
  billing_type,
  payment_method,
  is_active,
  sort_order,
  metadata
)
VALUES
  ('mentoria_1000', 'Mentoria R$1000 · 1 encontro', 'one_time', 'manual', true, 5, '{}'::jsonb),
  ('mentoria_1500', 'Mentoria R$1500 · 4 encontros', 'one_time', 'manual', true, 10, '{}'::jsonb),
  ('mentoria_2000', 'Mentoria R$2000 · premium', 'one_time', 'manual', true, 15, '{}'::jsonb),
  ('software_300', 'Software plano do meio · R$300/mes', 'recurring', 'manual', true, 20, '{}'::jsonb),
  ('mentoria_3x1000', 'Mentoria 3 encontros · R$1000', 'one_time', 'manual', true, 25, '{}'::jsonb),
  ('mentoria_4x1200', 'Mentoria 4 encontros · R$1200', 'one_time', 'manual', true, 30, '{}'::jsonb),
  ('trial_7d', 'Trial software 7 dias', 'one_time', 'manual', true, 35, '{}'::jsonb),
  ('landing_page_500', 'Landing Page simples · R$500', 'one_time', 'manual', true, 40, '{}'::jsonb),
  ('landing_page_1000', 'Landing Page forte · R$1000', 'one_time', 'manual', true, 45, '{}'::jsonb),
  ('trafego_pago_1200', 'Gestao de trafego pago · R$1200/mes', 'recurring', 'manual', true, 50, '{}'::jsonb)
ON CONFLICT (product_code) DO UPDATE
SET
  name = EXCLUDED.name,
  billing_type = EXCLUDED.billing_type,
  payment_method = EXCLUDED.payment_method,
  is_active = EXCLUDED.is_active,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();

INSERT INTO internal_crm.product_prices (
  product_code,
  price_cents,
  currency,
  stripe_price_id,
  valid_from
)
VALUES
  ('mentoria_1000', 100000, 'BRL', NULL, '2026-03-29T00:00:00Z'),
  ('mentoria_1500', 150000, 'BRL', NULL, '2026-03-29T00:00:00Z'),
  ('mentoria_2000', 200000, 'BRL', NULL, '2026-03-29T00:00:00Z'),
  ('software_300', 30000, 'BRL', NULL, '2026-03-29T00:00:00Z'),
  ('mentoria_3x1000', 100000, 'BRL', NULL, '2026-03-29T00:00:00Z'),
  ('mentoria_4x1200', 120000, 'BRL', NULL, '2026-03-29T00:00:00Z'),
  ('trial_7d', 0, 'BRL', NULL, '2026-03-29T00:00:00Z'),
  ('landing_page_500', 50000, 'BRL', NULL, '2026-03-29T00:00:00Z'),
  ('landing_page_1000', 100000, 'BRL', NULL, '2026-03-29T00:00:00Z'),
  ('trafego_pago_1200', 120000, 'BRL', NULL, '2026-03-29T00:00:00Z')
ON CONFLICT (product_code, valid_from) DO UPDATE
SET
  price_cents = EXCLUDED.price_cents,
  currency = EXCLUDED.currency,
  stripe_price_id = EXCLUDED.stripe_price_id,
  updated_at = now();

CREATE TABLE IF NOT EXISTS internal_crm.automation_settings (
  scope_key text PRIMARY KEY,
  default_whatsapp_instance_id uuid REFERENCES internal_crm.whatsapp_instances(id) ON DELETE SET NULL,
  admin_notification_numbers text[] NOT NULL DEFAULT '{}'::text[],
  notification_cooldown_minutes integer NOT NULL DEFAULT 60 CHECK (
    notification_cooldown_minutes BETWEEN 1 AND 1440
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS internal_crm.automation_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_key text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  trigger_event text NOT NULL,
  condition jsonb NOT NULL DEFAULT '{}'::jsonb,
  channel text NOT NULL CHECK (channel IN ('whatsapp_lead', 'whatsapp_admin', 'internal_task')),
  delay_minutes integer NOT NULL DEFAULT 0 CHECK (delay_minutes BETWEEN -525600 AND 525600),
  template text,
  is_active boolean NOT NULL DEFAULT true,
  is_system boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  last_run_at timestamptz,
  last_run_status text CHECK (last_run_status IN ('pending', 'completed', 'failed', 'canceled', 'skipped')),
  cancel_on_event_types text[] NOT NULL DEFAULT '{}'::text[],
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT internal_crm_automation_rules_condition_is_object_chk CHECK (jsonb_typeof(condition) = 'object'),
  CONSTRAINT internal_crm_automation_rules_metadata_is_object_chk CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_internal_crm_automation_rules_trigger_active
  ON internal_crm.automation_rules (trigger_event, is_active, sort_order);

CREATE TABLE IF NOT EXISTS internal_crm.automation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id uuid NOT NULL REFERENCES internal_crm.automation_rules(id) ON DELETE CASCADE,
  automation_key text NOT NULL,
  client_id uuid REFERENCES internal_crm.clients(id) ON DELETE CASCADE,
  deal_id uuid REFERENCES internal_crm.deals(id) ON DELETE CASCADE,
  appointment_id uuid REFERENCES internal_crm.appointments(id) ON DELETE SET NULL,
  conversation_id uuid REFERENCES internal_crm.conversations(id) ON DELETE SET NULL,
  trigger_event text NOT NULL,
  channel text NOT NULL CHECK (channel IN ('whatsapp_lead', 'whatsapp_admin', 'internal_task')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'canceled', 'skipped')),
  scheduled_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  dedupe_key text,
  attempt_count integer NOT NULL DEFAULT 0,
  last_error text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  result_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT internal_crm_automation_runs_payload_is_object_chk CHECK (jsonb_typeof(payload) = 'object'),
  CONSTRAINT internal_crm_automation_runs_result_payload_is_object_chk CHECK (jsonb_typeof(result_payload) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_internal_crm_automation_runs_status_schedule
  ON internal_crm.automation_runs (status, scheduled_at);

CREATE INDEX IF NOT EXISTS idx_internal_crm_automation_runs_client
  ON internal_crm.automation_runs (client_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_internal_crm_automation_runs_dedupe
  ON internal_crm.automation_runs (dedupe_key)
  WHERE dedupe_key IS NOT NULL;

ALTER TABLE internal_crm.automation_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE internal_crm.automation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE internal_crm.automation_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS internal_crm_automation_settings_service_all ON internal_crm.automation_settings;
CREATE POLICY internal_crm_automation_settings_service_all
  ON internal_crm.automation_settings
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS internal_crm_automation_settings_auth_read ON internal_crm.automation_settings;
CREATE POLICY internal_crm_automation_settings_auth_read
  ON internal_crm.automation_settings
  FOR SELECT TO authenticated
  USING (internal_crm.current_user_crm_role() <> 'none');

DROP POLICY IF EXISTS internal_crm_automation_settings_auth_write ON internal_crm.automation_settings;
CREATE POLICY internal_crm_automation_settings_auth_write
  ON internal_crm.automation_settings
  FOR ALL TO authenticated
  USING (internal_crm.current_user_can_write())
  WITH CHECK (internal_crm.current_user_can_write());

DROP POLICY IF EXISTS internal_crm_automation_rules_service_all ON internal_crm.automation_rules;
CREATE POLICY internal_crm_automation_rules_service_all
  ON internal_crm.automation_rules
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS internal_crm_automation_rules_auth_read ON internal_crm.automation_rules;
CREATE POLICY internal_crm_automation_rules_auth_read
  ON internal_crm.automation_rules
  FOR SELECT TO authenticated
  USING (internal_crm.current_user_crm_role() <> 'none');

DROP POLICY IF EXISTS internal_crm_automation_rules_auth_write ON internal_crm.automation_rules;
CREATE POLICY internal_crm_automation_rules_auth_write
  ON internal_crm.automation_rules
  FOR ALL TO authenticated
  USING (internal_crm.current_user_can_write())
  WITH CHECK (internal_crm.current_user_can_write());

DROP POLICY IF EXISTS internal_crm_automation_runs_service_all ON internal_crm.automation_runs;
CREATE POLICY internal_crm_automation_runs_service_all
  ON internal_crm.automation_runs
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS internal_crm_automation_runs_auth_read ON internal_crm.automation_runs;
CREATE POLICY internal_crm_automation_runs_auth_read
  ON internal_crm.automation_runs
  FOR SELECT TO authenticated
  USING (internal_crm.current_user_crm_role() <> 'none');

DROP POLICY IF EXISTS internal_crm_automation_runs_auth_write ON internal_crm.automation_runs;
CREATE POLICY internal_crm_automation_runs_auth_write
  ON internal_crm.automation_runs
  FOR ALL TO authenticated
  USING (internal_crm.current_user_can_write())
  WITH CHECK (internal_crm.current_user_can_write());

DROP TRIGGER IF EXISTS trg_internal_crm_automation_settings_updated_at ON internal_crm.automation_settings;
CREATE TRIGGER trg_internal_crm_automation_settings_updated_at
  BEFORE UPDATE ON internal_crm.automation_settings
  FOR EACH ROW
  EXECUTE FUNCTION internal_crm.set_updated_at();

DROP TRIGGER IF EXISTS trg_internal_crm_automation_rules_updated_at ON internal_crm.automation_rules;
CREATE TRIGGER trg_internal_crm_automation_rules_updated_at
  BEFORE UPDATE ON internal_crm.automation_rules
  FOR EACH ROW
  EXECUTE FUNCTION internal_crm.set_updated_at();

DROP TRIGGER IF EXISTS trg_internal_crm_automation_runs_updated_at ON internal_crm.automation_runs;
CREATE TRIGGER trg_internal_crm_automation_runs_updated_at
  BEFORE UPDATE ON internal_crm.automation_runs
  FOR EACH ROW
  EXECUTE FUNCTION internal_crm.set_updated_at();

CREATE OR REPLACE FUNCTION internal_crm.claim_due_automation_runs(p_limit integer DEFAULT 20)
RETURNS TABLE (
  id uuid,
  automation_id uuid,
  automation_key text,
  client_id uuid,
  deal_id uuid,
  appointment_id uuid,
  conversation_id uuid,
  trigger_event text,
  channel text,
  scheduled_at timestamptz,
  payload jsonb,
  attempt_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = internal_crm
AS $$
BEGIN
  RETURN QUERY
  WITH due AS (
    SELECT r.id
    FROM internal_crm.automation_runs r
    WHERE r.status = 'pending'
      AND r.scheduled_at <= now()
    ORDER BY r.scheduled_at ASC, r.created_at ASC, r.id ASC
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 20), 200))
    FOR UPDATE SKIP LOCKED
  ),
  updated AS (
    UPDATE internal_crm.automation_runs r
    SET status = 'processing', updated_at = now()
    FROM due
    WHERE r.id = due.id
      AND r.status = 'pending'
    RETURNING r.id, r.automation_id, r.automation_key, r.client_id, r.deal_id, r.appointment_id, r.conversation_id, r.trigger_event, r.channel, r.scheduled_at, r.payload, r.attempt_count
  )
  SELECT u.id, u.automation_id, u.automation_key, u.client_id, u.deal_id, u.appointment_id, u.conversation_id, u.trigger_event, u.channel, u.scheduled_at, u.payload, u.attempt_count
  FROM updated u;
END;
$$;

GRANT EXECUTE ON FUNCTION internal_crm.claim_due_automation_runs(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION internal_crm.claim_due_automation_runs(integer) TO service_role;

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
  ('novo_lead', 'Novo Lead', 10, true, false, 5, 'sky'),
  ('respondeu', 'Respondeu', 20, true, false, 15, 'amber'),
  ('chamada_agendada', 'Chamada Agendada', 30, true, false, 35, 'indigo'),
  ('chamada_realizada', 'Chamada Realizada', 40, true, false, 55, 'cyan'),
  ('nao_compareceu', 'Nao Compareceu', 50, true, false, 20, 'rose'),
  ('negociacao', 'Negociacao', 60, true, false, 75, 'orange'),
  ('fechou', 'Fechou', 70, true, true, 100, 'emerald'),
  ('nao_fechou', 'Nao Fechou', 80, true, true, 5, 'zinc')
ON CONFLICT (stage_code) DO UPDATE
SET
  name = EXCLUDED.name,
  sort_order = EXCLUDED.sort_order,
  is_active = EXCLUDED.is_active,
  is_terminal = EXCLUDED.is_terminal,
  win_probability = EXCLUDED.win_probability,
  color_token = EXCLUDED.color_token,
  updated_at = now();

UPDATE internal_crm.deals
SET stage_code = CASE stage_code
  WHEN 'lead_entrante' THEN 'novo_lead'
  WHEN 'contato_iniciado' THEN 'respondeu'
  WHEN 'qualificado' THEN 'respondeu'
  WHEN 'demo_agendada' THEN 'chamada_agendada'
  WHEN 'proposta_enviada' THEN 'negociacao'
  WHEN 'aguardando_pagamento' THEN 'negociacao'
  WHEN 'ganho' THEN 'fechou'
  WHEN 'perdido' THEN 'nao_fechou'
  ELSE stage_code
END
WHERE stage_code IN (
  'lead_entrante',
  'contato_iniciado',
  'qualificado',
  'demo_agendada',
  'proposta_enviada',
  'aguardando_pagamento',
  'ganho',
  'perdido'
);

UPDATE internal_crm.clients
SET current_stage_code = CASE current_stage_code
  WHEN 'lead_entrante' THEN 'novo_lead'
  WHEN 'contato_iniciado' THEN 'respondeu'
  WHEN 'qualificado' THEN 'respondeu'
  WHEN 'demo_agendada' THEN 'chamada_agendada'
  WHEN 'proposta_enviada' THEN 'negociacao'
  WHEN 'aguardando_pagamento' THEN 'negociacao'
  WHEN 'ganho' THEN 'fechou'
  WHEN 'perdido' THEN 'nao_fechou'
  ELSE current_stage_code
END
WHERE current_stage_code IN (
  'lead_entrante',
  'contato_iniciado',
  'qualificado',
  'demo_agendada',
  'proposta_enviada',
  'aguardando_pagamento',
  'ganho',
  'perdido'
);

UPDATE internal_crm.pipeline_stages
SET is_active = false,
    updated_at = now()
WHERE stage_code IN (
  'lead_entrante',
  'contato_iniciado',
  'qualificado',
  'demo_agendada',
  'proposta_enviada',
  'aguardando_pagamento',
  'ganho',
  'perdido'
);

INSERT INTO internal_crm.automation_settings (
  scope_key,
  default_whatsapp_instance_id,
  admin_notification_numbers,
  notification_cooldown_minutes
)
VALUES (
  'default',
  NULL,
  '{}'::text[],
  60
)
ON CONFLICT (scope_key) DO NOTHING;

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
    'lp_form_without_schedule_reengage_5m',
    'Lead LP sem agendamento · 5 min',
    'Convida o lead da landing page a reagendar quando o formulario chega sem call marcada.',
    'lp_form_submitted',
    '{"has_scheduled_call":false}'::jsonb,
    'whatsapp_lead',
    5,
    'Oi, {{nome}}. Vi seu preenchimento aqui na ARKAN agora ha pouco. Para eu entender seu cenario e te mostrar o melhor caminho, escolhe aqui o melhor horario da chamada: {{link_agendamento}}',
    true,
    true,
    10,
    ARRAY['appointment_scheduled'],
    '{}'::jsonb
  ),
  (
    'lp_form_with_schedule_confirmation',
    'Confirmacao imediata de agendamento',
    'Envia a confirmacao imediata quando o lead ja entra com call marcada.',
    'lp_form_submitted',
    '{"has_scheduled_call":true}'::jsonb,
    'whatsapp_lead',
    0,
    'Perfeito, {{nome}}. Sua chamada ficou agendada para {{data_hora}}. Este e o link da reuniao: {{link_reuniao}}. Se surgir algum imprevisto, me avise por aqui.',
    true,
    true,
    20,
    ARRAY['appointment_canceled'],
    '{"schedule_anchor":"event_time"}'::jsonb
  ),
  (
    'call_reminder_24h',
    'Lembrete de call · 24h',
    'Lembrete automatico 24h antes da chamada agendada.',
    'appointment_scheduled',
    '{"appointment_type":"call"}'::jsonb,
    'whatsapp_lead',
    -1440,
    'Passando para confirmar nossa chamada de amanha as {{hora}}. Se possivel, separa 30 a 40 minutos para fazermos um diagnostico bom do seu cenario.',
    true,
    true,
    30,
    ARRAY['appointment_rescheduled','appointment_canceled','appointment_done','appointment_no_show'],
    '{"schedule_anchor":"appointment_start"}'::jsonb
  ),
  (
    'call_reminder_2h',
    'Lembrete de call · 2h',
    'Lembrete automatico 2h antes da chamada agendada.',
    'appointment_scheduled',
    '{"appointment_type":"call"}'::jsonb,
    'whatsapp_lead',
    -120,
    'Tudo certo para nossa chamada hoje as {{hora}}? Te mando novamente o link: {{link_reuniao}}',
    true,
    true,
    40,
    ARRAY['appointment_rescheduled','appointment_canceled','appointment_done','appointment_no_show'],
    '{"schedule_anchor":"appointment_start"}'::jsonb
  ),
  (
    'call_reminder_15m',
    'Lembrete de call · 15 min',
    'Lembrete automatico 15 minutos antes da chamada agendada.',
    'appointment_scheduled',
    '{"appointment_type":"call"}'::jsonb,
    'whatsapp_lead',
    -15,
    'Estamos quase na hora. Daqui 15 minutos entramos na chamada: {{link_reuniao}}',
    true,
    true,
    50,
    ARRAY['appointment_rescheduled','appointment_canceled','appointment_done','appointment_no_show'],
    '{"schedule_anchor":"appointment_start"}'::jsonb
  ),
  (
    'no_show_recovery_10m',
    'Nao compareceu · 10 min',
    'Primeiro toque de reagendamento apos no-show.',
    'appointment_no_show',
    '{"appointment_type":"call"}'::jsonb,
    'whatsapp_lead',
    10,
    'Oi, {{nome}}. Te esperei agora na chamada e imagino que pode ter surgido algum imprevisto. Se quiser, pode reagendar direto por aqui: {{link_agendamento}}',
    true,
    true,
    60,
    ARRAY['appointment_rescheduled'],
    '{}'::jsonb
  ),
  (
    'no_show_recovery_d1',
    'Nao compareceu · D+1',
    'Segundo toque leve para reagendamento apos no-show.',
    'appointment_no_show',
    '{"appointment_type":"call"}'::jsonb,
    'whatsapp_lead',
    1440,
    'Passando para ver se ainda faz sentido retomarmos. Se quiser, escolhe um novo horario aqui: {{link_agendamento}}',
    true,
    true,
    70,
    ARRAY['appointment_rescheduled'],
    '{}'::jsonb
  ),
  (
    'no_show_recovery_d3',
    'Nao compareceu · D+3',
    'Ultimo toque leve para reagendamento apos no-show.',
    'appointment_no_show',
    '{"appointment_type":"call"}'::jsonb,
    'whatsapp_lead',
    4320,
    'Para nao ficar te cobrando, vou deixar o link por aqui e voce agenda no melhor momento: {{link_agendamento}}',
    true,
    true,
    80,
    ARRAY['appointment_rescheduled'],
    '{}'::jsonb
  ),
  (
    'admin_lp_new_lead',
    'Alerta admin · novo lead LP',
    'Dispara alerta operacional para o celular quando entra um novo lead da landing page.',
    'lp_form_submitted',
    '{}'::jsonb,
    'whatsapp_admin',
    0,
    'Novo lead LP: {{nome}} entrou em {{etapa}}. Abrir no CRM: {{crm_url}}',
    true,
    true,
    90,
    ARRAY[]::text[],
    '{"create_task":true,"task_title":"Novo lead LP para abordar","task_kind":"next_action"}'::jsonb
  ),
  (
    'admin_call_scheduled',
    'Alerta admin · chamada agendada',
    'Avisa no celular quando o lead cai em chamada agendada.',
    'appointment_scheduled',
    '{"appointment_type":"call"}'::jsonb,
    'whatsapp_admin',
    0,
    'Lead em Chamada Agendada: {{nome}} para {{data_hora}}. Abrir no CRM: {{crm_url}}',
    true,
    true,
    100,
    ARRAY['appointment_canceled'],
    '{"create_task":true,"task_title":"Acompanhar chamada agendada","task_kind":"next_action"}'::jsonb
  ),
  (
    'admin_call_reminder_2h',
    'Alerta admin · call em 2h',
    'Lembrete operacional para o celular 2h antes da call.',
    'appointment_scheduled',
    '{"appointment_type":"call"}'::jsonb,
    'whatsapp_admin',
    -120,
    'Em 2h: chamada de {{nome}}. Abrir no CRM: {{crm_url}}',
    true,
    true,
    110,
    ARRAY['appointment_rescheduled','appointment_canceled','appointment_done','appointment_no_show'],
    '{"schedule_anchor":"appointment_start"}'::jsonb
  ),
  (
    'admin_call_reminder_15m',
    'Alerta admin · call em 15 min',
    'Lembrete operacional para o celular 15 min antes da call.',
    'appointment_scheduled',
    '{"appointment_type":"call"}'::jsonb,
    'whatsapp_admin',
    -15,
    'Em 15 min: chamada de {{nome}}. Abrir no CRM: {{crm_url}}',
    true,
    true,
    120,
    ARRAY['appointment_rescheduled','appointment_canceled','appointment_done','appointment_no_show'],
    '{"schedule_anchor":"appointment_start"}'::jsonb
  ),
  (
    'admin_no_show',
    'Alerta admin · nao compareceu',
    'Avisa quando o lead fica em no-show e gera tarefa de reacordo.',
    'appointment_no_show',
    '{"appointment_type":"call"}'::jsonb,
    'whatsapp_admin',
    0,
    'Lead em Nao Compareceu: {{nome}}. Reagendar agora: {{crm_url}}',
    true,
    true,
    130,
    ARRAY['appointment_rescheduled'],
    '{"create_task":true,"task_title":"Reagendar call apos no-show","task_kind":"next_action"}'::jsonb
  ),
  (
    'admin_deal_closed',
    'Alerta admin · fechou',
    'Avisa no celular quando um deal entra em Fechou.',
    'deal_closed',
    '{}'::jsonb,
    'whatsapp_admin',
    0,
    '{{nome}} foi marcado como Fechou em {{produto_fechado}}. Abrir no CRM: {{crm_url}}',
    true,
    true,
    140,
    ARRAY[]::text[],
    '{"create_task":true,"task_title":"Validar onboarding comercial","task_kind":"next_action"}'::jsonb
  ),
  (
    'admin_deal_not_closed',
    'Alerta admin · nao fechou',
    'Avisa no celular quando um deal entra em Nao Fechou.',
    'deal_not_closed',
    '{}'::jsonb,
    'whatsapp_admin',
    0,
    '{{nome}} foi marcado como Nao Fechou. Descida de esteira pronta no CRM: {{crm_url}}',
    true,
    true,
    150,
    ARRAY[]::text[],
    '{"create_task":true,"task_title":"Executar downsell imediato","task_kind":"next_action"}'::jsonb
  ),
  (
    'admin_offer_upgrade_mentoria_500',
    'Alerta admin · upgrade mentoria 1000',
    'Momento de ofertar os outros 3 encontros por R$500.',
    'offer_ready',
    '{"offer_code":"upgrade_mentoria_500"}'::jsonb,
    'whatsapp_admin',
    0,
    'Ofertar upgrade da mentoria para {{nome}} agora. Abrir no CRM: {{crm_url}}',
    true,
    true,
    160,
    ARRAY[]::text[],
    '{"create_task":true,"task_title":"Ofertar upgrade +3 encontros por R$500","task_kind":"next_action"}'::jsonb
  ),
  (
    'admin_offer_solarzap_plan',
    'Alerta admin · ofertar plano SolarZap',
    'Momento de orientar a escolha do plano SolarZap no ultimo encontro da mentoria.',
    'offer_ready',
    '{"offer_code":"solarzap_plan"}'::jsonb,
    'whatsapp_admin',
    0,
    'Momento de ofertar o plano SolarZap para {{nome}}. Abrir no CRM: {{crm_url}}',
    true,
    true,
    170,
    ARRAY[]::text[],
    '{"create_task":true,"task_title":"Ofertar plano SolarZap","task_kind":"next_action"}'::jsonb
  ),
  (
    'admin_offer_landing_page',
    'Alerta admin · ofertar Landing Page',
    'Upsell de Landing Page apos assinatura do SolarZap.',
    'offer_ready',
    '{"offer_code":"landing_page"}'::jsonb,
    'whatsapp_admin',
    0,
    'Momento de ofertar Landing Page para {{nome}}. Abrir no CRM: {{crm_url}}',
    true,
    true,
    180,
    ARRAY[]::text[],
    '{"create_task":true,"task_title":"Ofertar Landing Page","task_kind":"next_action"}'::jsonb
  ),
  (
    'admin_offer_traffic_after_landing',
    'Alerta admin · ofertar trafego',
    'Upsell de trafego pago apos entrega da Landing Page.',
    'offer_ready',
    '{"offer_code":"trafego_pago"}'::jsonb,
    'whatsapp_admin',
    0,
    'Landing entregue para {{nome}}. Hora de ofertar trafego pago. Abrir no CRM: {{crm_url}}',
    true,
    true,
    190,
    ARRAY[]::text[],
    '{"create_task":true,"task_title":"Ofertar trafego pago","task_kind":"next_action"}'::jsonb
  ),
  (
    'admin_offer_mentoria_d7_after_software',
    'Alerta admin · mentoria D+7 apos software',
    'Oferta de 3 encontros por R$1000 sete dias apos aceite do software.',
    'offer_ready',
    '{"offer_code":"mentoria_3x1000"}'::jsonb,
    'whatsapp_admin',
    0,
    'Chegou a hora de ofertar mentoria 3 encontros para {{nome}}. Abrir no CRM: {{crm_url}}',
    true,
    true,
    200,
    ARRAY[]::text[],
    '{"create_task":true,"task_title":"Ofertar mentoria 3 encontros por R$1000","task_kind":"next_action"}'::jsonb
  ),
  (
    'admin_offer_lp_d3_after_mentoria_declined',
    'Alerta admin · LP D+3 apos recusa da mentoria',
    'Oferta de Landing Page 3 dias apos a recusa da mentoria posterior.',
    'offer_ready',
    '{"offer_code":"landing_page_after_mentoria_declined"}'::jsonb,
    'whatsapp_admin',
    0,
    'Chegou a hora de ofertar Landing Page para {{nome}} apos recusa da mentoria. Abrir no CRM: {{crm_url}}',
    true,
    true,
    210,
    ARRAY[]::text[],
    '{"create_task":true,"task_title":"Ofertar Landing Page apos recusa da mentoria","task_kind":"next_action"}'::jsonb
  ),
  (
    'admin_offer_traffic_d7_after_lp_declined',
    'Alerta admin · trafego D+7 apos recusa da LP',
    'Oferta de trafego 7 dias apos a recusa da Landing Page.',
    'offer_ready',
    '{"offer_code":"trafego_after_lp_declined"}'::jsonb,
    'whatsapp_admin',
    0,
    'Chegou a hora de ofertar trafego para {{nome}} apos recusa da LP. Abrir no CRM: {{crm_url}}',
    true,
    true,
    220,
    ARRAY[]::text[],
    '{"create_task":true,"task_title":"Ofertar trafego apos recusa da Landing Page","task_kind":"next_action"}'::jsonb
  ),
  (
    'admin_offer_mentoria_1200_after_trial',
    'Alerta admin · 4 encontros por R$1200 apos trial',
    'Oferta de mentoria ao final do trial de 7 dias.',
    'offer_ready',
    '{"offer_code":"mentoria_4x1200"}'::jsonb,
    'whatsapp_admin',
    0,
    'Trial finalizado para {{nome}}. Ofertar 4 encontros por R$1200 agora. Abrir no CRM: {{crm_url}}',
    true,
    true,
    230,
    ARRAY[]::text[],
    '{"create_task":true,"task_title":"Ofertar 4 encontros por R$1200 apos trial","task_kind":"next_action"}'::jsonb
  ),
  (
    'admin_critical_automation_failure',
    'Alerta admin · falha critica de automacao',
    'Avisa no celular quando uma automacao critica falha.',
    'automation_failed',
    '{}'::jsonb,
    'whatsapp_admin',
    0,
    'Falha em automacao critica: {{automation_name}} para {{nome}}. Abrir no CRM: {{crm_url}}',
    true,
    true,
    240,
    ARRAY[]::text[],
    '{"create_task":true,"task_title":"Corrigir falha de automacao critica","task_kind":"system"}'::jsonb
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