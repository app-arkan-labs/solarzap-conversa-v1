-- Hotfix support query:
-- Re-enable leads likely paused by webhook echo (AI outbound interpreted as seller takeover).
-- Review the preview result before running the UPDATE.

WITH duplicate_outbound_echo AS (
  SELECT
    a.lead_id,
    max(greatest(a.created_at, b.created_at)) AS last_echo_at
  FROM public.interacoes a
  JOIN public.interacoes b
    ON a.lead_id = b.lead_id
   AND a.id <> b.id
   AND coalesce(a.instance_name, '') = coalesce(b.instance_name, '')
   AND coalesce(a.remote_jid, '') = coalesce(b.remote_jid, '')
   AND a.wa_from_me = true
   AND b.wa_from_me = true
   AND a.tipo IN ('mensagem_vendedor', 'audio_vendedor', 'video_vendedor', 'anexo_vendedor')
   AND b.tipo IN ('mensagem_vendedor', 'audio_vendedor', 'video_vendedor', 'anexo_vendedor')
   AND coalesce(nullif(trim(a.mensagem), ''), '') <> ''
   AND a.mensagem = b.mensagem
   AND abs(extract(epoch FROM (a.created_at - b.created_at))) <= 8
  WHERE greatest(a.created_at, b.created_at) >= now() - interval '14 days'
  GROUP BY a.lead_id
)
SELECT
  l.id AS lead_id,
  l.org_id,
  l.status_pipeline,
  l.ai_enabled,
  l.ai_paused_reason,
  l.ai_paused_at,
  d.last_echo_at
FROM public.leads l
JOIN duplicate_outbound_echo d
  ON d.lead_id = l.id
WHERE l.ai_enabled = false
  AND l.ai_paused_reason = 'human_takeover'
ORDER BY d.last_echo_at DESC;

-- Apply only after validating the preview above.
-- Uncomment to execute:
/*
WITH duplicate_outbound_echo AS (
  SELECT
    a.lead_id
  FROM public.interacoes a
  JOIN public.interacoes b
    ON a.lead_id = b.lead_id
   AND a.id <> b.id
   AND coalesce(a.instance_name, '') = coalesce(b.instance_name, '')
   AND coalesce(a.remote_jid, '') = coalesce(b.remote_jid, '')
   AND a.wa_from_me = true
   AND b.wa_from_me = true
   AND a.tipo IN ('mensagem_vendedor', 'audio_vendedor', 'video_vendedor', 'anexo_vendedor')
   AND b.tipo IN ('mensagem_vendedor', 'audio_vendedor', 'video_vendedor', 'anexo_vendedor')
   AND coalesce(nullif(trim(a.mensagem), ''), '') <> ''
   AND a.mensagem = b.mensagem
   AND abs(extract(epoch FROM (a.created_at - b.created_at))) <= 8
  WHERE greatest(a.created_at, b.created_at) >= now() - interval '14 days'
  GROUP BY a.lead_id
)
UPDATE public.leads l
SET
  ai_enabled = true,
  ai_paused_reason = NULL,
  ai_paused_at = NULL
FROM duplicate_outbound_echo d
WHERE d.lead_id = l.id
  AND l.ai_enabled = false
  AND l.ai_paused_reason = 'human_takeover';
*/
