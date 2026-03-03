import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ALLOWED_ORIGIN = Deno.env.get('ALLOWED_ORIGIN')
if (!ALLOWED_ORIGIN) {
    throw new Error('Missing ALLOWED_ORIGIN env')
}

const corsHeaders = {
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-internal-secret, x-arkan-webhook-secret',
}

// Helper to decode Base64 to Uint8Array safely
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

    if (!supabaseUrl || !supabaseKey || !evolutionUrl || !evolutionApiKey || !internalInvokeSecret) {
        return new Response('Configuration/Env Error', { status: 500 })
    }

    const receivedInternalSecret = req.headers.get('x-internal-secret') || req.headers.get('x-arkan-webhook-secret') || ''
    if (receivedInternalSecret !== internalInvokeSecret) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
    }

    const supabase = createClient(supabaseUrl, supabaseKey)

    try {
        const resolverStartedAt = perfNowMs()
        const payload = await req.json()
        const {
            orgId,
            interactionId,
            instanceName,
            waMessageId,
            remoteJid,
            mediaType,
            mimeType,
            fileName,
            leadId,
            userId
        } = payload || {}

        const normalizedInteractionId = Number(interactionId)
        const hasInteractionId = Number.isFinite(normalizedInteractionId) && normalizedInteractionId > 0
        const resolvedMimeType = typeof mimeType === 'string' && mimeType.trim()
            ? mimeType.trim()
            : 'application/octet-stream'
        const resolvedMediaType = typeof mediaType === 'string' ? mediaType : ''

        const updateInteraction = async (changes: Record<string, unknown>) => {
            let query = supabase.from('interacoes').update(changes)
            if (hasInteractionId) {
                query = query.eq('id', normalizedInteractionId)
            } else if (waMessageId) {
                query = query.eq('wa_message_id', waMessageId)
                if (instanceName) query = query.eq('instance_name', instanceName)
            } else {
                throw new Error('interactionId or waMessageId is required')
            }
            return query
        }

        console.log(`MEDIA_RESOLVE_START {waMessageId: ${waMessageId}}`)

        // DEBUG: Mark start in DB
        const debugStart = await updateInteraction({ attachment_error_message: 'RESOLVER_STARTED' })

        if (debugStart.error) console.error('DB_LOG_FAIL', debugStart.error)

        // 1. Fetch Media from Evolution
        let base64 = null
        const fetchStartedAt = perfNowMs()

        // Strategy A: getBase64FromMediaMessage
        try {
            const urlA = `${evolutionUrl}/chat/getBase64FromMediaMessage/${instanceName}`

            // Construct payload: Minimal object
            const payloadA = {
                message: {
                    key: { id: waMessageId }
                },
                convertToMp4: false
            }

            const respA = await fetch(urlA, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'apikey': evolutionApiKey },
                body: JSON.stringify(payloadA)
            })

            if (respA.ok) {
                const dataA = await respA.json()
                base64 = dataA.base64 || dataA.data?.base64
                if (base64) console.log(`EVOLUTION_FETCH_OK (Strategy A)`)
            } else {
                const errText = await respA.text()
                console.warn(`EVOLUTION_FETCH_FAIL (Strategy A): ${respA.status} - ${errText}`)
                // Update DB with soft error
                await updateInteraction({ attachment_error_message: `FETCH_A_FAIL: ${respA.status}` })
            }
        } catch (e) {
            console.error('[MediaResolver] Strategy A Exception:', e)
        }

        // Strategy B: findMessage (Fallback)
        if (!base64) {
            await updateInteraction({ attachment_error_message: 'TRYING_STRATEGY_B' })

            try {
                const urlB = `${evolutionUrl}/chat/findMessage/${instanceName}`
                const respB = await fetch(urlB, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'apikey': evolutionApiKey },
                    body: JSON.stringify({ sessionId: instanceName, messageId: waMessageId })
                })
                if (respB.ok) {
                    const dataB = await respB.json()
                    base64 = dataB.base64 || dataB.data?.base64
                } else {
                    const errB = await respB.text()
                    await updateInteraction({ attachment_error_message: `FETCH_B_FAIL: ${respB.status} ${errB.substring(0, 50)}` })
                }
            } catch (e) {
                console.error('[MediaResolver] Strategy B Exception:', e)
            }
        }

        if (!base64) {
            await updateInteraction({ attachment_error: true, attachment_error_message: 'FATAL_NO_BASE64' })

            throw new Error('Could not retrieve base64 from Evolution API via any strategy')
        }
        console.log('[MEDIA_RESOLVER_LATENCY] evolution_fetch_ms', {
            waMessageId,
            interactionId: hasInteractionId ? normalizedInteractionId : null,
            ms: Math.round(perfNowMs() - fetchStartedAt)
        })

        // 2. Decode & Upload
        await updateInteraction({ attachment_error_message: 'UPLOADING_STORAGE' })

        let publicUrl = null
        let fileSize = 0
        let ext = 'bin'
        const uploadStartedAt = perfNowMs()

        try {
            const fileBytes = decodeBase64(base64)
            fileSize = fileBytes.length

            // Determine Extension
            if (resolvedMimeType.includes('image')) ext = resolvedMimeType.split('/')[1] || 'jpg'
            if (resolvedMimeType.includes('jpeg')) ext = 'jpg'
            if (resolvedMimeType.includes('png')) ext = 'png'
            if (resolvedMimeType.includes('webp')) ext = 'webp'
            if (resolvedMimeType.includes('video') || resolvedMimeType.includes('mp4')) ext = 'mp4'
            if (resolvedMimeType.includes('audio') || resolvedMimeType.includes('mpeg') || resolvedMimeType.includes('ogg')) ext = 'mp3'
            if (resolvedMimeType.includes('ogg')) ext = 'ogg'
            if (resolvedMimeType.includes('pdf')) ext = 'pdf'

            if (fileName && fileName.includes('.')) {
                const candidate = fileName.split('.').pop()
                if (candidate && candidate.length < 5) ext = candidate
            }

            // Normalizing common issues
            if (ext === 'plain') ext = 'txt'
            if (ext === 'quicktime') ext = 'mov'

            const safeLeadId = sanitizePathPart(String(leadId || 'general'))
            const safeInstanceName = sanitizePathPart(String(instanceName || 'default'))
            const safeWaMessageId = sanitizePathPart(String(waMessageId || `interaction_${normalizedInteractionId || 'unknown'}`))
            const pathOrg = sanitizePathPart(String(orgId || userId || 'legacy'))
            const storagePath = `${pathOrg}/chat/${safeLeadId}/${Date.now()}_${safeInstanceName}_${safeWaMessageId}.${ext}`
            const bucketCandidates = ['chat-delivery', 'chat-attachments'] as const

            let chosenBucket = ''
            let lastUploadError: any = null

            for (const bucketName of bucketCandidates) {
                const { error: uploadError } = await supabase.storage
                    .from(bucketName)
                    .upload(storagePath, fileBytes, {
                        contentType: resolvedMimeType || 'application/octet-stream',
                        upsert: true
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
            const uploadMessage = uploadErr instanceof Error ? uploadErr.message : String(uploadErr)
            await updateInteraction({ attachment_error: true, attachment_error_message: `STORAGE_FAIL: ${uploadMessage}` })
            throw uploadErr
        }
        console.log('[MEDIA_RESOLVER_LATENCY] storage_upload_ms', {
            waMessageId,
            interactionId: hasInteractionId ? normalizedInteractionId : null,
            ms: Math.round(perfNowMs() - uploadStartedAt)
        })

        // 3. Update Interaction
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
            transcriptText = await transcribeAudioWithOpenAI(base64, resolvedMimeType)
            console.log('[MEDIA_RESOLVER_LATENCY] audio_transcribe_ms', {
                waMessageId,
                interactionId: hasInteractionId ? normalizedInteractionId : null,
                success: Boolean(transcriptText),
                ms: Math.round(perfNowMs() - transcribeStartedAt)
            })
        }

        const updateStartedAt = perfNowMs()
        const { error: updateError } = await updateInteraction({
            attachment_url: publicUrl,
            attachment_ready: true,
            attachment_type: finalAttachmentType,
            attachment_mimetype: resolvedMimeType,
            attachment_name: fileName || `${finalAttachmentType}.${ext}`,
            attachment_size: fileSize,
            ...(transcriptText ? { mensagem: `🎤 ${transcriptText}` } : {}),
            attachment_error: false,
            attachment_error_message: 'COMPLETED_OK' // CLEAR ERROR FLAGS
        })

        if (updateError) {
            await updateInteraction({ attachment_error: true, attachment_error_message: `DB_UPDATE_FAIL: ${updateError.message}` })
            throw updateError
        }
        console.log('[MEDIA_RESOLVER_LATENCY] db_update_ms', {
            waMessageId,
            interactionId: hasInteractionId ? normalizedInteractionId : null,
            ms: Math.round(perfNowMs() - updateStartedAt)
        })
        console.log('[MEDIA_RESOLVER_LATENCY] total_ms', {
            waMessageId,
            interactionId: hasInteractionId ? normalizedInteractionId : null,
            ms: Math.round(perfNowMs() - resolverStartedAt)
        })

        console.log(`DB_UPDATE_OK`)

        return new Response(JSON.stringify({ success: true, url: publicUrl }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })

    } catch (error) {
        console.error('[MediaResolver] Fatal Error:', error)
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
    }
})
