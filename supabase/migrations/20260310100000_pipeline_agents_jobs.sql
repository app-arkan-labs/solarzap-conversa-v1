-- Pipeline agents jobs foundation: post-call, follow-up and disparos routing support.

CREATE TABLE IF NOT EXISTS public.scheduled_agent_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  lead_id bigint NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  agent_type text NOT NULL CHECK (agent_type IN ('post_call', 'follow_up')),
  scheduled_at timestamptz NOT NULL,
  executed_at timestamptz,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'cancelled', 'failed')),
  guard_stage text,
  cancelled_reason text,
  retry_count integer NOT NULL DEFAULT 0,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sched_jobs_pending
  ON public.scheduled_agent_jobs (scheduled_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_sched_jobs_lead_type_status
  ON public.scheduled_agent_jobs (lead_id, agent_type, status);

CREATE INDEX IF NOT EXISTS idx_sched_jobs_org_status
  ON public.scheduled_agent_jobs (org_id, status);

CREATE UNIQUE INDEX IF NOT EXISTS uq_sched_jobs_follow_up_pending_per_lead
  ON public.scheduled_agent_jobs (lead_id)
  WHERE agent_type = 'follow_up' AND status = 'pending';

CREATE OR REPLACE FUNCTION public.set_scheduled_agent_jobs_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_scheduled_agent_jobs_updated_at ON public.scheduled_agent_jobs;
CREATE TRIGGER tr_scheduled_agent_jobs_updated_at
  BEFORE UPDATE ON public.scheduled_agent_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.set_scheduled_agent_jobs_updated_at();

ALTER TABLE public.scheduled_agent_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS scheduled_agent_jobs_service_all ON public.scheduled_agent_jobs;
CREATE POLICY scheduled_agent_jobs_service_all ON public.scheduled_agent_jobs
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS scheduled_agent_jobs_auth_select ON public.scheduled_agent_jobs;
CREATE POLICY scheduled_agent_jobs_auth_select ON public.scheduled_agent_jobs
  FOR SELECT TO authenticated
  USING (public.user_belongs_to_org(org_id));

DROP POLICY IF EXISTS scheduled_agent_jobs_auth_insert ON public.scheduled_agent_jobs;
CREATE POLICY scheduled_agent_jobs_auth_insert ON public.scheduled_agent_jobs
  FOR INSERT TO authenticated
  WITH CHECK (public.user_belongs_to_org(org_id));

DROP POLICY IF EXISTS scheduled_agent_jobs_auth_update ON public.scheduled_agent_jobs;
CREATE POLICY scheduled_agent_jobs_auth_update ON public.scheduled_agent_jobs
  FOR UPDATE TO authenticated
  USING (public.user_belongs_to_org(org_id))
  WITH CHECK (public.user_belongs_to_org(org_id));

DROP POLICY IF EXISTS scheduled_agent_jobs_auth_delete ON public.scheduled_agent_jobs;
CREATE POLICY scheduled_agent_jobs_auth_delete ON public.scheduled_agent_jobs
  FOR DELETE TO authenticated
  USING (public.user_belongs_to_org(org_id));

CREATE OR REPLACE FUNCTION public.claim_due_agent_jobs(p_limit int DEFAULT 20)
RETURNS TABLE (
  job_id uuid,
  org_id uuid,
  lead_id bigint,
  agent_type text,
  guard_stage text,
  payload jsonb,
  created_at timestamptz,
  scheduled_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH due AS (
    SELECT
      j.id,
      j.org_id,
      j.lead_id,
      j.agent_type,
      j.guard_stage,
      j.payload,
      j.created_at,
      j.scheduled_at,
      row_number() OVER (
        PARTITION BY j.lead_id, j.agent_type
        ORDER BY j.scheduled_at DESC, j.created_at DESC, j.id DESC
      ) AS lead_type_rank
    FROM public.scheduled_agent_jobs j
    WHERE j.status = 'pending'
      AND j.scheduled_at <= now()
    ORDER BY j.scheduled_at ASC, j.created_at ASC, j.id ASC
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 20), 200)) * 4
    FOR UPDATE SKIP LOCKED
  ),
  picked AS (
    SELECT d.id
    FROM due d
    WHERE d.agent_type <> 'follow_up' OR d.lead_type_rank = 1
    ORDER BY d.scheduled_at ASC, d.created_at ASC, d.id ASC
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 20), 200))
  ),
  updated AS (
    UPDATE public.scheduled_agent_jobs j
    SET status = 'processing', updated_at = now()
    FROM picked
    WHERE j.id = picked.id
      AND j.status = 'pending'
    RETURNING j.id, j.org_id, j.lead_id, j.agent_type, j.guard_stage, j.payload, j.created_at, j.scheduled_at
  )
  SELECT u.id, u.org_id, u.lead_id, u.agent_type, u.guard_stage, u.payload, u.created_at, u.scheduled_at
  FROM updated u;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_due_agent_jobs(int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_due_agent_jobs(int) TO service_role;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS follow_up_enabled boolean NOT NULL DEFAULT true;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS follow_up_step integer NOT NULL DEFAULT 0;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS follow_up_exhausted_seen boolean NOT NULL DEFAULT true;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS lost_reason text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'leads_follow_up_step_chk'
      AND conrelid = 'public.leads'::regclass
  ) THEN
    ALTER TABLE public.leads
      ADD CONSTRAINT leads_follow_up_step_chk
      CHECK (follow_up_step >= 0 AND follow_up_step <= 5);
  END IF;
END;
$$;

COMMENT ON COLUMN public.leads.follow_up_enabled IS 'Enables follow up for this lead, independent from ai_enabled';
COMMENT ON COLUMN public.leads.follow_up_step IS 'Current follow up cycle step (0=idle, 1-5=sent) for UI cache';
COMMENT ON COLUMN public.leads.follow_up_exhausted_seen IS 'true when follow-up exhausted modal has already been seen';
COMMENT ON COLUMN public.leads.lost_reason IS 'Lost reason when the lead is moved to perdido';

CREATE INDEX IF NOT EXISTS idx_broadcast_recipients_lead_id
  ON public.broadcast_recipients (lead_id);

INSERT INTO public.ai_stage_config (org_id, pipeline_stage, is_active, default_prompt, agent_goal)
SELECT
  o.id,
  seed.pipeline_stage,
  false,
  seed.default_prompt,
  seed.agent_goal
FROM public.organizations o
CROSS JOIN (
  VALUES
    (
      'chamada_realizada'::text,
      'PROTOCOLO_BASE: PIPELINE_PDF_V1\nETAPA: CHAMADA_REALIZADA\nOBJETIVO: enviar mensagem pos-ligacao em ate 2 frases, referenciando o feedback salvo e conduzindo ao proximo passo.\nREGRAS: usar apenas o comentario da ligacao como verdade; nao inventar informacoes; nao repetir perguntas respondidas; finalizar com CTA unico para proposta, visita ou dado faltante.',
      'Enviar mensagem pos-ligacao conduzindo ao proximo passo'
    ),
    (
      'follow_up'::text,
      'PROTOCOLO_BASE: PIPELINE_PDF_V1\nETAPA: FOLLOW_UP\nOBJETIVO: reengajar lead sem resposta em ate 5 tentativas.\nREGRAS: 1-2 frases, uma pergunta por mensagem, variacao obrigatoria entre tentativas, referenciar historico real, sem pressao agressiva.\nSTEPS: 1 toque leve; 2 beneficio novo; 3 micro-urgencia; 4 empatia; 5 despedida leve.',
      'Reengajar lead que parou de responder'
    ),
    (
      'agente_disparos'::text,
      'PROTOCOLO_BASE: PIPELINE_PDF_V1\nETAPA: RESPONDEU_DISPAROS\nOBJETIVO: qualificar lead vindo de campanha outbound e levar para chamada_agendada ou visita_agendada.\nREGRAS: reconhecer contexto da campanha, validar interesse em energia solar, coletar dados minimos sem formulario longo, conduzir para agendamento com duas opcoes de horario.',
      'Qualificar lead outbound oriundo de disparo'
    )
) AS seed(pipeline_stage, default_prompt, agent_goal)
ON CONFLICT (org_id, pipeline_stage) DO NOTHING;

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

DO $$
DECLARE
  v_job record;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') THEN
    FOR v_job IN
      SELECT jobid
      FROM cron.job
      WHERE jobname = 'process-agent-jobs-worker'
    LOOP
      PERFORM cron.unschedule(v_job.jobid);
    END LOOP;

    BEGIN
      PERFORM cron.schedule(
        'process-agent-jobs-worker',
        '* * * * *',
        $job$
        SELECT
          net.http_post(
            url := 'https://ucwmcmdwbvrwotuzlmxh.supabase.co/functions/v1/process-agent-jobs',
            headers := jsonb_build_object(
              'Content-Type', 'application/json',
              'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVjd21jbWR3YnZyd290dXpsbXhoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODAzOTIxMSwiZXhwIjoyMDgzNjE1MjExfQ.wfo81kDYPZK6wG3aRQyduQbiDX9JAIXxYttkrt4pKo8'
            ),
            body := '{"source":"cron"}'::jsonb
          ) AS request_id;
        $job$
      );
    EXCEPTION
      WHEN others THEN
        PERFORM cron.schedule(
          'process-agent-jobs-worker',
          '*/2 * * * *',
          $job$
          SELECT
            net.http_post(
              url := 'https://ucwmcmdwbvrwotuzlmxh.supabase.co/functions/v1/process-agent-jobs',
              headers := jsonb_build_object(
                'Content-Type', 'application/json',
                'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVjd21jbWR3YnZyd290dXpsbXhoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODAzOTIxMSwiZXhwIjoyMDgzNjE1MjExfQ.wfo81kDYPZK6wG3aRQyduQbiDX9JAIXxYttkrt4pKo8'
              ),
              body := '{"source":"cron","fallback":"2m"}'::jsonb
            ) AS request_id;
          $job$
        );
    END;
  END IF;
END;
$$;
