-- Internal CRM pipeline: add stage after respondeu and update stage labels.

INSERT INTO internal_crm.pipeline_stages (
  stage_code,
  name,
  sort_order,
  is_active,
  is_terminal,
  win_probability,
  color_token
)
VALUES (
  'agendou_reuniao',
  'Agendou Reuniao',
  25,
  true,
  false,
  25,
  'blue'
)
ON CONFLICT (stage_code) DO UPDATE
SET
  name = EXCLUDED.name,
  sort_order = EXCLUDED.sort_order,
  is_active = EXCLUDED.is_active,
  is_terminal = EXCLUDED.is_terminal,
  win_probability = EXCLUDED.win_probability,
  color_token = EXCLUDED.color_token,
  updated_at = now();

UPDATE internal_crm.pipeline_stages
SET
  name = CASE stage_code
    WHEN 'chamada_agendada' THEN 'Reuniao Agendada'
    WHEN 'chamada_realizada' THEN 'Reuniao Realizada'
    WHEN 'fechou' THEN 'Fechou Contrato'
    ELSE name
  END,
  sort_order = CASE stage_code
    WHEN 'respondeu' THEN 20
    WHEN 'agendou_reuniao' THEN 25
    WHEN 'chamada_agendada' THEN 30
    WHEN 'chamada_realizada' THEN 40
    ELSE sort_order
  END,
  updated_at = now()
WHERE stage_code IN ('respondeu', 'agendou_reuniao', 'chamada_agendada', 'chamada_realizada', 'fechou');
