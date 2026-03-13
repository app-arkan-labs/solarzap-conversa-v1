-- Adiciona campos de controle para o Guided Tour V2
ALTER TABLE public.onboarding_progress
ADD COLUMN IF NOT EXISTS guided_tour_version text null,
ADD COLUMN IF NOT EXISTS guided_tour_status text not null default 'never_seen',
ADD COLUMN IF NOT EXISTS guided_tour_seen_at timestamptz null,
ADD COLUMN IF NOT EXISTS guided_tour_completed_at timestamptz null,
ADD COLUMN IF NOT EXISTS guided_tour_dismissed_at timestamptz null,
ADD COLUMN IF NOT EXISTS guided_tour_last_manual_started_at timestamptz null,
ADD COLUMN IF NOT EXISTS guided_tour_last_manual_completed_at timestamptz null;

-- Aplica o backfill sugerido no plano para manter consistencia
UPDATE public.onboarding_progress
SET 
  guided_tour_status = CASE 
    WHEN array_length(tour_completed_tabs, 1) >= 4 THEN 'completed'
    WHEN array_length(tour_completed_tabs, 1) > 0 THEN 'dismissed'
    ELSE 'never_seen'
  END,
  guided_tour_version = CASE 
    WHEN array_length(tour_completed_tabs, 1) > 0 THEN 'legacy-v1'
    ELSE null
  END
WHERE guided_tour_status = 'never_seen' AND array_length(tour_completed_tabs, 1) > 0;
