export type DigestAiFailureCode =
  | 'missing_openai_api_key'
  | 'ai_timeout'
  | 'ai_generation_failed'

export function classifyDigestAiErrorMessage(rawMessage: unknown): DigestAiFailureCode {
  const message = String(rawMessage || '').toLowerCase()
  if (message.includes('missing_openai_api_key')) return 'missing_openai_api_key'
  if (message.includes('digest_ai_timeout') || message.includes('aborted') || message.includes('openai_http_408')) {
    return 'ai_timeout'
  }
  return 'ai_generation_failed'
}

export function assertStrictAiCoverage(opts: { leadCount: number; aiCount: number }) {
  const total = Math.max(0, Number(opts.leadCount) || 0)
  const ai = Math.max(0, Number(opts.aiCount) || 0)

  if (ai >= total) {
    return { ok: true as const }
  }

  return {
    ok: false as const,
    code: 'ai_generation_failed' as const,
    reason: 'partial_ai_generation_failure',
  }
}
