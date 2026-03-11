-- Fix claim_due_agent_jobs: PostgreSQL does not allow FOR UPDATE with window functions
-- in the same SELECT. We first lock due rows, then rank/filter in a separate CTE.

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
  WITH due_raw AS (
    SELECT
      j.id,
      j.org_id,
      j.lead_id,
      j.agent_type,
      j.guard_stage,
      j.payload,
      j.created_at,
      j.scheduled_at
    FROM public.scheduled_agent_jobs j
    WHERE j.status = 'pending'
      AND j.scheduled_at <= now()
    ORDER BY j.scheduled_at ASC, j.created_at ASC, j.id ASC
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 20), 200)) * 4
    FOR UPDATE SKIP LOCKED
  ),
  due AS (
    SELECT
      d.*,
      row_number() OVER (
        PARTITION BY d.lead_id, d.agent_type
        ORDER BY d.scheduled_at DESC, d.created_at DESC, d.id DESC
      ) AS lead_type_rank
    FROM due_raw d
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
