-- Tracking v3 backfill (idempotent, manual execution only).
-- Do NOT schedule this automatically in production.

-- 1) Ensure every org has org_tracking_settings with safe defaults.
INSERT INTO public.org_tracking_settings (
  org_id,
  tracking_enabled,
  meta_capi_enabled,
  google_ads_enabled,
  ga4_enabled,
  auto_channel_attribution,
  force_channel_overwrite,
  google_validate_only,
  recaptcha_enabled,
  stage_event_map,
  rate_limit_per_minute
)
SELECT
  o.id,
  false,
  false,
  false,
  false,
  true,
  false,
  false,
  false,
  public.tracking_default_stage_event_map(),
  60
FROM public.organizations o
ON CONFLICT (org_id) DO NOTHING;

-- 2) Optional safe channel repair:
-- only updates leads where channel is still inferred in lead_attribution.
-- Preview affected rows first:
SELECT
  l.org_id,
  l.id AS lead_id,
  l.canal AS current_channel,
  la.inferred_channel AS inferred_channel
FROM public.leads l
JOIN public.lead_attribution la
  ON la.lead_id = l.id
 AND la.org_id = l.org_id
WHERE la.channel_is_inferred = true
  AND NULLIF(btrim(la.inferred_channel), '') IS NOT NULL
  AND COALESCE(l.canal, '') IS DISTINCT FROM la.inferred_channel;

-- Apply only after reviewing preview:
-- UPDATE public.leads l
-- SET canal = la.inferred_channel
-- FROM public.lead_attribution la
-- WHERE la.lead_id = l.id
--   AND la.org_id = l.org_id
--   AND la.channel_is_inferred = true
--   AND NULLIF(btrim(la.inferred_channel), '') IS NOT NULL
--   AND COALESCE(l.canal, '') IS DISTINCT FROM la.inferred_channel;
