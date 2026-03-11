import { describe, expect, it } from 'vitest'
import {
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
})
