import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ALLOWED_ORIGIN = Deno.env.get('ALLOWED_ORIGIN')
if (!ALLOWED_ORIGIN) {
    throw new Error('Missing ALLOWED_ORIGIN env')
}

const corsHeaders = {
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const evolutionUrl = Deno.env.get('EVOLUTION_API_URL')
    const evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY')

    if (!supabaseUrl || !supabaseKey || !evolutionUrl || !evolutionApiKey) {
        return new Response('Configuration/Env Error', { status: 500 })
    }

    const supabase = createClient(supabaseUrl, supabaseKey)

    try {
        const { instanceName, waMessageId, remoteJid, mediaType, mimeType, fileName, leadId, userId } = await req.json()

        console.log(`MEDIA_RESOLVE_START {waMessageId: ${waMessageId}}`)

        // DEBUG: Mark start in DB
        const debugStart = await supabase.from('interacoes')
            .update({ attachment_error_message: 'RESOLVER_STARTED' })
            .eq('wa_message_id', waMessageId)

        if (debugStart.error) console.error('DB_LOG_FAIL', debugStart.error)

        // 1. Fetch Media from Evolution
        let base64 = null

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
                await supabase.from('interacoes')
                    .update({ attachment_error_message: `FETCH_A_FAIL: ${respA.status}` })
                    .eq('wa_message_id', waMessageId)
            }
        } catch (e) {
            console.error('[MediaResolver] Strategy A Exception:', e)
        }

        // Strategy B: findMessage (Fallback)
        if (!base64) {
            await supabase.from('interacoes')
                .update({ attachment_error_message: 'TRYING_STRATEGY_B' })
                .eq('wa_message_id', waMessageId)

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
                    await supabase.from('interacoes')
                        .update({ attachment_error_message: `FETCH_B_FAIL: ${respB.status} ${errB.substring(0, 50)}` })
                        .eq('wa_message_id', waMessageId)
                }
            } catch (e) {
                console.error('[MediaResolver] Strategy B Exception:', e)
            }
        }

        if (!base64) {
            await supabase.from('interacoes')
                .update({ attachment_error: true, attachment_error_message: 'FATAL_NO_BASE64' })
                .eq('wa_message_id', waMessageId)

            throw new Error('Could not retrieve base64 from Evolution API via any strategy')
        }

        // 2. Decode & Upload
        await supabase.from('interacoes')
            .update({ attachment_error_message: 'UPLOADING_STORAGE' })
            .eq('wa_message_id', waMessageId)

        let publicUrl = null
        let fileSize = 0
        let ext = 'bin'

        try {
            const fileBytes = decodeBase64(base64)
            fileSize = fileBytes.length

            // Determine Extension
            if (mimeType.includes('image')) ext = mimeType.split('/')[1] || 'jpg'
            if (mimeType.includes('jpeg')) ext = 'jpg'
            if (mimeType.includes('png')) ext = 'png'
            if (mimeType.includes('webp')) ext = 'webp'
            if (mimeType.includes('video') || mimeType.includes('mp4')) ext = 'mp4'
            if (mimeType.includes('audio') || mimeType.includes('mpeg') || mimeType.includes('ogg')) ext = 'mp3'
            if (mimeType.includes('ogg')) ext = 'ogg'
            if (mimeType.includes('pdf')) ext = 'pdf'

            if (fileName && fileName.includes('.')) {
                const candidate = fileName.split('.').pop()
                if (candidate && candidate.length < 5) ext = candidate
            }

            // Normalizing common issues
            if (ext === 'plain') ext = 'txt'
            if (ext === 'quicktime') ext = 'mov'

            const storagePath = `${userId}/${leadId.toString()}/${instanceName || 'default'}/${waMessageId}.${ext}`
            const bucketName = 'chat-attachments'

            const { error: uploadError } = await supabase.storage
                .from(bucketName)
                .upload(storagePath, fileBytes, {
                    contentType: mimeType || 'application/octet-stream',
                    upsert: true
                })

            if (uploadError) throw uploadError

            const { data: publicData } = supabase.storage
                .from(bucketName)
                .getPublicUrl(storagePath)

            publicUrl = publicData.publicUrl

        } catch (uploadErr) {
            await supabase.from('interacoes')
                .update({ attachment_error: true, attachment_error_message: `STORAGE_FAIL: ${uploadErr.message}` })
                .eq('wa_message_id', waMessageId)
            throw uploadErr
        }

        // 3. Update Interaction
        const simplifiedType = mediaType.replace('Message', '').replace('extended', '').toLowerCase()
        let finalAttachmentType = 'document'
        if (simplifiedType.includes('image')) finalAttachmentType = 'image'
        else if (simplifiedType.includes('video')) finalAttachmentType = 'video'
        else if (simplifiedType.includes('audio')) finalAttachmentType = 'audio'
        if (ext === 'mp4' || ext === 'mov') finalAttachmentType = 'video'

        const { error: updateError } = await supabase
            .from('interacoes')
            .update({
                attachment_url: publicUrl,
                attachment_ready: true,
                attachment_type: finalAttachmentType,
                attachment_mimetype: mimeType,
                attachment_name: fileName || `${finalAttachmentType}.${ext}`,
                attachment_size: fileSize,
                attachment_error: false,
                attachment_error_message: 'COMPLETED_OK' // CLEAR ERROR FLAGS
            })
            .eq('wa_message_id', waMessageId)

        if (updateError) {
            await supabase.from('interacoes')
                .update({ attachment_error: true, attachment_error_message: `DB_UPDATE_FAIL: ${updateError.message}` })
                .eq('wa_message_id', waMessageId)
            throw updateError
        }

        console.log(`DB_UPDATE_OK`)

        return new Response(JSON.stringify({ success: true, url: publicUrl }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })

    } catch (error) {
        console.error('[MediaResolver] Fatal Error:', error)
        return new Response(JSON.stringify({ error: 'Internal server error' }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
    }
})
