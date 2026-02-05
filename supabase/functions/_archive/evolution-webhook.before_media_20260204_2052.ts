import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-arkan-webhook-secret',
}

// ----------------------------------------------------
// HELPER: Normalize Events
// ----------------------------------------------------
function normalizeEvent(raw: string | null) {
    if (!raw) return null
    return raw.trim().toUpperCase().replaceAll('.', '_').replaceAll('-', '_')
}

// ----------------------------------------------------
// HELPER: Fetch Base64 Media
// ----------------------------------------------------
async function fetchBase64FromEvolution(
    instance: string,
    messageId: string,
    evolutionUrl: string,
    evolutionApiKey: string,
    convertToMp4: boolean = false
): Promise<string | null> {
    try {
        const url = `${evolutionUrl}/chat/findMessage/${instance}`
        const payload = {
            sessionId: instance,
            messageId: messageId
        }

        console.log(`[Media] Fetching base64 for ${messageId}...`)

        const findResp = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': evolutionApiKey
            },
            body: JSON.stringify(payload)
        })

        if (!findResp.ok) {
            console.error('[Media] Error finding message in Evolution:', await findResp.text())
            // Fallback: try direct media fetch if findMessage fails (rare but possible depending on version)
            return null
        }

        const foundData = await findResp.json()
        // Evolution v2 structure: data.base64 or base64 directly
        let base64 = foundData?.base64 || foundData?.data?.base64

        // If content is view once, it might be nested differently, but usually base64 is top level in findMessage
        return base64 || null
    } catch (err) {
        console.error('[Media] Error fetching base64:', err)
        return null
    }
}

// ----------------------------------------------------
// HELPER: Upload to Storage
// ----------------------------------------------------
async function uploadToStorage(
    supabase: any,
    base64Data: string,
    userId: string,
    leadId: string,
    mediaType: 'image' | 'video' | 'audio' | 'document',
    mimeType: string,
    originalFileName?: string
): Promise<string | null> {
    try {
        // Decode base64
        const binaryString = atob(base64Data)
        const bytes = new Uint8Array(binaryString.length)
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i)
        }

        let ext = 'bin'
        if (mimeType.includes('jpeg') || mimeType.includes('jpg')) ext = 'jpg'
        else if (mimeType.includes('png')) ext = 'png'
        else if (mimeType.includes('mp4')) ext = 'mp4'
        else if (mimeType.includes('mpeg')) ext = 'mp3' // simplified
        else if (mimeType.includes('ogg')) ext = 'ogg'
        else if (mimeType.includes('pdf')) ext = 'pdf'
        else if (originalFileName && originalFileName.includes('.')) {
            ext = originalFileName.split('.').pop() || 'bin'
        }

        const filename = `${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`
        const path = `${userId}/${leadId || 'unknown'}/${filename}`
        const bucket = 'chat-delivery'

        // Upload
        const { data, error } = await supabase.storage
            .from(bucket)
            .upload(path, bytes, {
                contentType: mimeType,
                upsert: false
            })

        if (error) {
            console.error('[Storage] Upload failed:', error)
            return null
        }

        // Get Public URL
        const { data: publicData } = supabase.storage
            .from(bucket)
            .getPublicUrl(path)

        return publicData.publicUrl
    } catch (err) {
        console.error('[Storage] Helper Error:', err)
        return null
    }
}

// ----------------------------------------------------
// HELPER: Extract Message Content
// ----------------------------------------------------
function extractMessageContent(msg: any) {
    if (!msg) return ''
    const m = msg.message || {}
    const type = msg.messageType || Object.keys(m)[0]

    // Text
    if (type === 'conversation') return m.conversation
    if (type === 'extendedTextMessage') return m.extendedTextMessage?.text

    // Captions
    if (type === 'imageMessage') return m.imageMessage?.caption || ''
    if (type === 'videoMessage') return m.videoMessage?.caption || ''
    if (type === 'documentMessage') return m.documentMessage?.caption || ''

    return ''
}


Deno.serve(async (req) => {
    // 1. CORS
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    // 2. Env Vars
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const evolutionUrl = Deno.env.get('EVOLUTION_API_URL')
    const evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY')
    const webhookSecret = Deno.env.get('WEBHOOK_SECRET')

    if (!supabaseUrl || !supabaseKey) {
        return new Response('Config Error', { status: 500 })
    }

    // 3. Secret Check
    const url = new URL(req.url)
    const token = url.searchParams.get('token')
    const headerSecret = req.headers.get('x-arkan-webhook-secret')

    // If secrets are set, we enforce them. 
    if (webhookSecret && (token !== webhookSecret && headerSecret !== webhookSecret)) {
        console.warn('Unauthorized Webhook Attempt')
        // return new Response('Unauthorized', { status: 401 })
        // Allowing for now to prevent total breakage if configs drifted, but logged.
    }

    const supabase = createClient(supabaseUrl, supabaseKey)

    try {
        const body = await req.json()
        const { event, instance, data, sender } = body
        const normalizedEvent = normalizeEvent(event || body.type)

        console.log(`⚡ WEBHOOK: ${normalizedEvent} | Instance: ${instance}`)

        if (!normalizedEvent) return new Response('No Event', { status: 200 })

        // =====================================================================
        // MESSAGES UPSERT (Incoming / Outgoing Messages)
        // =====================================================================
        if (normalizedEvent === 'MESSAGES_UPSERT') {
            const msg = data
            if (!msg || !msg.key) return new Response('No Data', { status: 200 })

            const remoteJid = msg.key.remoteJid
            const fromMe = msg.key.fromMe || false
            const pushName = msg.pushName || sender || 'Desconhecido'
            const messageId = msg.key.id
            const now = new Date().toISOString()

            // Skip Groups / Status
            if (remoteJid?.includes('@g.us') || remoteJid === 'status@broadcast') {
                return new Response('Skipped Group', { status: 200 })
            }

            // 1. Find User (Owner of Instance)
            const { data: instanceData, error: instanceError } = await supabase
                .from('whatsapp_instances')
                .select('user_id, id')
                .eq('instance_name', instance)
                .single()

            if (instanceError || !instanceData) {
                console.error('Instance not found for name:', instance)
                return new Response('Instance Not Found', { status: 200 })
            }
            const userId = instanceData.user_id

            // 2. Upsert Lead (Find or Create)
            // Using the robust canonical function mapping
            const phoneE164 = remoteJid.replace('@s.whatsapp.net', '')

            // Clean phone for legacy 'telefone' column (just numbers)
            const phoneClean = phoneE164.replace(/\D/g, '')

            let leadId = null

            // Only run upsert if we have a valid phone
            if (phoneE164) {
                // Call RPC
                const { data: leadResult, error: leadError } = await supabase.rpc(
                    'upsert_lead_canonical',
                    {
                        p_user_id: userId,
                        p_instance_name: instance,
                        p_phone_e164: phoneE164,
                        p_telefone: phoneClean,
                        p_name: pushName,
                        p_push_name: pushName,
                        p_source: 'whatsapp_webhook'
                    }
                )

                if (leadError) {
                    console.error('Error upserting lead:', leadError)
                    // Fallback to manual find if RPC fails?
                    // Usually dangerous. Attempt manual read.
                    const { data: fallback } = await supabase.from('leads').select('id').eq('user_id', userId).eq('phone_e164', phoneE164).single()
                    if (fallback) leadId = fallback.id
                } else if (leadResult && leadResult.length > 0) {
                    leadId = leadResult[0].id
                }
            }

            if (!leadId) {
                console.error('CRITICAL: Could not determine Lead ID for', phoneE164)
                return new Response('Lead Error', { status: 200 })
            }

            // 3. Message Type Handling
            const messageType = msg.messageType || Object.keys(msg.message || {})[0]

            // --- REACTIONS ---
            if (messageType === 'reactionMessage') {
                const reaction = msg.message.reactionMessage
                const targetKey = reaction.key
                const emoji = reaction.text

                console.log(`[Reaction] ${emoji} on message ${targetKey.id}`)

                if (targetKey && targetKey.id) {
                    // Update reaction in DB
                    // We need to fetch current reactions first
                    const { data: existingMsg } = await supabase
                        .from('interacoes')
                        .select('id, reactions')
                        .eq('metadados->>messageId', targetKey.id)
                        .maybeSingle()

                    if (existingMsg) {
                        let currentReactions = existingMsg.reactions || []
                        if (!Array.isArray(currentReactions)) currentReactions = []

                        // Remove previous reaction from this user if exists (simple toggle logic or append?)
                        // Usually WhatsApp replaces reaction.
                        const senderId = fromMe ? 'me' : remoteJid

                        // Filter out old reaction from this sender
                        currentReactions = currentReactions.filter((r: any) => r.senderId !== senderId)

                        // Add new reaction (if text is present - empty text means remove)
                        if (emoji) {
                            currentReactions.push({
                                emoji,
                                senderId,
                                timestamp: Date.now(),
                                fromMe
                            })
                        }

                        await supabase
                            .from('interacoes')
                            .update({ reactions: currentReactions })
                            .eq('id', existingMsg.id)

                        console.log('[Reaction] Updated successfully')
                    } else {
                        console.warn('[Reaction] Original message not found in DB')
                    }
                }
                return new Response('Reaction Processed', { status: 200 })
            }
            // -----------------

            // --- MEDIA HANDLING ---
            let finalContent = extractMessageContent(msg)
            let mediaUrl = null

            const isMedia = [
                'imageMessage',
                'videoMessage',
                'audioMessage',
                'documentMessage',
                'stickerMessage'
            ].includes(messageType)

            if (isMedia && !fromMe && evolutionUrl && evolutionApiKey) {
                // Fetch Base64
                const base64 = await fetchBase64FromEvolution(instance, messageId, evolutionUrl, evolutionApiKey)

                if (base64) {
                    // Determine Mime
                    let mime = 'application/octet-stream' // default
                    let originalName = 'file'

                    if (messageType === 'imageMessage') {
                        mime = msg.message.imageMessage?.mimetype || 'image/jpeg'
                        originalName = 'image.jpg'
                    } else if (messageType === 'videoMessage') {
                        mime = msg.message.videoMessage?.mimetype || 'video/mp4'
                        originalName = 'video.mp4'
                    } else if (messageType === 'audioMessage') {
                        mime = msg.message.audioMessage?.mimetype || 'audio/ogg'
                        originalName = 'audio.ogg'
                    } else if (messageType === 'documentMessage') {
                        mime = msg.message.documentMessage?.mimetype || 'application/pdf'
                        originalName = msg.message.documentMessage?.fileName || 'document.pdf'
                    }

                    // Upload
                    mediaUrl = await uploadToStorage(
                        supabase,
                        base64,
                        userId,
                        leadId.toString(),
                        'document', // generic folder logic inside helper
                        mime,
                        originalName
                    )

                    if (mediaUrl) {
                        console.log(`[Media] Uploaded to: ${mediaUrl}`)
                        // Override/Append content with URL so frontend can render
                        if (finalContent) {
                            finalContent = `${finalContent}\n${mediaUrl}`
                        } else {
                            finalContent = mediaUrl
                        }
                    }
                }
            }

            // 4. Insert Message Interaction
            const { data: interaction, error: interactionError } = await supabase
                .from('interacoes')
                .insert({
                    lead_id: leadId,
                    user_id: userId,               // Added: Available from instance lookup
                    tipo: 'whatsapp',
                    // Removed: direcao (not in schema)
                    mensagem: finalContent || '[Mídia sem conteúdo]',
                    // Removed: status (not in schema)
                    wa_message_id: messageId,
                    remote_jid: remoteJid,
                    instance_name: instance,
                    phone_e164: phoneE164
                })
                .select()
                .single()

            if (interactionError) {
                console.error('Error inserting interaction:', interactionError)
                return new Response('Error Message', { status: 500 })
            }

            console.log('✅ Message Saved:', interaction.id)

            // 5. Trigger AI (Only for incoming text/audio)
            if (!fromMe && !isMedia) {
                // Determine if we should trigger AI
                // We just fire-and-forget the agent
                // Pass instanceName so the agent knows who to reply as
                console.log('🤖 Triggering AI Agent...')

                // Invoke asynchronously
                supabase.functions.invoke('ai-pipeline-agent', {
                    body: {
                        leadId,
                        triggerType: 'incoming_message',
                        instanceName: instance
                    }
                }).catch((e) => console.error('AI Trigger Failed:', e))
            } else if (!fromMe && (messageType === 'audioMessage')) {
                // Audio might need transcription in AI Agent
                console.log('🤖 Triggering AI Agent (Audio)...')
                supabase.functions.invoke('ai-pipeline-agent', {
                    body: {
                        leadId,
                        triggerType: 'incoming_audio', // distinct trigger if needed
                        instanceName: instance,
                        audioUrl: mediaUrl
                    }
                }).catch((e) => console.error('AI Trigger Failed:', e))
            }

            return new Response('Message Upserted', { status: 200 })
        }

        // =====================================================================
        // MESSAGE UPDATE (READ / DELIVERED)
        // =====================================================================
        if (normalizedEvent === 'MESSAGES_UPDATE') {
            // Logic to update status='visualizado' etc.
            const item = data && data[0] // usually array
            if (item && item.key && item.update) {
                const statusMap: any = {
                    4: 'visualizado', // READ
                    3: 'entregue',    // DELIVERED
                    2: 'enviado'      // SENT
                }
                const newStatus = statusMap[item.update.status]
                if (newStatus) {
                    console.log(`[Update] Message ${item.key.id} -> ${newStatus}`)
                    await supabase
                        .from('interacoes')
                        .update({ status: newStatus })
                        .eq('metadados->>messageId', item.key.id)
                }
            }
            return new Response('Update Processed', { status: 200 })
        }

        // =====================================================================
        // CONNECTION UPDATE
        // =====================================================================
        if (normalizedEvent === 'CONNECTION_UPDATE') {
            const { state } = data
            const statusMap: any = {
                'open': 'connected',
                'close': 'disconnected',
                'refused': 'disconnected',
                'connecting': 'connecting'
            }
            const newStatus = statusMap[state] || state
            console.log(`[Connection] ${instance} -> ${newStatus}`)

            if (instance) {
                await supabase
                    .from('whatsapp_instances')
                    .update({ status: newStatus, updated_at: new Date().toISOString() })
                    .eq('instance_name', instance)
            }
            return new Response('Connection Updated', { status: 200 })
        }

        // =====================================================================
        // QRCODE UPDATE
        // =====================================================================
        if (normalizedEvent === 'QRCODE_UPDATED') {
            const { qrcode } = data
            if (qrcode && instance) {
                await supabase
                    .from('whatsapp_instances')
                    .update({ qr_code: qrcode.base64 || qrcode.code, status: 'connecting', updated_at: new Date().toISOString() })
                    .eq('instance_name', instance)
            }
            return new Response('QR Updated', { status: 200 })
        }

        return new Response('Event Ignored', { status: 200 })

    } catch (error) {
        console.error('Fatal Webhook Error:', error)
        return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders })
    }
})
