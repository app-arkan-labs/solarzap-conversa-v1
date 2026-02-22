-- P1.3 completion: enqueue generic stage_changed notifications for lead stage transitions

CREATE OR REPLACE FUNCTION public.trg_notification_lead_stage_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from_stage text;
  v_to_stage text;
  v_stage_dedupe text;
  v_finance_dedupe text;
BEGIN
  IF NEW.org_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_from_stage := lower(coalesce(OLD.status_pipeline, ''));
  v_to_stage := lower(coalesce(NEW.status_pipeline, ''));

  IF v_to_stage IS DISTINCT FROM v_from_stage THEN
    v_stage_dedupe := 'lead:stage_changed:' || NEW.id::text || ':' || v_to_stage || ':' || to_char(date_trunc('minute', now()), 'YYYYMMDDHH24MI');

    PERFORM public.enqueue_notification_event(
      NEW.org_id,
      'stage_changed',
      'lead',
      NEW.id::text,
      jsonb_build_object(
        'lead_id', NEW.id,
        'nome', NEW.nome,
        'from_stage', OLD.status_pipeline,
        'to_stage', NEW.status_pipeline,
        'updated_at', now()
      ),
      v_stage_dedupe
    );

    IF v_to_stage = 'financiamento' THEN
      v_finance_dedupe := 'lead:financiamento:' || NEW.id::text || ':' || to_char(date_trunc('minute', now()), 'YYYYMMDDHH24MI');

      PERFORM public.enqueue_notification_event(
        NEW.org_id,
        'financiamento_update',
        'lead',
        NEW.id::text,
        jsonb_build_object(
          'lead_id', NEW.id,
          'nome', NEW.nome,
          'from_stage', OLD.status_pipeline,
          'to_stage', NEW.status_pipeline,
          'updated_at', now()
        ),
        v_finance_dedupe
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
