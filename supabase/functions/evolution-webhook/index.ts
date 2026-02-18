import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-arkan-webhook-secret',
}

function onlyDigits(str: string | null | undefined): string {
    if (!str) return ''
    return str.replace(/\D/g, '')
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

function normalizeWhatsId(remoteJid: string) {
    return remoteJid.split('@')[0]
}

function extractMessageContent(msg: any) {
    const m = msg?.message || {}
    const type = msg?.messageType || msg?.type || Object.keys(m)[0]

    if (type === 'conversation') return m.conversation
    if (type === 'extendedTextMessage') return m.extendedTextMessage?.text

    if (type === 'audioMessage') {
        const duration = m.audioMessage?.seconds || 0
        return `🎤 Áudio (${duration}s)`
    }
    if (type === 'imageMessage') {
        return `🖼️ ${m.imageMessage?.caption || 'Imagem recebida'}`
    }
    if (type === 'videoMessage') {
        return `🎬 ${m.videoMessage?.caption || 'Vídeo recebido'}`
    }
    if (type === 'documentMessage') {
        return `📎 ${m.documentMessage?.fileName || 'Documento'}`
    }
    if (type === 'stickerMessage') {
        return `🖼️ Sticker`
    }

    if (m?.conversation) return m.conversation
    if (m?.extendedTextMessage?.text) return m.extendedTextMessage.text

    return `Mensagem recebida (tipo: ${type || 'desconhecido'})`
}

async function uploadMedia(
    supabase: any,
    data: string | Uint8Array,
    mimeType: string,
    instanceName: string,
    inputType: 'base64' | 'binary'
): Promise<string | null> {
    console.log(`🚀 Starting media upload for instance: ${instanceName}, mime: ${mimeType}, type: ${inputType}`)
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
        const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`
        const filePath = `images/${instanceName}/${fileName}`

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

    console.log(`📡 Fetching base64 from Evolution for instance: ${instanceName}`)

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
        console.log(`✅ Got base64 from Evolution, length: ${data.base64?.length || 0}`)

        return {
            base64: data.base64,
            mimeType: data.mimetype || 'application/octet-stream'
        }
    } catch (err: any) {
        console.error('❌ Evolution base64 exception:', err?.message || err)
        return null
    }
}

Deno.serve(async (req: Request) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders })
    }

    const url = new URL(req.url)

    try {
        // --- M0 HARDENING: Validar Webhook Secret ---
        const expectedSecret = Deno.env.get('ARKAN_WEBHOOK_SECRET');
        if (expectedSecret) {
            const receivedHeader = req.headers.get('x-arkan-webhook-secret');
            const receivedQuery = url.searchParams.get('secret');

            if (receivedHeader !== expectedSecret && receivedQuery !== expectedSecret) {
                console.warn('⚠️ Invalid webhook secret (header and query check failed)');
                return new Response(JSON.stringify({ error: 'Unauthorized' }), {
                    status: 401,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }
        }

        // --- M0 HARDENING: Check EVOLUTION_API_KEY ---
        if (!Deno.env.get('EVOLUTION_API_KEY')) {
            console.error('❌ EVOLUTION_API_KEY not set');
            return new Response(JSON.stringify({ error: 'EVOLUTION_API_KEY not set' }), {
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        const body = await req.json()
        const eventRaw = body?.event ?? body?.data?.event ?? null
        const event = normalizeEvent(eventRaw) ?? inferEventFromPath(url.pathname)
        const instanceName = body?.instance || body?.instanceName || body?.data?.instance || body?.data?.instanceName || null

        console.log(`📊 Webhook received: ${event} | Instance: ${instanceName}`)

        if (!instanceName || !event) {
            console.log('⚠️ Missing instanceName or event, returning early.')
            return new Response(JSON.stringify({ received: true }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
        }

        const supabase = createClient(
            Deno.env.get('SUPABASE_URL')!,
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        )

        const data = body?.data ?? body
        const { data: instanceCtx } = await supabase
            .from('whatsapp_instances')
            .select('org_id, user_id')
            .eq('instance_name', instanceName)
            .maybeSingle()
        const resolvedOrgId = instanceCtx?.org_id ?? null

        // Non-blocking webhook audit row; fallback to legacy schema if org_id column is not present yet.
        try {
            const baseAuditPayload = {
                instance_name: instanceName,
                event,
                path: url.pathname,
                headers: Object.fromEntries(req.headers.entries()),
                payload: body
            }

            const { error: auditErr } = await supabase
                .from('whatsapp_webhook_events')
                .insert({
                    ...baseAuditPayload,
                    org_id: resolvedOrgId
                })

            if (auditErr && (auditErr.code === '42703' || auditErr.code === 'PGRST204' || String(auditErr.message || '').includes('org_id'))) {
                await supabase.from('whatsapp_webhook_events').insert(baseAuditPayload)
            } else if (auditErr) {
                console.warn('⚠️ webhook audit insert failed:', auditErr)
            }
        } catch (auditEx) {
            console.warn('⚠️ webhook audit exception (non-blocking):', auditEx)
        }

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
            case 'MESSAGES_UPSERT': {
                const msg = data?.data || data || body?.data
                const remoteJid = msg?.key?.remoteJid || msg?.remoteJid || null
                const isFromMe = msg?.key?.fromMe ?? msg?.fromMe ?? false
                let pushName = msg?.pushName || msg?.notifyName || null
                if (isFromMe) pushName = null

                console.log(`📩 Message from: ${remoteJid}, isFromMe: ${isFromMe}`)

                // UNWRAP ViewOnce (Fix for media inside viewOnce)
                let m = msg?.message || {}
                let msgType = msg?.messageType || msg?.type || Object.keys(m)[0]

                if (msgType === 'viewOnceMessage' || msgType === 'viewOnceMessageV2') {
                    const inner = m[msgType]?.message
                    if (inner) {
                        m = inner
                        msg.message = inner // Patch msg for extractMessageContent
                        msgType = Object.keys(inner)[0]
                        console.log(`🔓 Unwrapped ViewOnce message. Real type: ${msgType}`)
                    }
                }

                // ============================================================
                // REACTION LOGIC (Prioritized - Process BEFORE group filter)
                // ============================================================
                if (msgType === 'reactionMessage') {
                    console.log('🔵 [REACTION] Phase 1: Identifying reactor...')

                    // Get instance owner for identity check
                    const { data: instanceRow } = await supabase
                        .from('whatsapp_instances')
                        .select('phone_number')
                        .eq('instance_name', instanceName)
                        .maybeSingle()

                    const reactionInfo = msg?.message?.reactionMessage
                    const emoji = reactionInfo?.text ?? ''

                    // Phase 1: Extract participant from all possible locations
                    const participantCandidate =
                        data?.participant ||
                        msg?.participant ||
                        msg?.key?.participant ||
                        body?.participant ||
                        (String(remoteJid).endsWith('@g.us') ? null : remoteJid)

                    // Determine reactor identity by comparing with instance owner
                    const ownerDigits = onlyDigits(instanceRow?.phone_number)
                    const participantDigits = onlyDigits(participantCandidate)
                    const isReactorMe = !!(ownerDigits && participantDigits && ownerDigits === participantDigits)
                    const reactorId = isReactorMe ? 'ME' : (participantCandidate || 'UNKNOWN')

                    console.log(`🔵 [REACTION] ReactorId: ${reactorId}, isReactorMe: ${isReactorMe}, ownerDigits: ${ownerDigits}, participantDigits: ${participantDigits}`)

                    // Phase 2: Locate target message
                    console.log('🔵 [REACTION] Phase 2: Locating target message...')
                    const targetMsgId =
                        reactionInfo?.key?.id ||
                        reactionInfo?.stanzaId ||
                        reactionInfo?.msgKey?.id ||
                        data?.reaction?.key?.id

                    if (!targetMsgId) {
                        console.log('⚠️ [REACTION] Could not extract target message ID. Payload keys:', Object.keys(reactionInfo || {}))
                        break
                    }

                    console.log(`🔵 [REACTION] Target message ID: ${targetMsgId}`)

                    const { data: originalMsg } = await supabase
                        .from('interacoes')
                        .select('id, reactions')
                        .eq('wa_message_id', targetMsgId)
                        .eq('instance_name', instanceName)
                        .limit(1)
                        .maybeSingle()

                    if (!originalMsg) {
                        console.log(`⚠️ [REACTION] Original message not found for wa_message_id: ${targetMsgId}, instance: ${instanceName}`)
                        break
                    }

                    console.log(`🔵 [REACTION] Found message ID: ${originalMsg.id}`)

                    // Phase 3: Compute new reactions - SIMPLE LOGIC
                    console.log('🔵 [REACTION] Phase 3: Computing new reactions...')
                    const existingReactions: any[] = Array.isArray(originalMsg.reactions) ? originalMsg.reactions : []
                    const beforeCount = existingReactions.length

                    console.log(`🔵 [REACTION] Before: ${JSON.stringify(existingReactions)}`)

                    // SIMPLE: Remove ALL reactions from this reactor (by reactorId OR by fromMe for legacy)
                    const filtered = existingReactions.filter((r: any) => {
                        // If this reactor is "ME", remove any reaction that is fromMe=true or reactorId="ME"
                        if (reactorId === 'ME') {
                            if (r.reactorId === 'ME' || r.fromMe === true) return false
                        } else {
                            // If this reactor is NOT me, remove by matching reactorId or by fromMe=false in 1:1 chats
                            if (r.reactorId === reactorId) return false
                            if (!r.reactorId && r.fromMe === false) return false
                        }
                        return true
                    })

                    // Build final array
                    let newReactions: any[]
                    if (!emoji) {
                        // Empty emoji = remove
                        newReactions = filtered
                        console.log('🔵 [REACTION] Remove operation (empty emoji)')
                    } else {
                        // Add new reaction
                        newReactions = [...filtered, {
                            emoji,
                            reactorId,
                            fromMe: isReactorMe,
                            timestamp: new Date().toISOString()
                        }]
                        console.log(`🔵 [REACTION] Add/Replace. Emoji: ${emoji}`)
                    }

                    console.log(`🔵 [REACTION] After: ${JSON.stringify(newReactions)}`)

                    // Phase 4: Update DB
                    console.log('🔵 [REACTION] Phase 4: Updating database...')
                    const { error: updateError } = await supabase
                        .from('interacoes')
                        .update({ reactions: newReactions })
                        .eq('id', originalMsg.id)

                    if (updateError) {
                        console.error('❌ [REACTION] DB update failed:', updateError)
                    } else {
                        console.log(`✅ [REACTION] Updated. Instance: ${instanceName}, Target: ${targetMsgId}, ReactorId: ${reactorId}, Emoji: ${emoji || '(removed)'}, Before: ${beforeCount}, After: ${newReactions.length}`)
                    }

                    break // Exit after processing reaction
                }

                if (!remoteJid || String(remoteJid).endsWith('@g.us')) {
                    console.log('🚫 Skipping group message or missing remoteJid')
                    break
                }

                let text = extractMessageContent(msg)
                console.log(`📝 Message type: ${msgType}`)

                // Get instance and user
                const { data: instanceRow } = await supabase
                    .from('whatsapp_instances')
                    .select('org_id, user_id')
                    .eq('instance_name', instanceName)
                    .single()

                if (!instanceRow?.user_id) {
                    console.log('⚠️ Instance not found in database')
                    break
                }
                const userId = instanceRow.user_id
                const orgId = instanceRow.org_id ?? resolvedOrgId

                // Get Lead
                const rawRemoteJid = String(remoteJid).replace('@s.whatsapp.net', '')
                let phoneE164 = rawRemoteJid.replace(/\D/g, '')
                if (phoneE164.length >= 10 && phoneE164.length <= 11 && !phoneE164.startsWith('55')) {
                    phoneE164 = '55' + phoneE164
                }

                let leadId = null
                try {
                    const { data: leadData } = await supabase.rpc('upsert_lead_canonical', {
                        p_user_id: userId,
                        p_instance_name: instanceName,
                        p_phone_e164: phoneE164,
                        p_telefone: rawRemoteJid,
                        p_name: pushName,
                        p_push_name: pushName,
                        p_source: 'whatsapp'
                    }).single()
                    if (leadData) leadId = leadData.id
                } catch (err) {
                    console.error('RPC failed:', err)
                    const { data: legacyLead } = await supabase.from('leads').select('id').eq('user_id', userId).eq('telefone', rawRemoteJid).limit(1).maybeSingle()
                    if (legacyLead) leadId = legacyLead.id
                }

                // Process ALL media types including video
                const isMediaMessage = ['audioMessage', 'imageMessage', 'videoMessage', 'documentMessage', 'stickerMessage'].includes(msgType)

                let finalText = text

                // Determine attachment type for DB
                let dbAttachmentType = null
                if (msgType === 'imageMessage') dbAttachmentType = 'image'
                else if (msgType === 'videoMessage') dbAttachmentType = 'video'
                else if (msgType === 'audioMessage') dbAttachmentType = 'audio'
                else if (msgType === 'documentMessage') dbAttachmentType = 'document'

                // 1. IDEMPOTENCY CHECK (Prevent Duplicates on Retry)
                const waMessageId = msg?.key?.id || null
                if (waMessageId) {
                    const { data: existing } = await supabase
                        .from('interacoes')
                        .select('id')
                        .eq('wa_message_id', waMessageId)
                        .eq('instance_name', instanceName)
                        .maybeSingle()

                    if (existing) {
                        console.log('🔄 Duplicate message detected (wa_message_id). Skipping:', waMessageId)
                        break
                    }
                }

                // 2. PROCESS MEDIA (Before Insert)
                let dbPublicUrl = null

                if (isMediaMessage) {
                    console.log(`🔐 Requesting decrypted media from Evolution for type: ${msgType}`)

                    try {
                        const evolutionResult = await fetchBase64FromEvolution(instanceName, msg)

                        if (evolutionResult) {
                            let mimeType = evolutionResult.mimeType || 'application/octet-stream'
                            // FORCE Video MimeType if generic
                            if (msgType === 'videoMessage' && (mimeType === 'application/octet-stream' || !mimeType)) {
                                mimeType = 'video/mp4'
                            }

                            const publicUrl = await uploadMedia(supabase, evolutionResult.base64, mimeType, instanceName, 'base64')
                            if (publicUrl) {
                                finalText = `${text}\n${publicUrl}`
                                dbPublicUrl = publicUrl
                            }
                        }
                    } catch (mediaErr) {
                        console.error('Media processing failed:', mediaErr)
                    }
                }

                // --- CUSTOM: HUMAN TAKEOVER (NATIVE & ECHO CHECK) ---
                if (isFromMe && leadId) {
                    const messageContent = finalText || ''
                    // Anti-Auto-Pause: Check if this is a system message echo
                    // Look for recent message (last 2 mins) with same text/lead/instance
                    const { data: recentSystemMsg } = await supabase
                        .from('interacoes')
                        .select('id')
                        .eq('lead_id', leadId)
                        .eq('instance_name', instanceName)
                        .eq('tipo', 'mensagem_vendedor')
                        .eq('wa_from_me', true)
                        .eq('mensagem', messageContent) // Strict text match
                        .gt('created_at', new Date(Date.now() - 2 * 60 * 1000).toISOString())
                        .limit(1)
                        .maybeSingle()

                    if (recentSystemMsg) {
                        console.log(`🛡️ [Takeover] Ignored system echo (Anti-Auto-Pause). Match ID: ${recentSystemMsg.id}`)
                    } else {
                        // It's a human message from native WhatsApp (or unknown source)
                        console.log(`👤 [Takeover] Native WhatsApp message detected. Pausing AI for lead: ${leadId}`)

                        await supabase
                            .from('leads')
                            .update({
                                ai_enabled: false,
                                ai_paused_reason: 'human_takeover_whatsapp',
                                ai_paused_at: new Date().toISOString()
                            })
                            .eq('id', leadId)
                    }
                }

                // 3. INSERT FINAL (Atomic)
                const { data: inserted, error: insertError } = await supabase
                    .from('interacoes')
                    .insert({
                        org_id: orgId,
                        user_id: userId,
                        lead_id: leadId,
                        mensagem: finalText,
                        tipo: isFromMe ? 'mensagem_vendedor' : 'mensagem_cliente',
                        instance_name: instanceName,
                        remote_jid: remoteJid,
                        phone_e164: phoneE164,
                        wa_message_id: waMessageId,
                        attachment_url: dbPublicUrl,
                        attachment_type: dbAttachmentType,
                        attachment_ready: true, // ALWAYS READY because we waited
                        wa_from_me: Boolean(isFromMe)
                    })
                    .select('id')
                    .single()

                if (insertError) {
                    console.error('❌ DB Insert Error:', insertError)
                } else {
                    console.log('💾 Interaction saved (Atomic). ID:', waMessageId)

                    // 4. TRIGGER AI AGENT (Fire-and-forget)
                    if (!isFromMe && leadId && inserted?.id) {
                        try {
                            console.log(`🤖 AI trigger invoked - Lead: ${leadId}, Interaction: ${inserted.id}`)
                            supabase.functions.invoke('ai-pipeline-agent', {
                                body: {
                                    leadId,
                                    triggerType: 'incoming_message',
                                    interactionId: inserted.id,
                                    instanceName
                                }
                            }).catch((err: any) => {
                                console.error(`❌ AI trigger failed (async):`, err)
                            })
                        } catch (err) {
                            console.error(`❌ AI trigger failed (sync):`, err)
                        }
                    }
                }

                break
            }
            default:
                break
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
