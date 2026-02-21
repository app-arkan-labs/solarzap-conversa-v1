SELECT
  count(*) FILTER (WHERE ai_enabled = false AND ai_paused_reason = 'human_takeover') AS paused_human_takeover,
  count(*) FILTER (WHERE ai_enabled = false) AS paused_total,
  count(*) FILTER (WHERE ai_enabled = true) AS ai_enabled_total
FROM public.leads;
