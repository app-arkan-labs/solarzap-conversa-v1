import { describe, expect, it } from 'vitest'
import {
  buildInvokeFailureEnvelope,
  buildAgentResultEnvelope,
  classifyAgentOutcome,
  normalizeAgentInvokeResult,
} from '../../supabase/functions/_shared/aiPipelineOutcome'

describe('aiPipelineOutcome', () => {
  it('classifies transient and retryable reason codes deterministically', () => {
    expect(classifyAgentOutcome('quiet_window_timeout')).toBe('transient_skip')
    expect(classifyAgentOutcome('openai_call_failed')).toBe('retryable_error')
    expect(classifyAgentOutcome('missing_openai_api_key')).toBe('blocked')
    expect(classifyAgentOutcome('already_replied_final')).toBe('terminal_skip')
    expect(classifyAgentOutcome('settings_not_found_for_org')).toBe('blocked')
  })

  it('normalizes legacy skipped payloads into the new envelope', () => {
    const result = normalizeAgentInvokeResult({
      skipped: 'lead_ai_disabled',
      runId: 'run-1',
    })

    expect(result.outcome).toBe('terminal_skip')
    expect(result.reason_code).toBe('lead_ai_disabled')
    expect(result.message_sent).toBe(false)
    expect(result.should_retry).toBe(false)
    expect(result.run_id).toBe('run-1')
  })

  it('builds sent envelopes with stable success semantics', () => {
    const result = buildAgentResultEnvelope({
      reasonCode: 'message_sent',
      messageSent: true,
      runId: 'run-2',
      triggerType: 'incoming_message',
      effectiveAgentType: 'standard',
    })

    expect(result.outcome).toBe('sent')
    expect(result.reason_code).toBe('message_sent')
    expect(result.message_sent).toBe(true)
    expect(result.should_retry).toBe(false)
    expect(result.trigger_type).toBe('incoming_message')
  })

  it('builds invoke failures as blocked envelopes', () => {
    const result = buildInvokeFailureEnvelope({
      reasonCode: 'invoke_failed',
      errorMessage: 'network timeout',
      triggerType: 'follow_up',
      scheduledJobId: 'job-1',
      effectiveAgentType: 'follow_up',
    })

    expect(result.outcome).toBe('blocked')
    expect(result.reason_code).toBe('invoke_failed')
    expect(result.message_sent).toBe(false)
    expect(result.should_retry).toBe(false)
    expect(result.trigger_type).toBe('follow_up')
    expect(result.scheduled_job_id).toBe('job-1')
  })
})
