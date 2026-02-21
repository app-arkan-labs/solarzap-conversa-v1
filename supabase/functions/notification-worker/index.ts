import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
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
  email_recipients: string[]
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

  switch (event.event_type) {
    case 'novo_lead':
      return {
        subject: 'Novo lead no CRM',
        text: `Novo lead criado: ${leadName}${leadPhone ? ` (${leadPhone})` : ''}.`,
      }
    case 'visita_agendada':
      return {
        subject: 'Visita agendada',
        text: `Visita agendada para ${leadName}${startAt ? ` em ${startAt}` : ''}${title ? `. ${title}` : ''}.`,
      }
    case 'chamada_agendada':
      return {
        subject: 'Chamada agendada',
        text: `Chamada agendada para ${leadName}${startAt ? ` em ${startAt}` : ''}${title ? `. ${title}` : ''}.`,
      }
    case 'visita_realizada':
      return {
        subject: 'Visita realizada',
        text: `Visita marcada como realizada para ${leadName}${title ? `. ${title}` : ''}.`,
      }
    case 'chamada_realizada':
      return {
        subject: 'Chamada realizada',
        text: `Chamada marcada como realizada para ${leadName}${title ? `. ${title}` : ''}.`,
      }
    case 'financiamento_update':
      return {
        subject: 'Atualização de financiamento',
        text: `Lead ${leadName} mudou etapa de ${fromStage || 'origem'} para ${toStage || 'financiamento'}.`,
      }
    default:
      return {
        subject: 'Notificação CRM',
        text: `Evento ${event.event_type} para ${leadName}.`,
      }
  }
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
) {
  const resendKey = Deno.env.get('RESEND_API_KEY') || ''
  if (!resendKey) {
    throw new Error('missing_resend_api_key')
  }

  const fromEmail = Deno.env.get('RESEND_FROM_EMAIL') || 'SolarZap <notificacoes@resend.dev>'

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${resendKey}`,
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [recipient],
      subject,
      text,
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
  event: NotificationEventRow,
) {
  const { data: settingsRow, error: settingsError } = await supabase
    .from('notification_settings')
    .select('org_id, enabled_notifications, enabled_whatsapp, enabled_email, enabled_reminders, whatsapp_instance_name, email_recipients')
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

  const lead = await resolveLead(supabase, event.org_id, event.payload || {})
  const { subject, text } = buildMessage(event, lead)

  const failures: string[] = []
  let sentCount = 0

  if (settings.enabled_whatsapp && settings.whatsapp_instance_name) {
    const payloadNumber = toDigits((event.payload || {}).telefone || (event.payload || {}).phone || '')
    const leadNumber = toDigits(lead?.telefone || '')

    let fallbackInstanceNumber = ''
    if (!payloadNumber && !leadNumber) {
      const { data: instanceRow } = await supabase
        .from('whatsapp_instances')
        .select('phone_number')
        .eq('org_id', event.org_id)
        .eq('instance_name', settings.whatsapp_instance_name)
        .maybeSingle()
      fallbackInstanceNumber = toDigits(instanceRow?.phone_number || '')
    }

    const targetNumber = payloadNumber || leadNumber || fallbackInstanceNumber

    if (!targetNumber) {
      failures.push('whatsapp_missing_target_number')
      await logDispatch(supabase, event, 'whatsapp', '', 'failed', null, 'whatsapp_missing_target_number')
    } else {
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
        failures.push(`whatsapp:${message}`)
        await logDispatch(supabase, event, 'whatsapp', targetNumber, 'failed', null, message)
      }
    }
  }

  if (settings.enabled_email && Array.isArray(settings.email_recipients) && settings.email_recipients.length > 0) {
    for (const rawRecipient of settings.email_recipients) {
      const recipient = String(rawRecipient || '').trim()
      if (!recipient) continue

      try {
        const responsePayload = await sendEmailViaResend(recipient, subject, text)
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
    const message = error instanceof Error ? error.message : String(error)
    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

