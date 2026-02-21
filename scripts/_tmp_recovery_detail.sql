WITH paused AS (
  SELECT id, org_id, ai_paused_at, ai_enabled, ai_paused_reason, status_pipeline
  FROM public.leads
  WHERE ai_enabled = false
    AND ai_paused_reason = 'human_takeover'
), pairs AS (
  SELECT
    a.lead_id,
    a.id AS msg_a_id,
    b.id AS msg_b_id,
    a.created_at AS msg_a_at,
    b.created_at AS msg_b_at,
    abs(extract(epoch from (a.created_at - b.created_at))) AS delta_s,
    a.mensagem AS msg_text,
    coalesce(a.instance_name, '') AS instance_name,
    coalesce(a.remote_jid, '') AS remote_jid,
    row_number() over (
      partition by a.lead_id
      order by abs(extract(epoch from (a.created_at - b.created_at))) asc, greatest(a.created_at,b.created_at) desc
    ) AS rn
  FROM public.interacoes a
  JOIN public.interacoes b
    ON a.lead_id = b.lead_id
   AND a.id < b.id
   AND coalesce(a.instance_name, '') = coalesce(b.instance_name, '')
   AND coalesce(a.remote_jid, '') = coalesce(b.remote_jid, '')
   AND a.wa_from_me = true
   AND b.wa_from_me = true
   AND a.tipo IN ('mensagem_vendedor','audio_vendedor','video_vendedor','anexo_vendedor')
   AND b.tipo IN ('mensagem_vendedor','audio_vendedor','video_vendedor','anexo_vendedor')
   AND coalesce(nullif(trim(a.mensagem), ''), '') <> ''
   AND a.mensagem = b.mensagem
   AND abs(extract(epoch from (a.created_at - b.created_at))) <= 60
)
SELECT
  p.id AS lead_id,
  p.org_id,
  p.status_pipeline,
  p.ai_enabled,
  p.ai_paused_reason,
  p.ai_paused_at,
  pr.msg_a_id,
  pr.msg_b_id,
  pr.msg_a_at,
  pr.msg_b_at,
  round(pr.delta_s::numeric, 3) AS delta_s,
  pr.instance_name,
  pr.remote_jid,
  left(pr.msg_text, 180) AS msg_preview
FROM paused p
LEFT JOIN pairs pr
  ON pr.lead_id = p.id
 AND pr.rn = 1
ORDER BY p.ai_paused_at DESC;
