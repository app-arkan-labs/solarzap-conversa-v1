function asString(value: unknown): string {
  return String(value ?? '').trim()
}

function clamp(value: unknown, min: number, max: number): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return min
  return Math.min(max, Math.max(min, parsed))
}

export function normalizeEvolutionPhone(value: unknown): string {
  const digits = String(value || '').replace(/\D/g, '')
  if (!digits) return ''
  if ((digits.length === 10 || digits.length === 11) && !digits.startsWith('55')) {
    return `55${digits}`
  }
  return digits
}

function getEvolutionEnv() {
  const baseUrl = String(Deno.env.get('EVOLUTION_API_URL') || '').trim().replace(/\/+$/, '')
  const apiKey = String(Deno.env.get('EVOLUTION_API_KEY') || '').trim()
  if (!baseUrl || !apiKey) {
    throw new Error('missing_evolution_env')
  }
  return { baseUrl, apiKey }
}

function resolveEvolutionRequestConfig() {
  const timeoutMs = clamp(Deno.env.get('EVOLUTION_REQUEST_TIMEOUT_MS') ?? 20_000, 1_000, 60_000)
  const maxRetries = clamp(Deno.env.get('EVOLUTION_REQUEST_MAX_RETRIES') ?? 2, 0, 5)
  const baseBackoffMs = clamp(Deno.env.get('EVOLUTION_REQUEST_BACKOFF_MS') ?? 350, 100, 10_000)

  return { timeoutMs, maxRetries, baseBackoffMs }
}

function isRetryableEvolutionStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

function isRetryableEvolutionNetworkError(error: unknown): boolean {
  if (isAbortError(error)) return true
  if (!(error instanceof Error)) return false
  const message = error.message.toLowerCase()
  return (
    message.includes('fetch')
    || message.includes('network')
    || message.includes('connection')
    || message.includes('timed out')
    || message.includes('econnreset')
    || message.includes('econnrefused')
    || message.includes('enotfound')
  )
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function evolutionRequest(endpoint: string, options: RequestInit = {}) {
  const { baseUrl, apiKey } = getEvolutionEnv()
  const { timeoutMs, maxRetries, baseBackoffMs } = resolveEvolutionRequestConfig()

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const abortController = new AbortController()
    const timeoutHandle = setTimeout(() => abortController.abort(), timeoutMs)

    try {
      const headers = new Headers(options.headers)
      headers.set('Content-Type', 'application/json')
      headers.set('apikey', apiKey)

      const response = await fetch(`${baseUrl}${endpoint}`, {
        ...options,
        headers,
        signal: abortController.signal,
      })

      const payload = await response.json().catch(() => null)
      if (response.ok) {
        return payload
      }

      const errorMessage = `evolution_request_failed:${response.status}:${JSON.stringify(payload)}`
      if (attempt < maxRetries && isRetryableEvolutionStatus(response.status)) {
        await wait(baseBackoffMs * (2 ** attempt))
        continue
      }

      throw new Error(errorMessage)
    } catch (error) {
      if (attempt < maxRetries && isRetryableEvolutionNetworkError(error)) {
        await wait(baseBackoffMs * (2 ** attempt))
        continue
      }

      if (isAbortError(error)) {
        throw new Error(`evolution_request_timeout:${timeoutMs}`)
      }

      throw error
    } finally {
      clearTimeout(timeoutHandle)
    }
  }

  throw new Error('evolution_request_failed:unreachable')
}

export async function sendEvolutionTextMessage(
  instanceName: string,
  number: string,
  text: string,
) {
  const normalizedInstanceName = asString(instanceName)
  const normalizedNumber = normalizeEvolutionPhone(number)
  const normalizedText = asString(text)

  if (!normalizedInstanceName) {
    throw new Error('missing_instance_name')
  }
  if (!normalizedNumber) {
    throw new Error('invalid_number')
  }
  if (!normalizedText) {
    throw new Error('missing_text')
  }

  return await evolutionRequest(`/message/sendText/${normalizedInstanceName}`, {
    method: 'POST',
    body: JSON.stringify({
      number: normalizedNumber,
      text: normalizedText,
    }),
  })
}
