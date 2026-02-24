import { createClient } from 'npm:@supabase/supabase-js@2'
import { buildEmailContent, type TemplateContext } from '../_shared/emailTemplates.ts'

const ALLOWED_ORIGIN = Deno.env.get('ALLOWED_ORIGIN')
if (!ALLOWED_ORIGIN) {
  throw new Error('Missing ALLOWED_ORIGIN env')
}

const corsHeaders = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

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
}

function toDigits(value: unknown): string {
  return String(value || '').replace(/\D/g, '')
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

function buildMessage(event: NotificationEventRow, lead: { nome?: string | null; telefone?: string | null } | null) {
  const payload = event.payload || {}
  const leadName = String(payload.nome || lead?.nome || 'Lead').trim()
  const leadPhone = String(payload.telefone || lead?.telefone || '').trim()
  const title = String(payload.title || '').trim()
  const startAt = formatDateTime(payload.start_at)
  const fromStage = String(payload.from_stage || '').trim()
  const toStage = String(payload.to_stage || '').trim()

  // Build context for both plain-text (WhatsApp) and HTML (email) templates
  const ctx: TemplateContext = {
    leadName,
    leadPhone,
    title,
    startAt: payload.start_at ? String(payload.start_at) : undefined,
    fromStage: fromStage || undefined,
    toStage: toStage || undefined,
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
    default:
      subject = 'Notificação CRM'
      text = `Evento ${event.event_type} para ${leadName}.`
  }

  return { subject, text, ctx }
}

async function sendWhatsAppViaProxy(
  supabaseUrl: string,
  serviceRoleKey: string,
  orgId: string,
  instanceName: string,
  number: string,
  text: string,
) {
  const response = await fetch(`${supabaseUrl.replace(/\/$/, '')}/functions/v1/evolution-proxy`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
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

async function resolveLead(
  supabase: ReturnType<typeof createClient>,
  orgId: string,
  payload: Record<string, unknown>,
) {
  const leadId = payload.lead_id
  if (!leadId) return null

  const { data } = await supabase
    .from('leads')
    .select('id, nome, telefone, phone_e164, assigned_to_user_id, user_id')
    .eq('org_id', orgId)
    .eq('id', Number(leadId))
    .maybeSingle()

  if (!data) return null

  return {
    nome: data.nome,
    telefone: (data.phone_e164 || data.telefone || null) as string | null,
    ownerUserId: (data.assigned_to_user_id || data.user_id || null) as string | null,
  }
}

async function resolveOwnerNotificationNumber(
  supabase: ReturnType<typeof createClient>,
  orgId: string,
  ownerUserId: string,
): Promise<string> {
  const { data } = await supabase
    .from('whatsapp_instances')
    .select('phone_number, status, is_active, updated_at')
    .eq('org_id', orgId)
    .eq('user_id', ownerUserId)
    .order('updated_at', { ascending: false })
    .limit(20)

  const rows = Array.isArray(data) ? data : []
  if (rows.length === 0) return ''

  const connected = rows.find((row) => String((row as any).status || '').toLowerCase() === 'connected')
  if (connected?.phone_number) {
    return toDigits(connected.phone_number)
  }

  const active = rows.find((row) => (row as any).is_active === true)
  if (active?.phone_number) {
    return toDigits(active.phone_number)
  }

  return toDigits(rows[0]?.phone_number || '')
}

async function processEvent(
  supabase: ReturnType<typeof createClient>,
  supabaseUrl: string,
  serviceRoleKey: string,
  event: NotificationEventRow,
) {
  const { data: settingsRow, error: settingsError } = await supabase
    .from('notification_settings')
    .select('org_id, enabled_notifications, enabled_whatsapp, enabled_email, enabled_reminders, whatsapp_instance_name, whatsapp_recipients, email_recipients, email_sender_name, email_reply_to, evt_novo_lead, evt_stage_changed, evt_visita_agendada, evt_visita_realizada, evt_chamada_agendada, evt_chamada_realizada, evt_financiamento_update')
    .eq('org_id', event.org_id)
    .maybeSingle()

  if (settingsError) {
    throw new Error(`settings_error:${settingsError.message}`)
  }

  const settings = settingsRow as NotificationSettingsRow | null

  if (!settings || !settings.enabled_notifications) {
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

  // Check per-event-type toggle
  const eventToggleMap: Record<string, boolean> = {
    novo_lead: settings.evt_novo_lead !== false,
    stage_changed: settings.evt_stage_changed !== false,
    visita_agendada: settings.evt_visita_agendada !== false,
    visita_realizada: settings.evt_visita_realizada !== false,
    chamada_agendada: settings.evt_chamada_agendada !== false,
    chamada_realizada: settings.evt_chamada_realizada !== false,
    financiamento_update: settings.evt_financiamento_update !== false,
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
  let sentCount = 0

  if (settings.enabled_whatsapp && settings.whatsapp_instance_name) {
    const normalizedConfiguredRecipients = Array.isArray(settings.whatsapp_recipients)
      ? settings.whatsapp_recipients
          .map((value) => toDigits(value))
          .filter(Boolean)
      : []

    let ownerNumber = ''
    if (lead?.ownerUserId) {
      ownerNumber = await resolveOwnerNotificationNumber(supabase, event.org_id, lead.ownerUserId)
    }

    const recipients = Array.from(new Set([...normalizedConfiguredRecipients, ownerNumber].filter(Boolean)))

    let fallbackInstanceNumber = ''
    if (recipients.length === 0) {
      const { data: instanceRow } = await supabase
        .from('whatsapp_instances')
        .select('phone_number')
        .eq('org_id', event.org_id)
        .eq('instance_name', settings.whatsapp_instance_name)
        .maybeSingle()
      fallbackInstanceNumber = toDigits(instanceRow?.phone_number || '')
    }

    const finalRecipients = recipients.length > 0
      ? recipients
      : (fallbackInstanceNumber ? [fallbackInstanceNumber] : [])

    if (finalRecipients.length === 0) {
      failures.push('whatsapp_missing_target_number')
      await logDispatch(supabase, event, 'whatsapp', '', 'failed', null, 'whatsapp_missing_target_number')
    } else {
      for (const targetNumber of finalRecipients) {
        try {
          const responsePayload = await sendWhatsAppViaProxy(
            supabaseUrl,
            serviceRoleKey,
            event.org_id,
            settings.whatsapp_instance_name,
            targetNumber,
            text,
          )
          sentCount += 1
          await logDispatch(supabase, event, 'whatsapp', targetNumber, 'success', responsePayload, null)
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          failures.push(`whatsapp:${targetNumber}:${message}`)
          await logDispatch(supabase, event, 'whatsapp', targetNumber, 'failed', null, message)
        }
      }
    }
  }

  if (settings.enabled_email && Array.isArray(settings.email_recipients) && settings.email_recipients.length > 0) {
    for (const rawRecipient of settings.email_recipients) {
      const recipient = String(rawRecipient || '').trim()
      if (!recipient) continue

      try {
        const responsePayload = await sendEmailViaResend(
          recipient,
          emailContent.subject,
          emailContent.text,
          settings.email_sender_name,
          settings.email_reply_to,
          emailContent.html,
        )
        sentCount += 1
        await logDispatch(supabase, event, 'email', recipient, 'success', responsePayload, null)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        failures.push(`email:${recipient}:${message}`)
        await logDispatch(supabase, event, 'email', recipient, 'failed', null, message)
      }
    }
  }

  if (!settings.enabled_whatsapp && !settings.enabled_email) {
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

  if (sentCount > 0 && failures.length === 0) {
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

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error('missing_supabase_env')
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
        await processEvent(supabase, supabaseUrl, serviceRoleKey, event)
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
    console.error('notification-worker error:', error)
    return new Response(JSON.stringify({ success: false, error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

