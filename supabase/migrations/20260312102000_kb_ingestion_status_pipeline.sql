ALTER TABLE public.kb_items
  ADD COLUMN IF NOT EXISTS ingestion_status text NOT NULL DEFAULT 'pending'
    CHECK (ingestion_status IN ('pending', 'processing', 'ready', 'error')),
  ADD COLUMN IF NOT EXISTS ingestion_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS ingestion_finished_at timestamptz;

UPDATE public.kb_items
SET
  ingestion_status = CASE
    WHEN ingested_at IS NOT NULL THEN 'ready'
    WHEN NULLIF(TRIM(COALESCE(ingestion_error, '')), '') IS NOT NULL THEN 'error'
    ELSE 'pending'
  END,
  ingestion_finished_at = CASE
    WHEN ingested_at IS NOT NULL THEN COALESCE(ingestion_finished_at, ingested_at)
    WHEN NULLIF(TRIM(COALESCE(ingestion_error, '')), '') IS NOT NULL THEN COALESCE(ingestion_finished_at, updated_at)
    ELSE ingestion_finished_at
  END
WHERE ingestion_status IS NULL
   OR ingestion_status NOT IN ('pending', 'processing', 'ready', 'error')
   OR ingested_at IS NOT NULL
   OR NULLIF(TRIM(COALESCE(ingestion_error, '')), '') IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_kb_items_org_ingestion_status
  ON public.kb_items (org_id, ingestion_status);
