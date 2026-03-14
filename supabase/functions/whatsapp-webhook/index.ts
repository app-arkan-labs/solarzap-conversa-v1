import { createClient } from 'npm:@supabase/supabase-js@2'
import {
    extractInboundMessageContent,
    resolveExplicitInboundPhoneCandidate,
    resolveInboundMessageNodeAndType,
    shouldSkipLidMessageWithoutPhone,
} from '../_shared/whatsappWebhookMessageParsing.ts'
import {
    applyLeadAttribution,
    extractCtwaFromWhatsAppMessage,
} from '../_shared/trackingAttribution.ts'
import { resolveLeadCanonicalId } from '../_shared/leadCanonical.ts'
import { checkLimit, recordUsage } from '../_shared/billing.ts'
import {
    buildInvokeFailureEnvelope,
    normalizeAgentInvokeResult,
} from '../_shared/aiPipelineOutcome.ts'

const ALLOWED_ORIGIN = Deno.env.get('ALLOWED_ORIGIN')
if (!ALLOWED_ORIGIN) {
    throw new Error('Missing ALLOWED_ORIGIN env')
}
const EDGE_INTERNAL_API_KEY = String(Deno.env.get('EDGE_INTERNAL_API_KEY') || '').trim()

const corsHeaders = {
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-arkan-webhook-secret',
}

function buildInternalInvokeHeaders(): Record<string, string> {
    if (!EDGE_INTERNAL_API_KEY) return {}
    return { 'x-internal-api-key': EDGE_INTERNAL_API_KEY }
}

function onlyDigits(str: string | null | undefined): string {
    if (!str) return ''
    return str.replace(/\D/g, '')
}

function sanitizePathPart(value: string): string {
    return value.replace(/[^a-zA-Z0-9._-]/g, '_')
}

function perfNowMs(): number {
    try {
        return performance.now()
    } catch {
        return Date.now()
    }
}

function normalizeEvent(raw: string | null) {
    if (!raw) return null
    return raw.trim().toUpperCase().replaceAll('.', '_').replaceAll('-', '_')
}

function inferEventFromPath(pathname: string) {
    const last = pathname.split('/').filter(Boolean).pop() || ''
    const maybe = normalizeEvent(last)
    const known = new Set(['QRCODE_UPDATED', 'CONNECTION_UPDATE', 'MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'MESSAGES_DELETE', 'SEND_MESSAGE'])
    return known.has(maybe || '') ? maybe : null
}

function parseBooleanFlag(value: unknown): boolean | null {
    if (typeof value === 'boolean') return value
    if (typeof value === 'number') {
        if (value === 1) return true
        if (value === 0) return false
        return null
    }
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase()
        if (['true', '1', 'yes', 'y', 'sim'].includes(normalized)) return true
        if (['false', '0', 'no', 'n', 'nao', 'não'].includes(normalized)) return false
    }
    return null
}

function asMessageObject(candidate: any): any | null {
    if (Array.isArray(candidate)) {
        for (const row of candidate) {
            if (row && typeof row === 'object') return row
        }
        return null
    }
    return candidate && typeof candidate === 'object' ? candidate : null
}

function resolveMessagePayload(body: any, data: any): any | null {
    const candidates = [
        data?.data,
        data?.messages,
        data?.message,
        data,
        body?.data?.data,
        body?.data?.messages,
        body?.data?.message,
        body?.message,
        body?.messages,
        body
    ]

    for (const candidate of candidates) {
        const msg = asMessageObject(candidate)
        if (!msg) continue
        if (
            msg?.key ||
            msg?.message ||
            msg?.messageType ||
            msg?.type ||
            msg?.remoteJid ||
            msg?.remote_jid ||
            msg?.fromMe !== undefined ||
            msg?.from_me !== undefined
        ) {
            return msg
        }
    }
    return null
}

function resolveRemoteJid(msg: any, data: any, body: any): string | null {
    const raw =
        msg?.key?.remoteJid ??
        msg?.remoteJid ??
        msg?.key?.remote_jid ??
        msg?.remote_jid ??
        data?.key?.remoteJid ??
        data?.remoteJid ??
        body?.data?.key?.remoteJid ??
        body?.key?.remoteJid ??
        body?.remoteJid ??
        null
    if (raw) return String(raw)

    const numberRaw =
        msg?.number ??
        data?.number ??
        body?.data?.number ??
        body?.number ??
        null
    const digits = onlyDigits(numberRaw ? String(numberRaw) : '')
    if (!digits) return null

    return `${digits}@s.whatsapp.net`
}

function resolveMessageId(msg: any, data: any, body: any): string | null {
    const raw =
        msg?.key?.id ??
        msg?.id ??
        data?.key?.id ??
        data?.id ??
        body?.data?.key?.id ??
        body?.key?.id ??
        body?.id ??
        null
    return raw ? String(raw) : null
}

function normalizeJidUserPart(remoteJid: string): string {
    const localPart = String(remoteJid)
        .replace(/@(s\.whatsapp\.net|c\.us)$/i, '')
        .trim()
    return localPart.replace(/:\d+$/, '')
}

function resolveFromMe(msg: any, data: any, body: any): boolean {
    const candidates = [
        msg?.key?.fromMe,
        msg?.fromMe,
        msg?.key?.from_me,
        msg?.from_me,
        data?.key?.fromMe,
        data?.fromMe,
        data?.key?.from_me,
        data?.from_me,
        body?.data?.key?.fromMe,
        body?.data?.fromMe,
        body?.key?.fromMe,
        body?.fromMe,
        body?.sendByMe,
        body?.data?.sendByMe
    ]

    for (const candidate of candidates) {
        const parsed = parseBooleanFlag(candidate)
        if (parsed !== null) return parsed
    }

    return false
}

function normalizeProtocolVersion(raw: any): 'legacy' | 'pipeline_pdf_v1' {
    const value = String(raw || '').trim().toLowerCase()
    return value === 'pipeline_pdf_v1' ? 'pipeline_pdf_v1' : 'legacy'
}

const TERMINAL_STAGES = new Set(['perdido', 'contato_futuro', 'projeto_instalado', 'coletar_avaliacao'])
type FollowUpStepRule = {
    step: 1 | 2 | 3 | 4 | 5
    enabled: boolean
    delay_minutes: number
}

const FOLLOW_UP_STEP_KEYS: Array<FollowUpStepRule['step']> = [1, 2, 3, 4, 5]
const FOLLOW_UP_MIN_DELAY_MINUTES = 5
const FOLLOW_UP_MAX_DELAY_MINUTES = 365 * 24 * 60
const DEFAULT_FOLLOW_UP_SEQUENCE_CONFIG: { steps: FollowUpStepRule[] } = {
    steps: [
        { step: 1, enabled: true, delay_minutes: 180 },
        { step: 2, enabled: true, delay_minutes: 1440 },
        { step: 3, enabled: true, delay_minutes: 2880 },
        { step: 4, enabled: true, delay_minutes: 4320 },
        { step: 5, enabled: true, delay_minutes: 10080 },
    ],
}
type DayKey = 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat'
type FollowUpWindowConfig = {
    start: string
    end: string
    days: DayKey[]
    preferred_time: string | null
}
const DAY_KEYS: DayKey[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
const DEFAULT_FOLLOW_UP_WINDOW_CONFIG: FollowUpWindowConfig = {
    start: '09:00',
    end: '18:00',
    days: ['mon', 'tue', 'wed', 'thu', 'fri'],
    preferred_time: null,
}

function normalizeDayKey(raw: unknown): DayKey | null {
    const value = String(raw ?? '').trim().toLowerCase()
    return DAY_KEYS.includes(value as DayKey) ? (value as DayKey) : null
}

function normalizeHHMM(raw: unknown, fallback: string): string {
    const text = String(raw ?? '').trim()
    const match = /^(\d{1,2}):(\d{2})$/.exec(text)
    if (!match) return fallback
    const hour = Number(match[1])
    const minute = Number(match[2])
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) return fallback
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return fallback
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

function parseHHMMToMinutes(value: string): number {
    const match = /^(\d{2}):(\d{2})$/.exec(String(value || '').trim())
    if (!match) return -1
    return (Number(match[1]) * 60) + Number(match[2])
}

function normalizeFollowUpWindowConfig(raw: unknown): FollowUpWindowConfig {
    const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, any>) : {}
    const incomingDays = Array.isArray(source.days) ? source.days : []
    const normalizedDays = Array.from(
        new Set(
            incomingDays
                .map((day: unknown) => normalizeDayKey(day))
                .filter((day): day is DayKey => !!day)
        ),
    )
    const preferredRaw = String(source.preferred_time ?? '').trim()
    const preferred = preferredRaw ? normalizeHHMM(preferredRaw, '') : ''
    return {
        start: normalizeHHMM(source.start, DEFAULT_FOLLOW_UP_WINDOW_CONFIG.start),
        end: normalizeHHMM(source.end, DEFAULT_FOLLOW_UP_WINDOW_CONFIG.end),
        days: normalizedDays.length > 0 ? normalizedDays : [...DEFAULT_FOLLOW_UP_WINDOW_CONFIG.days],
        preferred_time: preferred || null,
    }
}

function getZonedDateParts(
    date: Date,
    timeZone: string,
): { year: number; month: number; day: number; hour: number; minute: number; second: number; weekday: DayKey } {
    const datePartFormatter = new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
    })
    const weekdayFormatter = new Intl.DateTimeFormat('en-US', {
        timeZone,
        weekday: 'short',
    })

    const parts = datePartFormatter.formatToParts(date)
    const year = Number(parts.find((p) => p.type === 'year')?.value || '0')
    const month = Number(parts.find((p) => p.type === 'month')?.value || '0')
    const day = Number(parts.find((p) => p.type === 'day')?.value || '0')
    const hour = Number(parts.find((p) => p.type === 'hour')?.value || '0')
    const minute = Number(parts.find((p) => p.type === 'minute')?.value || '0')
    const second = Number(parts.find((p) => p.type === 'second')?.value || '0')
    const weekdayRaw = String(weekdayFormatter.format(date) || '').toLowerCase().slice(0, 3)
    const weekday = (DAY_KEYS.includes(weekdayRaw as DayKey) ? weekdayRaw : 'mon') as DayKey
    return { year, month, day, hour, minute, second, weekday }
}

function getTimeZoneOffsetMs(date: Date, timeZone: string): number {
    const parts = getZonedDateParts(date, timeZone)
    const localAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second)
    return localAsUtc - date.getTime()
}

function zonedDateTimeToUtc(
    year: number,
    month: number,
    day: number,
    hour: number,
    minute: number,
    second: number,
    timeZone: string
): Date {
    const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, second))
    const offset = getTimeZoneOffsetMs(utcGuess, timeZone)
    return new Date(utcGuess.getTime() - offset)
}

function resolveFollowUpScheduledAt(params: {
    baseDate: Date
    timeZone: string
    windowConfig: FollowUpWindowConfig
}): Date {
    const { baseDate, timeZone, windowConfig } = params
    const base = new Date(baseDate.getTime())
    if (isNaN(base.getTime())) return new Date(Date.now() + (3 * 60 * 60 * 1000))

    const startMinutes = parseHHMMToMinutes(windowConfig.start)
    const endMinutes = parseHHMMToMinutes(windowConfig.end)
    if (startMinutes < 0 || endMinutes <= startMinutes) return base

    const preferredRaw = windowConfig.preferred_time ? parseHHMMToMinutes(windowConfig.preferred_time) : -1
    const preferredMinutes = preferredRaw >= startMinutes && preferredRaw < endMinutes ? preferredRaw : -1
    const allowedDays = windowConfig.days.length > 0 ? windowConfig.days : DEFAULT_FOLLOW_UP_WINDOW_CONFIG.days

    const baseParts = getZonedDateParts(base, timeZone)
    const baseLocalNoon = zonedDateTimeToUtc(baseParts.year, baseParts.month, baseParts.day, 12, 0, 0, timeZone)
    const baseMinutesOfDay = (baseParts.hour * 60) + baseParts.minute + (baseParts.second > 0 ? 1 : 0)

    for (let dayOffset = 0; dayOffset <= 30; dayOffset++) {
        const dayProbe = new Date(baseLocalNoon.getTime() + (dayOffset * 24 * 60 * 60 * 1000))
        const dayParts = getZonedDateParts(dayProbe, timeZone)
        if (!allowedDays.includes(dayParts.weekday)) continue

        let candidateMinutes = preferredMinutes >= 0 ? preferredMinutes : startMinutes
        if (dayOffset === 0) {
            if (preferredMinutes >= 0 && preferredMinutes < baseMinutesOfDay) continue
            if (preferredMinutes < 0) candidateMinutes = Math.max(startMinutes, baseMinutesOfDay)
        }
        if (candidateMinutes >= endMinutes) continue

        const candidateUtc = zonedDateTimeToUtc(
            dayParts.year,
            dayParts.month,
            dayParts.day,
            Math.floor(candidateMinutes / 60),
            candidateMinutes % 60,
            0,
            timeZone
        )
        if (candidateUtc.getTime() < base.getTime()) continue
        return candidateUtc
    }

    return base
}

async function isOrgFollowUpAgentActive(supabase: any, orgId: string): Promise<boolean> {
    const { data, error } = await supabase
        .from('ai_stage_config')
        .select('is_active')
        .eq('org_id', orgId)
        .eq('pipeline_stage', 'follow_up')
        .maybeSingle()

    if (error) {
        console.warn('Failed to load follow_up stage config in webhook:', error.message)
        return false
    }

    return data?.is_active === true
}

function normalizeFollowUpSequenceConfig(raw: any): { steps: FollowUpStepRule[] } {
    const source = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw as Record<string, any> : {}
    const incomingSteps = Array.isArray(source.steps) ? source.steps : []
    const fallbackMap = new Map(
        DEFAULT_FOLLOW_UP_SEQUENCE_CONFIG.steps.map((step) => [step.step, step] as const),
    )

    const steps: FollowUpStepRule[] = FOLLOW_UP_STEP_KEYS.map((stepKey) => {
        const fallback = fallbackMap.get(stepKey)!
        const incoming = incomingSteps.find((entry: any) => Number(entry?.step) === stepKey) || {}
        const enabled = typeof incoming?.enabled === 'boolean' ? Boolean(incoming.enabled) : fallback.enabled
        const delayRaw = Number(incoming?.delay_minutes)
        const delayMinutes = Number.isFinite(delayRaw)
            ? Math.max(
                FOLLOW_UP_MIN_DELAY_MINUTES,
                Math.min(FOLLOW_UP_MAX_DELAY_MINUTES, Math.round(delayRaw)),
            )
            : fallback.delay_minutes

        return {
            step: stepKey,
            enabled,
            delay_minutes: delayMinutes,
        }
    })

    return { steps }
}

async function loadFollowUpRuntimeSettings(
    supabase: any,
    orgId: string
): Promise<{ sequenceConfig: { steps: FollowUpStepRule[] }; windowConfig: FollowUpWindowConfig; timeZone: string }> {
    const { data, error } = await supabase
        .from('ai_settings')
        .select('follow_up_sequence_config, follow_up_window_config, timezone')
        .eq('org_id', orgId)
        .maybeSingle()

    if (error) {
        console.warn('Failed to load follow_up runtime settings in webhook, using defaults:', error.message)
        return {
            sequenceConfig: DEFAULT_FOLLOW_UP_SEQUENCE_CONFIG,
            windowConfig: DEFAULT_FOLLOW_UP_WINDOW_CONFIG,
            timeZone: 'America/Sao_Paulo',
        }
    }

    return {
        sequenceConfig: normalizeFollowUpSequenceConfig((data as any)?.follow_up_sequence_config),
        windowConfig: normalizeFollowUpWindowConfig((data as any)?.follow_up_window_config),
        timeZone: String((data as any)?.timezone || 'America/Sao_Paulo').trim() || 'America/Sao_Paulo',
    }
}

function getFirstEnabledFollowUpStep(config: { steps: FollowUpStepRule[] }): FollowUpStepRule | null {
    const ordered = config.steps
        .filter((step) => step.enabled)
        .sort((a, b) => a.step - b.step)
    return ordered[0] || null
}

async function cancelPendingFollowUpJobs(
    supabase: any,
    leadId: number,
    cancelledReason: string,
): Promise<void> {
    const { error } = await supabase
        .from('scheduled_agent_jobs')
        .update({
            status: 'cancelled',
            cancelled_reason: cancelledReason,
            executed_at: new Date().toISOString(),
        })
        .eq('lead_id', leadId)
        .eq('agent_type', 'follow_up')
        .eq('status', 'pending')

    if (error) throw error
}

async function resetLeadFollowUpStep(
    supabase: any,
    leadId: number,
    orgId: string,
): Promise<void> {
    const { error } = await supabase
        .from('leads')
        .update({ follow_up_step: 0 })
        .eq('id', leadId)
        .eq('org_id', orgId)

    if (error) throw error
}

async function scheduleFollowUpStep1FromOutbound(params: {
    supabase: any
    orgId: string
    leadId: number
    leadStage: string | null
    instanceName: string
}): Promise<{ scheduled: boolean; reason?: string; step?: number }> {
    const { supabase, orgId, leadId, leadStage, instanceName } = params
    const normalizedStage = String(leadStage || '').trim().toLowerCase()

    if (TERMINAL_STAGES.has(normalizedStage)) {
        return { scheduled: false, reason: 'terminal_stage' }
    }

    const { data: leadRow, error: leadRowError } = await supabase
        .from('leads')
        .select('follow_up_enabled')
        .eq('id', leadId)
        .eq('org_id', orgId)
        .maybeSingle()
    if (leadRowError) throw leadRowError
    if (!leadRow || leadRow.follow_up_enabled === false) {
        return { scheduled: false, reason: 'lead_fu_disabled' }
    }

    const orgFollowUpActive = await isOrgFollowUpAgentActive(supabase, orgId)
    if (!orgFollowUpActive) {
        return { scheduled: false, reason: 'org_agent_disabled' }
    }

    const followUpRuntime = await loadFollowUpRuntimeSettings(supabase, orgId)
    const firstEnabledStep = getFirstEnabledFollowUpStep(followUpRuntime.sequenceConfig)
    if (!firstEnabledStep) {
        return { scheduled: false, reason: 'fu_sequence_empty' }
    }

    const nowIso = new Date().toISOString()
    const scheduledAt = resolveFollowUpScheduledAt({
        baseDate: new Date(Date.now() + (firstEnabledStep.delay_minutes * 60_000)),
        timeZone: followUpRuntime.timeZone,
        windowConfig: followUpRuntime.windowConfig,
    }).toISOString()
    const payload = {
        fu_step: firstEnabledStep.step,
        last_outbound_at: nowIso,
        original_stage: normalizedStage || null,
        instance_name: instanceName || null,
        follow_up_schedule_timezone: followUpRuntime.timeZone,
    }

    await cancelPendingFollowUpJobs(supabase, leadId, 'new_outbound_superseded')

    const tryInsert = async () => {
        const { error } = await supabase
            .from('scheduled_agent_jobs')
            .insert({
                org_id: orgId,
                lead_id: leadId,
                agent_type: 'follow_up',
                scheduled_at: scheduledAt,
                status: 'pending',
                guard_stage: normalizedStage || null,
                payload,
            })
        return error
    }

    let insertErr = await tryInsert()
    if (insertErr && insertErr.code === '23505') {
        await cancelPendingFollowUpJobs(supabase, leadId, 'new_outbound_superseded')
        insertErr = await tryInsert()
    }
    if (insertErr) throw insertErr

    await resetLeadFollowUpStep(supabase, leadId, orgId)

    return { scheduled: true, step: firstEnabledStep.step }
}

async function uploadMedia(
    supabase: any,
    data: string | Uint8Array,
    mimeType: string,
    orgId: string,
    instanceName: string,
    inputType: 'base64' | 'binary'
): Promise<string | null> {
    if (!orgId) {
        throw new Error('Missing org_id for media upload')
    }
    if (!instanceName) {
        throw new Error('Missing instance_name for media upload')
    }

    console.log(`🚀 Starting media upload for org: ${orgId}, mime: ${mimeType}, type: ${inputType}`)
    try {
        let bytes: Uint8Array

        if (inputType === 'base64') {
            const binaryString = atob(data as string)
            const len = binaryString.length
            bytes = new Uint8Array(len)
            for (let i = 0; i < len; i++) {
                bytes[i] = binaryString.charCodeAt(i)
            }
        } else {
            bytes = data as Uint8Array
        }

        const ext = mimeType.split('/')[1] || 'bin'
        const fileName = `${Math.random().toString(36).substring(2, 10)}.${ext}`
        const safeInstanceName = sanitizePathPart(instanceName)
        // Runtime-proof hardening: explicit org namespace prefix to avoid any legacy path fallback.
        const filePath = `org/${orgId}/instances/${safeInstanceName}/${Date.now()}_${fileName}`

        console.log(`📦 Uploading to storage path: ${filePath}`)

        const { error } = await supabase.storage
            .from('chat-attachments')
            .upload(filePath, bytes, {
                contentType: mimeType,
                upsert: false
            })

        if (error) {
            console.error('❌ Upload error:', error)
            return null
        }

        const { data: publicData } = supabase.storage
            .from('chat-attachments')
            .getPublicUrl(filePath)

        console.log(`✅ Upload success, public URL: ${publicData.publicUrl}`)
        return publicData.publicUrl

    } catch (err: any) {
        console.error('❌ Media processing error:', err)
        return null
    }
}

async function fetchBase64FromEvolution(
    instanceName: string,
    messageData: any
): Promise<{ base64: string; mimeType: string } | null> {
    const evolutionUrl = Deno.env.get('EVOLUTION_API_URL') || 'https://evo.arkanlabs.com.br'
    const apiKey = Deno.env.get('EVOLUTION_API_KEY')
    if (!apiKey) {
        console.error('❌ EVOLUTION_API_KEY not set')
        return null
    }

    try {
        const response = await fetch(
            `${evolutionUrl}/chat/getBase64FromMediaMessage/${instanceName}`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': apiKey
                },
                body: JSON.stringify({ message: messageData })
            }
        )

        if (!response.ok) {
            const errorText = await response.text()
            console.error(`❌ Evolution base64 failed: ${response.status} - ${errorText}`)
            return null
        }

        const data = await response.json()
        return {
            base64: data.base64,
            mimeType: data.mimetype || 'application/octet-stream'
        }
    } catch (err: any) {
        console.error('❌ Evolution base64 exception:', err?.message || err)
        return null
    }
}

function stripBase64Prefix(input: string): string {
    if (!input) return ''
    const marker = 'base64,'
    const markerIdx = input.indexOf(marker)
    if (markerIdx >= 0) return input.substring(markerIdx + marker.length)
    return input.trim()
}

function base64ToUint8Array(base64: string): Uint8Array {
    const clean = stripBase64Prefix(base64)
    const binary = atob(clean)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return bytes
}

function extensionFromMime(mimeType: string): string {
    if (!mimeType) return 'ogg'
    if (mimeType.includes('ogg')) return 'ogg'
    if (mimeType.includes('mpeg') || mimeType.includes('mp3')) return 'mp3'
    if (mimeType.includes('mp4')) return 'mp4'
    if (mimeType.includes('wav')) return 'wav'
    if (mimeType.includes('webm')) return 'webm'
    return 'ogg'
}

async function transcribeAudioWithOpenAI(base64Audio: string, mimeType: string): Promise<string | null> {
    const apiKey = Deno.env.get('OPENAI_API_KEY')
    if (!apiKey) return null

    try {
        const bytes = base64ToUint8Array(base64Audio)
        const normalizedBytes = new Uint8Array(bytes)
        const audioBlob = new Blob([normalizedBytes], { type: mimeType || 'audio/ogg' })
        const extension = extensionFromMime(mimeType || '')
        const form = new FormData()
        form.append('model', 'whisper-1')
        form.append('language', 'pt')
        form.append('response_format', 'json')
        form.append('file', audioBlob, `audio.${extension}`)

        const resp = await fetch('https://api.openai.com/v1/audio/transcriptions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`
            },
            body: form
        })

        if (!resp.ok) {
            const errText = await resp.text()
            console.warn(`⚠️ OpenAI transcription failed: ${resp.status} - ${errText}`)
            return null
        }

        const data = await resp.json()
        const text = String(data?.text || '').trim()
        return text || null
    } catch (err: any) {
        console.warn('⚠️ OpenAI transcription exception:', err?.message || err)
        return null
    }
}

Deno.serve(async (req: Request) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders })
    }

    const url = new URL(req.url)

    try {
        const expectedSecret = Deno.env.get('ARKAN_WEBHOOK_SECRET');
        if (expectedSecret) {
            const receivedHeader = req.headers.get('x-arkan-webhook-secret');

            if (receivedHeader !== expectedSecret) {
                console.warn('⚠️ Invalid webhook secret');
                return new Response(JSON.stringify({ error: 'Unauthorized' }), {
                    status: 401,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }
        }

        const body = await req.json()
        const eventRaw = body?.event ?? body?.data?.event ?? null
        const event = normalizeEvent(eventRaw) ?? inferEventFromPath(url.pathname)
        const instanceName = body?.instance || body?.instanceName || body?.data?.instance || body?.data?.instanceName || null

        if (!instanceName || !event) {
            return new Response(JSON.stringify({ received: true }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
        }

        const supabase = createClient(
            Deno.env.get('SUPABASE_URL')!,
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        )

        const { data: instanceRow } = await supabase
            .from('whatsapp_instances')
            .select('org_id, user_id, phone_number')
            .eq('instance_name', instanceName)
            .single()

        if (!instanceRow?.user_id) {
            return new Response(JSON.stringify({ received: true, error: 'Instance not found' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
        }

        const userId = instanceRow.user_id
        const orgId = instanceRow.org_id

        if (!orgId) {
            console.warn('⚠️ Instance without org_id, aborting to avoid orphan writes:', instanceName)
            return new Response(JSON.stringify({ received: true, error: 'Instance missing org_id' }), {
                status: 422,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
        }

        let protocolVersion: 'legacy' | 'pipeline_pdf_v1' = 'legacy'
        let supportAiEnabled = false
        let supportAiAutoDisableOnSellerMessage = true

        try {
            const { data: aiSettings } = await supabase
                .from('ai_settings')
                .select('protocol_version, support_ai_enabled, support_ai_auto_disable_on_seller_message')
                .eq('org_id', orgId)
                .order('id', { ascending: true })
                .limit(1)
                .maybeSingle()

            if (aiSettings) {
                protocolVersion = normalizeProtocolVersion((aiSettings as any).protocol_version)
                supportAiEnabled = (aiSettings as any).support_ai_enabled === true
                supportAiAutoDisableOnSellerMessage =
                    (aiSettings as any).support_ai_auto_disable_on_seller_message !== false
            }
        } catch (settingsErr) {
            console.warn('âš ï¸ Failed to load ai_settings for webhook takeover context:', settingsErr)
        }

        // Audit Webhook (M7 hardening)
        await supabase.from('whatsapp_webhook_events').insert({
            org_id: orgId,
            instance_name: instanceName,
            event,
            path: url.pathname,
            headers: Object.fromEntries(req.headers.entries()),
            payload: body
        })

        const data = body?.data ?? body

        switch (event) {
            case 'QRCODE_UPDATED': {
                const qr = data?.qrcode?.base64 || body?.qrcode?.base64 || data?.qrcode || null
                await supabase
                    .from('whatsapp_instances')
                    .update({ qr_code: qr, status: 'connecting' })
                    .eq('instance_name', instanceName)
                break
            }
            case 'CONNECTION_UPDATE': {
                const state = data?.state || body?.state
                let status = 'disconnected'
                let phoneNumber = null

                if (state === 'open') {
                    status = 'connected'
                    phoneNumber = data?.wid?.user || body?.wid?.user || null
                    if (phoneNumber) phoneNumber = String(phoneNumber).replace('@s.whatsapp.net', '')
                } else if (state === 'connecting') {
                    status = 'connecting'
                }

                await supabase
                    .from('whatsapp_instances')
                    .update({
                        status,
                        phone_number: phoneNumber,
                        qr_code: status === 'connected' ? null : undefined,
                        connected_at: status === 'connected' ? new Date().toISOString() : undefined
                    })
                    .eq('instance_name', instanceName)
                break
            }
            case 'MESSAGES_UPSERT':
            case 'MESSAGES_UPDATE': {
                const isMessageUpdateEvent = event === 'MESSAGES_UPDATE'
                const messageStartedAt = perfNowMs()
                const msg = resolveMessagePayload(body, data)
                if (!msg) {
                    console.warn('⚠️ MESSAGES_UPSERT/UPDATE without message payload shape, skipping')
                    break
                }

                const remoteJid = resolveRemoteJid(msg, data, body)
                const isFromMe = resolveFromMe(msg, data, body)
                const waMessageId = resolveMessageId(msg, data, body)
                let pushName = msg?.pushName || msg?.notifyName || null
                if (isFromMe) pushName = null

                // Normalize wrapper envelopes (viewOnce/ephemeral/deviceSent/etc.) so only real content reaches persistence.
                const normalizedInbound = resolveInboundMessageNodeAndType(msg)
                msg.message = normalizedInbound.messageNode
                if (normalizedInbound.msgType) {
                    msg.messageType = normalizedInbound.msgType
                }
                const msgType = normalizedInbound.msgType || ''

                // Reaction Logic
                if (msgType === 'reactionMessage') {
                    const reactionInfo = msg?.message?.reactionMessage
                    const targetMsgId = reactionInfo?.key?.id
                    if (!targetMsgId) break

                    const { data: originalMsg } = await supabase
                        .from('interacoes')
                        .select('id, reactions')
                        .eq('wa_message_id', targetMsgId)
                        .eq('instance_name', instanceName)
                        .maybeSingle()

                    if (!originalMsg) break

                    const participantCandidate = msg?.participant || data?.participant || msg?.key?.participant || (String(remoteJid).endsWith('@g.us') ? null : remoteJid)
                    const ownerDigits = onlyDigits(instanceRow?.phone_number)
                    const participantDigits = onlyDigits(participantCandidate)
                    const isReactorMe = !!(ownerDigits && participantDigits && ownerDigits === participantDigits)
                    const reactorId = isReactorMe ? 'ME' : (participantCandidate || 'UNKNOWN')

                    const existingReactions = Array.isArray(originalMsg.reactions) ? originalMsg.reactions : []
                    const emoji = reactionInfo?.text ?? ''

                    const filtered = existingReactions.filter((r: any) => {
                        if (reactorId === 'ME') return r.reactorId !== 'ME' && r.fromMe !== true
                        return r.reactorId !== reactorId
                    })

                    const newReactions = filtered
                    if (emoji) {
                        newReactions.push({ emoji, reactorId, fromMe: isReactorMe, timestamp: new Date().toISOString() })
                    }

                    await supabase.from('interacoes').update({ reactions: newReactions }).eq('id', originalMsg.id)
                    break
                }

                // Evolution envia vários updates de status/ack/edição no evento MESSAGES_UPDATE.
                // Eles não representam uma nova mensagem e, se passarem pelo fluxo de insert,
                // criam conversas/contatos com placeholders "tipo: desconhecido".
                // Mantemos apenas reações acima; demais updates são ignorados aqui.
                if (isMessageUpdateEvent) {
                    console.log('⏭️ Skipping non-reaction MESSAGES_UPDATE to avoid duplicate placeholder interactions')
                    break
                }

                if (!remoteJid) break
                const remoteJidStr = String(remoteJid)
                if (
                    remoteJidStr.endsWith('@g.us') ||
                    remoteJidStr === 'status@broadcast' ||
                    remoteJidStr.endsWith('@broadcast')
                ) {
                    break
                }

                let text = extractInboundMessageContent(msg)
                if (!text) {
                    console.log('⏭️ Skipping message without user-content payload', {
                        event,
                        instanceName,
                        waMessageId,
                        remoteJid: remoteJidStr,
                        msgType: msgType || 'unknown'
                    })
                    break
                }

                if (shouldSkipLidMessageWithoutPhone(remoteJidStr, msg, data, body)) {
                    console.log('⏭️ Skipping @lid message without resolvable phone number', {
                        event,
                        instanceName,
                        waMessageId,
                        remoteJid: remoteJidStr,
                        msgType: msgType || 'unknown'
                    })
                    break
                }

                // Get Lead
                const rawRemoteJid = normalizeJidUserPart(remoteJidStr)
                const remoteDigits = onlyDigits(rawRemoteJid)
                const shouldResolveExplicitPhone =
                    remoteJidStr.toLowerCase().endsWith('@lid') || !remoteDigits
                const explicitPhoneCandidate = shouldResolveExplicitPhone
                    ? resolveExplicitInboundPhoneCandidate(msg, data, body)
                    : null
                const leadPhoneRaw = explicitPhoneCandidate || rawRemoteJid
                let phoneE164 = onlyDigits(leadPhoneRaw)
                if (!phoneE164) {
                    console.log('⏭️ Skipping message without usable phone digits for lead upsert', {
                        event,
                        instanceName,
                        waMessageId,
                        remoteJid: remoteJidStr,
                        msgType: msgType || 'unknown'
                    })
                    break
                }
                if (phoneE164.length >= 10 && phoneE164.length <= 11 && !phoneE164.startsWith('55')) {
                    phoneE164 = '55' + phoneE164
                }
                const leadTelefone = explicitPhoneCandidate || rawRemoteJid

                const leadLimit = await checkLimit(supabase, orgId, 'max_leads', 1)
                if (!leadLimit.allowed || leadLimit.access_state === 'blocked' || leadLimit.access_state === 'read_only') {
                    console.warn('lead_limit_reached: skipping lead resolution', {
                        orgId,
                        instanceName,
                        waMessageId,
                        billing: leadLimit,
                    })
                    break
                }

                let leadId: number | null = null
                const upsertLeadStartedAt = perfNowMs()
                const leadResolution = await resolveLeadCanonicalId({
                    supabase,
                    userId,
                    orgId,
                    instanceName,
                    phoneE164,
                    telefone: leadTelefone,
                    name: pushName,
                    pushName,
                    source: 'whatsapp',
                    channel: 'whatsapp',
                })
                if (leadResolution.leadId) {
                    leadId = Number(leadResolution.leadId)
                }
                console.log('[WHATSAPP_WEBHOOK_LATENCY] upsert_lead_canonical_ms', {
                    event,
                    instanceName,
                    waMessageId,
                    method: leadResolution.method,
                    leadId,
                    error: leadResolution.error,
                    ms: Math.round(perfNowMs() - upsertLeadStartedAt)
                })
                if (!leadId) {
                    console.error('[ERROR] Unable to resolve lead for whatsapp message, skipping interaction insert', {
                        orgId,
                        userId,
                        instanceName,
                        phoneE164,
                        rawRemoteJid,
                        leadTelefone,
                        waMessageId,
                        resolutionMethod: leadResolution.method,
                        resolutionError: leadResolution.error,
                    })
                    break
                }

                try {
                    await recordUsage(supabase, {
                        orgId,
                        userId,
                        leadId,
                        eventType: 'lead_created',
                        quantity: 1,
                        source: 'whatsapp-webhook.lead-resolution',
                        metadata: {
                            instance_name: instanceName,
                            wa_message_id: waMessageId,
                            resolution_method: leadResolution.method,
                        },
                    })
                } catch (usageError) {
                    console.warn('Failed to record lead_created usage', usageError)
                }

                if (leadId) {
                    try {
                        const ctwa = extractCtwaFromWhatsAppMessage(msg, msgType || null)
                        await applyLeadAttribution(supabase, {
                            orgId,
                            leadId: Number(leadId),
                            messageText: text,
                            ctwa,
                            user_phone: phoneE164,
                            user_agent: req.headers.get('user-agent'),
                        })
                    } catch (attributionError) {
                        console.warn('⚠️ Failed to apply lead attribution in whatsapp-webhook', {
                            orgId,
                            leadId,
                            error: attributionError instanceof Error ? attributionError.message : String(attributionError)
                        })
                    }
                }

                // Fast-path media placeholder (actual download/upload/transcription is resolved asynchronously)
                const isMediaMessage = ['audioMessage', 'imageMessage', 'videoMessage', 'documentMessage', 'stickerMessage'].includes(msgType)
                let dbPublicUrl = null
                let dbAttachmentType = null
                if (msgType === 'imageMessage') dbAttachmentType = 'image'
                else if (msgType === 'videoMessage') dbAttachmentType = 'video'
                else if (msgType === 'audioMessage') dbAttachmentType = 'audio'
                else if (msgType === 'documentMessage') dbAttachmentType = 'document'
                else if (msgType === 'stickerMessage') dbAttachmentType = 'image'

                const mediaNode = (msg?.message?.[msgType] ?? msg?.[msgType] ?? null) as any
                const mediaMimeType = String(
                    mediaNode?.mimetype ??
                    mediaNode?.mimeType ??
                    mediaNode?.fileMimetype ??
                    ''
                ).trim() || null
                const mediaFileName = String(
                    mediaNode?.fileName ??
                    mediaNode?.filename ??
                    mediaNode?.title ??
                    ''
                ).trim() || null

                if (isMediaMessage) {
                    const baseCaption = (text || '').trim()
                    const placeholder =
                        msgType === 'imageMessage' ? '📷 Imagem'
                            : msgType === 'videoMessage' ? '🎬 Vídeo'
                                : msgType === 'audioMessage' ? '🎤 Áudio'
                                    : msgType === 'documentMessage' ? '📄 Documento'
                                        : '🖼️ Sticker'

                    text = baseCaption && baseCaption !== placeholder
                        ? `${placeholder}: ${baseCaption}`
                        : placeholder
                }

                // Interaction Insert
                const interactionPayload = {
                    org_id: orgId,
                    user_id: userId,
                    lead_id: Number(leadId),
                    mensagem: text,
                    tipo: isFromMe ? 'mensagem_vendedor' : 'mensagem_cliente',
                    instance_name: instanceName,
                    remote_jid: remoteJid,
                    phone_e164: phoneE164,
                    wa_message_id: waMessageId,
                    attachment_url: dbPublicUrl,
                    attachment_type: dbAttachmentType,
                    attachment_ready: isMediaMessage ? false : true,
                    attachment_mimetype: isMediaMessage ? mediaMimeType : null,
                    attachment_name: isMediaMessage ? mediaFileName : null,
                    wa_from_me: isFromMe
                }

                let inserted: { id: number } | null = null
                if (waMessageId) {
                    const { data: existingInteraction } = await supabase
                        .from('interacoes')
                        .select('id, attachment_ready, lead_id')
                        .eq('instance_name', instanceName)
                        .eq('wa_message_id', waMessageId)
                        .maybeSingle()

                    if (existingInteraction?.id) {
                        if (existingInteraction.lead_id == null) {
                            await supabase
                                .from('interacoes')
                                .update({ lead_id: Number(leadId) })
                                .eq('id', existingInteraction.id)
                                .is('lead_id', null)
                        }

                        // Avoid clobbering resolver-populated attachment fields on duplicate media webhooks.
                        if (!isMediaMessage || existingInteraction.attachment_ready !== true) {
                            const updatePayload = existingInteraction.lead_id == null
                                ? interactionPayload
                                : { ...interactionPayload, lead_id: existingInteraction.lead_id }
                            await supabase
                                .from('interacoes')
                                .update(updatePayload)
                                .eq('id', existingInteraction.id)
                        }
                        inserted = { id: Number(existingInteraction.id) }
                    }
                }

                if (!inserted) {
                    const { data: insertedRow } = await supabase.from('interacoes').insert(interactionPayload).select('id').single()
                    inserted = insertedRow
                }

                if (isFromMe) {
                    try {
                        await recordUsage(supabase, {
                            orgId,
                            userId,
                            leadId: leadId ? Number(leadId) : null,
                            eventType: 'whatsapp_message_sent',
                            quantity: 1,
                            source: 'whatsapp-webhook',
                            metadata: {
                                instance_name: instanceName,
                                wa_message_id: waMessageId,
                                message_type: msgType || null,
                                direction: 'outbound',
                                interaction_id: inserted?.id || null,
                            },
                        })
                    } catch (usageError) {
                        console.warn('Failed to record message usage', usageError)
                    }
                }

                console.log('[WHATSAPP_WEBHOOK_LATENCY] insert_before_webhook_ms', {
                    event,
                    instanceName,
                    waMessageId,
                    interactionId: inserted?.id || null,
                    isMediaMessage,
                    msgType,
                    ms: Math.round(perfNowMs() - messageStartedAt)
                })

                if (isMediaMessage && inserted?.id) {
                    const mediaResolverSecret =
                        Deno.env.get('MEDIA_RESOLVER_INTERNAL_SECRET')
                        || Deno.env.get('ARKAN_WEBHOOK_SECRET')
                        || ''
                    const dispatchTimeoutRaw = Number(Deno.env.get('MEDIA_RESOLVER_INVOKE_TIMEOUT_MS') || '1500')
                    const dispatchTimeoutMs = Number.isFinite(dispatchTimeoutRaw)
                        ? Math.max(300, Math.min(dispatchTimeoutRaw, 10_000))
                        : 1500
                    const invokeStartedAt = perfNowMs()
                    const mediaResolverPayload = {
                        orgId,
                        interactionId: inserted.id,
                        instanceName,
                        waMessageId,
                        remoteJid,
                        mediaType: msgType,
                        mimeType: mediaMimeType,
                        fileName: mediaFileName,
                        leadId,
                        userId,
                        action: 'resolveOne',
                    }

                    const markDispatchFailure = async (rawMessage: string) => {
                        const dispatchMessage = rawMessage.trim().slice(0, 180) || 'unknown_dispatch_failure'
                        const { error: markDispatchError } = await supabase
                            .from('interacoes')
                            .update({
                                // Fail-safe: avoid indefinite "loading media" when resolver dispatch never started.
                                attachment_ready: true,
                                attachment_error: true,
                                attachment_error_message: `RESOLVER_DISPATCH_FAILED:${dispatchMessage}`,
                            })
                            .eq('id', inserted.id)
                            .eq('attachment_ready', false)

                        if (markDispatchError) {
                            console.error('❌ Failed to persist media resolver dispatch failure', {
                                orgId,
                                instanceName,
                                waMessageId,
                                interactionId: inserted.id,
                                error: markDispatchError.message,
                            })
                        }
                    }

                    try {
                        const invokePromise = supabase.functions.invoke('media-resolver', {
                            ...(mediaResolverSecret
                                ? { headers: { 'x-internal-secret': mediaResolverSecret } }
                                : {}),
                            body: mediaResolverPayload
                        })
                        const timeoutPromise = new Promise<{ data: null; error: { message: string } }>((resolve) => {
                            setTimeout(() => resolve({
                                data: null,
                                error: { message: `dispatch_timeout_${dispatchTimeoutMs}ms` }
                            }), dispatchTimeoutMs)
                        })
                        const { error: mediaResolverError } = await Promise.race([invokePromise, timeoutPromise])

                        if (mediaResolverError) {
                            const dispatchErrorMessage = mediaResolverError.message || 'invoke_failed'
                            console.error('❌ Failed to invoke media-resolver from whatsapp-webhook', {
                                orgId,
                                instanceName,
                                waMessageId,
                                interactionId: inserted.id,
                                error: dispatchErrorMessage,
                            })
                            await markDispatchFailure(dispatchErrorMessage)
                        } else {
                            console.log('[WHATSAPP_WEBHOOK_LATENCY] media_resolver_dispatch_ms', {
                                event,
                                instanceName,
                                waMessageId,
                                interactionId: inserted.id,
                                ms: Math.round(perfNowMs() - invokeStartedAt),
                            })
                        }
                    } catch (mediaResolverErr) {
                        const dispatchErrorMessage = mediaResolverErr instanceof Error ? mediaResolverErr.message : String(mediaResolverErr)
                        console.error('❌ Exception invoking media-resolver from whatsapp-webhook', {
                            orgId,
                            instanceName,
                            waMessageId,
                            interactionId: inserted.id,
                            error: dispatchErrorMessage,
                        })
                        await markDispatchFailure(dispatchErrorMessage)
                    }
                }

                if (isFromMe && leadId) {
                    const takeoverEnabled = supportAiAutoDisableOnSellerMessage === true
                    const leadIdNum = Number(leadId)
                    let leadStage: string | null = null
                    let leadWasAlreadyPaused = false
                    let leadFollowUpEnabled = true
                    let sellerMessageAutoDisabledAI = false
                    let likelyAiEchoDetected = false
                    let takeoverError: string | null = null
                    let takeoverSuppressedReason: string | null = null
                    let followUpScheduleStatus: string | null = null

                    try {
                        const { data: leadBefore, error: leadBeforeErr } = await supabase
                            .from('leads')
                            .select('id, status_pipeline, ai_enabled, follow_up_enabled')
                            .eq('id', leadIdNum)
                            .maybeSingle()

                        if (leadBeforeErr) {
                            takeoverError = leadBeforeErr.message
                        } else {
                            leadStage = (leadBefore as any)?.status_pipeline || null
                            leadWasAlreadyPaused = (leadBefore as any)?.ai_enabled === false
                            leadFollowUpEnabled = (leadBefore as any)?.follow_up_enabled !== false

                            const shouldEvaluatePause = takeoverEnabled && !leadWasAlreadyPaused
                            let likelyAiEcho = false

                            if (shouldEvaluatePause) {
                                try {
                                    const nowMinus45sIso = new Date(Date.now() - 45_000).toISOString()
                                    // Echo detection: check for a duplicate outbound msg with same text within 45s
                                    // Use trimmed text match and also check by wa_message_id when available
                                    const trimmedText = (text || '').trim()
                                    const { data: duplicateOutbound } = await supabase
                                        .from('interacoes')
                                        .select('id, created_at, mensagem')
                                        .eq('lead_id', leadIdNum)
                                        .eq('instance_name', instanceName)
                                        .eq('wa_from_me', true)
                                        .in('tipo', ['mensagem_vendedor', 'audio_vendedor', 'video_vendedor', 'anexo_vendedor'])
                                        .gte('created_at', nowMinus45sIso)
                                        .neq('id', Number(inserted?.id || 0))
                                        .order('id', { ascending: false })
                                        .limit(5)

                                    // Compare with trimmed text to handle whitespace differences
                                    likelyAiEcho = Boolean(
                                        duplicateOutbound?.some((row: any) => {
                                            const rowText = (row.mensagem || '').trim()
                                            return rowText === trimmedText
                                        })
                                    )
                                    likelyAiEchoDetected = likelyAiEcho
                                } catch (dupErr: any) {
                                    console.warn('Failed to check duplicate outbound before takeover pause:', dupErr?.message || dupErr)
                                }

                                if (likelyAiEcho) {
                                    takeoverSuppressedReason = 'likely_ai_echo'
                                } else {
                                    const { error: pauseErr } = await supabase
                                        .from('leads')
                                        .update({
                                            ai_enabled: false,
                                            ai_paused_reason: 'human_takeover',
                                            ai_paused_at: new Date().toISOString()
                                        })
                                        .eq('id', Number(leadId))
                                        .eq('org_id', orgId)

                                    if (pauseErr) {
                                        takeoverError = pauseErr.message
                                    } else {
                                        sellerMessageAutoDisabledAI = true
                                    }
                                }
                            } else if (!takeoverEnabled) {
                                takeoverSuppressedReason = 'auto_disable_off'
                            } else if (leadWasAlreadyPaused) {
                                takeoverSuppressedReason = 'already_paused'
                            }
                        }
                    } catch (pauseErr: any) {
                        takeoverError = pauseErr?.message || String(pauseErr)
                    }

                    if (!likelyAiEchoDetected && leadFollowUpEnabled) {
                        try {
                            const scheduleResult = await scheduleFollowUpStep1FromOutbound({
                                supabase,
                                orgId,
                                leadId: leadIdNum,
                                leadStage,
                                instanceName,
                            })
                            followUpScheduleStatus = scheduleResult.scheduled
                                ? `scheduled_step_${scheduleResult.step || 1}`
                                : `skipped:${scheduleResult.reason || 'unknown'}`
                        } catch (followUpScheduleErr: any) {
                            followUpScheduleStatus = `error:${String(followUpScheduleErr?.message || followUpScheduleErr || 'unknown').slice(0, 120)}`
                            console.warn('Failed to schedule follow-up after seller outbound:', followUpScheduleErr)
                        }
                    } else if (likelyAiEchoDetected) {
                        followUpScheduleStatus = 'skipped_likely_ai_echo'
                    } else if (!leadFollowUpEnabled) {
                        followUpScheduleStatus = 'skipped:lead_fu_disabled'
                    }

                    try {
                        await supabase.from('ai_action_logs').insert({
                            org_id: orgId,
                            lead_id: leadIdNum,
                            action_type: 'seller_message_takeover',
                            details: JSON.stringify({
                                protocol_version: protocolVersion,
                                agent_mode: 'none',
                                stage_key: leadStage,
                                support_ai_enabled: supportAiEnabled,
                                support_ai_stage_allowed: false,
                                support_ai_decision: 'no_reply',
                                support_ai_handoff_reason: null,
                                did_send_outbound: false,
                                seller_message_auto_disabled_ai: sellerMessageAutoDisabledAI,
                                seller_message_auto_disabled_support_ai: sellerMessageAutoDisabledAI,
                                takeover_source: 'webhook_fromMe',
                                blocked_prompt_override: false,
                                blocked_prompt_override_reason: null,
                                support_ai_auto_disable_on_seller_message: supportAiAutoDisableOnSellerMessage,
                                lead_was_already_paused: leadWasAlreadyPaused,
                                lead_follow_up_enabled: leadFollowUpEnabled,
                                likely_ai_echo_detected: likelyAiEchoDetected,
                                follow_up_schedule_status: followUpScheduleStatus,
                                takeover_enabled: takeoverEnabled,
                                takeover_suppressed_reason: takeoverSuppressedReason,
                                instance_name: instanceName,
                                interaction_id: inserted?.id || null,
                                wa_message_id: waMessageId,
                                error: takeoverError
                            }),
                            success: !takeoverError
                        })
                    } catch (takeoverLogErr) {
                        console.warn('Failed to insert seller_message_takeover log:', takeoverLogErr)
                    }
                }

                // AI Trigger
                if (!isFromMe && leadId && inserted?.id) {
                    try {
                        const leadIdNum = Number(leadId)
                        await cancelPendingFollowUpJobs(supabase, leadIdNum, 'lead_replied')
                        await resetLeadFollowUpStep(supabase, leadIdNum, orgId)
                    } catch (followUpCancelErr) {
                        console.warn('Failed to cancel/reset follow-up after inbound message:', followUpCancelErr)
                    }

                    const aiLimit = await checkLimit(supabase, orgId, 'included_ai_requests_month', 1)
                    if (!aiLimit.allowed || aiLimit.access_state === 'blocked' || aiLimit.access_state === 'read_only') {
                        console.warn('ai_quota_exhausted: skipping ai pipeline invoke', {
                            orgId,
                            leadId,
                            interactionId: inserted.id,
                            billing: aiLimit,
                        })
                        break
                    }

                    supabase.functions
                        .invoke('ai-pipeline-agent', {
                            headers: buildInternalInvokeHeaders(),
                            body: { leadId, triggerType: 'incoming_message', interactionId: inserted.id, instanceName }
                        })
                        .then(async ({ data: invokeData, error: invokeError }: { data?: unknown; error: { message: string } | null }) => {
                            const agentResult = invokeError
                                ? buildInvokeFailureEnvelope({
                                    reasonCode: 'invoke_failed',
                                    errorMessage: invokeError.message,
                                    triggerType: 'incoming_message',
                                })
                                : normalizeAgentInvokeResult(invokeData)

                            if (invokeError) {
                                console.error('❌ Failed to invoke ai-pipeline-agent from whatsapp-webhook', {
                                    leadId,
                                    interactionId: inserted.id,
                                    instanceName,
                                    error: invokeError.message
                                })
                                try {
                                    await supabase.from('ai_action_logs').insert({
                                        org_id: orgId,
                                        lead_id: Number(leadId),
                                        action_type: 'agent_invoke_failed',
                                        details: JSON.stringify({
                                            source: 'whatsapp-webhook',
                                            triggerType: 'incoming_message',
                                            interactionId: inserted.id,
                                            instanceName,
                                            error: invokeError.message
                                        }),
                                        success: false
                                    })
                                } catch (logErr) {
                                    console.warn('Failed to log agent_invoke_failed (whatsapp-webhook):', logErr)
                                }
                            }

                            try {
                                await supabase.from('ai_action_logs').insert({
                                    org_id: orgId,
                                    lead_id: Number(leadId),
                                    action_type: 'agent_invoke_outcome',
                                    details: JSON.stringify({
                                        source: 'whatsapp-webhook',
                                        triggerType: 'incoming_message',
                                        interactionId: inserted.id,
                                        instanceName,
                                        outcome: agentResult.outcome,
                                        reason_code: agentResult.reason_code,
                                        should_retry: agentResult.should_retry,
                                        next_retry_seconds: agentResult.next_retry_seconds,
                                        message_sent: agentResult.message_sent,
                                        run_id: agentResult.run_id || null
                                    }),
                                    success: agentResult.outcome === 'sent' || agentResult.outcome === 'terminal_skip'
                                })
                            } catch (logErr) {
                                console.warn('Failed to log agent_invoke_outcome (whatsapp-webhook):', logErr)
                            }

                            if (agentResult.outcome === 'sent') {
                                try {
                                    await recordUsage(supabase, {
                                        orgId,
                                        userId,
                                        leadId: Number(leadId),
                                        eventType: 'ai_request',
                                        quantity: 1,
                                        source: 'whatsapp-webhook.ai-pipeline-agent',
                                        metadata: {
                                            instance_name: instanceName,
                                            interaction_id: inserted.id,
                                            agent_outcome: agentResult.outcome,
                                            reason_code: agentResult.reason_code,
                                        },
                                    })
                                } catch (usageError) {
                                    console.warn('Failed to record ai_request usage', usageError)
                                }
                                return
                            }

                            console.warn('AI pipeline returned without outbound send', {
                                leadId,
                                interactionId: inserted.id,
                                instanceName,
                                outcome: agentResult.outcome,
                                reasonCode: agentResult.reason_code,
                                shouldRetry: agentResult.should_retry,
                                nextRetrySeconds: agentResult.next_retry_seconds,
                            })
                        })
                        .catch(async (invokeErr: unknown) => {
                            const invokeErrorMessage = invokeErr instanceof Error ? invokeErr.message : String(invokeErr)
                            const agentResult = buildInvokeFailureEnvelope({
                                reasonCode: 'invoke_failed',
                                errorMessage: invokeErrorMessage,
                                triggerType: 'incoming_message',
                            })
                            console.error('❌ Exception invoking ai-pipeline-agent from whatsapp-webhook', {
                                leadId,
                                interactionId: inserted.id,
                                instanceName,
                                error: invokeErrorMessage
                            })
                            try {
                                await supabase.from('ai_action_logs').insert({
                                    org_id: orgId,
                                    lead_id: Number(leadId),
                                    action_type: 'agent_invoke_failed',
                                    details: JSON.stringify({
                                        source: 'whatsapp-webhook',
                                        triggerType: 'incoming_message',
                                        interactionId: inserted.id,
                                        instanceName,
                                        error: invokeErrorMessage
                                    }),
                                    success: false
                                })
                            } catch (logErr) {
                                console.warn('Failed to log agent_invoke_failed exception (whatsapp-webhook):', logErr)
                            }
                            try {
                                await supabase.from('ai_action_logs').insert({
                                    org_id: orgId,
                                    lead_id: Number(leadId),
                                    action_type: 'agent_invoke_outcome',
                                    details: JSON.stringify({
                                        source: 'whatsapp-webhook',
                                        triggerType: 'incoming_message',
                                        interactionId: inserted.id,
                                        instanceName,
                                        outcome: agentResult.outcome,
                                        reason_code: agentResult.reason_code,
                                        should_retry: agentResult.should_retry,
                                        next_retry_seconds: agentResult.next_retry_seconds,
                                        message_sent: agentResult.message_sent,
                                        run_id: agentResult.run_id || null,
                                    }),
                                    success: false,
                                })
                            } catch (logErr) {
                                console.warn('Failed to log synthetic agent_invoke_outcome exception (whatsapp-webhook):', logErr)
                            }
                        })
                }
                break
            }
        }

        return new Response(JSON.stringify({ received: true }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
    } catch (err: any) {
        console.error('💥 Unexpected error:', err)
        return new Response(JSON.stringify({ error: String(err?.message || err) }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
    }
})
