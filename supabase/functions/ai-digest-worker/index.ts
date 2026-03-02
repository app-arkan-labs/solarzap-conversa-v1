import { createClient } from 'npm:@supabase/supabase-js@2'
import { digestEmail, type DigestLeadSummary } from '../_shared/emailTemplates.ts'
import {
  buildFallbackDigestSections,
  normalizeDigestSections,
  renderDigestSectionsTextLines,
  type DigestSections,
} from '../_shared/digestContract.ts'

const ALLOWED_ORIGIN = (Deno.env.get('ALLOWED_ORIGIN') || '').trim()
const ALLOW_WILDCARD_CORS = String(Deno.env.get('ALLOW_WILDCARD_CORS') || '').trim().toLowerCase() === 'true'
if (!ALLOWED_ORIGIN && !ALLOW_WILDCARD_CORS) {
  throw new Error('Missing ALLOWED_ORIGIN env (or set ALLOW_WILDCARD_CORS=true)')
}
if (!ALLOWED_ORIGIN && ALLOW_WILDCARD_CORS) {
  console.warn('[ai-digest-worker] wildcard CORS enabled by ALLOW_WILDCARD_CORS=true')
}

const corsHeaders = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN || '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-internal-api-key',
}

const DIGEST_SETTINGS_BASE_SELECT = [
  'org_id',
  'enabled_notifications',
  'enabled_whatsapp',
  'enabled_email',
  'whatsapp_instance_name',
  'email_recipients',
  'daily_digest_enabled',
  'weekly_digest_enabled',
  'daily_digest_time',
  'weekly_digest_time',
  'timezone',
].join(', ')

const DIGEST_SETTINGS_FULL_SELECT = [
  DIGEST_SETTINGS_BASE_SELECT,
  'email_sender_name',
  'email_reply_to',
].join(', ')

const DIGEST_OPENAI_MODEL = (Deno.env.get('DIGEST_OPENAI_MODEL') || '').trim() || 'gpt-4o-mini'
const DIGEST_OPENAI_TIMEOUT_MS = (() => {
  const parsed = Number(Deno.env.get('DIGEST_OPENAI_TIMEOUT_MS') || 3500)
  return Number.isFinite(parsed) && parsed >= 500 ? parsed : 3500
})()
const DIGEST_AI_MAX_MESSAGES = 12
const DIGEST_AI_MAX_MESSAGE_CHARS = 220
const DIGEST_LEAD_CONCURRENCY = 4

type NotificationSettingsRow = {
  org_id: string
  enabled_notifications: boolean
  enabled_whatsapp: boolean
  enabled_email: boolean
  whatsapp_instance_name: string | null
  email_recipients: string[]
  email_sender_name: string | null
  email_reply_to: string | null
  daily_digest_enabled: boolean
  weekly_digest_enabled: boolean
  daily_digest_time: string
  weekly_digest_time: string
  timezone: string
}

type InvocationAuthResult =
  | {
    ok: true
    mode: 'service_role' | 'internal_key'
  }
  | {
    ok: false
    status: 401 | 403
    code: 'missing_auth' | 'forbidden' | 'internal_key_not_configured' | 'invalid_authorization'
    reason: string
    hasAuthorization: boolean
    hasInternalHeader: boolean
  }

function extractBearerToken(authorizationHeader: string): string {
  const trimmed = authorizationHeader.trim()
  if (!trimmed) return ''
  const match = trimmed.match(/^Bearer\s+(.+)$/i)
  return match?.[1]?.trim() || ''
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.')
    if (parts.length < 2) return null
    const payload = parts[1]
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .padEnd(Math.ceil(parts[1].length / 4) * 4, '=')
    const decoded = atob(payload)
    return JSON.parse(decoded) as Record<string, unknown>
  } catch {
    return null
  }
}

function isServiceRoleBearerToken(token: string): boolean {
  const payload = decodeJwtPayload(token)
  const role = String(payload?.role || '')
  return role === 'service_role'
}

function validateInvocationAuth(
  req: Request,
  serviceRoleKey: string,
  internalApiKey: string,
): InvocationAuthResult {
  const authorizationHeader = req.headers.get('Authorization') || req.headers.get('authorization') || ''
  const internalHeader = (req.headers.get('x-internal-api-key') || '').trim()
  const bearerToken = extractBearerToken(authorizationHeader)
  const hasAuthorization = authorizationHeader.trim().length > 0
  const hasInternalHeader = internalHeader.length > 0

  if (bearerToken) {
    if (serviceRoleKey && bearerToken === serviceRoleKey) {
      return { ok: true, mode: 'service_role' }
    }
    if (isServiceRoleBearerToken(bearerToken)) {
      return { ok: true, mode: 'service_role' }
    }
  }

  if (hasInternalHeader) {
    if (!internalApiKey) {
      return {
        ok: false,
        status: 403,
        code: 'internal_key_not_configured',
        reason: 'EDGE_INTERNAL_API_KEY is not configured',
        hasAuthorization,
        hasInternalHeader,
      }
    }

    if (internalHeader === internalApiKey) {
      return { ok: true, mode: 'internal_key' }
    }
  }

  if (!hasAuthorization && !hasInternalHeader) {
    return {
      ok: false,
      status: 401,
      code: 'missing_auth',
      reason: 'Missing Authorization or x-internal-api-key',
      hasAuthorization,
      hasInternalHeader,
    }
  }

  if (hasAuthorization && !bearerToken) {
    return {
      ok: false,
      status: 401,
      code: 'invalid_authorization',
      reason: 'Invalid Authorization header format',
      hasAuthorization,
      hasInternalHeader,
    }
  }

  return {
    ok: false,
    status: 403,
    code: 'forbidden',
    reason: 'Provided credentials are not allowed for this endpoint',
    hasAuthorization,
    hasInternalHeader,
  }
}

function isMissingColumnError(error: unknown): boolean {
  const code = typeof error === 'object' && error !== null ? String((error as any).code || '') : ''
  const message = typeof error === 'object' && error !== null ? String((error as any).message || '') : String(error || '')
  return (
    code === 'PGRST204' ||
    code === '42703' ||
    (/column/i.test(message) && /notification_settings/i.test(message))
  )
}

function toBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') return value
  if (value == null) return fallback
  const normalized = String(value).trim().toLowerCase()
  if (['true', 't', '1', 'yes', 'y'].includes(normalized)) return true
  if (['false', 'f', '0', 'no', 'n'].includes(normalized)) return false
  return fallback
}

function toStringOrNull(value: unknown): string | null {
  const out = String(value ?? '').trim()
  return out || null
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => String(item ?? '').trim())
    .filter(Boolean)
}

function normalizeDigestSettingsRow(row: Record<string, unknown>): NotificationSettingsRow {
  return {
    org_id: String(row.org_id || ''),
    enabled_notifications: toBoolean(row.enabled_notifications, false),
    enabled_whatsapp: toBoolean(row.enabled_whatsapp, false),
    enabled_email: toBoolean(row.enabled_email, false),
    whatsapp_instance_name: toStringOrNull(row.whatsapp_instance_name),
    email_recipients: toStringArray(row.email_recipients),
    email_sender_name: toStringOrNull(row.email_sender_name),
    email_reply_to: toStringOrNull(row.email_reply_to),
    daily_digest_enabled: toBoolean(row.daily_digest_enabled, false),
    weekly_digest_enabled: toBoolean(row.weekly_digest_enabled, false),
    daily_digest_time: String(row.daily_digest_time || '19:00:00'),
    weekly_digest_time: String(row.weekly_digest_time || '18:00:00'),
    timezone: String(row.timezone || 'America/Sao_Paulo'),
  }
}

async function fetchDigestSettingsRows(
  supabase: ReturnType<typeof createClient>,
): Promise<NotificationSettingsRow[]> {
  const fullResult = await supabase
    .from('notification_settings')
    .select(DIGEST_SETTINGS_FULL_SELECT)
    .or('daily_digest_enabled.eq.true,weekly_digest_enabled.eq.true')

  if (!fullResult.error) {
    return Array.isArray(fullResult.data)
      ? fullResult.data.map((row) => normalizeDigestSettingsRow(row as Record<string, unknown>))
      : []
  }

  if (!isMissingColumnError(fullResult.error)) {
    throw new Error(`settings_fetch_failed:${fullResult.error.message}`)
  }

  console.warn('[ai-digest-worker] notification_settings missing optional columns; using compatibility fallback select')

  const baseResult = await supabase
    .from('notification_settings')
    .select(DIGEST_SETTINGS_BASE_SELECT)
    .or('daily_digest_enabled.eq.true,weekly_digest_enabled.eq.true')

  if (baseResult.error) {
    throw new Error(`settings_fetch_failed:${baseResult.error.message}`)
  }

  return Array.isArray(baseResult.data)
    ? baseResult.data.map((row) => normalizeDigestSettingsRow(row as Record<string, unknown>))
    : []
}

type DigestContext = {
  orgId: string
  digestType: 'daily' | 'weekly'
  dateBucket: string
  timezone: string
}

function toDigits(value: unknown): string {
  return String(value || '').replace(/\D/g, '')
}

function getLocalParts(timezone: string) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
    hour12: false,
  })

  const parts = Object.fromEntries(
    fmt.formatToParts(new Date()).map((p) => [p.type, p.value]),
  ) as Record<string, string>

  const date = `${parts.year}-${parts.month}-${parts.day}`
  const minuteOfDay = Number(parts.hour || '0') * 60 + Number(parts.minute || '0')
  const weekday = String(parts.weekday || '').toLowerCase()

  return {
    date,
    minuteOfDay,
    weekday,
  }
}

function parseTimeToMinuteOfDay(raw: string | null | undefined, fallback: string) {
  const value = String(raw || fallback)
  const m = value.match(/^(\d{1,2}):(\d{2})/)
  if (!m) return parseTimeToMinuteOfDay(fallback, fallback)
  const hh = Math.max(0, Math.min(23, Number(m[1])))
  const mm = Math.max(0, Math.min(59, Number(m[2])))
  return hh * 60 + mm
}

type LeadMessageRow = {
  mensagem: string | null
  wa_from_me: boolean | null
  created_at: string
}

function compactText(value: unknown, maxLen = 240): string {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim()
  if (!text) return ''
  if (text.length <= maxLen) return text
  return `${text.slice(0, Math.max(0, maxLen - 3)).trim()}...`
}

function isMissingAiSettingsScopeError(error: unknown): boolean {
  const code = typeof error === 'object' && error !== null ? String((error as any).code || '') : ''
  const message = typeof error === 'object' && error !== null ? String((error as any).message || '') : String(error || '')
  return (
    code === '42703' ||
    code === 'PGRST204' ||
    code === '42P01' ||
    (/column/i.test(message) && /ai_settings/i.test(message)) ||
    (/relation/i.test(message) && /ai_settings/i.test(message))
  )
}

async function resolveOpenAiApiKeyForOrg(
  supabase: ReturnType<typeof createClient>,
  orgId: string,
): Promise<string> {
  const envKey = (Deno.env.get('OPENAI_API_KEY') || '').trim()

  const scopedResult = await supabase
    .from('ai_settings')
    .select('openai_api_key')
    .eq('org_id', orgId)
    .order('id', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (!scopedResult.error) {
    const scopedKey = compactText((scopedResult.data as any)?.openai_api_key || '', 10000).trim()
    return scopedKey || envKey
  }

  if (!isMissingAiSettingsScopeError(scopedResult.error)) {
    console.warn('[ai-digest-worker][openai_key_lookup_failed]', {
      orgId,
      code: String((scopedResult.error as any)?.code || ''),
      message: String((scopedResult.error as any)?.message || ''),
    })
    return envKey
  }

  const fallbackResult = await supabase
    .from('ai_settings')
    .select('openai_api_key')
    .order('id', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (fallbackResult.error) {
    console.warn('[ai-digest-worker][openai_key_lookup_compat_failed]', {
      orgId,
      code: String((fallbackResult.error as any)?.code || ''),
      message: String((fallbackResult.error as any)?.message || ''),
    })
    return envKey
  }

  const fallbackKey = compactText((fallbackResult.data as any)?.openai_api_key || '', 10000).trim()
  return fallbackKey || envKey
}

function buildDigestAiPrompt(
  digestType: 'daily' | 'weekly',
  stage: string,
  messages: LeadMessageRow[],
): string {
  const sorted = [...messages].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
  const recent = sorted.slice(-DIGEST_AI_MAX_MESSAGES)
  const transcript = recent
    .map((row) => {
      const role = row.wa_from_me === true ? 'Vendedor' : 'Lead'
      const text = compactText(row.mensagem, DIGEST_AI_MAX_MESSAGE_CHARS)
      return `${role}: ${text || '[sem texto]'}`
    })
    .join('\n')

  return [
    `Tipo de resumo: ${digestType === 'weekly' ? 'semanal' : 'diário'}.`,
    `Etapa atual do lead: ${stage || 'sem_etapa'}.`,
    'Transcrição recente:',
    transcript || '[sem mensagens no período]',
    '',
    'Produza JSON estrito com as chaves: summary, currentSituation, recommendedActions.',
    'Regras:',
    '- Escreva em português do Brasil.',
    '- Não use markdown, listas com bullets ou títulos no valor das chaves.',
    '- Cada campo deve ser curto, direto e acionável.',
  ].join('\n')
}

async function requestDigestSectionsWithAi(opts: {
  apiKey: string
  model: string
  digestType: 'daily' | 'weekly'
  stage: string
  messages: LeadMessageRow[]
  timeoutMs: number
}): Promise<DigestSections> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort('digest_ai_timeout'), opts.timeoutMs)

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${opts.apiKey}`,
      },
      body: JSON.stringify({
        model: opts.model,
        temperature: 0.2,
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'digest_sections',
            strict: true,
            schema: {
              type: 'object',
              additionalProperties: false,
              required: ['summary', 'currentSituation', 'recommendedActions'],
              properties: {
                summary: { type: 'string' },
                currentSituation: { type: 'string' },
                recommendedActions: { type: 'string' },
              },
            },
          },
        },
        messages: [
          {
            role: 'system',
            content: 'Você resume conversas comerciais em formato operacional para CRM.',
          },
          {
            role: 'user',
            content: buildDigestAiPrompt(opts.digestType, opts.stage, opts.messages),
          },
        ],
      }),
    })

    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
      const code = response.status
      const errorMsg = compactText((payload as any)?.error?.message || '')
      throw new Error(`openai_http_${code}${errorMsg ? `:${errorMsg}` : ''}`)
    }

    const content = (payload as any)?.choices?.[0]?.message?.content
    let textOutput = ''
    if (typeof content === 'string') {
      textOutput = content
    } else if (Array.isArray(content)) {
      textOutput = content
        .map((part: any) => (typeof part?.text === 'string' ? part.text : ''))
        .join('')
    }

    if (!textOutput) {
      throw new Error('openai_empty_output')
    }

    const parsed = JSON.parse(textOutput) as Partial<DigestSections>
    return normalizeDigestSections(parsed)
  } finally {
    clearTimeout(timeoutId)
  }
}

async function generateLeadSections(opts: {
  apiKey: string
  model: string
  digestType: 'daily' | 'weekly'
  stage: string
  messages: LeadMessageRow[]
}): Promise<{ sections: DigestSections; source: 'ai' | 'fallback'; reason?: string }> {
  const fallback = buildFallbackDigestSections(opts.messages, { stage: opts.stage })
  if (!opts.apiKey) {
    return {
      sections: fallback,
      source: 'fallback',
      reason: 'missing_openai_api_key',
    }
  }

  try {
    const aiSections = await requestDigestSectionsWithAi({
      apiKey: opts.apiKey,
      model: opts.model,
      digestType: opts.digestType,
      stage: opts.stage,
      messages: opts.messages,
      timeoutMs: DIGEST_OPENAI_TIMEOUT_MS,
    })

    return {
      sections: normalizeDigestSections(aiSections, fallback),
      source: 'ai',
    }
  } catch (error) {
    const reason = error instanceof Error ? compactText(error.message, 120) : compactText(String(error), 120)
    return {
      sections: fallback,
      source: 'fallback',
      reason: reason || 'ai_generation_failed',
    }
  }
}

async function mapWithConcurrency<T, R>(
  items: T[],
  mapper: (item: T, index: number) => Promise<R>,
  concurrency = DIGEST_LEAD_CONCURRENCY,
): Promise<R[]> {
  if (items.length === 0) return []
  const limit = Math.max(1, concurrency)
  const results = new Array<R>(items.length)
  let cursor = 0

  const worker = async () => {
    while (true) {
      const index = cursor
      cursor += 1
      if (index >= items.length) return
      results[index] = await mapper(items[index], index)
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()))
  return results
}

async function sendWhatsAppViaProxy(
  supabaseUrl: string,
  serviceRoleKey: string,
  internalApiKey: string,
  orgId: string,
  instanceName: string,
  number: string,
  text: string,
) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
  }
  if (internalApiKey) {
    headers['x-internal-api-key'] = internalApiKey
  }

  const response = await fetch(`${supabaseUrl.replace(/\/$/, '')}/functions/v1/evolution-proxy`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      action: 'send-text',
      payload: {
        orgId,
        instanceName,
        number,
        text,
      },
    }),
  })

  const raw = await response.text()
  if (!response.ok) {
    throw new Error(`proxy_http_${response.status}:${raw}`)
  }

  const parsed = raw ? JSON.parse(raw) : null
  if (!parsed || parsed.success === false) {
    throw new Error(`proxy_failed:${raw}`)
  }

  return parsed
}

async function sendEmailViaResend(
  recipient: string,
  subject: string,
  text: string,
  senderName?: string | null,
  replyTo?: string | null,
  html?: string | null,
) {
  const resendKey = Deno.env.get('RESEND_API_KEY') || ''
  if (!resendKey) throw new Error('missing_resend_api_key')

  const defaultFrom = Deno.env.get('RESEND_FROM_EMAIL') || 'SolarZap <notificacoes@resend.dev>'
  let fromEmail = defaultFrom
  if (senderName) {
    const emailMatch = defaultFrom.match(/<([^>]+)>/) || [null, defaultFrom.replace(/^[^<]*$/, '$&')]
    const rawEmail = emailMatch[1] || defaultFrom
    fromEmail = `${senderName} <${rawEmail}>`
  }

  const body: Record<string, unknown> = {
    from: fromEmail,
    to: [recipient],
    subject,
  }
  if (html) {
    body.html = html
    body.text = text
  } else {
    body.text = text
  }
  if (replyTo) {
    body.reply_to = replyTo
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${resendKey}`,
    },
    body: JSON.stringify(body),
  })

  const raw = await response.text()
  if (!response.ok) {
    throw new Error(`resend_http_${response.status}:${raw}`)
  }

  return raw ? JSON.parse(raw) : null
}

async function processDigestForOrg(
  supabase: ReturnType<typeof createClient>,
  supabaseUrl: string,
  serviceRoleKey: string,
  internalApiKey: string,
  settings: NotificationSettingsRow,
  ctx: DigestContext,
) {
  const runInsert = await supabase
    .from('ai_digest_runs')
    .insert({
      org_id: ctx.orgId,
      digest_type: ctx.digestType,
      date_bucket: ctx.dateBucket,
      timezone: ctx.timezone,
      status: 'running',
      started_at: new Date().toISOString(),
    })
    .select('id')
    .single()

  if (runInsert.error || !runInsert.data?.id) {
    // Unique conflict means already processed for the bucket.
    return { skipped: true, reason: runInsert.error?.message || 'run_insert_failed' }
  }

  const runId = runInsert.data.id
  const lookbackHours = ctx.digestType === 'weekly' ? 24 * 7 : 24
  const sinceIso = new Date(Date.now() - lookbackHours * 60 * 60 * 1000).toISOString()

  const { data: interactions, error: interactionsError } = await supabase
    .from('interacoes')
    .select('lead_id, mensagem, created_at, wa_from_me')
    .eq('org_id', ctx.orgId)
    .gte('created_at', sinceIso)
    .not('lead_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(4000)

  if (interactionsError) {
    await supabase
      .from('ai_digest_runs')
      .update({
        status: 'failed',
        error: interactionsError.message,
        finished_at: new Date().toISOString(),
      })
      .eq('id', runId)
    return { skipped: false, failed: true, reason: interactionsError.message }
  }

  const rows = Array.isArray(interactions) ? interactions : []
  const grouped = new Map<number, LeadMessageRow[]>()

  for (const row of rows) {
    const leadId = Number((row as any).lead_id)
    if (!Number.isFinite(leadId)) continue
    if (!grouped.has(leadId)) grouped.set(leadId, [])
    grouped.get(leadId)!.push({
      mensagem: (row as any).mensagem || null,
      wa_from_me: (row as any).wa_from_me ?? null,
      created_at: String((row as any).created_at || ''),
    })
  }

  const leadIds = Array.from(grouped.keys())
  const { data: leads } = leadIds.length > 0
    ? await supabase
      .from('leads')
      .select('id, nome, telefone, status_pipeline')
      .eq('org_id', ctx.orgId)
      .in('id', leadIds)
    : { data: [] as any[] }

  const leadById = new Map<number, { id: number; nome: string | null; telefone: string | null; status_pipeline: string | null }>()
  for (const lead of leads || []) {
    leadById.set(Number((lead as any).id), {
      id: Number((lead as any).id),
      nome: (lead as any).nome || null,
      telefone: (lead as any).telefone || null,
      status_pipeline: (lead as any).status_pipeline || null,
    })
  }

  const digestLeadIds = leadIds.slice(0, 30)
  const openAiApiKey = await resolveOpenAiApiKeyForOrg(supabase, ctx.orgId)
  const generationMetrics = {
    ai_count: 0,
    fallback_count: 0,
    fallback_reasons: {} as Record<string, number>,
  }

  const leadSummaries = await mapWithConcurrency(digestLeadIds, async (leadId) => {
    const lead = leadById.get(leadId)
    const stage = lead?.status_pipeline || 'sem_etapa'
    const messages = grouped.get(leadId) || []
    const generated = await generateLeadSections({
      apiKey: openAiApiKey,
      model: DIGEST_OPENAI_MODEL,
      digestType: ctx.digestType,
      stage,
      messages,
    })

    if (generated.source === 'ai') {
      generationMetrics.ai_count += 1
    } else {
      generationMetrics.fallback_count += 1
      const reason = generated.reason || 'fallback_unknown'
      generationMetrics.fallback_reasons[reason] = (generationMetrics.fallback_reasons[reason] || 0) + 1
    }

    return {
      leadId,
      leadName: lead?.nome || `Lead ${leadId}`,
      leadPhone: lead?.telefone || '',
      stage,
      sections: generated.sections,
    }
  })

  const digestTitle = ctx.digestType === 'weekly' ? 'Resumo semanal' : 'Resumo diário'
  const digestText = [
    `${digestTitle} (${ctx.dateBucket})`,
    `Leads com atividade: ${leadSummaries.length}`,
    '',
    ...leadSummaries.map((s, idx) => [
      `${idx + 1}. ${s.leadName} [${s.stage}]`,
      ...renderDigestSectionsTextLines(s.sections),
    ].join('\n')),
  ].join('\n')

  const channelResults: Record<string, unknown> = {
    whatsapp: { sent: 0, failed: 0 },
    email: { sent: 0, failed: 0 },
    lead_summaries: leadSummaries.length,
    section_generation: generationMetrics,
  }

  if (ctx.digestType === 'daily' && leadSummaries.length > 0) {
    const { data: ownerMember } = await supabase
      .from('organization_members')
      .select('user_id, role, created_at')
      .eq('org_id', ctx.orgId)
      .order('role', { ascending: true })
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    const actorUserId = ownerMember?.user_id || null

    const commentRows = leadSummaries.map((s) => ({
      org_id: ctx.orgId,
      lead_id: s.leadId,
      user_id: actorUserId,
      texto: [
        `Resumo do dia (${ctx.dateBucket})`,
        ...renderDigestSectionsTextLines(s.sections),
      ].join('\n'),
      autor: 'AI Digest',
      comment_type: 'ai_daily_summary',
      date_bucket: ctx.dateBucket,
    }))

    await supabase
      .from('comentarios_leads')
      .upsert(commentRows, {
        onConflict: 'org_id,lead_id,comment_type,date_bucket',
        ignoreDuplicates: true,
      })
  }

  if (settings.enabled_whatsapp && settings.whatsapp_instance_name) {
    const { data: instanceRow } = await supabase
      .from('whatsapp_instances')
      .select('phone_number')
      .eq('org_id', ctx.orgId)
      .eq('instance_name', settings.whatsapp_instance_name)
      .maybeSingle()

    const targetNumber = toDigits(instanceRow?.phone_number || '')

    if (targetNumber) {
      try {
        await sendWhatsAppViaProxy(
          supabaseUrl,
          serviceRoleKey,
          internalApiKey,
          ctx.orgId,
          settings.whatsapp_instance_name,
          targetNumber,
          digestText,
        )
        ;(channelResults.whatsapp as any).sent += 1
      } catch (error) {
        ;(channelResults.whatsapp as any).failed += 1
        ;(channelResults.whatsapp as any).error = error instanceof Error ? error.message : String(error)
      }
    } else {
      ;(channelResults.whatsapp as any).failed += 1
      ;(channelResults.whatsapp as any).error = 'missing_target_number'
    }
  }

  if (settings.enabled_email && Array.isArray(settings.email_recipients)) {
    for (const rawRecipient of settings.email_recipients) {
      const recipient = String(rawRecipient || '').trim()
      if (!recipient) continue
      try {
        // Build HTML digest email
        const digestLeads: DigestLeadSummary[] = leadSummaries.map((s) => ({
          leadName: s.leadName,
          leadPhone: s.leadPhone,
          stage: s.stage,
          summary: s.sections.summary,
          currentSituation: s.sections.currentSituation,
          recommendedActions: s.sections.recommendedActions,
        }))
        const digestHtml = digestEmail({
          digestType: ctx.digestType,
          dateBucket: ctx.dateBucket,
          leads: digestLeads,
          senderName: settings.email_sender_name,
        })
        await sendEmailViaResend(
          recipient,
          digestHtml.subject,
          digestHtml.text,
          settings.email_sender_name,
          settings.email_reply_to,
          digestHtml.html,
        )
        ;(channelResults.email as any).sent += 1
      } catch (error) {
        ;(channelResults.email as any).failed += 1
        ;(channelResults.email as any).error = error instanceof Error ? error.message : String(error)
      }
    }
  }

  const hadFailure =
    Number((channelResults.whatsapp as any).failed || 0) > 0 ||
    Number((channelResults.email as any).failed || 0) > 0

  await supabase
    .from('ai_digest_runs')
    .update({
      status: hadFailure ? 'failed' : 'sent',
      summary_text: digestText,
      channel_results: channelResults,
      finished_at: new Date().toISOString(),
    })
    .eq('id', runId)

  return {
    skipped: false,
    failed: hadFailure,
    reason: hadFailure ? 'partial_failure' : 'ok',
  }
}

function resolveDueDigest(settings: NotificationSettingsRow): DigestContext[] {
  const timezone = settings.timezone || 'America/Sao_Paulo'
  const local = getLocalParts(timezone)

  const due: DigestContext[] = []

  if (settings.daily_digest_enabled) {
    const targetMinute = parseTimeToMinuteOfDay(settings.daily_digest_time, '19:00')
    if (local.minuteOfDay >= targetMinute) {
      due.push({
        orgId: settings.org_id,
        digestType: 'daily',
        dateBucket: local.date,
        timezone,
      })
    }
  }

  if (settings.weekly_digest_enabled) {
    const targetMinute = parseTimeToMinuteOfDay(settings.weekly_digest_time, '18:00')
    const isFriday = local.weekday === 'fri'
    if (isFriday && local.minuteOfDay >= targetMinute) {
      due.push({
        orgId: settings.org_id,
        digestType: 'weekly',
        dateBucket: local.date,
        timezone,
      })
    }
  }

  return due
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    const internalApiKey = (Deno.env.get('EDGE_INTERNAL_API_KEY') || '').trim()

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error('missing_supabase_env')
    }

    const auth = validateInvocationAuth(req, serviceRoleKey, internalApiKey)
    if (!auth.ok) {
      console.warn('[ai-digest-worker][auth_rejected]', {
        code: auth.code,
        reason: auth.reason,
        hasAuthorization: auth.hasAuthorization,
        hasInternalHeader: auth.hasInternalHeader,
      })
      return new Response(
        JSON.stringify({
          success: false,
          code: auth.code,
          error: auth.status === 401 ? 'Unauthorized' : 'Forbidden',
        }),
        {
          status: auth.status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey)

    const rows = await fetchDigestSettingsRows(supabase)

    let candidates = 0
    let processed = 0
    let failed = 0

    for (const settings of rows) {
      const dueDigests = resolveDueDigest(settings)
      candidates += dueDigests.length

      for (const ctx of dueDigests) {
        const result = await processDigestForOrg(supabase, supabaseUrl, serviceRoleKey, internalApiKey, settings, ctx)
        if (result.skipped) continue
        processed += 1
        if (result.failed) failed += 1
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        orgs: rows.length,
        candidates,
        processed,
        failed,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

