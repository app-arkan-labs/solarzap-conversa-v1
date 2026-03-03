-- Digest comments schema repair + author rename + safe backfill.
-- Idempotent migration to fix environments with schema drift.

ALTER TABLE IF EXISTS public.comentarios_leads
  ADD COLUMN IF NOT EXISTS comment_type text;

ALTER TABLE IF EXISTS public.comentarios_leads
  ADD COLUMN IF NOT EXISTS date_bucket date;

-- Normalize legacy author label.
UPDATE public.comentarios_leads
SET autor = 'Resumo da IA'
WHERE autor = 'AI Digest';

-- Fill missing date_bucket for digest-like records.
UPDATE public.comentarios_leads c
SET date_bucket = COALESCE(
  (
    CASE
      WHEN regexp_match(coalesce(c.texto, ''), 'Resumo do dia \((\d{4}-\d{2}-\d{2})\)') IS NOT NULL THEN
        to_date((regexp_match(coalesce(c.texto, ''), 'Resumo do dia \((\d{4}-\d{2}-\d{2})\)'))[1], 'YYYY-MM-DD')
      ELSE NULL
    END
  ),
  (c.created_at AT TIME ZONE 'UTC')::date
)
WHERE c.date_bucket IS NULL
  AND (
    c.autor = 'Resumo da IA'
    OR c.autor = 'AI Digest'
    OR coalesce(c.texto, '') ILIKE 'Resumo do dia (%'
  );

-- Ensure digest comments are typed for daily dedupe.
UPDATE public.comentarios_leads c
SET comment_type = 'ai_daily_summary'
WHERE c.comment_type IS NULL
  AND (
    c.autor = 'Resumo da IA'
    OR c.autor = 'AI Digest'
    OR coalesce(c.texto, '') ILIKE 'Resumo do dia (%'
  );

-- Remove duplicates before creating unique dedupe index.
WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY org_id, lead_id, comment_type, date_bucket
      ORDER BY created_at DESC, id DESC
    ) AS rn
  FROM public.comentarios_leads
  WHERE comment_type = 'ai_daily_summary'
    AND date_bucket IS NOT NULL
)
DELETE FROM public.comentarios_leads c
USING ranked r
WHERE c.id = r.id
  AND r.rn > 1;

CREATE INDEX IF NOT EXISTS idx_comentarios_leads_comment_type
  ON public.comentarios_leads (comment_type);

CREATE INDEX IF NOT EXISTS idx_comentarios_leads_date_bucket
  ON public.comentarios_leads (date_bucket);

CREATE UNIQUE INDEX IF NOT EXISTS idx_comentarios_leads_org_lead_type_bucket_unq
  ON public.comentarios_leads (org_id, lead_id, comment_type, date_bucket);

CREATE UNIQUE INDEX IF NOT EXISTS idx_comentarios_ai_daily_summary_dedupe
  ON public.comentarios_leads (org_id, lead_id, comment_type, date_bucket)
  WHERE comment_type = 'ai_daily_summary' AND date_bucket IS NOT NULL;
