import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ALLOWED_ORIGIN = Deno.env.get('ALLOWED_ORIGIN')
if (!ALLOWED_ORIGIN) {
  throw new Error('Missing ALLOWED_ORIGIN env')
}

const corsHeaders = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-internal-secret, x-arkan-webhook-secret',
}

const FETCH_RETRY_ATTEMPTS = 3
const RETRY_PENDING_BATCH_DEFAULT = 25
const RETRY_PENDING_MIN_AGE_SECONDS_DEFAULT = 30
const RETRY_PENDING_MAX_ATTEMPTS_DEFAULT = 5

let supportsAttemptColumns = true

function decodeBase64(base64: string): Uint8Array {
  const binaryString = atob(base64.replace(/^data:.*;base64,/, ''))
  const bytes = new Uint8Array(binaryString.length)
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }
  return bytes
}

function sanitizePathPart(value: string): string {
  return String(value || '').replace(/[^a-zA-Z0-9._-]/g, '_')
}

function perfNowMs(): number {
  try {
    return performance.now()
  } catch {
    return Date.now()
  }
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

function asPositiveInt(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, Math.min(max, Math.floor(parsed)))
}

function mapAttachmentTypeToMessageType(attachmentType: string | null | undefined): string {
  const normalized = String(attachmentType || '').trim().toLowerCase()
  if (normalized === 'image') return 'imageMessage'
  if (normalized === 'video') return 'videoMessage'
  if (normalized === 'audio') return 'audioMessage'
  if (normalized === 'document') return 'documentMessage'
  return 'documentMessage'
}

function shortErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error || '')
  return message.trim().slice(0, 180) || 'unknown_error'
}

function isMissingColumnError(error: any, columnName: string): boolean {
  const code = String(error?.code || '')
  const message = String(error?.message || '').toLowerCase()
  const detail = String(error?.details || '').toLowerCase()
  const hint = String(error?.hint || '').toLowerCase()
  const col = columnName.toLowerCase()
  if (code === 'PGRST204' || code === '42703') return true
  return (
    message.includes('column') && message.includes(col)
  ) || (
    detail.includes('column') && detail.includes(col)
  ) || (
    hint.includes('column') && hint.includes(col)
  )
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function transcribeAudioWithOpenAI(base64Audio: string, mimeType: string): Promise<string | null> {
  const apiKey = Deno.env.get('OPENAI_API_KEY')
  if (!apiKey) return null

  try {
    const bytes = decodeBase64(base64Audio)
    const audioBlob = new Blob([bytes], { type: mimeType || 'audio/ogg' })
    const form = new FormData()
    form.append('model', 'whisper-1')
    form.append('language', 'pt')
    form.append('response_format', 'json')
    form.append('file', audioBlob, `audio.${extensionFromMime(mimeType || '')}`)

    const resp = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: form,
    })

    if (!resp.ok) {
      const errText = await resp.text()
      console.warn('[MediaResolver] OpenAI transcription failed', { status: resp.status, errText })
      return null
    }

    const data = await resp.json()
    const text = String(data?.text || '').trim()
    return text || null
  } catch (err) {
    console.warn('[MediaResolver] OpenAI transcription exception', err)
    return null
  }
}

type ResolveSingleInput = {
  orgId?: string | null
  interactionId?: number | string | null
  instanceName?: string | null
  waMessageId?: string | null
  remoteJid?: string | null
  mediaType?: string | null
  mimeType?: string | null
  fileName?: string | null
  leadId?: number | string | null
  userId?: string | null
  maxAttempts?: number
}

type ResolveSingleResult = {
  success: boolean
  code: string
  interactionId: number | null
  waMessageId: string | null
  attempts: number | null
}

async function fetchMediaBase64(
  evolutionUrl: string,
  evolutionApiKey: string,
  instanceName: string,
  waMessageId: string,
): Promise<{ base64: string } | null> {
  for (let attempt = 1; attempt <= FETCH_RETRY_ATTEMPTS; attempt++) {
    try {
      const urlA = `${evolutionUrl}/chat/getBase64FromMediaMessage/${instanceName}`
      const payloadA = {
        message: {
          key: { id: waMessageId },
        },
        convertToMp4: false,
      }

      const respA = await fetch(urlA, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: evolutionApiKey },
        body: JSON.stringify(payloadA),
      })

      if (respA.ok) {
        const dataA = await respA.json()
        const base64A = dataA?.base64 || dataA?.data?.base64
        if (base64A) {
          return { base64: String(base64A) }
        }
      } else {
        const errTextA = await respA.text()
        console.warn('[MediaResolver] Strategy A failed', {
          waMessageId,
          instanceName,
          attempt,
          status: respA.status,
          err: errTextA,
        })
      }
    } catch (errorA) {
      console.warn('[MediaResolver] Strategy A exception', {
        waMessageId,
        instanceName,
        attempt,
        err: shortErrorMessage(errorA),
      })
    }

    try {
      const urlB = `${evolutionUrl}/chat/findMessage/${instanceName}`
      const respB = await fetch(urlB, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: evolutionApiKey },
        body: JSON.stringify({ sessionId: instanceName, messageId: waMessageId }),
      })

      if (respB.ok) {
        const dataB = await respB.json()
        const base64B = dataB?.base64 || dataB?.data?.base64
        if (base64B) {
          return { base64: String(base64B) }
        }
      } else {
        const errTextB = await respB.text()
        console.warn('[MediaResolver] Strategy B failed', {
          waMessageId,
          instanceName,
          attempt,
          status: respB.status,
          err: errTextB,
        })
      }
    } catch (errorB) {
      console.warn('[MediaResolver] Strategy B exception', {
        waMessageId,
        instanceName,
        attempt,
        err: shortErrorMessage(errorB),
      })
    }

    if (attempt < FETCH_RETRY_ATTEMPTS) {
      await delay(800 * (2 ** (attempt - 1)))
    }
  }

  return null
}

async function resolveSingleMedia(
  supabase: ReturnType<typeof createClient>,
  evolutionUrl: string,
  evolutionApiKey: string,
  input: ResolveSingleInput,
): Promise<ResolveSingleResult> {
  const resolverStartedAt = perfNowMs()
  const normalizedInteractionId = Number(input.interactionId)
  const hasInteractionId = Number.isFinite(normalizedInteractionId) && normalizedInteractionId > 0
  const resolvedWaMessageId = input.waMessageId ? String(input.waMessageId).trim() : null
  const resolvedInstanceName = input.instanceName ? String(input.instanceName).trim() : null
  const resolvedMimeType = input.mimeType && String(input.mimeType).trim().length > 0
    ? String(input.mimeType).trim()
    : 'application/octet-stream'
  const resolvedMediaType = String(input.mediaType || '').trim()
  const maxAttempts = asPositiveInt(input.maxAttempts, RETRY_PENDING_MAX_ATTEMPTS_DEFAULT, 1, 15)

  if (!hasInteractionId && !resolvedWaMessageId) {
    throw new Error('interactionId or waMessageId is required')
  }
  if (!resolvedInstanceName) {
    throw new Error('instanceName is required')
  }
  if (!resolvedWaMessageId) {
    throw new Error('waMessageId is required')
  }

  const updateInteraction = async (changes: Record<string, unknown>) => {
    let query = supabase.from('interacoes').update(changes)
    if (hasInteractionId) {
      query = query.eq('id', normalizedInteractionId)
    } else {
      query = query.eq('wa_message_id', resolvedWaMessageId)
      if (resolvedInstanceName) query = query.eq('instance_name', resolvedInstanceName)
    }
    return query
  }

  const failureResult = async (code: string, attempts: number | null): Promise<ResolveSingleResult> => {
    const updatePayload: Record<string, unknown> = {
      attachment_error: true,
      attachment_error_message: code,
    }

    const shouldFinalizeAsReady = code === 'FATAL_NO_BASE64' || (attempts !== null && attempts >= maxAttempts)
    if (shouldFinalizeAsReady) {
      // Avoid infinite loading state when media is unrecoverable or retries are exhausted.
      updatePayload.attachment_ready = true
    }

    const { error: updateFailureErr } = await updateInteraction(updatePayload)
    if (updateFailureErr) {
      console.error('[MediaResolver] Failed to persist failure state', {
        interactionId: hasInteractionId ? normalizedInteractionId : null,
        waMessageId: resolvedWaMessageId,
        code,
        err: updateFailureErr,
      })
    }

    return {
      success: false,
      code,
      interactionId: hasInteractionId ? normalizedInteractionId : null,
      waMessageId: resolvedWaMessageId,
      attempts,
    }
  }

  let attemptCount: number | null = null
  if (supportsAttemptColumns) {
    try {
      let attemptQuery = supabase
        .from('interacoes')
        .select('attachment_attempt_count')
      if (hasInteractionId) {
        attemptQuery = attemptQuery.eq('id', normalizedInteractionId)
      } else {
        attemptQuery = attemptQuery.eq('wa_message_id', resolvedWaMessageId)
        if (resolvedInstanceName) attemptQuery = attemptQuery.eq('instance_name', resolvedInstanceName)
      }

      const { data: attemptRow, error: attemptSelectErr } = await attemptQuery.maybeSingle()
      if (attemptSelectErr) {
        if (isMissingColumnError(attemptSelectErr, 'attachment_attempt_count')) {
          supportsAttemptColumns = false
        } else {
          console.warn('[MediaResolver] Failed to read attempt counter', attemptSelectErr)
        }
      } else {
        const currentAttempts = Number(attemptRow?.attachment_attempt_count || 0)
        attemptCount = Number.isFinite(currentAttempts) ? currentAttempts + 1 : 1
      }
    } catch (attemptErr) {
      console.warn('[MediaResolver] Failed to resolve attempt counter', shortErrorMessage(attemptErr))
    }
  }

  const startPayload: Record<string, unknown> = {
    attachment_error: false,
    attachment_error_message: 'RESOLVER_STARTED',
  }
  if (attemptCount !== null && supportsAttemptColumns) {
    startPayload.attachment_attempt_count = attemptCount
    startPayload.attachment_last_attempt_at = new Date().toISOString()
  }

  const { error: startErr } = await updateInteraction(startPayload)
  if (startErr) {
    if (isMissingColumnError(startErr, 'attachment_attempt_count') || isMissingColumnError(startErr, 'attachment_last_attempt_at')) {
      supportsAttemptColumns = false
      const fallbackStart = await updateInteraction({
        attachment_error: false,
        attachment_error_message: 'RESOLVER_STARTED',
      })
      if (fallbackStart.error) {
        return failureResult(`DB_START_FAIL:${shortErrorMessage(fallbackStart.error)}`, attemptCount)
      }
      attemptCount = null
    } else {
      return failureResult(`DB_START_FAIL:${shortErrorMessage(startErr)}`, attemptCount)
    }
  }

  const mediaFetchStartedAt = perfNowMs()
  const media = await fetchMediaBase64(
    evolutionUrl,
    evolutionApiKey,
    resolvedInstanceName,
    resolvedWaMessageId,
  )

  if (!media?.base64) {
    return failureResult('FATAL_NO_BASE64', attemptCount)
  }

  console.log('[MEDIA_RESOLVER_LATENCY] evolution_fetch_ms', {
    waMessageId: resolvedWaMessageId,
    interactionId: hasInteractionId ? normalizedInteractionId : null,
    ms: Math.round(perfNowMs() - mediaFetchStartedAt),
  })

  const uploadStartedAt = perfNowMs()
  let publicUrl: string | null = null
  let fileSize = 0
  let ext = 'bin'

  try {
    const fileBytes = decodeBase64(media.base64)
    fileSize = fileBytes.length

    if (resolvedMimeType.includes('image')) ext = resolvedMimeType.split('/')[1] || 'jpg'
    if (resolvedMimeType.includes('jpeg')) ext = 'jpg'
    if (resolvedMimeType.includes('png')) ext = 'png'
    if (resolvedMimeType.includes('webp')) ext = 'webp'
    if (resolvedMimeType.includes('video') || resolvedMimeType.includes('mp4')) ext = 'mp4'
    if (resolvedMimeType.includes('audio') || resolvedMimeType.includes('mpeg') || resolvedMimeType.includes('ogg')) ext = 'mp3'
    if (resolvedMimeType.includes('ogg')) ext = 'ogg'
    if (resolvedMimeType.includes('pdf')) ext = 'pdf'

    if (input.fileName && String(input.fileName).includes('.')) {
      const candidate = String(input.fileName).split('.').pop()
      if (candidate && candidate.length < 5) ext = candidate
    }

    if (ext === 'plain') ext = 'txt'
    if (ext === 'quicktime') ext = 'mov'

    const safeLeadId = sanitizePathPart(String(input.leadId || 'general'))
    const safeInstanceName = sanitizePathPart(String(resolvedInstanceName || 'default'))
    const safeWaMessageId = sanitizePathPart(String(resolvedWaMessageId || `interaction_${normalizedInteractionId || 'unknown'}`))
    const pathOrg = sanitizePathPart(String(input.orgId || input.userId || 'legacy'))
    const storagePath = `${pathOrg}/chat/${safeLeadId}/${Date.now()}_${safeInstanceName}_${safeWaMessageId}.${ext}`
    const bucketCandidates = ['chat-delivery', 'chat-attachments'] as const

    let chosenBucket = ''
    let lastUploadError: unknown = null

    for (const bucketName of bucketCandidates) {
      const { error: uploadError } = await supabase.storage
        .from(bucketName)
        .upload(storagePath, fileBytes, {
          contentType: resolvedMimeType || 'application/octet-stream',
          upsert: true,
        })

      if (!uploadError) {
        chosenBucket = bucketName
        const { data: publicData } = supabase.storage
          .from(bucketName)
          .getPublicUrl(storagePath)
        publicUrl = publicData.publicUrl
        break
      }

      lastUploadError = uploadError
      console.warn('[MediaResolver] Upload failed on bucket', bucketName, uploadError)
    }

    if (!chosenBucket) {
      throw lastUploadError || new Error('No storage bucket available')
    }
  } catch (uploadErr) {
    return failureResult(`STORAGE_FAIL:${shortErrorMessage(uploadErr)}`, attemptCount)
  }

  console.log('[MEDIA_RESOLVER_LATENCY] storage_upload_ms', {
    waMessageId: resolvedWaMessageId,
    interactionId: hasInteractionId ? normalizedInteractionId : null,
    ms: Math.round(perfNowMs() - uploadStartedAt),
  })

  const simplifiedType = resolvedMediaType.replace('Message', '').replace('extended', '').toLowerCase()
  let finalAttachmentType = 'document'
  if (simplifiedType.includes('image')) finalAttachmentType = 'image'
  else if (simplifiedType.includes('sticker')) finalAttachmentType = 'image'
  else if (simplifiedType.includes('video')) finalAttachmentType = 'video'
  else if (simplifiedType.includes('audio')) finalAttachmentType = 'audio'
  if (ext === 'mp4' || ext === 'mov') finalAttachmentType = 'video'

  let transcriptText: string | null = null
  if (finalAttachmentType === 'audio') {
    const transcribeStartedAt = perfNowMs()
    transcriptText = await transcribeAudioWithOpenAI(media.base64, resolvedMimeType)
    console.log('[MEDIA_RESOLVER_LATENCY] audio_transcribe_ms', {
      waMessageId: resolvedWaMessageId,
      interactionId: hasInteractionId ? normalizedInteractionId : null,
      success: Boolean(transcriptText),
      ms: Math.round(perfNowMs() - transcribeStartedAt),
    })
  }

  const updateStartedAt = perfNowMs()
  const successPayload: Record<string, unknown> = {
    attachment_url: publicUrl,
    attachment_ready: true,
    attachment_type: finalAttachmentType,
    attachment_mimetype: resolvedMimeType,
    attachment_name: input.fileName || `${finalAttachmentType}.${ext}`,
    attachment_size: fileSize,
    attachment_error: false,
    attachment_error_message: 'COMPLETED_OK',
  }
  if (transcriptText) {
    successPayload.mensagem = `🎤 ${transcriptText}`
  }

  const { error: updateErr } = await updateInteraction(successPayload)
  if (updateErr) {
    return failureResult(`DB_UPDATE_FAIL:${shortErrorMessage(updateErr)}`, attemptCount)
  }

  console.log('[MEDIA_RESOLVER_LATENCY] db_update_ms', {
    waMessageId: resolvedWaMessageId,
    interactionId: hasInteractionId ? normalizedInteractionId : null,
    ms: Math.round(perfNowMs() - updateStartedAt),
  })

  console.log('[MEDIA_RESOLVER_LATENCY] total_ms', {
    waMessageId: resolvedWaMessageId,
    interactionId: hasInteractionId ? normalizedInteractionId : null,
    ms: Math.round(perfNowMs() - resolverStartedAt),
  })

  return {
    success: true,
    code: 'COMPLETED_OK',
    interactionId: hasInteractionId ? normalizedInteractionId : null,
    waMessageId: resolvedWaMessageId,
    attempts: attemptCount,
  }
}

async function processPendingMedia(
  supabase: ReturnType<typeof createClient>,
  evolutionUrl: string,
  evolutionApiKey: string,
  payload: Record<string, unknown>,
) {
  const maxBatch = asPositiveInt(payload.maxBatch, RETRY_PENDING_BATCH_DEFAULT, 1, 100)
  const minAgeSeconds = asPositiveInt(payload.minAgeSeconds, RETRY_PENDING_MIN_AGE_SECONDS_DEFAULT, 5, 3600)
  const maxAttempts = asPositiveInt(payload.maxAttempts, RETRY_PENDING_MAX_ATTEMPTS_DEFAULT, 1, 15)
  const nowMs = Date.now()
  const cutoffIso = new Date(nowMs - minAgeSeconds * 1000).toISOString()
  const scopedOrgId = typeof payload.orgId === 'string' && payload.orgId.trim().length > 0
    ? payload.orgId.trim()
    : null

  const selectWithAttempts = 'id,org_id,user_id,lead_id,instance_name,wa_message_id,remote_jid,attachment_type,attachment_mimetype,attachment_name,attachment_attempt_count,created_at'
  const selectWithoutAttempts = 'id,org_id,user_id,lead_id,instance_name,wa_message_id,remote_jid,attachment_type,attachment_mimetype,attachment_name,created_at'

  const fetchPendingRows = async (columns: string) => {
    let query = supabase
      .from('interacoes')
      .select(columns)
      .not('attachment_type', 'is', null)
      .eq('attachment_ready', false)
      .lte('created_at', cutoffIso)
      .order('id', { ascending: true })
      .limit(maxBatch)

    if (scopedOrgId) {
      query = query.eq('org_id', scopedOrgId)
    }

    return query
  }

  let rows: any[] = []
  if (supportsAttemptColumns) {
    const { data, error } = await fetchPendingRows(selectWithAttempts)
    if (error && isMissingColumnError(error, 'attachment_attempt_count')) {
      supportsAttemptColumns = false
      const fallback = await fetchPendingRows(selectWithoutAttempts)
      if (fallback.error) throw fallback.error
      rows = fallback.data || []
    } else if (error) {
      throw error
    } else {
      rows = data || []
    }
  } else {
    const { data, error } = await fetchPendingRows(selectWithoutAttempts)
    if (error) throw error
    rows = data || []
  }

  const summary = {
    scanned: rows.length,
    resolved: 0,
    failed: 0,
    skipped: 0,
    results: [] as Array<Record<string, unknown>>,
  }

  for (const row of rows) {
    const attemptCount = supportsAttemptColumns
      ? Number(row.attachment_attempt_count || 0)
      : null

    if (attemptCount !== null && Number.isFinite(attemptCount) && attemptCount >= maxAttempts) {
      summary.skipped += 1
      const { error: finalizeErr } = await supabase
        .from('interacoes')
        .update({
          attachment_ready: true,
          attachment_error: true,
          attachment_error_message: 'MAX_ATTEMPTS_EXHAUSTED',
        })
        .eq('id', row.id)
        .eq('attachment_ready', false)

      if (finalizeErr) {
        console.warn('[MediaResolver] Failed to finalize exhausted pending media', {
          interactionId: row.id,
          err: finalizeErr,
        })
      }

      summary.results.push({
        interactionId: row.id,
        waMessageId: row.wa_message_id || null,
        status: 'skipped',
        code: 'MAX_ATTEMPTS_EXHAUSTED',
      })
      continue
    }

    const result = await resolveSingleMedia(
      supabase,
      evolutionUrl,
      evolutionApiKey,
      {
        orgId: row.org_id,
        interactionId: row.id,
        instanceName: row.instance_name,
        waMessageId: row.wa_message_id,
        remoteJid: row.remote_jid,
        mediaType: mapAttachmentTypeToMessageType(row.attachment_type),
        mimeType: row.attachment_mimetype,
        fileName: row.attachment_name,
        leadId: row.lead_id,
        userId: row.user_id,
        maxAttempts,
      },
    )

    if (result.success) {
      summary.resolved += 1
    } else {
      summary.failed += 1
    }

    summary.results.push({
      interactionId: row.id,
      waMessageId: row.wa_message_id || null,
      status: result.success ? 'resolved' : 'failed',
      code: result.code,
      attempts: result.attempts,
    })
  }

  return summary
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const evolutionUrl = Deno.env.get('EVOLUTION_API_URL')
  const evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY')
  const internalInvokeSecret =
    Deno.env.get('MEDIA_RESOLVER_INTERNAL_SECRET')
    || Deno.env.get('ARKAN_WEBHOOK_SECRET')
    || ''

  if (!supabaseUrl || !supabaseKey || !evolutionUrl || !evolutionApiKey) {
    return new Response('Configuration/Env Error', { status: 500 })
  }

  const receivedInternalSecret = req.headers.get('x-internal-secret') || req.headers.get('x-arkan-webhook-secret') || ''
  if (internalInvokeSecret && receivedInternalSecret !== internalInvokeSecret) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const supabase = createClient(supabaseUrl, supabaseKey)

  try {
    const rawPayload = await req.json().catch(() => ({}))
    const payload = (rawPayload && typeof rawPayload === 'object') ? rawPayload as Record<string, unknown> : {}
    const action = String(payload.action || 'resolveOne')

    if (action === 'retryPending') {
      const retryStartedAt = perfNowMs()
      const summary = await processPendingMedia(supabase, evolutionUrl, evolutionApiKey, payload)
      return new Response(JSON.stringify({
        success: true,
        action,
        elapsedMs: Math.round(perfNowMs() - retryStartedAt),
        ...summary,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const result = await resolveSingleMedia(
      supabase,
      evolutionUrl,
      evolutionApiKey,
      {
        orgId: payload.orgId as string | undefined,
        interactionId: payload.interactionId as string | number | undefined,
        instanceName: payload.instanceName as string | undefined,
        waMessageId: payload.waMessageId as string | undefined,
        remoteJid: payload.remoteJid as string | undefined,
        mediaType: payload.mediaType as string | undefined,
        mimeType: payload.mimeType as string | undefined,
        fileName: payload.fileName as string | undefined,
        leadId: payload.leadId as string | number | undefined,
        userId: payload.userId as string | undefined,
        maxAttempts: payload.maxAttempts as number | undefined,
      },
    )

    if (!result.success) {
      return new Response(JSON.stringify({ success: false, ...result }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ success: true, ...result }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('[MediaResolver] Fatal Error:', error)
    return new Response(JSON.stringify({ error: shortErrorMessage(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
