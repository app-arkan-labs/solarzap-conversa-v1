WITH lead_row AS (
  SELECT id, org_id, ai_paused_at
  FROM public.leads
  WHERE id = 125
), inter AS (
  SELECT
    i.id,
    i.created_at,
    i.tipo,
    i.wa_from_me,
    left(coalesce(i.mensagem,''), 160) AS mensagem,
    i.instance_name
  FROM public.interacoes i
  JOIN lead_row l ON l.id = i.lead_id
  WHERE i.created_at >= l.ai_paused_at - interval '20 minutes'
    AND i.created_at <= l.ai_paused_at + interval '20 minutes'
), logs AS (
  SELECT
    a.id,
    a.created_at,
    a.action_type,
    a.success,
    left(coalesce(a.details,''), 220) AS details
  FROM public.ai_action_logs a
  JOIN lead_row l ON l.id = a.lead_id
  WHERE a.created_at >= l.ai_paused_at - interval '20 minutes'
    AND a.created_at <= l.ai_paused_at + interval '20 minutes'
)
SELECT 'interacoes' AS source, id::text, created_at::text, tipo::text, wa_from_me::text, mensagem, instance_name::text, null::text AS action_type, null::text AS success, null::text AS details
FROM inter
UNION ALL
SELECT 'ai_action_logs' AS source, id::text, created_at::text, null::text, null::text, null::text, null::text, action_type::text, success::text, details
FROM logs
ORDER BY created_at;
