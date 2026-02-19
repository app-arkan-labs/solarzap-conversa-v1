-- P0 hotfix: ensure lead stage history trigger writes org_id
CREATE OR REPLACE FUNCTION public.handle_lead_stage_change()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'UPDATE' AND OLD.status_pipeline IS DISTINCT FROM NEW.status_pipeline) THEN
        INSERT INTO public.lead_stage_history (
            org_id,
            user_id,
            lead_id,
            from_stage,
            to_stage,
            changed_at,
            source
        )
        VALUES (
            COALESCE(NEW.org_id, OLD.org_id),
            NEW.user_id,
            NEW.id,
            OLD.status_pipeline,
            NEW.status_pipeline,
            now(),
            'manual'
        );

        UPDATE public.leads
        SET stage_changed_at = now()
        WHERE id = NEW.id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
