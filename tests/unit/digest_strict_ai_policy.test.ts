import { describe, expect, it } from 'vitest'

import {
  assertStrictAiCoverage,
  classifyDigestAiErrorMessage,
} from '../../supabase/functions/_shared/digestAiPolicy.ts'

describe('digest strict AI policy', () => {
  it('classifies key failure and timeout deterministically', () => {
    expect(classifyDigestAiErrorMessage('missing_openai_api_key')).toBe('missing_openai_api_key')
    expect(classifyDigestAiErrorMessage('digest_ai_timeout')).toBe('ai_timeout')
    expect(classifyDigestAiErrorMessage('openai_http_500:upstream failed')).toBe('ai_generation_failed')
  })

  it('requires full AI coverage for active leads', () => {
    expect(assertStrictAiCoverage({ leadCount: 10, aiCount: 10 })).toEqual({ ok: true })
    expect(assertStrictAiCoverage({ leadCount: 10, aiCount: 9 })).toEqual({
      ok: false,
      code: 'ai_generation_failed',
      reason: 'partial_ai_generation_failure',
    })
  })

  it('accepts empty lead windows without artificial failure', () => {
    expect(assertStrictAiCoverage({ leadCount: 0, aiCount: 0 })).toEqual({ ok: true })
  })
})
