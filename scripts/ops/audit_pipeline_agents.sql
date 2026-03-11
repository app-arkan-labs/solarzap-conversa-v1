-- Audit current pipeline-agent health without mutating data.

SELECT
  now() AS audited_at,
  j.jobid,
  j.jobname,
  j.schedule,
  j.active,
  j.command
FROM cron.job j
WHERE j.jobname = 'process-agent-jobs-worker'
   OR j.command ILIKE '%/functions/v1/process-agent-jobs%';

SELECT
  org_id,
  pipeline_stage,
  is_active,
  updated_at
FROM public.ai_stage_config
WHERE pipeline_stage IN ('follow_up', 'chamada_realizada', 'agente_disparos')
ORDER BY org_id, pipeline_stage;

SELECT
  status,
  agent_type,
  count(*) AS total
FROM public.scheduled_agent_jobs
GROUP BY status, agent_type
ORDER BY status, agent_type;

SELECT
  action_type,
  created_at,
  details
FROM public.ai_action_logs
WHERE action_type IN ('agent_run_outcome', 'agent_invoke_outcome', 'scheduled_agent_job_outcome')
ORDER BY created_at DESC
LIMIT 100;
