import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-internal-api-key',
}

const DEFAULT_WEBHOOK_EVENTS = [
  'QRCODE_UPDATED',
  'CONNECTION_UPDATE',
  'MESSAGES_UPSERT',
  'MESSAGES_UPDATE',
  'MESSAGES_DELETE',
  'SEND_MESSAGE',
]

type RequestContext = {
  orgId: string
  userId: string | null
  role: string | null
  isOrgManager: boolean
  internal: boolean
}

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function normalizeAction(raw: unknown): string {
  const value = String(raw || '')
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[_\s]+/g, '-')
    .toLowerCase()

  const aliases: Record<string, string> = {
    'create-instance': 'instance-create',
    createinstance: 'instance-create',
    'instance-create': 'instance-create',

    'connect-instance': 'instance-connect',
    connectinstance: 'instance-connect',
    'instance-connect': 'instance-connect',

    'get-instance-status': 'instance-status',
    getinstancestatus: 'instance-status',
    'instance-status': 'instance-status',

    'fetch-instances': 'instance-fetch',
    fetchinstances: 'instance-fetch',
    'instance-fetch': 'instance-fetch',

    'delete-instance': 'instance-delete',
    deleteinstance: 'instance-delete',
    'instance-delete': 'instance-delete',

    'logout-instance': 'instance-logout',
    logoutinstance: 'instance-logout',
    'instance-logout': 'instance-logout',

    'send-message': 'send-text',
    sendmessage: 'send-text',
    'send-text': 'send-text',

    'send-media': 'send-media',
    sendmedia: 'send-media',
    'send-audio': 'send-media',
    sendaudio: 'send-media',

    'set-webhook': 'set-webhook',
    setwebhook: 'set-webhook',

    'send-reaction': 'send-reaction',
    sendreaction: 'send-reaction',
  }

  return aliases[value] || value
}

function normalizePhone(raw: unknown): string {
  return String(raw || '').replace(/\D/g, '')
}

function ensureEvolutionConfig() {
  const baseUrlRaw = Deno.env.get('EVOLUTION_API_URL')
  const apiKey = Deno.env.get('EVOLUTION_API_KEY')

  if (!baseUrlRaw || !apiKey) {
    throw new Error('Evolution API configuration missing. Set EVOLUTION_API_URL and EVOLUTION_API_KEY.')
  }

  return {
    baseUrl: baseUrlRaw.replace(/\/$/, ''),
    apiKey,
  }
}

async function evolutionRequest(
  endpoint: string,
  options: RequestInit = {},
): Promise<unknown> {
  const { baseUrl, apiKey } = ensureEvolutionConfig()

  const response = await fetch(`${baseUrl}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      apikey: apiKey,
      ...(options.headers || {}),
    },
  })

  const raw = await response.text()
  let parsed: unknown = raw
  try {
    parsed = raw ? JSON.parse(raw) : null
  } catch {
    parsed = raw
  }

  if (!response.ok) {
    const errorPayload = typeof parsed === 'string' ? parsed : JSON.stringify(parsed)
    throw new Error(`Evolution API error ${response.status}: ${errorPayload}`)
  }

  return parsed
}

function withWebhookSecret(url: string): string {
  const secret = Deno.env.get('ARKAN_WEBHOOK_SECRET')
  if (!secret) return url

  const parsed = new URL(url)
  if (!parsed.searchParams.get('secret')) {
    parsed.searchParams.set('secret', secret)
  }
  return parsed.toString()
}

async function canonicalWebhookUrl(req: Request): Promise<string> {
  const explicit = Deno.env.get('WHATSAPP_WEBHOOK_URL')
  if (explicit) return withWebhookSecret(explicit)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const origin = (supabaseUrl || new URL(req.url).origin).replace(/\/$/, '')
  const candidates = [
    `${origin}/functions/v1/whatsapp-webhook`,
    `${origin}/functions/v1/evolution-webhook`,
  ]

  for (const candidate of candidates) {
    try {
      const response = await fetch(candidate, { method: 'OPTIONS' })
      if (response.status !== 404) {
        return withWebhookSecret(candidate)
      }
    } catch (_error) {
      // Try next candidate
    }
  }

  return withWebhookSecret(candidates[0])
}

async function resolveContext(
  req: Request,
  payload: Record<string, unknown>,
  supabaseAdmin: ReturnType<typeof createClient>,
): Promise<RequestContext> {
  const internalSecret = Deno.env.get('EDGE_INTERNAL_API_KEY')
  const internalHeader = req.headers.get('x-internal-api-key')
  const authHeader = req.headers.get('Authorization') || ''
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  const bearerToken = authHeader.replace(/^Bearer\\s+/i, '').trim()

  if (internalSecret && internalHeader && internalHeader === internalSecret) {
    const orgId = String(payload.orgId || '').trim()
    if (!orgId) {
      throw new Error('orgId is required for internal evolution-proxy calls')
    }

    return {
      orgId,
      userId: null,
      role: 'service_role',
      isOrgManager: true,
      internal: true,
    }
  }

  if (serviceRoleKey && bearerToken === serviceRoleKey) {
    const orgId = String(payload.orgId || '').trim()
    if (!orgId) {
      throw new Error('orgId is required for service-role evolution-proxy calls')
    }

    return {
      orgId,
      userId: null,
      role: 'service_role',
      isOrgManager: true,
      internal: true,
    }
  }

  if (!authHeader) {
    throw new Error('Missing Authorization header')
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
  const supabaseAnon = Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

  if (!supabaseUrl || !supabaseAnon) {
    throw new Error('Missing SUPABASE_URL/SUPABASE_ANON_KEY env')
  }

  const authClient = createClient(supabaseUrl, supabaseAnon, {
    global: {
      headers: {
        Authorization: authHeader,
      },
    },
  })

  const {
    data: { user },
    error: userError,
  } = await authClient.auth.getUser()

  if (userError || !user?.id) {
    throw new Error('Invalid user token')
  }

  const requestedOrgId = String(payload.orgId || '').trim() || null
  let memberQuery = supabaseAdmin
    .from('organization_members')
    .select('org_id, role, created_at')
    .eq('user_id', user.id)

  if (requestedOrgId) {
    memberQuery = memberQuery.eq('org_id', requestedOrgId)
  }

  const { data: member, error: memberError } = await memberQuery
    .order('created_at', { ascending: true })
    .order('org_id', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (memberError || !member?.org_id) {
    throw new Error('Organization membership not found')
  }

  const role = String(member.role || 'user').toLowerCase()

  return {
    orgId: member.org_id,
    userId: user.id,
    role,
    isOrgManager: role === 'owner' || role === 'admin',
    internal: false,
  }
}

async function ensureInstanceScoped(
  supabaseAdmin: ReturnType<typeof createClient>,
  ctx: RequestContext,
  instanceName: string,
) {
  let query = supabaseAdmin
    .from('whatsapp_instances')
    .select('id, instance_name, org_id, user_id, is_active')
    .eq('org_id', ctx.orgId)
    .eq('instance_name', instanceName)

  if (!ctx.internal && !ctx.isOrgManager && ctx.userId) {
    query = query.eq('user_id', ctx.userId)
  }

  const { data: instance, error } = await query.maybeSingle()

  if (error || !instance?.instance_name || instance.is_active === false) {
    throw new Error('Instance not found in organization scope')
  }

  return instance
}

function requireString(payload: Record<string, unknown>, key: string): string {
  const value = String(payload[key] || '').trim()
  if (!value) throw new Error(`Missing required field: ${key}`)
  return value
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    if (!supabaseUrl || !serviceRole) {
      throw new Error('Missing SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY env')
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRole)

    const rawBody = await req.json().catch(() => ({}))
    const body = rawBody && typeof rawBody === 'object' ? (rawBody as Record<string, unknown>) : {}
    const action = normalizeAction(body.action)
    const fallbackPayload = { ...body }
    delete (fallbackPayload as Record<string, unknown>).action
    const payload =
      body.payload && typeof body.payload === 'object'
        ? (body.payload as Record<string, unknown>)
        : fallbackPayload

    if (!action) {
      throw new Error('Missing action')
    }

    const ctx = await resolveContext(req, payload, supabaseAdmin)

    const actionsWithInstance = new Set([
      'send-text',
      'send-media',
      'set-webhook',
      'instance-connect',
      'instance-status',
      'instance-delete',
      'instance-logout',
      'send-reaction',
    ])

    const instanceName = typeof payload.instanceName === 'string' ? payload.instanceName.trim() : ''
    if (actionsWithInstance.has(action)) {
      if (!instanceName) throw new Error('Missing required field: instanceName')
      await ensureInstanceScoped(supabaseAdmin, ctx, instanceName)
    }

    let data: unknown

    switch (action) {
      case 'instance-create': {
        const candidateName = requireString(payload, 'instanceName')
        const { data: conflict } = await supabaseAdmin
          .from('whatsapp_instances')
          .select('org_id')
          .eq('instance_name', candidateName)
          .maybeSingle()

        if (conflict?.org_id && conflict.org_id !== ctx.orgId) {
          throw new Error('Instance name already in use by another organization')
        }

        data = await evolutionRequest('/instance/create', {
          method: 'POST',
          body: JSON.stringify({
            instanceName: candidateName,
            qrcode: true,
            integration: 'WHATSAPP-BAILEYS',
          }),
        })
        break
      }

      case 'instance-connect': {
        data = await evolutionRequest(`/instance/connect/${instanceName}`, { method: 'GET' })
        break
      }

      case 'instance-status': {
        data = await evolutionRequest(`/instance/connectionState/${instanceName}`, { method: 'GET' })
        break
      }

      case 'instance-fetch': {
        let query = supabaseAdmin
          .from('whatsapp_instances')
          .select('*')
          .eq('org_id', ctx.orgId)
          .eq('is_active', true)
          .order('created_at', { ascending: false })

        if (!ctx.internal && !ctx.isOrgManager && ctx.userId) {
          query = query.eq('user_id', ctx.userId)
        }

        const { data: rows, error } = await query
        if (error) throw error
        data = rows || []
        break
      }

      case 'instance-delete': {
        data = await evolutionRequest(`/instance/delete/${instanceName}`, { method: 'DELETE' })
        break
      }

      case 'instance-logout': {
        data = await evolutionRequest(`/instance/logout/${instanceName}`, { method: 'DELETE' })
        break
      }

      case 'send-text': {
        const number = normalizePhone(payload.number)
        const text = requireString(payload, 'text')
        const quoted = payload.quoted

        if (!number) throw new Error('Invalid number')

        data = await evolutionRequest(`/message/sendText/${instanceName}`, {
          method: 'POST',
          body: JSON.stringify({
            number,
            text,
            ...(quoted ? { quoted } : {}),
          }),
        })
        break
      }

      case 'send-media': {
        const number = normalizePhone(payload.number)
        const mediaUrl = requireString(payload, 'mediaUrl')
        const mediaType = String(payload.mediaType || '').trim().toLowerCase()

        if (!number) throw new Error('Invalid number')
        if (!['image', 'video', 'audio', 'document'].includes(mediaType)) {
          throw new Error('mediaType must be image|video|audio|document')
        }

        if (mediaType === 'audio') {
          data = await evolutionRequest(`/message/sendWhatsAppAudio/${instanceName}`, {
            method: 'POST',
            body: JSON.stringify({
              number,
              audio: mediaUrl,
            }),
          })
          break
        }

        data = await evolutionRequest(`/message/sendMedia/${instanceName}`, {
          method: 'POST',
          body: JSON.stringify({
            number,
            mediatype: mediaType,
            media: mediaUrl,
            caption: payload.caption || undefined,
            fileName: payload.fileName || undefined,
            mimetype: payload.mimetype || undefined,
          }),
        })
        break
      }

      case 'set-webhook': {
        const events = Array.isArray(payload.events) && payload.events.length > 0
          ? payload.events
          : DEFAULT_WEBHOOK_EVENTS

        const webhook = await canonicalWebhookUrl(req)

        const evolution = await evolutionRequest(`/webhook/set/${instanceName}`, {
          method: 'POST',
          body: JSON.stringify({
            webhook: {
              url: webhook,
              enabled: true,
              events,
            },
          }),
        })

        data = {
          evolution,
          webhook,
        }
        break
      }

      case 'send-reaction': {
        const key = payload.key as { remoteJid?: string; fromMe?: boolean; id?: string } | undefined
        const reaction = String(payload.reaction || '').trim()

        if (!key || !key.id || !key.remoteJid) {
          throw new Error('Missing reaction key payload')
        }

        const remoteJid = key.remoteJid.includes('@') ? key.remoteJid : `${key.remoteJid}@s.whatsapp.net`

        data = await evolutionRequest(`/message/sendReaction/${instanceName}`, {
          method: 'POST',
          body: JSON.stringify({
            key: {
              ...key,
              remoteJid,
            },
            reaction,
          }),
        })
        break
      }

      default:
        throw new Error(`Unknown action: ${action}`)
    }

    return jsonResponse({ success: true, data })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error'
    const status = /authorization|unauthorized|token|membership/i.test(message) ? 401 : 400
    return jsonResponse({ success: false, error: message }, status)
  }
})

