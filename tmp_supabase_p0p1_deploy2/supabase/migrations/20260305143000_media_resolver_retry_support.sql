-- Media resolver retry support: attempt metadata + pending index

ALTER TABLE public.interacoes
  ADD COLUMN IF NOT EXISTS attachment_attempt_count integer NOT NULL DEFAULT 0;

ALTER TABLE public.interacoes
  ADD COLUMN IF NOT EXISTS attachment_last_attempt_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_interacoes_media_pending_retry
  ON public.interacoes (org_id, created_at DESC)
  WHERE attachment_type IS NOT NULL
    AND attachment_ready = false;
