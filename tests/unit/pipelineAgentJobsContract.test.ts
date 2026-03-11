import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (relativePath: string) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');

describe('pipeline agent jobs contract', () => {
  it('migration defines scheduled_agent_jobs, claim RPC and follow-up lead fields', () => {
    const sql = read('supabase/migrations/20260310100000_pipeline_agents_jobs.sql');
    const backfillSql = read('supabase/migrations/20260311170000_backfill_pipeline_agent_configs_safe.sql');
    const hardeningSql = read('supabase/migrations/20260311193000_pipeline_agents_hardening.sql');
    const claimFixSql = read('supabase/migrations/20260311201500_fix_claim_due_agent_jobs_locking.sql');

    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.scheduled_agent_jobs');
    expect(sql).toContain("agent_type IN ('post_call', 'follow_up')");
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.claim_due_agent_jobs');
    expect(sql).toContain('FOR UPDATE SKIP LOCKED');
    expect(sql).toContain('PARTITION BY j.lead_id, j.agent_type');
    expect(sql).toContain('uq_sched_jobs_follow_up_pending_per_lead');

    expect(sql).toContain('ADD COLUMN IF NOT EXISTS follow_up_enabled');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS follow_up_step');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS follow_up_exhausted_seen');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS lost_reason');

    expect(backfillSql).toContain('INSERT INTO public.ai_stage_config');
    expect(backfillSql).toContain("'follow_up'::text");
    expect(backfillSql).toContain("'chamada_realizada'::text");
    expect(backfillSql).toContain("'agente_disparos'::text");

    expect(hardeningSql).toContain("process-agent-jobs-worker");
    expect(hardeningSql).toContain("command ILIKE '%/functions/v1/process-agent-jobs%'");
    expect(hardeningSql).toContain("regexp_replace");

    expect(claimFixSql).toContain('CREATE OR REPLACE FUNCTION public.claim_due_agent_jobs');
    expect(claimFixSql).toContain('WITH due_raw AS');
    expect(claimFixSql).toContain('FOR UPDATE SKIP LOCKED');
    expect(claimFixSql).toContain('row_number() OVER');
  });

  it('process-agent-jobs handles post_call and follow_up with cancellation guards', () => {
    const worker = read('supabase/functions/process-agent-jobs/index.ts');

    expect(worker).toContain("agent_type: 'post_call' | 'follow_up'");
    expect(worker).toContain("triggerType: 'scheduled_post_call'");
    expect(worker).toContain("triggerType: 'follow_up'");
    expect(worker).toContain('normalizeAgentInvokeResult');
    expect(worker).toContain('buildInvokeFailureEnvelope');
    expect(worker).toContain('scheduled_agent_job_outcome');
    expect(worker).toContain("result: 'deferred'");
    expect(worker).toContain("'org_agent_disabled'");
    expect(worker).toContain("'lead_fu_disabled'");
    expect(worker).toContain("'lead_responded_before_execution'");
    expect(worker).toContain('follow_up_exhausted_seen = false');
    expect(worker).toContain('recoverStuckJobs');
  });

  it('ai-pipeline-agent routes disparos and bypasses ai_enabled for follow_up', () => {
    const agent = read('supabase/functions/ai-pipeline-agent/index.ts');

    expect(agent).toContain("const isFollowUpTrigger = triggerType === 'follow_up'");
    expect(agent).toContain("const isScheduledPostCallTrigger = triggerType === 'scheduled_post_call'");
    expect(agent).toContain('Scheduled trigger');
    expect(agent).toContain('lead.follow_up_enabled === false');
    expect(agent).toContain('broadcast_recipients');
    expect(agent).toContain('outbound_after_broadcast');
    expect(agent).toContain('first_inbound_after_broadcast');
    expect(agent).toContain("pipeline_stage', 'agente_disparos'");
    expect(agent).toContain('DADOS_JA_CONFIRMADOS');
    expect(agent).toContain('Duplicate question guard triggered');
    expect(agent).toContain('agent_run_outcome');
    expect(agent).toContain('cancelAndScheduleFollowUp');
    expect(agent).toContain('mergeQuestionKeys');
  });

  it('whatsapp webhook schedules and cancels follow-up sequence in expected points', () => {
    const webhook = read('supabase/functions/whatsapp-webhook/index.ts');

    expect(webhook).toContain('scheduleFollowUpStep1FromOutbound');
    expect(webhook).toContain('cancelPendingFollowUpJobs');
    expect(webhook).toContain("'new_outbound_superseded'");
    expect(webhook).toContain("'lead_replied'");
    expect(webhook).toContain('follow_up_schedule_status');
    expect(webhook).toContain('normalizeAgentInvokeResult');
    expect(webhook).toContain('buildInvokeFailureEnvelope');
    expect(webhook).toContain('agent_invoke_outcome');
  });
});
