WITH paused AS (
  SELECT id, org_id, ai_paused_at
  FROM public.leads
  WHERE ai_enabled = false
    AND ai_paused_reason = 'human_takeover'
),
dup_pairs AS (
  SELECT
    a.lead_id,
    greatest(a.created_at, b.created_at) AS pair_latest_at,
    abs(extract(epoch from (a.created_at - b.created_at))) AS delta_s,
    a.mensagem,
    row_number() OVER (
      PARTITION BY a.lead_id
      ORDER BY greatest(a.created_at, b.created_at) DESC
    ) AS rn_desc
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
  p.ai_paused_at,
  d.pair_latest_at,
  round(d.delta_s::numeric,3) AS delta_s,
  left(d.mensagem,120) AS msg_preview,
  round(abs(extract(epoch from (p.ai_paused_at - d.pair_latest_at)))::numeric,3) AS pause_vs_pair_delta_s
FROM paused p
JOIN dup_pairs d
  ON d.lead_id = p.id
 AND d.rn_desc = 1
ORDER BY pause_vs_pair_delta_s ASC;
