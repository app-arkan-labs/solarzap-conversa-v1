SELECT
  count(*) FILTER (WHERE ai_enabled = false AND ai_paused_reason = 'human_takeover') AS paused_human_takeover,
  count(*) FILTER (WHERE ai_enabled = false) AS paused_total,
  count(*) FILTER (WHERE ai_enabled = true) AS ai_enabled_total
FROM public.leads;

SELECT id, org_id, status_pipeline, ai_enabled, ai_paused_reason, ai_paused_at
FROM public.leads
WHERE ai_enabled = false AND ai_paused_reason = 'human_takeover'
ORDER BY ai_paused_at DESC
LIMIT 20;
