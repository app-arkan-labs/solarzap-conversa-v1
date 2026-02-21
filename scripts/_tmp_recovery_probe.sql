WITH paused AS (
  SELECT id, org_id, ai_paused_at
  FROM public.leads
  WHERE ai_enabled = false
    AND ai_paused_reason = 'human_takeover'
),
dup8 AS (
  SELECT DISTINCT a.lead_id
  FROM public.interacoes a
  JOIN public.interacoes b
    ON a.lead_id = b.lead_id
   AND a.id <> b.id
   AND coalesce(a.instance_name, '') = coalesce(b.instance_name, '')
   AND coalesce(a.remote_jid, '') = coalesce(b.remote_jid, '')
   AND a.wa_from_me = true
   AND b.wa_from_me = true
   AND a.tipo IN ('mensagem_vendedor','audio_vendedor','video_vendedor','anexo_vendedor')
   AND b.tipo IN ('mensagem_vendedor','audio_vendedor','video_vendedor','anexo_vendedor')
   AND coalesce(nullif(trim(a.mensagem), ''), '') <> ''
   AND a.mensagem = b.mensagem
   AND abs(extract(epoch from (a.created_at - b.created_at))) <= 8
),
dup30 AS (
  SELECT DISTINCT a.lead_id
  FROM public.interacoes a
  JOIN public.interacoes b
    ON a.lead_id = b.lead_id
   AND a.id <> b.id
   AND coalesce(a.instance_name, '') = coalesce(b.instance_name, '')
   AND coalesce(a.remote_jid, '') = coalesce(b.remote_jid, '')
   AND a.wa_from_me = true
   AND b.wa_from_me = true
   AND a.tipo IN ('mensagem_vendedor','audio_vendedor','video_vendedor','anexo_vendedor')
   AND b.tipo IN ('mensagem_vendedor','audio_vendedor','video_vendedor','anexo_vendedor')
   AND coalesce(nullif(trim(a.mensagem), ''), '') <> ''
   AND a.mensagem = b.mensagem
   AND abs(extract(epoch from (a.created_at - b.created_at))) <= 30
),
dup60 AS (
  SELECT DISTINCT a.lead_id
  FROM public.interacoes a
  JOIN public.interacoes b
    ON a.lead_id = b.lead_id
   AND a.id <> b.id
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
SELECT 'paused_human_takeover_total' AS metric, count(*)::text AS value FROM paused
UNION ALL
SELECT 'paused_with_dup_8s', count(*)::text FROM paused p JOIN dup8 d ON d.lead_id = p.id
UNION ALL
SELECT 'paused_with_dup_30s', count(*)::text FROM paused p JOIN dup30 d ON d.lead_id = p.id
UNION ALL
SELECT 'paused_with_dup_60s', count(*)::text FROM paused p JOIN dup60 d ON d.lead_id = p.id
ORDER BY metric;
