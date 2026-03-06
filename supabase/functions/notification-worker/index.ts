import { createClient } from 'npm:@supabase/supabase-js@2'
import { buildEmailContent, type TemplateContext } from '../_shared/emailTemplates.ts'
import { resolveNotificationRouting } from '../_shared/notificationRecipients.ts'
import {
  buildDispatchSuccessLookup,
  countDeliveredRecipients,
  markRecipientDelivered,
  wasRecipientDelivered,
  type DispatchChannel,
  type DispatchLogLike,
} from '../_shared/notificationDispatchState.ts'

const ALLOWED_ORIGIN = (Deno.env.get('ALLOWED_ORIGIN') || '').trim()
const ALLOW_WILDCARD_CORS = String(Deno.env.get('ALLOW_WILDCARD_CORS') || '').trim().toLowerCase() === 'true'
if (!ALLOWED_ORIGIN && !ALLOW_WILDCARD_CORS) {
  throw new Error('Missing ALLOWED_ORIGIN env (or set ALLOW_WILDCARD_CORS=true)')
}
if (!ALLOWED_ORIGIN && ALLOW_WILDCARD_CORS) {
  console.warn('[notification-worker] wildcard CORS enabled by ALLOW_WILDCARD_CORS=true')
}

const corsHeaders = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN || '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-internal-api-key',
}

const NOTIFICATION_SETTINGS_BASE_SELECT = [
  'org_id',
  'enabled_notifications',
  'enabled_whatsapp',
  'enabled_email',
  'enabled_reminders',
  'whatsapp_instance_name',
  'email_recipients',
].join(', ')

const NOTIFICATION_SETTINGS_FULL_SELECT = [
  NOTIFICATION_SETTINGS_BASE_SELECT,
  'whatsapp_recipients',
  'email_sender_name',
  'email_reply_to',
  'evt_novo_lead',
  'evt_stage_changed',
  'evt_visita_agendada',
  'evt_visita_realizada',
  'evt_chamada_agendada',
  'evt_chamada_realizada',
  'evt_financiamento_update',
  'evt_installment_due_check',
].join(', ')

type NotificationEventRow = {
  id: string
  org_id: string
  event_type: string
  entity_type: string | null
  entity_id: string | null
  payload: Record<string, unknown>
  status: string
  attempts: number
}

type NotificationSettingsRow = {
  org_id: string
  enabled_notifications: boolean
  enabled_whatsapp: boolean
  enabled_email: boolean
  enabled_reminders: boolean
  whatsapp_instance_name: string | null
  whatsapp_recipients: string[]
  email_recipients: string[]
  email_sender_name: string | null
  email_reply_to: string | null
  evt_novo_lead: boolean
  evt_stage_changed: boolean
  evt_visita_agendada: boolean
  evt_visita_realizada: boolean
  evt_chamada_agendada: boolean
  evt_chamada_realizada: boolean
  evt_financiamento_update: boolean
  evt_installment_due_check: boolean
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

function normalizeNotificationSettingsRow(row: Record<string, unknown>): NotificationSettingsRow {
  return {
    org_id: String(row.org_id || ''),
    enabled_notifications: toBoolean(row.enabled_notifications, false),
    enabled_whatsapp: toBoolean(row.enabled_whatsapp, false),
    enabled_email: toBoolean(row.enabled_email, false),
    enabled_reminders: toBoolean(row.enabled_reminders, false),
    whatsapp_instance_name: toStringOrNull(row.whatsapp_instance_name),
    whatsapp_recipients: toStringArray(row.whatsapp_recipients),
    email_recipients: toStringArray(row.email_recipients),
    email_sender_name: toStringOrNull(row.email_sender_name),
    email_reply_to: toStringOrNull(row.email_reply_to),
    evt_novo_lead: toBoolean(row.evt_novo_lead, true),
    evt_stage_changed: toBoolean(row.evt_stage_changed, true),
    evt_visita_agendada: toBoolean(row.evt_visita_agendada, true),
    evt_visita_realizada: toBoolean(row.evt_visita_realizada, true),
    evt_chamada_agendada: toBoolean(row.evt_chamada_agendada, true),
    evt_chamada_realizada: toBoolean(row.evt_chamada_realizada, true),
    evt_financiamento_update: toBoolean(row.evt_financiamento_update, true),
    evt_installment_due_check: toBoolean(row.evt_installment_due_check, true),
  }
}

async function fetchNotificationSettings(
  supabase: ReturnType<typeof createClient>,
  orgId: string,
): Promise<NotificationSettingsRow | null> {
  const fullResult = await supabase
    .from('notification_settings')
    .select(NOTIFICATION_SETTINGS_FULL_SELECT)
    .eq('org_id', orgId)
    .maybeSingle()

  if (!fullResult.error) {
    return fullResult.data ? normalizeNotificationSettingsRow(fullResult.data as Record<string, unknown>) : null
  }

  if (!isMissingColumnError(fullResult.error)) {
    throw new Error(`settings_error:${fullResult.error.message}`)
  }

  console.warn('[notification-worker] notification_settings missing optional columns; using compatibility fallback select')

  const baseResult = await supabase
    .from('notification_settings')
    .select(NOTIFICATION_SETTINGS_BASE_SELECT)
    .eq('org_id', orgId)
    .maybeSingle()

  if (baseResult.error) {
    throw new Error(`settings_error:${baseResult.error.message}`)
  }

  return baseResult.data ? normalizeNotificationSettingsRow(baseResult.data as Record<string, unknown>) : null
}

function formatDateTime(value: unknown): string {
  if (!value) return ''
  const date = new Date(String(value))
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  })
}

function formatCurrencyBR(value: unknown): string {
  const amount = Number(value)
  if (!Number.isFinite(amount)) return ''
  return amount.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

function buildMessage(event: NotificationEventRow, lead: { nome?: string | null; telefone?: string | null } | null) {
  const payload = event.payload || {}
  const leadName = String(payload.nome || lead?.nome || 'Lead').trim()
  const leadPhone = String(payload.telefone || lead?.telefone || '').trim()
  const title = String(payload.title || '').trim()
  const startAt = formatDateTime(payload.start_at)
  const fromStage = String(payload.from_stage || '').trim()
  const toStage = String(payload.to_stage || '').trim()
  const dueOn = String(payload.due_on || '').trim()
  const amount = formatCurrencyBR(payload.amount)
  const installmentNo = Number(payload.installment_no || 0)

  // Build context for both plain-text (WhatsApp) and HTML (email) templates
  const ctx: TemplateContext = {
    leadName,
    leadPhone,
    title,
    startAt: payload.start_at ? String(payload.start_at) : undefined,
    fromStage: fromStage || undefined,
    toStage: toStage || undefined,
    dueOn: dueOn || undefined,
    amount: amount || undefined,
    installmentNo: Number.isFinite(installmentNo) && installmentNo > 0 ? installmentNo : undefined,
  }

  // Plain-text for WhatsApp
  let subject: string
  let text: string
  switch (event.event_type) {
    case 'novo_lead':
      subject = 'Novo lead no CRM'
      text = `Novo lead criado: ${leadName}${leadPhone ? ` (${leadPhone})` : ''}.`
      break
    case 'visita_agendada':
      subject = 'Visita agendada'
      text = `Visita agendada para ${leadName}${startAt ? ` em ${startAt}` : ''}${title ? `. ${title}` : ''}.`
      break
    case 'chamada_agendada':
      subject = 'Chamada agendada'
      text = `Chamada agendada para ${leadName}${startAt ? ` em ${startAt}` : ''}${title ? `. ${title}` : ''}.`
      break
    case 'visita_realizada':
      subject = 'Visita realizada'
      text = `Visita marcada como realizada para ${leadName}${title ? `. ${title}` : ''}.`
      break
    case 'chamada_realizada':
      subject = 'Chamada realizada'
      text = `Chamada marcada como realizada para ${leadName}${title ? `. ${title}` : ''}.`
      break
    case 'financiamento_update':
      subject = 'Atualização de financiamento'
      text = `Lead ${leadName} mudou etapa de ${fromStage || 'origem'} para ${toStage || 'financiamento'}.`
      break
    case 'stage_changed':
      subject = 'Mudança de etapa no pipeline'
      text = `Lead ${leadName} mudou etapa de ${fromStage || 'origem'} para ${toStage || 'destino'}.`
      break
    case 'installment_due_check':
      subject = 'Parcela pendente de confirmação'
      text = `Parcela${installmentNo > 0 ? ` #${installmentNo}` : ''} de ${leadName}${amount ? ` no valor de ${amount}` : ''} venceu${dueOn ? ` em ${dueOn}` : ''}. Confirme se foi paga.`
      break
    default:
      subject = 'Notificação CRM'
      text = `Evento ${event.event_type} para ${leadName}.`
  }

  return { subject, text, ctx }
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
  let parsed: unknown = raw
  try {
    parsed = raw ? JSON.parse(raw) : null
  } catch {
    parsed = raw
  }

  if (!response.ok) {
    throw new Error(`proxy_http_${response.status}:${typeof parsed === 'string' ? parsed : JSON.stringify(parsed)}`)
  }

  const success = typeof parsed === 'object' && parsed !== null && (parsed as any).success !== false
  if (!success) {
    throw new Error(`proxy_failed:${JSON.stringify(parsed)}`)
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
  if (!resendKey) {
    throw new Error('missing_resend_api_key')
  }

  const defaultFrom = Deno.env.get('RESEND_FROM_EMAIL') || 'SolarZap <notificacoes@resend.dev>'
  // If org has a custom sender name, override the display name while keeping the platform domain
  let fromEmail = defaultFrom
  if (senderName) {
    // Extract the email portion from the default ("Name <email>" or just "email")
    const emailMatch = defaultFrom.match(/<([^>]+)>/) || [null, defaultFrom.replace(/^[^<]*$/, '$&')]
    const rawEmail = emailMatch[1] || defaultFrom
    fromEmail = `${senderName} <${rawEmail}>`
  }

  const body: Record<string, unknown> = {
    from: fromEmail,
    to: [recipient],
    subject,
  }
  // Prefer HTML when available, keep plain-text as fallback
  if (html) {
    body.html = html
    body.text = text  // plain-text alternative
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
  let parsed: unknown = raw
  try {
    parsed = raw ? JSON.parse(raw) : null
  } catch {
    parsed = raw
  }

  if (!response.ok) {
    throw new Error(`resend_http_${response.status}:${typeof parsed === 'string' ? parsed : JSON.stringify(parsed)}`)
  }

  return parsed
}

async function logDispatch(
  supabase: ReturnType<typeof createClient>,
  event: NotificationEventRow,
  channel: 'whatsapp' | 'email',
  destination: string,
  status: 'success' | 'failed',
  responsePayload: unknown,
  errorMessage: string | null,
) {
  await supabase.from('notification_dispatch_logs').insert({
    notification_event_id: event.id,
    org_id: event.org_id,
    channel,
    destination,
    status,
    response_payload: responsePayload ?? null,
    error: errorMessage,
  })
}

async function fetchSuccessfulDispatches(
  supabase: ReturnType<typeof createClient>,
  event: NotificationEventRow,
) {
  const { data, error } = await supabase
    .from('notification_dispatch_logs')
    .select('channel, destination, status')
    .eq('notification_event_id', event.id)
    .eq('org_id', event.org_id)
    .eq('status', 'success')

  if (error) {
    throw new Error(`dispatch_logs_error:${error.message}`)
  }

  return buildDispatchSuccessLookup((data || []) as DispatchLogLike[])
}

async function resolveLead(
  supabase: ReturnType<typeof createClient>,
  orgId: string,
  payload: Record<string, unknown>,
) {
  const leadId = payload.lead_id
  if (!leadId) return null

  const { data } = await supabase
    .from('leads')
    .select('id, nome, telefone, phone_e164')
    .eq('org_id', orgId)
    .eq('id', Number(leadId))
    .maybeSingle()

  if (!data) return null

  return {
    nome: data.nome,
    telefone: (data.phone_e164 || data.telefone || null) as string | null,
  }
}

async function processEvent(
  supabase: ReturnType<typeof createClient>,
  supabaseUrl: string,
  serviceRoleKey: string,
  internalApiKey: string,
  event: NotificationEventRow,
) {
  const settings = await fetchNotificationSettings(supabase, event.org_id)
  const routing = settings
    ? resolveNotificationRouting({
      enabledNotifications: settings.enabled_notifications,
      enabledWhatsapp: settings.enabled_whatsapp,
      enabledEmail: settings.enabled_email,
      whatsappRecipients: settings.whatsapp_recipients,
      emailRecipients: settings.email_recipients,
    })
    : null

  if (!settings || !routing?.notificationsEnabled) {
    await supabase
      .from('notification_events')
      .update({
        status: 'canceled',
        locked_at: null,
        processed_at: new Date().toISOString(),
        last_error: 'notifications_disabled',
      })
      .eq('id', event.id)
    return
  }

  if (!routing.hasEnabledChannel) {
    await supabase
      .from('notification_events')
      .update({
        status: 'canceled',
        locked_at: null,
        processed_at: new Date().toISOString(),
        last_error: 'no_channel_enabled',
      })
      .eq('id', event.id)
    return
  }

  // Check per-event-type toggle
  const eventToggleMap: Record<string, boolean> = {
    novo_lead: settings.evt_novo_lead !== false,
    stage_changed: settings.evt_stage_changed !== false,
    visita_agendada: settings.evt_visita_agendada !== false,
    visita_realizada: settings.evt_visita_realizada !== false,
    chamada_agendada: settings.evt_chamada_agendada !== false,
    chamada_realizada: settings.evt_chamada_realizada !== false,
    financiamento_update: settings.evt_financiamento_update !== false,
    installment_due_check: settings.evt_installment_due_check !== false,
  }
  if (eventToggleMap[event.event_type] === false) {
    await supabase
      .from('notification_events')
      .update({
        status: 'canceled',
        locked_at: null,
        processed_at: new Date().toISOString(),
        last_error: `event_type_disabled:${event.event_type}`,
      })
      .eq('id', event.id)
    return
  }

  const lead = await resolveLead(supabase, event.org_id, event.payload || {})
  const { subject, text, ctx } = buildMessage(event, lead)

  // Build HTML email via template
  const emailCtx = { ...ctx, senderName: settings.email_sender_name }
  const emailContent = buildEmailContent(event.event_type, emailCtx)

  const failures: string[] = []
  const skippedChannels: DispatchChannel[] = []
  const successfulDispatches = await fetchSuccessfulDispatches(supabase, event)
  const targetWhatsappRecipients = routing.whatsappEnabled ? routing.whatsappRecipients : []
  const targetEmailRecipients = routing.emailEnabled ? routing.emailRecipients : []
  const totalTargets = targetWhatsappRecipients.length + targetEmailRecipients.length

  if (routing.whatsappEnabled) {
    if (!settings.whatsapp_instance_name) {
      failures.push('whatsapp_missing_instance')
      await logDispatch(supabase, event, 'whatsapp', '', 'failed', null, 'whatsapp_missing_instance')
    } else if (targetWhatsappRecipients.length === 0) {
      skippedChannels.push('whatsapp')
    } else {
      for (const targetNumber of targetWhatsappRecipients) {
        if (wasRecipientDelivered('whatsapp', targetNumber, successfulDispatches)) {
          continue
        }
        try {
          const responsePayload = await sendWhatsAppViaProxy(
            supabaseUrl,
            serviceRoleKey,
            internalApiKey,
            event.org_id,
            settings.whatsapp_instance_name,
            targetNumber,
            text,
          )
          markRecipientDelivered('whatsapp', targetNumber, successfulDispatches)
          await logDispatch(supabase, event, 'whatsapp', targetNumber, 'success', responsePayload, null)
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          failures.push(`whatsapp:${targetNumber}:${message}`)
          await logDispatch(supabase, event, 'whatsapp', targetNumber, 'failed', null, message)
        }
      }
    }
  }

  if (routing.emailEnabled) {
    if (targetEmailRecipients.length === 0) {
      skippedChannels.push('email')
    }
    for (const recipient of targetEmailRecipients) {
      if (wasRecipientDelivered('email', recipient, successfulDispatches)) {
        continue
      }
      try {
        const responsePayload = await sendEmailViaResend(
          recipient,
          emailContent.subject,
          emailContent.text,
          settings.email_sender_name,
          settings.email_reply_to,
          emailContent.html,
        )
        markRecipientDelivered('email', recipient, successfulDispatches)
        await logDispatch(supabase, event, 'email', recipient, 'success', responsePayload, null)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        failures.push(`email:${recipient}:${message}`)
        await logDispatch(supabase, event, 'email', recipient, 'failed', null, message)
      }
    }
  }

  const deliveredWhatsappCount = countDeliveredRecipients('whatsapp', targetWhatsappRecipients, successfulDispatches)
  const deliveredEmailCount = countDeliveredRecipients('email', targetEmailRecipients, successfulDispatches)
  const deliveredTargets = deliveredWhatsappCount + deliveredEmailCount

  if (totalTargets === 0 && failures.length === 0) {
    const canceledReason = skippedChannels.length > 0
      ? `no_channel_recipients:${skippedChannels.join(',')}`
      : 'no_dispatch_target'

    await supabase
      .from('notification_events')
      .update({
        status: 'canceled',
        locked_at: null,
        processed_at: new Date().toISOString(),
        last_error: canceledReason,
      })
      .eq('id', event.id)
    return
  }

  if (deliveredTargets === totalTargets && totalTargets > 0 && failures.length === 0) {
    await supabase
      .from('notification_events')
      .update({
        status: 'sent',
        locked_at: null,
        processed_at: new Date().toISOString(),
        last_error: null,
      })
      .eq('id', event.id)
    return
  }

  const attempts = Number(event.attempts || 0)
  const maxAttempts = 6
  const errorText = failures.join(' | ') || 'dispatch_failed'

  if (attempts >= maxAttempts) {
    await supabase
      .from('notification_events')
      .update({
        status: 'failed',
        locked_at: null,
        processed_at: new Date().toISOString(),
        last_error: errorText,
      })
      .eq('id', event.id)
    return
  }

  const backoffMinutes = Math.min(120, Math.pow(2, Math.max(0, attempts - 1)))
  const nextAttemptAt = new Date(Date.now() + backoffMinutes * 60_000).toISOString()

  await supabase
    .from('notification_events')
    .update({
      status: 'pending',
      locked_at: null,
      next_attempt_at: nextAttemptAt,
      last_error: errorText,
    })
    .eq('id', event.id)
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
      console.warn('[notification-worker][auth_rejected]', {
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
    const body = await req.json().catch(() => ({}))
    const batchSize = Math.max(1, Math.min(200, Number((body as any)?.batchSize || 50)))

    const { data: claimedRows, error: claimError } = await supabase.rpc('claim_notification_events', {
      p_batch_size: batchSize,
    })

    if (claimError) {
      throw new Error(`claim_failed:${claimError.message}`)
    }

    const events = Array.isArray(claimedRows) ? (claimedRows as NotificationEventRow[]) : []

    let processed = 0
    let failed = 0

    for (const event of events) {
      try {
        await processEvent(supabase, supabaseUrl, serviceRoleKey, internalApiKey, event)
        processed += 1
      } catch (error) {
        failed += 1
        const message = error instanceof Error ? error.message : String(error)
        const attempts = Number(event.attempts || 0)
        const maxAttempts = 6

        if (attempts >= maxAttempts) {
          await supabase
            .from('notification_events')
            .update({
              status: 'failed',
              locked_at: null,
              processed_at: new Date().toISOString(),
              last_error: message,
            })
            .eq('id', event.id)
        } else {
          const backoffMinutes = Math.min(120, Math.pow(2, Math.max(0, attempts - 1)))
          const nextAttemptAt = new Date(Date.now() + backoffMinutes * 60_000).toISOString()
          await supabase
            .from('notification_events')
            .update({
              status: 'pending',
              locked_at: null,
              next_attempt_at: nextAttemptAt,
              last_error: message,
            })
            .eq('id', event.id)
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        claimed: events.length,
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

