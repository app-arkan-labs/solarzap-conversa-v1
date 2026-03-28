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
  ('mentoria_aceleracao_1', 'Mentoria Aceleracao SolarZap 1', 'one_time', 'manual', true, 10, '{}'::jsonb),
  ('mentoria_aceleracao_2', 'Mentoria Aceleracao SolarZap 2', 'one_time', 'manual', true, 20, '{}'::jsonb),
  ('mentoria_aceleracao_3', 'Mentoria Aceleracao SolarZap 3', 'one_time', 'manual', true, 30, '{}'::jsonb),
  ('solarzap_scale', 'SolarZap Scale', 'recurring', 'stripe', true, 40, '{}'::jsonb),
  ('solarzap_pro', 'SolarZap Pro', 'recurring', 'stripe', true, 50, '{}'::jsonb),
  ('solarzap_start', 'SolarZap Start', 'recurring', 'stripe', true, 60, '{}'::jsonb),
  ('landing_page_premium', 'Landing Page Premium', 'one_time', 'manual', true, 70, '{}'::jsonb),
  ('landing_page_start', 'Landing Page Start', 'one_time', 'manual', true, 80, '{}'::jsonb)
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
  ('mentoria_aceleracao_1', 199700, 'BRL', NULL, '2026-03-28T00:00:00Z'),
  ('mentoria_aceleracao_2', 149700, 'BRL', NULL, '2026-03-28T00:00:00Z'),
  ('mentoria_aceleracao_3', 99700, 'BRL', NULL, '2026-03-28T00:00:00Z'),
  ('solarzap_scale', 36900, 'BRL', NULL, '2026-03-28T00:00:00Z'),
  ('solarzap_pro', 29900, 'BRL', NULL, '2026-03-28T00:00:00Z'),
  ('solarzap_start', 19900, 'BRL', NULL, '2026-03-28T00:00:00Z'),
  ('landing_page_premium', 99700, 'BRL', NULL, '2026-03-28T00:00:00Z'),
  ('landing_page_start', 49700, 'BRL', NULL, '2026-03-28T00:00:00Z')
ON CONFLICT (product_code, valid_from) DO UPDATE
SET
  price_cents = EXCLUDED.price_cents,
  currency = EXCLUDED.currency,
  stripe_price_id = EXCLUDED.stripe_price_id,
  updated_at = now();

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
  ('lead_entrante', 'Lead Entrante', 10, true, false, 5, 'sky'),
  ('contato_iniciado', 'Contato Iniciado', 20, true, false, 15, 'amber'),
  ('qualificado', 'Qualificado', 30, true, false, 35, 'violet'),
  ('demo_agendada', 'Demo Agendada', 40, true, false, 45, 'indigo'),
  ('proposta_enviada', 'Proposta Enviada', 50, true, false, 60, 'cyan'),
  ('negociacao', 'Negociacao', 60, true, false, 75, 'orange'),
  ('aguardando_pagamento', 'Aguardando Pagamento', 70, true, false, 90, 'yellow'),
  ('ganho', 'Ganho', 80, true, true, 100, 'emerald'),
  ('perdido', 'Perdido', 90, true, true, 0, 'rose')
ON CONFLICT (stage_code) DO UPDATE
SET
  name = EXCLUDED.name,
  sort_order = EXCLUDED.sort_order,
  is_active = EXCLUDED.is_active,
  is_terminal = EXCLUDED.is_terminal,
  win_probability = EXCLUDED.win_probability,
  color_token = EXCLUDED.color_token,
  updated_at = now();
