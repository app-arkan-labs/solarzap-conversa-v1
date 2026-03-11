import { createClient } from 'npm:@supabase/supabase-js@2'
import { checkLimit, recordUsage } from '../_shared/billing.ts'
import {
  buildInvokeFailureEnvelope,
  normalizeAgentInvokeResult,
} from '../_shared/aiPipelineOutcome.ts'

const ALLOWED_ORIGIN = Deno.env.get('ALLOWED_ORIGIN')
if (!ALLOWED_ORIGIN) {
  throw new Error('Missing ALLOWED_ORIGIN env')
}

const corsHeaders = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const TERMINAL_STAGES = new Set(['perdido', 'contato_futuro', 'projeto_instalado', 'coletar_avaliacao'])

type FollowUpStepRule = {
  step: 1 | 2 | 3 | 4 | 5
  enabled: boolean
  delay_minutes: number
}

const FOLLOW_UP_STEP_KEYS: Array<FollowUpStepRule['step']> = [1, 2, 3, 4, 5]
const FOLLOW_UP_MIN_DELAY_MINUTES = 5
const FOLLOW_UP_MAX_DELAY_MINUTES = 365 * 24 * 60
const DEFAULT_FOLLOW_UP_SEQUENCE_CONFIG: { steps: FollowUpStepRule[] } = {
  steps: [
    { step: 1, enabled: true, delay_minutes: 180 },
    { step: 2, enabled: true, delay_minutes: 1440 },
    { step: 3, enabled: true, delay_minutes: 2880 },
    { step: 4, enabled: true, delay_minutes: 4320 },
    { step: 5, enabled: true, delay_minutes: 10080 },
  ],
}

type ScheduledAgentJob = {
  job_id: string
  org_id: string
  lead_id: number
  agent_type: 'post_call' | 'follow_up'
  guard_stage: string | null
  payload: Record<string, any>
  created_at: string
  scheduled_at: string
}

type LeadRow = {
  id: number
  org_id: string
  status_pipeline: string | null
  ai_enabled: boolean | null
  follow_up_enabled: boolean | null
  follow_up_step: number | null
  instance_name: string | null
  user_id: string | null
}

const buildResponse = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

const isLeadRespondedAfter = async (supabase: any, leadId: number, sinceIso: string) => {
  const { count, error } = await supabase
    .from('interacoes')
    .select('id', { count: 'exact', head: true })
    .eq('lead_id', leadId)
    .eq('wa_from_me', false)
    .eq('tipo', 'mensagem_cliente')
    .gt('created_at', sinceIso)

  if (error) {
    throw error
  }

  return Number(count || 0) > 0
}

const hasRecentOutbound = async (supabase: any, leadId: number) => {
  const nowMinus60s = new Date(Date.now() - 60_000).toISOString()
  const { count, error } = await supabase
    .from('interacoes')
    .select('id', { count: 'exact', head: true })
    .eq('lead_id', leadId)
    .eq('wa_from_me', true)
    .in('tipo', ['mensagem_vendedor', 'audio_vendedor', 'video_vendedor', 'anexo_vendedor'])
    .gte('created_at', nowMinus60s)

  if (error) {
    throw error
  }

  return Number(count || 0) > 0
}

const resolveConnectedInstance = async (
  supabase: any,
  orgId: string,
  preferredInstanceName: string | null | undefined,
): Promise<string | null> => {
  const preferred = String(preferredInstanceName || '').trim()
  if (preferred) {
    const { data, error } = await supabase
      .from('whatsapp_instances')
      .select('instance_name, status')
      .eq('org_id', orgId)
      .eq('instance_name', preferred)
      .maybeSingle()

    if (!error && data?.instance_name && String(data.status || '').toLowerCase() === 'connected') {
      return String(data.instance_name)
    }
  }

  const { data: fallback, error: fallbackError } = await supabase
    .from('whatsapp_instances')
    .select('instance_name')
    .eq('org_id', orgId)
    .eq('status', 'connected')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (fallbackError) {
    throw fallbackError
  }

  return fallback?.instance_name ? String(fallback.instance_name) : null
}

const isOrgAgentActive = async (supabase: any, orgId: string, stageKey: string) => {
  const { data, error } = await supabase
    .from('ai_stage_config')
    .select('is_active')
    .eq('org_id', orgId)
    .eq('pipeline_stage', stageKey)
    .maybeSingle()

  if (error) {
    throw error
  }

  return data?.is_active === true
}

const normalizeFollowUpSequenceConfig = (raw: unknown): { steps: FollowUpStepRule[] } => {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, any>) : {}
  const incomingSteps = Array.isArray(source.steps) ? source.steps : []
  const fallbackMap = new Map(
    DEFAULT_FOLLOW_UP_SEQUENCE_CONFIG.steps.map((step) => [step.step, step] as const),
  )

  const steps: FollowUpStepRule[] = FOLLOW_UP_STEP_KEYS.map((stepKey) => {
    const fallback = fallbackMap.get(stepKey)!
    const incoming = incomingSteps.find((entry: any) => Number(entry?.step) === stepKey) || {}
    const enabled = typeof incoming?.enabled === 'boolean' ? Boolean(incoming.enabled) : fallback.enabled
    const delayRaw = Number(incoming?.delay_minutes)
    const delayMinutes = Number.isFinite(delayRaw)
      ? Math.max(
          FOLLOW_UP_MIN_DELAY_MINUTES,
          Math.min(FOLLOW_UP_MAX_DELAY_MINUTES, Math.round(delayRaw)),
        )
      : fallback.delay_minutes

    return {
      step: stepKey,
      enabled,
      delay_minutes: delayMinutes,
    }
  })

  return { steps }
}

const loadFollowUpSequenceConfig = async (
  supabase: any,
  orgId: string,
): Promise<{ steps: FollowUpStepRule[] }> => {
  const { data, error } = await supabase
    .from('ai_settings')
    .select('follow_up_sequence_config')
    .eq('org_id', orgId)
    .maybeSingle()

  if (error) {
    console.warn('process-agent-jobs: failed to load follow_up_sequence_config, using defaults:', error.message)
    return DEFAULT_FOLLOW_UP_SEQUENCE_CONFIG
  }

  return normalizeFollowUpSequenceConfig((data as any)?.follow_up_sequence_config)
}

const getNextEnabledFollowUpStep = (
  config: { steps: FollowUpStepRule[] },
  currentStep: number,
): FollowUpStepRule | null => {
  const ordered = config.steps
    .filter((step) => step.enabled && step.step > currentStep)
    .sort((a, b) => a.step - b.step)
  return ordered[0] || null
}

const markJobCancelled = async (
  supabase: any,
  jobId: string,
  reason: string,
  leadPatch?: Record<string, unknown> | null,
  leadId?: number,
) => {
  const { error: jobError } = await supabase
    .from('scheduled_agent_jobs')
    .update({
      status: 'cancelled',
      cancelled_reason: reason,
      executed_at: new Date().toISOString(),
    })
    .eq('id', jobId)

  if (jobError) throw jobError

  if (leadPatch && leadId) {
    const { error: leadError } = await supabase
      .from('leads')
      .update(leadPatch)
      .eq('id', leadId)

    if (leadError) throw leadError
  }
}

const markJobCompleted = async (supabase: any, jobId: string, reason?: string | null) => {
  const { error } = await supabase
    .from('scheduled_agent_jobs')
    .update({
      status: 'completed',
      executed_at: new Date().toISOString(),
      cancelled_reason: reason || null,
    })
    .eq('id', jobId)

  if (error) throw error
}

const markJobDeferred = async (supabase: any, jobId: string, reason: string, delaySeconds: number) => {
  const safeDelaySeconds = Math.max(5, Math.round(delaySeconds || 60))
  const { error } = await supabase
    .from('scheduled_agent_jobs')
    .update({
      status: 'pending',
      cancelled_reason: `deferred:${reason}`,
      scheduled_at: new Date(Date.now() + (safeDelaySeconds * 1000)).toISOString(),
    })
    .eq('id', jobId)

  if (error) throw error
}

const markJobBlocked = async (supabase: any, jobId: string, reason: string) => {
  const { error } = await supabase
    .from('scheduled_agent_jobs')
    .update({
      status: 'failed',
      cancelled_reason: `blocked:${reason}`,
      executed_at: new Date().toISOString(),
    })
    .eq('id', jobId)

  if (error) throw error
}

const loadJobRetryCount = async (supabase: any, jobId: string) => {
  const { data, error } = await supabase
    .from('scheduled_agent_jobs')
    .select('retry_count')
    .eq('id', jobId)
    .maybeSingle()

  if (error) throw error
  return Number((data as any)?.retry_count || 0)
}

const markJobFailed = async (
  supabase: any,
  jobId: string,
  retryCount: number,
  reason: string,
  delaySeconds = 180,
) => {
  const retries = Math.max(0, Number(retryCount || 0))
  const nextRetry = retries + 1
  const shouldRetry = nextRetry < 3

  const patch: Record<string, unknown> = shouldRetry
    ? {
        status: 'pending',
        retry_count: nextRetry,
        cancelled_reason: reason,
        scheduled_at: new Date(Date.now() + (Math.max(5, Math.round(delaySeconds || 180)) * 1000)).toISOString(),
      }
    : {
        status: 'failed',
        retry_count: nextRetry,
        cancelled_reason: reason,
        executed_at: new Date().toISOString(),
      }

  const { error } = await supabase
    .from('scheduled_agent_jobs')
    .update(patch)
    .eq('id', jobId)

  if (error) throw error

  return { shouldRetry, nextRetry }
}

const countJobsByFilter = async (
  supabase: any,
  status: 'pending' | 'processing' | 'failed',
  olderThanIso?: string,
) => {
  let query = supabase
    .from('scheduled_agent_jobs')
    .select('id', { count: 'exact', head: true })
    .eq('status', status)

  if (olderThanIso) {
    query = query.lt('updated_at', olderThanIso)
  }

  const { count, error } = await query
  if (error) throw error
  return Number(count || 0)
}

const collectQueueHealth = async (supabase: any) => {
  const now = Date.now()
  const stalePendingCutoffIso = new Date(now - 15 * 60 * 1000).toISOString()
  const staleProcessingCutoffIso = new Date(now - 5 * 60 * 1000).toISOString()
  const failed24hCutoffIso = new Date(now - 24 * 60 * 60 * 1000).toISOString()

  const [pendingTotal, pendingStale, processingStale, failed24h] = await Promise.all([
    countJobsByFilter(supabase, 'pending'),
    countJobsByFilter(supabase, 'pending', stalePendingCutoffIso),
    countJobsByFilter(supabase, 'processing', staleProcessingCutoffIso),
    (async () => {
      const { count, error } = await supabase
        .from('scheduled_agent_jobs')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'failed')
        .gt('updated_at', failed24hCutoffIso)
      if (error) throw error
      return Number(count || 0)
    })(),
  ])

  return {
    pending_total: pendingTotal,
    pending_stale_15m: pendingStale,
    processing_stale_5m: processingStale,
    failed_last_24h: failed24h,
  }
}

const recoverStuckJobs = async (supabase: any) => {
  const cutoffIso = new Date(Date.now() - 5 * 60 * 1000).toISOString()

  const { data: stuckRows, error } = await supabase
    .from('scheduled_agent_jobs')
    .select('id, retry_count')
    .eq('status', 'processing')
    .lt('updated_at', cutoffIso)
    .limit(500)

  if (error) throw error
  if (!stuckRows || stuckRows.length === 0) {
    return { resumed: 0, failed: 0 }
  }

  let resumed = 0
  let failed = 0

  for (const row of stuckRows) {
    const retries = Number((row as any).retry_count || 0)
    if (retries >= 3) {
      const { error: failErr } = await supabase
        .from('scheduled_agent_jobs')
        .update({
          status: 'failed',
          cancelled_reason: 'max_retries_exceeded',
          executed_at: new Date().toISOString(),
        })
        .eq('id', (row as any).id)
      if (failErr) throw failErr
      failed += 1
      continue
    }

    const { error: resumeErr } = await supabase
      .from('scheduled_agent_jobs')
      .update({
        status: 'pending',
        retry_count: retries + 1,
      })
      .eq('id', (row as any).id)
    if (resumeErr) throw resumeErr
    resumed += 1
  }

  return { resumed, failed }
}

const loadLead = async (supabase: any, leadId: number): Promise<LeadRow | null> => {
  const { data, error } = await supabase
    .from('leads')
    .select('id, org_id, status_pipeline, ai_enabled, follow_up_enabled, follow_up_step, instance_name, user_id')
    .eq('id', leadId)
    .maybeSingle()

  if (error) throw error
  if (!data) return null
  return data as LeadRow
}

const logPostCallExecution = async (
  supabase: any,
  orgId: string,
  leadId: number,
  jobId: string,
  commentTextLength: number,
  stageAtExecution: string | null,
) => {
  await supabase.from('ai_action_logs').insert({
    org_id: orgId,
    lead_id: leadId,
    action_type: 'post_call_agent_executed',
    details: JSON.stringify({
      runId: crypto.randomUUID(),
      job_id: jobId,
      comment_text_length: commentTextLength,
      lead_stage_at_execution: stageAtExecution,
      guard_checks_passed: true,
    }),
    success: true,
  })
}

const logFollowUpExecution = async (supabase: any, orgId: string, leadId: number, jobId: string, step: number) => {
  await supabase.from('ai_action_logs').insert({
    org_id: orgId,
    lead_id: leadId,
    action_type: 'follow_up_agent_executed',
    details: JSON.stringify({
      lead_id: leadId,
      job_id: jobId,
      step,
      source: 'process-agent-jobs',
    }),
    success: true,
  })
}

const logScheduledAgentOutcome = async (
  supabase: any,
  orgId: string,
  leadId: number,
  jobId: string,
  agentType: 'post_call' | 'follow_up',
  result: Record<string, unknown>,
) => {
  await supabase.from('ai_action_logs').insert({
    org_id: orgId,
    lead_id: leadId,
    action_type: 'scheduled_agent_job_outcome',
    details: JSON.stringify({
      job_id: jobId,
      agent_type: agentType,
      ...result,
    }),
    success: result?.outcome === 'sent' || result?.outcome === 'terminal_skip',
  })
}

const scheduleFollowUpStep = async (
  supabase: any,
  orgId: string,
  leadId: number,
  currentStage: string | null,
  nextStep: number,
  delayMinutes: number,
) => {
  const delayMs = Math.max(FOLLOW_UP_MIN_DELAY_MINUTES, Math.round(delayMinutes)) * 60_000

  await supabase
    .from('scheduled_agent_jobs')
    .update({
      status: 'cancelled',
      cancelled_reason: 'new_outbound_superseded',
    })
    .eq('lead_id', leadId)
    .eq('agent_type', 'follow_up')
    .eq('status', 'pending')

  const scheduledAt = new Date(Date.now() + delayMs).toISOString()
  const payload = {
    fu_step: nextStep,
    last_outbound_at: new Date().toISOString(),
    original_stage: currentStage || null,
  }

  const { error } = await supabase.from('scheduled_agent_jobs').insert({
    org_id: orgId,
    lead_id: leadId,
    agent_type: 'follow_up',
    scheduled_at: scheduledAt,
    status: 'pending',
    guard_stage: currentStage || null,
    payload,
  })

  if (error) throw error
}

const processPostCallJob = async (supabase: any, job: ScheduledAgentJob, lead: LeadRow) => {
  const stageActive = await isOrgAgentActive(supabase, job.org_id, 'chamada_realizada')
  if (!stageActive) {
    await markJobCancelled(supabase, job.job_id, 'org_agent_disabled')
    return { result: 'cancelled', reason: 'org_agent_disabled' }
  }

  if (lead.ai_enabled === false) {
    await markJobCancelled(supabase, job.job_id, 'ai_paused')
    return { result: 'cancelled', reason: 'ai_paused' }
  }

  const expectedStage = (job.guard_stage || 'chamada_realizada').trim()
  if ((lead.status_pipeline || '') !== expectedStage) {
    await markJobCancelled(supabase, job.job_id, 'stage_changed')
    return { result: 'cancelled', reason: 'stage_changed' }
  }

  const commentText = String(job.payload?.comment_text || '').trim()
  if (!commentText) {
    await markJobCancelled(supabase, job.job_id, 'empty_comment')
    return { result: 'cancelled', reason: 'empty_comment' }
  }

  const responded = await isLeadRespondedAfter(supabase, lead.id, job.created_at)
  if (responded) {
    await markJobCancelled(supabase, job.job_id, 'lead_responded_before_execution')
    return { result: 'cancelled', reason: 'lead_responded_before_execution' }
  }

  const recentOutbound = await hasRecentOutbound(supabase, lead.id)
  if (recentOutbound) {
    await markJobCancelled(supabase, job.job_id, 'recent_outbound')
    return { result: 'cancelled', reason: 'recent_outbound' }
  }

  const resolvedInstance = await resolveConnectedInstance(
    supabase,
    job.org_id,
    job.payload?.instance_name || lead.instance_name,
  )
  if (!resolvedInstance) {
    await markJobCancelled(supabase, job.job_id, 'instance_unavailable')
    return { result: 'cancelled', reason: 'instance_unavailable' }
  }

  const limit = await checkLimit(supabase, job.org_id, 'max_automations_month', 1)
  if (!limit.allowed || limit.access_state === 'blocked' || limit.access_state === 'read_only') {
    await markJobCancelled(supabase, job.job_id, 'billing_limit_reached')
    return { result: 'cancelled', reason: 'billing_limit_reached' }
  }

  const { data: invokeData, error: invokeError } = await supabase.functions.invoke('ai-pipeline-agent', {
    body: {
      leadId: lead.id,
      instanceName: resolvedInstance,
      interactionId: null,
      triggerType: 'scheduled_post_call',
      scheduledJobId: job.job_id,
      extraContext: {
        comment_text: commentText,
      },
    },
  })

  const agentResult = invokeError
    ? buildInvokeFailureEnvelope({
        reasonCode: 'invoke_failed',
        errorMessage: invokeError.message,
        triggerType: 'scheduled_post_call',
        scheduledJobId: String(job.job_id),
      })
    : normalizeAgentInvokeResult(invokeData)
  await logScheduledAgentOutcome(supabase, job.org_id, lead.id, job.job_id, 'post_call', agentResult)

  if (agentResult.outcome === 'sent') {
    await markJobCompleted(supabase, job.job_id, `sent:${agentResult.reason_code}`)
    await logPostCallExecution(supabase, job.org_id, lead.id, job.job_id, commentText.length, lead.status_pipeline)

    await recordUsage(supabase, {
      orgId: job.org_id,
      userId: lead.user_id || null,
      leadId: lead.id,
      eventType: 'automation_execution',
      quantity: 1,
      source: 'process-agent-jobs.post_call',
      metadata: {
        job_id: job.job_id,
        agent_type: 'post_call',
        agent_outcome: agentResult.outcome,
        reason_code: agentResult.reason_code,
      },
    })

    return { result: 'completed' as const, reason: agentResult.reason_code }
  }

  if (agentResult.outcome === 'terminal_skip') {
    await markJobCompleted(supabase, job.job_id, `terminal_skip:${agentResult.reason_code}`)
    return { result: 'completed' as const, reason: agentResult.reason_code }
  }

  if (agentResult.outcome === 'transient_skip') {
    await markJobDeferred(
      supabase,
      job.job_id,
      agentResult.reason_code,
      agentResult.next_retry_seconds || 60,
    )
    return { result: 'deferred' as const, reason: agentResult.reason_code }
  }

  if (agentResult.outcome === 'retryable_error') {
    const currentRetryCount = await loadJobRetryCount(supabase, job.job_id)
    const retry = await markJobFailed(
      supabase,
      job.job_id,
      currentRetryCount,
      `retryable:${agentResult.reason_code}`,
      agentResult.next_retry_seconds || 180,
    )
    return { result: retry.shouldRetry ? 'deferred' as const : 'failed' as const, reason: agentResult.reason_code }
  }

  await markJobBlocked(supabase, job.job_id, agentResult.reason_code)
  return { result: 'failed' as const, reason: agentResult.reason_code }
}

const processFollowUpJob = async (supabase: any, job: ScheduledAgentJob, lead: LeadRow) => {
  const stageActive = await isOrgAgentActive(supabase, job.org_id, 'follow_up')
  if (!stageActive) {
    await markJobCancelled(
      supabase,
      job.job_id,
      'org_agent_disabled',
      { follow_up_step: 0 },
      lead.id,
    )
    return { result: 'cancelled', reason: 'org_agent_disabled' }
  }

  if (lead.follow_up_enabled === false) {
    await markJobCancelled(
      supabase,
      job.job_id,
      'lead_fu_disabled',
      { follow_up_step: 0 },
      lead.id,
    )
    return { result: 'cancelled', reason: 'lead_fu_disabled' }
  }

  if (TERMINAL_STAGES.has(String(lead.status_pipeline || '').toLowerCase())) {
    await markJobCancelled(
      supabase,
      job.job_id,
      'terminal_stage',
      { follow_up_step: 0 },
      lead.id,
    )
    return { result: 'cancelled', reason: 'terminal_stage' }
  }

  const fuStep = Number(job.payload?.fu_step || 0)
  if (!Number.isInteger(fuStep) || fuStep < 1 || fuStep > 5) {
    await markJobCancelled(supabase, job.job_id, 'invalid_follow_up_step')
    return { result: 'cancelled', reason: 'invalid_follow_up_step' }
  }

  const responded = await isLeadRespondedAfter(supabase, lead.id, job.created_at)
  if (responded) {
    await markJobCancelled(
      supabase,
      job.job_id,
      'lead_responded_before_execution',
      { follow_up_step: 0 },
      lead.id,
    )
    return { result: 'cancelled', reason: 'lead_responded_before_execution' }
  }

  const recentOutbound = await hasRecentOutbound(supabase, lead.id)
  if (recentOutbound) {
    await markJobCancelled(supabase, job.job_id, 'recent_outbound')
    return { result: 'cancelled', reason: 'recent_outbound' }
  }

  const resolvedInstance = await resolveConnectedInstance(
    supabase,
    job.org_id,
    job.payload?.instance_name || lead.instance_name,
  )
  if (!resolvedInstance) {
    await markJobCancelled(supabase, job.job_id, 'instance_unavailable')
    return { result: 'cancelled', reason: 'instance_unavailable' }
  }

  const limit = await checkLimit(supabase, job.org_id, 'max_automations_month', 1)
  if (!limit.allowed || limit.access_state === 'blocked' || limit.access_state === 'read_only') {
    await markJobCancelled(supabase, job.job_id, 'billing_limit_reached')
    return { result: 'cancelled', reason: 'billing_limit_reached' }
  }

  const { data: invokeData, error: invokeError } = await supabase.functions.invoke('ai-pipeline-agent', {
    body: {
      leadId: lead.id,
      instanceName: resolvedInstance,
      interactionId: null,
      triggerType: 'follow_up',
      scheduledJobId: job.job_id,
      extraContext: {
        fu_step: fuStep,
        last_outbound_at: job.payload?.last_outbound_at || null,
      },
    },
  })

  const agentResult = invokeError
    ? buildInvokeFailureEnvelope({
        reasonCode: 'invoke_failed',
        errorMessage: invokeError.message,
        triggerType: 'follow_up',
        scheduledJobId: String(job.job_id),
        effectiveAgentType: 'follow_up',
      })
    : normalizeAgentInvokeResult(invokeData)
  await logScheduledAgentOutcome(supabase, job.org_id, lead.id, job.job_id, 'follow_up', {
    ...agentResult,
    follow_up_step: fuStep,
  })

  if (agentResult.outcome === 'sent') {
    const followUpSequence = await loadFollowUpSequenceConfig(supabase, job.org_id)
    const nextEnabledStep = getNextEnabledFollowUpStep(followUpSequence, fuStep)

    const leadPatch: Record<string, unknown> = {
      follow_up_step: fuStep,
    }
    if (fuStep >= 5) {
      leadPatch.follow_up_exhausted_seen = false
    }

    const { error: leadPatchError } = await supabase
      .from('leads')
      .update(leadPatch)
      .eq('id', lead.id)
    if (leadPatchError) throw leadPatchError

    if (nextEnabledStep) {
      await scheduleFollowUpStep(
        supabase,
        job.org_id,
        lead.id,
        lead.status_pipeline,
        nextEnabledStep.step,
        nextEnabledStep.delay_minutes,
      )
    }

    await markJobCompleted(supabase, job.job_id, `sent:${agentResult.reason_code}`)
    await logFollowUpExecution(supabase, job.org_id, lead.id, job.job_id, fuStep)

    await recordUsage(supabase, {
      orgId: job.org_id,
      userId: lead.user_id || null,
      leadId: lead.id,
      eventType: 'automation_execution',
      quantity: 1,
      source: 'process-agent-jobs.follow_up',
      metadata: {
        job_id: job.job_id,
        agent_type: 'follow_up',
        step: fuStep,
        agent_outcome: agentResult.outcome,
        reason_code: agentResult.reason_code,
      },
    })

    return { result: 'completed' as const, reason: agentResult.reason_code }
  }

  if (agentResult.outcome === 'terminal_skip') {
    const { error: leadPatchError } = await supabase
      .from('leads')
      .update({ follow_up_step: 0 })
      .eq('id', lead.id)
    if (leadPatchError) throw leadPatchError

    await markJobCompleted(supabase, job.job_id, `terminal_skip:${agentResult.reason_code}`)
    return { result: 'completed' as const, reason: agentResult.reason_code }
  }

  if (agentResult.outcome === 'transient_skip') {
    await markJobDeferred(
      supabase,
      job.job_id,
      agentResult.reason_code,
      agentResult.next_retry_seconds || 60,
    )
    return { result: 'deferred' as const, reason: agentResult.reason_code }
  }

  if (agentResult.outcome === 'retryable_error') {
    const currentRetryCount = await loadJobRetryCount(supabase, job.job_id)
    const retry = await markJobFailed(
      supabase,
      job.job_id,
      currentRetryCount,
      `retryable:${agentResult.reason_code}`,
      agentResult.next_retry_seconds || 180,
    )
    return { result: retry.shouldRetry ? 'deferred' as const : 'failed' as const, reason: agentResult.reason_code }
  }

  await markJobBlocked(supabase, job.job_id, agentResult.reason_code)
  return { result: 'failed' as const, reason: agentResult.reason_code }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') || '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
    )

    const queueHealthBefore = await collectQueueHealth(supabase)
    if (queueHealthBefore.pending_stale_15m > 0 || queueHealthBefore.processing_stale_5m > 0) {
      console.warn('process-agent-jobs queue health warning (before):', queueHealthBefore)
    }

    const recovered = await recoverStuckJobs(supabase)

    const limitRaw = Number(Deno.env.get('PROCESS_AGENT_JOBS_LIMIT') || '40')
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(100, Math.round(limitRaw))) : 40

    const { data: claimed, error: claimError } = await supabase.rpc('claim_due_agent_jobs', { p_limit: limit })
    if (claimError) {
      throw claimError
    }

    const jobs = (claimed || []) as ScheduledAgentJob[]
    if (jobs.length === 0) {
      const queueHealthAfter = await collectQueueHealth(supabase)
      return buildResponse(200, {
        processed: 0,
        recovered,
        queue_health: queueHealthAfter,
        message: 'No jobs to process',
      })
    }

    const summary = {
      processed: 0,
      completed: 0,
      cancelled: 0,
      deferred: 0,
      failed: 0,
      recovered,
      queue_health_before: queueHealthBefore,
      queue_health_after: null as null | {
        pending_total: number
        pending_stale_15m: number
        processing_stale_5m: number
        failed_last_24h: number
      },
      per_type: {
        post_call: 0,
        follow_up: 0,
      },
      errors: [] as Array<{ job_id: string; error: string }>,
    }

    for (const job of jobs) {
      summary.processed += 1
      if (job.agent_type === 'post_call') {
        summary.per_type.post_call += 1
      } else if (job.agent_type === 'follow_up') {
        summary.per_type.follow_up += 1
      }

      try {
        const lead = await loadLead(supabase, Number(job.lead_id))
        if (!lead || !lead.org_id) {
          await markJobCancelled(supabase, job.job_id, 'lead_not_found')
          summary.cancelled += 1
          continue
        }

        if (String(lead.org_id) !== String(job.org_id)) {
          await markJobCancelled(supabase, job.job_id, 'org_mismatch')
          summary.cancelled += 1
          continue
        }

        const outcome = job.agent_type === 'post_call'
          ? await processPostCallJob(supabase, job, lead)
          : await processFollowUpJob(supabase, job, lead)

        if (outcome.result === 'completed') {
          summary.completed += 1
        } else if (outcome.result === 'cancelled') {
          summary.cancelled += 1
        } else if (outcome.result === 'deferred') {
          summary.deferred += 1
        } else if (outcome.result === 'failed') {
          summary.failed += 1
        }
      } catch (jobError: any) {
        summary.failed += 1
        summary.errors.push({
          job_id: job.job_id,
          error: String(jobError?.message || jobError || 'unknown_error'),
        })

        const { data: currentJob } = await supabase
          .from('scheduled_agent_jobs')
          .select('retry_count')
          .eq('id', job.job_id)
          .maybeSingle()

        const currentRetryCount = Number((currentJob as any)?.retry_count || 0)
        await markJobFailed(
          supabase,
          job.job_id,
          currentRetryCount,
          `worker_error:${String(jobError?.message || jobError || 'unknown_error').slice(0, 180)}`,
        )
      }
    }

    summary.queue_health_after = await collectQueueHealth(supabase)
    if (
      summary.queue_health_after.pending_stale_15m > 0 ||
      summary.queue_health_after.processing_stale_5m > 0
    ) {
      console.warn('process-agent-jobs queue health warning (after):', summary.queue_health_after)
    }

    return buildResponse(200, summary)
  } catch (error: any) {
    console.error('process-agent-jobs error', error)
    return buildResponse(500, {
      error: String(error?.message || error || 'unknown_error'),
    })
  }
})
