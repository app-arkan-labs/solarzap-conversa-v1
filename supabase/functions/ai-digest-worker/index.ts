import { createClient } from 'npm:@supabase/supabase-js@2'
import { digestEmail, type DigestLeadSummary } from '../_shared/emailTemplates.ts'

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
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

function summarizeLeadMessages(messages: Array<{ mensagem: string | null; wa_from_me: boolean | null; created_at: string }>) {
  const sorted = [...messages].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
  const last = sorted[sorted.length - 1]
  const lastText = String(last?.mensagem || '').replace(/\s+/g, ' ').trim().slice(0, 140)
  const lastFromClient = last ? last.wa_from_me !== true : false

  const pending = lastFromClient ? 'Cliente aguardando retorno.' : 'Sem pendência imediata.'
  const nextStep = lastFromClient ? 'Responder com próximo passo comercial.' : 'Manter follow-up e confirmar etapa.'

  return {
    lastText: lastText || 'Sem conteúdo textual recente.',
    pending,
    nextStep,
  }
}

async function processDigestForOrg(
  supabase: ReturnType<typeof createClient>,
  supabaseUrl: string,
  serviceRoleKey: string,
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
  const grouped = new Map<number, Array<{ mensagem: string | null; wa_from_me: boolean | null; created_at: string }>>()

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

  const leadSummaries = leadIds.slice(0, 30).map((leadId) => {
    const lead = leadById.get(leadId)
    const summary = summarizeLeadMessages(grouped.get(leadId) || [])
    return {
      leadId,
      leadName: lead?.nome || `Lead ${leadId}`,
      leadPhone: lead?.telefone || '',
      stage: lead?.status_pipeline || 'sem_etapa',
      ...summary,
    }
  })

  const digestTitle = ctx.digestType === 'weekly' ? 'Resumo semanal' : 'Resumo diário'
  const digestText = [
    `${digestTitle} (${ctx.dateBucket})`,
    `Leads com atividade: ${leadSummaries.length}`,
    '',
    ...leadSummaries.map((s, idx) => `${idx + 1}. ${s.leadName} [${s.stage}]\n- O que aconteceu: ${s.lastText}\n- Pendência: ${s.pending}\n- Próximo passo sugerido: ${s.nextStep}`),
  ].join('\n')

  const channelResults: Record<string, unknown> = {
    whatsapp: { sent: 0, failed: 0 },
    email: { sent: 0, failed: 0 },
    lead_summaries: leadSummaries.length,
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
        `- O que aconteceu: ${s.lastText}`,
        `- Pendências: ${s.pending}`,
        `- Próximo passo: ${s.nextStep}`,
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
          lastText: s.lastText,
          pending: s.pending,
          nextStep: s.nextStep,
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

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error('missing_supabase_env')
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
        const result = await processDigestForOrg(supabase, supabaseUrl, serviceRoleKey, settings, ctx)
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

