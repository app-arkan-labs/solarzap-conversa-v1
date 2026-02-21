-- Keep only UI-supported pipeline agents active.
-- Do not delete rows; just soft-disable unsupported stages.

DO $$
DECLARE
  v_stage_col TEXT;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'ai_stage_config'
      AND column_name = 'pipeline_stage'
  ) THEN
    v_stage_col := 'pipeline_stage';
  ELSIF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'ai_stage_config'
      AND column_name = 'status_pipeline'
  ) THEN
    v_stage_col := 'status_pipeline';
  ELSE
    RAISE NOTICE 'ai_stage_config stage column not found; skipping disable migration';
    RETURN;
  END IF;

  EXECUTE format(
    $sql$
      UPDATE public.ai_stage_config
      SET is_active = false,
          updated_at = now()
      WHERE is_active = true
        AND %I NOT IN (
          'novo_lead',
          'respondeu',
          'nao_compareceu',
          'proposta_negociacao',
          'financiamento'
        )
    $sql$,
    v_stage_col
  );
END $$;
