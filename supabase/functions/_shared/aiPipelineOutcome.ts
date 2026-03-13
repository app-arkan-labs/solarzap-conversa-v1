export type AgentOutcome =
  | 'sent'
  | 'terminal_skip'
  | 'transient_skip'
  | 'retryable_error'
  | 'blocked'

export type AgentResultEnvelope = {
  outcome: AgentOutcome
  reason_code: string
  message_sent: boolean
  should_retry: boolean
  next_retry_seconds: number | null
  lead_updates: Record<string, unknown> | null
  run_id?: string | null
  trigger_type?: string | null
  scheduled_job_id?: string | null
  effective_agent_type?: string | null
  transport_mode?: 'live' | 'simulated' | 'blocked' | null
  transport_reason?: string | null
  ai_response?: Record<string, unknown> | null
  skipped?: string
  aborted?: string
  error?: string
  [key: string]: unknown
}

const TERMINAL_REASON_CODES = new Set([
  'instance_ai_disabled',
  'lead_not_found',
  'system_inactive',
  'lead_ai_disabled',
  'lead_follow_up_disabled',
  'missing_remoteJid',
  'missing_instanceName',
  'already_replied',
  'already_replied_final',
  'lead_ai_disabled_before_send',
  'lead_follow_up_disabled_before_send',
  'no_outbound_action',
])

const TRANSIENT_REASON_CODES = new Set([
  'yield_to_newer',
  'quiet_window_timeout',
  'not_stabilized',
  'lost_latest_race',
  'lost_burst_winner',
  'rate_limited',
  'tight_loop_guard',
])

const RETRYABLE_REASON_CODES = new Set([
  'openai_call_failed',
  'settings_query_failed',
  'empty_comment',
  'scheduled_trigger_no_outbound',
])

const BLOCKED_REASON_CODES = new Set([
  'missing_openai_api_key',
  'lead_without_org_id',
  'settings_not_found_for_org',
  'missing_required_config',
  'cron_worker_misconfigured',
  'invoke_failed',
  'exception',
])

const TERMINAL_PREFIXES = [
  'already_replied',
  'lead_ai_disabled',
  'lead_follow_up_disabled',
]

const TRANSIENT_DEFAULT_RETRY_SECONDS: Record<string, number> = {
  yield_to_newer: 15,
  quiet_window_timeout: 45,
  not_stabilized: 20,
  lost_latest_race: 15,
  lost_burst_winner: 15,
  rate_limited: 90,
  tight_loop_guard: 120,
}

const RETRYABLE_DEFAULT_RETRY_SECONDS: Record<string, number> = {
  openai_call_failed: 180,
  settings_query_failed: 120,
  empty_comment: 300,
  scheduled_trigger_no_outbound: 180,
}

const isKnownOutcome = (value: unknown): value is AgentOutcome =>
  value === 'sent' ||
  value === 'terminal_skip' ||
  value === 'transient_skip' ||
  value === 'retryable_error' ||
  value === 'blocked'

export const classifyAgentOutcome = (
  reasonCode: string | null | undefined,
  preferredOutcome?: AgentOutcome | null,
): AgentOutcome => {
  if (isKnownOutcome(preferredOutcome)) return preferredOutcome

  const normalized = String(reasonCode || '').trim()
  if (!normalized) return 'blocked'
  if (normalized === 'message_sent') return 'sent'

  if (TERMINAL_REASON_CODES.has(normalized)) return 'terminal_skip'
  if (TRANSIENT_REASON_CODES.has(normalized)) return 'transient_skip'
  if (RETRYABLE_REASON_CODES.has(normalized)) return 'retryable_error'
  if (BLOCKED_REASON_CODES.has(normalized)) return 'blocked'

  if (TERMINAL_PREFIXES.some((prefix) => normalized.startsWith(prefix))) {
    return 'terminal_skip'
  }

  return 'blocked'
}

export const defaultRetryForOutcome = (
  outcome: AgentOutcome,
  explicitShouldRetry?: boolean | null,
): boolean => {
  if (typeof explicitShouldRetry === 'boolean') return explicitShouldRetry
  return outcome === 'transient_skip' || outcome === 'retryable_error'
}

export const defaultNextRetrySeconds = (
  outcome: AgentOutcome,
  reasonCode: string,
  explicitNextRetrySeconds?: number | null,
): number | null => {
  if (typeof explicitNextRetrySeconds === 'number' && Number.isFinite(explicitNextRetrySeconds)) {
    return Math.max(1, Math.round(explicitNextRetrySeconds))
  }

  if (outcome === 'transient_skip') {
    return TRANSIENT_DEFAULT_RETRY_SECONDS[reasonCode] || 60
  }

  if (outcome === 'retryable_error') {
    return RETRYABLE_DEFAULT_RETRY_SECONDS[reasonCode] || 180
  }

  return null
}

export const buildAgentResultEnvelope = (params: {
  reasonCode: string
  outcome?: AgentOutcome | null
  messageSent: boolean
  shouldRetry?: boolean | null
  nextRetrySeconds?: number | null
  leadUpdates?: Record<string, unknown> | null
  runId?: string | null
  triggerType?: string | null
  scheduledJobId?: string | null
  effectiveAgentType?: string | null
  transportMode?: 'live' | 'simulated' | 'blocked' | null
  transportReason?: string | null
  aiResponse?: Record<string, unknown> | null
  extras?: Record<string, unknown>
}): AgentResultEnvelope => {
  const outcome = params.messageSent
    ? 'sent'
    : classifyAgentOutcome(params.reasonCode, params.outcome)
  const shouldRetry = defaultRetryForOutcome(outcome, params.shouldRetry)
  const nextRetrySeconds = shouldRetry
    ? defaultNextRetrySeconds(outcome, params.reasonCode, params.nextRetrySeconds)
    : null

  return {
    outcome,
    reason_code: params.reasonCode,
    message_sent: params.messageSent,
    should_retry: shouldRetry,
    next_retry_seconds: nextRetrySeconds,
    lead_updates: params.leadUpdates || null,
    run_id: params.runId || null,
    trigger_type: params.triggerType || null,
    scheduled_job_id: params.scheduledJobId || null,
    effective_agent_type: params.effectiveAgentType || null,
    transport_mode: params.transportMode || null,
    transport_reason: params.transportReason || null,
    ai_response: params.aiResponse || null,
    ...(params.extras || {}),
  }
}

export const normalizeAgentInvokeResult = (payload: any): AgentResultEnvelope => {
  const reasonCode = String(
    payload?.reason_code ||
      payload?.skipped ||
      payload?.aborted ||
      payload?._transport_reason ||
      (payload?.message_sent ? 'message_sent' : payload?.error || 'unknown'),
  ).trim() || 'unknown'

  const messageSent = payload?.message_sent === true || payload?.did_send_outbound === true
  const outcome = messageSent
    ? 'sent'
    : classifyAgentOutcome(reasonCode, payload?.outcome)

  return {
    outcome,
    reason_code: reasonCode,
    message_sent: messageSent,
    should_retry: defaultRetryForOutcome(outcome, payload?.should_retry),
    next_retry_seconds: defaultNextRetrySeconds(outcome, reasonCode, payload?.next_retry_seconds),
    lead_updates:
      payload?.lead_updates && typeof payload.lead_updates === 'object' && !Array.isArray(payload.lead_updates)
        ? payload.lead_updates
        : null,
    run_id: payload?.run_id || payload?.runId || null,
    trigger_type: payload?.trigger_type || payload?.triggerType || null,
    scheduled_job_id: payload?.scheduled_job_id || payload?.scheduledJobId || null,
    effective_agent_type: payload?.effective_agent_type || null,
    transport_mode: payload?.transport_mode || payload?._transport_mode || null,
    transport_reason: payload?.transport_reason || payload?._transport_reason || null,
    ai_response:
      payload?.ai_response && typeof payload.ai_response === 'object' && !Array.isArray(payload.ai_response)
        ? payload.ai_response
        : null,
    skipped: payload?.skipped,
    aborted: payload?.aborted,
    error: payload?.error,
  }
}

export const buildInvokeFailureEnvelope = (params: {
  reasonCode?: string | null
  errorMessage?: string | null
  triggerType?: string | null
  scheduledJobId?: string | null
  effectiveAgentType?: string | null
  runId?: string | null
}): AgentResultEnvelope =>
  buildAgentResultEnvelope({
    reasonCode: String(params.reasonCode || 'invoke_failed'),
    outcome: 'blocked',
    messageSent: false,
    shouldRetry: false,
    runId: params.runId || null,
    triggerType: params.triggerType || null,
    scheduledJobId: params.scheduledJobId || null,
    effectiveAgentType: params.effectiveAgentType || null,
    transportMode: 'blocked',
    transportReason: 'invoke_failed',
    extras: {
      error: params.errorMessage ? String(params.errorMessage) : 'invoke_failed',
    },
  })

export const isSuccessfulAgentOutcome = (outcome: AgentOutcome) =>
  outcome === 'sent' || outcome === 'terminal_skip'
