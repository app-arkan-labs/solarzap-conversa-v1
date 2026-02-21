WITH candidates AS (
  SELECT DISTINCT l.id AS lead_id
  FROM public.leads l
  JOIN public.interacoes a
    ON a.lead_id = l.id
  JOIN public.interacoes b
    ON b.lead_id = l.id
   AND a.id < b.id
  WHERE l.ai_enabled = false
    AND l.ai_paused_reason = 'human_takeover'
    AND coalesce(a.instance_name, '') = coalesce(b.instance_name, '')
    AND coalesce(a.remote_jid, '') = coalesce(b.remote_jid, '')
    AND a.wa_from_me = true
    AND b.wa_from_me = true
    AND a.tipo IN ('mensagem_vendedor','audio_vendedor','video_vendedor','anexo_vendedor')
    AND b.tipo IN ('mensagem_vendedor','audio_vendedor','video_vendedor','anexo_vendedor')
    AND coalesce(nullif(trim(a.mensagem), ''), '') <> ''
    AND a.mensagem = b.mensagem
    AND abs(extract(epoch from (a.created_at - b.created_at))) <= 60
    AND greatest(a.created_at, b.created_at) BETWEEN l.ai_paused_at - interval '10 minutes' AND l.ai_paused_at + interval '10 minutes'
)
UPDATE public.leads l
SET
  ai_enabled = true,
  ai_paused_reason = NULL,
  ai_paused_at = NULL
FROM candidates c
WHERE c.lead_id = l.id
RETURNING l.id AS lead_id, l.org_id;
