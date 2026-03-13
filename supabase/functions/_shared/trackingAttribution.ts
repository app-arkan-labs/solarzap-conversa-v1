type AnyRecord = Record<string, unknown>

export type TriggerRule = {
  id: string
  trigger_text: string
  match_type: 'exact' | 'contains' | 'starts_with' | 'regex' | string
  inferred_channel: string
  priority?: number | null
}

export type CtwaData = {
  ctwa_source_url: string | null
  ctwa_source_type: string | null
  ctwa_source_id: string | null
  ctwa_headline: string | null
  ctwa_body: string | null
  ctwa_clid: string | null
}

export type AttributionInput = {
  orgId: string
  leadId: number
  messageText?: string | null
  utm_source?: string | null
  utm_medium?: string | null
  utm_campaign?: string | null
  utm_content?: string | null
  utm_term?: string | null
  raw_querystring?: string | null
  gclid?: string | null
  gbraid?: string | null
  wbraid?: string | null
  fbclid?: string | null
  fbc?: string | null
  fbp?: string | null
  ttclid?: string | null
  msclkid?: string | null
  session_id?: string | null
  landing_page_url?: string | null
  referrer_url?: string | null
  user_email?: string | null
  user_phone?: string | null
  user_ip?: string | null
  user_agent?: string | null
  ctwa?: CtwaData | null
}

export type AttributionApplyResult = {
  attribution_id: string | null
  inferred_channel: string | null
  channel_inferred: boolean
  channel_updated: boolean
  attribution_method: string | null
  trigger_message_rule_id: string | null
}

function cleanText(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function normalizeForMatch(value: string | null): string {
  return (value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function asRecord(value: unknown): AnyRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as AnyRecord)
    : null
}

export async function sha256Hex(input: string): Promise<string> {
  const encoder = new TextEncoder()
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(input))
  const bytes = Array.from(new Uint8Array(digest))
  return bytes.map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function hashOptional(value: string | null | undefined): Promise<string | null> {
  const normalized = cleanText(value)
  if (!normalized) return null
  return sha256Hex(normalized.toLowerCase())
}

export function matchTriggerRule(messageText: string | null | undefined, rules: TriggerRule[]): TriggerRule | null {
  const message = normalizeForMatch(cleanText(messageText))
  if (!message) return null

  for (const rule of rules) {
    const triggerText = cleanText(rule.trigger_text)
    if (!triggerText) continue

    const trigger = normalizeForMatch(triggerText)
    const matchType = String(rule.match_type || 'contains').toLowerCase()

    if (matchType === 'exact' && message === trigger) return rule
    if (matchType === 'contains' && message.includes(trigger)) return rule
    if (matchType === 'starts_with' && message.startsWith(trigger)) return rule
    if (matchType === 'regex') {
      try {
        if (new RegExp(triggerText, 'i').test(messageText || '')) return rule
      } catch {
        // Ignore invalid regex rules without breaking attribution.
      }
    }
  }

  return null
}

function inferCtwaChannel(ctwa: CtwaData | null | undefined): string | null {
  if (!ctwa) return null

  const sourceType = normalizeForMatch(ctwa.ctwa_source_type)
  const sourceUrl = normalizeForMatch(ctwa.ctwa_source_url)
  const sourceId = normalizeForMatch(ctwa.ctwa_source_id)
  const sourceCombined = `${sourceType} ${sourceUrl} ${sourceId}`

  if (!sourceCombined.trim()) return null
  if (sourceCombined.includes('instagram') || sourceCombined.includes('ig')) return 'instagram'
  if (sourceCombined.includes('facebook') || sourceCombined.includes('fb')) return 'facebook_ads'
  return null
}

function inferUtmClickChannel(input: AttributionInput): string | null {
  if (cleanText(input.gclid) || cleanText(input.gbraid) || cleanText(input.wbraid) || cleanText(input.msclkid)) {
    return 'google_ads'
  }

  if (cleanText(input.fbclid) || cleanText(input.fbc) || cleanText(input.fbp)) {
    return 'facebook_ads'
  }

  if (cleanText(input.ttclid)) {
    return 'tiktok_ads'
  }

  const utmSource = normalizeForMatch(input.utm_source || null)
  if (!utmSource) return null
  if (utmSource.includes('instagram')) return 'instagram'
  if (utmSource.includes('facebook')) return 'facebook_ads'
  if (utmSource.includes('google')) return 'google_ads'
  if (utmSource.includes('tiktok') || utmSource.includes('tt')) return 'tiktok_ads'
  return null
}

export function inferChannel(
  input: AttributionInput,
  matchedRule: TriggerRule | null,
): { inferred_channel: string | null; attribution_method: string | null } {
  const fromCtwa = inferCtwaChannel(input.ctwa)
  if (fromCtwa) return { inferred_channel: fromCtwa, attribution_method: 'ctwa' }

  if (matchedRule?.inferred_channel) {
    return {
      inferred_channel: matchedRule.inferred_channel,
      attribution_method: 'trigger_message',
    }
  }

  const fromUtmClick = inferUtmClickChannel(input)
  if (fromUtmClick) {
    return { inferred_channel: fromUtmClick, attribution_method: 'utm_clickid' }
  }

  return { inferred_channel: null, attribution_method: null }
}

export function shouldOverwriteChannel(
  currentChannel: string | null | undefined,
  channelIsInferred: boolean | null | undefined,
  forceChannelOverwrite: boolean | null | undefined,
): boolean {
  if (forceChannelOverwrite === true) return true
  if (!cleanText(currentChannel)) return true
  return channelIsInferred === true
}

export async function buildTouchpointFingerprint(input: AttributionInput): Promise<string> {
  const fingerprintPayload = {
    utm_source: input.utm_source || null,
    utm_medium: input.utm_medium || null,
    utm_campaign: input.utm_campaign || null,
    utm_content: input.utm_content || null,
    utm_term: input.utm_term || null,
    gclid: input.gclid || null,
    gbraid: input.gbraid || null,
    wbraid: input.wbraid || null,
    fbclid: input.fbclid || null,
    ttclid: input.ttclid || null,
    msclkid: input.msclkid || null,
    landing_page_url: input.landing_page_url || null,
    referrer_url: input.referrer_url || null,
    session_id: input.session_id || null,
  }
  return sha256Hex(JSON.stringify(fingerprintPayload))
}

export function extractCtwaFromWhatsAppMessage(msg: unknown, msgType: string | null): CtwaData | null {
  const root = asRecord(msg)
  if (!root) return null

  const messageNode = asRecord(root.message)
  const typedNode = msgType && messageNode ? asRecord(messageNode[msgType]) : null
  const contextInfo =
    asRecord(typedNode?.contextInfo) ||
    asRecord((messageNode && asRecord(messageNode.extendedTextMessage)?.contextInfo) || null) ||
    asRecord(root.contextInfo)

  const externalAdReply = asRecord(contextInfo?.externalAdReply)
  if (!externalAdReply) return null

  const ctwa: CtwaData = {
    ctwa_source_url: cleanText(externalAdReply.sourceUrl) || cleanText(externalAdReply.source_url),
    ctwa_source_type: cleanText(externalAdReply.sourceType) || cleanText(externalAdReply.source_type),
    ctwa_source_id: cleanText(externalAdReply.sourceId) || cleanText(externalAdReply.source_id),
    ctwa_headline: cleanText(externalAdReply.title) || cleanText(externalAdReply.headline),
    ctwa_body: cleanText(externalAdReply.body) || cleanText(externalAdReply.description),
    ctwa_clid:
      cleanText(externalAdReply.ctwaClid) ||
      cleanText(externalAdReply.ctwa_clid) ||
      cleanText(externalAdReply.clid),
  }

  const hasAny = Object.values(ctwa).some((value) => !!value)
  return hasAny ? ctwa : null
}

export async function applyLeadAttribution(
  supabase: any,
  input: AttributionInput,
): Promise<AttributionApplyResult> {
  const { data: settings } = await supabase
    .from('org_tracking_settings')
    .select('force_channel_overwrite, auto_channel_attribution')
    .eq('org_id', input.orgId)
    .maybeSingle()

  const { data: lead } = await supabase
    .from('leads')
    .select('id, canal')
    .eq('id', input.leadId)
    .eq('org_id', input.orgId)
    .maybeSingle()

  if (!lead?.id) {
    return {
      attribution_id: null,
      inferred_channel: null,
      channel_inferred: false,
      channel_updated: false,
      attribution_method: null,
      trigger_message_rule_id: null,
    }
  }

  const { data: existingAttribution } = await supabase
    .from('lead_attribution')
    .select('id, channel_is_inferred')
    .eq('lead_id', input.leadId)
    .maybeSingle()

  let matchedRule: TriggerRule | null = null
  if (settings?.auto_channel_attribution !== false && cleanText(input.messageText)) {
    const { data: rules } = await supabase
      .from('ad_trigger_messages')
      .select('id, trigger_text, match_type, inferred_channel, priority')
      .eq('org_id', input.orgId)
      .eq('is_active', true)
      .order('priority', { ascending: true })
      .order('created_at', { ascending: true })

    matchedRule = matchTriggerRule(input.messageText, (rules || []) as TriggerRule[])
  }

  const { inferred_channel, attribution_method } = inferChannel(input, matchedRule)
  const channel_inferred = !!inferred_channel

  const channelCanBeOverwritten = shouldOverwriteChannel(
    lead.canal,
    existingAttribution?.channel_is_inferred ?? false,
    settings?.force_channel_overwrite ?? false,
  )

  let channelUpdated = false
  if (inferred_channel && channelCanBeOverwritten && String(lead.canal || '') !== inferred_channel) {
    const { error: channelUpdateError } = await supabase
      .from('leads')
      .update({ canal: inferred_channel })
      .eq('id', input.leadId)
      .eq('org_id', input.orgId)
    channelUpdated = !channelUpdateError
  }

  const userEmailSha256 = await hashOptional(input.user_email)
  const userPhoneSha256 = await hashOptional(input.user_phone)

  const upsertPayload = {
    org_id: input.orgId,
    lead_id: input.leadId,
    utm_source: input.utm_source || null,
    utm_medium: input.utm_medium || null,
    utm_campaign: input.utm_campaign || null,
    utm_content: input.utm_content || null,
    utm_term: input.utm_term || null,
    raw_querystring: input.raw_querystring || null,
    gclid: input.gclid || null,
    gbraid: input.gbraid || null,
    wbraid: input.wbraid || null,
    fbclid: input.fbclid || null,
    fbc: input.fbc || null,
    fbp: input.fbp || null,
    ttclid: input.ttclid || null,
    msclkid: input.msclkid || null,
    last_utm_source: input.utm_source || null,
    last_utm_medium: input.utm_medium || null,
    last_utm_campaign: input.utm_campaign || null,
    last_utm_content: input.utm_content || null,
    last_utm_term: input.utm_term || null,
    last_gclid: input.gclid || null,
    last_gbraid: input.gbraid || null,
    last_wbraid: input.wbraid || null,
    last_fbclid: input.fbclid || null,
    last_ttclid: input.ttclid || null,
    last_msclkid: input.msclkid || null,
    ctwa_source_url: input.ctwa?.ctwa_source_url || null,
    ctwa_source_type: input.ctwa?.ctwa_source_type || null,
    ctwa_source_id: input.ctwa?.ctwa_source_id || null,
    ctwa_headline: input.ctwa?.ctwa_headline || null,
    ctwa_body: input.ctwa?.ctwa_body || null,
    ctwa_clid: input.ctwa?.ctwa_clid || null,
    trigger_message_matched: matchedRule?.trigger_text || null,
    trigger_message_rule_id: matchedRule?.id || null,
    inferred_channel: inferred_channel || null,
    attribution_method: attribution_method || null,
    channel_is_inferred: channel_inferred,
    user_email_sha256: userEmailSha256,
    user_phone_sha256: userPhoneSha256,
    user_ip: input.user_ip || null,
    user_agent: input.user_agent || null,
    landing_page_url: input.landing_page_url || null,
    referrer_url: input.referrer_url || null,
    session_id: input.session_id || null,
    last_touch_at: new Date().toISOString(),
  }

  const { data: upserted, error: upsertError } = await supabase
    .from('lead_attribution')
    .upsert(upsertPayload, { onConflict: 'lead_id' })
    .select('id')
    .single()

  if (!upsertError && upserted?.id) {
    try {
      const touchpointFingerprint = await buildTouchpointFingerprint(input)
      await supabase.from('attribution_touchpoints').insert({
        org_id: input.orgId,
        lead_id: input.leadId,
        attribution_id: upserted.id,
        touch_type: existingAttribution?.id ? 'last' : 'first',
        channel: inferred_channel || null,
        utm_source: input.utm_source || null,
        utm_medium: input.utm_medium || null,
        utm_campaign: input.utm_campaign || null,
        utm_content: input.utm_content || null,
        utm_term: input.utm_term || null,
        gclid: input.gclid || null,
        gbraid: input.gbraid || null,
        wbraid: input.wbraid || null,
        fbclid: input.fbclid || null,
        fbc: input.fbc || null,
        fbp: input.fbp || null,
        ttclid: input.ttclid || null,
        msclkid: input.msclkid || null,
        ctwa_source_id: input.ctwa?.ctwa_source_id || null,
        landing_page_url: input.landing_page_url || null,
        referrer_url: input.referrer_url || null,
        raw_querystring: input.raw_querystring || null,
        session_id: input.session_id || null,
        touchpoint_fingerprint: touchpointFingerprint,
      })
    } catch {
      // Fingerprint collisions are expected and handled by unique constraint.
    }
  }

  return {
    attribution_id: upserted?.id || null,
    inferred_channel,
    channel_inferred,
    channel_updated: channelUpdated,
    attribution_method,
    trigger_message_rule_id: matchedRule?.id || null,
  }
}

