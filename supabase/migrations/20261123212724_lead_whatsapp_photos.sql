ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS photo_url text,
  ADD COLUMN IF NOT EXISTS photo_refreshed_at timestamptz;
