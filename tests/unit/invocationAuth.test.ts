import { describe, expect, it } from 'vitest'

import { validateServiceInvocationAuth } from '../../supabase/functions/_shared/invocationAuth'

const buildRequest = (headers?: Record<string, string>) =>
  new Request('https://example.com/functions/v1/test', {
    method: 'POST',
    headers: headers ?? {},
  })

describe('validateServiceInvocationAuth', () => {
  const serviceRoleKey = 'service_role_test_key'
  const internalApiKey = 'internal_test_key'

  it('returns 401 when no auth headers are provided', () => {
    const result = validateServiceInvocationAuth(buildRequest(), {
      serviceRoleKey,
      internalApiKey,
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.status).toBe(401)
    expect(result.code).toBe('missing_auth')
  })

  it('returns 401 for malformed Authorization header', () => {
    const result = validateServiceInvocationAuth(
      buildRequest({ Authorization: 'Token abc' }),
      { serviceRoleKey, internalApiKey },
    )

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.status).toBe(401)
    expect(result.code).toBe('invalid_authorization')
  })

  it('returns 403 for invalid bearer token', () => {
    const result = validateServiceInvocationAuth(
      buildRequest({ Authorization: 'Bearer invalid-token' }),
      { serviceRoleKey, internalApiKey },
    )

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.status).toBe(403)
    expect(result.code).toBe('forbidden')
  })

  it('accepts valid service role bearer key', () => {
    const result = validateServiceInvocationAuth(
      buildRequest({ Authorization: `Bearer ${serviceRoleKey}` }),
      { serviceRoleKey, internalApiKey },
    )

    expect(result).toEqual({ ok: true, mode: 'service_role' })
  })

  it('accepts valid internal api key header', () => {
    const result = validateServiceInvocationAuth(
      buildRequest({ 'x-internal-api-key': internalApiKey }),
      { serviceRoleKey, internalApiKey },
    )

    expect(result).toEqual({ ok: true, mode: 'internal_key' })
  })

  it('returns internal_key_not_configured when header is present but env key missing', () => {
    const result = validateServiceInvocationAuth(
      buildRequest({ 'x-internal-api-key': 'anything' }),
      { serviceRoleKey, internalApiKey: '' },
    )

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.status).toBe(403)
    expect(result.code).toBe('internal_key_not_configured')
  })
})
